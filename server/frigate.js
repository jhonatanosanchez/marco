// Cámaras Frigate (fork fsrhome): intermediario de video para las pantallas y ciclo de eventos (actividad y alertas).
// Solo las cámaras de cfg.frigate.cameras; nunca la API de go2rtc más allá de stream.mp4 (/api/streams trae la clave
// del DVR). Spec: homelab-docs/specs/2026-10-13-marco-camaras-design.md
import http from 'node:http';
import https from 'node:https';
import { Router } from 'express';
import { getConfig } from './store.js';
import { publish, listPollers } from './pollHub.js';
import { listClients } from './sse.js';
import { requireAuth } from './auth.js';
import { logActivity } from './activity.js';
import { CAMERA_ID_RE, EVENT_ID_RE, activityByCamera, alertScreenIds, emptyAlertState, newAlerts, screensWantingCameras, validEvents } from './core/camerasCore.js';

/** User-Agent neutro: con uno tipo Safari (Silk), go2rtc redirige a HLS. */
export const UPSTREAM_UA = 'marco-frigate';
/** sin un byte en este tiempo, la conexión hacia Frigate se da por muerta */
const IDLE_MS = 15_000;

function unavailable(res) {
  if (res.headersSent) return void res.destroy();
  res.status(502).set('cache-control', 'private, no-store').type('text/plain').send('camera unavailable');
}

/** Pasa `url` tal cual al navegador; cierra la de arriba cuando el navegador se va. */
function relay(req, res, url) {
  const u = new URL(url);
  const mod = u.protocol === 'https:' ? https : http;
  const up = mod.get(u, { headers: { 'user-agent': UPSTREAM_UA }, timeout: IDLE_MS }, (r) => {
    if (!r.statusCode || r.statusCode >= 300) { r.resume(); return unavailable(res); }
    res.status(200);
    res.set('content-type', r.headers['content-type'] || 'application/octet-stream');
    res.set('cache-control', 'private, no-store');
    res.set('x-accel-buffering', 'no');
    r.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', () => unavailable(res));
  res.on('close', () => up.destroy());
}

const notFound = (res) => res.status(404).set('cache-control', 'private, no-store').type('text/plain').send('not found');

/** Montado en /media, después de mediaAuth (app.js). */
export function camerasMediaRouter() {
  const r = Router();
  r.get('/cameras/events/:eventId/snapshot.jpg', (req, res) => {
    const f = getConfig().frigate;
    const id = req.params.eventId;
    if (!f?.enabled || !EVENT_ID_RE.test(id)) return notFound(res);
    relay(req, res, `${f.url}/api/events/${id}/snapshot.jpg?bbox=1&h=480`);
  });
  r.get('/cameras/:file', (req, res) => {
    const f = getConfig().frigate;
    const m = /^([a-z0-9_]{1,40})\.(mjpeg|mp4)$/.exec(req.params.file);
    if (!f?.enabled || !m || !CAMERA_ID_RE.test(m[1]) || !f.cameras.some((c) => c.id === m[1])) return notFound(res);
    const cam = encodeURIComponent(m[1]);
    relay(req, res, m[2] === 'mjpeg' ? `${f.url}/api/${cam}?fps=4&h=360` : `${f.go2rtcUrl}/api/stream.mp4?src=${cam}`);
  });
  return r;
}

export const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 4000;

let startedAtS = Date.now() / 1000;
let alertState = emptyAlertState();
let activity = {};
let activitySig = '{}';
let status = { lastOkAt: null, lastError: null, lastEventAt: null };
let busy = false;
let timer = null;

export const currentActivity = () => activity;

export function camerasStatus() {
  const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
  return { enabled: getConfig().frigate?.enabled === true, lastOkAt: iso(status.lastOkAt), lastError: status.lastError, lastEventAt: iso(status.lastEventAt) };
}

export function _resetCameras(startedAtMs = Date.now()) {
  startedAtS = startedAtMs / 1000;
  alertState = emptyAlertState();
  activity = {};
  activitySig = '{}';
  status = { lastOkAt: null, lastError: null, lastEventAt: null };
  busy = false;
}

/** ¿Hay una pantalla conectada (SSE o sondeo) que muestre cámaras o tenga alertas? */
function someoneWatching(cfg, now) {
  const want = screensWantingCameras(cfg);
  if (!want.size) return false;
  return listClients().some((c) => !c.preview && want.has(c.screenId)) || listPollers(now).some((p) => want.has(p.screenId));
}

/** Una vuelta del ciclo: pide eventos a Frigate, publica actividad (si cambió) y alertas nuevas. */
export async function tickCameras(now = Date.now(), { force = false } = {}) {
  const cfg = getConfig();
  const f = cfg.frigate;
  if (!f?.enabled || busy || (!force && !someoneWatching(cfg, now))) return;
  busy = true;
  try {
    const q = new URLSearchParams({ limit: '40', labels: 'person,car', zones: f.zones.join(',') });
    const r = await fetch(`${f.url}/api/events?${q}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'user-agent': UPSTREAM_UA } });
    if (!r.ok) throw new Error(`http ${r.status}`);
    const events = validEvents(await r.json(), new Set(f.cameras.map((c) => c.id)));
    const newest = events.reduce((m, e) => Math.max(m, e.start_time * 1000), 0);
    status = { lastOkAt: now, lastError: null, lastEventAt: Math.max(newest, status.lastEventAt || 0) || null };
    const act = activityByCamera(events, now / 1000);
    const sig = JSON.stringify(act);
    if (sig !== activitySig) {
      activity = act;
      activitySig = sig;
      publish('cameras', { activity });
    }
    const out = newAlerts(alertState, events, startedAtS);
    alertState = out.state;
    const screenIds = alertScreenIds(cfg);
    if (screenIds.length) {
      for (const a of out.alerts) {
        const name = f.cameras.find((c) => c.id === a.camera)?.name || a.camera;
        publish('cameraAlert', { ...a, name }, { screenIds });
      }
    }
  } catch (e) {
    status = { ...status, lastError: e?.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  } finally {
    busy = false;
  }
}

export function startCameras() {
  if (timer) return;
  startedAtS = Date.now() / 1000;
  timer = setInterval(() => { tickCameras().catch(() => {}); }, POLL_MS);
  timer.unref?.();
}

export function stopCameras() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Montado bajo /api después de displayAuth (DISPLAY_API_PATHS cubre /api/display). */
export function camerasDisplayRouter() {
  const r = Router();
  r.get('/display/cameras', (req, res) => {
    res.set('cache-control', 'private, no-store');
    res.json({ activity: getConfig().frigate?.enabled ? activity : {} });
  });
  return r;
}

export function camerasAdminRouter() {
  const r = Router();
  r.get('/cameras/status', requireAuth, (req, res) => res.set('cache-control', 'no-store').json(camerasStatus()));
  r.post('/cameras/test-alert', requireAuth, (req, res) => {
    const cfg = getConfig();
    const f = cfg.frigate;
    const cam = f?.enabled ? f.cameras.find((c) => c.id === req.body?.camera) : null;
    if (!cam) return res.status(400).json({ error: 'unknown camera' });
    const screenIds = alertScreenIds(cfg);
    const delivered = screenIds.length
      ? publish('cameraAlert', { camera: cam.id, name: cam.name, label: 'person', startTime: Date.now() / 1000, eventId: null, test: true }, { screenIds })
      : 0;
    const screens = screenIds.map((id) => cfg.screens.find((s) => s.id === id)?.slug || id);
    logActivity('display.cameraTest', { req, data: { camera: cam.id, screens, delivered } });
    res.json({ ok: true, delivered, screens });
  });
  return r;
}
