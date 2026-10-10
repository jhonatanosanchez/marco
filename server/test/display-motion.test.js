// Calendar motion options (calendar.marquee, calendar.rotateBusyDays): validation, defaults, and the pure helpers
// that time the sliding titles and page busy days (web/display/motion.ts, loaded through Node's type stripping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateConfig } from '../core/validate.js';
import { defaultConfig, SCREEN_SPLIT_KEYS } from '../core/defaults.js';
import { displayConfig } from '../core/screens.js';

let motion = null;
try {
  motion = await import('../../web/display/motion.ts');
} catch {
  motion = null;
}
const ts = { skip: motion ? false : 'TypeScript imports need Node ≥ 22.18' };
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('both options are on for new screens and back-filled on for configs saved before them', () => {
  const fresh = validateConfig(defaultConfig());
  assert.equal(fresh.ok, true);
  assert.equal(fresh.value.screens[0].calendar.marquee, true);
  assert.equal(fresh.value.screens[0].calendar.rotateBusyDays, true);
  const c = defaultConfig();
  delete c.screens[0].calendar.marquee;
  delete c.screens[0].calendar.rotateBusyDays;
  const old = validateConfig(c);
  assert.equal(old.ok, true, JSON.stringify(old.errors));
  assert.equal(old.value.screens[0].calendar.marquee, true);
  assert.equal(old.value.screens[0].calendar.rotateBusyDays, true);
});

test('they can be turned off per screen and reach the display', () => {
  const c = defaultConfig();
  c.screens[0].calendar.marquee = false;
  c.screens[0].calendar.rotateBusyDays = false;
  const { ok, value } = validateConfig(c);
  assert.equal(ok, true);
  const d = displayConfig(value, value.screens[0]);
  assert.equal(d.calendar.marquee, false);
  assert.equal(d.calendar.rotateBusyDays, false);
  assert.ok(SCREEN_SPLIT_KEYS.calendar.includes('marquee'));
  assert.ok(SCREEN_SPLIT_KEYS.calendar.includes('rotateBusyDays'));
  // the admin's mirror of the split keys knows them too
  assert.match(read('web/shared/screens.ts'), /'marquee', 'rotateBusyDays'/);
});

test('values that are not booleans are rejected with their path and fall back to on', () => {
  for (const bad of ['yes', 1, 0, 'false', null]) {
    const c = defaultConfig();
    c.screens[0].calendar.marquee = bad;
    c.screens[0].calendar.rotateBusyDays = bad;
    const { ok, errors, value } = validateConfig(c);
    assert.equal(ok, false, `accepted ${JSON.stringify(bad)}`);
    assert.ok(errors.some((e) => e.path === 'screens[0].calendar.marquee'), JSON.stringify(errors));
    assert.ok(errors.some((e) => e.path === 'screens[0].calendar.rotateBusyDays'), JSON.stringify(errors));
    assert.equal(value.screens[0].calendar.marquee, true);
    assert.equal(value.screens[0].calendar.rotateBusyDays, true);
  }
});

test('the display reads ?marquee= and ?rotate=, and the README documents them', () => {
  const main = read('web/display/main.ts');
  assert.match(main, /params\.get\('marquee'\)/);
  assert.match(main, /params\.get\('rotate'\)/);
  for (const f of ['README.md', 'README.es.md']) {
    const md = read(f);
    assert.match(md, /\?marquee=0/, f);
    assert.match(md, /\?rotate=0/, f);
  }
});

test('marquee timing: titles that fit stay still, the rest slide at a speed that follows the display unit', ts, () => {
  const { marqueeTiming, MARQUEE_PAUSE_MS } = motion;
  assert.equal(marqueeTiming(0, 10), null);
  assert.equal(marqueeTiming(2, 10), null);
  assert.equal(marqueeTiming(-40, 10), null);
  assert.equal(marqueeTiming(NaN, 10), null);
  const t = marqueeTiming(300, 10); // 1080p: 30 px/s → 10 s each way
  assert.equal(t.distance, 300);
  assert.equal(t.duration, 2 * MARQUEE_PAUSE_MS + 2 * 10000);
  const [a, b, c] = t.offsets;
  assert.ok(a > 0 && a < b && b < c && c < 1);
  // the two pauses last the same, and so do the two slides
  assert.ok(Math.abs(a - (c - b)) < 1e-9);
  assert.ok(Math.abs(b - a - (1 - c)) < 1e-9);
  // a 4K screen (unit 20px) slides twice as many pixels per second: the same time for the same text
  assert.equal(marqueeTiming(600, 20).duration, t.duration);
  // a few pixels still take a visible, unhurried slide
  assert.ok(marqueeTiming(4, 10).duration >= 2 * MARQUEE_PAUSE_MS + 1200);
});

test('marquee budget and stagger: only the first N overflowing titles move, and they start apart', ts, () => {
  const { pickMovers, marqueeDelay, MARQUEE_MAX_LITE } = motion;
  assert.deepEqual(pickMovers([false, true, true, false, true], 2), [1, 2]);
  assert.deepEqual(pickMovers([true, false], 10), [0]);
  assert.equal(pickMovers(new Array(20).fill(true), MARQUEE_MAX_LITE).length, 6);
  const delays = [0, 1, 2, 3, 4].map(marqueeDelay);
  assert.equal(new Set(delays).size, delays.length);
  for (const d of delays) assert.ok(d >= 1000 && d < 10000);
});

test('busy days: events fill the free lanes page by page; no free lane means no paging', ts, () => {
  const { planPages, pageAt, pageLabel } = motion;
  assert.equal(planPages(['a', 'b'], []), null);
  const p = planPages(['a', 'b', 'c', 'd', 'e'], [1, 3]);
  assert.equal(p.pages, 3);
  assert.deepEqual(p.placed.map((x) => [x.item, x.page, x.lane]), [
    ['a', 0, 1], ['b', 0, 3], ['c', 1, 1], ['d', 1, 3], ['e', 2, 1],
  ]);
  assert.equal(planPages(['a', 'b'], [0, 1, 2]).pages, 1);
  assert.deepEqual([0, 1, 2, 3, 4].map((s) => pageAt(s, 3)), [0, 1, 2, 0, 1]);
  assert.equal(pageAt(5, 1), 0);
  assert.equal(pageLabel(0, 2), '1/2');
  assert.equal(pageLabel(2, 3), '3/3');
});
