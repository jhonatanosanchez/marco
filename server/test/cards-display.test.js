// Tarjetas en la pantalla (fork fsrhome): textos, HTML escapado, rotación y evento en vivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWebModules } from './webModules.js';

const [txt, live] = await loadWebModules('/web/display/cardsText.ts', '/web/display/live.ts');
const T = {
  cardTraining: 'Entreno de hoy', cardTrainingShort: 'Entreno', cardDone: 'hecho', cardPending: 'pendiente', cardRest: 'Descanso',
  cardFree: 'Día libre', cardNoPlan: 'Sin plan', cardPlanDown: 'Plan sin datos', cardGarminDown: 'Sin datos de Garmin',
  cardNoRuns: 'Sin carreras recientes', cardToday: 'hoy', cardYesterday: 'ayer', cardSleep: 'Sueño', cardHrv: 'HRV',
  cardRhr: 'FC reposo', cardBb: 'Batería', sheetMissed: 'No se hizo', sheetLast: 'Última carrera', sheetRecovery: 'Recuperación · 7 días',
  camTapClose: 'Toca para volver',
};
const t = (k, v = {}) => {
  const tpl = {
    cardKmMin: '{km} km en {min} min', cardLast: 'Última carrera, {when}', cardWeekKm: '{km} km esta semana', cardBlock: 'bloque {pct} %',
    sheetWeek: 'Semana del {from} al {to}', sheetRace: 'Faltan {n} días · {name}', sheetHr: 'FC {avg}/{max}', sheetElev: 'Desnivel {m} m',
    sheetLoad: 'Carga {n}', sheetAerobic: 'Efecto aeróbico {n}', sheetStale: 'Datos de hace {n} min',
  }[k];
  return tpl ? tpl.replace(/\{(\w+)\}/g, (_, x) => String(v[x])) : T[k] ?? k;
};
const REF = { id: 'k_a', type: 'training', name: 'Entreno Jhonatan', source: 'coach' };
const RUN = { name: 'Rodaje', date: '2026-10-13', when: 'today', weekday: 1, km: 10.5, min: 61, pace: '5:49', avgHr: 150, maxHr: 170, elevGain: 40, load: 142, aerobicTE: 3.6, zones: [59, 107, 1586, 1875, 1] };
const WEEK = { monday: '2026-10-12', todayIndex: 1, kmByDay: [7.9, 10.5, 0, 0, 0, 0, 0], km: 18.4, runs: 2, blockPct: 81 };
const REC = { sleep: 82, hrv: 52, restingHr: 48, bodyBattery: 90 };
const sum = (o = {}) => ({ source: 'coach', today: '2026-10-13', planOk: true, session: { kind: 'session', text: '60min ritmo fácil' }, garminOk: true, done: null, last: RUN, week: WEEK, recovery: REC, stale: {}, ...o });

test('nextIndex y cardsSig', () => {
  assert.equal(txt.nextIndex(3, -1), 0);
  assert.equal(txt.nextIndex(3, 2), 0);
  assert.equal(txt.nextIndex(0, 4), -1);
  const c = { items: [REF], everyMin: 20, showSec: 30, corner: 'br' };
  assert.equal(txt.cardsSig(c), txt.cardsSig(structuredClone(c)));
  assert.notEqual(txt.cardsSig(c), txt.cardsSig({ ...c, everyMin: 10 }));
});

test('sessionText: sesión, descanso, día libre y sin plan', () => {
  assert.equal(txt.sessionText({ kind: 'session', text: '60min' }, t), '60min');
  assert.equal(txt.sessionText({ kind: 'session', text: '' }, t), 'Entreno');
  assert.equal(txt.sessionText({ kind: 'rest', text: '' }, t), 'Descanso');
  assert.equal(txt.sessionText({ kind: 'free', text: '' }, t), 'Día libre');
  assert.equal(txt.sessionText({ kind: 'none', text: '' }, t), 'Sin plan');
});

test('tarjeta coach: pendiente + última carrera; hecho cuando ya corrió', () => {
  const pend = txt.trainingCardHtml(sum(), REF, t, 'es');
  assert.match(pend, /Entreno de hoy/);
  assert.match(pend, /is-pending">pendiente/);
  assert.match(pend, /60min ritmo fácil/);
  assert.match(pend, /Última carrera, hoy · Rodaje · 10\.5 km en 61 min · 5:49 \/km/);
  assert.match(pend, /Sueño 82 · HRV 52 · FC reposo 48 · Batería 90/);
  assert.match(pend, /18\.4 km esta semana · bloque 81 %/);
  const done = txt.trainingCardHtml(sum({ done: { km: 10.5, min: 61 } }), REF, t, 'es');
  assert.match(done, /is-done">✓ hecho/);
  assert.match(done, /10\.5 km en 61 min/);
});

test('tarjeta solo Garmin: sin plan, última carrera primero; Garmin caído lo dice', () => {
  const g = txt.trainingCardHtml(sum({ source: 'garmin', planOk: null, session: null }), { ...REF, source: 'garmin' }, t, 'es');
  assert.match(g, /class="mcard-title"><span class="mcard-ico">🏃<\/span>Entreno</);
  assert.doesNotMatch(g, /pendiente|Sin plan/);
  assert.match(g, /mcard-main">Última carrera, hoy/);
  const down = txt.trainingCardHtml(sum({ garminOk: false, last: null, week: null, done: null, planOk: false, session: null, recovery: { sleep: null, hrv: null, restingHr: null, bodyBattery: null } }), REF, t, 'es');
  assert.match(down, /Plan sin datos/);
  assert.match(down, /Sin datos de Garmin/);
});

test('textos de las fuentes van escapados', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const h = txt.trainingCardHtml(sum({ session: { kind: 'session', text: evil }, last: { ...RUN, name: evil } }), { ...REF, name: evil }, t, 'es');
  assert.doesNotMatch(h, /<img/);
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('weekBarsSvg y sparkSvg: SVG con 7 barras; línea cortada donde falta el dato', () => {
  const bars = txt.weekBarsSvg([7.9, 10.5, 0, 0, 0, 0, 0], 1);
  assert.equal((bars.match(/<rect/g) || []).length, 7);
  const sp = txt.sparkSvg([null, 3, 4, null, 5, 6, null]);
  assert.equal((sp.match(/<polyline/g) || []).length, 2);
  assert.equal(txt.sparkSvg([null, null]), '');
});

test('dispatch: cardShow llega con id; basura se descarta', () => {
  const got = [];
  const h = { cardShow: (d) => got.push(d) };
  assert.equal(live.dispatch('cardShow', { id: 'k_a', sentAt: 5 }, h), true);
  assert.equal(live.dispatch('cardShow', { id: 7 }, h), true);
  assert.deepEqual(got, [{ id: 'k_a', sentAt: 5 }]);
});

test('la tarjeta recibe toques y se anima solo con transform/opacity', () => {
  const css = readFileSync(new URL('../../web/display/styles-cards.css', import.meta.url), 'utf8');
  assert.match(css, /\.mcard \{[^}]*pointer-events: auto/);
  assert.match(css, /\.mcard \{[^}]*transition: opacity [^;]*, transform [^;]*;/);
  assert.match(css, /html\.lite \.mcard, html\.lite \.msheet \{[^}]*backdrop-filter: none/);
  const stream = readFileSync(new URL('../../web/display/stream.ts', import.meta.url), 'utf8');
  assert.match(stream, /'cardShow'/);
});

test('hoja: semana con pendiente y No se hizo, carrera, y sin fila de plan para solo Garmin', () => {
  const days = [
    { date: '2026-10-12', weekday: 0, planned: '2 SETS', rest: false, km: 7.9, status: 'done' },
    { date: '2026-10-13', weekday: 1, planned: '60min', rest: false, km: null, status: 'missed' },
    { date: '2026-10-14', weekday: 2, planned: '60min progresivos', rest: false, km: null, status: 'pending' },
    { date: '2026-10-15', weekday: 3, planned: null, rest: false, km: null, status: 'free' },
    { date: '2026-10-16', weekday: 4, planned: null, rest: true, km: null, status: 'rest' },
    { date: '2026-10-17', weekday: 5, planned: 'Especial HM', rest: false, km: null, status: 'future' },
    { date: '2026-10-18', weekday: 6, planned: null, rest: false, km: null, status: 'free' },
  ];
  const rec7 = { days: [], sleep: [70, 72, null, 80, 81, 82, 83], hrv: [null, null, null, null, null, null, null], restingHr: [50, 49, 49, 48, 48, 48, 48], bodyBattery: [80, 85, 90, 70, 75, 80, 90] };
  const det = { source: 'coach', today: '2026-10-14', garminOk: true, planOk: true, days, last: RUN, recovery7: rec7, race: { date: '2026-11-08', name: 'Carrera Medio Maratón', days: 25 }, week: WEEK, stale: { garmin: 40 } };
  const h = txt.trainingSheetHtml(det, REF, t, 'es');
  assert.match(h, /is-done">7\.9 km/);
  assert.match(h, /is-missed">No se hizo/);
  assert.match(h, /is-pending">pendiente/);
  assert.match(h, /Faltan 25 días · Carrera Medio Maratón/);
  assert.match(h, /FC 150\/170/);
  assert.match(h, /Datos de hace 40 min · Toca para volver/);
  assert.doesNotMatch(h, /<span>HRV<\/span>/); // sin datos de HRV no se dibuja su fila
  const g = txt.trainingSheetHtml({ ...det, source: 'garmin', planOk: null, race: null, days: days.map((x) => ({ ...x, planned: null })) }, { ...REF, source: 'garmin' }, t, 'es');
  assert.doesNotMatch(g, /Faltan/);
  assert.doesNotMatch(g, /msheet-plan">2 SETS/);
});

test('main.ts: la alerta de cámara y el cierre del modo Echo cierran tarjeta y hoja; config y cardShow conectados', () => {
  const main = readFileSync(new URL('../../web/display/main.ts', import.meta.url), 'utf8');
  assert.match(main, /function cameraAlertOpen\(d: CameraAlert\): void \{\s*cards\.closeAll\(\);/);
  assert.match(main, /echo\.onClose = \(\) => \{ cameraView\.close\(\); cards\.closeAll\(\); \};/);
  assert.match(main, /cards\.update\(cfg\.cards\);/);
  assert.match(main, /cardShow: \(d\) => \{ if \(!d\.sentAt \|\| serverNow\(\) - d\.sentAt < 60_000\) cards\.showNow\(d\.id\); \},/);
});
