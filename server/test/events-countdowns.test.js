// countdowns (docs/ARCHITECTURE.md)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeCountdowns, nextCountdownDate } from '../countdowns.js';
import { buildSourceEvents } from '../calendars.js';
import { expandLocalEvents, expandBirthdays, localSource, birthdaysSource } from '../localEvents.js';
import { defaultConfig } from '../core/defaults.js';
import { addDays, localDate } from '../core/lib/tz.js';

const TZ = 'Europe/Lisbon';
const TODAY = '2026-10-09';

test('next occurrence of manual countdowns (one-off, yearly, 29/02)', () => {
  assert.equal(nextCountdownDate({ date: '2026-12-25', yearly: false }, TODAY), '2026-12-25');
  assert.equal(nextCountdownDate({ date: '2026-10-09', yearly: false }, TODAY), '2026-10-09');
  assert.equal(nextCountdownDate({ date: '2026-10-08', yearly: false }, TODAY), null);
  assert.equal(nextCountdownDate({ date: '2020-12-25', yearly: true }, TODAY), '2026-12-25');
  assert.equal(nextCountdownDate({ date: '2020-03-01', yearly: true }, TODAY), '2027-03-01');
  assert.equal(nextCountdownDate({ date: '2024-02-29', yearly: true }, TODAY), '2027-02-28');
  assert.equal(nextCountdownDate({ date: '2027-05-01', yearly: true }, TODAY), '2027-05-01'); // first occurrence in the future
});

function setup() {
  const cfg = defaultConfig();
  cfg.calendar.sources = [{ id: 'c_fam', type: 'ics', name: 'Familia', url: 'https://x/y.ics', color: '#4ea8de', emoji: '', kind: 'generic', enabled: true, refreshMin: 5 }];
  cfg.countdowns.items = [
    { id: 'k_xmas', title: 'Navidad', emoji: '🎄', color: null, date: '2025-12-25', yearly: true },
    { id: 'k_trip', title: 'Viaje a Madeira', emoji: '✈️', color: '#00aaff', date: '2026-11-20', yearly: false },
    { id: 'k_past', title: 'Pasado', emoji: '', color: null, date: '2026-01-01', yearly: false },
    { id: 'k_far', title: 'Lejos', emoji: '', color: null, date: '2028-01-01', yearly: false },
    { id: 'k_today', title: 'Hoy mismo', emoji: '', color: null, date: TODAY, yearly: false },
  ];
  cfg.birthdays.items = [
    { id: 'b_m', name: 'María', month: 10, day: 21, year: 1992, emoji: '' },
    { id: 'b_far', name: 'Luis', month: 1, day: 5, year: null, emoji: '' }, // > 30 days away
  ];
  cfg.localEvents.items = [{
    id: 'l_gym', title: 'Gimnasio', emoji: '', color: null, location: '', notes: '', allDay: true, date: '2026-10-05', endDate: '2026-10-05',
    startTime: '', endTime: '', repeat: { freq: 'weekly', interval: 1, until: null, weekdays: [] }, exceptions: [], countdown: true,
  }, {
    id: 'l_xmas', title: 'navidad', emoji: '', color: null, location: '', notes: '', allDay: true, date: '2026-12-25', endDate: '2026-12-25',
    startTime: '', endTime: '', repeat: { freq: 'none', interval: 1, until: null, weekdays: [] }, exceptions: [], countdown: true,
  }];
  cfg.eventRules.items = [
    { id: 'f_c', enabled: true, action: 'style', match: 'concierto', matchMode: 'contains', field: 'title', sourceIds: [], replaceWith: '', emoji: '🎵', color: null, countdown: true, note: '' },
    { id: 'f_h', enabled: true, action: 'hide', match: 'secreto', matchMode: 'contains', field: 'title', sourceIds: [], replaceWith: '', emoji: '', color: null, countdown: false, note: '' },
  ];
  return cfg;
}

function detailedEvents(cfg, from, to) {
  const opts = { rules: cfg.calendar.iconRules, eventRules: cfg.eventRules.items, from, to, tz: TZ, lang: 'es', detail: true };
  const remote = [
    { uid: 'u1', title: 'Concierto Coldplay', description: '', location: '', allDay: false, start: new Date('2026-11-02T20:00:00Z'), end: new Date('2026-11-02T23:00:00Z') },
    { uid: 'u2', title: 'Concierto secreto', description: '', location: '', allDay: true, start: '2026-10-15', end: '2026-10-16' },
    { uid: 'u3', title: 'Concierto pasado', description: '', location: '', allDay: true, start: '2026-10-01', end: '2026-10-02' },
  ];
  return [
    ...buildSourceEvents(remote, cfg.calendar.sources[0], opts),
    ...buildSourceEvents(expandLocalEvents(cfg.localEvents.items, { from, to, tz: TZ }), localSource(cfg), opts),
    ...buildSourceEvents(expandBirthdays(cfg.birthdays.items, { from, to, showAge: true }), birthdaysSource(cfg), opts),
  ].sort((a, b) => (a.start < b.start ? -1 : 1));
}

test('computeCountdowns: manual + birthdays + flagged events, dedupe, sort, horizon', () => {
  const cfg = setup();
  const events = detailedEvents(cfg, TODAY, addDays(TODAY, 365));
  const items = computeCountdowns(cfg, cfg.screens[0], { today: TODAY, tz: TZ, events });
  assert.deepEqual(items.map((i) => [i.date, i.title, i.origin, i.days]), [
    ['2026-10-09', 'Hoy mismo', 'manual', 0],
    ['2026-10-12', 'Gimnasio', 'event', 3], // nearest weekly occurrence only
    ['2026-10-21', 'María', 'birthday', 12],
    ['2026-11-02', 'Concierto Coldplay', 'event', 24], // style rule with countdown; hidden "secreto" excluded
    ['2026-11-20', 'Viaje a Madeira', 'manual', 42],
    ['2026-12-25', 'Navidad', 'manual', 77], // flagged local "navidad" on the same day is de-duplicated
  ]);
  const maria = items.find((i) => i.origin === 'birthday');
  assert.equal(maria.age, 34);
  assert.equal(maria.emoji, '🎂');
  assert.equal(items.find((i) => i.title === 'Concierto Coldplay').emoji, '🎵');
  assert.equal(items.find((i) => i.title === 'Viaje a Madeira').color, '#00aaff');

  // A screen that only shows the remote calendar: no birthdays, no local flagged events.
  const scr = { ...structuredClone(cfg.screens[0]), calendar: { ...cfg.screens[0].calendar, sourceIds: ['c_fam'] } };
  assert.deepEqual(computeCountdowns(cfg, scr, { today: TODAY, tz: TZ, events }).map((i) => i.origin), ['manual', 'event', 'manual', 'manual']);

  // Switches + horizon
  cfg.countdowns.includeBirthdays = false;
  cfg.countdowns.includeFlagged = false;
  cfg.countdowns.horizonDays = 60;
  assert.deepEqual(computeCountdowns(cfg, cfg.screens[0], { today: TODAY, tz: TZ, events }).map((i) => i.title), ['Hoy mismo', 'Viaje a Madeira']);
});

test('getCountdowns (store-backed) + GET payload shape', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-cd-'));
  const store = await import('../store.js');
  store.initStore(dir);
  const { getCountdowns } = await import('../countdowns.js');
  const cfg = setup();
  cfg.calendar.sources = [];
  cfg.localEvents.items = [];
  const today = localDate(new Date(), cfg.datetime.timezone);
  cfg.countdowns.items = [{ id: 'k_1', title: 'Mañana', emoji: '⏰', color: null, date: addDays(today, 1), yearly: false }];
  const [, mm, dd] = addDays(today, 5).split('-').map(Number);
  cfg.birthdays.items = [{ id: 'b_x', name: 'Eva', month: mm, day: dd, year: null, emoji: '' }];
  cfg.revision = store.getConfig().revision;
  const r = store.saveConfig(cfg);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const res = await getCountdowns({ screen: null });
  assert.equal(res.today, today);
  assert.match(res.hash, /^[0-9a-f]{16}$/);
  const titles = res.items.map((i) => [i.title, i.days, i.origin]);
  assert.deepEqual(titles.slice(0, 2), [['Mañana', 1, 'manual'], ['Eva', 5, 'birthday']]);
  fs.rmSync(dir, { recursive: true, force: true });
});
