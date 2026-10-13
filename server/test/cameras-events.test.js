// Ciclo de eventos de las cámaras (fork fsrhome): actividad y alertas por el canal en vivo, rutas de pantalla y admin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../store.js';
import { defaultConfig } from '../core/defaults.js';
import { hashPassword, ensurePassword } from '../auth.js';
import { createApp } from '../app.js';
import { closeAll } from '../sse.js';
import { _resetDisplays, setServerVersion } from '../displays.js';
import { _resetPrivacy } from '../privacy.js';
import { syncDisplayKeys, displayKeyFor } from '../displayAccess.js';
import { readSince, currentCursor, _resetPoll } from '../pollHub.js';
import { tickCameras, _resetCameras, camerasStatus } from '../frigate.js';
import { fakeFrigate } from './fakeFrigate.js';

const realFetch = globalThis.fetch;

async function withApp(fn, { enabled = true, mutate } = {}) {
  const fake = await fakeFrigate();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-camev-'));
  globalThis.fetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'private';
  c.frigate = { ...c.frigate, enabled, url: fake.url, go2rtcUrl: fake.url };
  mutate?.(c);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ passwordHash: await hashPassword('secret-pass-123'), passwordIsDefault: false }));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'admin'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>display</title>');
  fs.writeFileSync(path.join(dist, 'admin', 'index.html'), '<!doctype html><title>admin</title>');
  store.initStore(dir);
  _resetDisplays();
  _resetPrivacy();
  syncDisplayKeys();
  setServerVersion('0.6.1');
  await ensurePassword();
  const app = createApp({ version: '0.6.1', dist });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const k = displayKeyFor(c.screens[0].id);
  const call = async (method, url, { body, cookie = '', key = '' } = {}) => {
    const r = await realFetch(base + url, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(key ? { 'x-marco-key': key } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    try { json = JSON.parse(buf.toString('utf8')); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const login = async () => {
    const r = await realFetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret-pass-123' }) });
    assert.equal(r.status, 200);
    return (r.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
  };
  try {
    await fn({ base, k, fake, call, login, screenId: c.screens[0].id });
  } finally {
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await fake.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
  }
}

const NOW = Date.UTC(2026, 9, 13, 23, 0, 0);
const S = NOW / 1000;
const ev = (n, camera, label, start) => ({ id: `${start}.0-ev${n}`, camera, label, start_time: start, zones: ['Entrada'] });
/** comandos que una pantalla de `screenId` recibiría por sondeo desde `cursor` */
const commandsFor = (cursor, screenId) => readSince(cursor, { clientId: 'd_test0001', screenId, anonymous: false }, () => null, NOW).commands;

test('una persona nueva publica actividad y alerta con el nombre de la cámara', () => withApp(async ({ fake, screenId }) => {
  _resetPoll(); _resetCameras(NOW - 10_000);
  const cur = currentCursor();
  fake.state.events = [ev(1, 'patio', 'person', S - 5)];
  await tickCameras(NOW, { force: true });
  const cmds = commandsFor(cur, screenId);
  const act = cmds.find((c) => c.type === 'cameras');
  assert.deepEqual(act.activity, { patio: { label: 'person', startTime: S - 5 } });
  const { type, ...al } = cmds.find((c) => c.type === 'cameraAlert');
  assert.equal(type, 'cameraAlert');
  assert.deepEqual(al, { camera: 'patio', name: 'Patio', label: 'person', startTime: S - 5, eventId: `${S - 5}.0-ev1` });
  assert.ok(fake.hits.some((h) => h.includes('/api/events?') && h.includes('labels=person%2Ccar') && h.includes('zones=pipol%2Cpipol2%2CEntrada%2Cmi-patio')));
}));

test('la misma actividad no se vuelve a publicar; un coche no alerta', () => withApp(async ({ fake, screenId }) => {
  _resetPoll(); _resetCameras(NOW - 10_000);
  fake.state.events = [ev(1, 'cochera', 'car', S - 5)];
  await tickCameras(NOW, { force: true });
  const cur = currentCursor();
  await tickCameras(NOW + 5000, { force: true });
  assert.deepEqual(commandsFor(cur, screenId), []);
}));

test('pantalla con personAlerts apagado no recibe la alerta', () => withApp(async ({ fake, screenId }) => {
  _resetPoll(); _resetCameras(NOW - 10_000);
  const cur = currentCursor();
  fake.state.events = [ev(1, 'patio', 'person', S - 5)];
  await tickCameras(NOW, { force: true });
  assert.ok(commandsFor(cur, screenId).some((c) => c.type === 'cameras'));
  assert.ok(!commandsFor(cur, screenId).some((c) => c.type === 'cameraAlert'));
}, { mutate: (c) => { c.screens[0].screen.cameras = { personAlerts: false }; } }));

test('basura de Frigate se ignora y el ciclo sigue', () => withApp(async ({ fake, screenId }) => {
  _resetPoll(); _resetCameras(NOW - 10_000);
  const cur = currentCursor();
  fake.state.events = [null, 'x', { id: '../x', camera: 'patio', label: 'person', start_time: S }, ev(2, 'sala', 'person', S), { ...ev(3, 'patio', 'person', S), start_time: 'ya' }];
  await tickCameras(NOW, { force: true });
  assert.deepEqual(commandsFor(cur, screenId).filter((c) => c.type === 'cameraAlert'), []);
  assert.equal(camerasStatus().lastError, null);
}));

test('Frigate caído: sin alertas, conserva la actividad y lo marca', () => withApp(async ({ fake, screenId }) => {
  _resetPoll(); _resetCameras(NOW - 10_000);
  fake.state.events = [ev(1, 'patio', 'car', S - 5)];
  await tickCameras(NOW, { force: true });
  fake.state.down = true;
  const cur = currentCursor();
  await tickCameras(NOW + 5000, { force: true });
  assert.deepEqual(commandsFor(cur, screenId), []);
  assert.equal(camerasStatus().lastError, 'unreachable');
}));

test('sin pantallas conectadas no consulta a Frigate', () => withApp(async ({ fake }) => {
  _resetCameras(NOW - 10_000);
  await tickCameras(NOW);
  assert.equal(fake.hits.filter((h) => h.includes('/api/events')).length, 0);
}));

test('GET /api/display/cameras da la actividad actual a la pantalla', () => withApp(async ({ fake, call, k }) => {
  _resetCameras(NOW - 10_000);
  fake.state.events = [ev(1, 'patio', 'person', S - 5)];
  await tickCameras(NOW, { force: true });
  const r = await call('GET', '/api/display/cameras', { key: k });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.activity, { patio: { label: 'person', startTime: S - 5 } });
  assert.equal((await call('GET', '/api/display/cameras')).status, 401);
}));

test('admin: estado y probar alerta', () => withApp(async ({ call, login, screenId }) => {
  _resetPoll(); _resetCameras(NOW - 10_000);
  const cookie = await login();
  const st = await call('GET', '/api/admin/cameras/status', { cookie });
  assert.equal(st.status, 200);
  assert.equal(st.json.enabled, true);
  const cur = currentCursor();
  const bad = await call('POST', '/api/admin/cameras/test-alert', { cookie, body: { camera: 'sala' } });
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/api/admin/cameras/test-alert', { cookie, body: { camera: 'patio' } });
  assert.equal(ok.status, 200);
  const al = commandsFor(cur, screenId).find((c) => c.type === 'cameraAlert');
  assert.equal(al.camera, 'patio');
  assert.equal(al.eventId, null);
  assert.equal(al.test, true);
  assert.equal((await call('GET', '/api/admin/cameras/status')).status, 401);
}));
