// Tarjetas de Entreno (fork fsrhome): reglas puras sobre running-coach y garmin-stats, portadas de echo-reloj
// (html/js/running.js). Spec: homelab-docs/specs/2026-10-13-marco-tarjetas-entreno-design.md

export const CARD_PREFIX = 'k_';
export const CARD_ID_RE = /^k_[a-z0-9]{1,40}$/;
/** 'training': Entreno; 'ages': "A esta edad" a pantalla completa (server/ages.js) */
export const CARD_TYPES = ['training', 'ages'];
export const AGES_DEFAULTS = Object.freeze({ person: 'Arantza', birthDate: '2020-06-22', everyMin: 15 });
/** segundos que "A esta edad" se queda en pantalla */
export const AGES_SHOW_SEC = 45;
/** 'coach': plan del coach + Garmin; 'garmin': solo Garmin (sin plan) */
export const TRAINING_SOURCES = ['coach', 'garmin'];
export const MAX_CARDS = 12;
export const TRAINING_DEFAULTS = Object.freeze({ garminUrl: 'http://garmin-stats:4400', coachUrl: 'http://running-coach:4300' });

const round1 = (x) => Math.round(x * 10) / 10;
const numOrNull = (v, round = Math.round) => { const n = Number(v); return v !== null && v !== undefined && Number.isFinite(n) ? round(n) : null; };
const ymdParts = (ymd) => ymd.split('-').map(Number);

const dayFmt = new Map();
/** 'YYYY-MM-DD' del instante `ms` en la zona `tz` */
export function localDay(ms, tz) {
  let f = dayFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFmt.set(tz, f);
  }
  return f.format(new Date(ms));
}

export function addDays(ymd, n) {
  const [y, m, d] = ymdParts(ymd);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** lunes = 0 … domingo = 6 */
export function weekdayIndex(ymd) {
  const [y, m, d] = ymdParts(ymd);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export const mondayOf = (ymd) => addDays(ymd, -weekdayIndex(ymd));

/** "Realizar buen calentamiento\n2 x 3k …\ncon 2min" → "2 x 3k … con 2min" (el PDF del coach parte las frases) */
export function cleanWorkout(text) {
  return String(text || '').replace(/realizar (un )?buen calentamiento/i, '').replace(/\s*\n\s*/g, ' ').trim();
}

/** Qué toca hoy según running-coach /plan (reglas de echo-reloj). */
export function todaySession(plan, today) {
  const sessions = plan && typeof plan.sessions === 'object' && plan.sessions ? plan.sessions : {};
  const keys = Object.keys(sessions).sort();
  if (!keys.length) return { kind: 'none', text: '' };
  const resolved = keys.some((k) => sessions[k] && typeof sessions[k] === 'object' && 'userDate' in sessions[k]);
  const s = resolved ? keys.map((k) => sessions[k]).find((x) => x?.userDate === today) || null : sessions[addDays(today, 1)] || null;
  if (!s) {
    // dentro del plan un día sin sesión es libre; fuera de él no hay plan
    const inside = resolved && today >= addDays(keys[0], -1) && today <= keys[keys.length - 1];
    return { kind: inside ? 'free' : 'none', text: '' };
  }
  if (s.rest || s.skipped) return { kind: 'rest', text: '' };
  return { kind: 'session', text: cleanWorkout(s.workout) };
}

const isRun = (a) => /running/i.test(String(a?.type || ''));
const validActs = (acts) => (Array.isArray(acts) ? acts.filter((a) => a && typeof a.time === 'string' && Number.isFinite(Date.parse(a.time))) : []);

/** carreras cuya fecha local es `ymd` */
export function runsOn(acts, ymd, tz) {
  return validActs(acts).filter((a) => isRun(a) && localDay(Date.parse(a.time), tz) === ymd);
}

const sumKm = (runs) => round1(runs.reduce((s, a) => s + (Number(a.distanceM) || 0), 0) / 1000);

export function doneToday(acts, today, tz) {
  const r = runsOn(acts, today, tz);
  if (!r.length) return null;
  return { km: sumKm(r), min: Math.round(r.reduce((s, a) => s + (Number(a.movingSec) || 0), 0) / 60) };
}

/** último valor de una serie [{date, …}] si es de hoy o de ayer (un HRV de hace una semana no dice nada de hoy) */
function recent(series, today) {
  if (!Array.isArray(series) || !series.length) return null;
  const last = series[series.length - 1];
  return last && (last.date === today || last.date === addDays(today, -1)) ? last : null;
}

export function recovery(health, today) {
  const h = health && typeof health === 'object' ? health : {};
  const v = (series, key) => numOrNull(recent(series, today)?.[key]);
  return { sleep: v(h.sleep, 'score'), hrv: v(h.hrv, 'value'), restingHr: v(h.restingHr, 'value'), bodyBattery: v(h.bodyBattery, 'high') };
}

export function week(acts, adherence, today, tz) {
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const kmByDay = [0, 0, 0, 0, 0, 0, 0];
  let runs = 0;
  let meters = 0;
  for (const a of validActs(acts)) {
    if (!isRun(a)) continue;
    const day = localDay(Date.parse(a.time), tz);
    if (day < monday || day > sunday) continue;
    runs++;
    meters += Number(a.distanceM) || 0;
    kmByDay[weekdayIndex(day)] += (Number(a.distanceM) || 0) / 1000;
  }
  const block = Array.isArray(adherence?.blocks) ? adherence.blocks.find((b) => b?.isCurrent) : null;
  return { monday, todayIndex: weekdayIndex(today), kmByDay: kmByDay.map(round1), km: round1(meters / 1000), runs, blockPct: numOrNull(block?.adherencePct) };
}

/** "Villa de Álvarez - S7 Mie 23/Sep - Series" → "Series" */
export const shortName = (name) => String(name || '').split(' - ').pop().trim();

/** ritmo m:ss por km */
export function pace(meters, seconds) {
  if (!meters || !seconds) return '';
  const spk = Math.round(seconds / (meters / 1000));
  return `${Math.floor(spk / 60)}:${String(spk % 60).padStart(2, '0')}`;
}

export function lastRun(acts, today, tz) {
  const runs = validActs(acts).filter(isRun).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  if (!runs.length) return null;
  const u = runs[0];
  const date = localDay(Date.parse(u.time), tz);
  const m = Number(u.distanceM) || 0;
  const s = Number(u.movingSec) || 0;
  return {
    name: shortName(u.name),
    date,
    when: date === today ? 'today' : date === addDays(today, -1) ? 'yesterday' : 'weekday',
    weekday: weekdayIndex(date),
    km: round1(m / 1000),
    min: Math.round(s / 60),
    pace: pace(m, s),
    avgHr: numOrNull(u.avgHr),
    maxHr: numOrNull(u.maxHr),
    elevGain: numOrNull(u.elevGain),
    load: numOrNull(u.trainingLoad),
    aerobicTE: numOrNull(u.aerobicTE, round1),
    zones: Array.isArray(u.hrZones?.seconds) ? u.hrZones.seconds.slice(0, 5).map((x) => Math.max(0, Math.round(Number(x) || 0))) : null,
  };
}

const plannedTitle = (p) => String(p?.title || p?.workout || '').trim().split('\n')[0].trim();

/** primera fila de adherence desde hoy cuyo plan empieza con "Carrera" (regla de echo-reloj) */
export function nextRace(adherence, today) {
  const rows = Array.isArray(adherence?.rows) ? adherence.rows : [];
  const r = rows
    .filter((x) => typeof x?.userDate === 'string' && x.userDate >= today && /^carrera/i.test(plannedTitle(x.planned)))
    .sort((a, b) => (a.userDate < b.userDate ? -1 : 1))[0];
  if (!r) return null;
  const days = Math.round((Date.parse(`${r.userDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return { date: r.userDate, name: plannedTitle(r.planned), days };
}

/**
 * Semana lunes–domingo para la hoja. `withPlan` (fuente coach): lo planeado sale de adherence. Hoy sin carrera es
 * "pendiente" aunque garmin-stats lo marque saltado: el día no ha terminado.
 */
export function weekDetail(acts, adherence, today, tz, withPlan) {
  const monday = mondayOf(today);
  const rows = new Map((withPlan && Array.isArray(adherence?.rows) ? adherence.rows : []).filter((r) => typeof r?.userDate === 'string').map((r) => [r.userDate, r]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const runs = runsOn(acts, date, tz);
    const km = runs.length ? sumKm(runs) : null;
    const planned = rows.get(date)?.planned ?? null;
    const rest = !!planned?.rest;
    let status;
    if (km) status = 'done';
    else if (date > today) status = rest ? 'rest' : planned ? 'future' : 'free';
    else if (rest) status = 'rest';
    else if (!planned) status = 'free';
    else status = date === today ? 'pending' : 'missed';
    return { date, weekday: i, planned: planned && !rest ? plannedTitle(planned) || null : null, rest, km, status };
  });
}

export function recovery7(health, today) {
  const h = health && typeof health === 'object' ? health : {};
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const col = (series, key) => {
    const m = new Map((Array.isArray(series) ? series : []).filter((x) => x && typeof x.date === 'string').map((x) => [x.date, x[key]]));
    return days.map((d) => numOrNull(m.get(d)));
  };
  return { days, sleep: col(h.sleep, 'score'), hrv: col(h.hrv, 'value'), restingHr: col(h.restingHr, 'value'), bodyBattery: col(h.bodyBattery, 'high') };
}

/** Resumen de la tarjeta. `data` = { plan, activities, health, adherence, stale } (cualquiera puede ser null). */
export function trainingSummary(data, { source, now, tz }) {
  const today = localDay(now, tz);
  const coach = source === 'coach';
  const acts = Array.isArray(data.activities) ? data.activities : null;
  return {
    source,
    today,
    planOk: coach ? !!data.plan : null,
    session: coach && data.plan ? todaySession(data.plan, today) : null,
    garminOk: !!acts,
    done: acts ? doneToday(acts, today, tz) : null,
    last: acts ? lastRun(acts, today, tz) : null,
    week: acts ? week(acts, data.adherence, today, tz) : null,
    recovery: recovery(data.health, today),
    stale: data.stale || {},
  };
}

/** Datos de la hoja de detalle. */
export function trainingDetail(data, { source, now, tz }) {
  const today = localDay(now, tz);
  const coach = source === 'coach';
  const acts = Array.isArray(data.activities) ? data.activities : null;
  return {
    source,
    today,
    garminOk: !!acts,
    planOk: coach ? !!data.adherence : null,
    days: acts ? weekDetail(acts, data.adherence, today, tz, coach) : null,
    last: acts ? lastRun(acts, today, tz) : null,
    recovery7: recovery7(data.health, today),
    race: coach ? nextRace(data.adherence, today) : null,
    week: acts ? week(acts, data.adherence, today, tz) : null,
    stale: data.stale || {},
  };
}
