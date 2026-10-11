// Planner options of the month / week grid, shared by Calendars > Calendar view and the Planner layout's card:
// how many weeks (a number or Auto) and how events look (one-line chips or cards).
import type { AppConfig, CalendarWeeks, EventStyle } from '../../shared/types';
import { t } from '../i18n';
import { Field, Segmented } from './ui';

/** What picking the Planner layout sets (the same as PLANNER_CALENDAR in server/core/defaults.js). */
export const PLANNER_CALENDAR: { weeks: CalendarWeeks; eventStyle: EventStyle } = { weeks: 'auto', eventStyle: 'cards' };

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
