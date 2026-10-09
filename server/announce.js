// instant announcements: create, expire, clear, replay. Persisted in data/announcements.json
// ({ active, history }). See docs/API.md and docs/ARCHITECTURE.md.
import fs from 'node:fs';
import { getConfig, paths, writeFileAtomic } from './store.js';
import { broadcast } from './sse.js';
import { randomId } from './lib/text.js';
import { ALERT_STYLES } from './validate.js';

export const HISTORY_MAX = 50;
export const ACTIVE_MAX = 50;
let state = null; // { active: Announcement[], history: Announcement[] }, history newest first
let loadedFrom = null;
let timer = null;

function load() {
  if (state && loadedFrom === paths.announcements) return;
  loadedFrom = paths.announcements;
  state = { active: [], history: [] };
  try {
    const j = JSON.parse(fs.readFileSync(paths.announcements, 'utf8'));
    if (Array.isArray(j.active)) state.active = j.active.filter((a) => a && typeof a.id === 'string');
    if (Array.isArray(j.history)) state.history = j.history.filter((a) => a && typeof a.id === 'string').slice(0, HISTORY_MAX);
  } catch { /* no file yet */ }
  expire();
}

function save() {
  try { writeFileAtomic(paths.announcements, JSON.stringify(state, null, 2)); } catch (err) { console.warn('[announce] save failed:', err.message); }
}

/** Move expired announcements to the history. Returns true when something changed. */
function expire(now = Date.now()) {
  const keep = [];
  let changed = false;
  for (const a of state.active) {
    if (Date.parse(a.expiresAt) <= now) { state.history.unshift(a); changed = true; } else keep.push(a);
  }
  if (changed) {
    state.active = keep;
    state.history = state.history.slice(0, HISTORY_MAX);
    save();
  }
  scheduleExpiry();
  return changed;
}

function scheduleExpiry() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!state.active.length) return;
  const next = Math.min(...state.active.map((a) => Date.parse(a.expiresAt)));
  timer = setTimeout(() => expire(), Math.max(1000, Math.min(next - Date.now() + 50, 2 ** 31 - 1)));
  timer.unref?.();
}

/** Clients of screens with alerts disabled never get `announce`. */
function alertsEnabled(screenId) {
  const s = getConfig().screens.find((x) => x.id === screenId);
  return s ? s.alerts.enabled !== false : true;
}
export const alertsFilter = (client) => alertsEnabled(client.screenId);

/**
 * Validate an AnnounceRequest. `resolveScreens(keys)` → { ids } | { error, unknown }.
 * Returns { ok: true, value } or { ok: false, error, details }.
 */
export function sanitizeAnnounce(body, resolveScreens) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid body' };
  const details = [];
  const s = (k, max) => {
    const v = body[k];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') { details.push({ path: k, message: 'expected string' }); return ''; }
    // eslint-disable-next-line no-control-regex
    const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (t.length > max) { details.push({ path: k, message: `too long (max ${max})` }); return t.slice(0, max); }
    return t;
  };
  const title = s('title', 120);
  const text = s('body', 500);
  const emoji = s('emoji', 16);
  if (!title && !text) details.push({ path: 'title', message: 'title or body required' });
  let style = 'info';
  if (body.style !== undefined) {
    if (ALERT_STYLES.includes(body.style)) style = body.style;
    else details.push({ path: 'style', message: `must be one of ${ALERT_STYLES.join(', ')}` });
  }
  let durationSec = 30;
  if (body.durationSec !== undefined && body.durationSec !== null) {
    const n = Number(body.durationSec);
    if (!Number.isFinite(n) || n < 5 || n > 86400) details.push({ path: 'durationSec', message: 'must be between 5 and 86400' });
    else durationSec = Math.round(n);
  }
  let sound = false;
  if (body.sound !== undefined) {
    if (typeof body.sound === 'boolean') sound = body.sound;
    else details.push({ path: 'sound', message: 'expected boolean' });
  }
  const scr = resolveScreens(body.screens);
  if (scr.error) details.push({ path: 'screens', message: scr.unknown?.length ? `unknown screen: ${scr.unknown.join(', ')}` : scr.error });
  if (details.length) return { ok: false, error: 'invalid', details };
  return { ok: true, value: { title, body: text, emoji, style, durationSec, sound, screenIds: scr.ids } };
}

/**
 * Create + broadcast an announcement. `value` = sanitised request. Returns { announcement, delivered }.
 * @param {object} value
 * @param {{ via: 'admin'|'hook', by: string, now?: Date }} meta
 */
export function createAnnouncement(value, { via, by, now = new Date() }) {
  load();
  expire(now.getTime());
  const a = {
    id: randomId('a_', 6),
    ...value,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + value.durationSec * 1000).toISOString(),
    via,
    by: String(by || '').slice(0, 120),
    clearedAt: null,
  };
  state.active.push(a);
  // Hard cap: the oldest active ones are retired.
  while (state.active.length > ACTIVE_MAX) {
    const old = state.active.shift();
    old.clearedAt = now.toISOString();
    state.history.unshift(old);
    broadcast('announce-clear', { id: old.id });
  }
  state.history = state.history.slice(0, HISTORY_MAX);
  save();
  scheduleExpiry();
  const delivered = broadcast('announce', a, a.screenIds.length ? { screenIds: a.screenIds } : null, alertsFilter);
  return { announcement: a, delivered };
}

/** Active (not expired) announcements that target `screenId` (for SSE replay on connect). */
export function activeFor(screenId) {
  load();
  const now = Date.now();
  return state.active.filter((a) => Date.parse(a.expiresAt) > now && (!a.screenIds.length || a.screenIds.includes(screenId)));
}

/** AnnouncementsResponse. */
export function listAnnouncements() {
  load();
  expire();
  return { active: [...state.active].reverse(), history: [...state.history] };
}

/** Clear one announcement (id) or all (id = null). Returns the cleared announcements. */
export function clearAnnouncements(id = null) {
  load();
  expire();
  const nowIso = new Date().toISOString();
  const cleared = state.active.filter((a) => id === null || a.id === id);
  if (!cleared.length) return [];
  state.active = state.active.filter((a) => !cleared.includes(a));
  for (const a of cleared) { a.clearedAt = nowIso; state.history.unshift(a); }
  state.history = state.history.slice(0, HISTORY_MAX);
  save();
  scheduleExpiry();
  broadcast('announce-clear', { id: id === null ? null : id });
  return cleared;
}

/** Drop deleted screen ids from active announcements (config saved). */
export function pruneScreens(cfg) {
  load();
  const ids = new Set(cfg.screens.map((s) => s.id));
  let changed = false;
  for (const a of state.active) {
    const keep = a.screenIds.filter((x) => ids.has(x));
    if (keep.length !== a.screenIds.length) {
      changed = true;
      // An announcement whose every target screen is gone is retired instead of becoming "all screens".
      if (!keep.length) a.expiresAt = new Date().toISOString();
      else a.screenIds = keep;
    }
  }
  if (changed) { save(); expire(); }
}

export function _resetAnnouncements() {
  if (timer) clearTimeout(timer);
  timer = null;
  state = null;
  loadedFrom = null;
}
