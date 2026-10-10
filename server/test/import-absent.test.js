// A file without some sections (a Marco Cloud export has no sign-in or Home Assistant settings) never changes them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from '../core/defaults.js';
import { validateConfig } from '../core/validate.js';
import { makeBundle, importPreview, mergeImport, absentSections, parseImport } from '../core/backupsCore.js';

test('sections missing from the file are unchanged in the preview and kept on merge', () => {
  const cur = validateConfig(defaultConfig()).value;
  cur.auth = { ...cur.auth, allowedEmails: ['owner@example.com'] };
  cur.homeassistant = { ...cur.homeassistant, url: 'http://ha.local:8123' };
  const other = structuredClone(cur);
  delete other.auth; delete other.homeassistant;
  other.weather = { ...other.weather, locationName: 'Madrid' };
  const bundle = makeBundle(other, { appVersion: '0.5.0' });
  assert.deepEqual([...absentSections(bundle)].sort(), ['auth', 'homeassistant']);
  const prev = importPreview(bundle, cur, 'en');
  assert.equal(prev.sections.find((s) => s.key === 'auth').changed, false);
  assert.equal(prev.sections.find((s) => s.key === 'homeassistant').changed, false);
  assert.equal(prev.sections.find((s) => s.key === 'weather').changed, true);
  const parsed = parseImport(bundle);
  for (const sections of [undefined, ['weather', 'auth', 'homeassistant']]) {
    const merged = mergeImport(cur, parsed.value, sections, absentSections(bundle));
    assert.deepEqual(merged.auth, cur.auth);
    assert.deepEqual(merged.homeassistant, cur.homeassistant);
    assert.equal(merged.weather.locationName, 'Madrid');
  }
});
