// Screen settings → Privacy mode: photos, the lock, the schedule rules of this screen, and what each calendar shows
// while a screen is private (that part is global). Quick actions live on Home (components/Privacy.tsx).
import type { AppConfig, PrivacyMode, PrivacyRule, ScreenPrivacyConfig, SourceKind } from '../../shared/types';
import { Icon } from '../components/icons';
import { PrivacyActions, privacyUntilText, usePrivacy } from '../components/Privacy';
import { Button, Card, Field, Select, Toggle, ToggleRow, WeekdayPicker } from '../components/ui';
import { weekdayNames } from '../dates';
import { t } from '../i18n';
import { privacyCalendarRows, type Errors } from '../util';

export const DEFAULT_SCREEN_PRIVACY: ScreenPrivacyConfig = { hidePhotos: false, showLock: true, schedule: [] };

/** Same default as the server (server/core/privacy.js): holidays and birthdays stay, the rest shows as busy. */
export const defaultPrivacyOf = (kind: SourceKind): PrivacyMode => (kind === 'holidays' || kind === 'birthdays' ? 'keep' : 'busy');

export const privacyModeOptions = () => [
  { value: 'busy' as PrivacyMode, label: t('Mostrar como Ocupado') },
  { value: 'hide' as PrivacyMode, label: t('Ocultar') },
  { value: 'keep' as PrivacyMode, label: t('No cambiar') },
];

/** "En modo privado" select of one calendar (Calendars, Local events, Birthdays). */
export function PrivacyModeField({ value, onChange }: { value: PrivacyMode; onChange: (v: PrivacyMode) => void }) {
  return (
    <Field label={t('En modo privado')} hint={value === 'busy' ? t('Solo la hora y el color del calendario, con el título «Ocupado».') : undefined}>
      <Select value={value} options={privacyModeOptions()} onChange={onChange} />
    </Field>
  );
}

const newRule = (from = '22:00', to = '07:00'): PrivacyRule => ({ id: `p_${Math.random().toString(36).slice(2, 10)}`, enabled: true, days: [], from, to });

/**
 * Days + from/to time windows (`to < from` ends the next day): the schedule of privacy mode and of carousels.
 * `update` mutates a draft of the list.
 */
export function ScheduleRulesEditor({ rules, update, errorOf, max = 10, addLabel, newFrom, newTo }: {
  rules: PrivacyRule[];
  update: (fn: (list: PrivacyRule[]) => void) => void;
  errorOf?: (r: PrivacyRule) => string | undefined;
  max?: number;
  addLabel?: string;
  newFrom?: string;
  newTo?: string;
}) {
  const wd = weekdayNames('short');
  const updRule = (id: string, fn: (r: PrivacyRule) => void) =>
    update((list) => {
      const r = list.find((x) => x.id === id);
      if (r) fn(r);
    });
  return (
    <>
      {rules.map((r) => {
        const crosses = r.to < r.from;
        const err = errorOf?.(r);
        return (
          <div class={`privacy-rule ${r.enabled ? '' : 'is-disabled'}`} key={r.id}>
            <div class="privacy-rule__head">
              <label class="mini-toggle">
                <Toggle checked={r.enabled} onChange={(v) => updRule(r.id, (x) => void (x.enabled = v))} />
                <span>{r.enabled ? t('Activa') : t('En pausa')}</span>
              </label>
              <button
                type="button"
                class="icon-btn"
                title={t('Eliminar')}
                onClick={() =>
                  update((list) => {
                    const i = list.findIndex((y) => y.id === r.id);
                    if (i >= 0) list.splice(i, 1);
                  })
                }
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            <Field label={t('Días')} hint={r.days.length ? undefined : t('Ninguno marcado: todos los días')}>
              <WeekdayPicker labels={wd} value={r.days} onChange={(v) => updRule(r.id, (x) => void (x.days = v))} />
            </Field>
            <div class="grid grid--2">
              <Field label={t('Desde')}>
                <input class="input" type="time" value={r.from} onInput={(ev) => updRule(r.id, (x) => void (x.from = ev.currentTarget.value))} />
              </Field>
              <Field label={t('Hasta')} error={err ? t(err) : undefined} hint={crosses ? t('Termina al día siguiente') : undefined}>
                <input class={`input ${err ? 'is-invalid' : ''}`} type="time" value={r.to} onInput={(ev) => updRule(r.id, (x) => void (x.to = ev.currentTarget.value))} />
              </Field>
            </div>
          </div>
        );
      })}
      {rules.length < max && (
        <Button size="sm" icon="plus" onClick={() => update((list) => void list.push(newRule(newFrom, newTo)))}>
          {addLabel ?? t('Añadir franja')}
        </Button>
      )}
    </>
  );
}

export function PrivacyCard({ cfg, set, errors, go }: { cfg: AppConfig; set: (fn: (d: AppConfig) => void) => void; errors: Errors; go: (r: string) => void }) {
  const p = cfg.privacy ?? DEFAULT_SCREEN_PRIVACY;
  const rows = usePrivacy();
  const row = rows?.find((r) => r.screenId === cfg.screenId);
  const tz = cfg.datetime.timezone;
  const upd = (fn: (x: ScreenPrivacyConfig) => void) =>
    set((d) => {
      d.privacy = d.privacy ?? structuredClone(DEFAULT_SCREEN_PRIVACY);
      fn(d.privacy);
    });
  const modeOf = (id: string): { mode: PrivacyMode; set: (v: PrivacyMode) => void } => {
    if (id === 'local') return { mode: cfg.localEvents.privacy ?? 'busy', set: (v) => set((d) => void (d.localEvents.privacy = v)) };
    if (id === 'birthdays') return { mode: cfg.birthdays.privacy ?? 'keep', set: (v) => set((d) => void (d.birthdays.privacy = v)) };
    const s = cfg.calendar.sources.find((x) => x.id === id)!;
    return { mode: s.privacy ?? defaultPrivacyOf(s.kind), set: (v) => set((d) => void (d.calendar.sources.find((x) => x.id === id)!.privacy = v)) };
  };
  const sources = privacyCalendarRows(cfg).map((r) => ({ ...r, ...modeOf(r.id) }));
  return (
    <Card
      id="scr-privacy"
      scope="screen"
      title={t('Modo privado')}
      icon="lock"
      desc={t('Para cuando hay invitados: los eventos se ven como «Ocupado», sin títulos, lugares ni notas. Se filtra en el servidor, así que la pantalla nunca recibe los datos reales.')}
    >
      <div class="privacy-now">
        <span class={`privacy-now__state ${row?.active ? 'is-on' : ''}`}>
          <Icon name="lock" size={14} />
          {row?.active ? t('Activo {until}', { until: privacyUntilText(row, tz) }) : t('Desactivado ahora')}
          {row?.active && row.by === 'schedule' && <span class="muted small"> · {t('por horario')}</span>}
        </span>
        <PrivacyActions size="sm" screenIds={[cfg.screenId]} active={!!row?.active} />
      </div>

      <ToggleRow
        label={t('Ocultar las fotos')}
        hint={t('Mientras está activo, el fondo y el marco de fotos usan fotos de stock en vez de las de tu galería.')}
        checked={p.hidePhotos}
        onChange={(v) => upd((x) => void (x.hidePhotos = v))}
      />
      <ToggleRow label={t('Mostrar un candado en la pantalla')} hint={t('Un candado pequeño en la esquina indica que está en modo privado.')} checked={p.showLock} onChange={(v) => upd((x) => void (x.showLock = v))} />

      <div>
        <h4 class="privacy-sub">{t('Horario')}</h4>
        <p class="muted small privacy-note">
          {t('Se activa solo en estas franjas. Si lo quitas a mano durante una franja, vuelve en la siguiente. Si lo activas a mano, dura lo que elijas aunque la franja termine antes.')}
        </p>
      </div>
      <ScheduleRulesEditor rules={p.schedule} update={(fn) => upd((x) => fn(x.schedule))} errorOf={(r) => errors[`privacy.${r.id}.to`]} />

      <div>
        <h4 class="privacy-sub">{t('Qué se ve de cada calendario')}</h4>
        <p class="muted small privacy-note">{t('Vale para todas las pantallas. El tiempo, los avisos y los mensajes no cambian.')}</p>
      </div>
      <ul class="privacy-sources">
        {sources.map((s) => (
          <li>
            <span class="dot-color" style={{ background: s.color }} />
            <span class="privacy-sources__name">{s.name}</span>
            <Select value={s.mode} options={privacyModeOptions()} onChange={s.set} />
          </li>
        ))}
      </ul>
      <p class="muted small">
        {t('Para que Home Assistant lo active, usa el webhook /api/hooks/privacy.')}{' '}
        <a href="#api" onClick={(e) => (e.preventDefault(), go('api'))}>
          {t('API y webhooks')}
        </a>
      </p>
    </Card>
  );
}
