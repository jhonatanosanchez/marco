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

test('la vista nunca abre en la vista previa del admin ni con el Echo cerrado; la alerta exige frescura', () => {
  const view = readFileSync(new URL('../../web/display/widgets/cameraView.ts', import.meta.url), 'utf8');
  assert.match(view, /if \(isPreview \|\| this\.isClosed\(\)\) return/);
  const main = readFileSync(new URL('../../web/display/main.ts', import.meta.url), 'utf8');
  assert.match(main, /cameraAlert: \(d\) =>[^\n]*alertIsFresh\(d, serverNow\(\)\)/);
  const echo = readFileSync(new URL('../../web/display/echo.ts', import.meta.url), 'utf8');
  assert.match(echo, /pauseCameras\('echo-closed', !nowOpen\)/);
});

test('floorHeight: la cuadrícula reserva su alto a todo el ancho de la columna (la agenda cede)', () => {
  assert.equal(txt.floorHeight(340, 4), 191);
  assert.equal(txt.floorHeight(340, 2), 95);
  assert.equal(txt.floorHeight(340, 0), 0);
  const custom = readFileSync(new URL('../../web/display/widgets/custom.ts', import.meta.url), 'utf8');
  assert.match(custom, /e\.card instanceof CameraCard \? e\.card\.floorHeight\(/);
});

test('los recuadros reciben toques (Marco pone pointer-events: none en todos los widgets)', () => {
  const css = readFileSync(new URL('../../web/display/styles-cameras.css', import.meta.url), 'utf8');
  assert.match(css, /\.camgrid \.cam \{[^}]*pointer-events: auto/);
});

test('imagen completa a 16:9 sin recorte: el DVR manda 960×1088 ("1080p lite", pensado para verse a 16:9)', () => {
  const css = readFileSync(new URL('../../web/display/styles-cameras.css', import.meta.url), 'utf8');
  // recuadros: la caja ya es 16:9 (gridBox); fill estira el cuadro completo en vez de recortar el centro (zoom)
  assert.match(css, /\.camgrid \.cam img \{[^}]*object-fit: fill/);
  assert.doesNotMatch(css, /object-fit: (cover|contain)/);
  // vista: caja 16:9 que cabe en la pantalla, y la foto del evento también a 16:9
  assert.match(css, /\.camview video, \.camview \.camview-fallback \{[^}]*width: min\(100vw, 177\.78vh\); height: min\(56\.25vw, 100vh\); object-fit: fill/);
  assert.match(css, /\.camview-snap \{[^}]*width: 28vmin; height: 15\.75vmin; object-fit: fill/);
});

test('revisión 1: la frescura se mide con sentAt cuando viene (persona que entra tarde a la zona)', () => {
  assert.equal(txt.alertIsFresh({ startTime: at(120_000), sentAt: NOW - 2000 }, NOW), true);
  assert.equal(txt.alertIsFresh({ startTime: at(5000), sentAt: NOW - 61_000 }, NOW), false);
  const got = [];
  live.dispatch('cameraAlert', { camera: 'patio', name: 'Patio', label: 'person', startTime: 1, eventId: null, sentAt: 5 }, { cameraAlert: (d) => got.push(d) });
  assert.equal(got[0].sentAt, 5);
});

test('revisión 3: zonas como texto libre; se separan al salir del campo, no en cada tecla', async () => {
  const [z] = await loadWebModules('/web/admin/camerasZones.ts');
  assert.deepEqual(z.parseZones('pipol, , Entrada,'), ['pipol', 'Entrada']);
  assert.deepEqual(z.parseZones('  '), []);
  const sec = readFileSync(new URL('../../web/admin/sections/Cameras.tsx', import.meta.url), 'utf8');
  assert.match(sec, /onBlur=/);
  assert.doesNotMatch(sec, /onValue=\{\(v\) => set\(\(d\) => void \(d\.frigate\.zones/);
});
