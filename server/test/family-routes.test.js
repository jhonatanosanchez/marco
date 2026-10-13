// Familia through the real app: the admin API, the family page (X-Family-Key) with its rate limits, touch on the
// TV with the per-screen setting and privacy mode, the display config's family block, live events, the state file,
// export / import and the activity log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../store.js';
import { defaultConfig, defaultScreenProfile } from '../core/defaults.js';
import { hashPassword, ensurePassword } from '../auth.js';
import { createApp } from '../app.js';
import { closeAll } from '../sse.js';
import { _resetDisplays, setServerVersion } from '../displays.js';
import { _resetAnnouncements } from '../announce.js';
import { _resetActivityThrottle, listActivity } from '../activity.js';
import { _resetPrivacy } from '../privacy.js';
import { _resetFamily, familyState, familyClock, BAD_KEY_LIMIT } from '../family.js';
import { addDays } from '../core/lib/tz.js';
import { RETENTION_DAYS } from '../core/familyCore.js';
import { redactSecrets } from '../core/activityCore.js';
import { displayKeyFor } from '../displayAccess.js';
import { makeJpeg, makePng, makeWebp } from './photoBytes.js';
import { collectUnused, UNUSED_GRACE_MS, MAX_STORED } from '../familyPhotos.js';

const realFetch = globalThis.fetch;
const offlineFetch = (url, opts) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(url)) ? realFetch(url, opts) : Promise.reject(new Error('offline test')));

function familyBlock() {
  return {
    enabled: true,
    members: [
      { id: 'm_lucia', name: 'Lucía', avatar: '🦊', kid: true },
      { id: 'm_mateo', name: 'Mateo', avatar: '🐻', kid: true },
      { id: 'm_mama', name: 'Mamá', avatar: '🌷', kid: false },
    ],
    chores: [
      { id: 'h_bed', memberId: 'm_lucia', title: 'Hacer la cama', emoji: '🛏️', slot: 'morning', points: 2 },
      { id: 'h_teeth', memberId: 'm_lucia', title: 'Dientes', emoji: '🪥', slot: 'evening', points: 1 },
      { id: 'h_toys', memberId: 'm_mateo', title: 'Juguetes', emoji: '🧸', slot: 'any', points: 1 },
    ],
    rewards: [{ id: 'w_ice', title: 'Helado', emoji: '🍦', cost: 3 }, { id: 'w_movie', title: 'Peli', emoji: '🎬', cost: 10 }],
    meals: { enabled: true, slots: ['lunch', 'dinner'], template: { 0: { lunch: 'Paella' }, 1: { lunch: 'Lentejas' }, 2: { lunch: 'Arroz' }, 3: { lunch: 'Sopa' }, 4: { lunch: 'Pasta' }, 5: { lunch: 'Pizza' }, 6: { lunch: 'Pollo' } } },
  };
}

async function withServer(fn, { mut = () => {}, familyFile = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-family-'));
  globalThis.fetch = offlineFetch;
  const prevLan = process.env.LAN_ADDRESS;
  process.env.LAN_ADDRESS = '192.168.0.50';
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.security.displayAccess = 'open';
  c.revision = 8000 + Math.floor(Math.random() * 1000);
  c.family = familyBlock();
  c.screens.push(defaultScreenProfile({ id: 's_kitchen', slug: 'kitchen', name: 'Kitchen' }));
  mut(c);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ passwordHash: await hashPassword('secret-pass-123'), passwordIsDefault: false }));
  if (familyFile !== null) fs.writeFileSync(path.join(dir, 'family.json'), typeof familyFile === 'string' ? familyFile : JSON.stringify(familyFile));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'family'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>display</title>');
  fs.writeFileSync(path.join(dist, 'family', 'index.html'), '<!doctype html><title>family</title>');
  store.initStore(dir);
  _resetDisplays();
  _resetAnnouncements();
  _resetActivityThrottle();
  _resetPrivacy();
  _resetFamily();
  setServerVersion('0.5.3');
  await ensurePassword();
  const app = createApp({ version: '0.5.3', dist });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, url, { body, headers = {}, cookie = '', raw } = {}) => {
    const r = await realFetch(base + url, {
      method,
      headers: { ...headers, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers, setCookie: r.headers.getSetCookie?.() || [] };
  };
  const streams = [];
  const sse = async (slug, client) => {
    const ctl = new AbortController();
    const r = await realFetch(`${base}/api/stream?${new URLSearchParams({ screen: slug, client })}`, { signal: ctl.signal });
    assert.equal(r.status, 200);
    const events = [];
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const pump = (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.*)$/m.exec(block)?.[1];
            if (ev) events.push({ event: ev, data: data ? JSON.parse(data) : {} });
          }
        }
      } catch { /* aborted */ }
    })();
    const st = {
      events,
      async waitFor(name, pred = () => true) {
        for (let i = 0; i < 100; i++) {
          const hit = events.find((e) => e.event === name && pred(e.data));
          if (hit) return hit;
          await new Promise((res) => setTimeout(res, 20));
        }
        throw new Error(`no ${name} event`);
      },
      close() { ctl.abort(); return pump; },
    };
    streams.push(st);
    await st.waitFor('hello');
    return st;
  };
  const login = async () => {
    const r = await call('POST', '/api/auth/login', { body: { password: 'secret-pass-123' } });
    assert.equal(r.status, 200);
    return r.setCookie.map((x) => x.split(';')[0]).join('; ');
  };
  /** Create the family link from the admin; returns the key. */
  const makeLink = async (cookie) => {
    const r = await call('POST', '/api/admin/family/link', { cookie });
    assert.equal(r.status, 200, r.text);
    return r.json.link.path.slice('/f/'.length);
  };
  const phone = (key) => ({ 'x-family-key': key });
  try {
    await fn({ call, login, dir, sse, port, makeLink, phone });
  } finally {
    await Promise.all(streams.map((x) => x.close()));
    _resetPrivacy();
    _resetFamily();
    closeAll();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
    globalThis.fetch = realFetch;
    if (prevLan === undefined) delete process.env.LAN_ADDRESS; else process.env.LAN_ADDRESS = prevLan;
  }
}

const setConfig = (fn) => {
  const r = store.updateConfig(fn);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
};

test('admin endpoints need a session; the family link is created, replaced and removed', async () => {
  await withServer(async ({ call, login, makeLink, phone }) => {
    assert.equal((await call('GET', '/api/admin/family')).status, 401);
    assert.equal((await call('POST', '/api/admin/family/link', { body: {} })).status, 401);
    const cookie = await login();
    const st = await call('GET', '/api/admin/family', { cookie });
    assert.equal(st.status, 200);
    assert.equal(st.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(st.json.link, { exists: false, path: null, createdAt: null });
    assert.deepEqual(st.json.lanAddresses, ['192.168.0.50']);
    assert.deepEqual(st.json.points, { m_lucia: 0, m_mateo: 0 });
    assert.deepEqual(st.json.progress.m_lucia, { done: 0, total: 2 });

    // no link yet: any key is wrong
    assert.equal((await call('GET', '/api/family/state', { headers: phone(`fk_${'a'.repeat(32)}`) })).status, 403);
    const key = await makeLink(cookie);
    assert.match(key, /^fk_[A-Za-z0-9_-]{32}$/);
    assert.equal(store.getSecrets().family.key, key);
    const ok = await call('GET', '/api/family/state', { headers: phone(key) });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'private, no-store');
    assert.equal(ok.json.lang, 'en');
    assert.deepEqual(ok.json.members.map((m) => m.name), ['Lucía', 'Mateo', 'Mamá']);
    assert.equal(ok.json.meals.slots.length, 2);
    assert.ok(ok.json.meals.today.lunch);
    const none = await call('GET', '/api/family/state');
    assert.equal(none.status, 401);
    assert.equal(none.json.code, 'key_required');
    const wrong = await call('GET', '/api/family/state', { headers: phone(`${key.slice(0, -1)}${key.at(-1) === 'A' ? 'B' : 'A'}`) });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.json.code, 'invalid_key');

    const key2 = await makeLink(cookie);
    assert.notEqual(key2, key);
    assert.equal((await call('GET', '/api/family/state', { headers: phone(key) })).status, 403, 'the old link stops working');
    assert.equal((await call('GET', '/api/family/state', { headers: phone(key2) })).status, 200);
    assert.equal((await call('GET', '/api/admin/family', { cookie })).json.link.path, `/f/${key2}`);
    assert.equal((await call('DELETE', '/api/admin/family/link', { cookie })).status, 200);
    assert.equal((await call('DELETE', '/api/admin/family/link', { cookie })).status, 404);
    assert.equal((await call('GET', '/api/family/state', { headers: phone(key2) })).status, 403);
    assert.equal(store.getSecrets().family, undefined);

    const actions = listActivity({ type: 'family.link' }).items.map((e) => e.data.action);
    assert.deepEqual(actions, ['revoked', 'regenerated', 'created']);
    // the family page itself
    const page = await call('GET', `/f/${key2}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /family/);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(page.headers.get('cache-control'), 'private, no-store');
    assert.equal((await call('GET', '/f')).status, 200);
  });
});

test('wrong keys are rate-limited per address (the right key still works)', async () => {
  await withServer(async ({ call, login, makeLink, phone }) => {
    const key = await makeLink(await login());
    const bad = phone(`fk_${'b'.repeat(32)}`);
    for (let i = 0; i < BAD_KEY_LIMIT; i++) assert.equal((await call('GET', '/api/family/state', { headers: bad })).status, 403, `try ${i + 1}`);
    const locked = await call('GET', '/api/family/state', { headers: bad });
    assert.equal(locked.status, 429);
    assert.equal(locked.json.code, 'rate_limited');
    assert.equal(locked.headers.get('retry-after'), '600');
    assert.equal((await call('GET', '/api/family/state', { headers: phone(key) })).status, 200, 'guessing never locks the family out');
    assert.equal((await call('GET', '/api/family/state', { headers: bad })).status, 429);
    const rejected = listActivity({ type: 'family.key_rejected' }).items;
    assert.ok(rejected.length >= 2 && rejected.length <= 4, `logged once per window and reason, got ${rejected.length}`);
    assert.ok(rejected.every((e) => e.level === 'warn'));
    assert.deepEqual([...new Set(rejected.map((e) => e.data.reason))].sort(), ['invalid_key', 'rate_limited']);
  });
});

test('family page: toggle today, refused past days and non-JSON, redeem only when parents allow it', async () => {
  await withServer(async ({ call, login, makeLink, phone }) => {
    const cookie = await login();
    const key = await makeLink(cookie);
    const t = await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_bed', done: true } });
    assert.equal(t.status, 200, t.text);
    assert.equal(t.json.state.chores.find((c) => c.id === 'h_bed').done, true);
    assert.equal(t.json.state.members[0].points, 2);
    assert.equal(t.json.state.members[0].done, 1);
    const admin = (await call('GET', '/api/admin/family', { cookie })).json;
    assert.equal(admin.completions[0].choreId, 'h_bed');
    assert.equal(admin.completions[0].by, 'phone');
    assert.equal(admin.points.m_lucia, 2);

    const { today } = familyClock();
    const past = await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_bed', done: false, date: addDays(today, -1) } });
    assert.equal(past.status, 400);
    assert.equal(past.json.code, 'bad_date');
    assert.equal((await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_nope', done: true } })).status, 404);
    const form = await call('POST', '/api/family/toggle', { headers: { ...phone(key), 'content-type': 'application/x-www-form-urlencoded' }, raw: 'choreId=h_bed&done=true' });
    assert.equal(form.status, 415);
    assert.equal(form.json.error, 'json required');
    const big = await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_bed', done: true, pad: 'x'.repeat(5000) } });
    assert.equal(big.status, 413);

    const off = await call('POST', '/api/family/redeem', { headers: phone(key), body: { rewardId: 'w_ice', memberId: 'm_lucia' } });
    assert.equal(off.status, 403);
    assert.equal(off.json.code, 'redeem_off');
    setConfig((c) => { c.family.allowRedeemFromPhone = true; });
    const poor = await call('POST', '/api/family/redeem', { headers: phone(key), body: { rewardId: 'w_ice', memberId: 'm_lucia' } });
    assert.equal(poor.status, 409);
    assert.equal(poor.json.code, 'not_enough');
    await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_teeth', done: true } });
    const ok = await call('POST', '/api/family/redeem', { headers: phone(key), body: { rewardId: 'w_ice', memberId: 'm_lucia' } });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.state.allowRedeem, true);
    assert.equal(ok.json.state.members[0].points, 0);
    assert.equal((await call('POST', '/api/family/redeem', { headers: phone(key), body: { rewardId: 'w_ice', memberId: 'm_mama' } })).json.code, 'not_kid');

    // turned off in the admin: the page says so
    setConfig((c) => { c.family.enabled = false; });
    const disabled = await call('GET', '/api/family/state', { headers: phone(key) });
    assert.equal(disabled.status, 404);
    assert.equal(disabled.json.code, 'family_off');

    const chore = listActivity({ type: 'family.chore' }).items.at(-1);
    assert.deepEqual(chore.data, { member: 'Lucía', chore: 'Hacer la cama', done: true, via: 'phone' });
    assert.equal(chore.actor, 'family-link');
    assert.deepEqual(listActivity({ type: 'family.redeemed' }).items[0].data, { member: 'Lucía', reward: 'Helado', cost: 3, via: 'phone' });
  });
});

test('admin: past days, adjust, redeem with force, undo', async () => {
  await withServer(async ({ call, login }) => {
    const cookie = await login();
    const { today } = familyClock();
    const two = await call('POST', '/api/admin/family/toggle', { cookie, body: { choreId: 'h_toys', date: addDays(today, -2), done: true } });
    assert.equal(two.status, 200, two.text);
    assert.equal(two.json.state.points.m_mateo, 1);
    assert.equal(two.json.state.completions[0].date, addDays(today, -2));
    assert.equal(listActivity({ type: 'family.chore' }).items[0].data.date, addDays(today, -2));
    assert.equal((await call('POST', '/api/admin/family/toggle', { cookie, body: { choreId: 'h_toys', date: addDays(today, -8), done: true } })).json.code, 'bad_date');
    assert.equal((await call('POST', '/api/admin/family/toggle', { cookie, body: { choreId: 'h_toys', date: addDays(today, 1), done: true } })).json.code, 'bad_date');
    const form = await call('POST', '/api/admin/family/toggle', { cookie, headers: { 'content-type': 'text/plain' }, raw: '{}' });
    assert.equal(form.status, 415);

    const adj = await call('POST', '/api/admin/family/adjust', { cookie, body: { memberId: 'm_mateo', delta: 5, note: 'Ayudó' } });
    assert.equal(adj.status, 200);
    assert.equal(adj.json.state.points.m_mateo, 6);
    assert.equal((await call('POST', '/api/admin/family/adjust', { cookie, body: { memberId: 'm_mateo', delta: 0 } })).json.code, 'bad_delta');
    assert.equal((await call('POST', '/api/admin/family/adjust', { cookie, body: { memberId: 'm_mama', delta: 1 } })).json.code, 'not_kid');
    assert.equal((await call('POST', '/api/admin/family/redeem', { cookie, body: { rewardId: 'w_movie', memberId: 'm_mateo' } })).status, 409);
    const forced = await call('POST', '/api/admin/family/redeem', { cookie, body: { rewardId: 'w_movie', memberId: 'm_mateo', force: true } });
    assert.equal(forced.status, 200);
    assert.equal(forced.json.state.points.m_mateo, -4);
    const rid = forced.json.state.redemptions[0].id;
    const aid = forced.json.state.adjustments[0].id;
    assert.equal(forced.json.state.redemptions[0].by, 'admin');
    const undo = await call('DELETE', `/api/admin/family/redemptions/${rid}`, { cookie });
    assert.equal(undo.json.state.points.m_mateo, 6);
    assert.equal((await call('DELETE', `/api/admin/family/redemptions/${rid}`, { cookie })).status, 404);
    assert.equal((await call('DELETE', `/api/admin/family/adjustments/${aid}`, { cookie })).json.state.points.m_mateo, 1);
    const undone = listActivity({ type: 'family.undone' }).items.map((e) => e.data);
    assert.deepEqual(undone, [{ kind: 'adjustment', member: 'Mateo', delta: 5 }, { kind: 'redemption', member: 'Mateo', reward: 'Peli' }]);
    assert.deepEqual(listActivity({ type: 'family.points' }).items[0].data, { member: 'Mateo', delta: 5, note: 'Ayudó' });
  });
});

test('touch on the TV: only with the screen setting, its members, not while private', async () => {
  await withServer(async ({ call, login }) => {
    const cookie = await login();
    const off = await call('POST', '/api/display/family/toggle?screen=living-room', { body: { choreId: 'h_bed', done: true } });
    assert.equal(off.status, 403);
    assert.equal(off.json.code, 'touch_off');
    setConfig((c) => { c.screens[0].family = { memberIds: ['m_lucia'], touch: true, showQr: true }; });
    // open mode from 127.0.0.1 counts as the local network
    const ok = await call('POST', '/api/display/family/toggle?screen=living-room', { body: { choreId: 'h_bed', done: true } });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.state.touch, true);
    assert.deepEqual(ok.json.state.members.map((m) => m.id), ['m_lucia']);
    assert.equal(ok.json.state.chores.find((c) => c.id === 'h_bed').done, true);
    assert.equal((await call('POST', '/api/display/family/toggle?screen=living-room', { body: { choreId: 'h_toys', done: true } })).status, 403, 'Mateo is not on this screen');
    assert.equal((await call('POST', '/api/display/family/toggle?screen=kitchen', { body: { choreId: 'h_bed', done: false } })).status, 403, 'the kitchen has touch off');
    assert.equal((await call('POST', '/api/display/family/toggle?screen=living-room', { headers: { 'content-type': 'text/plain' }, raw: '{}' })).status, 415);
    const entry = listActivity({ type: 'family.chore' }).items[0];
    assert.deepEqual(entry.data, { member: 'Lucía', chore: 'Hacer la cama', done: true, via: 'display', screen: 'living-room' });
    assert.equal(entry.actor, 'display:living-room');

    const priv = await call('POST', '/api/admin/privacy', { cookie, body: { mode: 'on', screens: ['living-room'] } });
    assert.equal(priv.status, 200, priv.text);
    const no = await call('POST', '/api/display/family/toggle?screen=living-room', { body: { choreId: 'h_bed', done: false } });
    assert.equal(no.status, 403);
    const st = await call('GET', '/api/display/family?screen=living-room');
    assert.equal(st.json.private, true);
    assert.equal(st.json.touch, false);
    assert.deepEqual(st.json.members.map((m) => [m.name, m.points]), [['L', null]]);
    assert.ok(st.json.meals);
    setConfig((c) => { c.family.privacy = 'hide'; });
    const hidden = (await call('GET', '/api/display/family?screen=living-room')).json;
    assert.equal(hidden.hidden, true);
    assert.deepEqual(hidden.members, []);
    assert.equal(familyState().completions[familyClock().today].h_bed.by, 'display');
  });
});

test('touch in private access mode needs the screen credential', async () => {
  await withServer(async ({ call }) => {
    assert.equal((await call('POST', '/api/display/family/toggle?screen=living-room', { body: { choreId: 'h_bed', done: true } })).status, 401);
    const key = displayKeyFor('s_main');
    const ok = await call('POST', '/api/display/family/toggle', { headers: { 'x-marco-key': key }, body: { choreId: 'h_bed', done: true } });
    assert.equal(ok.status, 200, ok.text);
  }, { mut: (c) => { c.security.displayAccess = 'private'; c.screens[0].family = { touch: true }; } });
});

test('display config: the family block and the QR only with a link, showQr and not private', async () => {
  await withServer(async ({ call, login, makeLink, port }) => {
    const cookie = await login();
    const fam = async (slug) => (await call('GET', `/api/display/config?screen=${slug}`)).json.family;
    assert.deepEqual(await fam('living-room'), { enabled: true, mealsEnabled: true, showPoints: true, touch: false, qrUrl: null, privacy: 'initials' });
    const key = await makeLink(cookie);
    assert.equal((await fam('living-room')).qrUrl, `http://192.168.0.50:${port}/f/${key}`, 'a kiosk on localhost gets the LAN address');
    const st = await call('GET', '/api/display/family?screen=living-room');
    assert.equal(st.json.qrUrl, `http://192.168.0.50:${port}/f/${key}`);
    assert.equal((await call('GET', '/api/display/config?screen=living-room', { headers: { 'x-forwarded-for': '203.0.113.5' } })).json.family.qrUrl, null,
      'open mode from outside the home network never gets the family link');
    assert.equal((await call('GET', '/api/display/family?screen=living-room', { headers: { 'x-forwarded-for': '203.0.113.5' } })).json.qrUrl, null);
    setConfig((c) => { c.screens[0].layout.preset = 'bigCalendar'; });
    assert.equal((await fam('living-room')).qrUrl, null, 'only the kids layouts get the QR');
    assert.equal((await call('GET', '/api/display/family?screen=living-room')).json.qrUrl, null);
    setConfig((c) => { c.screens[0].layout.preset = 'kidsRoutines'; c.screens[1].family = { showQr: false, touch: true }; });
    assert.equal((await fam('kitchen')).qrUrl, null);
    assert.equal((await fam('kitchen')).touch, true);
    await call('POST', '/api/admin/privacy', { cookie, body: { mode: 'on', screens: ['living-room'] } });
    const p = await fam('living-room');
    assert.equal(p.qrUrl, null);
    assert.equal(p.showPoints, false);
    const prev = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = 'https://family.example.com/';
    try {
      await call('POST', '/api/admin/privacy', { cookie, body: { mode: 'off', screens: ['living-room'] } });
      assert.equal((await fam('living-room')).qrUrl, `https://family.example.com/f/${key}`);
    } finally {
      if (prev === undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL = prev;
    }
    setConfig((c) => { c.family.enabled = false; });
    assert.equal((await fam('living-room')).enabled, false);
    assert.equal((await fam('living-room')).qrUrl, null);
    assert.equal((await call('GET', '/api/display/family?screen=living-room')).json.code, 'family_off');
  }, { mut: (c) => { c.screens[0].layout.preset = 'kidsFamily'; c.screens[1].layout.preset = 'kidsMeals'; } });
});

test('live events: every change reaches the displays as `family`', async () => {
  await withServer(async ({ call, login, makeLink, phone, sse }) => {
    const cookie = await login();
    const tv = await sse('kitchen', 'kiosk-f1');
    const key = await makeLink(cookie);
    await tv.waitFor('family');
    const n = tv.events.length;
    await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_toys', done: true } });
    const ev = await tv.waitFor('family', (d) => d.rev === familyState().rev);
    assert.ok(tv.events.indexOf(ev) >= n);
    // nothing changed: no event
    const before = tv.events.filter((e) => e.event === 'family').length;
    await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_toys', done: true } });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(tv.events.filter((e) => e.event === 'family').length, before);
  });
});

test('the state file is saved, reloaded and pruned after 90 days on load; a broken file is kept aside', async () => {
  const today = familyClock(defaultConfig()).today;
  const old = addDays(today, -(RETENTION_DAYS + 3));
  const file = {
    version: 1, rev: 9, base: { m_lucia: 4 },
    completions: { [old]: { h_bed: { memberId: 'm_lucia', points: 2, title: 'Cama', emoji: '', by: 'phone', at: `${old}T08:00:00.000Z` } } },
    redemptions: [], adjustments: [{ id: 'ad_1', memberId: 'm_mateo', delta: 3, note: '', at: `${old}T09:00:00.000Z` }],
  };
  await withServer(async ({ call, login, dir }) => {
    const cookie = await login();
    const st = (await call('GET', '/api/admin/family', { cookie })).json;
    assert.deepEqual(st.points, { m_lucia: 6, m_mateo: 3 });
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'family.json'), 'utf8'));
    assert.deepEqual(saved.completions, {});
    assert.deepEqual(saved.adjustments, []);
    assert.deepEqual(saved.base, { m_lucia: 6, m_mateo: 3 });
    await call('POST', '/api/admin/family/toggle', { cookie, body: { choreId: 'h_bed', done: true } });
    _resetFamily();
    const again = (await call('GET', '/api/admin/family', { cookie })).json;
    assert.equal(again.points.m_lucia, 8);
    assert.equal(again.rev, 10);
  }, { familyFile: file });

  await withServer(async ({ call, login, dir }) => {
    const cookie = await login();
    const st = (await call('GET', '/api/admin/family', { cookie })).json;
    assert.equal(st.rev, 0);
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('family.json.corrupt-')));
  }, { familyFile: '{not json' });
});

test('export carries the family state (and the link with secrets); import with the family section restores it', async () => {
  await withServer(async ({ call, login, makeLink, phone, dir }) => {
    const cookie = await login();
    const key = await makeLink(cookie);
    await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_bed', done: true } });
    await call('POST', '/api/admin/family/adjust', { cookie, body: { memberId: 'm_mateo', delta: 7 } });
    const plain = (await call('POST', '/api/admin/export', { cookie, body: {} })).json;
    assert.equal(plain.familyState.adjustments[0].delta, 7);
    assert.equal(plain.secrets, undefined);
    assert.ok(!JSON.stringify(plain).includes(key), 'no key without secrets');
    const full = (await call('POST', '/api/admin/export', { cookie, body: { includeSecrets: true } })).json;
    assert.equal(full.secrets.family.key, key);

    // things change after the export
    await call('POST', '/api/admin/family/adjust', { cookie, body: { memberId: 'm_mateo', delta: 1 } });
    await call('DELETE', '/api/admin/family/link', { cookie });
    const preview = await call('POST', '/api/admin/import/preview', { cookie, body: { bundle: full } });
    assert.equal(preview.status, 200);
    const sec = preview.json.sections.find((s) => s.key === 'family');
    assert.ok(sec, 'family is an import section');
    assert.equal(sec.changed, true);
    assert.match(sec.summary, /stars and history are replaced too/);
    // only another section: the state stays
    const other = await call('POST', '/api/admin/import/apply', { cookie, body: { bundle: full, sections: ['todo'] } });
    assert.equal(other.status, 200, other.text);
    assert.equal((await call('GET', '/api/admin/family', { cookie })).json.points.m_mateo, 8);
    const revBefore = familyState().rev;
    const r = await call('POST', '/api/admin/import/apply', { cookie, body: { bundle: full, sections: ['family'], includeSecrets: true } });
    assert.equal(r.status, 200, r.text);
    const st = (await call('GET', '/api/admin/family', { cookie })).json;
    assert.equal(st.points.m_mateo, 7);
    assert.equal(st.points.m_lucia, 2);
    assert.ok(st.rev > revBefore);
    const copies = fs.readdirSync(dir).filter((n) => n.startsWith('family.json.pre-import-'));
    assert.equal(copies.length, 1, 'the state before the import is kept');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, copies[0]), 'utf8')).adjustments.length, 2);
    assert.equal(st.link.path, `/f/${key}`, 'the family link comes back with the secrets');
    assert.equal((await call('GET', '/api/family/state', { headers: phone(key) })).status, 200);
    const imported = listActivity({ type: 'config.imported' }).items[0];
    assert.equal(imported.data.familyState, true);
    assert.ok(imported.data.secrets.includes('family'));
  });
});

test('activity: no family key or /f/<key> in any entry; redaction patterns', async () => {
  await withServer(async ({ call, login, makeLink, phone }) => {
    const cookie = await login();
    const key = await makeLink(cookie);
    await call('POST', '/api/family/toggle', { headers: phone(key), body: { choreId: 'h_toys', done: true } });
    await call('GET', '/api/family/state', { headers: phone(`fk_${'z'.repeat(32)}`) });
    await makeLink(cookie);
    const all = JSON.stringify(listActivity({ limit: 200 }).items);
    assert.ok(all.includes('family.chore'));
    assert.ok(!all.includes(key));
    assert.ok(!/fk_[A-Za-z0-9_-]{20,}/.test(all));
    assert.ok(!/\/f\/[A-Za-z0-9]/.test(all));
  });
  const k = `fk_${'x'.repeat(32)}`;
  assert.equal(redactSecrets(`/f/${k}?a=1`), '/f/[redacted]?a=1');
  assert.equal(redactSecrets(`key ${k} used`), 'key fk_[redacted] used');
});

// ---------------------------------------------------------------- profile photos

const LAN = { 'x-forwarded-for': '192.168.1.77' };
const b64 = (buf) => Buffer.from(buf).toString('base64');

test('profile photos: upload checks, who may load them, privacy, deletion with the member', async () => {
  await withServer(async ({ call, login, makeLink, phone, dir }) => {
    const cookie = await login();
    const up = (data, c = cookie) => call('POST', '/api/admin/family/photos', { cookie: c, body: { data } });
    assert.equal((await up(b64(makeJpeg(384, 384)), '')).status, 401, 'admin only');
    for (const [bytes, code] of [
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'svg'],
      [Buffer.from('GIF89a\x10\x00\x10\x00\x00\x00\x00;', 'latin1'), 'not_image'],
      [makeJpeg(500, 300), 'not_square'],
    ]) {
      const r = await up(b64(bytes));
      assert.equal(r.status, 400, r.text);
      assert.equal(r.json.code, code);
    }
    assert.equal((await up('###')).json.code, 'not_image');
    assert.equal((await up('')).status, 400);
    assert.equal((await up('A'.repeat(700_000))).status, 413);

    const r = await up(`data:image/jpeg;base64,${b64(makeJpeg(384, 384))}`);
    assert.equal(r.status, 200, r.text);
    const id = r.json.photo;
    assert.match(id, /^[a-f0-9]{24}$/);
    const file = path.join(dir, 'avatars', `${id}.jpg`);
    assert.ok(fs.existsSync(file));
    assert.ok(!fs.readFileSync(file).includes('GPS'), 'stored without its metadata');
    assert.equal((await up(b64(makeJpeg(384, 384)))).json.photo, id, 'same picture, same id');

    const url = `/media/avatars/${id}`;
    // not saved yet: only the admin sees it (the preview of unsaved settings)
    const adm = await call('GET', url, { cookie });
    assert.equal(adm.status, 200);
    assert.equal(adm.headers.get('content-type'), 'image/jpeg');
    assert.match(adm.headers.get('cache-control'), /^private/);
    assert.equal(adm.headers.get('etag'), `"${id}"`);
    assert.equal((await call('GET', url, { cookie, headers: { 'if-none-match': `"${id}"` } })).status, 304);
    assert.equal((await call('GET', `${url}?screen=living-room`)).status, 404, 'a display: nobody uses it yet');

    setConfig((c) => { c.family.members[0].photo = id; });
    // a display in open mode names its screen; from another machine the bare address gets nothing
    assert.equal((await call('GET', `${url}?screen=living-room`, { headers: LAN })).status, 200);
    assert.equal((await call('GET', url, { headers: LAN })).status, 404);
    // open mode serves the local network only
    assert.equal((await call('GET', `${url}?screen=living-room`, { headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 404);
    assert.equal((await call('GET', `${url}?screen=nope`, { headers: LAN })).status, 404);
    assert.equal((await call('GET', `/media/avatars/${'0'.repeat(24)}?screen=living-room`)).status, 404);
    assert.equal((await call('GET', '/media/avatars/..%2Fconfig.json?screen=living-room')).status, 404);
    // a screen that does not show Lucía
    setConfig((c) => { c.screens[1].family = { memberIds: ['m_mateo'], touch: false, showQr: true }; });
    assert.equal((await call('GET', `${url}?screen=kitchen`, { headers: LAN })).status, 404);

    // the family page: the key in the header; nothing without it or with a wrong one
    const key = await makeLink(cookie);
    const ph = await call('GET', url, { headers: phone(key) });
    assert.equal(ph.status, 200);
    assert.equal((await call('GET', url, { headers: phone(`fk_${'b'.repeat(32)}`) })).status, 403);
    assert.equal((await call('GET', '/api/family/state', { headers: phone(key) })).json.members[0].photo, url);

    // privacy mode: the TV gets the emoji and the photo address answers 404
    assert.equal((await call('GET', '/api/display/family?screen=living-room')).json.members[0].photo, url);
    await call('POST', '/api/admin/privacy', { cookie, body: { mode: 'on', screens: ['living-room'] } });
    assert.equal((await call('GET', '/api/display/family?screen=living-room')).json.members[0].photo, null);
    assert.equal((await call('GET', `${url}?screen=living-room`)).status, 404);
    await call('POST', '/api/admin/privacy', { cookie, body: { mode: 'off', screens: ['living-room'] } });
    assert.equal((await call('GET', `${url}?screen=living-room`)).status, 200);

    // family off: displays and phones get nothing
    setConfig((c) => { c.family.enabled = false; });
    assert.equal((await call('GET', `${url}?screen=living-room`)).status, 404);
    assert.equal((await call('GET', url, { headers: phone(key) })).status, 404);
    setConfig((c) => { c.family.enabled = true; });

    // removing the member: screens and phones lose the photo at once, the file goes a week later
    setConfig((c) => {
      c.family.members = c.family.members.filter((m) => m.id !== 'm_lucia');
      c.family.chores = c.family.chores.filter((h) => h.memberId !== 'm_lucia');
      for (const s of c.screens) if (s.family?.memberIds) s.family.memberIds = s.family.memberIds.filter((x) => x !== 'm_lucia');
    });
    assert.equal((await call('GET', `${url}?screen=living-room`)).status, 404);
    assert.equal((await call('GET', url, { headers: phone(key) })).status, 404);
    assert.ok(fs.existsSync(file), 'kept for a week (a backup restored soon after brings it back)');
    assert.deepEqual(collectUnused({ now: Date.now() + UNUSED_GRACE_MS - 60_000 }), []);
    assert.deepEqual(collectUnused({ now: Date.now() + UNUSED_GRACE_MS + 60_000 }), [id]);
    assert.ok(!fs.existsSync(file), 'the photo is gone with the member');
    assert.equal((await call('GET', url, { cookie })).status, 404);
  });
});

test('profile photos in private access mode: the screen credential, never without it', async () => {
  await withServer(async ({ call, login }) => {
    const cookie = await login();
    const id = (await call('POST', '/api/admin/family/photos', { cookie, body: { data: b64(makePng(128, 128)) } })).json.photo;
    setConfig((c) => { c.family.members[1].photo = id; });
    const url = `/media/avatars/${id}`;
    assert.equal((await call('GET', `${url}?screen=living-room`)).status, 401);
    assert.equal((await call('GET', `${url}?k=${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`)).status, 403);
    const ok = await call('GET', `${url}?k=${displayKeyFor('s_main')}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
  }, { mut: (c) => { c.security.displayAccess = 'private'; } });
});

test('profile photos travel in the export and come back with the family section', async () => {
  await withServer(async ({ call, login, dir }) => {
    const cookie = await login();
    const id = (await call('POST', '/api/admin/family/photos', { cookie, body: { data: b64(makeWebp(256, 256)) } })).json.photo;
    setConfig((c) => { c.family.members[0].photo = id; });
    const bundle = (await call('POST', '/api/admin/export', { cookie, body: {} })).json;
    assert.ok(bundle.familyPhotos[id], 'the photo is in the file');
    // the photo is taken away and, a week later, cleaned up
    setConfig((c) => { c.family.members[0].photo = null; });
    collectUnused({ now: Date.now() + UNUSED_GRACE_MS + 60_000 });
    assert.ok(!fs.existsSync(path.join(dir, 'avatars', `${id}.webp`)));
    // a forged extra entry is not stored
    bundle.familyPhotos['f'.repeat(24)] = b64(makePng(96, 96));
    const r = await call('POST', '/api/admin/import/apply', { cookie, body: { bundle, sections: ['family'] } });
    assert.equal(r.status, 200, r.text);
    assert.equal(store.getConfig().family.members[0].photo, id);
    assert.ok(fs.existsSync(path.join(dir, 'avatars', `${id}.webp`)), 'restored');
    assert.deepEqual(fs.readdirSync(path.join(dir, 'avatars')), [`${id}.webp`]);
    assert.equal((await call('GET', `/media/avatars/${id}?screen=living-room`)).status, 200);
  });
});

test('profile photos: a config naming a photo whose file is gone gives the screens no address', async () => {
  await withServer(async ({ call, login, dir }) => {
    const cookie = await login();
    const id = (await call('POST', '/api/admin/family/photos', { cookie, body: { data: b64(makeJpeg(256, 256)) } })).json.photo;
    setConfig((c) => { c.family.members[0].photo = id; });
    assert.equal((await call('GET', '/api/display/family?screen=living-room')).json.members[0].photo, `/media/avatars/${id}`);
    fs.rmSync(path.join(dir, 'avatars', `${id}.jpg`));
    assert.equal((await call('GET', '/api/display/family?screen=living-room')).json.members[0].photo, null);
  });
});

test('profile photos: many unsaved crops never lock the uploads, the photos in use always stay', async () => {
  await withServer(async ({ call, login, dir }) => {
    const cookie = await login();
    const up = (n) => call('POST', '/api/admin/family/photos', { cookie, body: { data: b64(makePng(64 + n, 64 + n)) } });
    const used = (await up(0)).json.photo;
    setConfig((c) => { c.family.members[0].photo = used; });
    let last;
    for (let i = 1; i <= MAX_STORED + 5; i++) {
      last = await up(i);
      assert.equal(last.status, 200, last.text);
    }
    const files = fs.readdirSync(path.join(dir, 'avatars'));
    assert.ok(files.length <= MAX_STORED);
    assert.ok(files.includes(`${used}.png`), 'the photo in use is never the one that goes');
    assert.ok(files.includes(`${last.json.photo}.png`));
  });
});
