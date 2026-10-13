// Reglas de actividad y alertas de las cámaras (fork fsrhome): las mismas de echo-reloj/html/js/frigate.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupOf, activityByCamera, emptyAlertState, newAlerts, validEvents, screensWantingCameras, alertScreenIds,
} from '../core/camerasCore.js';
import { defaultConfig, defaultScreenProfile } from '../core/defaults.js';

const T0 = 1_791_900_000; // segundos
const ev = (n, camera, label, start) => ({ id: `${start}.0-ev${n}`, camera, label, start_time: start, zones: ['Entrada'] });

test('groupOf: los dos exteriores comparten grupo', () => {
  assert.equal(groupOf('ext_izquierda'), 'exterior');
  assert.equal(groupOf('ext_derecha'), 'exterior');
  assert.equal(groupOf('patio'), 'patio');
});

test('activityByCamera: lo más reciente por cámara dentro de 30 min', () => {
  const a = activityByCamera([
    ev(1, 'patio', 'car', T0 - 100), ev(2, 'patio', 'person', T0 - 50),
    ev(3, 'cochera', 'person', T0 - 1801), ev(4, 'ext_derecha', 'car', T0 - 1800),
  ], T0);
  assert.deepEqual(a, { patio: { label: 'person', startTime: T0 - 50 }, ext_derecha: { label: 'car', startTime: T0 - 1800 } });
});

test('newAlerts: una persona nueva alerta; un coche nunca', () => {
  const r = newAlerts(emptyAlertState(), [ev(1, 'patio', 'car', T0), ev(2, 'patio', 'person', T0)], T0);
  assert.deepEqual(r.alerts, [{ camera: 'patio', label: 'person', startTime: T0, eventId: `${T0}.0-ev2` }]);
});

test('newAlerts: misma pasada no repite; el grupo exterior es uno', () => {
  let s = emptyAlertState();
  let r = newAlerts(s, [ev(1, 'ext_izquierda', 'person', T0)], T0);
  assert.equal(r.alerts.length, 1);
  r = newAlerts(r.state, [ev(1, 'ext_izquierda', 'person', T0), ev(2, 'ext_derecha', 'person', T0 + 120)], T0);
  assert.equal(r.alerts.length, 0, 'mismo grupo, menos de 5 min');
  r = newAlerts(r.state, [ev(3, 'patio', 'person', T0 + 130)], T0);
  assert.equal(r.alerts.length, 1, 'otro grupo sí alerta');
});

test('newAlerts: tras 5 min de calma se rearma', () => {
  let r = newAlerts(emptyAlertState(), [ev(1, 'patio', 'person', T0)], T0);
  r = newAlerts(r.state, [ev(2, 'patio', 'person', T0 + 299)], T0);
  assert.equal(r.alerts.length, 0);
  r = newAlerts(r.state, [ev(3, 'patio', 'person', T0 + 299 + 300)], T0);
  assert.equal(r.alerts.length, 1);
});

test('newAlerts: lo anterior al arranque (más de 60 s) no se anuncia pero sí cuenta para la pasada', () => {
  let r = newAlerts(emptyAlertState(), [ev(1, 'patio', 'person', T0 - 61)], T0);
  assert.equal(r.alerts.length, 0);
  r = newAlerts(r.state, [ev(2, 'patio', 'person', T0 + 30)], T0);
  assert.equal(r.alerts.length, 0, 'sigue la misma pasada');
  assert.equal(newAlerts(emptyAlertState(), [ev(3, 'patio', 'person', T0 - 59)], T0).alerts.length, 1);
});

test('newAlerts: no muta el estado recibido', () => {
  const s = emptyAlertState();
  newAlerts(s, [ev(1, 'patio', 'person', T0)], T0);
  assert.deepEqual(s, emptyAlertState());
});

test('validEvents: fuera cámaras desconocidas, ids raros y start_time no numérico', () => {
  const ok = ev(1, 'patio', 'person', T0);
  const out = validEvents([ok, ev(2, 'sala', 'person', T0), { ...ok, id: '../x' }, { ...ok, id: `${T0}.0-ev9`, start_time: 'x' }, null, 'basura'], new Set(['patio']));
  assert.deepEqual(out, [ok]);
  assert.deepEqual(validEvents({ error: 'x' }, new Set(['patio'])), []);
});

test('screensWantingCameras / alertScreenIds', () => {
  const c = defaultConfig();
  const k = defaultScreenProfile({ id: 's_k', slug: 'k', name: 'K' });
  k.screen.cameras = { personAlerts: false };
  k.widgets = [{ widgetId: 'w_cams01', place: 'side', corner: 'br', size: 'l' }];
  const off = defaultScreenProfile({ id: 's_off', slug: 'off', name: 'Off' });
  off.screen.cameras = { personAlerts: false };
  c.screens.push(k, off);
  c.widgets = [{ id: 'w_cams01', type: 'cameras', name: 'Cámaras', options: { url: '', refreshSec: 0, fit: 'contain', bust: false } }];
  assert.deepEqual([...screensWantingCameras(c)].sort(), [c.screens[0].id, 's_k'].sort());
  assert.deepEqual(alertScreenIds(c), [c.screens[0].id]);
});
