// Lógica pura del modo Echo Show (web/display/echoCore.ts): horario, guardia de fps y URLs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

const [E] = await loadWebModules('/web/display/echoCore.ts');
const m = (hhmm) => E.hmToMin(hhmm);

test('normalizeEcho: sin datos = apagado con defaults', () => {
  assert.deepEqual(E.normalizeEcho(undefined), E.ECHO_DEFAULTS);
  assert.deepEqual(E.normalizeEcho(null), E.ECHO_DEFAULTS);
  assert.equal(E.ECHO_DEFAULTS.enabled, false);
});

test('normalizeEcho: valores raros caen al default campo por campo', () => {
  const n = E.normalizeEcho({ enabled: true, keepAlive: 'video', openFrom: '9', openTo: '21:30', fpsGuard: 'no' });
  assert.equal(n.enabled, true);
  assert.equal(n.keepAlive, 'mp3');
  assert.equal(n.openFrom, '05:00');
  assert.equal(n.openTo, '21:30');
  assert.equal(n.fpsGuard, true);
});

test('isOpenAt: horario normal (05:00–16:00)', () => {
  assert.equal(E.isOpenAt(m('04:59'), '05:00', '16:00'), false);
  assert.equal(E.isOpenAt(m('05:00'), '05:00', '16:00'), true);
  assert.equal(E.isOpenAt(m('15:59'), '05:00', '16:00'), true);
  assert.equal(E.isOpenAt(m('16:00'), '05:00', '16:00'), false);
});

test('isOpenAt: cruza la medianoche (22:00–06:00)', () => {
  assert.equal(E.isOpenAt(m('23:30'), '22:00', '06:00'), true);
  assert.equal(E.isOpenAt(m('02:00'), '22:00', '06:00'), true);
  assert.equal(E.isOpenAt(m('12:00'), '22:00', '06:00'), false);
});

test('isOpenAt: desde = hasta significa siempre abierto; horas inválidas = abierto', () => {
  assert.equal(E.isOpenAt(m('03:00'), '05:00', '05:00'), true);
  assert.equal(E.isOpenAt(m('03:00'), 'x', '16:00'), true);
});

function clock(start = 0) { let t = start; return { now: () => t, add: (ms) => { t += ms; } }; }

test('FpsGuard: no decide durante el calentamiento ni con menos de 10 muestras', () => {
  const c = clock();
  const g = new E.FpsGuard(c.now, false);
  for (let i = 0; i < 9; i++) { c.add(1000); assert.equal(g.sample(5), false); } // 9 s: calentamiento
  for (let i = 0; i < 9; i++) { c.add(1000); assert.equal(g.sample(5), false); } // 9 muestras válidas
  c.add(1000);
  assert.equal(g.sample(5), true); // la décima
});

test('FpsGuard: con buen promedio no dispara; dispara una sola vez', () => {
  const c = clock();
  const g = new E.FpsGuard(c.now, false);
  c.add(10_000);
  for (let i = 0; i < 20; i++) { c.add(1000); assert.equal(g.sample(48), false); }
  assert.equal(g.average(), 48);
  let disparos = 0;
  for (let i = 0; i < 20; i++) { c.add(1000); if (g.sample(10)) disparos++; }
  assert.equal(disparos, 1);
});

test('FpsGuard: ya en lite nunca dispara (sin bucle de recargas)', () => {
  const c = clock();
  const g = new E.FpsGuard(c.now, true);
  c.add(10_000);
  for (let i = 0; i < 30; i++) { c.add(1000); assert.equal(g.sample(3), false); }
});

test('FpsGuard: markVisible reinicia el calentamiento y descarta muestras', () => {
  const c = clock();
  const g = new E.FpsGuard(c.now, false);
  c.add(10_000);
  for (let i = 0; i < 9; i++) { c.add(1000); g.sample(5); }
  g.markVisible();
  c.add(1000);
  assert.equal(g.sample(5), false);
  assert.equal(g.average(), null);
});

test('liteUrl / cleanUrl', () => {
  const base = 'http://172.16.102.100:4650/d/abc?screen=x';
  const lite = E.liteUrl(base);
  const u = new URL(lite);
  assert.equal(u.searchParams.get('lite'), '1');
  assert.equal(u.searchParams.get('echoGuard'), '1');
  assert.equal(u.searchParams.get('screen'), 'x');
  assert.equal(E.cleanUrl(lite), base);
  assert.equal(E.cleanUrl('http://h/d/abc'), 'http://h/d/abc');
});

test('echo.ts escucha el toque con click (en táctil pointerdown NO es gesto: pantalla completa y audio fallarían)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../web/display/echo.ts', import.meta.url), 'utf8');
  assert.match(src, /addEventListener\('click', this\.onTap/);
  assert.doesNotMatch(src, /addEventListener\('pointerdown'/);
});
