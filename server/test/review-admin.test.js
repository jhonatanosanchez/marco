// Review fixes (admin extras): orphaned scheduled messages, restore repair, preview not counted,
// announcement sync on reconnect, throttled public activity entries, Google callback hardening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import * as store from '../store.js';
import { defaultConfig, defaultScreenProfile } from '../core/defaults.js';
import { validateConfig } from '../core/validate.js';
import { repairConfig, orphanSchedules, parseImport, mergeImport } from '../backups.js';
import { sseHandler, closeAll, MAX_STREAMS_PER_IP } from '../sse.js';
import { streamInit, streamHello, onStreamOpen, onStreamClose, _resetDisplays, setServerVersion } from '../displays.js';
import { createAnnouncement, clearAnnouncements, _resetAnnouncements } from '../announce.js';
import { logActivity, listActivity, clearActivity, _resetActivityThrottle } from '../activity.js';
import { googleCallbackHandler, startSession } from '../auth.js';
import { screenSchedules } from '../core/screens.js';

function baseConfig() {
  const c = defaultConfig();
  c.calendar.sources = [];
  c.screens.push(defaultScreenProfile({ id: 's_cocina', slug: 'cocina', name: 'Cocina' }));
  return c;
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-review-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(baseConfig()));
  store.initStore(dir);
  _resetDisplays();
  _resetAnnouncements();
  _resetActivityThrottle();
  clearActivity();
  setServerVersion('9.9.9');
  return dir;
}

const sched = (over = {}) => ({
  id: 'm_basura', enabled: true, title: 'Sacar la basura', body: '', emoji: '🗑️', style: 'info', days: [], from: '20:00', to: '22:00',
  startDate: null, endDate: null, screenIds: ['s_cocina'], sound: false, ...over,
});

test('schedules: a message whose only target screen is gone is disabled, not turned into "all screens"', () => {
  const c = baseConfig();
  c.schedules.items = [sched(), sched({ id: 'm_two', screenIds: ['s_cocina', 's_main'] }), sched({ id: 'm_all', screenIds: [] })];
  c.screens = c.screens.filter((s) => s.id !== 's_cocina');
  const r = validateConfig(c);
  assert.equal(r.ok, true);
  const [orphan, two, all] = r.value.schedules.items;
  assert.equal(orphan.enabled, false);
  assert.deepEqual(orphan.screenIds, []);
  assert.equal(two.enabled, true);
  assert.deepEqual(two.screenIds, ['s_main']);
  assert.equal(all.enabled, true);
  assert.deepEqual(screenSchedules(r.value, r.value.screens[0]).map((m) => m.id), ['m_two', 'm_all']);
});

test('import: partial screens/schedules import reports and disables orphaned messages', () => {
  const cur = baseConfig();
  cur.schedules.items = [sched()];
  const imported = defaultConfig(); // only "Living room"
  imported.calendar.sources = [];
  assert.deepEqual(orphanSchedules(cur, imported), { screensOnly: ['🗑️ Sacar la basura'], schedulesOnly: [] });
  const p = parseImport(imported);
  const merged = validateConfig(mergeImport(cur, p.value, ['screens']));
  assert.equal(merged.ok, true);
  assert.equal(merged.value.schedules.items[0].enabled, false);
});

test('restore repair: values that never validate are dropped / reset instead of failing the restore', () => {
  const c = baseConfig();
  c.localEvents.items = [
    { id: 'l_bad', title: 'Mal', allDay: false, date: '2026-10-10', startTime: '10:00', endTime: '09:00' },
    { id: 'l_ok', title: 'Bien', allDay: true, date: '2026-10-11' },
  ];
  c.news.feeds = [{ id: 'f_bad', name: 'x', url: 'notaurl', enabled: true }];
  c.homeassistant.url = 'notaurl';
  const first = validateConfig(c);
  assert.equal(first.ok, false);
  assert.equal(validateConfig(first.value).ok, false); // sanitising alone doesn't fix it
  const r = repairConfig(first.value);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.localEvents.items.map((e) => e.id), ['l_ok']);
  assert.equal(r.value.news.feeds.length, 0);
  assert.equal(r.value.homeassistant.url, defaultConfig().homeassistant.url);
  assert.equal(r.value.screens.length, 2);
  assert.ok(r.fixed.length >= 3);
});

function connect({ screen, client, ip = '192.168.1.20', preview = false } = {}) {
  const req = new EventEmitter();
  req.ip = ip;
  req.query = { ...(screen ? { screen } : {}), ...(client ? { client } : {}), ...(preview ? { preview: '1' } : {}) };
  req.get = () => 'Mozilla/5.0 Chrome/128.0.0.0';
  const chunks = [];
  let status = 200;
  const res = { writeHead(s) { status = s; }, write(s) { chunks.push(s); return true; }, end() {} };
  sseHandler({ init: streamInit, hello: streamHello, onOpen: onStreamOpen, onClose: onStreamClose })(req, res);
  const events = () => chunks.join('').split('\n\n').filter((b) => b.startsWith('event:')).map((b) => {
    const [ev, data] = b.split('\n');
    return { event: ev.slice(7), data: JSON.parse(data.slice(6)) };
  });
  return { events, status: () => status, close: () => req.emit('close') };
}

test('stream hello lists the active announcements so a reconnecting display drops cleared ones', () => {
  const dir = setup();
  const { announcement: a } = createAnnouncement({ title: 'Urgente', body: '', emoji: '', style: 'urgent', durationSec: 3600, sound: false, screenIds: [] }, { via: 'admin', by: 't' });
  const s1 = connect({ screen: 'cocina', client: 'kiosk-a' });
  assert.deepEqual(s1.events()[0].data.activeAnnouncementIds, [a.id]);
  s1.close();
  clearAnnouncements(a.id); // sent while the display is offline: the clear event is lost
  const s2 = connect({ screen: 'cocina', client: 'kiosk-a' });
  assert.deepEqual(s2.events()[0].data.activeAnnouncementIds, []);
  s2.close();
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('public stream: new-client log entries are throttled and streams per ip are capped', () => {
  const dir = setup();
  for (let i = 0; i < 40; i++) connect({ screen: 'cocina', client: `rnd-${i}`, ip: '192.168.1.66' }).close();
  for (let i = 0; i < 5; i++) connect({ ip: '192.168.1.66' }).close(); // anonymous
  const logged = listActivity({ type: 'display.connected', limit: 200 }).items;
  assert.equal(logged.length, 2); // one per ip + screen (cocina, default)
  const open = [];
  for (let i = 0; i < MAX_STREAMS_PER_IP; i++) open.push(connect({ client: `k-${i}`, ip: '192.168.1.77' }));
  assert.ok(open.every((c) => c.status() === 200));
  const extra = connect({ client: 'k-extra', ip: '192.168.1.77' });
  assert.equal(extra.status(), 429);
  open.forEach((c) => c.close());
  closeAll();
  _resetActivityThrottle();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('activity: oversized data is truncated', () => {
  const dir = setup();
  const e = logActivity('auth.login_failed', { data: { reason: 'x'.repeat(20000) } });
  assert.equal(e.data.truncated, true);
  assert.ok(JSON.stringify(e).length < 1000);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('google callback: unknown error codes are not logged verbatim and failures are throttled', async () => {
  const dir = setup();
  const prev = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET];
  const call = async (query) => {
    let to = '';
    await googleCallbackHandler({ query, session: {}, ip: '203.0.113.9', get: () => '' }, { redirect: (u) => { to = u; } });
    return to;
  };
  delete process.env.GOOGLE_CLIENT_ID;
  assert.equal(await call({ error: 'x' }), '/admin/?error=google_not_configured');
  assert.equal(listActivity({ type: 'auth' }).items.length, 0);
  process.env.GOOGLE_CLIENT_ID = 'id';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  try {
    assert.equal(await call({ error: 'y'.repeat(5000) }), '/admin/?error=google_error');
    assert.equal(await call({ error: 'access_denied' }), '/admin/?error=google_access_denied');
    for (let i = 0; i < 50; i++) await call({ error: 'z'.repeat(100) });
    for (let i = 0; i < 50; i++) await call({ state: 'bogus' });
    const items = listActivity({ type: 'auth' }).items;
    assert.deepEqual(items.map((e) => e.data.reason).sort(), ['google_access_denied', 'google_error', 'invalid_state']);
  } finally {
    [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET] = prev;
    if (prev[0] === undefined) delete process.env.GOOGLE_CLIENT_ID;
    if (prev[1] === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    _resetActivityThrottle();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Google sign-in off: existing Google sessions end, and the OAuth purpose comes from the session, not the state', async () => {
  const dir = setup();
  const prev = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, login: process.env.MARCO_GOOGLE_LOGIN };
  const restore = () => {
    for (const [k, v] of [['GOOGLE_CLIENT_ID', prev.id], ['GOOGLE_CLIENT_SECRET', prev.secret], ['MARCO_GOOGLE_LOGIN', prev.login]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
  process.env.GOOGLE_CLIENT_ID = 'id';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  delete process.env.MARCO_GOOGLE_LOGIN;
  try {
    const { sessionValid } = await import('../auth.js');
    store.updateSecrets((s) => { s.passwordHash = 'scrypt$c2FsdA==$aGFzaA=='; s.sessionEpoch = 'e1'; });
    store.updateConfig((c) => { c.auth.allowedGoogleEmails = ['ana@example.com']; c.auth.passwordLoginEnabled = true; });
    const signed = { session: {} };
    startSession(signed, { email: 'ana@example.com', method: 'google' });
    const req = { ip: '192.168.1.20', headers: {}, socket: { remoteAddress: '192.168.1.20' }, session: signed.session };
    assert.equal(sessionValid(req), false, 'Google sign-in is off on this server');
    process.env.MARCO_GOOGLE_LOGIN = '1';
    assert.equal(sessionValid(req), true);
    delete process.env.MARCO_GOOGLE_LOGIN;
    // a "connect" round trip whose state was edited to say "login" is refused before any code exchange
    const nonce = 'a'.repeat(32);
    const state = Buffer.from(JSON.stringify({ p: 'login', n: nonce })).toString('base64url');
    let to = '';
    await googleCallbackHandler({ query: { state, code: 'c' }, session: { oauthNonce: nonce, oauthPurpose: 'connect' }, ip: '203.0.113.9', get: () => '' },
      { redirect: (u) => { to = u; } });
    assert.equal(to, '/admin/?error=invalid_state');
  } finally {
    restore();
    _resetActivityThrottle();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
