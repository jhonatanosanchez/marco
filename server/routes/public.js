// Display API (display key / device token / admin session in private mode; app.js applies displayAuth; anyone
// in open mode). Never exposes secrets, tokens or calendar URLs.
import { Router } from 'express';
import { getConfig } from '../store.js';
import { getEvents } from '../calendars.js';
import { getWeather } from '../weather.js';
import { getNews } from '../news.js';
import { getPhotos } from '../photos.js';
import { sseHandler } from '../sse.js';
import { streamInit, streamHello, onStreamOpen, onStreamClose, pollDisplay } from '../displays.js';
import { resolveScreen, displayConfig as projectDisplayConfig } from '../core/screens.js';
import { requestScreen } from '../displayAccess.js';
import { addDays, localDate, isDateStr, daysBetween } from '../core/lib/tz.js';
import { healthBody } from '../capabilities.js';
import { lanAddresses } from '../setup.js';
import { hostAllowed, hostnameOf, untrustedProxy } from '../lib/net.js';
import { screenPrivacy, screenPrivacyNext } from '../privacy.js';
import { privatizeEvents } from '../core/privacy.js';
import { hash } from '../lib/text.js';

/** Privacy of a screen as displayConfig() takes it ({ status, next }). */
const privacyOf = (cfg, screen) => ({ status: screenPrivacy(cfg, screen), next: screenPrivacyNext(cfg, screen) });

/** GET /api/display/config payload for `screenKey` (slug or id; empty → default screen). */
export function displayConfig(cfg, screenKey) {
  const { screen, fallback } = resolveScreen(cfg, screenKey);
  return projectDisplayConfig(cfg, screen, { fallback, privacy: privacyOf(cfg, screen) });
}

/** Display config for a request (screen bound to its key / device, else ?screen=). */
function displayConfigFor(cfg, req) {
  const { screen, fallback } = requestScreen(cfg, req);
  return projectDisplayConfig(cfg, screen, { fallback, privacy: privacyOf(cfg, screen) });
}

/**
 * Events as the display may see them: while the screen is private, busy / hidden calendars are filtered here,
 * before anything leaves the server (core/privacy.js). The admin preview iframe is a display, so it sees the same.
 */
export async function displayEvents(cfg, screen, { from, to }) {
  const r = await getEvents({ from, to, screen });
  if (!screenPrivacy(cfg, screen).active) return r;
  const events = privatizeEvents(r.events, cfg, screen.screen.language);
  return { ...r, events, hash: `p${hash(events)}` };
}

/** The request comes from this machine (loopback, not relayed by an untrusted proxy) under an allowed host name. */
export function onThisMachine(req) {
  const ip = String(req.ip || '').replace(/^::ffff:/i, '');
  if (ip !== '::1' && !ip.startsWith('127.')) return false;
  return !untrustedProxy(req) && hostAllowed(hostnameOf(req.get('host')));
}

export function publicRouter({ version }) {
  const r = Router();
  const noStore = (req, res, next) => { if (!res.get('cache-control')) res.set('cache-control', 'private, no-store'); next(); };
  r.use(noStore);

  // A display opened on the server itself (a kiosk on http://localhost) gets this machine's LAN addresses, so its
  // pairing screen can say where other devices reach the admin. Nobody else gets them.
  r.get('/health', (req, res) => res.json(healthBody({ version, lanAddresses: onThisMachine(req) ? lanAddresses() : undefined })));

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
      const cfg = getConfig();
      res.json(await displayEvents(cfg, requestScreen(cfg, req).screen, { from, to }));
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
      const cfg = getConfig();
      const { screen } = requestScreen(cfg, req);
      const after = typeof req.query.after === 'string' ? req.query.after : '';
      // Privacy mode with "hide photos": stock photos only, gallery file names never reach the display.
      const hide = screen.privacy?.hidePhotos && screenPrivacy(cfg, screen).active;
      const background = hide ? { ...screen.background, source: 'stock' } : screen.background;
      res.json({ photos: await getPhotos(Number(req.query.count) || 20, background, { key: hide ? `${screen.id}|private` : screen.id, after: hide ? '' : after }) });
    } catch (err) {
      next(err);
    }
  });

  // Poll channel for displays without a stream: GET /api/display/poll?client=&cursor=&rev=&hidden= (docs/API.md).
  r.get('/display/poll', (req, res) => res.json(pollDisplay(req)));

  // SSE: GET /api/stream?screen=<slug|id>&client=<clientId>[&k=<key|device token>] (docs/ARCHITECTURE.md).
  r.get('/stream', sseHandler({ init: streamInit, hello: streamHello, onOpen: onStreamOpen, onClose: onStreamClose }));
  return r;
}
