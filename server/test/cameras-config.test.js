// Cámaras Frigate (fork fsrhome): defaults, validación y forma del widget en la config de la pantalla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, defaultScreenProfile, WIDGET_TYPES } from '../core/defaults.js';
import { validateConfig, mergeDefaults } from '../core/validate.js';
import { displayWidgets } from '../core/screens.js';

const base = () => {
  const c = defaultConfig();
  c.calendar.sources = [];
  return c;
};

test('defaults: frigate apagado con las 4 cámaras y alertas de persona encendidas', () => {
  const c = defaultConfig();
  assert.equal(c.frigate.enabled, false);
  assert.equal(c.frigate.url, 'http://frigate:5000');
  assert.equal(c.frigate.go2rtcUrl, 'http://frigate:1984');
  assert.deepEqual(c.frigate.cameras.map((x) => x.id), ['patio', 'ext_izquierda', 'cochera', 'ext_derecha']);
  assert.deepEqual(c.frigate.zones, ['pipol', 'pipol2', 'Entrada', 'mi-patio']);
  assert.deepEqual(defaultScreenProfile().screen.cameras, { personAlerts: true });
  assert.ok(WIDGET_TYPES.includes('cameras'));
});

test('validate: frigate válido pasa y se conserva', () => {
  const c = base();
  c.frigate = { enabled: true, url: 'http://frigate:5000/', go2rtcUrl: 'http://frigate:1984', cameras: [{ id: 'patio', name: 'Patio' }], zones: ['Entrada'] };
  const r = validateConfig(c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.frigate, { enabled: true, url: 'http://frigate:5000', go2rtcUrl: 'http://frigate:1984', cameras: [{ id: 'patio', name: 'Patio' }], zones: ['Entrada'] });
});

test('validate: id de cámara, zona o URL inválidos dan error y no pasan', () => {
  const c = base();
  c.frigate = { enabled: true, url: 'ftp://x', go2rtcUrl: 'http://frigate:1984', cameras: [{ id: '../streams', name: 'x' }, { id: 'patio', name: 'P' }, { id: 'patio', name: 'dup' }], zones: ['a b', 'ok'] };
  const r = validateConfig(c);
  assert.equal(r.ok, false);
  const paths = r.errors.map((e) => e.path);
  assert.ok(paths.includes('frigate.url'));
  assert.ok(paths.some((p) => p.startsWith('frigate.cameras[0]')));
  assert.ok(paths.some((p) => p.startsWith('frigate.cameras[2]')));
  assert.ok(paths.includes('frigate.zones'));
  assert.deepEqual(r.value.frigate.cameras, [{ id: 'patio', name: 'P' }]);
  assert.deepEqual(r.value.frigate.zones, ['ok']);
});

test('validate: más de 8 cámaras es error', () => {
  const c = base();
  c.frigate = { ...defaultConfig().frigate, cameras: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `C${i}` })) };
  assert.equal(validateConfig(c).ok, false);
});

test('validate: screen.cameras.personAlerts booleano', () => {
  const c = base();
  c.screens[0].screen.cameras = { personAlerts: 'sí' };
  const r = validateConfig(c);
  assert.ok(r.errors.some((e) => e.path.endsWith('screen.cameras.personAlerts')));
  assert.equal(r.value.screens[0].screen.cameras.personAlerts, true);
});

test('config vieja sin frigate ni screen.cameras recibe los defaults', () => {
  const stored = base();
  delete stored.frigate;
  delete stored.screens[0].screen.cameras;
  const m = mergeDefaults(stored);
  assert.equal(m.frigate.enabled, false);
  assert.equal(m.screens[0].screen.cameras.personAlerts, true);
});

test('widget cameras: valida sin URL y la pantalla recibe la lista de cámaras', () => {
  const c = base();
  c.frigate = { ...defaultConfig().frigate, enabled: true };
  c.widgets = [{ id: 'w_cams01', type: 'cameras', name: 'Cámaras', options: { url: 'http://ignored' } }];
  c.screens[0].widgets = [{ widgetId: 'w_cams01', place: 'side', corner: 'br', size: 'l' }];
  const r = validateConfig(c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.widgets[0].options, { url: '', refreshSec: 0, fit: 'contain', bust: false });
  const dw = displayWidgets(r.value, r.value.screens[0]);
  assert.equal(dw.length, 1);
  assert.equal(dw[0].type, 'cameras');
  assert.equal(dw[0].place, 'side');
  assert.deepEqual(dw[0].cameras.map((x) => x.id), ['patio', 'ext_izquierda', 'cochera', 'ext_derecha']);
  assert.equal(dw[0].src, '');
});

test('widget cameras con frigate apagado: la pantalla no lo recibe', () => {
  const c = base();
  c.widgets = [{ id: 'w_cams01', type: 'cameras', name: 'Cámaras', options: {} }];
  c.screens[0].widgets = [{ widgetId: 'w_cams01', place: 'side', corner: 'br', size: 'l' }];
  const r = validateConfig(c);
  assert.deepEqual(displayWidgets(r.value, r.value.screens[0]), []);
});
