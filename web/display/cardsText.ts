// Tarjetas (fork fsrhome): textos y HTML de la tarjeta de Entreno y de su hoja. Puro (sin imports de runtime) para que
// las pruebas lo carguen en Node. Todo texto que viene del coach o de Garmin pasa por escHtml.
import type { DisplayCardRef, DisplayCards, TrainingDetail, TrainingRecovery, TrainingRun, TrainingSession, TrainingSummary } from '../shared/types';

type T = (k: string, v?: Record<string, string | number>) => string;

/** primera tarjeta a los 2 min de cargar la página */
export const FIRST_MS = 120_000;
/** la hoja de detalle se cierra sola a los 90 s */
export const SHEET_MS = 90_000;
const ZONE_COLORS = ['#6aa8ff', '#5fd38a', '#ffd166', '#ff9f43', '#ff5a4e'];

export const nextIndex = (count: number, prev: number): number => (count > 0 ? (prev + 1) % count : -1);

/** lo que, si cambia, reinicia la rotación (el nombre no) */
export const cardsSig = (c: DisplayCards): string => JSON.stringify([c.items.map((i) => i.id), c.everyMin, c.showSec, c.corner]);

export function escHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

export function sessionText(s: TrainingSession, t: T): string {
  if (s.kind === 'session') return s.text || t('cardTrainingShort');
  if (s.kind === 'rest') return t('cardRest');
  if (s.kind === 'free') return t('cardFree');
  return t('cardNoPlan');
}

function weekdayName(ymd: string, lang: string, style: 'long' | 'short'): string {
  try {
    return new Intl.DateTimeFormat(lang, { weekday: style, timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
  } catch {
    return ymd;
  }
}

function dayMonth(ymd: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
  } catch {
    return ymd;
  }
}

const whenText = (l: TrainingRun, t: T, lang: string): string =>
  l.when === 'today' ? t('cardToday') : l.when === 'yesterday' ? t('cardYesterday') : weekdayName(l.date, lang, 'long');

/** "Última carrera, hoy · Rodaje · 10.5 km en 61 min · 5:49 /km" (texto plano, sin escapar) */
export function lastText(l: TrainingRun, t: T, lang: string): string {
  const parts = [t('cardLast', { when: whenText(l, t, lang) })];
  if (l.name) parts.push(l.name);
  parts.push(t('cardKmMin', { km: l.km, min: l.min }) + (l.pace ? ` · ${l.pace} /km` : ''));
  return parts.join(' · ');
}

export function recoveryParts(r: TrainingRecovery, t: T): string[] {
  const out: string[] = [];
  if (r.sleep !== null) out.push(`${t('cardSleep')} ${r.sleep}`);
  if (r.hrv !== null) out.push(`${t('cardHrv')} ${r.hrv}`);
  if (r.restingHr !== null) out.push(`${t('cardRhr')} ${r.restingHr}`);
  if (r.bodyBattery !== null) out.push(`${t('cardBb')} ${r.bodyBattery}`);
  return out;
}

/** 7 barras lun–dom; hoy más brillante */
export function weekBarsSvg(kmByDay: number[], todayIndex: number): string {
  const max = Math.max(...kmByDay, 0);
  const bars = kmByDay.map((km, i) => {
    const h = max > 0 ? Math.max(1.5, (km / max) * 18) : 1.5;
    const op = i === todayIndex ? 1 : km > 0 ? 0.75 : 0.3;
    return `<rect x="${i * 10}" y="${(20 - h).toFixed(1)}" width="7" height="${h.toFixed(1)}" rx="1.5" fill="currentColor" opacity="${op}"/>`;
  });
  return `<svg viewBox="0 0 67 20" aria-hidden="true">${bars.join('')}</svg>`;
}

/** línea de 7 puntos; un dato que falta corta la línea (nunca se dibuja como cero) */
export function sparkSvg(values: (number | null)[]): string {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return '';
  const min = Math.min(...nums);
  const span = Math.max(...nums) - min || 1;
  const x = (i: number) => ((i / Math.max(1, values.length - 1)) * 68 + 1).toFixed(1);
  const y = (v: number) => (18 - ((v - min) / span) * 16).toFixed(1);
  const segs: string[][] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v === null) { if (cur.length) segs.push(cur); cur = []; return; }
    cur.push(`${x(i)},${y(v)}`);
  });
  if (cur.length) segs.push(cur);
  const lines = segs.map((s) => (s.length === 1
    ? `<circle cx="${s[0].split(',')[0]}" cy="${s[0].split(',')[1]}" r="1.4" fill="currentColor"/>`
    : `<polyline points="${s.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`));
  return `<svg viewBox="0 0 70 20" aria-hidden="true">${lines.join('')}</svg>`;
}

/** HTML de la tarjeta flotante. */
export function trainingCardHtml(d: TrainingSummary, ref: DisplayCardRef, t: T, lang: string): string {
  const coach = d.source === 'coach';
  let mark = '';
  if (d.done) mark = `<span class="mcard-mark is-done">✓ ${escHtml(t('cardDone'))}</span>`;
  else if (coach && d.session?.kind === 'session') mark = `<span class="mcard-mark is-pending">${escHtml(t('cardPending'))}</span>`;
  const lines: string[] = [
    `<div class="mcard-head"><span class="mcard-title">🏃 ${escHtml(coach ? t('cardTraining') : t('cardTrainingShort'))}</span>${mark}</div>`,
  ];
  if (coach) {
    lines.push(`<div class="mcard-main">${escHtml(d.session ? sessionText(d.session, t) : t('cardPlanDown'))}</div>`);
    if (d.done) lines.push(`<div class="mcard-sub">${escHtml(t('cardKmMin', { km: d.done.km, min: d.done.min }))}</div>`);
    else if (d.last) lines.push(`<div class="mcard-sub">${escHtml(lastText(d.last, t, lang))}</div>`);
  } else if (d.garminOk) {
    lines.push(`<div class="mcard-main">${escHtml(d.last ? lastText(d.last, t, lang) : t('cardNoRuns'))}</div>`);
  }
  if (!d.garminOk) lines.push(`<div class="mcard-sub mcard-warn">${escHtml(t('cardGarminDown'))}</div>`);
  const rec = recoveryParts(d.recovery, t);
  if (rec.length) lines.push(`<div class="mcard-row">${escHtml(rec.join(' · '))}</div>`);
  if (d.week) {
    const label = t('cardWeekKm', { km: d.week.km }) + (coach && d.week.blockPct !== null ? ` · ${t('cardBlock', { pct: d.week.blockPct })}` : '');
    lines.push(`<div class="mcard-week">${weekBarsSvg(d.week.kmByDay, d.week.todayIndex)}<span>${escHtml(label)}</span></div>`);
  }
  return lines.join('');
}

/** HTML de la hoja de detalle a pantalla completa. */
export function trainingSheetHtml(d: TrainingDetail, ref: DisplayCardRef, t: T, lang: string): string {
  const out: string[] = [];
  const range = d.days ? t('sheetWeek', { from: dayMonth(d.days[0].date, lang), to: dayMonth(d.days[6].date, lang) }) : '';
  const race = d.race ? `<div class="msheet-race">${escHtml(t('sheetRace', { n: d.race.days, name: d.race.name }))}</div>` : '';
  out.push(`<div class="msheet-head"><div class="msheet-title">🏃 ${escHtml(ref.name)}${range ? ` · ${escHtml(range)}` : ''}</div>${race}</div>`);
  if (d.days) {
    const cells = d.days.map((x) => {
      const plan = x.planned ? `<div class="msheet-plan">${escHtml(x.planned)}</div>` : x.rest ? `<div class="msheet-plan">${escHtml(t('cardRest'))}</div>` : '';
      const did = x.status === 'done' ? `<div class="msheet-did is-done">${escHtml(`${x.km} km`)}</div>`
        : x.status === 'missed' ? `<div class="msheet-did is-missed">${escHtml(t('sheetMissed'))}</div>`
          : x.status === 'pending' ? `<div class="msheet-did is-pending">${escHtml(t('cardPending'))}</div>` : '';
      return `<div class="msheet-day${x.date === d.today ? ' is-today' : ''}"><b>${escHtml(weekdayName(x.date, lang, 'short'))}</b>${plan}${did}</div>`;
    });
    out.push(`<div class="msheet-days">${cells.join('')}</div>`);
  } else {
    out.push(`<div class="msheet-days msheet-warn">${escHtml(t('cardGarminDown'))}</div>`);
  }
  const last = d.last;
  const lastHtml = last
    ? [
        `<h3>${escHtml(t('sheetLast'))} · ${escHtml(whenText(last, t, lang))}</h3>`,
        `<div>${escHtml([last.name, `${last.km} km`, `${last.min} min`, last.pace ? `${last.pace} /km` : ''].filter(Boolean).join(' · '))}</div>`,
        last.avgHr !== null && last.maxHr !== null ? `<div>${escHtml(t('sheetHr', { avg: last.avgHr, max: last.maxHr }))}</div>` : '',
        last.elevGain !== null ? `<div>${escHtml(t('sheetElev', { m: last.elevGain }))}</div>` : '',
        last.load !== null ? `<div>${escHtml(t('sheetLoad', { n: last.load }))}</div>` : '',
        last.aerobicTE !== null ? `<div>${escHtml(t('sheetAerobic', { n: last.aerobicTE }))}</div>` : '',
        last.zones && last.zones.some((z) => z > 0)
          ? `<div class="msheet-zones">${last.zones.map((z, i) => `<i style="flex:${z};background:${ZONE_COLORS[i]}"></i>`).join('')}</div>`
          : '',
      ].join('')
    : `<h3>${escHtml(t('sheetLast'))}</h3><div>${escHtml(t('cardNoRuns'))}</div>`;
  const r = d.recovery7;
  const lastVal = (vals: (number | null)[]) => [...vals].reverse().find((v) => v !== null) ?? null;
  const spark = (label: string, vals: (number | null)[]) => {
    const v = lastVal(vals);
    return v === null ? '' : `<div class="msheet-spark"><span>${escHtml(label)}</span>${sparkSvg(vals)}<b>${escHtml(v)}</b></div>`;
  };
  const recHtml = `<h3>${escHtml(t('sheetRecovery'))}</h3>${spark(t('cardSleep'), r.sleep)}${spark(t('cardHrv'), r.hrv)}${spark(t('cardRhr'), r.restingHr)}${spark(t('cardBb'), r.bodyBattery)}`;
  out.push(`<div class="msheet-cols"><div class="msheet-panel">${lastHtml}</div><div class="msheet-panel">${recHtml}</div></div>`);
  const age = Math.max(d.stale.garmin ?? 0, d.stale.coach ?? 0);
  out.push(`<div class="msheet-foot">${escHtml([age ? t('sheetStale', { n: age }) : '', t('camTapClose')].filter(Boolean).join(' · '))}</div>`);
  return out.join('');
}
