// Tarjeta Dinero (fork fsrhome): copia de 5 min/≤30 min, token, ruta por tipo, privado y estado del admin.
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
import { loadMoney, moneyConfigured, _resetMoney } from '../money.js';
import { fakeGastos } from './fakeGastos.js';

const realFetch = globalThis.fetch;
const TOKEN = 'gastos-prueba';
const RESUMEN = () => ({
  generadoEn: new Date().toISOString(),
  quincena: { rango: '1–14 oct', diasRestantes: 3, diasTotales: 14, presupuesto: 1000000, gastado: 400000, queda: 600000, porDia: 200000 },
  ritmo: { estado: 'bien', pctQueda: 0.6, pctTiempo: 0.214 },
  categorias: [], proximos: [], ultimos: [],
  semana: [{ fecha: '2026-10-14', descripcion: 'Pan', persona: 'andrea' }],
});
const env = (fake, over = {}) => ({ GASTOS_URL: fake.url, GASTOS_ECHO_TOKEN: TOKEN, ...over });

test('loadMoney: manda el token; copia de 5 min; caída → copia ≤ 30 min; luego null', async () => {
  const fake = await fakeGastos({ resumen: RESUMEN() });
  globalThis.fetch = realFetch;
  _resetMoney();
  try {
    const t0 = Date.now();
    const a = await loadMoney(t0, env(fake));
    assert.equal(a.data.ritmo.estado, 'bien');
    assert.equal('semana' in a.data, false);
    assert.deepEqual(fake.tokens, [TOKEN]);
    await loadMoney(t0 + 4 * 60_000, env(fake));
    assert.equal(fake.hits.length, 1); // fresca: ni pregunta
    fake.state.down = true;
    assert.equal((await loadMoney(t0 + 20 * 60_000, env(fake))).at, t0); // caída: la copia de hace 20 min
    assert.equal(fake.hits.length, 2);
    assert.equal(await loadMoney(t0 + 31 * 60_000, env(fake)), null); // más de 30 min: sin datos
  } finally {
    await fake.stop();
  }
});

test('loadMoney: dos pedidos a la vez con la copia vencida → una sola petición', async () => {
  const fake = await fakeGastos({ resumen: RESUMEN() });
  _resetMoney();
  try {
    const t0 = Date.now();
    const [a, b] = await Promise.all([loadMoney(t0, env(fake)), loadMoney(t0, env(fake))]);
    assert.ok(a && b);
    assert.equal(fake.hits.length, 1);
  } finally {
    await fake.stop();
  }
});

test('loadMoney: sin token no llama; 401 o forma rara → null', async () => {
  const fake = await fakeGastos({ resumen: RESUMEN() });
  _resetMoney();
  try {
    assert.equal(moneyConfigured({}), false);
    assert.equal(moneyConfigured(env(fake)), true);
    assert.equal(await loadMoney(Date.now(), { GASTOS_URL: fake.url }), null);
    assert.equal(fake.hits.length, 0);
    assert.equal(await loadMoney(Date.now(), env(fake, { GASTOS_ECHO_TOKEN: 'otro' })), null);
    _resetMoney();
    fake.state.resumen = { ritmo: null };
    assert.equal(await loadMoney(Date.now(), env(fake)), null);
  } finally {
    await fake.stop();
  }
});

async function withApp(fn, { mutate, token = TOKEN } = {}) {
  const fake = await fakeGastos({ resumen: RESUMEN() });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-money-'));
  const saved = { url: process.env.GASTOS_URL, token: process.env.GASTOS_ECHO_TOKEN };
  process.env.GASTOS_URL = fake.url;
  if (token) process.env.GASTOS_ECHO_TOKEN = token; else delete process.env.GASTOS_ECHO_TOKEN;
  globalThis.fetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'private';
  c.cards = { items: [
    { id: 'k_dinero', type: 'money', name: 'Dinero', enabled: true, options: { money: {} } },
    { id: 'k_ajena', type: 'money', name: 'Otra', enabled: true, options: { money: {} } },
  ] };
  c.screens[0].screen.cards = { items: ['k_dinero'], everyMin: 20, showSec: 30, corner: 'br' };
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
  _resetMoney();
  syncDisplayKeys();
  setServerVersion('0.6.1');
  await ensurePassword();
  const app = createApp({ version: '0.6.1', dist });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const k = displayKeyFor(c.screens[0].id);
  const call = async (method, url, { cookie = '', key = '' } = {}) => {
    const r = await realFetch(base + url, { method, headers: { ...(cookie ? { cookie } : {}), ...(key ? { 'x-marco-key': key } : {}) } });
    const raw = await r.text();
    let json = null;
    try { json = JSON.parse(raw); } catch { /* not json */ }
    return { status: r.status, json, raw };
  };
  const login = async () => {
    const r = await realFetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret-pass-123' }) });
    assert.equal(r.status, 200);
    return (r.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ');
  };
  try {
    await fn({ k, fake, call, login });
  } finally {
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await fake.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
    if (saved.url === undefined) delete process.env.GASTOS_URL; else process.env.GASTOS_URL = saved.url;
    if (saved.token === undefined) delete process.env.GASTOS_ECHO_TOKEN; else process.env.GASTOS_ECHO_TOKEN = saved.token;
  }
}

test('GET /api/display/cards/<money>: { ok, at, data } sin semana ni token; ajena 404; sin credencial 401', async () => {
  await withApp(async ({ k, call }) => {
    const r = await call('GET', '/api/display/cards/k_dinero', { key: k });
    assert.equal(r.status, 200, r.raw);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.data.ritmo.estado, 'bien');
    assert.match(r.json.data.today, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal('semana' in r.json.data, false);
    assert.doesNotMatch(r.raw, new RegExp(TOKEN));
    assert.doesNotMatch(r.raw, /127\.0\.0\.1/);
    assert.equal((await call('GET', '/api/display/cards/k_dinero')).status, 401);
    assert.equal((await call('GET', '/api/display/cards/k_ajena', { key: k })).status, 404);
    assert.equal((await call('GET', '/api/display/cards/k_dinero/detail', { key: k })).status, 404);
  });
});

test('sin token en el servidor: 200 { ok: false } y gastos no recibe nada', async () => {
  await withApp(async ({ k, call, fake }) => {
    const r = await call('GET', '/api/display/cards/k_dinero', { key: k });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: false });
    assert.equal(fake.hits.length, 0);
  }, { token: '' });
});

test('modo privado: 404 y gastos no recibe nada', async () => {
  await withApp(async ({ k, call, fake }) => {
    assert.equal((await call('GET', '/api/display/cards/k_dinero', { key: k })).status, 404);
    assert.equal(fake.hits.length, 0);
  }, { mutate: (c) => { c.screens[0].privacy = { hidePhotos: false, showLock: true, schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:59' }] }; } });
});

test('GET /api/admin/cards/status: solo un booleano, nunca el token; requiere sesión', async () => {
  await withApp(async ({ call, login }) => {
    assert.notEqual((await call('GET', '/api/admin/cards/status')).status, 200);
    const r = await call('GET', '/api/admin/cards/status', { cookie: await login() });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { moneyToken: true });
    assert.doesNotMatch(r.raw, new RegExp(TOKEN));
  });
});

test('loadMoney: registra una vez cuando gastos empieza a fallar (solo el motivo) y cuando vuelve', async () => {
  const fake = await fakeGastos({ resumen: RESUMEN() });
  _resetMoney();
  const warns = [];
  const infos = [];
  const [w, i] = [console.warn, console.info];
  console.warn = (...a) => warns.push(a.join(' '));
  console.info = (...a) => infos.push(a.join(' '));
  try {
    const t0 = Date.now();
    await loadMoney(t0, env(fake, { GASTOS_ECHO_TOKEN: 'rotado' }));
    await loadMoney(t0 + 1000, env(fake, { GASTOS_ECHO_TOKEN: 'rotado' }));
    assert.equal(warns.length, 1, warns.join('\n'));
    assert.match(warns[0], /http 401/);
    assert.doesNotMatch(warns[0], /rotado|127\.0\.0\.1/);
    assert.ok(await loadMoney(t0 + 2000, env(fake)));
    assert.equal(infos.length, 1);
    fake.state.resumen = { ritmo: null };
    _resetMoney();
    await loadMoney(t0 + 3000, env(fake));
    assert.match(warns.at(-1), /forma inesperada/);
  } finally {
    console.warn = w;
    console.info = i;
    await fake.stop();
  }
});
