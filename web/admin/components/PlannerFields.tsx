// Planner options of the month / week grid, shared by Calendars > Calendar view and the Planner layout's card:
// how many weeks (a number or Auto) and how events look (one-line chips or cards). Also how far the agenda view
// looks ahead (Calendars > Calendar view).
import type { AgendaDays, AppConfig, CalendarWeeks, EventStyle } from '../../shared/types';
import { t } from '../i18n';
import { Field, Segmented } from './ui';

/** What picking the Planner layout sets (the same as PLANNER_CALENDAR in server/core/defaults.js). */
export const PLANNER_CALENDAR: { weeks: CalendarWeeks; eventStyle: EventStyle } = { weeks: 'auto', eventStyle: 'cards' };

/**
 * Leaving the Planner layout before it is saved: what picking it turned on goes back to the saved values (`saved`,
 * the screen's calendar as saved). A setting changed by hand since then (it no longer has the planner's value) stays.
 */
export function undoPlannerPick(cal: { weeks: CalendarWeeks; eventStyle: EventStyle }, saved: { weeks: CalendarWeeks; eventStyle: EventStyle }): void {
  if (cal.weeks === PLANNER_CALENDAR.weeks) cal.weeks = saved.weeks;
  if (cal.eventStyle === PLANNER_CALENDAR.eventStyle) cal.eventStyle = saved.eventStyle;
}

type Set = (fn: (d: AppConfig) => void) => void;

export function WeeksField({ cfg, set, error, max = 6, min = 1 }: { cfg: AppConfig; set: Set; error?: string; max?: number; min?: number }) {
  const n: CalendarWeeks[] = [];
  for (let i = min; i <= max; i++) n.push(i);
  return (
    <Field
      class="field--weeks"
      label={t('Semanas a mostrar')}
      hint={cfg.calendar.weeks === 'auto' ? t('Auto elige entre 2 y 6 semanas, las que caben con el máximo de eventos por día a buen tamaño. Se recalcula si la pantalla gira.') : undefined}
      error={error}
    >
      <Segmented<CalendarWeeks>
        full
        value={cfg.calendar.weeks}
        options={[{ value: 'auto', label: t('Auto') }, ...n.map((v) => ({ value: v, label: String(v) }))]}
        onChange={(v) => set((d) => void (d.calendar.weeks = v))}
      />
    </Field>
  );
}

export function EventStyleField({ cfg, set }: { cfg: AppConfig; set: Set }) {
  const cards = cfg.calendar.eventStyle === 'cards';
  return (
    <Field
      label={t('Estilo de los eventos')}
      hint={
        cards
          ? t('Tarjetas: la hora arriba y el título debajo, en hasta dos líneas, una tras otra en cada día. Los eventos de varios días siguen siendo barras.')
          : t('Líneas: cada evento en una línea, con la hora delante.')
      }
    >
      <Segmented<EventStyle>
        full
        value={cards ? 'cards' : 'lines'}
        options={[
          { value: 'lines', label: t('Líneas') },
          { value: 'cards', label: t('Tarjetas') },
        ]}
        onChange={(v) => set((d) => void (d.calendar.eventStyle = v))}
      />
    </Field>
  );
}

/** calendar.agendaDays: how far the agenda view looks ahead (Automatic, 7, 14 or 30 days). */
export function AgendaDaysField({ cfg, set }: { cfg: AppConfig; set: Set }) {
  const v: AgendaDays = cfg.calendar.agendaDays ?? 'auto';
  return (
    <Field
      class="field--agenda-days"
      label={t('Días en la agenda')}
      hint={
        v === 'auto'
          ? t('Automático: hoy y mañana, y después los próximos días con eventos hasta llenar la agenda. Nunca muestra menos de lo que mostraría con 14.')
          : t('La agenda muestra los próximos {n} días. Los días sin eventos no ocupan sitio.', { n: v })
      }
    >
      <Segmented<AgendaDays>
        full
        value={v}
        options={[
          { value: 'auto', label: t('Automático') },
          { value: 7, label: '7' },
          { value: 14, label: '14' },
          { value: 30, label: '30' },
        ]}
        onChange={(n) => set((d) => void (d.calendar.agendaDays = n))}
      />
    </Field>
  );
}
