// Doorbell camera: a ring puts the camera picture full screen on the chosen displays for a while (POST
// /api/hooks/doorbell, the admin's test button). Rings live in memory only: after a restart nothing rings. Frames are
// proxied from Home Assistant (/api/camera_proxy/<entity>) with the stored token, only to a display whose screen is
// ringing right now, never written to disk, and shared between displays for FRAME_CACHE_MS so a house full of
// screens asks Home Assistant for at most about two frames a second. See docs/API.md and docs/ARCHITECTURE.md.
import { getConfig } from './store.js';
import { publish } from './pollHub.js';
import { haSettings } from './homeassistant.js';
import { activeRing, dismiss, frameType, pruneRings, ring, ringPayload, targetScreens } from './core/doorbellCore.js';

/** A frame is reused for this long by every display that asks. */
export const FRAME_CACHE_MS = 500;
/** Biggest frame accepted from the camera. */
export const FRAME_MAX_BYTES = 4 * 1024 * 1024;
/** Home Assistant must answer within this. */
export const FRAME_TIMEOUT_MS = 6000;

/** { [screenId]: Ring } */
let rings = {};
/** camera entity → { at, type, body } | { at, error } of the last fetch, and the fetch running now */
const frames = new Map();
const pending = new Map();

const payloadFor = (r) => ringPayload(r);

/** The ring a display of `screenId` should show now (stream replay, poll reset, hello), or null. */
export function ringFor(screenId, now = Date.now()) {
  return activeRing(rings, screenId, now);
}

/** Payload of the ring on `screenId` for replay, or null. */
export function ringPayloadFor(screenId, now = Date.now()) {
  const r = ringFor(screenId, now);
  return r ? payloadFor(r) : null;
}

/**
 * Run a sanitised doorbell request (core/doorbellCore.js sanitizeDoorbell). Returns { action, screenIds, delivered,
 * rings } where `screenIds` are the screens it reached.
 */
export function runDoorbell(value, now = Date.now()) {
  const cfg = getConfig();
  const screenIds = targetScreens(cfg, value.screenIds);
  let delivered = 0;
  if (value.action === 'dismiss') {
    // dismiss with no screens ends every ring, whatever the settings say
    const ended = dismiss(rings, value.screensGiven ? screenIds : [], now);
    for (const r of ended) delivered += publish('doorbell-end', { id: r.id }, { screenIds: [r.screenId] });
    dropUnusedFrames();
    return { action: 'dismiss', screenIds: ended.map((r) => r.screenId), delivered, rings: ended };
  }
  const changed = ring(rings, { screenIds, seconds: value.seconds, camera: value.camera, sound: value.sound }, now);
  for (const r of changed) delivered += publish('doorbell', payloadFor(r), { screenIds: [r.screenId] });
  return { action: 'ring', screenIds, delivered, rings: changed };
}

/** Config saved: rings of deleted screens end. */
export function pruneDoorbellScreens(cfg) {
  const ids = new Set(cfg.screens.map((s) => s.id));
  for (const sid of Object.keys(rings)) if (!ids.has(sid)) delete rings[sid];
}

function dropUnusedFrames(now = Date.now()) {
  pruneRings(rings, now);
  const inUse = new Set(Object.values(rings).map((r) => r.camera));
  for (const cam of frames.keys()) if (!inUse.has(cam)) frames.delete(cam);
}

/** Fetch one frame from Home Assistant. Throws { status, code } on failure. */
async function fetchFrame(camera) {
  const { url, token, enabled } = haSettings();
  if (!enabled || !url || !token) throw Object.assign(new Error('Home Assistant is not set up'), { status: 503, code: 'homeassistant_off' });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FRAME_TIMEOUT_MS);
  try {
    const r = await fetch(`${url}/api/camera_proxy/${encodeURIComponent(camera)}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'image/*' },
      signal: ctl.signal,
      redirect: 'error',
    });
    if (!r.ok) {
      r.body?.cancel().catch(() => {});
      throw Object.assign(new Error(`HTTP ${r.status}`), { status: 502, code: 'camera_unavailable' });
    }
    const type = frameType(r.headers.get('content-type'));
    const len = Number(r.headers.get('content-length') || 0);
    if (!type || len > FRAME_MAX_BYTES) {
      r.body?.cancel().catch(() => {});
      throw Object.assign(new Error(type ? 'frame too large' : 'not an image'), { status: 502, code: 'camera_unavailable' });
    }
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > FRAME_MAX_BYTES) {
        reader.cancel().catch(() => {});
        throw Object.assign(new Error('frame too large'), { status: 502, code: 'camera_unavailable' });
      }
      chunks.push(value);
    }
    return { type, body: Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))) };
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error(err.name === 'AbortError' ? 'timeout' : 'could not reach Home Assistant'), { status: 502, code: 'camera_unavailable' });
  } finally {
    clearTimeout(timer);
  }
}

/** The latest frame of `camera`: the cached one when it is fresh, else one fetch shared by everyone who asks. */
export async function cameraFrame(camera, now = Date.now()) {
  const c = frames.get(camera);
  if (c && now - c.at < FRAME_CACHE_MS) {
    if (c.error) throw c.error;
    return c;
  }
  if (pending.has(camera)) return pending.get(camera);
  const p = (async () => {
    try {
      const f = await fetchFrame(camera);
      const entry = { at: Date.now(), ...f };
      frames.set(camera, entry);
      return entry;
    } catch (err) {
      // failures are cached too, so a dead camera is not asked once per display
      frames.set(camera, { at: Date.now(), error: err });
      throw err;
    } finally {
      pending.delete(camera);
    }
  })();
  pending.set(camera, p);
  return p;
}

/**
 * GET /api/display/doorbell/frame for the screen `screenId`. Returns [status, { type, body }] or [status, { error,
 * code }]. Only while that screen rings, and only the camera of its ring.
 */
export async function frameFor(screenId, now = Date.now()) {
  const r = ringFor(screenId, now);
  if (!r) return [404, { error: 'no doorbell ring on this screen', code: 'no_ring' }];
  if (!r.camera) return [404, { error: 'no camera chosen', code: 'no_camera' }];
  try {
    const f = await cameraFrame(r.camera, now);
    // the ring may have been dismissed while Home Assistant answered
    if (!ringFor(screenId)) return [404, { error: 'no doorbell ring on this screen', code: 'no_ring' }];
    return [200, { type: f.type, body: f.body }];
  } catch (err) {
    return [err.status || 502, { error: err.code === 'homeassistant_off' ? 'Home Assistant is not set up' : 'camera unavailable', code: err.code || 'camera_unavailable' }];
  }
}

/** Testing helper. */
export function _resetDoorbell() {
  rings = {};
  frames.clear();
  pending.clear();
}
