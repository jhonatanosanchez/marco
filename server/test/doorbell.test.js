// Doorbell camera: hook validation and ring state (server/core/doorbellCore.js), config validation, and the real app
// (server/app.js createApp) with a fake Home Assistant on a random port: POST /api/hooks/doorbell, the admin test
// route, delivery over the poll channel, and the frame endpoint's access rules (no ring, wrong screen, invalid key,
// throttle, failures). The Home Assistant token must never reach a display.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import * as store from '../store.js';
import { defaultConfig, defaultScreenProfile } from '../core/defaults.js';
import { validateConfig } from '../core/validate.js';
import {
  sanitizeDoorbell, ring, dismiss, activeRing, targetScreens, ringPayload, clampSeconds, frameType, DOORBELL_MAX_SEC,
} from '../core/doorbellCore.js';
import { ensurePassword, hashPassword } from '../auth.js';
import { createApp } from '../app.js';
import { closeAll } from '../sse.js';
import { _resetDisplays, setServerVersion, resolveScreenList } from '../displays.js';
import { _resetAnnouncements } from '../announce.js';
import { _resetActivityThrottle, listActivity } from '../activity.js';
import { _resetPairing } from '../pairing.js';
import { syncDisplayKeys, listDisplayLinks, _resetDisplayAccess } from '../displayAccess.js';
import { _resetPoll } from '../pollHub.js';
import { createToken } from '../tokens.js';
import { _resetDoorbell, FRAME_CACHE_MS } from '../doorbell.js';

const HA_TOKEN = 'ha-secret-long-lived-token-0123456789';
// A tiny JPEG-looking body (the server checks the content type, never decodes the picture).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

const cfgLike = () => {
  const c = defaultConfig();
  c.screens.push(defaultScreenProfile({ id: 's_kitchen', slug: 'kitchen', name: 'Kitchen' }));
  return c;
};

// ------------------------------------------------------------------------------------------------ core

test('sanitizeDoorbell: defaults from the settings, clamping, overrides and errors', () => {
  const cfg = cfgLike();
  const resolve = (keys) => resolveScreenList(cfg, keys);
  const settings = { camera: 'camera.front_door', seconds: 45, screenIds: ['s_kitchen'], sound: true };
  let v = sanitizeDoorbell({}, settings, resolve);
  assert.deepEqual(v.value, { action: 'ring', seconds: 45, screenIds: ['s_kitchen'], screensGiven: false, camera: 'camera.front_door', sound: true });
  v = sanitizeDoorbell(undefined, settings, resolve);
  assert.equal(v.ok, true, 'an empty body rings with the settings');
  v = sanitizeDoorbell({ action: 'ring', seconds: 5000, screens: ['S_MAIN'], camera: 'camera.garden', sound: false }, settings, resolve);
  assert.deepEqual(v.value, { action: 'ring', seconds: DOORBELL_MAX_SEC, screenIds: ['s_main'], screensGiven: true, camera: 'camera.garden', sound: false });
  assert.equal(sanitizeDoorbell({ seconds: 1 }, settings, resolve).value.seconds, 10);
  assert.equal(sanitizeDoorbell({ action: 'dismiss' }, settings, resolve).value.screensGiven, false);

  const bad = sanitizeDoorbell({ action: 'open', seconds: 'soon', camera: 'sensor.door', sound: 'yes', screens: ['nowhere'] }, settings, resolve);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.details.map((d) => d.path).sort(), ['action', 'camera', 'screens', 'seconds', 'sound']);
  assert.match(bad.details.find((d) => d.path === 'screens').message, /unknown screen: nowhere/);
  for (const camera of ['camera.', 'camera.Front', 'camera.a/b', 'camera.x?y', 'light.x', 42]) {
    assert.equal(sanitizeDoorbell({ camera }, settings, resolve).ok, false, String(camera));
  }
  assert.equal(sanitizeDoorbell([], settings, resolve).ok, false);
  assert.equal(sanitizeDoorbell({ seconds: true }, settings, resolve).ok, false);
  assert.equal(clampSeconds('x'), 60);
});

test('ring state: a second ring extends (never shortens), dismiss ends, expiry, payload without camera', () => {
  const rings = {};
  let n = 0;
  const id = () => `d_${++n}`;
  const t0 = Date.parse('2026-10-11T10:00:00Z');
  const [a] = ring(rings, { screenIds: ['s_main'], seconds: 60, camera: 'camera.door', sound: true }, t0, id);
  assert.equal(a.id, 'd_1');
  assert.equal(a.expiresAt, '2026-10-11T10:01:00.000Z');
  // 20 s later, 10 s more: the later end time wins
  ring(rings, { screenIds: ['s_main'], seconds: 10, camera: 'camera.door', sound: true }, t0 + 20_000, id);
  assert.equal(rings.s_main.expiresAt, '2026-10-11T10:01:00.000Z', 'a shorter ring does not cut the current one');
  const [b] = ring(rings, { screenIds: ['s_main', 's_kitchen'], seconds: 120, camera: 'camera.side', sound: false }, t0 + 30_000, id);
  assert.equal(b.id, 'd_1', 'same ring');
  assert.equal(b.rings, 3);
  assert.equal(b.camera, 'camera.side');
  assert.equal(rings.s_main.expiresAt, '2026-10-11T10:02:30.000Z');
  assert.equal(rings.s_kitchen.id, 'd_2');
  assert.equal(activeRing(rings, 's_main', t0 + 151_000), null, 'over');
  const p = ringPayload(rings.s_kitchen);
  assert.deepEqual(Object.keys(p).sort(), ['expiresAt', 'frames', 'id', 'refreshMs', 'sound', 'startedAt', 'updatedAt']);
  assert.equal(JSON.stringify(p).includes('camera'), false);
  assert.equal(ringPayload({ ...rings.s_kitchen, camera: '' }).frames, false);
  assert.deepEqual(dismiss(rings, ['s_kitchen'], t0 + 31_000).map((r) => r.id), ['d_2']);
  assert.deepEqual(Object.keys(rings), ['s_main']);
  assert.deepEqual(dismiss(rings, [], t0 + 31_000).map((r) => r.id), ['d_1'], 'no screens = every ring');
  assert.deepEqual(rings, {});
  // an expired ring is replaced by a new one, not extended
  ring(rings, { screenIds: ['s_main'], seconds: 10, camera: '', sound: true }, t0, id);
  assert.equal(ring(rings, { screenIds: ['s_main'], seconds: 10, camera: '', sound: true }, t0 + 60_000, id)[0].id, 'd_4');
});

test('targetScreens and frameType', () => {
  const cfg = cfgLike();
  assert.deepEqual(targetScreens(cfg, []), ['s_main', 's_kitchen']);
  assert.deepEqual(targetScreens(cfg, ['s_kitchen', 's_gone']), ['s_kitchen']);
  assert.equal(frameType('image/jpeg; charset=binary'), 'image/jpeg');
  assert.equal(frameType('IMAGE/JPG'), 'image/jpeg');
  assert.equal(frameType('image/png'), 'image/png');
  assert.equal(frameType('text/html'), '');
  assert.equal(frameType('image/svg+xml'), '', 'no SVG (scripts)');
  assert.equal(frameType(undefined), '');
});

test('config: homeassistant.doorbell validation and deleted screens', () => {
  const c = cfgLike();
  let v = validateConfig(c);
  assert.equal(v.ok, true);
  assert.deepEqual(v.value.homeassistant.doorbell, { camera: '', seconds: 60, screenIds: [], sound: true });
  c.homeassistant.doorbell = { camera: 'camera.front_door', seconds: 120, screenIds: ['s_kitchen'], sound: false };
  v = validateConfig(c);
  assert.equal(v.ok, true);
  assert.deepEqual(v.value.homeassistant.doorbell, c.homeassistant.doorbell);
  for (const [k, bad] of [['camera', 'sensor.door'], ['seconds', 5], ['seconds', 301], ['sound', 'yes']]) {
    const x = cfgLike();
    x.homeassistant.doorbell = { ...c.homeassistant.doorbell, [k]: bad };
    const r = validateConfig(x);
    assert.equal(r.ok, false, `${k}=${bad}`);
    assert.ok(r.errors.some((e) => e.path === `homeassistant.doorbell.${k}`), k);
  }
  // the only chosen screen was deleted: the default screen, never "every screen"
  const gone = cfgLike();
  gone.homeassistant.doorbell = { camera: '', seconds: 60, screenIds: ['s_kitchen'], sound: true };
  gone.screens = gone.screens.filter((s) => s.id !== 's_kitchen');
  assert.deepEqual(validateConfig(gone).value.homeassistant.doorbell.screenIds, ['s_main']);
  // configs saved before the doorbell existed get the defaults
  const old = cfgLike();
  delete old.homeassistant.doorbell;
  assert.deepEqual(validateConfig(old).value.homeassistant.doorbell.seconds, 60);
});

// ------------------------------------------------------------------------------------------------ app

const realFetch = globalThis.fetch;
const offlineFetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));

/** Fake Home Assistant: GET /api/camera_proxy/<entity> with the bearer token answers JPEG. */
async function fakeHa() {
  const hits = [];
  const state = { mode: 'ok', delay: 0 };
  const server = http.createServer((req, res) => {
    hits.push({ url: req.url, auth: req.headers.authorization });
    const send = () => {
      if (req.headers.authorization !== `Bearer ${HA_TOKEN}`) { res.writeHead(401); return res.end('unauthorized'); }
      if (!req.url.startsWith('/api/camera_proxy/camera.')) { res.writeHead(404); return res.end(); }
      if (state.mode === 'down') { res.writeHead(500); return res.end('boom'); }
      if (state.mode === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<script>alert(1)</script>'); }
      if (state.mode === 'huge') { res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': String(5 * 1024 * 1024) }); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/jpeg', 'x-ha-secret': 'should-not-pass' });
      res.end(JPEG);
    };
    if (state.delay) setTimeout(send, state.delay); else send();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, hits, state, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

async function withServer(fn, { mode = 'private' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-doorbell-'));
  globalThis.fetch = offlineFetch;
  const ha = await fakeHa();
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = mode;
  c.screens.push(defaultScreenProfile({ id: 's_kitchen', slug: 'kitchen', name: 'Kitchen' }));
  c.homeassistant = { enabled: true, url: ha.url, doorbell: { camera: 'camera.front_door', seconds: 60, screenIds: [], sound: true } };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({
    passwordHash: await hashPassword('secret-pass-123'), passwordIsDefault: false, homeassistant: { token: HA_TOKEN },
  }));
  store.initStore(dir);
  _resetDisplays();
  _resetAnnouncements();
  _resetPairing();
  _resetActivityThrottle();
  _resetDisplayAccess();
  _resetPoll();
  _resetDoorbell();
  setServerVersion('0.5.0');
  await ensurePassword();
  syncDisplayKeys();
  const { token } = createToken('Home Assistant');
  const app = createApp({ version: '0.5.0', dist: path.join(dir, 'dist') });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { body, headers = {}, raw } = {}) => {
    const r = await realFetch(base + url, {
      method,
      headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    try { json = JSON.parse(buf.toString('utf8')); } catch { /* not json */ }
    return { status: r.status, json, buf, text: buf.toString('utf8'), headers: r.headers, setCookie: r.headers.getSetCookie?.() || [] };
  };
  const hook = (body, headers = {}) => call('POST', '/api/hooks/doorbell', { body, headers: { authorization: `Bearer ${token}`, ...headers } });
  const key = (slug) => listDisplayLinks().find((l) => l.slug === slug).key;
  const frame = (slug, n = 1) => call('GET', `/api/display/doorbell/frame?n=${n}`, { headers: slug ? { 'x-marco-key': key(slug) } : {} });
  const poll = async (slug, q = {}) => {
    const r = await call('GET', `/api/display/poll?${new URLSearchParams(q)}`, { headers: { 'x-marco-key': key(slug) } });
    assert.equal(r.status, 200, r.text);
    return r.json;
  };
  const login = async () => {
    const r = await call('POST', '/api/auth/login', { body: { password: 'secret-pass-123' } });
    assert.equal(r.status, 200);
    return r.setCookie.map((x) => x.split(';')[0]).join('; ');
  };
  try {
    await fn({ call, hook, frame, poll, key, ha, login, token });
  } finally {
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    await ha.close();
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
  }
}

const noToken = (r) => {
  const all = r.text + JSON.stringify([...r.headers.entries()]);
  assert.equal(all.includes(HA_TOKEN), false, 'the Home Assistant token never reaches a display');
  assert.equal(all.includes('should-not-pass'), false, 'Home Assistant headers are not passed through');
};

test('hook: auth, validation, ring, extend, dismiss, activity', async () => {
  await withServer(async ({ call, hook, token }) => {
    assert.equal((await call('POST', '/api/hooks/doorbell', { body: {} })).status, 401);
    assert.equal((await call('POST', '/api/hooks/doorbell', { raw: 'ring', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' } })).status, 415);
    let r = await hook({ action: 'knock' });
    assert.equal(r.status, 400);
    assert.equal(r.json.details[0].path, 'action');
    r = await hook({ camera: '../../api/states' });
    assert.equal(r.status, 400, 'only camera.* entity ids');
    r = await hook({ screens: ['attic'] });
    assert.equal(r.status, 400);

    r = await hook({ action: 'ring', seconds: 30, screens: ['kitchen'] });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.action, 'ring');
    assert.deepEqual(r.json.screens, ['kitchen']);
    const first = Date.parse(r.json.expiresAt);
    assert.ok(first > Date.now() + 25_000 && first <= Date.now() + 31_000);
    r = await hook({ seconds: 120, screens: ['kitchen'] });
    assert.ok(Date.parse(r.json.expiresAt) > first + 80_000, 'ringing again extends');
    // no screens = the configured ones (all here)
    r = await hook({});
    assert.deepEqual(r.json.screens.sort(), ['kitchen', 'living-room']);

    r = await hook({ action: 'dismiss', screens: ['kitchen'] });
    assert.deepEqual(r.json, { ok: true, action: 'dismiss', delivered: 0, screens: ['kitchen'] });
    r = await hook({ action: 'dismiss' });
    assert.deepEqual(r.json.screens, ['living-room'], 'dismiss without screens ends every ring');

    const log = listActivity({ type: 'display.doorbell' }).items;
    assert.equal(log.length, 5);
    assert.equal(log.at(-1).data.action, 'ring');
    assert.equal(log.at(-1).data.via, 'hook');
    assert.equal(log.at(-1).actor, 'token:Home Assistant');
    assert.equal(log.at(-2).data.extended, true);
    assert.equal(log[0].data.action, 'dismiss');
  });
});

test('frame: refused without a ring, for another screen and with a bad key; served while ringing, token kept on the server', async () => {
  await withServer(async ({ hook, frame, ha, call }) => {
    let r = await frame('kitchen');
    assert.equal(r.status, 404);
    assert.equal(r.json.code, 'no_ring');
    assert.equal(ha.hits.length, 0, 'Home Assistant is not asked without a ring');
    assert.equal((await frame(null)).status, 401, 'private mode: a credential is required');
    assert.equal((await call('GET', '/api/display/doorbell/frame', { headers: { 'x-marco-key': '3f6c0a52-9d1e-4b7a-a2c4-0e5b8f1d2c37' } })).status, 403);

    await hook({ screens: ['kitchen'] });
    r = await frame('kitchen');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.match(r.headers.get('cache-control'), /no-store/);
    assert.deepEqual(r.buf, JPEG);
    noToken(r);
    assert.equal(ha.hits[0].url, '/api/camera_proxy/camera.front_door');
    assert.equal(ha.hits[0].auth, `Bearer ${HA_TOKEN}`);

    r = await frame('living-room');
    assert.equal(r.status, 404, 'a screen that is not ringing gets nothing');
    noToken(r);

    // the display payload carries no camera id, Home Assistant address or token
    await hook({ action: 'dismiss' });
    assert.equal((await frame('kitchen')).status, 404, 'dismissed: no more frames');
  });
});

test('frame: shared between displays for a moment, camera override, failures', async () => {
  await withServer(async ({ hook, frame, ha }) => {
    await hook({ camera: 'camera.garden' });
    ha.state.delay = 80;
    const all = await Promise.all([frame('kitchen', 1), frame('living-room', 1), frame('kitchen', 2), frame('living-room', 2)]);
    assert.deepEqual(all.map((r) => r.status), [200, 200, 200, 200]);
    assert.equal(ha.hits.length, 1, 'one request to Home Assistant for four displays');
    assert.equal(ha.hits[0].url, '/api/camera_proxy/camera.garden');
    ha.state.delay = 0;
    await new Promise((r) => setTimeout(r, FRAME_CACHE_MS + 50));
    await frame('kitchen', 3);
    assert.equal(ha.hits.length, 2, 'a new frame after the cache time');

    for (const mode of ['down', 'html', 'huge']) {
      ha.state.mode = mode;
      await new Promise((r) => setTimeout(r, FRAME_CACHE_MS + 20));
      const r = await frame('kitchen', 9);
      assert.equal(r.status, 502, mode);
      assert.equal(r.json.code, 'camera_unavailable');
      noToken(r);
    }
  });
});

test('frame: no camera chosen, Home Assistant turned off', async () => {
  await withServer(async ({ hook, frame, login, call, poll }) => {
    const cookie = await login();
    const cfg = (await call('GET', '/api/admin/config', { headers: { cookie } })).json;
    cfg.homeassistant.doorbell.camera = '';
    const saved = await call('PUT', '/api/admin/config', { body: cfg, headers: { cookie } });
    assert.equal(saved.status, 200, saved.text);
    await hook({ screens: ['kitchen'] });
    const p = await poll('kitchen', { client: 'kiosk-k1' });
    assert.equal(p.commands.find((c) => c.type === 'doorbell').frames, false);
    assert.equal((await frame('kitchen')).json.code, 'no_camera');
    cfg.homeassistant.enabled = false;
    cfg.homeassistant.doorbell.camera = 'camera.front_door';
    const again = (await call('GET', '/api/admin/config', { headers: { cookie } })).json;
    again.homeassistant.enabled = false;
    assert.equal((await call('PUT', '/api/admin/config', { body: again, headers: { cookie } })).status, 200);
    await hook({ screens: ['kitchen'], camera: 'camera.front_door' });
    const r = await frame('kitchen');
    assert.equal(r.status, 503);
    assert.equal(r.json.code, 'homeassistant_off');
  });
});

test('delivery: poll reset and commands reach only the ringing screen, without secrets', async () => {
  await withServer(async ({ hook, poll }) => {
    const k0 = await poll('kitchen', { client: 'kiosk-k1' });
    const m0 = await poll('living-room', { client: 'kiosk-m1' });
    assert.equal(k0.doorbellId, null);
    await hook({ screens: ['kitchen'], seconds: 45 });
    const k1 = await poll('kitchen', { client: 'kiosk-k1', cursor: k0.cursor });
    const db = k1.commands.find((c) => c.type === 'doorbell');
    assert.ok(db, JSON.stringify(k1.commands));
    assert.deepEqual(Object.keys(db).sort(), ['expiresAt', 'frames', 'id', 'refreshMs', 'sound', 'startedAt', 'type', 'updatedAt']);
    assert.equal(db.frames, true);
    const text = JSON.stringify(k1);
    for (const secret of [HA_TOKEN, 'camera.front_door', '127.0.0.1']) assert.equal(text.includes(secret), false, secret);
    const m1 = await poll('living-room', { client: 'kiosk-m1', cursor: m0.cursor });
    assert.equal(m1.commands.some((c) => c.type === 'doorbell'), false);
    // a display that starts now gets the ring in its reset
    const fresh = await poll('kitchen', { client: 'kiosk-k2' });
    assert.equal(fresh.doorbellId, db.id);
    assert.equal(fresh.commands.find((c) => c.type === 'doorbell').id, db.id);
    await hook({ action: 'dismiss' });
    const k2 = await poll('kitchen', { client: 'kiosk-k1', cursor: k1.cursor });
    assert.deepEqual(k2.commands.map((c) => [c.type, c.id]), [['doorbell-end', db.id]]);
    assert.equal((await poll('kitchen', { client: 'kiosk-k3' })).doorbellId, null);
  });
});

test('admin: the test button needs a session; health lists the features', async () => {
  await withServer(async ({ call, login }) => {
    const health = (await call('GET', '/api/health')).json;
    assert.equal(health.features.doorbell, true);
    assert.equal(health.features.doorbellLive, true);
    assert.equal((await call('POST', '/api/admin/doorbell', { body: {} })).status, 401);
    const cookie = await login();
    const r = await call('POST', '/api/admin/doorbell', { body: { action: 'ring', seconds: 20, screens: ['s_kitchen'] }, headers: { cookie } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.screens, ['kitchen']);
    assert.equal(listActivity({ type: 'display.doorbell' }).items[0].data.via, 'admin');
    assert.equal((await call('POST', '/api/admin/doorbell', { body: { action: 'dismiss' }, headers: { cookie } })).json.action, 'dismiss');
  });
});

test('open display access: frames only for LAN clients (loopback counts as LAN here)', async () => {
  await withServer(async ({ hook, call }) => {
    await hook({});
    const r = await call('GET', '/api/display/doorbell/frame?screen=kitchen');
    assert.equal(r.status, 200);
    noToken(r);
  }, { mode: 'open' });
});
