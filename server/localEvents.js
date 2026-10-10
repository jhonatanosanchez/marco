// built-in "Local" calendar (admin-managed events) and birthdays → raw instances that go through the same
// pipeline as ICS/Google events (calendars.js buildSourceEvents). Pure functions; unit-tested in
// events-local.test.js. See docs/API.md and docs/ARCHITECTURE.md.
import { addDays, daysBetween, tzOffsetMinutes } from './core/lib/tz.js';
import { LOCAL_SOURCE_ID, BIRTHDAYS_SOURCE_ID } from './core/defaults.js';

export const MAX_OCCURRENCES = 1000;

const pad = (n, l = 2) => String(n).padStart(l, '0');
const ymd = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const parts = (s) => s.split('-').map(Number);
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 0 = Sunday … 6 */
export const weekdayOf = (s) => {
  const [y, m, d] = parts(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const mondayOf = (s) => addDays(s, -((weekdayOf(s) + 6) % 7));

/** Month/day in a given year, 29/02 → 28/02 on non-leap years. */
export function yearlyDate(year, month, day) {
  if (month === 2 && day === 29 && !isLeap(year)) return ymd(year, 2, 28);
  return ymd(year, month, Math.min(day, daysInMonth(year, month)));
}

/** Instant of a local wall-clock time (YYYY-MM-DD + HH:MM) in `tz` (DST-safe). */
export function zonedTime(dateStr, hhmm, tz) {
  const [y, m, d] = parts(dateStr);
  const [h, mi] = String(hhmm || '00:00').split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h || 0, mi || 0);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - tzOffsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

/**
 * Start dates (YYYY-MM-DD) of every occurrence of `item` whose start is in [scanFrom, scanTo] (inclusive),
 * honouring repeat.until (inclusive) and exceptions. At most MAX_OCCURRENCES.
 */
export function occurrenceDates(item, scanFrom, scanTo) {
  const out = [];
  const first = item.date;
  const rp = item.repeat || { freq: 'none', interval: 1, until: null, weekdays: [] };
  const interval = Math.max(1, rp.interval || 1);
  let end = scanTo;
  if (rp.freq !== 'none' && rp.until && rp.until < end) end = rp.until;
  const skip = new Set(item.exceptions || []);
  const push = (d) => {
    if (d >= first && d >= scanFrom && d <= end && !skip.has(d)) out.push(d);
    return out.length < MAX_OCCURRENCES;
  };
  if (end < scanFrom || first > end) return out;

  switch (rp.freq) {
    case 'weekly': {
      const days = new Set(rp.weekdays?.length ? rp.weekdays : [weekdayOf(first)]);
      const week0 = mondayOf(first);
      // Jump straight to the first "on" week ≥ scan start instead of walking day by day from `first`.
      const startDay = scanFrom > first ? scanFrom : first;
      let weeks = Math.floor(daysBetween(week0, mondayOf(startDay)) / 7);
      weeks = Math.ceil(weeks / interval) * interval;
      for (let monday = addDays(week0, weeks * 7); monday <= end; monday = addDays(monday, interval * 7)) {
        for (let i = 0; i < 7; i++) {
          const d = addDays(monday, i);
          if (d > end) break;
          if (days.has(weekdayOf(d)) && !push(d)) return out;
        }
      }
      break;
    }
    case 'monthly': {
      const [y0, m0, d0] = parts(first);
      const idx0 = y0 * 12 + (m0 - 1);
      const [ys, ms] = parts(scanFrom > first ? scanFrom : first);
      const [ye, me] = parts(end);
      const k = Math.max(0, Math.floor((ys * 12 + (ms - 1) - idx0) / interval));
      for (let idx = idx0 + k * interval; idx <= ye * 12 + (me - 1); idx += interval) {
        const y = Math.floor(idx / 12);
        const m = (idx % 12) + 1;
        if (d0 > daysInMonth(y, m)) continue; // months without that day are skipped (e.g. the 31st)
        if (!push(ymd(y, m, d0))) return out;
      }
      break;
    }
    case 'yearly': {
      const [y0, m0, d0] = parts(first);
      const ys = parts(scanFrom > first ? scanFrom : first)[0];
      const ye = parts(end)[0];
      const k = Math.max(0, Math.floor((ys - y0) / interval));
      for (let y = y0 + k * interval; y <= ye; y += interval) {
        if (!push(yearlyDate(y, m0, d0))) return out;
      }
      break;
    }
    default:
      push(first);
  }
  return out;
}

/**
 * Raw instances (same shape as ICS raws + per-item decoration) for local events overlapping [from, to]
 * (local dates, inclusive). Timed events use `tz` wall-clock times.
 */
export function expandLocalEvents(items, { from, to, tz }) {
  const raws = [];
  for (const it of items || []) {
    const span = Math.max(0, daysBetween(it.date, it.endDate || it.date));
    const scanFrom = addDays(from, -1 - span);
    const scanTo = addDays(to, 1);
    for (const d of occurrenceDates(it, scanFrom, scanTo)) {
      const last = addDays(d, span);
      const raw = {
        uid: it.id,
        title: it.title,
        description: it.notes || '',
        location: it.location || '',
        allDay: it.allDay !== false,
        emoji: it.emoji || '',
        color: it.color || null,
        countdown: Boolean(it.countdown),
      };
      if (raw.allDay) {
        raw.start = d;
        raw.end = addDays(last, 1);
      } else {
        raw.start = zonedTime(d, it.startTime || '00:00', tz);
        raw.end = zonedTime(last, it.endTime || it.startTime || '00:00', tz);
        if (raw.end < raw.start) raw.end = new Date(raw.start);
      }
      raws.push(raw);
    }
  }
  return raws;
}

/** Age turned on `occDate` (YYYY-MM-DD) or null when unknown / not shown / negative. */
export function birthdayAge(b, occYear, showAge = true) {
  if (!showAge || !Number.isInteger(b.year)) return null;
  const age = occYear - b.year;
  return age >= 0 ? age : null;
}

/** Raw all-day yearly instances for birthdays within [from, to]. */
export function expandBirthdays(items, { from, to, showAge = true }) {
  const raws = [];
  const y1 = parts(from)[0];
  const y2 = parts(to)[0];
  for (const b of items || []) {
    for (let y = y1; y <= y2; y++) {
      const d = yearlyDate(y, b.month, b.day);
      if (d < from || d > to) continue;
      raws.push({
        uid: b.id,
        idKey: `bday|${b.id}|${d}`,
        title: b.name,
        description: '',
        location: '',
        allDay: true,
        start: d,
        end: addDays(d, 1),
        emoji: b.emoji || '',
        color: null,
        age: birthdayAge(b, y, showAge),
      });
    }
  }
  return raws;
}

/** Next birthday date ≥ today (YYYY-MM-DD). */
export function nextBirthday(b, today) {
  const y = parts(today)[0];
  const d = yearlyDate(y, b.month, b.day);
  return d >= today ? d : yearlyDate(y + 1, b.month, b.day);
}

/** Pseudo-source objects (shape of CalendarSource subset used by the pipeline). */
export function localSource(cfg) {
  const le = cfg.localEvents;
  return { id: LOCAL_SOURCE_ID, type: 'local', name: le.name, color: le.color, emoji: le.emoji || '', kind: 'generic', enabled: le.enabled };
}
export function birthdaysSource(cfg) {
  const bd = cfg.birthdays;
  return { id: BIRTHDAYS_SOURCE_ID, type: 'birthdays', name: bd.name, color: bd.color, emoji: bd.emoji || '', kind: 'birthdays', enabled: bd.enabled };
}
