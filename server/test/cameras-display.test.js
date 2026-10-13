// Pantalla de cámaras (fork fsrhome): textos, frescura de alertas, tamaño de la cuadrícula y eventos en vivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWebModules } from './webModules.js';

const [txt, live] = await loadWebModules('/web/display/camerasText.ts', '/web/display/live.ts');
const t = (k, v = {}) => ({ camPerson: 'Persona', camCar: 'Coche', camNow: 'ahora', camAgo: `hace ${v.n} min` }[k] ?? k);
const NOW = Date.UTC(2026, 9, 13, 23, 0, 0);
const at = (msAgo) => (NOW - msAgo) / 1000;

test('cameraLabel', () => {
  assert.equal(txt.cameraLabel(undefined, NOW, t), '');
  assert.equal(txt.cameraLabel({ label: 'person', startTime: at(20_000) }, NOW, t), 'Persona · ahora');
  assert.equal(txt.cameraLabel({ label: 'car', startTime: at(5 * 60_000 + 10) }, NOW, t), 'Coche · hace 5 min');
  assert.equal(txt.cameraLabel({ label: 'person', startTime: at(30 * 60_000 + 1000) }, NOW, t), '');
  assert.equal(txt.cameraLabel({ label: 'dog', startTime: at(1000) }, NOW, t), 'dog · ahora');
});

test('alertIsFresh: más de 60 s es una alerta vieja (reconexión) y no se abre', () => {
  assert.equal(txt.alertIsFresh({ startTime: at(59_000) }, NOW), true);
  assert.equal(txt.alertIsFresh({ startTime: at(61_000) }, NOW), false);
});

test('gridBox: 2 columnas 16:9 que caben en el espacio', () => {
  assert.deepEqual(txt.gridBox(340, 1000, 4), [340, 191]);
  assert.deepEqual(txt.gridBox(340, 96, 4), [170, 96]);
  assert.deepEqual(txt.gridBox(340, 1000, 3), [340, 191]);
  assert.deepEqual(txt.gridBox(340, 1000, 1), [340, 191]);
});

test('dispatch: cameras y cameraAlert llegan a sus handlers; basura se descarta', () => {
  const got = [];
  const h = { cameras: (d) => got.push(['cameras', d]), cameraAlert: (d) => got.push(['cameraAlert', d]) };
  assert.equal(live.dispatch('cameras', { activity: { patio: { label: 'person', startTime: 1 } } }, h), true);
  assert.equal(live.dispatch('cameras', { activity: 'x' }, h), true);
  const a = { camera: 'patio', name: 'Patio', label: 'person', startTime: 1, eventId: null };
  assert.equal(live.dispatch('cameraAlert', a, h), true);
  assert.equal(live.dispatch('cameraAlert', { camera: 5 }, h), true);
  assert.deepEqual(got, [['cameras', { activity: { patio: { label: 'person', startTime: 1 } } }], ['cameraAlert', a]]);
});

test('el stream escucha los eventos de cámaras', () => {
  const src = readFileSync(new URL('../../web/display/stream.ts', import.meta.url), 'utf8');
  assert.match(src, /STREAM_EVENTS = \[[^\]]*'cameras'[^\]]*'cameraAlert'/);
});
