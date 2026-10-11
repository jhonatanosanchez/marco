// Display live mode (web/display/live.ts, loaded through Node's TypeScript type stripping, so those tests are
// skipped on runtimes older than Node 22.18) and the server's /api/health `live` field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { publicRouter } from '../routes/public.js';

let live = null;
try {
  live = await import('../../web/display/live.ts');
} catch {
  live = null;
}
const opts = { skip: live ? false : 'TypeScript imports need Node ≥ 22.18' };

test('health advertises live: sse', async () => {
  const app = express();
  app.use('/api', publicRouter({ version: '9.9.9' }));
  const srv = app.listen(0);
  try {
    await new Promise((r) => srv.once('listening', r));
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/health`);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.version, '9.9.9');
    assert.equal(j.live, 'sse');
    if (live) assert.equal(live.liveModeOf(j), 'sse');
  } finally {
    srv.close();
  }
});

test('live mode: only an explicit poll disables SSE', opts, () => {
  assert.equal(live.liveModeOf({ ok: true, live: 'poll' }), 'poll');
  assert.equal(live.liveModeOf({ ok: true, live: 'sse' }), 'sse');
  assert.equal(live.liveModeOf({ ok: true }), 'sse');
  assert.equal(live.liveModeOf({ ok: true, live: 'other' }), 'sse');
  assert.equal(live.liveModeOf(null), 'sse');
});

test('detectLiveMode retries network errors and settles on SSE for HTTP errors', opts, async () => {
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  let n = 0;
  const net = Object.assign(new Error('offline'), { status: 0 });
  const mode = await live.detectLiveMode({
    health: async () => { if (++n < 4) throw net; return { ok: true, live: 'poll' }; },
    answered: (e) => e.status > 0,
    wait,
  });
  assert.equal(mode, 'poll');
  assert.deepEqual(waits, [5000, 10000, 20000]);
  const http = Object.assign(new Error('404'), { status: 404 });
  assert.equal(await live.detectLiveMode({ health: async () => { throw http; }, answered: (e) => e.status > 0, wait }), 'sse');
  assert.equal(await live.detectLiveMode({ health: async () => { throw net; }, answered: () => false, cancelled: () => true, wait }), null);
});

test('config poll refetches data only when the revision changes', opts, async () => {
  let rev = 1;
  let serverRev = 1;
  let ok = true;
  let changed = 0;
  const p = live.startConfigPoll({
    revision: () => rev,
    fetchConfig: async () => { if (!ok) return false; rev = serverRev; return true; },
    changed: () => changed++,
    intervalMs: 3_600_000,
  });
  try {
    await p.tick();
    assert.equal(changed, 0);
    serverRev = 2;
    await p.tick();
    assert.equal(changed, 1);
    await p.tick();
    assert.equal(changed, 1);
    // failed fetch (offline, or 401 / 403 handled by fetchConfig): nothing refetched
    serverRev = 3;
    ok = false;
    await p.tick();
    assert.equal(changed, 1);
    ok = true;
    p.close();
    await p.tick();
    assert.equal(changed, 1, 'closed poll does nothing');
  } finally {
    p.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// One dispatcher for both transports (live.ts dispatch). Each event keeps exactly the checks the SSE client had.

/** Handlers that record every call as [name, payload]. */
function recorder() {
  const calls = [];
  const h = {};
  for (const n of ['hello', 'config', 'events', 'photos', 'reload', 'announce', 'announceClear', 'identify', 'night', 'doorbell', 'doorbellEnd', 'revoked', 'open', 'down']) {
    h[n] = (d) => calls.push(d === undefined ? [n] : [n, d]);
  }
  return { h, calls };
}

/** [event name, payload, expected handler calls], written from the guards of stream.ts before the move. */
const GUARD_CASES = [
  ['hello', { revision: 3, screenId: 's_main' }, [['hello', { revision: 3, screenId: 's_main' }]]],
  ['hello', {}, [['hello', {}]]],
  ['config', { revision: 4 }, [['config', { revision: 4 }]]],
  ['events', { hash: 'h1' }, [['events', { hash: 'h1' }]]],
  ['photos', {}, [['photos', { hidden: undefined }]]],
  ['photos', { hidden: ['a.jpg', 7, null, 'b.jpg'] }, [['photos', { hidden: ['a.jpg', 'b.jpg'] }]]],
  ['photos', { hidden: 'a.jpg' }, [['photos', { hidden: undefined }]]],
  ['photos', null, [['photos', { hidden: undefined }]]],
  ['reload', { any: 1 }, [['reload']]],
  ['announce', { id: 'a1', title: 'x' }, [['announce', { id: 'a1', title: 'x' }]]],
  ['announce', { id: 5 }, []],
  ['announce', {}, []],
  ['announce', null, []],
  ['announce-clear', { id: 'a1' }, [['announceClear', { id: 'a1' }]]],
  ['announce-clear', { id: 3 }, [['announceClear', { id: null }]]],
  ['announce-clear', {}, [['announceClear', { id: null }]]],
  ['announce-clear', null, [['announceClear', { id: null }]]],
  ['identify', { name: 'Kitchen', slug: 'kitchen', clientId: 'k1', durationSec: 10 }, [['identify', { name: 'Kitchen', slug: 'kitchen', clientId: 'k1', durationSec: 10 }]]],
  ['night', { mode: 'on' }, [['night', { mode: 'on' }]]],
  ['night', { mode: 'off' }, [['night', { mode: 'off' }]]],
  ['night', { mode: 'auto' }, [['night', { mode: 'auto' }]]],
  ['night', { mode: 'dim' }, []],
  ['night', {}, []],
  ['night', null, []],
  ['doorbell', { id: 'd_1', expiresAt: '2026-01-01T10:01:00.000Z' }, [['doorbell', { id: 'd_1', expiresAt: '2026-01-01T10:01:00.000Z' }]]],
  ['doorbell', { id: 'd_1' }, []],
  ['doorbell', { id: 7, expiresAt: 'x' }, []],
  ['doorbell', null, []],
  ['doorbell-end', { id: 'd_1' }, [['doorbellEnd', { id: 'd_1' }]]],
  ['doorbell-end', {}, [['doorbellEnd', { id: null }]]],
  ['revoked', { code: 'key_required' }, [['revoked', { code: 'key_required' }]]],
  ['revoked', { code: 9 }, [['revoked', { code: 'invalid_key' }]]],
  ['revoked', {}, [['revoked', { code: 'invalid_key' }]]],
];

test('dispatch: every event keeps the checks it had in the SSE client', opts, () => {
  for (const [name, d, expected] of GUARD_CASES) {
    const { h, calls } = recorder();
    assert.equal(live.dispatch(name, d, h), true, name);
    assert.deepEqual(calls, expected, `${name} ${JSON.stringify(d)}`);
  }
  const { h, calls } = recorder();
  assert.equal(live.dispatch('ping', { t: 1 }, h), false);
  assert.equal(live.dispatch('unknown', {}, h), false);
  assert.deepEqual(calls, []);
  // handlers left out are skipped
  assert.equal(live.dispatch('night', { mode: 'on' }, {}), true);
});

const pollAnswer = (over = {}) => ({
  revision: 3, screenId: 's_main', now: '2026-01-01T10:00:00.000Z', serverVersion: '0.5.0', cursor: 'e:1', reset: false,
  commands: [], next: 30_000, ...over,
});
function pollRecorder() {
  const { h, calls } = recorder();
  h.first = (r) => calls.push(['first', r.cursor]);
  h.screenChanged = () => calls.push(['screenChanged']);
  h.now = (iso) => calls.push(['now', iso]);
  h.sync = (ids) => calls.push(['sync', ids]);
  return { h, calls };
}

test('applyPoll: reset runs first, a new revision runs config, commands run in order through dispatch', opts, () => {
  let { h, calls } = pollRecorder();
  const announce = { type: 'announce', id: 'a1', title: 'Dinner' };
  assert.equal(live.applyPoll({ revision: 2, screenId: 's_main' }, pollAnswer({ reset: true, commands: [announce], activeAnnouncementIds: ['a1'] }), h), 1);
  assert.deepEqual(calls, [['first', 'e:1'], ['announce', { id: 'a1', title: 'Dinner' }]], 'reset: no separate config call, first handles it');

  ({ h, calls } = pollRecorder());
  live.applyPoll({ revision: 2, screenId: 's_main' }, pollAnswer({ activeAnnouncementIds: [] }), h);
  assert.deepEqual(calls, [['now', '2026-01-01T10:00:00.000Z'], ['sync', []], ['config', { revision: 3 }]]);

  ({ h, calls } = pollRecorder());
  const n = live.applyPoll({ revision: 3, screenId: 's_main' }, pollAnswer({
    commands: [
      { type: 'night', mode: 'on' }, { type: 'reload' }, { type: 'night', mode: 'bad' }, { type: 'revoked', code: 'x' },
      { type: 'hello' }, { type: 'announce-clear', id: null }, { type: 'photos', hidden: ['a.jpg'] }, null, { type: 7 },
      { type: 'identify', name: 'Main', slug: 'main', clientId: 'k1', durationSec: 10 }, { type: 'events', hash: 'h' }, { type: 'later' },
    ],
  }), h);
  assert.deepEqual(calls, [
    ['now', '2026-01-01T10:00:00.000Z'],
    ['night', { mode: 'on' }], ['reload'], ['announceClear', { id: null }], ['photos', { hidden: ['a.jpg'] }],
    ['identify', { name: 'Main', slug: 'main', clientId: 'k1', durationSec: 10 }], ['events', { hash: 'h' }],
  ], 'revoked and hello never come as commands; bad payloads are dropped as on SSE');
  assert.equal(n, 7, 'the rejected night still went through dispatch');

  ({ h, calls } = pollRecorder());
  assert.equal(live.applyPoll({ revision: 3, screenId: 's_main' }, pollAnswer({ screenId: 's_kitchen', commands: [{ type: 'reload' }] }), h), 0);
  assert.deepEqual(calls, [['screenChanged']], 'a moved device reloads and runs nothing else');

  ({ h, calls } = pollRecorder());
  live.applyPoll({}, pollAnswer({ reset: true }), h);
  assert.deepEqual(calls, [['first', 'e:1']], 'no screen known yet: no reload');
});

test('pollDelay: server next with ±10 % jitter, clamped to [3 s, 15 min]', opts, () => {
  assert.equal(live.pollDelay(30_000, () => 0.5), 30_000);
  assert.equal(live.pollDelay(30_000, () => 0), 27_000);
  assert.equal(live.pollDelay(30_000, () => 1), 33_000);
  assert.equal(live.pollDelay(1000, () => 0.5), 3000);
  assert.equal(live.pollDelay(3_600_000, () => 0.5), 15 * 60_000);
  assert.equal(live.pollDelay(undefined, () => 0.5), live.POLL_DEFAULT_MS);
  assert.equal(live.pollDelay(-5, () => 0.5), live.POLL_DEFAULT_MS);
  assert.equal(live.pollDelay(NaN, () => 0.5), live.POLL_DEFAULT_MS);
});

/** startPoll with fake timers: returns the scheduled delays and a way to run the pending timer. */
function pollHarness(answers, extra = {}) {
  const delays = [];
  const asked = [];
  let pending = null;
  const state = { revision: 3, screenId: 's_main', fallbacks: 0, denied: 0 };
  const { h, calls } = pollRecorder();
  const p = live.startPoll({
    poll: async (cursor, rev, hidden) => {
      asked.push([cursor, rev, hidden]);
      const a = answers.shift();
      if (a instanceof Error) throw a;
      return a;
    },
    revision: () => state.revision,
    screenId: () => state.screenId,
    handlers: h,
    denied: (e) => { if (e.status === 401 || e.status === 403) { state.denied++; return true; } return false; },
    status: (e) => e.status ?? 0,
    fallback: () => { state.fallbacks++; },
    random: () => 0.5,
    setTimer: (fn, ms) => { delays.push(ms); pending = fn; return delays.length; },
    clearTimer: () => { pending = null; },
    ...extra,
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const run = async () => { const f = pending; pending = null; f?.(); await settle(); };
  return { p, delays, asked, calls, state, run, settle, pending: () => pending };
}
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

test('startPoll: follows next, sends the cursor back, backs off on errors from 5 s to 5 min', opts, async () => {
  const net = httpError(0);
  const t = pollHarness([
    pollAnswer({ reset: true, cursor: 'e:1', next: 30_000 }),
    pollAnswer({ cursor: 'e:2', next: 5000 }),
    net, net, net, net, net, net, net, net,
    pollAnswer({ cursor: 'e:3', next: 30_000 }),
    httpError(500),
  ], { hidden: () => true });
  await t.settle();
  assert.deepEqual(t.asked[0], ['', 3, true], 'first poll right away, no cursor');
  await t.run();
  assert.deepEqual(t.asked[1], ['e:1', 3, true]);
  for (let i = 0; i < 9; i++) await t.run();
  assert.deepEqual(t.delays, [30_000, 5000, 5000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 30_000]);
  assert.deepEqual(t.asked.at(-1), ['e:2', 3, true], 'a failed poll keeps the cursor');
  await t.run();
  assert.equal(t.delays.at(-1), 5000, 'a success resets the backoff');
  assert.equal(t.calls.filter((c) => c[0] === 'down').length, 9);
  assert.ok(t.calls.some((c) => c[0] === 'open'));
  t.p.close();
  assert.equal(t.pending(), null);
});

test('startPoll: 401 / 403 stop for good, 404 hands over to the config poll, tick polls now', opts, async () => {
  const denied = pollHarness([httpError(403)]);
  await denied.settle();
  assert.equal(denied.state.denied, 1);
  assert.deepEqual(denied.delays, [], 'no retry after lost access');
  assert.equal(denied.calls.filter((c) => c[0] === 'down').length, 0);

  const old = pollHarness([httpError(404)]);
  await old.settle();
  assert.equal(old.state.fallbacks, 1);
  assert.deepEqual(old.delays, []);

  const t = pollHarness([pollAnswer({ reset: true, next: 180_000 }), pollAnswer({ cursor: 'e:2', commands: [{ type: 'reload' }] })]);
  await t.settle();
  await t.p.tick();
  assert.equal(t.asked.length, 2, 'tick polls without waiting for the timer');
  assert.ok(t.calls.some((c) => c[0] === 'reload'));
  t.p.close();
  await t.p.tick();
  assert.equal(t.asked.length, 2, 'closed: nothing more');

  const bad = pollHarness([{ nope: true }]);
  await bad.settle();
  assert.deepEqual(bad.delays, [5000], 'an answer without a cursor counts as an error');
  bad.p.close();
});

// ---------------------------------------------------------------------------------------------------------------
// The SSE client after the move to dispatch (stream.ts, loaded through Vite with a fake EventSource).

class FakeEventSource {
  static last = null;
  constructor(url) { this.url = url; this.listeners = new Map(); this.closed = false; FakeEventSource.last = this; FakeEventSource.all.push(this); }
  addEventListener(name, fn) { this.listeners.set(name, [...(this.listeners.get(name) || []), fn]); }
  close() { this.closed = true; }
  emit(name, data) { for (const fn of this.listeners.get(name) || []) fn({ data: data === undefined ? '' : JSON.stringify(data) }); }
}
FakeEventSource.all = [];

test('SSE stream: the same guards per event, and revoked closes the stream for good', async () => {
  const { loadWebModules } = await import('./webModules.js');
  const saved = { location: globalThis.location, localStorage: globalThis.localStorage, EventSource: globalThis.EventSource };
  const u = new URL('http://localhost/?screen=kitchen&client=kiosk-1');
  const ls = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
  Object.defineProperty(globalThis, 'location', { value: { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: '' }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
  globalThis.EventSource = FakeEventSource;
  try {
    const [stream, id] = await loadWebModules('/web/display/stream.ts', '/web/display/identity.ts');
    const cid = encodeURIComponent(id.clientId);
    assert.equal(stream.pollUrl('', undefined, false), `client=${cid}`);
    assert.equal(stream.pollUrl('e:4', 7, true), `client=${cid}&cursor=e%3A4&rev=7&hidden=1`);
    const { h, calls } = recorder();
    const s = stream.connectStream(h);
    const es = FakeEventSource.last;
    assert.equal(es.url, `/api/stream?screen=kitchen&client=${cid}`);
    for (const [name, d, expected] of GUARD_CASES) {
      if (name === 'revoked') continue;
      calls.length = 0;
      es.emit(name, d);
      assert.deepEqual(calls, expected, `${name} ${JSON.stringify(d)}`);
    }
    // a throwing handler does not break the stream
    const boom = stream.connectStream({ reload: () => { throw new Error('boom'); } });
    const quiet = console.error;
    console.error = () => {};
    try { FakeEventSource.last.emit('reload', {}); } finally { console.error = quiet; }
    boom.close();
    // revoked: closed before the handler runs, and no reconnect afterwards
    calls.length = 0;
    const before = FakeEventSource.all.length;
    es.emit('revoked', { code: 7 });
    assert.equal(es.closed, true);
    assert.deepEqual(calls, [['revoked', { code: 'invalid_key' }]]);
    es.onerror?.();
    await new Promise((r) => setTimeout(r, 1700));
    assert.equal(FakeEventSource.all.length, before, 'a revoked stream never reopens');
    s.close();
  } finally {
    for (const [k, v] of Object.entries(saved)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
});
