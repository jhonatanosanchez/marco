// Tarjeta Homelab (fork fsrhome): rutas de la pantalla — resumen, detalle y silencio, con identidad de pantalla.
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
import { _resetHomelab } from '../homelab.js';
import { fakeEstadoHomelab } from './fakeEstadoHomelab.js';

const realFetch = globalThis.fetch;
const W = () => ({
  veredicto: { texto: 'Una cosa necesita tu atención', estado: 'aviso' },
  alertas: [{ severidad: 'aviso', titulo: 'Swap al 100 %', dominio: 'Homelab', abiertaEn: null, clave: 'swap' }],
  silenciadas: [{ clave: 'kuma:58', titulo: 'Bot', hasta: 'arreglo' }],
  sistema: { cpu: 40, ramPct: 60, swapPct: 100, discoPct: 57, estado: 'ok' }, isp: { estado: 'ok', pingMs: 10, perdidaPct: 0 },
  noche: [], red: { adguard: 'ok' }, secreto: 'no-debe-salir',
});

async function withApp(fn, { mutate } = {}) {
  const fake = await fakeEstadoHomelab({ widget: W() });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-homelab-'));
  const saved = { url: process.env.HOMELAB_URL, silence: process.env.HOMELAB_SILENCE_URL };
  process.env.HOMELAB_URL = fake.url;
  process.env.HOMELAB_SILENCE_URL = `${fake.url}/api/silencios`;
  globalThis.fetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'private';
  c.cards = { items: [
    { id: 'k_homelab', type: 'homelab', name: 'Homelab', enabled: true, options: { homelab: { everyMin: 10, zones: ['pipol'] } } },
    { id: 'k_ajena', type: 'homelab', name: 'Otra', enabled: true, options: { homelab: { everyMin: 10, zones: ['pipol'] } } },
    { id: 'k_dinero', type: 'money', name: 'Dinero', enabled: true, options: { money: {} } },
  ] };
  c.screens[0].screen.cards = { items: ['k_homelab', 'k_dinero'], everyMin: 20, showSec: 30, corner: 'br' };
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
  _resetHomelab();
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
    if (saved.url === undefined) delete process.env.HOMELAB_URL; else process.env.HOMELAB_URL = saved.url;
    if (saved.silence === undefined) delete process.env.HOMELAB_SILENCE_URL; else process.env.HOMELAB_SILENCE_URL = saved.silence;
  }
}

test('GET resumen: estado, firma y alertas; nada fuera de la lista cerrada; ajena 404; sin credencial 401', async () => {
  await withApp(async ({ k, call }) => {
    const r = await call('GET', '/api/display/cards/k_homelab', { key: k });
    assert.equal(r.status, 200, r.raw);
    assert.equal(r.json.estado, 'aviso');
    assert.match(r.json.firma, /\|aviso\|swap$/);
    assert.deepEqual(r.json.alertas.map((a) => a.clave), ['swap']);
    assert.doesNotMatch(r.raw, /no-debe-salir|127\.0\.0\.1/);
    assert.equal((await call('GET', '/api/display/cards/k_homelab')).status, 401);
    assert.equal((await call('GET', '/api/display/cards/k_ajena', { key: k })).status, 404);
  });
});

test('GET detalle: { ok, at, data } con silenciadas; estado-homelab caído sin copia → { ok: false } y resumen mudo', async () => {
  await withApp(async ({ k, call, fake }) => {
    const d = await call('GET', '/api/display/cards/k_homelab/detail', { key: k });
    assert.equal(d.status, 200, d.raw);
    assert.equal(d.json.ok, true);
    assert.equal(d.json.data.silenciadas[0].clave, 'kuma:58');
    assert.equal('secreto' in d.json.data, false);
    _resetHomelab();
    fake.state.down = true;
    assert.deepEqual((await call('GET', '/api/display/cards/k_homelab/detail', { key: k })).json, { ok: false });
    assert.equal((await call('GET', '/api/display/cards/k_homelab', { key: k })).json.estado, 'mudo');
    // Dinero sigue sin detalle
    assert.equal((await call('GET', '/api/display/cards/k_dinero/detail', { key: k })).status, 404);
  });
});

test('POST silence: reenvía y responde ok; valida tipo, pantalla, hasta, clave y tamaño', async () => {
  await withApp(async ({ k, call, fake }) => {
    const ok = await call('POST', '/api/display/cards/k_homelab/silence', { key: k, body: { clave: 'swap', hasta: '7d' } });
    assert.equal(ok.status, 200, ok.raw);
    assert.deepEqual(ok.json, { ok: true });
    assert.deepEqual(JSON.parse(fake.bodies.at(-1).body), { clave: 'swap', hasta: '7d' });
    // estado-homelab guarda quién silenció (X-Perfil): marco/<slug de la pantalla>
    assert.match(fake.bodies.at(-1).perfil, /^marco\/[a-z0-9-]+$/);
    // una ya silenciada se puede reactivar (está en `silenciadas`, no en `alertas`)
    assert.equal((await call('POST', '/api/display/cards/k_homelab/silence', { key: k, body: { clave: 'kuma:58', hasta: null } })).status, 200);
    const sent = fake.bodies.length;
    for (const body of [{ clave: 'swap', hasta: '30d' }, { clave: 'swap' }, { clave: '', hasta: '1d' }, { clave: 'no-existe', hasta: '1d' }, { clave: 'x'.repeat(121), hasta: '1d' }]) {
      assert.equal((await call('POST', '/api/display/cards/k_homelab/silence', { key: k, body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await call('POST', '/api/display/cards/k_homelab/silence', { key: k, body: JSON.stringify({ clave: 'swap', hasta: '1d', pad: 'x'.repeat(3000) }) })).status, 413);
    assert.equal((await call('POST', '/api/display/cards/k_homelab/silence', { key: k, body: 'clave=swap', type: 'application/x-www-form-urlencoded' })).status, 400);
    assert.equal((await call('POST', '/api/display/cards/k_dinero/silence', { key: k, body: { clave: 'swap', hasta: '1d' } })).status, 404);
    assert.equal((await call('POST', '/api/display/cards/k_ajena/silence', { key: k, body: { clave: 'swap', hasta: '1d' } })).status, 404);
    assert.equal((await call('POST', '/api/display/cards/k_homelab/silence', { body: { clave: 'swap', hasta: '1d' } })).status, 401);
    assert.equal(fake.bodies.length, sent); // nada de lo rechazado llegó a estado-homelab
  });
});

test('POST silence: estado-homelab rechaza → 400; caído → 502', async () => {
  await withApp(async ({ k, call, fake }) => {
    await call('GET', '/api/display/cards/k_homelab', { key: k }); // llena la copia
    fake.state.silenceStatus = 400;
    assert.equal((await call('POST', '/api/display/cards/k_homelab/silence', { key: k, body: { clave: 'swap', hasta: '1d' } })).status, 400);
    fake.state.silenceStatus = 503;
    assert.equal((await call('POST', '/api/display/cards/k_homelab/silence', { key: k, body: { clave: 'swap', hasta: '1d' } })).status, 502);
  });
});

test('modo privado: 404 en las tres rutas y estado-homelab no recibe nada', async () => {
  await withApp(async ({ k, call, fake }) => {
    assert.equal((await call('GET', '/api/display/cards/k_homelab', { key: k })).status, 404);
    assert.equal((await call('GET', '/api/display/cards/k_homelab/detail', { key: k })).status, 404);
    assert.equal((await call('POST', '/api/display/cards/k_homelab/silence', { key: k, body: { clave: 'swap', hasta: '1d' } })).status, 404);
    assert.equal(fake.hits.length, 0);
  }, { mutate: (c) => { c.screens[0].privacy = { hidePhotos: false, showLock: true, schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:59' }] }; } });
});
