// local events + birthdays (docs/ARCHITECTURE.md)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { occurrenceDates, expandLocalEvents, expandBirthdays, birthdaysSource, localSource, nextBirthday, yearlyDate } from '../localEvents.js';
import { buildSourceEvents, sortEvents } from '../calendars.js';
import { defaultConfig } from '../defaults.js';
import { hash } from '../lib/text.js';
import { RULES } from './helpers.js';

const TZ = 'Europe/Lisbon';
const item = (over = {}) => ({
  id: 'l_test', title: 'Evento', emoji: '', color: null, location: '', notes: '', allDay: true,
  date: '2026-10-01', endDate: '2026-10-01', startTime: '', endTime: '',
  repeat: { freq: 'none', interval: 1, until: null, weekdays: [] }, exceptions: [], countdown: false, ...over,
});
const rep = (freq, extra = {}) => ({ freq, interval: 1, until: null, weekdays: [], ...extra });

test('one-off event: only its own date', () => {
  assert.deepEqual(occurrenceDates(item(), '2026-09-01', '2026-12-31'), ['2026-10-01']);
  assert.deepEqual(occurrenceDates(item(), '2026-10-02', '2026-12-31'), []);
});

test('weekly: weekdays, interval 2, until and exceptions', () => {
  // 2026-10-06 is a Tuesday. Every 2 weeks on Tue + Fri, until 2026-11-20, skipping 2026-10-20.
  const it = item({ date: '2026-10-06', endDate: '2026-10-06', repeat: rep('weekly', { interval: 2, weekdays: [2, 5], until: '2026-11-20' }), exceptions: ['2026-10-20'] });
  assert.deepEqual(occurrenceDates(it, '2026-09-01', '2026-12-31'), [
    '2026-10-06', '2026-10-09', /* 10-20 skipped */ '2026-10-23', '2026-11-03', '2026-11-06', '2026-11-17', '2026-11-20',
  ]);
  // Window that starts mid-series keeps the 2-week phase.
  assert.deepEqual(occurrenceDates(it, '2026-11-01', '2026-11-10'), ['2026-11-03', '2026-11-06']);
  // weekdays [] → weekday of `date`
  const w = item({ date: '2026-10-07', endDate: '2026-10-07', repeat: rep('weekly') });
  assert.deepEqual(occurrenceDates(w, '2026-10-01', '2026-10-31'), ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']);
  // Sunday in a Monday-based week: date Sunday 2026-10-11, weekdays Sun+Mon, interval 2
  const s = item({ date: '2026-10-11', endDate: '2026-10-11', repeat: rep('weekly', { interval: 2, weekdays: [0, 1] }) });
  assert.deepEqual(occurrenceDates(s, '2026-10-01', '2026-10-31'), ['2026-10-11', '2026-10-19', '2026-10-25']);
});

test('monthly on the 31st skips short months; interval respected', () => {
  const it = item({ date: '2026-01-31', endDate: '2026-01-31', repeat: rep('monthly') });
  assert.deepEqual(occurrenceDates(it, '2026-01-01', '2026-08-31'), ['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31']);
  const q = item({ date: '2026-01-15', endDate: '2026-01-15', repeat: rep('monthly', { interval: 3 }) });
  assert.deepEqual(occurrenceDates(q, '2026-05-01', '2027-01-31'), ['2026-07-15', '2026-10-15', '2027-01-15']);
});

test('yearly on 29/02 → 28/02 in non-leap years; exceptions apply to the shifted date', () => {
  const it = item({ date: '2024-02-29', endDate: '2024-02-29', repeat: rep('yearly') });
  assert.deepEqual(occurrenceDates(it, '2024-01-01', '2028-12-31'), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  const ex = { ...it, exceptions: ['2026-02-28'] };
  assert.deepEqual(occurrenceDates(ex, '2026-01-01', '2027-12-31'), ['2027-02-28']);
  assert.equal(yearlyDate(2100, 2, 29), '2100-02-28'); // 2100 is not a leap year
});

test('occurrence cap: at most 1000 per item', () => {
  const daily = item({ date: '2000-01-03', endDate: '2000-01-03', repeat: rep('weekly', { weekdays: [0, 1, 2, 3, 4, 5, 6] }) });
  assert.equal(occurrenceDates(daily, '2000-01-01', '2010-12-31').length, 1000);
});

test('timed multi-day event keeps wall-clock times across the DST change', () => {
  const it = item({ allDay: false, date: '2026-10-24', endDate: '2026-10-26', startTime: '22:00', endTime: '08:00' });
  const ev = buildSourceEvents(expandLocalEvents([it], { from: '2026-10-25', to: '2026-10-25', tz: TZ }), localSource(defaultConfig()), {
    rules: [], from: '2026-10-25', to: '2026-10-25', tz: TZ, lang: 'es',
  });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].start, '2026-10-24T22:00:00+01:00');
  assert.equal(ev[0].end, '2026-10-26T08:00:00+00:00');
  assert.equal(ev[0].multiDay, true);
  assert.equal(ev[0].sourceId, 'local');
  assert.equal(ev[0].id, hash(`local|l_test|${ev[0].start}`, 12));
});

test('recurring all-day multi-day event: duration preserved, started-before-window occurrence included', () => {
  // Weekend getaway every Friday → Sunday (3 days)
  const it = item({ date: '2026-10-02', endDate: '2026-10-04', repeat: rep('weekly') });
  const raws = expandLocalEvents([it], { from: '2026-10-11', to: '2026-10-17', tz: TZ });
  const ev = buildSourceEvents(raws, localSource(defaultConfig()), { rules: [], from: '2026-10-11', to: '2026-10-17', tz: TZ, lang: 'es' });
  assert.deepEqual(ev.map((e) => [e.start, e.end]), [['2026-10-09', '2026-10-12'], ['2026-10-16', '2026-10-19']]);
  assert.ok(ev.every((e) => e.multiDay && e.allDay));
});

test('local decoration: item emoji/color > style rule > icon rule > section emoji/color', () => {
  const cfg = defaultConfig();
  cfg.localEvents.emoji = '⭐';
  const src = localSource(cfg);
  const opts = { rules: RULES, from: '2026-10-01', to: '2026-10-31', tz: TZ, lang: 'es' };
  const build = (it, eventRules = []) => buildSourceEvents(expandLocalEvents([it], { from: '2026-10-01', to: '2026-10-31', tz: TZ }), src, { ...opts, eventRules })[0];
  // icon rule "dentista" 🩺, color from section
  let e = build(item({ title: 'Dentista Ana' }));
  assert.equal(e.emoji, '🩺');
  assert.equal(e.color, cfg.localEvents.color);
  // no icon rule → section emoji
  e = build(item({ title: 'Algo raro' }));
  assert.equal(e.emoji, '⭐');
  // style rule beats icon rule
  const style = { id: 'f_s', enabled: true, action: 'style', match: 'dentista', matchMode: 'contains', field: 'title', sourceIds: [], replaceWith: '', emoji: '🦷', color: '#112233', countdown: false, note: '' };
  e = build(item({ title: 'Dentista Ana' }), [style]);
  assert.equal(e.emoji, '🦷');
  assert.equal(e.color, '#112233');
  // item values beat everything
  e = build(item({ title: 'Dentista Ana', emoji: '😬', color: '#abcdef', notes: 'Llevar informe' }), [style]);
  assert.equal(e.emoji, '😬');
  assert.equal(e.color, '#abcdef');
  assert.equal(e.description, 'Llevar informe');
  assert.equal(e.kind, 'generic');
});

test('birthdays: yearly, age from birth year, 29/02 on non-leap years, showAge off', () => {
  const items = [
    { id: 'b_maria', name: 'María', month: 3, day: 15, year: 1992, emoji: '' },
    { id: 'b_leap', name: 'Leo', month: 2, day: 29, year: 2000, emoji: '🐸' },
    { id: 'b_noyear', name: 'Abuela', month: 3, day: 1, year: null, emoji: '' },
    { id: 'b_future', name: 'Bebé', month: 3, day: 2, year: 2030, emoji: '' },
  ];
  const cfg = defaultConfig();
  const src = birthdaysSource(cfg);
  const opts = { rules: RULES, from: '2027-02-01', to: '2027-03-31', tz: TZ, lang: 'es' };
  const ev = sortEvents(buildSourceEvents(expandBirthdays(items, { from: opts.from, to: opts.to, showAge: true }), src, opts), TZ);
  assert.deepEqual(ev.map((e) => [e.title, e.start, e.end, e.age]), [
    ['Leo', '2027-02-28', '2027-03-01', 27],
    ['Abuela', '2027-03-01', '2027-03-02', null],
    ['Bebé', '2027-03-02', '2027-03-03', null], // negative age → null
    ['María', '2027-03-15', '2027-03-16', 35],
  ]);
  assert.ok(ev.every((e) => e.kind === 'birthdays' && e.sourceId === 'birthdays' && e.allDay));
  assert.equal(ev[0].emoji, '🐸');
  assert.equal(ev[1].emoji, '🎂'); // section emoji (birthdays.emoji default)
  assert.equal(ev[0].id, hash('bday|b_leap|2027-02-28', 12));
  // leap year: real 29/02
  const leap = expandBirthdays(items.slice(1, 2), { from: '2028-01-01', to: '2028-12-31' });
  assert.deepEqual(leap.map((r) => [r.start, r.age]), [['2028-02-29', 28]]);
  // showAge false
  assert.equal(expandBirthdays(items.slice(0, 1), { from: '2027-01-01', to: '2027-12-31', showAge: false })[0].age, null);
  // next birthday
  assert.equal(nextBirthday(items[0], '2026-10-09'), '2027-03-15');
  assert.equal(nextBirthday(items[1], '2027-02-28'), '2027-02-28');
  assert.equal(nextBirthday(items[1], '2027-03-01'), '2028-02-29');
});

test('getEvents merges local + birthdays, applies screen source selection and hide rules', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-events-'));
  const store = await import('../store.js');
  store.initStore(dir);
  const { getEvents, sourceStatus } = await import('../calendars.js');
  const cfg = structuredClone(store.getConfig());
  cfg.calendar.sources = []; // no network
  cfg.localEvents.items = [
    item({ id: 'l_bins', title: 'Basura', date: '2026-10-06', endDate: '2026-10-06', repeat: rep('weekly', { weekdays: [2, 5] }) }),
    item({ id: 'l_secret', title: 'No disponible', date: '2026-10-07', endDate: '2026-10-07' }),
  ];
  cfg.birthdays.items = [{ id: 'b_m', name: 'María', month: 10, day: 12, year: 1990, emoji: '' }];
  cfg.eventRules.items = [{ id: 'f_hide', enabled: true, action: 'hide', match: 'no disponible', matchMode: 'contains', field: 'title', sourceIds: [], replaceWith: '', emoji: '', color: null, countdown: false, note: '' }];
  const second = structuredClone(cfg.screens[0]);
  Object.assign(second, { id: 's_cocina', slug: 'cocina', name: 'Cocina' });
  second.calendar.sourceIds = ['local'];
  cfg.screens.push(second);
  const r = store.saveConfig(cfg);
  assert.equal(r.ok, true, JSON.stringify(r.errors));

  const all = await getEvents({ from: '2026-10-05', to: '2026-10-13', screen: null });
  assert.deepEqual(all.events.map((e) => [e.start, e.title, e.sourceId]), [
    ['2026-10-06', 'Basura', 'local'],
    ['2026-10-09', 'Basura', 'local'],
    ['2026-10-12', 'María', 'birthdays'],
    ['2026-10-13', 'Basura', 'local'],
  ]);
  assert.equal(all.events[2].age, 36);
  assert.equal(all.events[2].kind, 'birthdays');
  assert.ok(!('age' in all.events[0]));
  assert.deepEqual(all.errors, []);

  const cocina = store.getConfig().screens.find((s) => s.slug === 'cocina');
  const only = await getEvents({ from: '2026-10-05', to: '2026-10-13', screen: cocina });
  assert.ok(only.events.every((e) => e.sourceId === 'local'));
  assert.notEqual(only.hash, all.hash);

  const st = sourceStatus();
  assert.deepEqual(st.map((s) => [s.id, s.ok, s.count]), [['local', true, 2], ['birthdays', true, 1]]);
  fs.rmSync(dir, { recursive: true, force: true });
});
