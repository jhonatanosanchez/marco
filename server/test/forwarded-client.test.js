// Forwarded client address: a reverse proxy on this machine is trusted (TRUST_PROXY default: loopback), but Express
// reads the client address from X-Forwarded-For only. A proxy that sends X-Real-IP, Forwarded, X-Forwarded-Proto or
// X-Forwarded-Host without X-Forwarded-For must not make its clients look like this machine (127.0.0.1): no
// tokenless setup, no weak ADMIN_PASSWORD, no open-mode photos or default screen, separate login buckets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../store.js';
import { defaultConfig } from '../core/defaults.js';
import { ensurePassword, _resetLoginLimits } from '../auth.js';
import { _resetSetup } from '../setup.js';
import { createApp } from '../app.js';
import { closeAll } from '../sse.js';
import { _resetDisplays } from '../displays.js';
import { _resetPoll } from '../pollHub.js';
import { _resetActivityThrottle } from '../activity.js';
import { syncDisplayKeys, _resetDisplayAccess, isLoopbackClient } from '../displayAccess.js';
import { isLanClient, clientBucket, untrustedProxy } from '../lib/net.js';
import { onThisMachine } from '../routes/public.js';
import { makeJpeg } from './photoBytes.js';

const realFetch = globalThis.fetch;
const STRONG = 'tidy-otter-lamp-42';

/** A request as Express would see it: `peer` = socket address, trusted per `trusted`, req.ip = what Express derived. */
function fakeReq({ peer = '127.0.0.1', ip = peer, headers = {}, trusted = true } = {}) {
  return {
    ip, headers, socket: { remoteAddress: peer },
    get: (k) => headers[k.toLowerCase()],
    app: { get: (k) => (k === 'trust proxy fn' ? () => trusted : undefined) },
  };
}

const ONLY_OTHER_HEADERS = [
  { 'x-real-ip': '203.0.113.9' },
  { forwarded: 'for=203.0.113.9;proto=https' },
  { 'x-forwarded-proto': 'https' },
  { 'x-forwarded-host': 'calendar.example.com' },
  { 'x-real-ip': '203.0.113.9', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'calendar.example.com' },
];

test('trusted proxy on this machine without X-Forwarded-For: the client is remote, never this machine', () => {
  for (const headers of ONLY_OTHER_HEADERS) {
    const req = fakeReq({ headers }); // req.ip stays 127.0.0.1: Express found no X-Forwarded-For
    assert.equal(untrustedProxy(req), true, JSON.stringify(headers));
    assert.equal(isLanClient(req), false, JSON.stringify(headers));
    assert.equal(isLanClient(req, { strict: true }), false, JSON.stringify(headers));
    assert.equal(isLoopbackClient(req), false, JSON.stringify(headers));
    assert.equal(onThisMachine(req), false, JSON.stringify(headers));
  }
});

test('X-Forwarded-For from a trusted proxy still works; strict checks want a direct connection', () => {
  const lan = fakeReq({ ip: '192.168.1.20', headers: { 'x-forwarded-for': '192.168.1.20', 'x-real-ip': '192.168.1.20' } });
  assert.equal(isLanClient(lan), true);
  assert.equal(isLanClient(lan, { strict: true }), false);
  const internet = fakeReq({ ip: '203.0.113.9', headers: { 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(isLanClient(internet), false);
  assert.equal(isLoopbackClient(internet), false);
  // a local client through the local proxy
  const local = fakeReq({ ip: '127.0.0.1', headers: { 'x-forwarded-for': '127.0.0.1' } });
  assert.equal(isLoopbackClient(local), true);
});

test('direct LAN and loopback connections keep working', () => {
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.1.20', '10.0.0.5']) {
    const req = fakeReq({ peer: ip, trusted: ip.includes('127.') || ip === '::1' });
    assert.equal(isLanClient(req), true, ip);
    assert.equal(isLanClient(req, { strict: true }), true, ip);
  }
  assert.equal(isLoopbackClient(fakeReq({ peer: '127.0.0.1' })), true);
  assert.equal(isLoopbackClient(fakeReq({ peer: '192.168.1.20', trusted: false })), false);
  assert.equal(isLanClient(fakeReq({ peer: '203.0.113.9', trusted: false })), false);
});

test('rate-limit bucket: X-Real-IP from a trusted proxy without X-Forwarded-For, else the derived address', () => {
  assert.equal(clientBucket(fakeReq({ headers: { 'x-real-ip': '203.0.113.9' } })), '203.0.113.9');
  assert.equal(clientBucket(fakeReq({ headers: { 'x-real-ip': '2001:db8:1:2::5' } })), '2001:db8:1:2::/64');
  // an untrusted peer cannot choose its bucket
  assert.equal(clientBucket(fakeReq({ peer: '198.51.100.4', trusted: false, headers: { 'x-real-ip': '203.0.113.9' } })), '198.51.100.4');
  // X-Forwarded-For present: Express's address wins
  assert.equal(clientBucket(fakeReq({ ip: '203.0.113.7', headers: { 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '1.2.3.4' } })), '203.0.113.7');
  // garbage is ignored
  assert.equal(clientBucket(fakeReq({ headers: { 'x-real-ip': 'not-an-ip' } })), '127.0.0.1');
  assert.equal(clientBucket(fakeReq({ peer: '192.168.1.20' })), '192.168.1.20');
});

async function withApp(fn, { password = null, weak = false, mode = 'private', env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-fwd-'));
  const saved = {};
  for (const [k, v] of Object.entries({ TRUST_PROXY: undefined, SETUP_TOKEN: undefined, SETUP_REQUIRE_TOKEN: undefined, ADMIN_PASSWORD: undefined, PUBLIC_URL: undefined, ALLOWED_HOSTS: undefined, ...env })) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  globalThis.fetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = mode;
  c.screens[0].background.source = 'gallery';
  if (password) c.revision = 2;
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'photos', 'img_0042.jpg'), makeJpeg(64, 48));
  if (weak) process.env.ADMIN_PASSWORD = 'password123';
  store.initStore(dir);
  _resetSetup();
  _resetDisplays();
  _resetPoll();
  _resetActivityThrottle();
  _resetDisplayAccess();
  _resetLoginLimits();
  if (password) {
    const { hashPassword } = await import('../auth.js');
    store.updateSecrets((s) => { s.passwordHash = null; });
    const h = await hashPassword(password);
    store.updateSecrets((s) => { s.passwordHash = h; s.passwordIsDefault = false; });
  }
  await ensurePassword();
  syncDisplayKeys();
  const app = createApp({ version: '0.13.0', dist: path.join(dir, 'no-dist') });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { body, headers = {} } = {}) => {
    const r = await realFetch(base + url, {
      method,
      headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json };
  };
  try {
    await fn({ call });
  } finally {
    closeAll();
    await new Promise((r) => server.close(r));
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const setupBody = { password: STRONG, passwordConfirm: STRONG, language: 'en' };

test('setup wizard: any forwarding header requires the token; a direct connection does not', async () => {
  await withApp(async ({ call }) => {
    for (const headers of [...ONLY_OTHER_HEADERS, { 'x-forwarded-for': '192.168.1.20' }]) {
      assert.equal((await call('GET', '/api/setup/status', { headers })).json.tokenRequired, true, JSON.stringify(headers));
    }
    // nginx with `proxy_set_header X-Real-IP $remote_addr` only: an Internet client cannot finish the wizard
    const r = await call('POST', '/api/setup/complete', { headers: { 'x-real-ip': '203.0.113.9' }, body: setupBody });
    assert.equal(r.status, 403);
    assert.equal(store.getSecrets().passwordHash, undefined);
    // the LAN address of this machine's own browser (direct): no token
    assert.equal((await call('GET', '/api/setup/status')).json.tokenRequired, false);
    assert.equal((await call('POST', '/api/setup/complete', { body: setupBody })).status, 200);
  });
});

test('weak ADMIN_PASSWORD: refused through a proxy without X-Forwarded-For, accepted on a direct connection', async () => {
  await withApp(async ({ call }) => {
    for (const headers of ONLY_OTHER_HEADERS) {
      assert.equal((await call('POST', '/api/auth/login', { headers, body: { password: 'password123' } })).status, 403, JSON.stringify(headers));
    }
    assert.equal((await call('POST', '/api/auth/login', { body: { password: 'password123' } })).status, 200);
  }, { weak: true });
});

test('open mode: photos, the default screen and LAN addresses are not handed to a proxy without X-Forwarded-For', async () => {
  await withApp(async ({ call }) => {
    for (const headers of ONLY_OTHER_HEADERS) {
      const tag = JSON.stringify(headers);
      assert.equal((await call('GET', '/media/photos/img_0042.jpg', { headers })).status, 404, tag);
      assert.equal((await call('GET', '/api/display/config', { headers })).status, 404, tag);
      assert.equal((await call('GET', '/api/health', { headers })).json.lanAddresses, undefined, tag);
    }
    // normal X-Forwarded-For: the LAN client gets the photo, an Internet client does not
    assert.equal((await call('GET', '/media/photos/img_0042.jpg', { headers: { 'x-forwarded-for': '192.168.1.20' } })).status, 200);
    assert.equal((await call('GET', '/media/photos/img_0042.jpg', { headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 404);
    // this machine (direct): photo, default screen and LAN addresses
    assert.equal((await call('GET', '/media/photos/img_0042.jpg')).status, 200);
    assert.equal((await call('GET', '/api/display/config')).status, 200);
    assert.ok(Array.isArray((await call('GET', '/api/health')).json.lanAddresses));
  }, { mode: 'open', password: STRONG });
});

test('login attempts behind an X-Real-IP proxy are counted per client, not in one shared bucket', async () => {
  await withApp(async ({ call }) => {
    const as = (ip) => ({ headers: { 'x-real-ip': ip }, body: { password: 'wrong-guess-123' } });
    for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', as('203.0.113.1'));
    assert.equal((await call('POST', '/api/auth/login', as('203.0.113.1'))).status, 429);
    // another client of the same proxy is not locked out by the first one
    assert.equal((await call('POST', '/api/auth/login', as('203.0.113.2'))).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { headers: { 'x-real-ip': '203.0.113.2' }, body: { password: STRONG } })).status, 200);
  }, { password: STRONG });
});
