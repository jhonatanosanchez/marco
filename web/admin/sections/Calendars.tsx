import { useEffect, useState } from 'preact/hooks';
import type { CalendarSource, GoogleAccount, GoogleCalendarListItem, SourceKind, TestIcsResponse } from '../../shared/types';
import { api, ApiError } from '../api';
import { confirmDialog, toast } from '../components/feedback';
import { GoogleG, Icon } from '../components/icons';
import {
  Button,
  Callout,
  Card,
  ColorPicker,
  EmojiPicker,
  Empty,
  Field,
  NumberInput,
  PageHeader,
  ReorderButtons,
  Segmented,
  Select,
  Slider,
  TextInput,
  Toggle,
  ToggleRow,
  useReorder,
} from '../components/ui';
import { t } from '../i18n';
import { allSourceOptions, guessKind, HOLIDAY_PRESETS, isHttpUrl, KIND_EMOJI, moveItem, SWATCHES, uid } from '../util';
import type { SectionProps } from './common';

/** `insecureTls` is an optional extension (self-signed HTTPS feeds on the LAN); see docs/ARCHITECTURE.md. */
type Source = CalendarSource & { insecureTls?: boolean };

const KINDS: { value: SourceKind; label: string }[] = [
  { value: 'generic', label: 'General' },
  { value: 'airbnb', label: 'Alquiler vacacional (Airbnb, Booking…)' },
  { value: 'birthdays', label: 'Cumpleaños' },
  { value: 'holidays', label: 'Festivos' },
];


function nextColor(sources: CalendarSource[]) {
  const used = new Set(sources.map((s) => s.color.toLowerCase()));
  return SWATCHES.find((c) => !used.has(c)) ?? SWATCHES[sources.length % SWATCHES.length];
}

function SourceRow({
  src,
  index,
  count,
  errors,
  update,
  remove,
  move,
  reorder,
}: {
  src: Source;
  index: number;
  count: number;
  errors: Record<string, string>;
  update: (fn: (s: Source) => void) => void;
  remove: () => void;
  move: (from: number, to: number) => void;
  reorder: ReturnType<typeof useReorder>;
}) {
  const [test, setTest] = useState<{ loading: boolean; res?: TestIcsResponse }>({ loading: false });
  const p = `source.${src.id}`;
  const urlValid = src.type === 'ics' && !!src.url && isHttpUrl(src.url, true);
  const runTest = async () => {
    if (!src.url) return;
    setTest({ loading: true });
    try {
      const res = await api.testIcs(src.url.trim(), src.insecureTls);
      setTest({ loading: false, res });
    } catch (e) {
      setTest({ loading: false, res: { ok: false, error: (e as ApiError).message } });
    }
  };
  return (
    <div class={`src ${src.enabled ? '' : 'is-off'}`} {...(reorder.rowProps(index) as any)} style={{ '--src-color': src.color } as any}>
      <div class="src__head">
        <span class="grip" title={t('Arrastra para reordenar')} {...reorder.handleProps(index)}>
          <Icon name="grip" size={16} />
        </span>
        <EmojiPicker value={src.emoji ?? ''} allowNone onChange={(v) => update((s) => void (s.emoji = v))} />
        <ColorPicker compact value={src.color} error={!!errors[`${p}.color`]} onChange={(v) => update((s) => void (s.color = v ?? s.color))} />
        <TextInput
          class="src__name"
          value={src.name}
          error={!!errors[`${p}.name`]}
          placeholder={t('Nombre')}
          onValue={(v) => update((s) => void (s.name = v))}
        />
        <span class={`badge ${src.type === 'google' ? 'badge--google' : ''}`}>{src.type === 'google' ? <GoogleG size={12} /> : 'ICS'}</span>
        <Toggle checked={src.enabled} onChange={(v) => update((s) => void (s.enabled = v))} label={t('Activo')} />
        <ReorderButtons index={index} count={count} onMove={move} />
        <button type="button" class="icon-btn icon-btn--danger" onClick={remove} aria-label={t('Eliminar')} title={t('Eliminar')}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      <div class="src__body">
        {src.type === 'ics' ? (
          <Field error={errors[`${p}.url`]} class="src__url">
            <TextInput
              mono
              value={src.url ?? ''}
              placeholder="https://…/calendar.ics"
              error={!!errors[`${p}.url`]}
              onValue={(v) => {
                update((s) => {
                  s.url = v;
                  if (s.kind === 'generic' && /airbnb|booking|reservations/i.test(v)) s.kind = 'airbnb';
                });
                setTest({ loading: false });
              }}
              prefix={<Icon name="link" size={14} />}
              suffix={
                src.url ? (
                  <span class={urlValid ? 'ok-text' : 'err-text'} title={urlValid ? t('URL válida') : t('URL no válida')}>
                    <Icon name={urlValid ? 'check' : 'x'} size={14} />
                  </span>
                ) : undefined
              }
            />
          </Field>
        ) : (
          <div class="src__google">
            <GoogleG size={14} />
            <span class="muted">{src.googleAccount}</span>
            <span class="mono small muted">{src.googleCalendarId}</span>
          </div>
        )}
        <div class="src__opts">
          <label class="mini-field">
            <span>{t('Tipo')}</span>
            <div class="src__kind">
              <Select value={src.kind} options={KINDS.map((k) => ({ ...k, label: `${KIND_EMOJI[k.value] || '📅'} ${t(k.label)}` }))} onChange={(v) => update((s) => void (s.kind = v))} />
            </div>
          </label>
          <label class="mini-field" title={t('Cada cuántos minutos se vuelve a descargar')}>
            <span>{t('Actualizar cada')}</span>
            <NumberInput value={src.refreshMin} min={1} max={1440} suffix="min" error={!!errors[`${p}.refreshMin`]} onValue={(v) => update((s) => void (s.refreshMin = v))} />
          </label>
          {src.type === 'ics' && (
            <label class="mini-toggle" title={t('Acepta certificados HTTPS autofirmados (solo en tu red local)')}>
              <Toggle size="sm" checked={!!src.insecureTls} onChange={(v) => update((s) => void (s.insecureTls = v))} />
              <span>{t('Certificado autofirmado')}</span>
            </label>
          )}
          {src.type === 'ics' && (
            <Button size="sm" icon="play" loading={test.loading} disabled={!urlValid} onClick={runTest}>
              {t('Probar')}
            </Button>
          )}
        </div>
        {test.res && (
          <div class={`test-result ${test.res.ok ? 'is-ok' : 'is-err'}`}>
            {test.res.ok ? (
              <>
                <strong>
                  <Icon name="check" size={14} /> {t('{n} eventos encontrados', { n: test.res.count ?? 0 })}
                </strong>
                {!!test.res.sample?.length && (
                  <ul>
                    {test.res.sample.slice(0, 5).map((s) => (
                      <li>{s}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <span>
                <Icon name="alert" size={14} /> {test.res.error || t('No se pudo leer el calendario')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GoogleAccounts({ cfg, set, me, dirty, save }: SectionProps) {
  const [accounts, setAccounts] = useState<GoogleAccount[] | null>(null);
  const [cals, setCals] = useState<Record<string, GoogleCalendarListItem[] | 'error' | undefined>>({});
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const list = await api.googleAccounts();
      setAccounts(list);
      setErr('');
      for (const a of list) {
        api
          .googleCalendars(a.email)
          .then((c) => setCals((m) => ({ ...m, [a.email]: c })))
          .catch(() => setCals((m) => ({ ...m, [a.email]: 'error' })));
      }
    } catch (e) {
      setAccounts([]);
      setErr((e as ApiError).message);
    }
  };
  useEffect(() => {
    if (me.googleConfigured) load();
    else setAccounts([]);
  }, [me.googleConfigured]);

  const connect = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: t('Guardar cambios antes de continuar'),
        body: t('Vas a salir a Google para vincular la cuenta. ¿Guardamos primero los cambios pendientes?'),
        confirm: t('Guardar y continuar'),
      });
      if (!ok) return;
      if (!(await save())) return;
    }
    window.location.href = '/auth/google/connect';
  };

  const disconnect = async (a: GoogleAccount) => {
    const ok = await confirmDialog({
      title: t('Desvincular {email}', { email: a.email }),
      body: t('Se dejarán de mostrar sus calendarios en la pantalla.'),
      confirm: t('Desvincular'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removeGoogleAccount(a.email);
      set((d) => {
        d.calendar.sources = d.calendar.sources.filter((s) => !(s.type === 'google' && s.googleAccount === a.email));
      });
      toast(t('Cuenta desvinculada. Guarda para aplicar los cambios en los calendarios.'), 'info');
      load();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  };

  const isOn = (email: string, id: string) =>
    cfg.calendar.sources.some((s) => s.type === 'google' && s.googleAccount === email && s.googleCalendarId === id);

  const toggleCal = (email: string, c: GoogleCalendarListItem, on: boolean) =>
    set((d) => {
      if (on) {
        if (isOn(email, c.id)) return;
        d.calendar.sources.push({
          id: uid('c'),
          type: 'google',
          name: c.summary,
          googleAccount: email,
          googleCalendarId: c.id,
          color: c.backgroundColor && /^#[0-9a-f]{6}$/i.test(c.backgroundColor) ? c.backgroundColor : nextColor(d.calendar.sources),
          emoji: '',
          kind: guessKind(`${c.summary} ${c.id}`),
          enabled: true,
          refreshMin: 5,
        });
      } else {
        d.calendar.sources = d.calendar.sources.filter((s) => !(s.type === 'google' && s.googleAccount === email && s.googleCalendarId === c.id));
      }
    });

  return (
    <Card
      title={t('Cuentas de Google')}
      id="cal-google"
      scope="global"
      icon="google"
      desc={t('Vincula una cuenta de Google y elige qué calendarios mostrar.')}
      actions={
        me.googleConfigured && (
          <Button icon="plus" variant="primary" size="sm" onClick={connect}>
            {t('Vincular cuenta')}
          </Button>
        )
      }
    >
      {!me.googleConfigured ? (
        <Callout kind="warn">
          {t('Google no está configurado en el servidor. Añade GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET al archivo .env y reinicia. Mientras tanto puedes usar la URL iCal secreta de Google Calendar (Configuración → Integrar calendario).')}
        </Callout>
      ) : accounts === null ? (
        <div class="skeleton-list">
          <div class="skeleton" />
          <div class="skeleton" />
        </div>
      ) : accounts.length === 0 ? (
        <Empty icon="calendar" title={err ? t('No se pudieron cargar las cuentas') : t('Ninguna cuenta vinculada')}>
          {err || t('Pulsa “Vincular cuenta” para dar acceso de solo lectura a tu Google Calendar.')}
        </Empty>
      ) : (
        <div class="gaccounts">
          {accounts.map((a) => {
            const list = cals[a.email];
            return (
              <div class="gaccount">
                <div class="gaccount__head">
                  {a.picture ? <img class="avatar" src={a.picture} alt="" referrerpolicy="no-referrer" /> : <span class="avatar avatar--letter">{(a.name || a.email)[0].toUpperCase()}</span>}
                  <div class="gaccount__who">
                    <strong>{a.name || a.email}</strong>
                    <span class="muted small">{a.email}</span>
                  </div>
                  <Button size="sm" variant="ghost" icon="x" onClick={() => disconnect(a)}>
                    {t('Desvincular')}
                  </Button>
                </div>
                {list === undefined ? (
                  <div class="skeleton" />
                ) : list === 'error' ? (
                  <Callout kind="error">{t('No se pudo leer la lista de calendarios. Vuelve a vincular la cuenta.')}</Callout>
                ) : (
                  <ul class="gcal-list">
                    {list.map((c) => {
                      const on = isOn(a.email, c.id);
                      return (
                        <li>
                          <label class={`gcal ${on ? 'is-on' : ''}`}>
                            <input type="checkbox" checked={on} onChange={(e) => toggleCal(a.email, c, e.currentTarget.checked)} />
                            <span class="check-box">
                              <Icon name="check" size={12} />
                            </span>
                            <span class="dot-color" style={{ background: c.backgroundColor || '#888' }} />
                            <span class="gcal__name">{c.summary}</span>
                            {c.primary && <span class="badge badge--soft">{t('Principal')}</span>}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Per-screen: which sources this screen shows (`calendar.sourceIds`: null = all, incl. new ones). */
function ScreenSourcesCard({ cfg, set, full }: SectionProps) {
  const ids = cfg.calendar.sourceIds ?? null;
  const opts = allSourceOptions(full, { includeDisabled: true });
  const disabled = new Set(full.calendar.sources.filter((s) => !s.enabled).map((s) => s.id));
  if (!full.localEvents.enabled) disabled.add('local');
  if (!full.birthdays.enabled) disabled.add('birthdays');
  const all = ids === null;
  const toggle = (id: string, on: boolean) =>
    set((d) => {
      const cur = d.calendar.sourceIds ?? opts.map((o) => o.id);
      d.calendar.sourceIds = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
    });
  return (
    <Card
      id="cal-screen-sources"
      scope="screen"
      title={t('Calendarios en esta pantalla')}
      icon="eye"
      desc={full.screens.length > 1 ? t('Por ejemplo: la cocina solo con la familia y los cumpleaños; la entrada con las reservas.') : t('Elige qué calendarios se muestran.')}
    >
      <Segmented
        full
        value={all ? 'all' : 'some'}
        options={[
          { value: 'all', label: t('Todos los calendarios') },
          { value: 'some', label: t('Solo algunos') },
        ]}
        onChange={(v) => set((d) => void (d.calendar.sourceIds = v === 'all' ? null : opts.filter((o) => !disabled.has(o.id)).map((o) => o.id)))}
      />
      {all ? (
        <p class="muted small">{t('Se muestran todos los calendarios activos, también los que añadas en el futuro.')}</p>
      ) : (
        <ul class="gcal-list screen-src-list">
          {opts.map((o) => {
            const on = (ids ?? []).includes(o.id);
            return (
              <li>
                <label class={`gcal ${on ? 'is-on' : ''} ${disabled.has(o.id) ? 'is-dim' : ''}`}>
                  <input type="checkbox" checked={on} onChange={(e) => toggle(o.id, e.currentTarget.checked)} />
                  <span class="check-box">
                    <Icon name="check" size={12} />
                  </span>
                  <span class="dot-color" style={{ background: o.color }} />
                  <span class="gcal__name">
                    {o.emoji ? `${o.emoji} ` : ''}
                    {o.name}
                  </span>
                  {disabled.has(o.id) && <span class="badge badge--soft">{t('Desactivado')}</span>}
                  {(o.id === 'local' || o.id === 'birthdays') && <span class="badge badge--soft">{o.id === 'local' ? t('Eventos locales') : t('Cumpleaños')}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {!all && (ids ?? []).length === 0 && <Callout kind="warn">{t('No has marcado ningún calendario: esta pantalla no mostrará eventos.')}</Callout>}
    </Card>
  );
}

export function CalendarsSection(props: SectionProps) {
  const { cfg, set, errors } = props;
  const c = cfg.calendar;
  const sources = c.sources as Source[];
  const move = (from: number, to: number) => set((d) => void (d.calendar.sources = moveItem(d.calendar.sources, from, to)));
  const reorder = useReorder(move);

  const addIcs = (name = '', url = '', kind: SourceKind = 'generic') =>
    set((d) => {
      d.calendar.sources.push({
        id: uid('c'),
        type: 'ics',
        name: name || t('Calendario {n}', { n: d.calendar.sources.length + 1 }),
        url,
        color: nextColor(d.calendar.sources),
        emoji: '',
        kind,
        enabled: true,
        refreshMin: kind === 'holidays' ? 720 : 5,
      });
    });

  const removeSource = async (s: Source) => {
    const ok = await confirmDialog({ title: t('Eliminar “{name}”', { name: s.name || 'calendario' }), body: t('Sus eventos dejarán de mostrarse.'), confirm: t('Eliminar'), danger: true });
    if (ok) set((d) => void (d.calendar.sources = d.calendar.sources.filter((x) => x.id !== s.id)));
  };

  return (
    <>
      <PageHeader title={t('Calendarios')} desc={t('Conecta calendarios iCal y Google, y decide cómo se muestran.')} />

      <Card
        title={t('Calendarios conectados')}
        id="cal-sources"
        scope="global"
        icon="link"
        desc={t('Cada calendario tiene su color y emoji. El orden define la prioridad en la leyenda.')}
        actions={
          <Button icon="plus" variant="primary" size="sm" onClick={() => addIcs()}>
            {t('Añadir URL iCal')}
          </Button>
        }
      >
        {sources.length === 0 ? (
          <Empty icon="calendar" title={t('Aún no hay calendarios')}>
            {t('Pega la URL .ics de tu calendario (Airbnb, Booking, Google, iCloud, Outlook…) o vincula una cuenta de Google.')}
          </Empty>
        ) : (
          <div class="src-list">
            {sources.map((s, i) => (
              <SourceRow
                key={s.id}
                src={s}
                index={i}
                count={sources.length}
                errors={errors}
                reorder={reorder}
                move={move}
                remove={() => removeSource(s)}
                update={(fn) =>
                  set((d) => {
                    const target = d.calendar.sources.find((x) => x.id === s.id);
                    if (target) fn(target as Source);
                  })
                }
              />
            ))}
          </div>
        )}
        <div class="quick-add">
          <span class="muted small">{t('Añadir rápido:')}</span>
          {HOLIDAY_PRESETS.filter((p) => !sources.some((s) => s.url === p.url)).map((p) => (
            <button type="button" class="pill" onClick={() => addIcs(t(p.name), p.url, 'holidays')}>
              🎉 {t(p.name)}
            </button>
          ))}
          <button type="button" class="pill" onClick={() => addIcs('Airbnb', '', 'airbnb')}>
            🏠 {t('Reservas Airbnb')}
          </button>
        </div>
      </Card>

      <GoogleAccounts {...props} />

      <ScreenSourcesCard {...props} />

      <Card id="cal-view" scope="screen" title={t('Vista del calendario')} icon="calendar">
        <ToggleRow label={t('Mostrar calendario')} checked={c.enabled} onChange={(v) => set((d) => void (d.calendar.enabled = v))} />
        <div class={`stack ${c.enabled ? '' : 'is-disabled'}`}>
          <div class="grid grid--2">
            <Field label={t('Tipo de vista')}>
              <Segmented
                full
                value={c.view}
                options={[
                  { value: 'month', label: t('Mensual') },
                  { value: 'week', label: t('Semanal') },
                  { value: 'agenda', label: t('Agenda') },
                ]}
                onChange={(v) => set((d) => void (d.calendar.view = v))}
              />
            </Field>
            <Field label={t('La semana empieza en')}>
              <Segmented
                full
                value={c.weekStart}
                options={[
                  { value: 1, label: t('Lunes') },
                  { value: 0, label: t('Domingo') },
                ]}
                onChange={(v) => set((d) => void (d.calendar.weekStart = v))}
              />
            </Field>
            <Field label={t('Semanas a mostrar')} error={errors['calendar.weeks']}>
              <Segmented full value={c.weeks} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => set((d) => void (d.calendar.weeks = v))} />
            </Field>
            <Field label={t('Máx. eventos visibles por día')} error={errors['calendar.maxEventsPerDay']}>
              <Slider value={c.maxEventsPerDay} min={1} max={8} step={1} onChange={(v) => set((d) => void (d.calendar.maxEventsPerDay = v))} />
            </Field>
          </div>
          <div class="toggle-grid">
            <ToggleRow icon="📍" label={t('Ubicación del evento')} checked={c.showLocation} onChange={(v) => set((d) => void (d.calendar.showLocation = v))} />
            <ToggleRow icon="⏱️" label={t('Hora de fin')} checked={c.showEndTime} onChange={(v) => set((d) => void (d.calendar.showEndTime = v))} />
            <ToggleRow icon="🔢" label={t('“Día X de Y” en eventos largos')} checked={c.showDayXofY} onChange={(v) => set((d) => void (d.calendar.showDayXofY = v))} />
            <ToggleRow icon="🏷️" label={t('Leyenda de calendarios')} checked={c.showLegend} onChange={(v) => set((d) => void (d.calendar.showLegend = v))} />
            <ToggleRow icon="⏭️" label={t('Solo eventos actuales y futuros')} checked={c.hidePast} onChange={(v) => set((d) => void (d.calendar.hidePast = v))} />
          </div>
        </div>
      </Card>
    </>
  );
}
