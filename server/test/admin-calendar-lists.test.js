// Calendar lists of the admin (web/admin/util.ts): the privacy rows leave out empty or disabled built-in lists
// (like the display legend, server/core/screens.js publicSources), and a built-in list with the same name as a
// calendar source is labeled as the Marco list everywhere the admin lists calendars.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

const [util] = await loadWebModules('/web/admin/util.ts');

const cfg = ({ sources = [], local = [], bdays = [], localOn = true, bdaysOn = true } = {}) => ({
  calendar: { sources },
  localEvents: { enabled: localOn, name: 'Familia', color: '#111111', emoji: '', items: local },
  birthdays: { enabled: bdaysOn, name: 'Cumpleaños', color: '#222222', emoji: '', items: bdays },
});
const src = (id, name, extra = {}) => ({ id, name, color: '#333333', emoji: '', kind: 'generic', enabled: true, ...extra });
const ev = { id: 'l1' };
const bd = { id: 'b1' };

test('privacy rows leave out empty built-in lists', () => {
  const rows = util.privacyCalendarRows(cfg({ sources: [src('s1', 'Trabajo')] }));
  assert.deepEqual(rows.map((r) => r.id), ['s1']);
});

test('privacy rows leave out disabled built-in lists even with items', () => {
  const rows = util.privacyCalendarRows(cfg({ local: [ev], bdays: [bd], localOn: false, bdaysOn: false }));
  assert.deepEqual(rows, []);
});

test('privacy rows keep built-in lists with items, after the sources', () => {
  const rows = util.privacyCalendarRows(cfg({ sources: [src('s1', 'Trabajo')], local: [ev], bdays: [bd] }));
  assert.deepEqual(rows.map((r) => [r.id, r.name]), [['s1', 'Trabajo'], ['local', 'Familia'], ['birthdays', 'Cumpleaños']]);
});

test('a generic source named like the empty built-in birthdays list shows once', () => {
  const rows = util.privacyCalendarRows(cfg({ sources: [src('s1', 'Cumpleaños')] }));
  assert.deepEqual(rows.map((r) => [r.id, r.name]), [['s1', 'Cumpleaños']]);
});

test('a built-in list with the same name as a source (any case) is labeled as the Marco list', () => {
  const c = cfg({ sources: [src('s1', 'cumpleaños '), src('s2', 'FAMILIA')], local: [ev], bdays: [bd] });
  const names = Object.fromEntries(util.privacyCalendarRows(c).map((r) => [r.id, r.name]));
  assert.equal(names.s1, 'cumpleaños ');
  for (const [id, base] of [['local', 'Familia'], ['birthdays', 'Cumpleaños']]) {
    assert.notEqual(names[id], base);
    assert.ok(names[id].startsWith(`${base} (`) && names[id].endsWith(')'), names[id]);
  }
  assert.equal(util.builtinListName(cfg({ sources: [src('s1', 'Otro')] }), 'birthdays'), 'Cumpleaños');
});

test('pickers that list the built-ins use the same clash label', () => {
  const c = cfg({ sources: [src('s1', 'Cumpleaños', { enabled: false })] });
  const opts = util.allSourceOptions(c, { includeDisabled: true });
  assert.deepEqual(opts.map((o) => o.id), ['s1', 'local', 'birthdays']);
  assert.equal(opts.find((o) => o.id === 'birthdays').name, util.builtinListName(c, 'birthdays'));
  assert.notEqual(opts.find((o) => o.id === 'birthdays').name, 'Cumpleaños');
  assert.equal(opts.find((o) => o.id === 'local').name, 'Familia');
});

test('status rows label only the built-in lists', () => {
  const c = cfg({ sources: [src('s1', 'Cumpleaños')] });
  assert.equal(util.sourceRowName(c, 's1', 'Cumpleaños'), 'Cumpleaños');
  assert.equal(util.sourceRowName(c, 'birthdays', 'Cumpleaños'), util.builtinListName(c, 'birthdays'));
  assert.equal(util.sourceRowName(c, 'local', 'Familia'), 'Familia');
});

test('builtinNameClashes ignores case and spaces', () => {
  assert.equal(util.builtinNameClashes(cfg({ sources: [src('s1', ' CUMPLEAÑOS')] }), 'birthdays'), true);
  assert.equal(util.builtinNameClashes(cfg({ sources: [src('s1', ' CUMPLEAÑOS')] }), 'local'), false);
});
