import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Countdown, CountdownsResponse } from '../../shared/types';
import { confirmDialog } from '../components/feedback';
import { Icon } from '../components/icons';
import { Button, Card, ColorPicker, EmojiPicker, Empty, Field, NumberInput, PageHeader, Slider, TextInput, Toggle, ToggleRow } from '../components/ui';
import { addDays, daysBetween, fmtDay, todayIn } from '../dates';
import { t } from '../i18n';
import { takeIntent } from '../intent';
import { isValidDate, uid } from '../util';
import type { SectionProps } from './common';

/** Next occurrence date of a countdown (yearly → this or next year; 29/02 → 28/02). */
function nextDate(c: Countdown, today: string): string | null {
  if (!isValidDate(c.date)) return null;
  if (!c.yearly) return c.date;
  const md = c.date.slice(5);
  const y = Number(today.slice(0, 4));
  const fix = (yy: number) => {
    const leap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
    return `${yy}-${md === '02-29' && !leap ? '02-28' : md}`;
  };
  return fix(y) >= today ? fix(y) : fix(y + 1);
}

export function daysLabel(n: number): string {
  if (n === 0) return t('¡Hoy!');
  if (n === 1) return t('¡Mañana!');
  if (n < 0) return t('Pasado');
  return t('Faltan {n} días', { n });
}

const PRESETS = [
  { emoji: '🎄', title: 'Navidad', md: '12-25' },
  { emoji: '🎆', title: 'Nochevieja', md: '12-31' },
  { emoji: '👑', title: 'Reyes', md: '01-06' },
  { emoji: '🎃', title: 'Halloween', md: '10-31' },
  { emoji: '❤️', title: 'San Valentín', md: '02-14' },
  { emoji: '☀️', title: 'Verano', md: '06-21' },
];

export function CountdownsSection({ full, setFull, cfg, set, errors }: SectionProps) {
  const cd = full.countdowns;
  const today = todayIn(cfg.datetime.timezone);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('⏳');
  const [date, setDate] = useState(addDays(today, 30));
  const [yearly, setYearly] = useState(false);
  const [live, setLive] = useState<CountdownsResponse | null | 'na'>(null);
  const [focusAdd] = useState(() => takeIntent('countdowns', 'add'));

  useEffect(() => {
    fetch(`/api/countdowns?screen=${encodeURIComponent(cfg.slug)}`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: CountdownsResponse) => setLive(j))
      .catch(() => setLive('na'));
  }, [cfg.slug, full.revision]);

  const rows = useMemo(
    () =>
      cd.items
        .map((c) => {
          const nd = nextDate(c, today);
          return { c, nd, days: nd ? daysBetween(today, nd) : null };
        })
        .sort((a, b) => (a.nd ?? '9999').localeCompare(b.nd ?? '9999')),
    [cd.items, today]
  );

  const add = (e?: Event) => {
    e?.preventDefault();
    if (!title.trim() || !isValidDate(date)) return;
    setFull((d) => void d.countdowns.items.push({ id: uid('k'), title: title.trim().slice(0, 80), emoji, color: null, date, yearly }));
    setTitle('');
  };
  const upd = (id: string, fn: (c: Countdown) => void) =>
    setFull((d) => {
      const c = d.countdowns.items.find((x) => x.id === id);
      if (c) fn(c);
    });
  const sc = cfg.countdowns;

  return (
    <>
      <PageHeader title={t('Cuentas atrás')} desc={t('Chips “Faltan 12 días” en el panel lateral de la pantalla: fechas especiales, viajes, próximos cumpleaños y eventos marcados.')} />

      <Card title={t('En esta pantalla')} icon="monitor" scope="screen" id="cd-screen">
        <ToggleRow label={t('Mostrar cuentas atrás')} hint={t('Se colocan en el panel lateral; si falta espacio se muestran menos.')} checked={sc.enabled} onChange={(v) => set((d) => void (d.countdowns.enabled = v))} />
        <Field label={t('Máximo de chips')}>
          <Slider value={sc.max} min={1} max={12} step={1} disabled={!sc.enabled} onChange={(v) => set((d) => void (d.countdowns.max = v))} />
        </Field>
        {live && live !== 'na' && (
          <div class="cd-live">
            <span class="muted small">{t('Ahora en {name} (configuración guardada):', { name: cfg.screen.name })}</span>
            <div class="cd-chips">
              {live.items.length === 0 && <span class="muted small">{t('Nada que mostrar')}</span>}
              {live.items.slice(0, sc.max).map((i) => (
                <span class={`cd-chip ${i.days <= 1 ? 'is-hot' : ''}`} style={i.color ? ({ '--cd': i.color } as any) : undefined}>
                  <span>{i.emoji || '⏳'}</span>
                  <strong>
                    {i.title}
                    {i.age != null && ` (${i.age})`}
                  </strong>
                  <span class="cd-chip__days">{daysLabel(i.days)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title={t('Fechas')} icon="hourglass" scope="global" id="cd-list" desc={t('{n} cuentas atrás manuales', { n: cd.items.length })}>
        <form class="cd-add" onSubmit={add}>
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <TextInput class="cd-add__title" value={title} onValue={setTitle} maxLength={80} placeholder={t('Ej.: Viaje a Madeira')} autoFocus={focusAdd} />
          <input class="input cd-add__date" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
          <label class="mini-toggle" title={t('Se repite cada año')}>
            <Toggle size="sm" checked={yearly} onChange={setYearly} />
            <span>{t('Anual')}</span>
          </label>
          <Button type="submit" variant="primary" icon="plus" disabled={!title.trim() || !isValidDate(date)}>
            {t('Añadir')}
          </Button>
        </form>
        <div class="quick-add">
          <span class="muted small">{t('Añadir rápido:')}</span>
          {PRESETS.filter((p) => !cd.items.some((c) => c.yearly && c.date.slice(5) === p.md)).map((p) => (
            <button
              type="button"
              class="pill"
              onClick={() => setFull((d) => void d.countdowns.items.push({ id: uid('k'), title: t(p.title), emoji: p.emoji, color: null, date: `${today.slice(0, 4)}-${p.md}`, yearly: true }))}
            >
              {p.emoji} {t(p.title)}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <Empty icon="hourglass" title={t('Sin fechas')}>
            {t('Añade una fecha o usa los atajos de arriba.')}
          </Empty>
        ) : (
          <ul class="cd-list">
            {rows.map(({ c, nd, days }) => {
              const err = errors[`cd.${c.id}.title`] || errors[`cd.${c.id}.date`];
              const past = days != null && days < 0;
              return (
                <li class={`cd-row ${past ? 'is-past' : ''} ${err ? 'has-err' : ''}`} key={c.id}>
                  <EmojiPicker value={c.emoji} allowNone onChange={(v) => upd(c.id, (x) => void (x.emoji = v))} />
                  <input class={`input input--bare cd-row__title ${errors[`cd.${c.id}.title`] ? 'is-invalid' : ''}`} value={c.title} maxLength={80} onInput={(e) => upd(c.id, (x) => void (x.title = e.currentTarget.value))} />
                  <input class={`input cd-row__date ${errors[`cd.${c.id}.date`] ? 'is-invalid' : ''}`} type="date" value={c.date} onInput={(e) => upd(c.id, (x) => void (x.date = e.currentTarget.value))} />
                  <label class="mini-toggle" title={t('Se repite cada año')}>
                    <Toggle size="sm" checked={c.yearly} onChange={(v) => upd(c.id, (x) => void (x.yearly = v))} />
                    <span class="hide-xs">{t('Anual')}</span>
                  </label>
                  <ColorPicker compact allowNone value={c.color} onChange={(v) => upd(c.id, (x) => void (x.color = v))} />
                  <span class={`cd-row__days ${days != null && days <= 7 && days >= 0 ? 'is-soon' : ''}`} title={nd ? fmtDay(nd, { year: true }) : ''}>
                    {days == null ? '—' : daysLabel(days)}
                  </span>
                  <button
                    type="button"
                    class="icon-btn icon-btn--danger"
                    aria-label={t('Eliminar')}
                    onClick={async () => {
                      if (await confirmDialog({ title: t('Eliminar “{name}”', { name: c.title }), confirm: t('Eliminar'), danger: true })) setFull((d) => void (d.countdowns.items = d.countdowns.items.filter((x) => x.id !== c.id)));
                    }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t('Automáticas')} icon="wand" scope="global" id="cd-auto" desc={t('Añade cuentas atrás sin tener que crearlas a mano.')}>
        <ToggleRow icon="🎂" label={t('Próximos cumpleaños')} hint={t('Cumpleaños que caen dentro de los próximos N días.')} checked={cd.includeBirthdays} onChange={(v) => setFull((d) => void (d.countdowns.includeBirthdays = v))} />
        <div class={`grid grid--2 ${cd.includeBirthdays ? '' : 'is-disabled'}`}>
          <Field label={t('Cumpleaños dentro de')} error={errors['countdowns.birthdayDays']}>
            <NumberInput value={cd.birthdayDays} min={1} max={366} suffix={t('días')} error={!!errors['countdowns.birthdayDays']} onValue={(v) => setFull((d) => void (d.countdowns.birthdayDays = v))} />
          </Field>
        </div>
        <ToggleRow
          icon="⏳"
          label={t('Eventos marcados')}
          hint={
            <>
              {t('Eventos locales con “Cuenta atrás” y eventos que coinciden con una regla de estilo con cuenta atrás (')}
              <a href="#/filters">{t('Filtros y cambios')}</a>).
            </>
          }
          checked={cd.includeFlagged}
          onChange={(v) => setFull((d) => void (d.countdowns.includeFlagged = v))}
        />
        <Field label={t('Ignorar fechas a más de')} error={errors['countdowns.horizonDays']} hint={t('Se aplica a todas las cuentas atrás.')}>
          <NumberInput value={cd.horizonDays} min={1} max={3660} suffix={t('días')} error={!!errors['countdowns.horizonDays']} onValue={(v) => setFull((d) => void (d.countdowns.horizonDays = v))} />
        </Field>
      </Card>
    </>
  );
}
