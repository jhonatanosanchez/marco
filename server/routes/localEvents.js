// local events, birthdays, event rules preview, countdowns.
// See docs/API.md and docs/ARCHITECTURE.md.
//   eventsAdminRouter() mounted at /api/admin (session required):
//     POST /events/preview          → EventsPreviewResponse
//     POST /birthdays/parse-csv     → BirthdayCsvResult
//   eventsPublicRouter() mounted at /api (no auth, LAN):
//     GET  /countdowns?screen=      → CountdownsResponse
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getConfig } from '../store.js';
import { resolveScreen } from '../screens.js';
import { validateConfig, isValidDate } from '../validate.js';
import { previewEvents } from '../calendars.js';
import { getCountdowns } from '../countdowns.js';
import { parseBirthdayCsv, MAX_CSV_BYTES } from '../csv.js';
import { addDays, localDate } from '../lib/tz.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Sanitise the draft parts of a preview request with the config validators.
 * Returns { overrides, errors } — errors only for the draft sections.
 */
export function sanitizeDraft(cfg, body) {
  const draft = { ...cfg };
  const prefixes = [];
  if (body.eventRules !== undefined) {
    draft.eventRules = { items: body.eventRules };
    prefixes.push('eventRules');
  }
  if (body.iconRules !== undefined) {
    draft.calendar = { ...cfg.calendar, iconRules: body.iconRules };
    prefixes.push('calendar.iconRules');
  }
  if (body.localEvents !== undefined) {
    draft.localEvents = body.localEvents;
    prefixes.push('localEvents');
  }
  if (body.birthdays !== undefined) {
    draft.birthdays = body.birthdays;
    prefixes.push('birthdays');
  }
  if (!prefixes.length) return { overrides: {}, errors: [] };
  const { value, errors } = validateConfig(draft);
  const mine = errors.filter((e) => prefixes.some((p) => e.path === p || e.path.startsWith(`${p}.`) || e.path.startsWith(`${p}[`)));
  const overrides = {};
  if (body.eventRules !== undefined) overrides.eventRules = value.eventRules.items;
  if (body.iconRules !== undefined) overrides.iconRules = value.calendar.iconRules;
  if (body.localEvents !== undefined) overrides.localEvents = value.localEvents;
  if (body.birthdays !== undefined) overrides.birthdays = value.birthdays;
  return { overrides, errors: mine };
}

export function eventsAdminRouter() {
  const r = Router();
  r.use(requireAuth);

  // docs/ARCHITECTURE.md — live preview of filters / overrides with draft rules.
  r.post('/events/preview', async (req, res, next) => {
    try {
      const body = isObj(req.body) ? req.body : {};
      const cfg = getConfig();
      const today = localDate(new Date(), cfg.datetime.timezone);
      if (body.from !== undefined && body.from !== null && !isValidDate(body.from)) {
        return res.status(400).json({ error: 'invalid', details: [{ path: 'from', message: 'invalid date (YYYY-MM-DD)' }] });
      }
      const from = body.from || today;
      let days = body.days === undefined || body.days === null ? 14 : Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 60) {
        return res.status(400).json({ error: 'invalid', details: [{ path: 'days', message: 'must be between 1 and 60' }] });
      }
      let screen = null;
      if (typeof body.screen === 'string' && body.screen.trim()) {
        const hit = resolveScreen(cfg, body.screen);
        if (hit.fallback) return res.status(400).json({ error: 'invalid', details: [{ path: 'screen', message: 'unknown screen' }] });
        screen = hit.screen;
        // Draft "Calendarios en esta pantalla" (unsaved) instead of the saved per-screen sources.
        const sc = body.screenCalendar;
        if (isObj(sc)) {
          const ids = Array.isArray(sc.sourceIds) ? sc.sourceIds.filter((x) => typeof x === 'string').slice(0, 100) : null;
          screen = { ...screen, calendar: { ...screen.calendar, enabled: typeof sc.enabled === 'boolean' ? sc.enabled : screen.calendar.enabled, sourceIds: ids } };
        }
      }
      for (const k of ['eventRules', 'iconRules']) {
        if (body[k] !== undefined && !Array.isArray(body[k])) return res.status(400).json({ error: 'invalid', details: [{ path: k, message: 'expected array' }] });
      }
      for (const k of ['localEvents', 'birthdays']) {
        if (body[k] !== undefined && !isObj(body[k])) return res.status(400).json({ error: 'invalid', details: [{ path: k, message: 'expected object' }] });
      }
      const { overrides, errors } = sanitizeDraft(cfg, body);
      if (errors.length) return res.status(400).json({ error: 'invalid', details: errors });
      res.json(await previewEvents({ from, to: addDays(from, days - 1), screen, overrides }));
    } catch (err) {
      next(err);
    }
  });

  // docs/ARCHITECTURE.md — parse pasted CSV (name;dd/mm[/yyyy]); nothing is saved.
  r.post('/birthdays/parse-csv', (req, res) => {
    const text = isObj(req.body) ? req.body.text : undefined;
    if (typeof text !== 'string') return res.status(400).json({ error: 'invalid', details: [{ path: 'text', message: 'expected string' }] });
    if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) return res.status(413).json({ error: 'too large', details: [{ path: 'text', message: 'max 100 kB' }] });
    res.json(parseBirthdayCsv(text, getConfig().birthdays.items));
  });

  return r;
}

export function eventsPublicRouter() {
  const r = Router();
  // docs/ARCHITECTURE.md — countdown chips for a screen (unknown ?screen → default screen).
  r.get('/countdowns', async (req, res, next) => {
    try {
      res.set('cache-control', 'no-store');
      const { screen } = resolveScreen(getConfig(), req.query.screen);
      res.json(await getCountdowns({ screen }));
    } catch (err) {
      next(err);
    }
  });
  return r;
}
