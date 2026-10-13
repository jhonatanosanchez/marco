// The background photo on the whole screen (background.scope = 'screen'), with the calendar over it as glass whose
// solidity is background.calendarOpacity: validation, defaults, the display config, privacy and the CSS values.
// The web/shared/glass.ts checks load TypeScript through Node's type stripping (skipped before Node 22.18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateConfig, LAYOUT_PRESETS } from '../core/validate.js';
import { defaultConfig } from '../core/defaults.js';
import { displayConfig } from '../core/screens.js';

let glass = null;
try {
  glass = await import('../../web/shared/glass.ts');
} catch {
  glass = null;
}
const ts = { skip: glass ? false : 'TypeScript imports need Node ≥ 22.18' };
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('new screens and screens saved before the option keep the photo on the side', () => {
  const fresh = validateConfig(defaultConfig());
  assert.equal(fresh.ok, true);
  assert.equal(fresh.value.screens[0].background.scope, 'side');
  assert.equal(fresh.value.screens[0].background.calendarOpacity, 0.5);
  const c = defaultConfig();
  delete c.screens[0].background.scope;
  delete c.screens[0].background.calendarOpacity;
  const old = validateConfig(c);
  assert.equal(old.ok, true, JSON.stringify(old.errors));
  assert.equal(old.value.screens[0].background.scope, 'side');
  assert.equal(old.value.screens[0].background.calendarOpacity, 0.5);
});

test('the whole-screen photo and its calendar transparency are kept per screen and reach the display', () => {
  const c = defaultConfig();
  c.screens[0].background.scope = 'screen';
  c.screens[0].background.calendarOpacity = 0.2;
  const { ok, errors, value } = validateConfig(c);
  assert.equal(ok, true, JSON.stringify(errors));
  const d = displayConfig(value, value.screens[0]);
  assert.equal(d.background.scope, 'screen');
  assert.equal(d.background.calendarOpacity, 0.2);
});

test('invalid values are rejected with a path and fall back to the default', () => {
  for (const [k, bad, def] of [['scope', 'everywhere', 'side'], ['scope', true, 'side'], ['calendarOpacity', 1.2, 0.5], ['calendarOpacity', -0.1, 0.5], ['calendarOpacity', 'glass', 0.5]]) {
    const c = defaultConfig();
    c.screens[0].background[k] = bad;
    const { ok, errors, value } = validateConfig(c);
    assert.equal(ok, false, `accepted ${k}=${JSON.stringify(bad)}`);
    assert.ok(errors.some((e) => e.path === `screens[0].background.${k}`), JSON.stringify(errors));
    assert.equal(value.screens[0].background[k], def);
  }
});

test('privacy mode with hidden photos also hides them on the whole screen (stock photos, same scope)', () => {
  const c = defaultConfig();
  c.screens[0].background.source = 'gallery';
  c.screens[0].background.scope = 'screen';
  c.screens[0].privacy = { hidePhotos: true, showLock: true, schedule: [] };
  const { value } = validateConfig(c);
  const status = { active: true, until: '2026-10-09T14:00:00.000Z', by: 'admin', resumesAt: null };
  const on = displayConfig(value, value.screens[0], { privacy: { status, next: null } });
  assert.equal(on.background.source, 'stock');
  assert.equal(on.background.scope, 'screen');
  assert.equal(displayConfig(value, value.screens[0]).background.source, 'gallery');
});

test('the layouts it applies to are real layouts, and the others already have the photo everywhere or none', ts, () => {
  for (const p of glass.SCREEN_PHOTO_PRESETS) assert.ok(LAYOUT_PRESETS.includes(p), p);
  for (const p of ['leftRight', 'bigTime', 'photoFrame', 'board', 'bedside', 'widget']) assert.equal(glass.SCREEN_PHOTO_PRESETS.includes(p), false, p);
  const on = { enabled: true, scope: 'screen' };
  assert.equal(glass.photoOnWholeScreen(on, 'bigCalendar'), true);
  assert.equal(glass.photoOnWholeScreen(on, 'kidsFamily'), true);
  assert.equal(glass.photoOnWholeScreen(on, 'bedside'), false);
  assert.equal(glass.photoOnWholeScreen({ enabled: false, scope: 'screen' }, 'bigCalendar'), false);
  assert.equal(glass.photoOnWholeScreen({ enabled: true, scope: 'side' }, 'bigCalendar'), false);
  assert.equal(glass.photoOnWholeScreen({ enabled: true }, 'bigCalendar'), false);
  assert.equal(glass.photoOnWholeScreen(undefined, 'bigCalendar'), false);
});

test('calendar glass: never fully see-through, denser when light or without blur, follows the setting', ts, () => {
  const a = glass.calendarSheetAlpha;
  for (const light of [false, true]) {
    for (const lite of [false, true]) {
      const o = { light, lite };
      let prev = -1;
      for (let v = 0; v <= 1.0001; v += 0.1) {
        const x = a(v, o);
        assert.ok(x > prev, `grows with the setting (${JSON.stringify(o)})`);
        assert.ok(x >= 0.24 && x <= 0.96, `${x} in range`);
        prev = x;
      }
      // out of range and missing values
      assert.equal(a(-3, o), a(0, o));
      assert.equal(a(7, o), a(1, o));
      assert.equal(a(undefined, o), a(glass.CALENDAR_OPACITY_DEFAULT, o));
      assert.equal(a('x', o), a(0.5, o));
    }
    // lite mode (no blur behind the sheet) is always a bit denser
    for (const v of [0, 0.5, 1]) assert.ok(a(v, { light, lite: true }) >= a(v, { light, lite: false }));
  }
  // dark text on a light sheet needs more body than light text on a dark one
  for (const v of [0, 0.5]) assert.ok(a(v, { light: true, lite: false }) > a(v, { light: false, lite: false }));
  assert.ok(a(0, { light: true, lite: false }) >= 0.5);
});

test('styles: the photo spans the whole screen, the calendar is glass, lite mode has no blur', () => {
  const css = read('web/display/styles.css');
  assert.match(css, /#app\.bg-screen \.photo-area \{ grid-column: 1 \/ -1 !important; grid-row: 1 \/ -1 !important; \}/);
  assert.match(css, /#app\.bg-screen \.main \{[^}]*background: rgb\(var\(--sheet-rgb\) \/ var\(--sheet-a/);
  assert.match(css, /\.lite #app\.bg-screen \.main \{ -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  const modern = read('web/display/styles-modern.css');
  assert.match(modern, /\.lite\.style-modern #app\.bg-screen \.main \{ -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
  const kids = read('web/display/styles-kids.css');
  assert.match(kids, /\.style-modern #app\.is-kids\.bg-screen \.photo-area \{ display: block; \}/);
  // the display sets the class and the variable from the config
  const main = read('web/display/main.ts');
  assert.match(main, /photoOnWholeScreen\(cfg\.background, preset\) \? 'bg-screen' : ''/);
  assert.match(main, /setProperty\('--sheet-a'/);
});
