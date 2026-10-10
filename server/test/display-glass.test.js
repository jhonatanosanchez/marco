// Glass options of the Modern display style (screen.glass): validation, defaults and the CSS values they produce.
// The web/shared/glass.ts checks load TypeScript through Node's type stripping (skipped before Node 22.18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateConfig } from '../core/validate.js';
import { defaultConfig } from '../core/defaults.js';
import { displayConfig } from '../core/screens.js';

let glass = null;
try {
  glass = await import('../../web/shared/glass.ts');
} catch {
  glass = null;
}
const ts = { skip: glass ? false : 'TypeScript imports need Node ≥ 22.18' };

const DEFAULTS = { appearance: 'auto', opacity: 0.5, blur: 18, tint: 'dark', edge: true };

test('new screens get the default glass, and so does a config saved before it existed', () => {
  const fresh = validateConfig(defaultConfig());
  assert.equal(fresh.ok, true);
  assert.deepEqual(fresh.value.screens[0].screen.glass, DEFAULTS);
  const c = defaultConfig();
  delete c.screens[0].screen.glass;
  const old = validateConfig(c);
  assert.equal(old.ok, true);
  assert.deepEqual(old.value.screens[0].screen.glass, DEFAULTS);
});

test('glass settings are kept per screen and reach the display config', () => {
  const c = defaultConfig();
  c.screens[0].screen.style = 'modern';
  c.screens[0].screen.glass = { appearance: 'clear', opacity: 0.2, blur: 6, tint: 'photo', edge: false };
  const { ok, errors, value } = validateConfig(c);
  assert.equal(ok, true, JSON.stringify(errors));
  assert.deepEqual(displayConfig(value, value.screens[0]).screen.glass, { appearance: 'clear', opacity: 0.2, blur: 6, tint: 'photo', edge: false });
});

test('a partial glass object keeps the defaults for the rest', () => {
  const c = defaultConfig();
  c.screens[0].screen.glass = { tint: 'light' };
  const { ok, value } = validateConfig(c);
  assert.equal(ok, true);
  assert.deepEqual(value.screens[0].screen.glass, { ...DEFAULTS, tint: 'light' });
});

test('invalid glass values are rejected with a path and fall back to the default', () => {
  const cases = [
    ['appearance', 'liquid'],
    ['opacity', 1.5],
    ['opacity', -0.1],
    ['opacity', 'solid'],
    ['blur', 41],
    ['blur', -1],
    ['tint', 'blue'],
    ['edge', 'yes'],
  ];
  for (const [k, bad] of cases) {
    const c = defaultConfig();
    c.screens[0].screen.glass = { [k]: bad };
    const { ok, errors, value } = validateConfig(c);
    assert.equal(ok, false, `accepted ${k}=${JSON.stringify(bad)}`);
    assert.ok(errors.some((e) => e.path === `screens[0].screen.glass.${k}`), JSON.stringify(errors));
    assert.equal(value.screens[0].screen.glass[k], DEFAULTS[k]);
  }
  const c = defaultConfig();
  c.screens[0].screen.glass = 'clear';
  const { ok, errors } = validateConfig(c);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.path === 'screens[0].screen.glass'));
});

test('the display defaults match the server defaults', ts, () => {
  assert.deepEqual(glass.GLASS_DEFAULTS, DEFAULTS);
  assert.deepEqual(glass.normalizeGlass(undefined), DEFAULTS);
  assert.deepEqual(glass.normalizeGlass({ opacity: 9, blur: -3, tint: 'x', appearance: 'y', edge: 0 }), { ...DEFAULTS, opacity: 1, blur: 0, edge: true });
});

test('default glass reproduces the original Modern material exactly', ts, () => {
  for (const tone of [0, 0.3, 0.5, 1]) {
    const v = glass.glassVars(DEFAULTS, { tone, rgb: [80, 80, 80] }, { lite: false, hasPhoto: true }).vars;
    assert.equal(v['--g-rgb'], '22 22 26');
    assert.equal(Number(v['--g-a']), Number(Math.min(0.9, 0.24 + tone * 0.24).toFixed(3)));
    assert.equal(Number(v['--g-a-wx']), Number(Math.min(0.9, 0.18 + tone * 0.2).toFixed(3)));
    assert.equal(v['--g-filter'], 'blur(3.06rem) saturate(1.8)');
    assert.equal(v['--g-sheet-filter'], 'blur(4.00rem) saturate(1.6)');
    assert.equal(v['--g-sheet-a'], '0.460');
  }
  const lite = glass.glassVars(DEFAULTS, { tone: 0.5, rgb: [80, 80, 80] }, { lite: true, hasPhoto: true }).vars;
  assert.equal(lite['--g-rgb'], '28 28 32');
  assert.equal(lite['--g-a'], '0.740');
  assert.equal(lite['--g-filter'], 'none');
  assert.equal(lite['--g-sheet-a'], '0.860');
});

test('appearance, transparency, blur, tint and edge change the material', ts, () => {
  const photo = { tone: 0.5, rgb: [40, 90, 160] };
  const a = (g) => Number(glass.glassVars({ ...DEFAULTS, ...g }, photo, { lite: false, hasPhoto: true }).vars['--g-a']);
  assert.ok(a({ appearance: 'clear' }) < a({}) && a({}) < a({ appearance: 'tinted' }));
  assert.ok(a({ opacity: 0.1 }) < a({}) && a({}) < a({ opacity: 0.9 }));
  assert.equal(glass.glassVars({ ...DEFAULTS, blur: 0 }, photo, { lite: false, hasPhoto: true }).vars['--g-filter'], 'none');
  // auto follows the photo: more solid over a bright, busy photo
  const auto = (tone) => Number(glass.glassVars(DEFAULTS, { ...photo, tone }, { lite: false, hasPhoto: true }).vars['--g-a']);
  assert.ok(auto(0.9) > auto(0.1));
  // tint from the photo: a deep version of its colour (here blue)
  const [r, g, b] = glass.glassVars({ ...DEFAULTS, tint: 'photo' }, photo, { lite: false, hasPhoto: true }).vars['--g-rgb'].split(' ').map(Number);
  assert.ok(b > r && b > g && b < 120, `${r} ${g} ${b}`);
  // light glass turns the text dark; dark glass keeps it white
  assert.equal(glass.glassVars({ ...DEFAULTS, tint: 'light' }, photo, { lite: false, hasPhoto: true }).inkDark, true);
  assert.equal(glass.glassVars(DEFAULTS, photo, { lite: false, hasPhoto: true }).inkDark, false);
  assert.equal(glass.glassVars({ ...DEFAULTS, tint: 'light' }, null, { lite: false, hasPhoto: false }).inkDark, true);
  assert.equal(glass.glassVars({ ...DEFAULTS, tint: 'light', appearance: 'clear' }, photo, { lite: false, hasPhoto: true }).inkDark, false);
  assert.equal(glass.glassVars({ ...DEFAULTS, appearance: 'clear' }, photo, { lite: false, hasPhoto: true }).thin, true);
  assert.equal(glass.glassVars(DEFAULTS, { ...photo, tone: 0 }, { lite: false, hasPhoto: true }).thin, false);
  assert.equal(glass.glassVars({ ...DEFAULTS, edge: false }, photo, { lite: false, hasPhoto: true }).edge, false);
  // no photo: "from the photo" falls back to the dark tint
  assert.equal(glass.glassVars({ ...DEFAULTS, tint: 'photo' }, null, { lite: false, hasPhoto: true }).vars['--g-rgb'], '22 22 26');
});

test('the glass rules stay inside .style-modern and never add a backdrop-filter of their own', () => {
  const css = fs.readFileSync(new URL('../../web/display/styles-modern.css', import.meta.url), 'utf8');
  const part = css.slice(css.indexOf('glass options (screen.glass)'), css.indexOf('month / week grid'));
  assert.ok(part.length > 500);
  assert.ok(!/backdrop-filter/.test(part));
  for (const v of ['--g-rgb', '--g-a', '--g-a-wx', '--g-filter', '--g-solid', '--g-sheet-a', '--g-sheet-filter', '--g-edge']) {
    assert.ok(css.includes(`var(${v}`), `${v} unused`);
  }
});
