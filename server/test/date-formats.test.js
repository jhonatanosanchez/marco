// Date line formats, including the numeric and US ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../core/validate.js';
import { defaultConfig } from '../core/defaults.js';
import { loadWebModules } from './webModules.js';

const [i18n] = await loadWebModules('/web/shared/i18n.ts');

test('every date format renders and validates', () => {
  const f = (lang, fmt) => i18n.formatDateLine(lang, '2026-03-07', fmt);
  assert.equal(f('en', 'weekday_month_d_y'), 'Saturday, March 7, 2026');
  assert.equal(f('en', 'weekday_mdy'), 'Saturday, 03/07/2026');
  assert.equal(f('es', 'weekday_dmy'), 'Sábado, 07/03/2026');
  assert.equal(f('pt', 'weekday_iso'), 'Sábado, 2026-03-07');
  assert.equal(f('es', 'weekday_d_month'), 'Sábado, 7 de marzo');
  for (const fmt of ['weekday_month_d_y', 'weekday_mdy', 'weekday_dmy', 'weekday_iso']) {
    const c = defaultConfig();
    c.screens[0].datetime.dateFormat = fmt;
    const { ok, value } = validateConfig(c);
    assert.equal(ok, true);
    assert.equal(value.screens[0].datetime.dateFormat, fmt);
  }
});
