// Reglas de Entreno (fork fsrhome): las mismas de echo-reloj (html/js/running.js), con fechas locales de Colima.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tc from '../core/trainingCore.js';

const TZ = 'America/Mexico_City';
const run = (time, km, min, name = 'Colima - S4 Mar 13/Oct - Rodaje') => ({
  time, type: 'running', name, distanceM: km * 1000, movingSec: min * 60, avgHr: 150, maxHr: 170, elevGain: 40,
  trainingLoad: 141.6, aerobicTE: 3.5999, hrZones: { seconds: [59, 107, 1586, 1875, 1], boundaries: [95, 114, 133, 154, 174] },
});
const ACTS = [
  run('2026-10-14T00:02:20Z', 10.5, 61), // martes 13 a las 18:02 en Colima
  run('2026-10-12T13:00:00Z', 7.9, 41, 'Villa de Álvarez - S4 Lun 12/Oct'),
  { time: '2026-10-13T15:00:00Z', type: 'cycling', name: 'Bici', distanceM: 20000, movingSec: 3600 },
  run('2026-10-05T13:00:00Z', 12, 65),
];
const PLAN = { sessions: {
  '2026-10-13': { userDate: '2026-10-12', rest: false, workout: 'Realizar buen calentamiento\n2 x 3k 4:35\ncon 2min' },
  '2026-10-14': { userDate: '2026-10-13', rest: true, workout: 'Descanso' },
  '2026-10-15': { userDate: '2026-10-14', rest: false, skipped: true, workout: '60min' },
  '2026-10-17': { userDate: '2026-10-16', rest: false, workout: '50min ritmo fácil' },
} };
const ADH = { rows: [
  { userDate: '2026-10-12', planned: { rest: false, title: '2 SETS', workout: '2 SETS\n15min' }, status: 'cumplido' },
  { userDate: '2026-10-13', planned: { rest: false, title: '60min ritmo fácil' }, status: 'cumplido' },
  { userDate: '2026-10-14', planned: { rest: false, title: '60min progresivos' }, status: 'saltado' },
  { userDate: '2026-10-16', planned: { rest: true, workout: 'Descanso' }, status: 'proximo' },
  { userDate: '2026-10-17', planned: { rest: false, title: 'Especial HM' }, status: 'proximo' },
  { userDate: '2026-11-08', planned: { rest: false, title: 'Carrera Medio Maratón Colima', workout: 'Carrera Medio Maratón Colima\n21k' }, status: 'proximo' },
  { userDate: '2026-10-01', planned: { rest: false, title: 'Carrera vieja' }, status: 'cumplido' },
], blocks: [{ isCurrent: false, adherencePct: 50 }, { isCurrent: true, adherencePct: 81 }] };
const HEALTH = {
  sleep: [{ date: '2026-10-11', score: 70 }, { date: '2026-10-12', score: 82 }],
  hrv: [{ date: '2026-10-05', value: 40 }],
  restingHr: [{ date: '2026-10-13', value: 48 }],
  bodyBattery: [{ date: '2026-10-13', high: 90, low: 20 }],
};

test('localDay: la hora UTC de Garmin cae en el día local', () => {
  assert.equal(tc.localDay(Date.parse('2026-10-14T00:02:20Z'), TZ), '2026-10-13');
  assert.equal(tc.localDay(Date.parse('2026-10-14T06:30:00Z'), TZ), '2026-10-14');
});

test('addDays, weekdayIndex y mondayOf (lunes = 0)', () => {
  assert.equal(tc.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(tc.addDays('2026-10-01', -1), '2026-09-30');
  assert.equal(tc.weekdayIndex('2026-10-13'), 1);
  assert.equal(tc.mondayOf('2026-10-14'), '2026-10-12');
  assert.equal(tc.mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(tc.mondayOf('2026-10-12'), '2026-10-12');
});

test('todaySession: userDate, descanso, saltado, día libre, fuera del plan y desfase viejo', () => {
  assert.deepEqual(tc.todaySession(PLAN, '2026-10-12'), { kind: 'session', text: '2 x 3k 4:35 con 2min' });
  assert.deepEqual(tc.todaySession(PLAN, '2026-10-13'), { kind: 'rest', text: '' });
  assert.deepEqual(tc.todaySession(PLAN, '2026-10-14'), { kind: 'rest', text: '' });
  assert.deepEqual(tc.todaySession(PLAN, '2026-10-15'), { kind: 'free', text: '' });
  assert.deepEqual(tc.todaySession(PLAN, '2026-11-30'), { kind: 'none', text: '' });
  assert.deepEqual(tc.todaySession(null, '2026-10-12'), { kind: 'none', text: '' });
  assert.deepEqual(tc.todaySession({ sessions: { '2026-10-13': { rest: false, workout: '8 km' } } }, '2026-10-12'), { kind: 'session', text: '8 km' });
});

test('doneToday: solo carreras del día local; null si no hay', () => {
  assert.deepEqual(tc.doneToday(ACTS, '2026-10-13', TZ), { km: 10.5, min: 61 });
  assert.equal(tc.doneToday(ACTS, '2026-10-14', TZ), null);
  assert.equal(tc.doneToday('basura', '2026-10-13', TZ), null);
});

test('recovery: solo valores de hoy o de ayer', () => {
  assert.deepEqual(tc.recovery(HEALTH, '2026-10-13'), { sleep: 82, hrv: null, restingHr: 48, bodyBattery: 90 });
  assert.deepEqual(tc.recovery(null, '2026-10-13'), { sleep: null, hrv: null, restingHr: null, bodyBattery: null });
});

test('week: lunes a domingo, km por día y % del bloque actual', () => {
  assert.deepEqual(tc.week(ACTS, ADH, '2026-10-13', TZ), {
    monday: '2026-10-12', todayIndex: 1, kmByDay: [7.9, 10.5, 0, 0, 0, 0, 0], km: 18.4, runs: 2, blockPct: 81,
  });
  assert.equal(tc.week(ACTS, null, '2026-10-13', TZ).blockPct, null);
});

test('lastRun: nombre corto, ritmo, hoy/ayer/día de la semana y datos completos', () => {
  const l = tc.lastRun(ACTS, '2026-10-13', TZ);
  assert.deepEqual(l, {
    name: 'Rodaje', date: '2026-10-13', when: 'today', weekday: 1, km: 10.5, min: 61, pace: '5:49',
    avgHr: 150, maxHr: 170, elevGain: 40, load: 142, aerobicTE: 3.6, zones: [59, 107, 1586, 1875, 1],
  });
  assert.equal(tc.lastRun(ACTS, '2026-10-14', TZ).when, 'yesterday');
  assert.equal(tc.lastRun(ACTS, '2026-10-16', TZ).when, 'weekday');
  assert.equal(tc.lastRun([], '2026-10-13', TZ), null);
});

test('nextRace: primera "Carrera" desde hoy, con días que faltan', () => {
  assert.deepEqual(tc.nextRace(ADH, '2026-10-13'), { date: '2026-11-08', name: 'Carrera Medio Maratón Colima', days: 26 });
  assert.equal(tc.nextRace(ADH, '2026-11-09'), null);
  assert.equal(tc.nextRace(null, '2026-10-13'), null);
});

test('weekDetail: hoy sin carrera = pendiente (aunque garmin-stats diga saltado); ayer sin carrera = No se hizo', () => {
  const d = tc.weekDetail(ACTS, ADH, '2026-10-14', TZ, true);
  assert.deepEqual(d.map((x) => x.status), ['done', 'done', 'pending', 'free', 'rest', 'future', 'free']);
  assert.equal(d[0].planned, '2 SETS');
  assert.equal(d[0].km, 7.9);
  assert.equal(d[4].rest, true);
  assert.equal(tc.weekDetail(ACTS, ADH, '2026-10-15', TZ, true)[2].status, 'missed');
  const sinPlan = tc.weekDetail(ACTS, ADH, '2026-10-14', TZ, false);
  assert.deepEqual(sinPlan.map((x) => x.status), ['done', 'done', 'free', 'free', 'free', 'free', 'free']);
  assert.ok(sinPlan.every((x) => x.planned === null));
});

test('recovery7: 7 días hasta hoy, null donde no hay dato', () => {
  const r = tc.recovery7(HEALTH, '2026-10-13');
  assert.deepEqual(r.days, ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
  assert.deepEqual(r.sleep, [null, null, null, null, 70, 82, null]);
  assert.deepEqual(r.restingHr, [null, null, null, null, null, null, 48]);
  assert.ok(r.hrv.every((x) => x === null));
});

test('trainingSummary: coach con plan; solo Garmin sin sesión; Garmin caído sin inventar', () => {
  const now = Date.parse('2026-10-14T01:00:00Z'); // 13 oct, 19:00 en Colima
  const data = { plan: PLAN, activities: ACTS, health: HEALTH, adherence: ADH, stale: {} };
  const s = tc.trainingSummary(data, { source: 'coach', now, tz: TZ });
  assert.equal(s.today, '2026-10-13');
  assert.deepEqual(s.session, { kind: 'rest', text: '' });
  assert.equal(s.planOk, true);
  assert.deepEqual(s.done, { km: 10.5, min: 61 });
  assert.equal(s.week.km, 18.4);
  const g = tc.trainingSummary(data, { source: 'garmin', now, tz: TZ });
  assert.equal(g.session, null);
  assert.equal(g.planOk, null);
  const down = tc.trainingSummary({ plan: null, activities: null, health: null, adherence: null, stale: {} }, { source: 'coach', now, tz: TZ });
  assert.equal(down.garminOk, false);
  assert.equal(down.planOk, false);
  assert.equal(down.session, null);
  assert.equal(down.done, null);
  assert.equal(down.last, null);
  assert.equal(down.week, null);
});

test('trainingDetail: días, última carrera, recuperación y carrera solo con coach', () => {
  const now = Date.parse('2026-10-14T18:00:00Z');
  const data = { plan: PLAN, activities: ACTS, health: HEALTH, adherence: ADH, stale: { garmin: 40 } };
  const d = tc.trainingDetail(data, { source: 'coach', now, tz: TZ });
  assert.equal(d.days.length, 7);
  assert.equal(d.race.days, 25);
  assert.deepEqual(d.stale, { garmin: 40 });
  assert.equal(tc.trainingDetail(data, { source: 'garmin', now, tz: TZ }).race, null);
});
