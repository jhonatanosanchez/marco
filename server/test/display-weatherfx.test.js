// What the display's WebGL weather effect shows for each WMO weather code (icons.ts weatherFxOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

test('weather effect: kind, strength and thunder per WMO code', async () => {
  const [{ weatherFxOf }] = await loadWebModules('/web/display/icons.ts');
  assert.deepEqual(weatherFxOf(0, true), { mode: 'sun', level: 1, storm: false });
  assert.equal(weatherFxOf(0, false).mode, null, 'no sun at night');
  assert.equal(weatherFxOf(3, true).mode, null, 'overcast: nothing');
  assert.equal(weatherFxOf(45, true).mode, 'fog');
  const drizzle = weatherFxOf(51, true), rain = weatherFxOf(63, true), heavy = weatherFxOf(65, true);
  assert.equal(drizzle.mode, 'rain');
  assert.ok(drizzle.level < rain.level && rain.level < heavy.level, 'drizzle < rain < heavy rain');
  assert.deepEqual(weatherFxOf(95, true), { mode: 'rain', level: 1, storm: true });
  assert.ok(weatherFxOf(71, true).level < weatherFxOf(75, true).level, 'light snow < heavy snow');
  assert.equal(weatherFxOf(75, true).mode, 'snow');
});
