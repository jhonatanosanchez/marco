// Network trust: Host allowlist (DNS rebinding), LAN detection behind untrusted proxies / in containers, setup token
// throttling on /status, lost secrets, weak ADMIN_PASSWORD, SSRF guard of the setup ICS test, photo access, setup log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import * as store from '../store.js';
import { defaultConfig } from '../core/defaults.js';
import { sessionMiddleware, csrfGuard, ensurePassword, loginHandler, meHandler, lanOrSession } from '../auth.js';
import { setupRouter, setupToken, _resetSetup, logSetupHint } from '../setup.js';
import { hostGuard, hostAllowed, hostnameOf, isLanClient, ipBucket, blockedFetchHost, blockedFetchAddress, _setContainerGateway } from '../lib/net.js';
import { request } from '../lib/http.js';
import { closeAll } from '../sse.js';

const GOOD = 'tidy-otter-lamp-42';
const body = (extra = {}) => ({ password: GOOD, passwordConfirm: GOOD, language: 'en', screenName: 'Kitchen', ...extra });

function setEnv(env) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
}

/** Raw HTTP (fetch cannot set Host). */
function raw(port, { method = 'GET', path: p = '/', headers = {}, body: b } = {}) {
  return new Promise((resolve, reject) => {
    const data = b === undefined ? undefined : JSON.stringify(b);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: {
      ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* text */ }
        resolve({ status: res.statusCode, json, text, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function withApp(fn, { secrets = null, config = null, env = {}, trustProxy = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-net-'));
  const c = config || defaultConfig();
  c.news.feeds = [];
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  if (secrets) fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify(secrets));
  const restore = setEnv({ SETUP_TOKEN: undefined, SETUP_REQUIRE_TOKEN: undefined, ADMIN_PASSWORD: undefined, PUBLIC_URL: undefined, ALLOWED_HOSTS: undefined, ...env });
  store.initStore(dir);
  _resetSetup();
  await ensurePassword();
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'photos', 'family.jpg'), 'jpeg');

  const app = express();
  app.set('trust proxy', trustProxy);
  app.use(hostGuard());
  app.use(sessionMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(['/api/admin', '/api/auth', '/api/setup'], csrfGuard());
  app.get('/api/auth/me', meHandler);
  app.post('/api/auth/login', (req, res, next) => loginHandler(req, res).catch(next));
  app.use('/api/setup', setupRouter({ version: '9.9.9' }));
  app.use('/media', lanOrSession);
  app.use('/media/photos', express.static(path.join(dir, 'photos'), { fallthrough: false }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const port = server.address().port;
  try {
    await fn({ port, dir, call: (o) => raw(port, o) });
  } finally {
    closeAll();
    await new Promise((r) => server.close(r));
    restore();
    _resetSetup();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const lan = { 'x-forwarded-for': '192.168.1.20' };
/** A direct connection from this machine (loopback peer, no forwarding headers): the LAN for the strict checks. */
const direct = {};

test('host allowlist: LAN names, IP literals, PUBLIC_URL and ALLOWED_HOSTS only', () => {
  const restore = setEnv({ PUBLIC_URL: 'https://calendar.example.com', ALLOWED_HOSTS: 'other.example.net, *.home.example.org' });
  try {
    for (const h of ['localhost', '127.0.0.1', '192.168.1.50', '::1', 'raspberrypi', 'nas.local', 'pi.lan', 'x.home.arpa', 'calendar.example.com',
      'other.example.net', 'a.home.example.org', '']) assert.equal(hostAllowed(h), true, h);
    for (const h of ['attacker.example', 'example.com', 'calendar.example.com.evil.io', 'home.example.org.evil.io']) assert.equal(hostAllowed(h), false, h);
    assert.equal(hostnameOf('Attacker.Example:3000'), 'attacker.example');
    assert.equal(hostnameOf('[::1]:3000'), '::1');
  } finally {
    restore();
  }
});

test('DNS rebinding: foreign Host (with a matching Origin) is refused before setup; LAN host works', async () => {
  await withApp(async ({ call }) => {
    const evil = { host: 'attacker.example:18471', origin: 'http://attacker.example:18471', ...direct };
    let r = await call({ method: 'POST', path: '/api/setup/complete', headers: evil, body: body() });
    assert.equal(r.status, 421);
    assert.equal(store.getSecrets().passwordHash, undefined);
    r = await call({ path: '/api/setup/status', headers: { host: 'attacker.example', ...direct } });
    assert.equal(r.status, 421);
    // Origin from an unknown host is refused even when the Host header is fine
    r = await call({ method: 'POST', path: '/api/setup/complete', headers: { host: '192.168.1.50:3000', origin: 'http://attacker.example', ...direct }, body: body() });
    assert.equal(r.status, 403);
    r = await call({ method: 'POST', path: '/api/setup/complete', headers: { host: '192.168.1.50:3000', origin: 'http://192.168.1.50:3000', ...direct }, body: body() });
    assert.equal(r.status, 200);
  });
});

test('PUBLIC_URL / ALLOWED_HOSTS host names are accepted', async () => {
  await withApp(async ({ call }) => {
    assert.equal((await call({ path: '/api/setup/status', headers: { host: 'calendar.example.com', ...lan } })).status, 200);
    assert.equal((await call({ path: '/api/setup/status', headers: { host: 'cal.example.net', ...lan } })).status, 200);
    assert.equal((await call({ path: '/api/setup/status', headers: { host: 'example.org', ...lan } })).status, 421);
  }, { env: { PUBLIC_URL: 'https://calendar.example.com', ALLOWED_HOSTS: '.example.net' } });
});

test('LAN detection: untrusted proxy headers and the container gateway are not LAN', () => {
  const trusting = (ok) => ({ get: (k) => (k === 'trust proxy fn' ? () => ok : undefined) });
  const req = (ip, headers = {}, trusted = false) => ({ ip, headers, socket: { remoteAddress: ip }, app: trusting(trusted) });
  assert.equal(isLanClient(req('192.168.1.20')), true);
  assert.equal(isLanClient(req('203.0.113.9')), false);
  // a proxy on the Docker bridge without TRUST_PROXY: X-Forwarded-For is ignored by Express, req.ip is the gateway
  assert.equal(isLanClient(req('172.17.0.1', { 'x-forwarded-for': '8.8.8.8' })), false);
  assert.equal(isLanClient(req('172.17.0.1', { 'x-forwarded-proto': 'https' })), false);
  _setContainerGateway('172.17.0.1');
  try {
    assert.equal(isLanClient(req('172.17.0.1')), true); // displays on the Docker host still get photos
    assert.equal(isLanClient(req('172.17.0.1'), { strict: true }), false); // …but no tokenless setup / weak password
    assert.equal(isLanClient(req('192.168.1.20'), { strict: true }), true);
  } finally {
    _setContainerGateway(undefined);
  }
  assert.equal(ipBucket('2001:db8:1:2:aaaa::1'), ipBucket('2001:db8:1:2:bbbb::9'));
  assert.notEqual(ipBucket('2001:db8:1:2::1'), ipBucket('2001:db8:1:3::1'));
  assert.equal(ipBucket('::ffff:203.0.113.9'), '203.0.113.9');
});

test('setup behind an untrusted proxy needs the token; SETUP_REQUIRE_TOKEN forces it on the LAN', async () => {
  await withApp(async ({ call }) => {
    // socket peer 127.0.0.1 is not trusted (trust proxy false) and the request carries X-Forwarded-For
    const st = (await call({ path: '/api/setup/status', headers: { 'x-forwarded-for': '8.8.8.8' } })).json;
    assert.equal(st.tokenRequired, true);
    assert.equal((await call({ path: '/api/setup/status' })).json.tokenRequired, false);
  }, { trustProxy: false });
  await withApp(async ({ call }) => {
    assert.equal((await call({ path: '/api/setup/status', headers: lan })).json.tokenRequired, true);
    assert.equal((await call({ method: 'POST', path: '/api/setup/complete', headers: lan, body: body() })).status, 403);
    assert.equal((await call({ method: 'POST', path: '/api/setup/complete', headers: lan, body: body({ token: setupToken() }) })).status, 200);
  }, { env: { SETUP_REQUIRE_TOKEN: '1' } });
});

test('GET /api/setup/status counts wrong tokens and locks out; a strong token still gets through', async () => {
  await withApp(async ({ call }) => {
    const h = (tok, ip = '192.168.1.66') => ({ 'x-forwarded-for': ip, 'x-setup-token': tok });
    for (let i = 0; i < 10; i++) assert.equal((await call({ path: '/api/setup/status', headers: h(`guess${i}`) })).json.tokenValid, false);
    assert.equal((await call({ path: '/api/setup/status', headers: h('guess-again') })).status, 429);
    // weak user-chosen token: the lockout also applies to the right one (that is what stops guessing)
    assert.equal((await call({ path: '/api/setup/status', headers: h('short-token-123') })).status, 429);
    assert.equal((await call({ method: 'POST', path: '/api/setup/complete', headers: { 'x-forwarded-for': '192.168.1.66' }, body: body({ token: 'short-token-123' }) })).status, 429);
    // another address is unaffected
    assert.equal((await call({ path: '/api/setup/status', headers: h('short-token-123', '192.168.1.67') })).json.tokenValid, true);
  }, { env: { SETUP_TOKEN: 'short-token-123' } });
  await withApp(async ({ call }) => {
    const ip = '2001:db8:5:6::1';
    for (let i = 0; i < 10; i++) await call({ path: '/api/setup/status', headers: { 'x-forwarded-for': `2001:db8:5:6::${i + 2}`, 'x-setup-token': `bad${i}` } });
    assert.equal((await call({ path: '/api/setup/status', headers: { 'x-forwarded-for': ip, 'x-setup-token': 'bad' } })).status, 429); // same /64
    // the generated token is unguessable: a neighbour's lockout does not keep the owner out
    const r = await call({ method: 'POST', path: '/api/setup/complete', headers: { 'x-forwarded-for': ip }, body: body({ token: setupToken() }) });
    assert.equal(r.status, 200);
  });
});

test('corrupt secrets.json: the server refuses to start instead of reopening setup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-net-'));
  try {
    fs.writeFileSync(path.join(dir, 'secrets.json'), '{"passwordHash": "scrypt$abc', 'utf8');
    assert.throws(() => store.initStore(dir), store.StoreError);
    assert.equal(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8'), '{"passwordHash": "scrypt$abc');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a configured install that lost its secrets needs the setup token even from the LAN', async () => {
  const c = defaultConfig();
  c.revision = 7;
  await withApp(async ({ call }) => {
    const st = (await call({ path: '/api/setup/status', headers: lan })).json;
    assert.equal(st.needsSetup, true);
    assert.equal(st.tokenRequired, true);
    assert.equal((await call({ method: 'POST', path: '/api/setup/complete', headers: lan, body: body() })).status, 403);
  }, { config: c });
});

test('ADMIN_PASSWORD that breaks the password rules is LAN-only', async () => {
  await withApp(async ({ call }) => {
    assert.equal(store.getSecrets().passwordIsDefault, true);
    assert.equal((await call({ method: 'POST', path: '/api/auth/login', headers: { 'x-forwarded-for': '203.0.113.9' }, body: { password: 'password123' } })).status, 403);
    assert.equal((await call({ method: 'POST', path: '/api/auth/login', headers: direct, body: { password: 'password123' } })).status, 200);
  }, { env: { ADMIN_PASSWORD: 'password123' } });
  await withApp(async () => {
    assert.equal(store.getSecrets().passwordIsDefault, false);
  }, { env: { ADMIN_PASSWORD: GOOD } });
});

test('photos: LAN clients or a session only', async () => {
  await withApp(async ({ call }) => {
    assert.equal((await call({ path: '/media/photos/family.jpg', headers: lan })).status, 200);
    assert.equal((await call({ path: '/media/photos/family.jpg', headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 404);
    const login = await call({ method: 'POST', path: '/api/auth/login', headers: lan, body: { password: GOOD } });
    const cookie = login.headers['set-cookie'].map((x) => x.split(';')[0]).join('; ');
    assert.equal((await call({ path: '/media/photos/family.jpg', headers: { 'x-forwarded-for': '203.0.113.9', cookie } })).status, 200);
  }, { env: { ADMIN_PASSWORD: GOOD } });
});

test('SSRF guard: blocked destinations, also after a redirect; setup test-ics errors are generic', async () => {
  for (const h of ['localhost', '127.0.0.1', '169.254.169.254', '[::1]', '0.0.0.0', 'metadata.google.internal', '[::ffff:7f00:1]']) assert.equal(blockedFetchHost(h), true, h);
  for (const h of ['192.168.1.50', 'example.com', '10.0.0.2']) assert.equal(blockedFetchHost(h), false, h);
  assert.equal(blockedFetchAddress('fe80::1'), true);
  await assert.rejects(request('http://127.0.0.1:9/x.ics', { guard: true }), (e) => e.blocked === true);
  await assert.rejects(request('http://localhost:9/x.ics', { guard: true }), (e) => e.blocked === true);

  // A LAN address (allowed) that redirects to loopback (blocked).
  const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  const target = http.createServer((req, res) => {
    if (req.url === '/redir') { res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/secret` }); return res.end(); }
    res.end('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
  });
  await new Promise((r) => target.listen(0, '0.0.0.0', r));
  try {
    if (lanIp) {
      await assert.rejects(request(`http://${lanIp}:${target.address().port}/redir`, { guard: true }), (e) => e.blocked === true);
      assert.equal((await request(`http://${lanIp}:${target.address().port}/ok`, { guard: true })).status, 200);
    }
    await withApp(async ({ call }) => {
      const r = await call({ method: 'POST', path: '/api/setup/test-ics', headers: direct, body: { url: `http://127.0.0.1:${target.address().port}/x.ics` } });
      assert.equal(r.json.ok, false);
      assert.equal(r.json.error, 'address not allowed');
      const r2 = await call({ method: 'POST', path: '/api/setup/test-ics', headers: direct, body: { url: 'http://192.0.2.1.invalid/x.ics' } });
      assert.equal(r2.json.ok, false);
      assert.equal(r2.json.error, 'could not load the calendar'); // no "Host not found (…)" details
    });
  } finally {
    await new Promise((r) => target.close(r));
  }
});

test('setup log line: localhost with the real port, PUBLIC_URL only when it is not localhost', async () => {
  await withApp(async () => {
    const lines = [];
    const orig = console.log;
    console.log = (...a) => lines.push(a.join(' '));
    try {
      logSetupHint(18093);
    } finally {
      console.log = orig;
    }
    const opens = lines.filter((l) => l.includes('/admin/?setup='));
    assert.ok(opens[0].includes('http://localhost:18093/admin/?setup='), opens[0]);
    assert.ok(!opens.some((l) => l.includes('localhost:3000')));
    lines.length = 0;
    process.env.PUBLIC_URL = 'https://calendar.example.com';
    console.log = (...a) => lines.push(a.join(' '));
    try {
      logSetupHint(18093);
    } finally {
      console.log = orig;
    }
    assert.ok(lines.some((l) => l.includes('https://calendar.example.com/admin/?setup=')));
    assert.ok(lines.some((l) => l.includes('http://localhost:18093/admin/?setup=')));
  }, { env: { PUBLIC_URL: 'http://localhost:3000' } });
});
