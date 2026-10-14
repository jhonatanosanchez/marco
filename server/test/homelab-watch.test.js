// Tarjeta Homelab en la pantalla (fork fsrhome): cuándo sale (firma nueva ya, repetición, Anoche, calma) y cuándo no consulta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

const [w] = await loadWebModules('/web/display/homelabWatch.ts');
const S = (over = {}) => ({ estado: 'aviso', firma: 'ahora|aviso|swap', modo: 'ahora', veredicto: { texto: 'x', estado: 'aviso' }, metricas: null, alertas: [{ clave: 'swap' }], anoche: null, ...over });
const MIN = 60_000;

test('homelabDecide: calma no sale y olvida; firma nueva sale ya; misma firma a los 10 min', () => {
  let m = w.EMPTY_MEMO;
  assert.equal(w.homelabDecide(m, S({ estado: 'calma', firma: 'ahora|calma|' }), 0, 10).show, false);
  let r = w.homelabDecide(m, S(), 0, 10);
  assert.equal(r.show, true);
  m = w.markShown(S(), 0);
  assert.equal(w.homelabDecide(m, S(), 9 * MIN, 10).show, false);
  assert.equal(w.homelabDecide(m, S(), 10 * MIN, 10).show, true);
  assert.equal(w.homelabDecide(m, S({ firma: 'ahora|aviso|kuma:3,swap' }), MIN, 10).show, true);
  r = w.homelabDecide(m, S({ estado: 'calma', firma: 'ahora|calma|' }), MIN, 10);
  assert.deepEqual(r.memo, w.EMPTY_MEMO);
  // tras la calma, el mismo aviso vuelve a salir de inmediato
  assert.equal(w.homelabDecide(r.memo, S(), 2 * MIN, 10).show, true);
});

test('homelabDecide: gris sale como aviso; Anoche sin alertas activas cada 30 min', () => {
  assert.equal(w.homelabDecide(w.EMPTY_MEMO, S({ estado: 'mudo', firma: 'ahora|mudo|', alertas: [] }), 0, 10).show, true);
  const night = S({ modo: 'anoche', firma: 'anoche|aviso|', alertas: [] });
  const m = w.markShown(night, 0);
  assert.equal(w.homelabDecide(m, night, 29 * MIN, 10).show, false);
  assert.equal(w.homelabDecide(m, night, 30 * MIN, 10).show, true);
  const nightWithAlert = S({ modo: 'anoche', firma: 'anoche|aviso|swap' });
  assert.equal(w.homelabDecide(w.markShown(nightWithAlert, 0), nightWithAlert, 10 * MIN, 10).show, true);
});

test('HomelabWatcher: no consulta si no puede; ocupado no marca como mostrada; showNow saca la calma', async () => {
  let can = false;
  let busy = false;
  let fetches = 0;
  const shown = [];
  let clock = 0;
  let next = S();
  const watcher = new w.HomelabWatcher({
    everyMin: 10,
    fetch: async () => { fetches++; return next; },
    canPoll: () => can,
    show: (s) => { if (busy) return false; shown.push(s.estado); return true; },
    now: () => clock,
  });
  await watcher.tick();
  assert.equal(fetches, 0);
  can = true;
  busy = true;
  await watcher.tick();
  assert.deepEqual(shown, []);
  busy = false;
  clock = MIN;
  await watcher.tick(); // sigue siendo "nueva": no se marcó cuando estaba ocupado
  assert.deepEqual(shown, ['aviso']);
  clock = 2 * MIN;
  await watcher.tick();
  assert.deepEqual(shown, ['aviso']);
  next = S({ estado: 'calma', firma: 'ahora|calma|', alertas: [] });
  await watcher.showNow();
  assert.deepEqual(shown, ['aviso', 'calma']);
  // fetch que falla: no truena ni muestra
  const bad = new w.HomelabWatcher({ everyMin: 10, fetch: async () => { throw new Error('x'); }, canPoll: () => true, show: () => { throw new Error('no'); } });
  await bad.tick();
  await bad.showNow();
});
