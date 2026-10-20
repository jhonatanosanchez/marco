// cuándo sale la tarjeta Organización (fork fsrhome)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

const [w] = await loadWebModules('/web/display/homelabWatch.ts');
const S = (o = {}) => ({ estado: 'aviso', firma: 'aviso|#C1|', accionables: 1, pendientes: [], altas: 0, ...o });
const MIN = 60_000;

test('orgDecide: firma nueva ya, misma firma a los 30 min, calma olvida', () => {
  let m = w.EMPTY_MEMO;
  assert.equal(w.orgDecide(m, S(), 0, 30).show, true);
  m = w.markShown(S(), 0);
  assert.equal(w.orgDecide(m, S(), 29 * MIN, 30).show, false);
  assert.equal(w.orgDecide(m, S(), 30 * MIN, 30).show, true);
  assert.deepEqual(w.orgDecide(m, S({ estado: 'calma', firma: 'calma||', accionables: 0 }), MIN, 30).memo, w.EMPTY_MEMO);
});

test('orgDecide: solo altas sin accionables, cada 3 × everyMin', () => {
  const s = S({ estado: 'alerta', firma: 'alerta||#A9', accionables: 0, altas: 1 });
  const m = w.markShown(s, 0);
  assert.equal(w.orgDecide(m, s, 60 * MIN, 30).show, false);
  assert.equal(w.orgDecide(m, s, 90 * MIN, 30).show, true);
});

test('CardWatcher con orgDecide: no consulta en pausa; ocupado reintenta sin marcar', async () => {
  let puede = false; let sale = false; let pedidas = 0;
  const v = new w.CardWatcher({ everyMin: 30, decide: w.orgDecide, fetch: async () => { pedidas++; return S(); }, canPoll: () => puede, show: () => sale, now: () => 0 });
  await v.tick();
  assert.equal(pedidas, 0);
  puede = true;
  await v.tick();
  sale = true;
  let mostrada = 0;
  const v2 = new w.CardWatcher({ everyMin: 30, decide: w.orgDecide, fetch: async () => S(), canPoll: () => true, show: () => { mostrada++; return true; }, now: () => 0 });
  await v2.tick(); await v2.tick();
  assert.equal(mostrada, 1);
  assert.equal(pedidas, 1);
});
