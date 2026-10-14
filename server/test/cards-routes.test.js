// Tarjetas (fork fsrhome): copia de las fuentes, rutas de pantalla y "Mostrar ahora".
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
import { cachedJson, _resetCards } from '../cards.js';
import { fakeTraining } from './fakeTraining.js';

const realFetch = globalThis.fetch;
const nowIso = () => new Date(Date.now() - 60_000).toISOString();
const ACTS = () => [{ time: nowIso(), type: 'running', name: 'Colima - S4 - Rodaje', distanceM: 8000, movingSec: 2700 }];

async function withApp(fn, { down = false, mutate } = {}) {
  const fake = await fakeTraining({ activities: ACTS() });
  fake.state.down = down;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-cards-'));
  globalThis.fetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'private';
  const training = { source: 'coach', garminUrl: fake.url, coachUrl: fake.url };
  c.cards = { items: [
    { id: 'k_mia', type: 'training', name: 'Entreno', enabled: true, options: { training } },
    { id: 'k_ajena', type: 'training', name: 'Otra', enabled: true, options: { training } },
    { id: 'k_apagada', type: 'training', name: 'Apagada', enabled: false, options: { training } },
  ] };
  c.screens[0].screen.cards = { items: ['k_mia', 'k_apagada'], everyMin: 20, showSec: 30, corner: 'br' };
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
  _resetPoll?.();
  _resetCards();
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
    let json = null;
    try { json = await r.json(); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const login = async () => {
    const r = await realFetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret-pass-123' }) });
    assert.equal(r.status, 200);
    return (r.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
  };
  try {
    await fn({ k, fake, call, login, screenId: c.screens[0].id });
  } finally {
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await fake.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
  }
}

test('cachedJson: copia de 30 min; fuente caída usa la última buena con su antigüedad; sin copia = null', async () => {
  const fake = await fakeTraining({ activities: [{ a: 1 }] });
  globalThis.fetch = realFetch;
  _resetCards();
  try {
    const t0 = Date.now();
    const u = `${fake.url}/api/activities?limit=20`;
    assert.deepEqual(await cachedJson(u, t0), { data: [{ a: 1 }], ageMin: 0 });
    fake.state.down = true;
    assert.deepEqual(await cachedJson(u, t0 + 5 * 60_000), { data: [{ a: 1 }], ageMin: 0 }); // todavía fresca: ni pregunta
    assert.equal(fake.hits.length, 1);
    assert.deepEqual(await cachedJson(u, t0 + 31 * 60_000), { data: [{ a: 1 }], ageMin: 31 });
    assert.deepEqual(await cachedJson(`${fake.url}/api/health-metrics`, t0), { data: null, ageMin: null });
  } finally {
    await fake.stop();
  }
});

test('GET /api/display/cards/<id>: resumen con la credencial de la pantalla; 401 sin ella; 404 ajena o apagada', async () => {
  await withApp(async ({ k, call, fake }) => {
    const r = await call('GET', '/api/display/cards/k_mia', { key: k });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.source, 'coach');
    assert.equal(r.json.garminOk, true);
    assert.equal(r.json.last.name, 'Rodaje');
    assert.doesNotMatch(JSON.stringify(r.json), /127\.0\.0\.1/);
    assert.ok(fake.hits.every((h) => /^GET \/(plan|api\/(activities\?limit=20|health-metrics|adherence))$/.test(h)), fake.hits.join('\n'));
    assert.equal((await call('GET', '/api/display/cards/k_mia')).status, 401);
    assert.equal((await call('GET', '/api/display/cards/k_ajena', { key: k })).status, 404);
    assert.equal((await call('GET', '/api/display/cards/k_apagada', { key: k })).status, 404);
    assert.equal((await call('GET', '/api/display/cards/k_nada', { key: k })).status, 404);
  });
});

test('GET /api/display/cards/<id>/detail: semana de 7 días', async () => {
  await withApp(async ({ k, call }) => {
    const r = await call('GET', '/api/display/cards/k_mia/detail', { key: k });
    assert.equal(r.status, 200);
    assert.equal(r.json.days.length, 7);
    assert.ok(r.json.recovery7.days.length === 7);
  });
});

test('fuente caída sin copia: 200 con garminOk false y planOk false (nunca un valor inventado)', async () => {
  await withApp(async ({ k, call }) => {
    const r = await call('GET', '/api/display/cards/k_mia', { key: k });
    assert.equal(r.status, 200);
    assert.equal(r.json.garminOk, false);
    assert.equal(r.json.planOk, false);
    assert.equal(r.json.last, null);
  }, { down: true });
});

test('POST /api/admin/cards/<id>/show: evento cardShow solo a las pantallas que la tienen', async () => {
  await withApp(async ({ call, login, screenId }) => {
    assert.equal((await call('POST', '/api/admin/cards/k_mia/show', { body: {} })).status === 200, false);
    const cookie = await login();
    const cursor = currentCursor();
    const r = await call('POST', '/api/admin/cards/k_mia/show', { body: {}, cookie });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.ok, true);
    assert.equal(r.json.screens.length, 1);
    const cmds = readSince(cursor, { clientId: 'd_test0001', screenId, anonymous: false }, () => null, Date.now()).commands;
    assert.ok(cmds.some((x) => x.type === 'cardShow' && x.id === 'k_mia'));
    const other = await call('POST', '/api/admin/cards/k_ajena/show', { body: {}, cookie });
    assert.equal(other.json.screens.length, 0);
    assert.equal((await call('POST', '/api/admin/cards/k_apagada/show', { body: {}, cookie })).status, 404);
  });
});
