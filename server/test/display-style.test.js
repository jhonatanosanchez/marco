// Per-screen display style (screen.style): 'classic' (default, the original look) or 'modern'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateConfig, mergeDefaults } from '../validate.js';
import { defaultConfig, defaultScreenProfile } from '../defaults.js';
import { displayConfig } from '../screens.js';

test('new screens default to the modern style', () => {
  assert.equal(defaultScreenProfile().screen.style, 'modern');
  const { ok, value } = validateConfig(defaultConfig());
  assert.equal(ok, true);
  assert.equal(value.screens[0].screen.style, 'modern');
});

test('a stored screen without a style keeps the classic look when defaults are merged in', () => {
  const c = defaultConfig();
  delete c.screens[0].screen.style;
  c.screens.push({ id: 's_kitchen', slug: 'kitchen', name: 'Kitchen', screen: { style: 'modern' } });
  const { ok, value } = validateConfig(mergeDefaults(c));
  assert.equal(ok, true);
  assert.equal(value.screens[0].screen.style, 'classic');
  assert.equal(value.screens[1].screen.style, 'modern');
});

test('a config saved before the style setting existed loads as classic', () => {
  const c = defaultConfig();
  delete c.screens[0].screen.style;
  const { ok, value } = validateConfig(c);
  assert.equal(ok, true);
  assert.equal(value.screens[0].screen.style, 'classic');
});

test('each screen keeps its own style, independent of the layout', () => {
  const c = defaultConfig();
  c.screens.push({ ...defaultScreenProfile({ id: 's_kitchen', slug: 'kitchen', name: 'Kitchen' }) });
  c.screens[0].screen.style = 'modern';
  c.screens[1].screen.style = 'classic';
  c.screens[1].layout.preset = 'bigTime';
  const { ok, errors, value } = validateConfig(c);
  assert.equal(ok, true, JSON.stringify(errors));
  assert.equal(value.screens[0].screen.style, 'modern');
  assert.equal(value.screens[1].screen.style, 'classic');
  assert.equal(displayConfig(value, value.screens[0]).screen.style, 'modern');
  assert.equal(displayConfig(value, value.screens[1]).screen.style, 'classic');
  assert.equal(displayConfig(value, value.screens[1]).layout.preset, 'bigTime');
});

test('every modern rule is scoped to .style-modern, so the classic look cannot change', () => {
  const css = fs.readFileSync(new URL('../../web/display/styles-modern.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  // top-level and @media-nested rule preludes (everything before a "{" that is not an at-rule)
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith('@')) continue;
    // split on commas outside parentheses (:has(a, b) is one selector)
    let depth = 0, cur = '';
    for (const ch of prelude) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { selectors.push(cur.trim()); cur = ''; } else cur += ch;
    }
    selectors.push(cur.trim());
  }
  assert.ok(selectors.length > 100);
  const loose = selectors.filter((s) => !/^(\.lite)?\.style-modern[\s.:]/.test(s) && s !== '.style-modern');
  assert.deepEqual(loose, []);
});

test('unknown styles are rejected with a path and fall back to classic', () => {
  for (const bad of ['apple', 'Modern', '', 1, null]) {
    const c = defaultConfig();
    c.screens[0].screen.style = bad;
    const { ok, errors, value } = validateConfig(c);
    assert.equal(ok, false, `accepted ${JSON.stringify(bad)}`);
    assert.ok(errors.some((e) => e.path === 'screens[0].screen.style'), JSON.stringify(errors));
    assert.equal(value.screens[0].screen.style, 'classic');
  }
});
