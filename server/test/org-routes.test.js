// Tarjeta Organización (fork fsrhome): rutas de la pantalla — resumen, detalle y aprobar, con identidad de pantalla.
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
import { _resetPoll } from '../pollHub.js';
import { _resetCards } from '../cards.js';
import { _resetOrg } from '../org.js';
import { fakeOrganizacion } from './fakeOrganizacion.js';

const realFetch = globalThis.fetch;

async function withApp(fn, { mutate } = {}) {
  const fake = await fakeOrganizacion();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-homelab-'));
  const saved = { url: process.env.ORG_URL, token: process.env.MARCO_ORG_TOKEN };
  process.env.ORG_URL = fake.url;
  process.env.MARCO_ORG_TOKEN = fake.state.token;
  globalThis.fetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'private';
  c.cards = { items: [
    { id: 'k_org', type: 'org', name: 'Organización', enabled: true, options: { org: { everyMin: 30 } } },
    { id: 'k_ajena', type: 'org', name: 'Otra', enabled: true, options: { org: { everyMin: 30 } } },
  ] };
  c.screens[0].screen.cards = { items: ['k_org'], everyMin: 20, showSec: 30, corner: 'br' };
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
  _resetOrg();
  syncDisplayKeys();
  setServerVersion('0.6.1');
  await ensurePassword();
  const app = createApp({ version: '0.6.1', dist });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const k = displayKeyFor(c.screens[0].id);
  const call = async (method, url, { key = '', body, type = 'application/json' } = {}) => {
    const headers = { ...(key ? { 'x-marco-key': key } : {}), ...(body !== undefined ? { 'content-type': type } : {}) };
    const r = await realFetch(base + url, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const raw = await r.text();
    let json = null;
    try { json = JSON.parse(raw); } catch { /* not json */ }
    return { status: r.status, json, raw };
  };
  try {
    await fn({ k, fake, call });
  } finally {
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await fake.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
    if (saved.url === undefined) delete process.env.ORG_URL; else process.env.ORG_URL = saved.url;
    if (saved.token === undefined) delete process.env.MARCO_ORG_TOKEN; else process.env.MARCO_ORG_TOKEN = saved.token;
  }
}


const PEND = (o = {}) => ({ id: '#C1', lider: 'centi', emoji: '🛡️', severidad: 'alta', en: '2026-10-19T17:00:00.000Z', resumen: 'Rotar token', accion: 'Rotar', estado: 'pendiente', ...o });

test('GET resumen: alerta con la firma; ajena 404; sin credencial 401', async () => {
  await withApp(async ({ k, call, fake }) => {
    fake.state.resumen = { ahora: 'x', pendientes: [PEND()], altas24h: [] };
    const r = await call('GET', '/api/display/cards/k_org', { key: k });
    assert.equal(r.status, 200, r.raw);
    assert.equal(r.json.estado, 'alerta');
    assert.equal(r.json.firma, 'alerta|#C1|');
    assert.equal((await call('GET', '/api/display/cards/k_org')).status, 401);
    assert.equal((await call('GET', '/api/display/cards/k_ajena', { key: k })).status, 404);
  });
});

test('sin MARCO_ORG_TOKEN: mudo y ninguna petición sin cabecera', async () => {
  await withApp(async ({ k, call }) => {
    delete process.env.MARCO_ORG_TOKEN;
    _resetOrg();
    const r = await call('GET', '/api/display/cards/k_org', { key: k });
    assert.equal(r.json.estado, 'mudo');
  });
});

test('organizacion caída sin copia → mudo y detalle { ok: false }', async () => {
  await withApp(async ({ k, call, fake }) => {
    fake.state.down = true;
    assert.equal((await call('GET', '/api/display/cards/k_org', { key: k })).json.estado, 'mudo');
    assert.deepEqual((await call('GET', '/api/display/cards/k_org/detail', { key: k })).json, { ok: false });
  });
});

test('approve: reenvía el id; id no accionable 400; 4xx de arriba → 400 con texto; caída → 502; ajena 404', async () => {
  await withApp(async ({ k, call, fake }) => {
    fake.state.resumen = { ahora: 'x', pendientes: [PEND(), PEND({ id: '#A2', estado: 'aplicando' })], altas24h: [] };
    const ok = await call('POST', '/api/display/cards/k_org/approve', { key: k, body: { id: '#C1' } });
    assert.equal(ok.status, 200, ok.raw);
    assert.deepEqual(JSON.parse(fake.bodies[0]), { id: '#C1' });
    assert.equal((await call('POST', '/api/display/cards/k_org/approve', { key: k, body: { id: '#A2' } })).status, 400);
    assert.equal((await call('POST', '/api/display/cards/k_org/approve', { key: k, body: { id: 'x' } })).status, 400);
    fake.state.approveStatus = 409;
    const r409 = await call('POST', '/api/display/cards/k_org/approve', { key: k, body: { id: '#C1' } });
    assert.equal(r409.status, 400);
    assert.equal(r409.json.error, 'ya está aplicando');
    fake.state.approveStatus = 500;
    assert.equal((await call('POST', '/api/display/cards/k_org/approve', { key: k, body: { id: '#C1' } })).status, 502);
    assert.equal((await call('POST', '/api/display/cards/k_ajena/approve', { key: k, body: { id: '#C1' } })).status, 404);
  });
});

test('approve: cuerpo de más de 2 KB → 413', async () => {
  await withApp(async ({ k, call }) => {
    const r = await call('POST', '/api/display/cards/k_org/approve', { key: k, body: JSON.stringify({ id: '#C1', x: 'y'.repeat(3000) }) });
    assert.equal(r.status, 413);
  });
});
