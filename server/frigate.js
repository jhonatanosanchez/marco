// Cámaras Frigate (fork fsrhome). Intermediario de video para las pantallas y, desde la Tarea 4, el ciclo de eventos.
// Solo las cámaras de cfg.frigate.cameras; nunca la API de go2rtc más allá de stream.mp4 (/api/streams trae la clave
// del DVR). Spec: homelab-docs/specs/2026-10-13-marco-camaras-design.md
import http from 'node:http';
import https from 'node:https';
import { Router } from 'express';
import { getConfig } from './store.js';
import { CAMERA_ID_RE, EVENT_ID_RE } from './core/camerasCore.js';

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
