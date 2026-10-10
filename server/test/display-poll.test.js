// Poll command channel (GET /api/display/poll, server/pollHub.js): reset and replay, cursors, target filtering,
// identify per display, alerts filter, TTLs, the ring buffer, preview polls, connected displays and `next`.
// Runs the real app (server/app.js createApp) on a random port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../store.js';
import { defaultConfig, defaultScreenProfile } from '../core/defaults.js';
import { ensurePassword, hashPassword } from '../auth.js';
import { createApp } from '../app.js';
import { closeAll } from '../sse.js';
import { _resetDisplays, setServerVersion, listDisplays } from '../displays.js';
import { _resetAnnouncements } from '../announce.js';
import { _resetActivityThrottle } from '../activity.js';
import { _resetPairing } from '../pairing.js';
import { syncDisplayKeys, listDisplayLinks, _resetDisplayAccess } from '../displayAccess.js';
import {
  _resetPoll, readSince, record, currentCursor, pollEpoch, RING_SIZE, MAX_POLLERS_PER_IP, POLL_FAST_MS, POLL_HIDDEN_MS, POLL_NEXT_MS,
} from '../pollHub.js';

const realFetch = globalThis.fetch;
const offlineFetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-poll-'));
  globalThis.fetch = offlineFetch;
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'private';
  c.screens.push(defaultScreenProfile({ id: 's_kitchen', slug: 'kitchen', name: 'Kitchen' }));
  c.screens.push(defaultScreenProfile({ id: 's_hall', slug: 'hall', name: 'Hall' }));
  c.screens[2].alerts.enabled = false;
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ passwordHash: await hashPassword('secret-pass-123'), passwordIsDefault: false }));
  store.initStore(dir);
  _resetDisplays();
  _resetAnnouncements();
  _resetPairing();
  _resetActivityThrottle();
  _resetDisplayAccess();
  _resetPoll();
  setServerVersion('0.5.0');
  await ensurePassword();
  syncDisplayKeys();
  const app = createApp({ version: '0.5.0', dist: path.join(dir, 'dist') });
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
    return { status: r.status, json, text, headers: r.headers, setCookie: r.headers.getSetCookie?.() || [] };
  };
  const login = async () => {
    const r = await call('POST', '/api/auth/login', { body: { password: 'secret-pass-123' } });
    assert.equal(r.status, 200);
    return r.setCookie.map((x) => x.split(';')[0]).join('; ');
  };
  const key = (slug) => listDisplayLinks().find((l) => l.slug === slug).key;
  /** One poll as a display with the private link of `slug`. */
  const poll = async (slug, q = {}) => {
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined)).toString();
    const r = await call('GET', `/api/display/poll?${qs}`, { headers: { 'x-marco-key': key(slug) } });
    assert.equal(r.status, 200, r.text);
    return r.json;
  };
  try {
    await fn({ call, login, poll, key });
  } finally {
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
  }
}

const types = (r) => r.commands.map((c) => c.type);

test('first poll is a reset: revision, screen, version, cursor and the active announcements of that screen only', async () => {
  await withServer(async ({ call, login, poll }) => {
    const cookie = await login();
    const all = await call('POST', '/api/admin/announce', { cookie, body: { title: 'Dinner', durationSec: 600 } });
    assert.equal(all.status, 200, all.text);
    const main = await call('POST', '/api/admin/announce', { cookie, body: { title: 'Main only', screens: ['s_main'], durationSec: 600 } });
    assert.equal(main.status, 200, main.text);
    const r = await poll('kitchen', { client: 'kiosk-k1' });
    assert.equal(r.reset, true);
    assert.equal(r.screenId, 's_kitchen');
    assert.equal(r.revision, store.getConfig().revision);
    assert.equal(r.serverVersion, '0.5.0');
    assert.ok(Date.parse(r.now) > 0);
    assert.match(r.cursor, new RegExp(`^${pollEpoch()}:\\d+$`));
    assert.deepEqual(r.commands.map((c) => [c.type, c.title]), [['announce', 'Dinner']]);
    assert.deepEqual(r.activeAnnouncementIds, [all.json.announcement.id]);
    assert.equal(typeof r.next, 'number');
    // alerts off on that screen: nothing replayed, and the display drops what it shows
    const hall = await poll('hall', { client: 'kiosk-h1' });
    assert.deepEqual(hall.commands, []);
    assert.deepEqual(hall.activeAnnouncementIds, []);
    // a regular poll right after: nothing new, no announcement ids
    const again = await poll('kitchen', { client: 'kiosk-k1', cursor: r.cursor });
    assert.equal(again.reset, false);
    assert.deepEqual(again.commands, []);
    assert.equal(again.activeAnnouncementIds, undefined);
    assert.equal(again.cursor, r.cursor);
  });
});

test('commands since the cursor follow the target: screens, single displays, identify per display, alerts filter', async () => {
  await withServer(async ({ call, login, poll }) => {
    const cookie = await login();
    const k = await poll('kitchen', { client: 'kiosk-k1' });
    const m = await poll('living-room', { client: 'kiosk-m1' });
    const h = await poll('hall', { client: 'kiosk-h1' });
    const cmd = (body) => call('POST', '/api/admin/displays/command', { cookie, body });
    let r = await cmd({ action: 'reload', screens: ['kitchen'] });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.delivered, 1, 'a display that polled in the last 4 minutes counts as reached');
    r = await cmd({ action: 'night', mode: 'on', clientIds: ['kiosk-m1'] });
    assert.equal(r.json.delivered, 1);
    assert.equal((await cmd({ action: 'night', mode: 'sideways' })).status, 400);
    r = await cmd({ action: 'identify' });
    assert.equal(r.json.delivered, 3);
    const ann = await call('POST', '/api/admin/announce', { cookie, body: { title: 'Shoes on', durationSec: 600 } });
    assert.equal(ann.json.delivered, 2, 'the hall has alerts off');
    const del = await call('DELETE', `/api/admin/announcements/${ann.json.announcement.id}`, { cookie });
    assert.equal(del.status, 200, del.text);

    const k2 = await poll('kitchen', { client: 'kiosk-k1', cursor: k.cursor });
    assert.equal(k2.reset, false);
    assert.deepEqual(types(k2), ['reload', 'identify', 'announce-clear'], 'a cleared announcement is not delivered late');
    const id = k2.commands.find((c) => c.type === 'identify');
    assert.deepEqual(id, { type: 'identify', name: 'Kitchen', slug: 'kitchen', clientId: 'kiosk-k1', durationSec: 10 });
    assert.deepEqual(k2.activeAnnouncementIds, []);

    const m2 = await poll('living-room', { client: 'kiosk-m1', cursor: m.cursor });
    assert.deepEqual(types(m2), ['night', 'identify', 'announce-clear']);
    assert.deepEqual(m2.commands[0], { type: 'night', mode: 'on' });
    assert.equal(m2.commands[1].clientId, 'kiosk-m1');

    const h2 = await poll('hall', { client: 'kiosk-h1', cursor: h.cursor });
    assert.deepEqual(types(h2), ['identify', 'announce-clear']);
    assert.equal(h2.commands[0].name, 'Hall');
  });
});

test('an announcement still running reaches a poller, with its ids; photos and refresh too', async () => {
  await withServer(async ({ call, login, poll }) => {
    const cookie = await login();
    const k = await poll('kitchen', { client: 'kiosk-k1' });
    const ann = await call('POST', '/api/admin/announce', { cookie, body: { title: 'Bins out', emoji: '🗑️', durationSec: 600 } });
    const ref = await call('POST', '/api/admin/refresh-displays', { cookie, body: {} });
    assert.equal(ref.json.delivered, 1);
    assert.equal(ref.json.displays, 1);
    const r = await poll('kitchen', { client: 'kiosk-k1', cursor: k.cursor });
    assert.deepEqual(types(r), ['announce', 'reload']);
    assert.equal(r.commands[0].id, ann.json.announcement.id);
    assert.equal(r.commands[0].title, 'Bins out');
    assert.deepEqual(r.activeAnnouncementIds, [ann.json.announcement.id]);
  });
});

test('unknown, foreign, future and restarted cursors get a reset, never old commands', async () => {
  await withServer(async ({ call, login, poll }) => {
    const cookie = await login();
    const k = await poll('kitchen', { client: 'kiosk-k1' });
    await call('POST', '/api/admin/refresh-displays', { cookie, body: {} });
    for (const cursor of ['garbage', 'abc', `${pollEpoch()}:999999`, `00000000:0`, `${pollEpoch()}:-1`, `${pollEpoch()}:1:2`]) {
      const r = await poll('kitchen', { client: 'kiosk-k1', cursor });
      assert.equal(r.reset, true, cursor);
      assert.deepEqual(r.commands, [], cursor);
    }
    // a server restart (new epoch) resets every cursor
    _resetPoll();
    const r = await poll('kitchen', { client: 'kiosk-k1', cursor: k.cursor });
    assert.equal(r.reset, true);
    assert.notEqual(r.cursor, k.cursor);
  });
});

test('preview polls get commands but are not registered or counted', async () => {
  await withServer(async ({ call, login, key }) => {
    const cookie = await login();
    const first = await call('GET', '/api/display/poll?client=kiosk-p&preview=1', { headers: { 'x-marco-key': key('kitchen') } });
    assert.equal(first.status, 200);
    assert.equal(listDisplays().length, 0);
    const r = await call('POST', '/api/admin/displays/command', { cookie, body: { action: 'reload', screens: ['kitchen'] } });
    assert.equal(r.json.delivered, 0);
    const next = await call('GET', `/api/display/poll?client=kiosk-p&preview=1&cursor=${first.json.cursor}`, { headers: { 'x-marco-key': key('kitchen') } });
    assert.deepEqual(types(next.json), ['reload']);
    assert.equal(listDisplays().length, 0);
  });
});

test('a poller is a connected display: listed, its device connected, not forgettable; access rules apply', async () => {
  await withServer(async ({ call, login, poll }) => {
    const cookie = await login();
    await poll('kitchen', { client: 'kiosk-k1' });
    const list = await call('GET', '/api/admin/displays', { cookie });
    const d = list.json.displays.find((x) => x.clientId === 'kiosk-k1');
    assert.equal(d.connected, true);
    assert.equal(d.screenId, 's_kitchen');
    assert.equal(d.access, 'key');
    assert.ok(d.connectedAt);
    assert.equal((await call('DELETE', '/api/admin/displays/kiosk-k1', { cookie })).status, 409);
    const status = await call('GET', '/api/admin/status', { cookie });
    assert.equal(status.json.displays, 1);
    // no credential / a bad one: the usual 401 / 403 with no data
    const no = await call('GET', '/api/display/poll?client=x1');
    assert.equal(no.status, 401);
    assert.deepEqual(Object.keys(no.json).sort(), ['code', 'error']);
    assert.equal((await call('GET', '/api/display/poll?client=x1', { headers: { 'x-marco-key': '00000000-0000-4000-8000-000000000000' } })).status, 403);
    // anonymous polls (no valid client id) are answered but not registered
    const anon = await call('GET', '/api/display/poll?client=bad%20id', { headers: { 'x-marco-key': listDisplayLinks()[0].key } });
    assert.equal(anon.status, 200);
    assert.equal(listDisplays().length, 1);
  });
});

test('a paired device moved to another screen sees the new screen id on its next poll', async () => {
  await withServer(async ({ call, login }) => {
    const cookie = await login();
    const st = await call('POST', '/api/pair/start', { body: {} });
    const claim = await call('POST', '/api/admin/pair/claim', { cookie, body: { code: st.json.code, screenId: 's_kitchen', name: 'Tablet', confirm: true } });
    assert.equal(claim.status, 200, claim.text);
    const token = (await call('POST', '/api/pair/status', { body: { sessionId: st.json.sessionId } })).json.token;
    const p1 = await call('GET', '/api/display/poll?client=tab-1', { headers: { 'x-marco-key': token } });
    assert.equal(p1.json.screenId, 's_kitchen');
    const devs = await call('GET', '/api/admin/devices', { cookie });
    const dev = devs.json.devices[0];
    assert.equal(dev.connected, true);
    assert.deepEqual(dev.clientIds, ['tab-1']);
    assert.equal((await call('PATCH', `/api/admin/devices/${dev.id}`, { cookie, body: { screenId: 's_main' } })).status, 200);
    const p2 = await call('GET', `/api/display/poll?client=tab-1&cursor=${p1.json.cursor}`, { headers: { 'x-marco-key': token } });
    assert.equal(p2.json.screenId, 's_main');
    await call('DELETE', `/api/admin/devices/${dev.id}`, { cookie });
    assert.equal((await call('GET', '/api/display/poll?client=tab-1', { headers: { 'x-marco-key': token } })).status, 403);
  });
});

test('a revoked credential stops a poller counting as connected at once: new link, revoked device', async () => {
  await withServer(async ({ call, login, poll }) => {
    const cookie = await login();
    await poll('kitchen', { client: 'kiosk-k1' });
    await poll('hall', { client: 'kiosk-h1' });
    const st = await call('POST', '/api/pair/start', { body: {} });
    await call('POST', '/api/admin/pair/claim', { cookie, body: { code: st.json.code, screenId: 's_kitchen', name: 'Tablet', confirm: true } });
    const token = (await call('POST', '/api/pair/status', { body: { sessionId: st.json.sessionId } })).json.token;
    assert.equal((await call('GET', '/api/display/poll?client=tab-1', { headers: { 'x-marco-key': token } })).status, 200);
    const connected = async () => (await call('GET', '/api/admin/displays', { cookie })).json.displays
      .filter((d) => d.connected).map((d) => d.clientId).sort();
    assert.deepEqual(await connected(), ['kiosk-h1', 'kiosk-k1', 'tab-1']);
    // a new private link for the kitchen: the old link's poller is no longer connected and can be forgotten
    assert.equal((await call('POST', '/api/admin/display-links/s_kitchen/regenerate', { cookie })).status, 200);
    assert.deepEqual(await connected(), ['kiosk-h1', 'tab-1']);
    assert.equal((await call('DELETE', '/api/admin/displays/kiosk-k1', { cookie })).status, 200);
    // a revoked device: the same
    const dev = (await call('GET', '/api/admin/devices', { cookie })).json.devices[0];
    assert.equal((await call('DELETE', `/api/admin/devices/${dev.id}`, { cookie })).status, 200);
    assert.deepEqual(await connected(), ['kiosk-h1']);
    assert.equal((await call('DELETE', '/api/admin/displays/tab-1', { cookie })).status, 200);
    assert.equal((await call('GET', '/api/admin/status', { cookie })).json.displays, 1);
  });
});

test('one address cannot list more than MAX_POLLERS_PER_IP pollers, but every poll is answered', async () => {
  await withServer(async ({ poll }) => {
    for (let i = 0; i < MAX_POLLERS_PER_IP + 5; i++) {
      const r = await poll('kitchen', { client: `flood-${i}` });
      assert.equal(r.reset, true);
    }
    assert.equal(listDisplays().length, MAX_POLLERS_PER_IP);
    // a display already listed keeps polling as before
    await poll('kitchen', { client: 'flood-0' });
    assert.equal(listDisplays().filter((d) => d.connected).length, MAX_POLLERS_PER_IP);
  });
});

test('next: normal, hidden, and short while an admin has the displays page open', async () => {
  await withServer(async ({ call, login, poll }) => {
    assert.equal((await poll('kitchen', { client: 'k1' })).next, POLL_NEXT_MS);
    assert.equal((await poll('kitchen', { client: 'k1', hidden: '1' })).next, POLL_HIDDEN_MS);
    const cookie = await login();
    await call('GET', '/api/admin/displays', { cookie });
    assert.equal((await poll('kitchen', { client: 'k1' })).next, POLL_FAST_MS);
    assert.equal((await poll('kitchen', { client: 'k1', hidden: '1' })).next, POLL_FAST_MS);
  });
});

test('ring buffer: TTLs per command, oldest entries dropped, an old cursor resets', () => {
  _resetPoll();
  const client = { clientId: 'k1', screenId: 's_main', anonymous: false };
  const screenOf = () => ({ name: 'Main', slug: 'main' });
  const t0 = 1_000_000;
  const start = currentCursor();
  record('identify', { durationSec: 10 }, null, null, t0);
  record('reload', {}, null, null, t0);
  record('announce', { id: 'a1', title: 'x', expiresAt: new Date(t0 + 30_000).toISOString() }, null, null, t0);
  record('ping', {}, null, null, t0);
  record('config', { revision: 3 }, null, null, t0);
  assert.deepEqual(readSince(start, client, screenOf, t0 + 1000).commands.map((c) => c.type), ['identify', 'reload', 'announce']);
  assert.deepEqual(readSince(start, client, screenOf, t0 + 45_000).commands.map((c) => c.type), ['identify', 'reload'], 'announce expired');
  assert.deepEqual(readSince(start, client, screenOf, t0 + 61_000).commands.map((c) => c.type), ['reload'], 'identify lives 60 s');
  assert.deepEqual(readSince(start, client, screenOf, t0 + 601_000).commands, [], 'reload lives 10 min');
  for (let i = 0; i < RING_SIZE; i++) record('photos', {}, null, null, t0);
  assert.equal(readSince(start, client, screenOf, t0).reset, true, 'entries the cursor never saw were dropped');
  const recent = `${pollEpoch()}:${Number(currentCursor().split(':')[1]) - RING_SIZE}`;
  assert.equal(readSince(recent, client, screenOf, t0).reset, false);
  assert.equal(readSince(recent, client, screenOf, t0).commands.length, RING_SIZE);
  _resetPoll();
});
