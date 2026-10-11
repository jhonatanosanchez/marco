// Pure doorbell logic, shared with Marco Cloud: hook validation, the ring state per screen (ring, extend,
// dismiss, expiry) and the payload the displays get. server/doorbell.js keeps the state in memory, broadcasts it and
// proxies the camera frames from Home Assistant. See docs/API.md (POST /api/hooks/doorbell).
import { randomId } from './lib/text.js';

export const DOORBELL_MIN_SEC = 10;
export const DOORBELL_MAX_SEC = 300;
export const DOORBELL_DEFAULT_SEC = 60;
/** A Home Assistant camera entity id. */
export const CAMERA_RE = /^camera\.[a-z0-9_]{1,200}$/;
/** How often a display asks for a new frame while a ring is on screen. */
export const FRAME_REFRESH_MS = 750;

/** Seconds clamped to 10..300 (non-numbers give `fallback`). */
export function clampSeconds(v, fallback = DOORBELL_DEFAULT_SEC) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) return fallback;
  return Math.min(DOORBELL_MAX_SEC, Math.max(DOORBELL_MIN_SEC, Math.round(n)));
}

/**
 * Validate a doorbell request (webhook or the admin's test button) against the stored settings
 * (`homeassistant.doorbell`). `resolveScreens(keys)` → { ids } | { error, unknown } (as for announcements).
 * Returns { ok: true, value: { action, seconds, screenIds, screensGiven, camera, sound } } or { ok: false, error,
 * details }. Omitted fields take the stored settings; `seconds` is clamped to 10..300. `screensGiven` is false when the
 * request named no screens (a dismiss then ends every ring).
 */
export function sanitizeDoorbell(body, settings, resolveScreens) {
  if (body === undefined || body === null) body = {};
  if (typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid body' };
  const s = settings || {};
  const details = [];
  const action = body.action === undefined ? 'ring' : body.action;
  if (action !== 'ring' && action !== 'dismiss') details.push({ path: 'action', message: 'must be ring or dismiss' });
  let seconds = clampSeconds(s.seconds);
  if (body.seconds !== undefined && body.seconds !== null) {
    if (!Number.isFinite(Number(body.seconds)) || typeof body.seconds === 'boolean') details.push({ path: 'seconds', message: 'expected number' });
    else seconds = clampSeconds(body.seconds);
  }
  let camera = typeof s.camera === 'string' ? s.camera : '';
  if (body.camera !== undefined && body.camera !== null && body.camera !== '') {
    if (typeof body.camera !== 'string' || !CAMERA_RE.test(body.camera.trim())) details.push({ path: 'camera', message: 'must be a camera entity id (camera.…)' });
    else camera = body.camera.trim();
  }
  let sound = s.sound !== false;
  if (body.sound !== undefined) {
    if (typeof body.sound === 'boolean') sound = body.sound;
    else details.push({ path: 'sound', message: 'expected boolean' });
  }
  let screenIds = Array.isArray(s.screenIds) ? s.screenIds : [];
  const screensGiven = body.screens !== undefined && body.screens !== null;
  if (screensGiven) {
    const scr = resolveScreens(body.screens);
    if (scr.error) details.push({ path: 'screens', message: scr.unknown?.length ? `unknown screen: ${scr.unknown.join(', ')}` : scr.error });
    else screenIds = scr.ids;
  }
  if (details.length) return { ok: false, error: 'invalid', details };
  return { ok: true, value: { action, seconds, screenIds: [...screenIds], screensGiven, camera, sound } };
}

/** The screens a ring reaches: `screenIds` that still exist, or every screen when the list is empty. */
export function targetScreens(cfg, screenIds) {
  const all = (cfg?.screens || []).map((x) => x.id);
  if (!screenIds?.length) return all;
  return screenIds.filter((id) => all.includes(id));
}

/** The ring on `screenId` while it lasts, else null. `rings` = { [screenId]: Ring }. */
export function activeRing(rings, screenId, now = Date.now()) {
  const r = rings?.[screenId];
  return r && Date.parse(r.expiresAt) > now ? r : null;
}

/** Drop rings that are over. Returns the screen ids removed. */
export function pruneRings(rings, now = Date.now()) {
  const gone = [];
  for (const id of Object.keys(rings)) if (!activeRing(rings, id, now)) { delete rings[id]; gone.push(id); }
  return gone;
}

/**
 * Ring on `screenIds`. A screen that already rings keeps its ring id and start time and gets the later end time
 * (a second press extends it, never shortens it); the camera and sound follow the latest request. Mutates `rings`,
 * returns the rings that changed, one per screen.
 */
export function ring(rings, { screenIds, seconds, camera, sound }, now = Date.now(), newId = () => randomId('d_', 8)) {
  pruneRings(rings, now);
  const until = now + clampSeconds(seconds) * 1000;
  const out = [];
  for (const sid of screenIds) {
    const cur = rings[sid];
    if (cur) {
      cur.expiresAt = new Date(Math.max(Date.parse(cur.expiresAt), until)).toISOString();
      cur.camera = camera || '';
      cur.sound = Boolean(sound);
      cur.updatedAt = new Date(now).toISOString();
      cur.rings = (cur.rings || 1) + 1;
      out.push(cur);
    } else {
      const r = {
        id: newId(), screenId: sid, camera: camera || '', sound: Boolean(sound),
        startedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), expiresAt: new Date(until).toISOString(), rings: 1,
      };
      rings[sid] = r;
      out.push(r);
    }
  }
  return out;
}

/** End the rings on `screenIds` (all screens when empty). Mutates `rings`, returns the rings that were active. */
export function dismiss(rings, screenIds, now = Date.now()) {
  pruneRings(rings, now);
  const ids = screenIds?.length ? screenIds : Object.keys(rings);
  const out = [];
  for (const sid of ids) {
    if (!rings[sid]) continue;
    out.push(rings[sid]);
    delete rings[sid];
  }
  return out;
}

/**
 * What a display gets in the `doorbell` event. No camera entity id and no Home Assistant address: the display asks
 * Marco for frames (GET /api/display/doorbell/frame) and Marco knows which camera to use. `frames: false` means there
 * is no picture to show (no camera chosen); `refreshMs` is how often to ask for a new frame (a server that only has
 * an uploaded snapshot can send a longer one).
 */
export function ringPayload(r, { frames = Boolean(r.camera), refreshMs = FRAME_REFRESH_MS } = {}) {
  return { id: r.id, startedAt: r.startedAt, updatedAt: r.updatedAt, expiresAt: r.expiresAt, sound: r.sound, frames, refreshMs };
}

/** Image types accepted from a camera (anything else is refused, never passed through). */
export const FRAME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** The bare image type of a Content-Type header, or '' when it is not one of FRAME_TYPES. */
export function frameType(contentType) {
  const t = String(contentType || '').split(';')[0].trim().toLowerCase();
  return FRAME_TYPES.includes(t === 'image/jpg' ? 'image/jpeg' : t) ? (t === 'image/jpg' ? 'image/jpeg' : t) : '';
}
