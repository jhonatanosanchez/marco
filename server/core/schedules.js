// scheduled messages: which ones are active now (server-side copy of the display algorithm, used by the
// dashboard). See docs/API.md and docs/ARCHITECTURE.md.
import { zonedParts, addDays, tzOffsetMinutes, isoWithOffset } from './lib/tz.js';

const pad = (n) => String(n).padStart(2, '0');
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Weekday (0 = Sunday) of a YYYY-MM-DD date. */
const weekday = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
};

/** ISO instant (with offset) of a local wall time `day` + `hhmm` in `tz` (DST-safe). */
export function localInstant(day, hhmm, tz) {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
  let t = wall;
  for (let i = 0; i < 3; i++) t = wall - tzOffsetMinutes(new Date(t), tz) * 60000;
  return isoWithOffset(new Date(t), tz);
}

/** `ok(day)` of §5.3: weekday allowed and inside [startDate, endDate] (null = open). */
export function dayOk(m, day) {
  if (m.days.length && !m.days.includes(weekday(day))) return false;
  if (m.startDate && day < m.startDate) return false;
  if (m.endDate && day > m.endDate) return false;
  return true;
}

/**
 * Is scheduled message `m` active at `now` in zone `tz`?
 * @returns {{ active: boolean, until: string | null }} until = ISO time (with offset) when the window ends
 */
export function scheduleState(m, now, tz) {
  if (!m.enabled) return { active: false, until: null };
  const p = zonedParts(now, tz);
  const D = `${String(p.y).padStart(4, '0')}-${pad(p.m)}-${pad(p.d)}`;
  const Y = addDays(D, -1);
  const n = p.h * 60 + p.mi;
  const from = minutes(m.from);
  const to = minutes(m.to);
  if (from < to) {
    return dayOk(m, D) && n >= from && n < to ? { active: true, until: localInstant(D, m.to, tz) } : { active: false, until: null };
  }
  if (from > to) {
    if (dayOk(m, D) && n >= from) return { active: true, until: localInstant(addDays(D, 1), m.to, tz) };
    if (dayOk(m, Y) && n < to) return { active: true, until: localInstant(D, m.to, tz) };
  }
  return { active: false, until: null };
}

/** DashboardResponse.schedulesNow for a stored config. */
export function schedulesNow(cfg, now = new Date()) {
  const tz = cfg.datetime.timezone;
  const out = [];
  for (const m of cfg.schedules.items) {
    const st = scheduleState(m, now, tz);
    if (st.active) out.push({ id: m.id, title: m.title, emoji: m.emoji, screenIds: m.screenIds, until: st.until });
  }
  return out;
}

// ---------------------------------------------------------------- time windows ({ enabled, days, from, to })
// The rule shape of privacy schedules and carousel schedules: days (0 = Sunday, [] = every day) and a from/to
// window (`to < from` crosses midnight and belongs to the day it starts).

const asSchedule = (r) => ({ enabled: r.enabled !== false, days: r.days || [], from: r.from, to: r.to, startDate: null, endDate: null });

/** The rules of `list` that can run: enabled, with a window that is not empty. */
export const enabledWindows = (list) => (Array.isArray(list) ? list : []).filter((r) => r && r.enabled !== false && r.from !== r.to);

/**
 * Is one of `rules` running at `now`? `until` = end of the whole running stretch (back-to-back or overlapping
 * windows count as one), as an ISO time with offset.
 */
export function windowState(rules, now, tz) {
  let at = now.getTime();
  let until = null;
  for (let i = 0; i < 16; i++) {
    let best = null;
    for (const r of rules) {
      const st = scheduleState(asSchedule(r), new Date(at), tz);
      if (st.active && (!best || Date.parse(st.until) > Date.parse(best))) best = st.until;
    }
    if (!best || Date.parse(best) <= at) break;
    until = best;
    at = Date.parse(best);
  }
  return { active: until !== null, until };
}

/** Next instant after `now` where one of `rules` starts or ends (ms), or null without rules. */
export function nextWindowBoundary(rules, now, tz) {
  if (!rules.length) return null;
  const p = zonedParts(now, tz);
  const today = `${String(p.y).padStart(4, '0')}-${pad(p.m)}-${pad(p.d)}`;
  const t0 = now.getTime();
  let best = null;
  for (const r of rules) {
    const m = asSchedule(r);
    for (let i = -1; i <= 8; i++) {
      const day = addDays(today, i);
      if (!dayOk(m, day)) continue;
      const start = Date.parse(localInstant(day, m.from, tz));
      const end = Date.parse(localInstant(m.from < m.to ? day : addDays(day, 1), m.to, tz));
      for (const x of [start, end]) if (x > t0 && (best === null || x < best)) best = x;
    }
  }
  return best;
}
