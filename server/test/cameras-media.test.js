// Intermediario de cámaras (fork fsrhome): lista blanca, credencial de pantalla y nunca /api/streams de go2rtc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import * as store from '../store.js';
import { defaultConfig } from '../core/defaults.js';
import { hashPassword, ensurePassword } from '../auth.js';
import { createApp } from '../app.js';
import { closeAll } from '../sse.js';
import { _resetDisplays, setServerVersion } from '../displays.js';
import { _resetPrivacy } from '../privacy.js';
import { syncDisplayKeys, displayKeyFor } from '../displayAccess.js';
import { fakeFrigate } from './fakeFrigate.js';

const realFetch = globalThis.fetch;

async function withApp(fn, { enabled = true } = {}) {
  const fake = await fakeFrigate();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-cams-'));
  globalThis.fetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'private';
  c.frigate = { ...c.frigate, enabled, url: fake.url, go2rtcUrl: fake.url };
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
  /** GET que lee solo los primeros bytes (los streams no terminan) y cierra. */
  const peek = (url, ms = 300) => new Promise((resolve, reject) => {
    const req = http.get(base + url, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      setTimeout(() => { req.destroy(); resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }); }, ms);
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
  try {
    await fn({ base, k, fake, peek });
  } finally {
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await fake.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
  }
}

test('MJPEG de una cámara conocida con la clave de la pantalla', () => withApp(async ({ k, fake, peek }) => {
  const r = await peek(`/media/cameras/patio.mjpeg?k=${k}`);
  assert.equal(r.status, 200);
  assert.match(r.type, /multipart\/x-mixed-replace/);
  assert.ok(r.body.length > 0);
  assert.ok(fake.hits.some((h) => h.startsWith('GET /api/patio?fps=4&h=360')));
}));

test('MP4 por go2rtc con User-Agent neutro, sin redirección a HLS', () => withApp(async ({ k, fake, peek }) => {
  const r = await peek(`/media/cameras/cochera.mp4?k=${k}`);
  assert.equal(r.status, 200);
  assert.match(r.type, /video\/mp4/);
  assert.ok(fake.hits.some((h) => h.startsWith('GET /api/stream.mp4?src=cochera') && h.endsWith('ua=marco-frigate')));
}));

test('foto del evento', () => withApp(async ({ k, fake, peek }) => {
  const r = await peek(`/media/cameras/events/1791934242.357483-ub8mqx/snapshot.jpg?k=${k}`);
  assert.equal(r.status, 200);
  assert.match(r.type, /image\/jpeg/);
  assert.ok(fake.hits.some((h) => h.startsWith('GET /api/events/1791934242.357483-ub8mqx/snapshot.jpg?bbox=1&h=480')));
}));

test('cámara desconocida, nombre raro o evento raro → 404 y Frigate no recibe nada', () => withApp(async ({ k, fake, peek }) => {
  for (const u of ['/media/cameras/sala.mjpeg', '/media/cameras/streams.mp4', '/media/cameras/patio.m3u8', '/media/cameras/..%2Fstreams.mp4', '/media/cameras/events/../../streams/snapshot.jpg', '/media/cameras/events/abc/snapshot.jpg']) {
    const r = await peek(`${u}${u.includes('?') ? '&' : '?'}k=${k}`);
    assert.equal(r.status, 404, u);
  }
  assert.equal(fake.hits.length, 0);
}));

test('sin credencial → 401; con frigate apagado → 404', async () => {
  await withApp(async ({ peek }) => {
    assert.equal((await peek('/media/cameras/patio.mjpeg')).status, 401);
  });
  await withApp(async ({ k, peek }) => {
    assert.equal((await peek(`/media/cameras/patio.mjpeg?k=${k}`)).status, 404);
  }, { enabled: false });
});

test('nunca se pide /api/streams de go2rtc', () => withApp(async ({ k, fake, peek }) => {
  await peek(`/media/cameras/patio.mjpeg?k=${k}`);
  await peek(`/media/cameras/patio.mp4?k=${k}`);
  assert.equal(fake.hits.filter((h) => h.includes('/api/streams')).length, 0);
}));

test('al cerrar el navegador se cierra la conexión hacia Frigate', () => withApp(async ({ k, fake, peek }) => {
  await peek(`/media/cameras/patio.mjpeg?k=${k}`, 200);
  for (let i = 0; i < 40 && fake.open() > 0; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(fake.open(), 0);
}));
