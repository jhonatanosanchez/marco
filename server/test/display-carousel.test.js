// Display carousel controller (web/display/carousel.ts) with a fake clock: it switches at the slot boundary, refreshes
// the next screen before it shows, holds while an alert is on screen and then jumps to the synced step, stays put
// when a screen has no data, follows the schedule and the night hold, and stop() leaves no timer behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

const [{ CarouselController, PREFETCH_LEAD }] = await loadWebModules('/web/display/carousel.ts');

/** A virtual clock with timers. */
function fakeClock(start) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => timers.delete(id),
    pending: () => timers.size,
    /** Move the clock forward, running every timer that comes due (in order). */
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        timers.delete(next[0]);
        now = Math.max(now, next[1].at);
        next[1].fn();
        await new Promise((r) => setImmediate(r));
      }
      now = end;
      await new Promise((r) => setImmediate(r));
    },
  };
}

const cfgOf = (screenId, extra = {}) => ({ revision: 1, screenId, screen: { name: screenId, language: 'en', nightMode: { enabled: false, from: '23:00', to: '07:00', dim: 0.3 } }, ...extra });
const BLOCK = {
  id: 'v_loop', slug: 'loop', name: 'Loop', enabled: true, transition: 'fade', holdOnAlert: true, nightRotate: false,
  offScreenId: 'a', schedule: [],
  steps: [{ screenId: 'a', slug: 'aa', name: 'A', seconds: 60 }, { screenId: 'b', slug: 'bb', name: 'B', seconds: 20 }],
};

/** Controller on a fake clock at the start of a loop (epoch multiple of the 80 s cycle). */
function setup({ block = BLOCK, failFor = new Set(), alert = () => false, night = () => false, pin = null, frozen = false } = {}) {
  const t0 = 80_000 * 25_000_000; // a slot boundary: step "a" starts
  const clock = fakeClock(t0);
  const shown = [];
  const fetched = [];
  const c = new CarouselController(block, 'Europe/Lisbon', 'a', {
    now: clock.now,
    night,
    alertOn: alert,
    fetch: async (id, parts) => {
      fetched.push([id, [...parts].sort().join(','), clock.now() - t0]);
      if (failFor.has(id)) throw new Error('offline');
      return { config: parts.includes('config') ? cfgOf(id) : undefined, events: { events: [], hash: id }, countdowns: { items: [] }, photos: { photos: [] } };
    },
    show: (id) => shown.push([id, clock.now() - t0]),
    pin,
    frozen,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  c.put('a', 'config', cfgOf('a'));
  c.put('a', 'events', { events: [], hash: 'a' });
  return { c, clock, shown, fetched, t0 };
}

test('switches exactly at the slot boundary, after refreshing the next screen ahead of time', async () => {
  const { c, clock, shown, fetched } = setup();
  c.start();
  await clock.advance(60_000 - PREFETCH_LEAD - 1);
  assert.deepEqual(shown, []);
  assert.equal(fetched.filter(([id]) => id === 'b').length, 0, 'nothing for b yet');
  await clock.advance(1);
  assert.deepEqual(fetched.find(([id]) => id === 'b'), ['b', 'config,countdowns,events,photos', 60_000 - PREFETCH_LEAD]);
  await clock.advance(PREFETCH_LEAD + 100);
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], 'b');
  assert.ok(shown[0][1] >= 60_000 && shown[0][1] < 60_100, `switched at ${shown[0][1]}`);
  await clock.advance(20_000);
  assert.deepEqual(shown.map((s) => s[0]), ['b', 'a']);
  // a second loop needs no new request for b (fresh data), only events once they are a minute old
  const before = fetched.filter(([id]) => id === 'b').length;
  await clock.advance(60_000);
  const after = fetched.filter(([id]) => id === 'b');
  assert.equal(after.length, before + 1);
  assert.ok(!after.at(-1)[1].includes('config'), 'config is not refetched without a new revision');
  c.stop();
  assert.equal(clock.pending(), 0, 'stop() clears its timers');
});

test('a new config revision makes the other screens refresh their config before they show', async () => {
  const { c, clock, fetched } = setup();
  c.start();
  await clock.advance(61_000);
  const n = fetched.length;
  c.revisionSeen(2);
  await clock.advance(80_000);
  const b = fetched.slice(n).filter(([id]) => id === 'b');
  assert.ok(b.some(([, parts]) => parts.includes('config')), JSON.stringify(b));
  c.stop();
});

test('an alert on screen holds the step; when it is gone the display jumps to the synced step', async () => {
  let alert = false;
  const { c, clock, shown } = setup({ alert: () => alert });
  c.start();
  await clock.advance(55_000);
  alert = true;
  await clock.advance(10_000);
  assert.deepEqual(shown, [], 'held on a while the alert is on screen');
  await clock.advance(10_000); // 75 s: still inside b's slot
  alert = false;
  await clock.advance(1_500);
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], 'b');
  // held past b's whole slot: straight back to a, never a late b
  const r = setup({ alert: () => alert });
  alert = true;
  r.c.start();
  await r.clock.advance(85_000);
  alert = false;
  await r.clock.advance(1_500);
  assert.deepEqual(r.shown, []);
  c.stop();
  r.c.stop();
});

test('no data for the next screen: stays on the current one and tries again at the next step', async () => {
  const { c, clock, shown } = setup({ failFor: new Set(['b']) });
  c.start();
  await clock.advance(200_000);
  assert.deepEqual(shown, []);
  c.stop();
});

test('schedule: outside the window the off screen stays; night mode holds it unless nightRotate', async () => {
  // a window that never runs at this hour: 03:00-03:01 on Sundays only
  const block = { ...BLOCK, offScreenId: 'b', schedule: [{ id: 'p_1', enabled: true, days: [0], from: '03:00', to: '03:01' }] };
  const off = setup({ block });
  assert.equal(off.c.phase().mode, 'off'); // the fake clock starts on a Wednesday
  off.c.start();
  await off.clock.advance(1_000);
  assert.deepEqual(off.shown.map((s) => s[0]), ['b']);
  await off.clock.advance(200_000);
  assert.deepEqual(off.shown.map((s) => s[0]), ['b'], 'no rotation outside the schedule');
  off.c.stop();
  const night = setup({ block: { ...BLOCK, offScreenId: 'b' }, night: () => true });
  night.c.put('b', 'config', cfgOf('b'));
  night.c.put('b', 'events', { events: [], hash: 'b' });
  assert.equal(night.c.phase().mode, 'night');
  night.c.start();
  await night.clock.advance(1_000);
  assert.deepEqual(night.shown.map((s) => s[0]), ['b']);
  await night.clock.advance(200_000);
  assert.deepEqual(night.shown.map((s) => s[0]), ['b']);
  night.c.stop();
  const rotating = setup({ block: { ...BLOCK, nightRotate: true }, night: () => true });
  assert.equal(rotating.c.phase().mode, 'rotate');
  rotating.c.stop();
});

test('?step= pins one screen, ?carousel=0 stays on the first step', async () => {
  const pinned = setup({ pin: 'bb' });
  pinned.c.start();
  await pinned.clock.advance(200_000);
  assert.deepEqual(pinned.shown.map((s) => s[0]), ['b']);
  pinned.c.stop();
  const frozen = setup({ frozen: true });
  frozen.c.start();
  await frozen.clock.advance(200_000);
  assert.deepEqual(frozen.shown, []);
  frozen.c.stop();
});

test('show() gets the animation settings and a switch number every TV agrees on', async () => {
  const infos = [];
  const block = { ...BLOCK, transition: 'random', transitionSpeed: 'slow' };
  const { c, clock } = setup({ block });
  // wrap show to see the third argument
  const orig = c['d'].show;
  c['d'].show = (id, b, info) => {
    infos.push([id, info]);
    orig(id, b, info);
  };
  c.start();
  await clock.advance(60_100);
  await clock.advance(20_000);
  assert.deepEqual(infos.map(([id]) => id), ['b', 'a']);
  const [first, second] = infos.map(([, i]) => i);
  assert.equal(first.transition, 'random');
  assert.equal(first.speed, 'slow');
  assert.equal(first.seed, 'v_loop');
  assert.equal(second.n, first.n + 1);
  c.stop();
  const plain = setup({ block: { ...BLOCK, transitionSpeed: undefined } });
  const got = [];
  plain.c['d'].show = (_id, _b, info) => got.push(info);
  plain.c.start();
  await plain.clock.advance(60_100);
  assert.equal(got[0].speed, 'normal', 'a block from an older server');
  plain.c.stop();
});

test('tryNext (the admin "Probar"): next step at once, then the clock no longer moves it', async () => {
  const { c, clock, shown } = setup();
  c.start();
  c.tryNext();
  await clock.advance(10);
  assert.deepEqual(shown.map((s) => s[0]), ['b']);
  await clock.advance(200_000);
  assert.deepEqual(shown.map((s) => s[0]), ['b'], 'stays on the screen it went to');
  c.tryNext();
  await clock.advance(10);
  assert.deepEqual(shown.map((s) => s[0]), ['b', 'a']);
  c.stop();
  assert.equal(clock.pending(), 0);
});
