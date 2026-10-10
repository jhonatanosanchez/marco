// countdowns ("🎄 Navidad · Faltan 12 días"). See docs/API.md and docs/ARCHITECTURE.md.
// computeCountdowns() is pure (unit-tested in events-countdowns.test.js); getCountdowns() wires config + events.
import { addDays, daysBetween, localDate } from './core/lib/tz.js';
import { hash } from './lib/text.js';
import { getConfig } from './store.js';
import { defaultScreen, screenSourceIds } from './core/screens.js';
import { getDetailedEvents } from './calendars.js';
import { yearlyDate } from './localEvents.js';
import { normKey } from './eventRules.js';
import { LOCAL_SOURCE_ID, BIRTHDAYS_SOURCE_ID } from './core/defaults.js';

export const MAX_COUNTDOWNS = 30;
/** Flagged events are looked up at most this far ahead (bounds recurrence expansion / Google windows). */
export const MAX_EVENT_SCAN_DAYS = 400;
const ORIGIN_ORDER = { manual: 0, birthday: 1, event: 2 };

/** Next occurrence (≥ today) of a manual countdown, or null when it is in the past. */
export function nextCountdownDate(item, today) {
  if (!item.yearly) return item.date >= today ? item.date : null;
  if (item.date >= today) return item.date;
  const [, m, d] = item.date.split('-').map(Number);
  const y = Number(today.slice(0, 4));
  const thisYear = yearlyDate(y, m, d);
  return thisYear >= today ? thisYear : yearlyDate(y + 1, m, d);
}

const eventDate = (e, tz) => (e.allDay ? e.start : localDate(new Date(e.start), tz));

/**
 * @param {object} cfg stored v2 config
 * @param {object} screen screen profile
 * @param {{ today: string, tz: string, events?: object[] }} ctx `events` = detailed events (see calendars.js
 *   getDetailedEvents) covering [today, today + horizon] for the sources that can produce countdowns.
 * @returns {Array} CountdownItem[]
 */
export function computeCountdowns(cfg, screen, { today, tz, events = [] }) {
  const cd = cfg.countdowns;
  const horizon = cd.horizonDays;
  const limit = addDays(today, horizon);
  const visible = new Set(screenSourceIds(cfg, screen));
  const items = [];

  for (const k of cd.items) {
    const date = nextCountdownDate(k, today);
    if (!date || date > limit) continue;
    items.push({ id: k.id, title: k.title, emoji: k.emoji || '', color: k.color ?? null, date, days: daysBetween(today, date), origin: 'manual' });
  }

  const nearest = new Map(); // dedupe key → item (nearest occurrence wins: events are sorted by date)
  const wantBirthdays = cd.includeBirthdays && cfg.birthdays.enabled && visible.has(BIRTHDAYS_SOURCE_ID);
  const bdayLimit = addDays(today, Math.min(cd.birthdayDays, horizon));
  for (const e of events) {
    if (e.hidden || !visible.has(e.sourceId)) continue;
    const date = eventDate(e, tz);
    if (date < today) continue;
    if (e.sourceId === BIRTHDAYS_SOURCE_ID) {
      if (!wantBirthdays || date > bdayLimit) continue;
      const key = `b|${e.itemId}`;
      if (nearest.has(key)) continue;
      nearest.set(key, { id: e.id, title: e.title, emoji: e.emoji || '', color: e.color ?? null, date, days: daysBetween(today, date), origin: 'birthday', age: e.age ?? null });
    } else if (cd.includeFlagged && e.countdown) {
      if (date > limit) continue;
      const key = `e|${e.sourceId}|${normKey(e.title)}`;
      if (nearest.has(key)) continue;
      nearest.set(key, { id: e.id, title: e.title, emoji: e.emoji || '', color: e.color ?? null, date, days: daysBetween(today, date), origin: 'event' });
    }
  }
  items.push(...nearest.values());

  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    || ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin]
    || a.title.localeCompare(b.title));
  // De-duplicate the same title on the same date (e.g. a manual "Navidad" and a flagged "Navidad" event).
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.date}|${normKey(it.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= MAX_COUNTDOWNS) break;
  }
  return out;
}

/** Which sources may produce countdown items for this screen (null = none, skip the events scan). */
function sourcesToScan(cfg, screen) {
  const visible = screenSourceIds(cfg, screen);
  const cd = cfg.countdowns;
  const ids = new Set();
  if (cd.includeBirthdays && cfg.birthdays.enabled && cfg.birthdays.items.length) ids.add(BIRTHDAYS_SOURCE_ID);
  if (cd.includeFlagged) {
    const styleRules = cfg.eventRules.items.filter((r) => r.enabled && r.action === 'style' && r.countdown);
    if (cfg.localEvents.items.some((i) => i.countdown)) ids.add(LOCAL_SOURCE_ID);
    for (const r of styleRules) {
      for (const id of r.sourceIds.length ? r.sourceIds : visible) ids.add(id);
    }
  }
  const list = visible.filter((id) => ids.has(id));
  return list.length ? list : null;
}

/** GET /api/countdowns payload. `screen` = ScreenProfile or null (default screen). */
export async function getCountdowns({ screen = null } = {}) {
  const cfg = getConfig();
  const scr = screen || defaultScreen(cfg);
  const tz = cfg.datetime.timezone;
  const today = localDate(new Date(), tz);
  let events = [];
  const onlyIds = sourcesToScan(cfg, scr);
  if (onlyIds) {
    const cd = cfg.countdowns;
    const need = onlyIds.some((id) => id !== BIRTHDAYS_SOURCE_ID) ? cd.horizonDays : Math.min(cd.birthdayDays, cd.horizonDays);
    const days = Math.min(MAX_EVENT_SCAN_DAYS, Math.max(need, 1));
    try {
      events = (await getDetailedEvents({ from: today, to: addDays(today, days), screen: scr, onlyIds, cfg })).detailed;
    } catch (err) {
      console.warn('[countdowns] events scan failed:', err.message);
    }
  }
  const items = computeCountdowns(cfg, scr, { today, tz, events });
  return { generatedAt: new Date().toISOString(), today, hash: hash(items), items };
}
