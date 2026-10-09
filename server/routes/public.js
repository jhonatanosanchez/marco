// Display API (display key / device token / admin session in private mode; app.js applies displayAuth; anyone
// in open mode). Never exposes secrets, tokens or calendar URLs.
import { Router } from 'express';
import { getConfig } from '../store.js';
import { getEvents } from '../calendars.js';
import { getWeather } from '../weather.js';
import { getNews } from '../news.js';
import { getPhotos } from '../photos.js';
import { sseHandler } from '../sse.js';
import { streamInit, streamHello, onStreamOpen, onStreamClose } from '../displays.js';
import { resolveScreen, displayConfig as projectDisplayConfig } from '../screens.js';
import { requestScreen } from '../displayAccess.js';
import { addDays, localDate, isDateStr, daysBetween } from '../lib/tz.js';

/** GET /api/display/config payload for `screenKey` (slug or id; empty → default screen). */
export function displayConfig(cfg, screenKey) {
  const { screen, fallback } = resolveScreen(cfg, screenKey);
  return projectDisplayConfig(cfg, screen, { fallback });
}

/** Display config for a request (screen bound to its key / device, else ?screen=). */
function displayConfigFor(cfg, req) {
  const { screen, fallback } = requestScreen(cfg, req);
  return projectDisplayConfig(cfg, screen, { fallback });
}

export function publicRouter({ version }) {
  const r = Router();
  const noStore = (req, res, next) => { if (!res.get('cache-control')) res.set('cache-control', 'private, no-store'); next(); };
  r.use(noStore);

  r.get('/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), version, live: 'sse' }));

  r.get('/display/config', (req, res) => res.json(displayConfigFor(getConfig(), req)));

  r.get('/events', async (req, res, next) => {
    try {
      const tz = getConfig().datetime.timezone;
      const today = localDate(new Date(), tz);
      let from = isDateStr(req.query.from) ? req.query.from : addDays(today, -7);
      let to = isDateStr(req.query.to) ? req.query.to : addDays(today, 42);
      if (to < from) return res.status(400).json({ error: '`to` must be >= `from`' });
      // Keep the (unauthenticated) window near today: limits Google refetches and recurrence expansion.
      const minDate = addDays(today, -366);
      const maxDate = addDays(today, 731);
      if (from < minDate) from = minDate;
      if (to > maxDate) to = maxDate;
      if (from > maxDate) from = maxDate;
      if (to < from) to = from;
      if (daysBetween(from, to) > 400) to = addDays(from, 400);
      res.json(await getEvents({ from, to, screen: requestScreen(getConfig(), req).screen }));
    } catch (err) {
      next(err);
    }
  });

  r.get('/weather', async (req, res) => {
    try {
      res.json(await getWeather({ lang: requestScreen(getConfig(), req).screen.screen.language }));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  r.get('/news', async (req, res, next) => {
    try {
      res.json(await getNews());
    } catch (err) {
      next(err);
    }
  });

  r.get('/photos', async (req, res, next) => {
    try {
      const { screen } = requestScreen(getConfig(), req);
      const after = typeof req.query.after === 'string' ? req.query.after : '';
      res.json({ photos: await getPhotos(Number(req.query.count) || 20, screen.background, { key: screen.id, after }) });
    } catch (err) {
      next(err);
    }
  });

  // SSE: GET /api/stream?screen=<slug|id>&client=<clientId>[&k=<key|device token>] (docs/ARCHITECTURE.md).
  r.get('/stream', sseHandler({ init: streamInit, hello: streamHello, onOpen: onStreamOpen, onClose: onStreamClose }));
  return r;
}
