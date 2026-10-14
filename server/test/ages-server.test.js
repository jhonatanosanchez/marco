// "A esta edad" en el servidor (fork fsrhome): lista del día con Immich falso, copia, ruta e imágenes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../store.js';
import { defaultConfig, defaultScreenProfile } from '../core/defaults.js';
import * as immich from '../immich.js';
import { hashPassword, ensurePassword } from '../auth.js';
import { createApp } from '../app.js';
import { closeAll } from '../sse.js';
import { _resetDisplays, setServerVersion } from '../displays.js';
import { _resetPrivacy } from '../privacy.js';
import { syncDisplayKeys, displayKeyFor } from '../displayAccess.js';
import { agesList, _resetAges } from '../ages.js';
import { fakeImmich, asset, albumId } from './fakeImmich.js';

const realFetch = globalThis.fetch;
const ALBUM = albumId(7);
const NOW = Date.parse('2026-10-13T18:00:00Z'); // 13 oct, 12:00 en Colima → 6 años 3 meses
const at = (ymd) => `${ymd}T12:00:00.000Z`;

/** Una foto por tramo 2020..2026 (septiembre 25 de cada año) + extras para probar el puntaje y la paginación. */
function albumAssets() {
  const xs = [];
  // isFavorite: false explícito: el fake marca favoritas las de número par y el puntaje debe depender solo de la prueba
  for (let y = 2020; y <= 2026; y++) xs.push(asset(100 + y - 2020, { localDateTime: at(`${y}-09-25`), isFavorite: false, people: [{ name: 'Arantza' }, { name: 'Andrea' }] }));
  xs.push(asset(200, { localDateTime: at('2024-09-26'), isFavorite: false, people: [{ name: 'Arantza' }] })); // sola en 2024: gana
  return xs;
}

async function withApp(fn, { albums, down = false } = {}) {
  // sin `key`: el fake usa su llave de prueba por defecto (fake.state.key)
  const fake = await fakeImmich({ version: '3.3.0', albums: albums ?? [{ id: ALBUM, albumName: 'Arantza', assets: albumAssets() }] });
  fake.state.down = down;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-ages-'));
  globalThis.fetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'private';
  c.datetime.timezone = 'America/Mexico_City';
  c.immich = { enabled: true, url: fake.url, insecureTls: false };
  c.cards = { items: [{ id: 'k_edad', type: 'ages', name: 'A esta edad', enabled: true, options: { ages: { person: 'Arantza', birthDate: '2020-06-22', albumId: ALBUM, everyMin: 15 } } }] };
  c.screens[0].screen.cards = { items: ['k_edad'], everyMin: 20, showSec: 30, corner: 'br' };
  c.screens.push(defaultScreenProfile({ id: 's_kitchen', slug: 'kitchen', name: 'Kitchen' }));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ passwordHash: await hashPassword('secret-pass-123'), passwordIsDefault: false, immich: { apiKey: fake.state.key } }));
  fs.writeFileSync(path.join(dir, 'ages-marks.json'), JSON.stringify({ favorites: [], hidden: [asset(102).id] }));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'admin'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>display</title>');
  fs.writeFileSync(path.join(dist, 'admin', 'index.html'), '<!doctype html><title>admin</title>');
  store.initStore(dir);
  immich._reset();
  _resetAges();
  _resetDisplays();
  _resetPrivacy();
  syncDisplayKeys();
  setServerVersion('0.6.1');
  await ensurePassword();
  const app = createApp({ version: '0.6.1', dist });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (url, key) => {
    const r = await realFetch(base + url, { headers: key ? { 'x-marco-key': key } : {} });
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    try { json = JSON.parse(buf.toString('utf8')); } catch { /* binary */ }
    return { status: r.status, json };
  };
  try {
    await fn({ fake, call, k: displayKeyFor(c.screens[0].id), kitchenKey: displayKeyFor('s_kitchen'), card: c.cards.items[0] });
  } finally {
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await fake.stop();
    immich._reset();
    _resetAges();
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
  }
}

test('agesList: una foto por año, la sola gana, 🚫 fuera, una consulta por tramo y copia del día', async () => {
  await withApp(async ({ fake, card }) => {
    const l = await agesList(store.getConfig().cards.items[0], NOW);
    assert.equal(l.person, 'Arantza');
    assert.equal(l.months, 75);
    assert.deepEqual(l.photos.map((p) => p.year), ['2020', '2021', '2023', '2024', '2025', '2026']); // 2022 era 🚫 y no hay otra
    assert.equal(l.photos.find((p) => p.year === '2024').id, asset(200).id);
    assert.deepEqual(l.photos[0].months, 3);
    const searches = fake.count(/^\/api\/search\/metadata$/);
    assert.equal(searches, 7);
    await agesList(card, NOW + 60_000);
    assert.equal(fake.count(/^\/api\/search\/metadata$/), searches); // mismo día: copia
  });
});

test('agesList: más de 250 fotos en un tramo → pide la página siguiente', async () => {
  const many = Array.from({ length: 260 }, (_, i) => asset(1000 + i, { localDateTime: at('2025-09-23'), isFavorite: false }));
  const fav = asset(5000, { localDateTime: at('2025-09-24'), isFavorite: true });
  const xs = [...albumAssets().filter((a) => !a.localDateTime.startsWith('2025')), ...many, fav];
  await withApp(async ({ card }) => {
    const l = await agesList(card, NOW);
    assert.equal(l.photos.find((p) => p.year === '2025').id, fav.id);
  }, { albums: [{ id: ALBUM, albumName: 'Arantza', assets: xs }] });
});

test('agesList: con Immich caído no guarda nada; la siguiente vez reintenta', async () => {
  await withApp(async ({ fake, card }) => {
    await assert.rejects(agesList(card, NOW));
    fake.state.down = false;
    const l = await agesList(card, NOW);
    assert.ok(l.photos.length >= 2);
  }, { down: true });
});

test('ruta: la pantalla con la tarjeta recibe la lista; las imágenes solo a ella', async () => {
  await withApp(async ({ call, k, kitchenKey }) => {
    const r = await call('/api/display/cards/k_edad', k);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.photos.length >= 2);
    const id = r.json.photos[0].id;
    assert.equal((await call(`/media/immich/${id}?v=${r.json.photos[0].v}`, k)).status, 200);
    assert.equal((await call(`/media/immich/${id}`, kitchenKey)).status, 404);
    assert.equal((await call('/api/display/cards/k_edad', kitchenKey)).status, 404);
    assert.equal((await call('/api/display/cards/k_edad/detail', k)).status, 404);
  });
});
