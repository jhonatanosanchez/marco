// El latido lleva el estado del modo Echo (fork fsrhome); el servidor lo sanea y nunca se cae con datos viejos o basura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHeartbeat, sanitizeEcho } from '../displays.js';

const base = { clientId: 'echo-test-0001', screen: '', screenId: 's_main', version: 't', build: 't' };

test('sanitizeEcho: estado válido pasa (fps redondeado)', () => {
  assert.deepEqual(
    sanitizeEcho({ fps: 47.6, keepAlive: 'on', fullscreen: true, open: true, liteByGuard: false }),
    { fps: 48, keepAlive: 'on', fullscreen: true, open: true, liteByGuard: false },
  );
});

test('sanitizeEcho: ausente o basura = null; campos raros se acotan', () => {
  assert.equal(sanitizeEcho(undefined), null);
  assert.equal(sanitizeEcho('x'), null);
  assert.equal(sanitizeEcho([1]), null);
  assert.deepEqual(
    sanitizeEcho({ fps: 9999, keepAlive: 'maybe', fullscreen: 'yes', open: 1, liteByGuard: null }),
    { fps: 240, keepAlive: 'off', fullscreen: false, open: false, liteByGuard: false },
  );
  assert.equal(sanitizeEcho({ fps: 'rápido' }).fps, null);
});

test('sanitizeHeartbeat: build viejo sin echo → echo null', () => {
  const r = sanitizeHeartbeat(base);
  assert.equal(r.ok, true);
  assert.equal(r.value.echo, null);
});

test('sanitizeHeartbeat: con echo lo conserva saneado', () => {
  const r = sanitizeHeartbeat({ ...base, echo: { fps: 30, keepAlive: 'on', fullscreen: false, open: true, liteByGuard: true } });
  assert.deepEqual(r.value.echo, { fps: 30, keepAlive: 'on', fullscreen: false, open: true, liteByGuard: true });
});
