// Modo Echo Show por pantalla (screen.echo): defaults apagados, validación como nightMode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../core/validate.js';
import { defaultConfig, defaultScreenProfile } from '../core/defaults.js';

const ECHO_DEFAULT = { enabled: false, keepAlive: 'mp3', openFrom: '05:00', openTo: '16:00', fullscreenOnTap: true, fpsGuard: true };

test('echo: el perfil por defecto lo trae apagado', () => {
  assert.deepEqual(defaultScreenProfile().screen.echo, ECHO_DEFAULT);
  const { ok, value } = validateConfig(defaultConfig());
  assert.equal(ok, true);
  assert.deepEqual(value.screens[0].screen.echo, ECHO_DEFAULT);
});

test('echo: una config sin echo (Marco original) toma los defaults sin errores', () => {
  const c = defaultConfig();
  delete c.screens[0].screen.echo;
  const { ok, errors, value } = validateConfig(c);
  assert.equal(ok, true, JSON.stringify(errors));
  assert.deepEqual(value.screens[0].screen.echo, ECHO_DEFAULT);
});

test('echo: valores válidos se conservan', () => {
  const c = defaultConfig();
  c.screens[0].screen.echo = { enabled: true, keepAlive: 'off', openFrom: '22:00', openTo: '06:30', fullscreenOnTap: false, fpsGuard: false };
  const { ok, value } = validateConfig(c);
  assert.equal(ok, true);
  assert.deepEqual(value.screens[0].screen.echo, c.screens[0].screen.echo);
});

test('echo: valores inválidos se reportan con su ruta y caen al default', () => {
  const c = defaultConfig();
  c.screens[0].screen.echo = { enabled: 'sí', keepAlive: 'video', openFrom: '25:00', openTo: '7', fullscreenOnTap: 1, fpsGuard: null };
  const { ok, errors, value } = validateConfig(c);
  assert.equal(ok, false);
  const paths = errors.map((e) => e.path);
  for (const k of ['enabled', 'keepAlive', 'openFrom', 'openTo', 'fullscreenOnTap', 'fpsGuard']) {
    assert.ok(paths.some((p) => p.endsWith(`screen.echo.${k}`)), `falta error de ${k}: ${paths.join(', ')}`);
  }
  assert.deepEqual(value.screens[0].screen.echo, ECHO_DEFAULT);
});

test('echo: claves desconocidas se descartan', () => {
  const c = defaultConfig();
  c.screens[0].screen.echo = { ...ECHO_DEFAULT, video: true };
  assert.deepEqual(validateConfig(c).value.screens[0].screen.echo, ECHO_DEFAULT);
});
