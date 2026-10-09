// Private display links + device pairing: access-control matrix over every display endpoint (private vs open),
// key regeneration, pairing lifecycle (create / claim / expire / single use / wrong code / rate limits / session id),
// redaction, migration. Runs the real app (server/app.js createApp) on a random port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../store.js';
import { defaultConfig, defaultScreenProfile } from '../defaults.js';
import { ensurePassword, hashPassword } from '../auth.js';
import { createApp } from '../app.js';
import { closeAll } from '../sse.js';
import { _resetDisplays, setServerVersion, listDisplays } from '../displays.js';
import { _resetAnnouncements } from '../announce.js';
import { _resetActivityThrottle, logActivity, listActivity } from '../activity.js';
import { createToken } from '../tokens.js';
import {
  syncDisplayKeys, onDisplayAccessConfig, listDisplayLinks, KEY_RE, DEVICE_TOKEN_RE, _resetDisplayAccess,
} from '../displayAccess.js';
import {
  startPairing, pairingStatus, claimPairing, normalizeCode, _resetPairing, _pendingCount, CODE_ALPHABET, CODE_LENGTH,
  PAIR_TTL_MS, WAITING_GRACE_MS, CLAIM_FAIL_LIMIT, CLAIM_FAIL_GLOBAL, START_LIMIT,
} from '../pairing.js';
import { redactSecrets } from '../lib/redact.js';

const realFetch = globalThis.fetch;
// No network in tests: Open-Meteo / picsum calls fail fast (the display endpoints then answer 502 / fall back).
const offlineFetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));

async function withServer(fn, { mode = 'private' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-access-'));
  globalThis.fetch = offlineFetch;
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = mode;
  c.screens[0].background.source = 'gallery';
  c.screens.push(defaultScreenProfile({ id: 's_kitchen', slug: 'kitchen', name: 'Kitchen' }));
  c.screens[1].background.source = 'gallery';
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ passwordHash: await hashPassword('secret-pass-123'), passwordIsDefault: false }));
  fs.mkdirSync(path.join(dir, 'photos', '.thumbs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'photos', 'family.jpg'), 'jpeg');
  fs.writeFileSync(path.join(dir, 'photos', '.thumbs', 'family.jpg'), 'thumb');
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'admin'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>display</title>');
  fs.writeFileSync(path.join(dist, 'admin', 'index.html'), '<!doctype html><title>admin</title>');
  store.initStore(dir);
  _resetDisplays();
  _resetAnnouncements();
  _resetPairing();
  _resetActivityThrottle();
  _resetDisplayAccess();
  setServerVersion('0.3.0');
  await ensurePassword();
  syncDisplayKeys();
  store.events.on('config', onDisplayAccessConfig);
  const app = createApp({ version: '0.3.0', dist });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { body, headers = {}, cookie = '' } = {}) => {
    const r = await realFetch(base + url, {
      method,
      headers: { ...headers, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, headers: r.headers, text, setCookie: r.headers.getSetCookie?.() || [] };
  };
  const login = async () => {
    const r = await call('POST', '/api/auth/login', { body: { password: 'secret-pass-123' } });
    assert.equal(r.status, 200);
    return r.setCookie.map((x) => x.split(';')[0]).join('; ');
  };
  /** Open an SSE stream; returns { status, events(), next(name), close() }. */
  const stream = async (url, { headers = {}, cookie = '' } = {}) => {
    const ctl = new AbortController();
    const r = await realFetch(base + url, { headers: { ...headers, ...(cookie ? { cookie } : {}) }, signal: ctl.signal });
    let buf = '';
    let ended = false;
    const waiters = [];
    const parse = () => buf.split('\n\n').filter((b) => b.startsWith('event:')).map((b) => {
      const [ev, data] = b.split('\n');
      return { event: ev.slice(7), data: JSON.parse(data.slice(6)) };
    });
    if (r.status === 200) {
      (async () => {
        try {
          for await (const chunk of r.body) {
            buf += Buffer.from(chunk).toString();
            waiters.forEach((w) => w());
          }
        } catch { /* aborted */ }
        ended = true;
        waiters.forEach((w) => w());
      })();
    } else await r.text();
    const next = (name, ms = 2000) => new Promise((resolve, reject) => {
      const t0 = Date.now();
      const check = () => {
        const hit = parse().find((e) => e.event === name);
        if (hit) return resolve(hit);
        if (Date.now() - t0 > ms) return reject(new Error(`no ${name} event`));
        waiters.push(check);
        setTimeout(check, 50);
      };
      check();
    });
    return { status: r.status, events: parse, next, ended: () => ended, close: () => ctl.abort() };
  };
  try {
    await fn({ call, login, stream, dir, base });
  } finally {
    store.events.off('config', onDisplayAccessConfig);
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
  }
}

const keyOf = (slug) => listDisplayLinks().find((l) => l.slug === slug).key;

// Every display-facing endpoint. `query` = credential travels as ?k= (EventSource / <img>), else X-Marco-Key.
const ENDPOINTS = [
  { name: 'display config', method: 'GET', url: '/api/display/config' },
  { name: 'events', method: 'GET', url: '/api/events' },
  { name: 'weather', method: 'GET', url: '/api/weather', upstream: true },
  { name: 'news', method: 'GET', url: '/api/news' },
  { name: 'photos', method: 'GET', url: '/api/photos' },
  { name: 'countdowns', method: 'GET', url: '/api/countdowns' },
  { name: 'heartbeat', method: 'POST', url: '/api/display/heartbeat', body: { clientId: 'kiosk-test-1' } },
  { name: 'stream', method: 'GET', url: '/api/stream?client=kiosk-test-2', sse: true, query: true },
  { name: 'photo file', method: 'GET', url: '/media/photos/family.jpg', query: true },
  { name: 'thumbnail', method: 'GET', url: '/media/thumbs/family.jpg', query: true },
];

/** Status of one endpoint with a credential / cookie / extra headers. */
async function hit(ctx, ep, { cred = '', cookie = '', headers = {} } = {}) {
  let url = ep.url;
  const h = { ...headers };
  if (cred) {
    if (ep.query) url += `${url.includes('?') ? '&' : '?'}k=${encodeURIComponent(cred)}`;
    else h['x-marco-key'] = cred;
  }
  if (ep.sse) {
    const s = await ctx.stream(url, { headers: h, cookie });
    s.close();
    return s.status;
  }
  return (await ctx.call(ep.method, url, { body: ep.body, headers: h, cookie })).status;
}
const allowed = (ep, status) => (ep.upstream ? ![401, 403].includes(status) : status === 200);

test('private mode: access matrix (no key 401, valid key, revoked key 403, device token, admin session)', async () => {
  await withServer(async (ctx) => {
    const cookie = await ctx.login();
    const kitchenKey = keyOf('kitchen');
    assert.match(kitchenKey, KEY_RE);
    // a paired device for the kitchen
    const st = await ctx.call('POST', '/api/pair/start', { body: {} });
    const claim = await ctx.call('POST', '/api/admin/pair/claim', { cookie, body: { code: st.json.code, screenId: 's_kitchen', name: 'Hall tablet' } });
    assert.equal(claim.status, 200, claim.text);
    const deviceToken = (await ctx.call('POST', '/api/pair/status', { body: { sessionId: st.json.sessionId } })).json.token;
    assert.match(deviceToken, DEVICE_TOKEN_RE);

    for (const ep of ENDPOINTS) {
      assert.equal(await hit(ctx, ep), 401, `${ep.name}: no key → 401`);
      assert.ok(allowed(ep, await hit(ctx, ep, { cred: kitchenKey })), `${ep.name}: valid key`);
      assert.ok(allowed(ep, await hit(ctx, ep, { cred: kitchenKey.toUpperCase() })), `${ep.name}: key is case-insensitive`);
      assert.ok(allowed(ep, await hit(ctx, ep, { cred: deviceToken })), `${ep.name}: device token`);
      assert.ok(allowed(ep, await hit(ctx, ep, { cookie })), `${ep.name}: admin session`);
      assert.equal(await hit(ctx, ep, { cred: '00000000-0000-4000-8000-000000000000' }), 403, `${ep.name}: unknown key → 403`);
      assert.equal(await hit(ctx, ep, { cred: `md_${'A'.repeat(43)}` }), 403, `${ep.name}: unknown device token → 403`);
      assert.equal(await hit(ctx, ep, { cred: 'not-a-key' }), 403, `${ep.name}: garbage → 403`);
      // an invalid credential is refused even together with an admin session (no silent fallback)
      assert.equal(await hit(ctx, ep, { cred: '00000000-0000-4000-8000-000000000000', cookie }), 403, `${ep.name}: bad key + session → 403`);
    }
    // ?k= is only accepted where headers are impossible (SSE, media), never on the JSON API
    assert.equal((await ctx.call('GET', `/api/display/config?k=${kitchenKey}`)).status, 401);
    // the key decides the screen; ?screen= cannot read another screen with it
    const cfg = await ctx.call('GET', '/api/display/config?screen=living-room', { headers: { 'x-marco-key': kitchenKey } });
    assert.equal(cfg.json.screenId, 's_kitchen');
    assert.equal(cfg.json.screenFallback, false);
    assert.match(cfg.headers.get('cache-control'), /private/);
    assert.match(cfg.headers.get('cache-control'), /no-store/);
    assert.equal(cfg.headers.get('referrer-policy'), 'no-referrer');
    const dev = await ctx.call('GET', '/api/display/config', { headers: { 'x-marco-key': deviceToken } });
    assert.equal(dev.json.screenId, 's_kitchen');
    // 401 / 403 bodies carry a code for the display and no data
    const no = await ctx.call('GET', '/api/events');
    assert.equal(no.json.code, 'key_required');
    assert.deepEqual(Object.keys(no.json).sort(), ['code', 'error']);
    assert.equal((await ctx.call('GET', '/api/events', { headers: { 'x-marco-key': 'nope' } })).json.code, 'invalid_key');
    // admin preview iframe (session + ?screen=&preview=1) keeps working
    assert.equal((await ctx.call('GET', '/api/display/config?screen=kitchen&preview=1', { cookie })).json.screenId, 's_kitchen');
    // health stays public; webhooks keep using API tokens
    assert.equal((await ctx.call('GET', '/api/health')).status, 200);
    const { token } = createToken('Home Assistant');
    assert.equal((await ctx.call('GET', '/api/hooks/ping', { headers: { authorization: `Bearer ${token}` } })).status, 200);
    assert.equal((await ctx.call('GET', '/api/hooks/ping', { headers: { 'x-marco-key': kitchenKey } })).status, 401);
    // the private link page itself: display HTML, never cached, no referrer, not indexed
    const page = await ctx.call('GET', `/d/${kitchenKey}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /display/);
    assert.match(page.headers.get('cache-control'), /no-store/);
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.match(page.headers.get('x-robots-tag'), /noindex/);
    // heartbeat with a key registers the bound screen and how it got in
    await ctx.call('POST', '/api/display/heartbeat', { headers: { 'x-marco-key': kitchenKey }, body: { clientId: 'kiosk-kitchen', screen: 'living-room' } });
    const reg = listDisplays().find((d) => d.clientId === 'kiosk-kitchen');
    assert.equal(reg.screenId, 's_kitchen');
    assert.equal(reg.access, 'key');
  });
});

test('open mode (legacy LAN): no key needed on the LAN, Internet media still 404, keys still bind and bad keys fail', async () => {
  await withServer(async (ctx) => {
    const kitchenKey = keyOf('kitchen');
    for (const ep of ENDPOINTS) {
      assert.ok(allowed(ep, await hit(ctx, ep)), `${ep.name}: open without key`);
      assert.ok(allowed(ep, await hit(ctx, ep, { cred: kitchenKey })), `${ep.name}: open + valid key`);
      assert.equal(await hit(ctx, ep, { cred: '00000000-0000-4000-8000-000000000000' }), 403, `${ep.name}: open + revoked key → 403`);
    }
    const internet = { 'x-forwarded-for': '203.0.113.9' };
    assert.equal((await ctx.call('GET', '/media/photos/family.jpg', { headers: internet })).status, 404);
    assert.equal((await ctx.call('GET', `/media/photos/family.jpg?k=${kitchenKey}`, { headers: internet })).status, 200);
    assert.equal((await ctx.call('GET', '/api/display/config?screen=kitchen')).json.screenId, 's_kitchen');
    assert.equal((await ctx.call('GET', '/api/display/config?screen=living-room', { headers: { 'x-marco-key': kitchenKey } })).json.screenId, 's_kitchen');
  }, { mode: 'open' });
});

test('switching open → private disconnects keyless displays (revoked: key_required); keyed ones stay', async () => {
  await withServer(async (ctx) => {
    const cookie = await ctx.login();
    const open = await ctx.stream('/api/stream?client=kiosk-open');
    const keyed = await ctx.stream(`/api/stream?client=kiosk-keyed&k=${keyOf('kitchen')}`);
    await open.next('hello');
    await keyed.next('hello');
    const cfg = (await ctx.call('GET', '/api/admin/config', { cookie })).json;
    cfg.security.displayAccess = 'private';
    assert.equal((await ctx.call('PUT', '/api/admin/config', { cookie, body: cfg })).status, 200);
    const ev = await open.next('revoked');
    assert.equal(ev.data.code, 'key_required');
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!keyed.events().some((e) => e.event === 'revoked'));
    assert.equal((await ctx.call('GET', '/api/events')).status, 401);
    open.close();
    keyed.close();
  }, { mode: 'open' });
});

test('regenerate link: old key revoked at once, connected displays told via SSE, new key works, keys never logged', async () => {
  await withServer(async (ctx) => {
    const cookie = await ctx.login();
    assert.equal((await ctx.call('GET', '/api/admin/display-links')).status, 401);
    const links = (await ctx.call('GET', '/api/admin/display-links', { cookie })).json;
    assert.equal(links.mode, 'private');
    assert.equal(links.links.length, 2);
    const old = links.links.find((l) => l.screenId === 's_kitchen');
    assert.equal(old.path, `/d/${old.key}`);
    const other = links.links.find((l) => l.screenId === 's_main').key;
    const s = await ctx.stream(`/api/stream?client=kiosk-kitchen&k=${old.key}`);
    const s2 = await ctx.stream(`/api/stream?client=kiosk-living&k=${other}`);
    assert.equal((await s.next('hello')).data.screenId, 's_kitchen');
    await s2.next('hello');
    // CSRF: cross-origin regenerate refused
    assert.equal((await ctx.call('POST', '/api/admin/display-links/s_kitchen/regenerate', { cookie, body: {}, headers: { origin: 'https://evil.example' } })).status, 403);
    const r = await ctx.call('POST', '/api/admin/display-links/s_kitchen/regenerate', { cookie, body: {} });
    assert.equal(r.status, 200);
    const fresh = r.json.link.key;
    assert.notEqual(fresh, old.key);
    assert.match(fresh, KEY_RE);
    assert.equal((await s.next('revoked')).data.code, 'invalid_key');
    await new Promise((res) => setTimeout(res, 100));
    assert.ok(s.ended(), 'stream closed by the server');
    assert.ok(!s2.events().some((e) => e.event === 'revoked'), 'other screens untouched');
    assert.equal((await ctx.call('GET', '/api/display/config', { headers: { 'x-marco-key': old.key } })).status, 403);
    assert.equal((await ctx.call('GET', '/api/display/config', { headers: { 'x-marco-key': fresh } })).json.screenId, 's_kitchen');
    assert.equal((await ctx.call('GET', '/api/display/config', { headers: { 'x-marco-key': other } })).status, 200);
    assert.equal((await ctx.call('POST', '/api/admin/display-links/s_nope/regenerate', { cookie, body: {} })).status, 404);
    // keys are stored server-side only (secrets.json, 0600), never in config / exports / activity
    const secrets = fs.readFileSync(path.join(ctx.dir, 'secrets.json'), 'utf8');
    assert.ok(secrets.includes(fresh));
    assert.ok(!fs.readFileSync(path.join(ctx.dir, 'config.json'), 'utf8').includes(fresh));
    assert.ok(!JSON.stringify((await ctx.call('GET', '/api/admin/config', { cookie })).json).includes(fresh));
    const activity = fs.readFileSync(path.join(ctx.dir, 'activity.jsonl'), 'utf8');
    assert.match(activity, /display\.link_regenerated/);
    for (const k of [old.key, fresh, other]) assert.ok(!activity.includes(k), 'key not in the activity log');
    s2.close();
  });
});

test('screens deleted → their links stop working; devices move to the default screen', async () => {
  await withServer(async (ctx) => {
    const cookie = await ctx.login();
    const kitchenKey = keyOf('kitchen');
    const st = startPairing({ ip: '192.168.1.40', get: () => '' });
    const out = claimPairing({ ip: '127.0.0.1', session: { epoch: 'x', user: { email: 'admin' } } }, { code: st.code, screenId: 's_kitchen' });
    assert.ok(out.device);
    const token = pairingStatus(st.sessionId).token;
    const cfg = (await ctx.call('GET', '/api/admin/config', { cookie })).json;
    cfg.screens = cfg.screens.filter((s) => s.id !== 's_kitchen');
    assert.equal((await ctx.call('PUT', '/api/admin/config', { cookie, body: cfg })).status, 200);
    assert.equal((await ctx.call('GET', '/api/events', { headers: { 'x-marco-key': kitchenKey } })).status, 403);
    assert.equal((await ctx.call('GET', '/api/display/config', { headers: { 'x-marco-key': token } })).json.screenId, 's_main');
  });
});

test('pairing over HTTP: start → claim (admin) → status hands the token once → device works → revoke', async () => {
  await withServer(async (ctx) => {
    const cookie = await ctx.login();
    const st = await ctx.call('POST', '/api/pair/start', { body: {} });
    assert.equal(st.status, 200);
    assert.match(st.headers.get('cache-control'), /no-store/);
    const { sessionId, code } = st.json;
    assert.equal(code.length, CODE_LENGTH);
    for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
    assert.match(sessionId, /^[A-Za-z0-9_-]{43}$/);
    // the code is not a session id: polling with it (or anything else) learns nothing
    assert.equal((await ctx.call('POST', '/api/pair/status', { body: { sessionId: code } })).json.status, 'expired');
    assert.equal((await ctx.call('POST', '/api/pair/status', { body: { sessionId: 'x'.repeat(43) } })).status, 404);
    const waiting = await ctx.call('POST', '/api/pair/status', { body: { sessionId } });
    assert.equal(waiting.json.status, 'waiting');
    assert.equal(waiting.json.token, undefined);
    // claiming needs an admin session (and passes the CSRF guard)
    assert.equal((await ctx.call('POST', '/api/admin/pair/claim', { body: { code, screenId: 's_kitchen' } })).status, 401);
    assert.equal((await ctx.call('POST', '/api/admin/pair/claim', { cookie, body: { code, screenId: 's_kitchen' }, headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await ctx.call('POST', '/api/admin/pair/claim', { cookie, body: { code, screenId: 's_nope' } })).status, 400);
    const wrong = await ctx.call('POST', '/api/admin/pair/claim', { cookie, body: { code: code === '222222' ? '333333' : '222222', screenId: 's_kitchen' } });
    assert.equal(wrong.status, 404);
    assert.equal(wrong.json.code, 'invalid_code');
    // lower case + separators are accepted
    const pretty = `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase();
    const claim = await ctx.call('POST', '/api/admin/pair/claim', { cookie, body: { code: pretty, screenId: 's_kitchen', name: '  Hall   tablet ' } });
    assert.equal(claim.status, 200, claim.text);
    assert.equal(claim.json.device.name, 'Hall tablet');
    assert.equal(claim.json.device.screenId, 's_kitchen');
    // single use
    assert.equal((await ctx.call('POST', '/api/admin/pair/claim', { cookie, body: { code, screenId: 's_main' } })).status, 404);
    const paired = await ctx.call('POST', '/api/pair/status', { body: { sessionId } });
    assert.equal(paired.json.status, 'paired');
    assert.equal(paired.json.screen.id, 's_kitchen');
    const token = paired.json.token;
    assert.match(token, DEVICE_TOKEN_RE);
    // handed out exactly once
    assert.equal((await ctx.call('POST', '/api/pair/status', { body: { sessionId } })).json.status, 'expired');
    // stored hashed only
    const secrets = fs.readFileSync(path.join(ctx.dir, 'secrets.json'), 'utf8');
    assert.ok(!secrets.includes(token));
    assert.ok(secrets.includes(claim.json.device.id));
    // the token works like a key, bound to the kitchen
    const s = await ctx.stream(`/api/stream?client=kiosk-hall&k=${encodeURIComponent(token)}`);
    assert.equal((await s.next('hello')).data.screenId, 's_kitchen');
    let devs = (await ctx.call('GET', '/api/admin/devices', { cookie })).json.devices;
    assert.equal(devs.length, 1);
    assert.ok(devs[0].lastSeenAt);
    assert.equal(devs[0].connected, true);
    assert.deepEqual(devs[0].clientIds, ['kiosk-hall']);
    assert.equal(devs[0].hash, undefined);
    assert.equal(listDisplays().find((d) => d.clientId === 'kiosk-hall').deviceName, 'Hall tablet');
    // rename
    const ren = await ctx.call('PATCH', `/api/admin/devices/${devs[0].id}`, { cookie, body: { name: 'Fridge' } });
    assert.equal(ren.json.device.name, 'Fridge');
    assert.equal((await ctx.call('PATCH', `/api/admin/devices/${devs[0].id}`, { cookie, body: { name: '   ' } })).status, 400);
    // revoke → token refused, live stream told and closed
    assert.equal((await ctx.call('DELETE', `/api/admin/devices/${devs[0].id}`, { cookie })).status, 200);
    assert.equal((await s.next('revoked')).data.code, 'invalid_key');
    assert.equal((await ctx.call('GET', '/api/display/config', { headers: { 'x-marco-key': token } })).status, 403);
    devs = (await ctx.call('GET', '/api/admin/devices', { cookie })).json.devices;
    assert.equal(devs.length, 0);
    assert.equal((await ctx.call('DELETE', '/api/admin/devices/dv_nope', { cookie })).status, 404);
    const activity = fs.readFileSync(path.join(ctx.dir, 'activity.jsonl'), 'utf8');
    assert.match(activity, /display\.paired/);
    assert.match(activity, /display\.device_revoked/);
    assert.ok(!activity.includes(token) && !activity.includes(sessionId));
  });
});

const fakeDisplay = (ip = '192.168.1.50') => ({ ip, get: () => 'Chromium' });
const admin = (ip = '127.0.0.1', epoch = 'e1') => ({ ip, session: { epoch, user: { email: 'admin' } } });

test('pairing rules: TTL, only while the display waits, single use, rate limits (per admin + global, start)', async () => {
  await withServer(async () => {
    const t0 = Date.now();
    // expiry (10 min)
    let st = startPairing(fakeDisplay(), t0);
    assert.equal(pairingStatus(st.sessionId, t0 + PAIR_TTL_MS - 1000).status, 'waiting');
    assert.equal(claimPairing(admin(), { code: st.code, screenId: 's_main' }, t0 + PAIR_TTL_MS + 1).code, 'invalid_code');
    assert.equal(pairingStatus(st.sessionId, t0 + PAIR_TTL_MS + 2).status, 'expired');
    _resetPairing();
    // display stopped polling → code no longer claimable; polling again revives it
    st = startPairing(fakeDisplay(), t0);
    assert.equal(claimPairing(admin(), { code: st.code, screenId: 's_main' }, t0 + WAITING_GRACE_MS + 1000).code, 'invalid_code');
    pairingStatus(st.sessionId, t0 + WAITING_GRACE_MS + 2000);
    assert.ok(claimPairing(admin(), { code: st.code, screenId: 's_main' }, t0 + WAITING_GRACE_MS + 3000).device);
    assert.equal(claimPairing(admin(), { code: st.code, screenId: 's_main' }, t0 + WAITING_GRACE_MS + 3500).code, 'invalid_code', 'single use');
    _resetPairing();
    // malformed codes
    assert.equal(normalizeCode('ABC-23O'), null, 'O is not in the alphabet');
    assert.equal(normalizeCode('abc 234'), 'ABC234');
    assert.equal(normalizeCode('ABCD'), null);
    // per admin (session + address) limit: then 429 even with the right code (no oracle while locked)
    st = startPairing(fakeDisplay(), t0);
    for (let i = 0; i < CLAIM_FAIL_LIMIT; i++) assert.equal(claimPairing(admin(), { code: 'ZZZZZZ', screenId: 's_main' }, t0).status, 404);
    assert.equal(claimPairing(admin(), { code: st.code, screenId: 's_main' }, t0).status, 429);
    // another admin session is not blocked by it…
    assert.ok(claimPairing(admin('127.0.0.1', 'e2'), { code: st.code, screenId: 's_main' }, t0).device);
    // …and the window passes
    _resetPairing();
    // global limit across sessions / addresses
    st = startPairing(fakeDisplay(), t0);
    for (let i = 0; i < CLAIM_FAIL_GLOBAL; i++) claimPairing(admin(`10.0.${i}.1`, `g${i}`), { code: 'ZZZZZZ', screenId: 's_main' }, t0);
    assert.equal(claimPairing(admin('10.9.9.9', 'fresh'), { code: st.code, screenId: 's_main' }, t0).status, 429);
    _resetPairing();
    // starting codes: per address limit, unique codes
    const codes = new Set();
    for (let i = 0; i < START_LIMIT; i++) codes.add(startPairing(fakeDisplay('192.168.1.77'), t0).code);
    assert.equal(codes.size, START_LIMIT);
    assert.equal(startPairing(fakeDisplay('192.168.1.77'), t0).status, 429);
    assert.ok(startPairing(fakeDisplay('192.168.1.78'), t0).code);
    assert.equal(_pendingCount(), START_LIMIT + 1);
    _resetPairing();
  });
});

test('pairing start is rate-limited over HTTP too', async () => {
  await withServer(async (ctx) => {
    for (let i = 0; i < START_LIMIT; i++) assert.equal((await ctx.call('POST', '/api/pair/start', { body: {} })).status, 200);
    const r = await ctx.call('POST', '/api/pair/start', { body: {} });
    assert.equal(r.status, 429);
    assert.ok(r.headers.get('retry-after'));
  });
});

test('redaction: keys, device tokens and pairing ids never reach logs', async () => {
  const key = '2f1c29f3-0c34-4e29-a6ac-ea4627b72883';
  const tok = `md_${'x'.repeat(43)}`;
  assert.equal(redactSecrets(`/d/${key}?client=pi`), '/d/[redacted]?client=pi');
  assert.equal(redactSecrets(`/api/stream?client=a&k=${key}&x=1`), '/api/stream?client=a&k=[redacted]&x=1');
  assert.equal(redactSecrets(`token ${tok} used`), 'token md_[redacted] used');
  assert.equal(redactSecrets('/api/events?from=2026-01-01'), '/api/events?from=2026-01-01');
  await withServer(async () => {
    logActivity('test.redaction', { actor: 'system', data: { url: `/d/${key}`, token: tok, nested: { u: `/media/photos/a.jpg?k=${key}` } } });
    const e = listActivity({ type: 'test' }).items[0];
    const s = JSON.stringify(e);
    assert.ok(!s.includes(key) && !s.includes(tok), s);
    assert.match(s, /\[redacted\]/);
  });
  // server error log lines (5xx) carry the redacted URL
  const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(src, /console\.error\('\[server\]', req\.method, redactSecrets\(req\.originalUrl\)/);
});

test('migration: existing configs keep working (open), fresh installs are private, saves keep the mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-access-mig-'));
  try {
    // fresh install: no config file → private
    store.initStore(dir);
    assert.equal(store.getConfig().security.displayAccess, 'private');
    assert.equal(store.migratedOnLoad, null);
    // existing v2 config from 0.2 (no `security`) → open, persisted, reported
    const old = defaultConfig();
    delete old.security;
    old.revision = 7;
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(old));
    store.initStore(dir);
    assert.equal(store.getConfig().security.displayAccess, 'open');
    assert.equal(store.migratedOnLoad.displayAccess, 'open');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).security.displayAccess, 'open');
    // reload: already migrated, nothing reported
    store.initStore(dir);
    assert.equal(store.getConfig().security.displayAccess, 'open');
    assert.equal(store.migratedOnLoad, null);
    // a save without `security` (old admin build, old backup / export) keeps the current mode…
    const noSec = structuredClone(store.getConfig());
    delete noSec.security;
    assert.ok(store.saveConfig(noSec, { backup: false }).ok);
    assert.equal(store.getConfig().security.displayAccess, 'open');
    // …an explicit one changes it; invalid values are refused
    assert.ok(store.saveConfig({ ...noSec, security: { displayAccess: 'private' } }, { backup: false }).ok);
    assert.equal(store.getConfig().security.displayAccess, 'private');
    assert.ok(store.saveConfig(noSec, { backup: false }).ok);
    assert.equal(store.getConfig().security.displayAccess, 'private');
    assert.equal(store.saveConfig({ ...noSec, security: { displayAccess: 'public' } }, { backup: false }).ok, false);
    // v1 (single-screen) configs are old by definition → open
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ version: 1, screen: { name: 'Salón' }, calendar: { sources: [] } }));
    store.initStore(dir);
    assert.equal(store.getConfig().security.displayAccess, 'open');
    assert.equal(store.migratedOnLoad.from, 1);
    assert.equal(store.migratedOnLoad.displayAccess, 'open');
    // every screen gets a UUIDv4 key in secrets.json (0600)
    syncDisplayKeys();
    const sec = JSON.parse(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8'));
    for (const s of store.getConfig().screens) assert.match(sec.displayKeys[s.id].key, KEY_RE);
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'secrets.json')).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('export with secrets → import on another install keeps private links and paired devices', async () => {
  await withServer(async (ctx) => {
    const cookie = await ctx.login();
    const key = keyOf('kitchen');
    const st = startPairing(fakeDisplay(), Date.now());
    claimPairing(admin(), { code: st.code, screenId: 's_kitchen', name: 'Hall tablet' });
    const token = pairingStatus(st.sessionId).token;
    const plain = (await ctx.call('POST', '/api/admin/export', { cookie, body: { includeSecrets: false } })).json;
    assert.ok(!JSON.stringify(plain).includes(key), 'keys only travel in exports that include secrets');
    const bundle = (await ctx.call('POST', '/api/admin/export', { cookie, body: { includeSecrets: true } })).json;
    assert.equal(bundle.secrets.displayKeys.s_kitchen.key, key);
    assert.ok(!JSON.stringify(bundle).includes(token), 'device tokens are exported as hashes only');
    // "another install": new keys, no devices
    await ctx.call('POST', '/api/admin/display-links/s_kitchen/regenerate', { cookie, body: {} });
    await ctx.call('DELETE', `/api/admin/devices/${bundle.secrets.devices[0].id}`, { cookie });
    assert.equal((await ctx.call('GET', '/api/events', { headers: { 'x-marco-key': key } })).status, 403);
    const ap = await ctx.call('POST', '/api/admin/import/apply', { cookie, body: { bundle, includeSecrets: true } });
    assert.equal(ap.status, 200, ap.text);
    assert.equal((await ctx.call('GET', '/api/display/config', { headers: { 'x-marco-key': key } })).json.screenId, 's_kitchen');
    assert.equal((await ctx.call('GET', '/api/display/config', { headers: { 'x-marco-key': token } })).json.screenId, 's_kitchen');
  });
});
