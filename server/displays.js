// registry of displays (SSE clients + heartbeats), persisted in data/displays.json.
// See docs/API.md and docs/ARCHITECTURE.md.
import fs from 'node:fs';
import { getConfig, paths, writeFileAtomic } from './store.js';
import { resolveScreen } from './core/screens.js';
import { listClients, send, matches } from './sse.js';
import { publish, recordIdentify, readSince, trackPoller, nextDelay, POLL_CONNECTED_MS, _resetPoll } from './pollHub.js';
import { logActivityThrottled } from './activity.js';
import { activeFor } from './announce.js';
import { deviceName, requestScreen } from './displayAccess.js';

export const MAX_DISPLAYS = 100;
const PRUNE_OFFLINE_MS = 30 * 24 * 3600_000;
const RECONNECT_LOG_MS = 10 * 60_000;
const SAVE_THROTTLE_MS = 30_000;
const CLIENT_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

let serverVersion = '0.0.0';
let registry = null; // Map clientId → entry (DisplayInfo minus derived fields)
let loadedFrom = null;
let anonSeq = 0;
let saveTimer = null;
let dirty = false;

export function setServerVersion(v) { serverVersion = String(v || '0.0.0'); }
export const getServerVersion = () => serverVersion;

function load() {
  if (registry && loadedFrom === paths.displays) return;
  loadedFrom = paths.displays;
  registry = new Map();
  try {
    const list = JSON.parse(fs.readFileSync(paths.displays, 'utf8'));
    for (const d of Array.isArray(list) ? list : list.displays || []) {
      if (d && typeof d.clientId === 'string' && CLIENT_ID_RE.test(d.clientId) && !d.clientId.startsWith('anon-')) {
        registry.set(d.clientId, { ...d, connected: false, streams: 0, connectedAt: null, polledAt: 0 });
      }
    }
  } catch { /* no file yet */ }
  prune();
}

/** Connected: an open stream, or a poll in the last 4 minutes (GET /api/display/poll). */
const isLive = (d, now = Date.now()) => (d.streams || 0) > 0 || (d.polledAt > 0 && now - d.polledAt < POLL_CONNECTED_MS);

function prune(now = Date.now()) {
  for (const [id, d] of registry) {
    if (!isLive(d, now) && now - Date.parse(d.lastSeen || 0) > PRUNE_OFFLINE_MS) registry.delete(id);
  }
  if (registry.size > MAX_DISPLAYS) {
    // Drop the oldest offline entries first.
    const offline = [...registry.values()].filter((d) => !isLive(d, now)).sort((a, b) => (a.lastSeen < b.lastSeen ? -1 : 1));
    while (registry.size > MAX_DISPLAYS && offline.length) registry.delete(offline.shift().clientId);
  }
}

/** Persist (throttled). Anonymous entries (old builds) are not persisted. */
function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; flushDisplays(); }, SAVE_THROTTLE_MS);
  saveTimer.unref?.();
}

export function flushDisplays() {
  if (!registry || !dirty) return;
  dirty = false;
  const list = [...registry.values()].filter((d) => !d.clientId.startsWith('anon-'))
    .map(({ streams, connected, connectedAt, polledAt, ...d }) => d);
  try { writeFileAtomic(paths.displays, JSON.stringify(list, null, 2)); } catch (err) { console.warn('[displays] save failed:', err.message); }
}

/** "Chromium 128 · Linux aarch64" from a user agent string. */
export function shortUserAgent(ua) {
  ua = String(ua || '');
  if (!ua) return '';
  const browsers = [
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Chromium', /Chromium\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/], ['curl', /curl\/(\d+)/],
  ];
  let browser = '';
  for (const [name, re] of browsers) {
    const m = re.exec(ua);
    if (m) { browser = `${name} ${m[1]}`; break; }
  }
  // Chromium on Raspberry Pi OS reports "Chrome/x" with "Raspbian"/"Linux armv7l"/"aarch64" in the platform.
  if (browser.startsWith('Chrome ') && /Linux (?:aarch64|armv\d+l)/.test(ua) && !/Android/.test(ua)) browser = browser.replace('Chrome', 'Chromium');
  let platform = '';
  const lin = /Linux (aarch64|armv\d+l|x86_64|i686)/.exec(ua);
  if (/Android (\d+)/.test(ua)) platform = `Android ${/Android (\d+)/.exec(ua)[1]}`;
  else if (/iPhone|iPad/.test(ua)) platform = /iPad/.test(ua) ? 'iPadOS' : 'iOS';
  else if (/CrOS/.test(ua)) platform = 'ChromeOS';
  else if (/Windows/.test(ua)) platform = 'Windows';
  else if (/Mac OS X/.test(ua)) platform = 'macOS';
  else if (lin) platform = `Linux ${lin[1]}`;
  else if (/Linux/.test(ua)) platform = 'Linux';
  return [browser || ua.split(/[\s/]/)[0].slice(0, 30), platform].filter(Boolean).join(' · ');
}

function screenMeta(cfg, screenId) {
  const s = cfg.screens.find((x) => x.id === screenId);
  return s ? { screenId: s.id, screenSlug: s.slug, screenName: s.name } : { screenId: screenId || '', screenSlug: '', screenName: '' };
}

function blankEntry(clientId, now) {
  return {
    clientId, screenKey: '', screenId: '', ip: '', userAgent: '', firstSeen: now, lastSeen: now,
    viewport: null, screenRes: null, dpr: null, webgl: null, lite: null, version: null, build: null,
    night: null, nightOverride: null, uptimeSec: null, lastError: null, lastConnectAt: null,
    streams: 0, connectedAt: null, polledAt: 0, access: 'open', deviceId: null,
  };
}

/** How a request was let in (displayAccess.js), as remembered for a stream / registry entry. */
function accessOf(req) {
  const a = req?.displayAccess;
  if (!a) return { via: 'open', screenId: null, deviceId: null };
  return { via: a.via, screenId: a.screenId || null, deviceId: a.device?.id || null };
}

/** What a stream keeps to re-check its credential later (displayAccess.js revalidateStreams). */
function streamAccess(req) {
  const a = accessOf(req);
  const d = req?.displayAccess;
  if (d?.credHash) a.credHash = d.credHash;
  // Admin-session streams: the request (its cookie session) is re-checked on logout / epoch rotation / heartbeat.
  if (d?.via === 'session') {
    Object.defineProperty(a, 'authReq', { value: req, enumerable: false });
    a.sid = typeof req.session?.sid === 'string' ? req.session.sid : null;
  }
  return a;
}

/** Screen id bound to the request's key / device token (null: none, or that screen no longer exists). */
function boundScreen(cfg, req) {
  const id = req?.displayAccess?.screenId;
  return id && cfg.screens.some((s) => s.id === id) ? id : null;
}

/** Values for sseHandler's `init`: parse ?screen / ?client of the stream request (a key / device decides the screen). */
export function streamInit(req) {
  const bound = boundScreen(getConfig(), req);
  const screenKey = bound || (typeof req.query?.screen === 'string' ? req.query.screen.trim().slice(0, 64) : '');
  const raw = typeof req.query?.client === 'string' ? req.query.client.trim() : '';
  const anonymous = !CLIENT_ID_RE.test(raw) || raw.startsWith('anon-');
  const clientId = anonymous ? `anon-${++anonSeq}` : raw;
  const { screen } = resolveScreen(getConfig(), screenKey);
  // Admin preview iframes get live updates but are not listed as connected displays.
  const preview = req.query?.preview === '1';
  return {
    screenKey, screenId: screen.id, clientId: preview ? `anon-preview-${++anonSeq}` : clientId, anonymous: anonymous || preview, preview,
    access: streamAccess(req),
  };
}

/** StreamHello payload for a new SSE client. */
export function streamHello(client) {
  const cfg = getConfig();
  const s = cfg.screens.find((x) => x.id === client.screenId);
  return {
    revision: cfg.revision,
    screenId: client.screenId,
    slug: s?.slug || '',
    clientId: client.anonymous ? null : client.clientId,
    serverVersion,
    now: new Date().toISOString(),
    // Lets a reconnecting display drop announcements cleared while it was offline (clear events aren't replayed).
    activeAnnouncementIds: s?.alerts.enabled === false ? [] : activeFor(client.screenId).map((a) => a.id),
  };
}

export function onStreamOpen(client) {
  load();
  if (client.preview) {
    const s = getConfig().screens.find((x) => x.id === client.screenId);
    if (s?.alerts.enabled !== false) for (const a of activeFor(client.screenId)) send(client, 'announce', a);
    return;
  }
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  let d = registry.get(client.clientId);
  const isNew = !d;
  if (!d) {
    // A kiosk restart may come back with a new id: drop offline entries from the same ip + screen.
    for (const [id, x] of registry) {
      if (!isLive(x, nowMs) && x.ip === client.ip && x.screenId === client.screenId) registry.delete(id);
    }
    d = blankEntry(client.clientId, nowIso);
    registry.set(client.clientId, d);
  }
  const wasLive = isLive(d, nowMs);
  const wasOfflineFor = wasLive ? 0 : nowMs - Date.parse(d.lastSeen || nowIso);
  d.streams = (d.streams || 0) + 1;
  d.connectedAt = wasLive ? d.connectedAt : new Date(client.since).toISOString();
  d.ip = client.ip;
  d.userAgent = client.userAgent;
  d.screenKey = client.screenKey;
  d.screenId = client.screenId;
  d.access = client.access?.via || 'open';
  d.deviceId = client.access?.deviceId || null;
  d.lastSeen = nowIso;
  d.lastConnectAt = nowIso;
  prune(nowMs);
  scheduleSave();
  if (isNew || (!wasLive && wasOfflineFor > RECONNECT_LOG_MS)) {
    const m = screenMeta(getConfig(), client.screenId);
    // /api/stream is public: brand-new / anonymous ids are throttled per ip + screen (and globally), so
    // opening thousands of streams can't flush the audit log.
    const key = isNew || client.anonymous ? `new|${client.ip}|${client.screenId}` : `id|${client.clientId}`;
    logActivityThrottled('display.connected', key, { everyMs: RECONNECT_LOG_MS, perMinute: 20 }, {
      actor: 'system', ip: client.ip,
      data: { clientId: client.anonymous ? null : client.clientId, screen: m.screenSlug, ua: shortUserAgent(client.userAgent) },
    });
  }
  // Replay announcements that are still running for this screen (display dedupes by id).
  const cfg = getConfig();
  const screen = cfg.screens.find((x) => x.id === client.screenId);
  if (screen?.alerts.enabled !== false) for (const a of activeFor(client.screenId)) send(client, 'announce', a);
}

// ---------- poll channel (GET /api/display/poll) ----------
const POLL_SAVE_MS = 5 * 60_000;

/** A display polled: register it like an opened stream, without the 25 s stream bookkeeping. */
function notePoll(client, req, nowMs = Date.now()) {
  trackPoller(client, nowMs);
  const nowIso = new Date(nowMs).toISOString();
  const ip = req?.ip || '';
  let d = registry.get(client.clientId);
  const isNew = !d;
  if (!d) {
    for (const [id, x] of registry) {
      if (!isLive(x, nowMs) && x.ip === ip && x.screenId === client.screenId) registry.delete(id);
    }
    if (registry.size >= MAX_DISPLAYS) prune(nowMs);
    if (registry.size >= MAX_DISPLAYS) return;
    d = blankEntry(client.clientId, nowIso);
    registry.set(client.clientId, d);
  }
  const wasLive = isLive(d, nowMs);
  const wasOfflineFor = wasLive ? 0 : nowMs - Date.parse(d.lastSeen || nowIso);
  const access = client.access?.via || 'open';
  const changed = isNew || !wasLive || d.screenId !== client.screenId || d.screenKey !== client.screenKey || d.ip !== ip
    || d.access !== access || nowMs - Date.parse(d.lastSeen || 0) > POLL_SAVE_MS;
  if (!wasLive) {
    d.connectedAt = nowIso;
    d.lastConnectAt = nowIso;
  }
  d.polledAt = nowMs;
  d.ip = ip;
  d.userAgent = String(req?.get?.('user-agent') || d.userAgent || '').slice(0, 300);
  d.screenKey = client.screenKey;
  d.screenId = client.screenId;
  d.access = access;
  d.deviceId = client.access?.deviceId || null;
  d.lastSeen = nowIso;
  if (!changed) return;
  prune(nowMs);
  scheduleSave();
  if (isNew || wasOfflineFor > RECONNECT_LOG_MS) {
    const m = screenMeta(getConfig(), client.screenId);
    const key = isNew ? `new|${ip}|${client.screenId}` : `id|${client.clientId}`;
    logActivityThrottled('display.connected', key, { everyMs: RECONNECT_LOG_MS, perMinute: 20 }, {
      actor: 'system', ip,
      data: { clientId: client.clientId, screen: m.screenSlug, ua: shortUserAgent(d.userAgent) },
    });
  }
}

/**
 * GET /api/display/poll?client=&cursor=&rev=&hidden=&preview= → PollResponse. The commands are the SSE events
 * since `cursor`, already filtered to this display; a reset replays the announcements still active on its screen.
 * Preview polls get the commands but are not registered as displays.
 */
export function pollDisplay(req, nowMs = Date.now()) {
  load();
  const cfg = getConfig();
  const q = req.query || {};
  const { screen } = requestScreen(cfg, req);
  const raw = typeof q.client === 'string' ? q.client.trim() : '';
  const preview = q.preview === '1';
  const anonymous = preview || !CLIENT_ID_RE.test(raw) || raw.startsWith('anon-');
  const bound = boundScreen(cfg, req);
  const client = {
    clientId: anonymous ? '' : raw,
    screenId: screen.id,
    screenKey: bound || (typeof q.screen === 'string' ? q.screen.trim().slice(0, 64) : ''),
    anonymous,
    preview,
    access: accessOf(req),
    deviceId: accessOf(req).deviceId,
  };
  if (!anonymous) notePoll(client, req, nowMs);
  const alertsOn = screen.alerts.enabled !== false;
  const out = readSince(typeof q.cursor === 'string' ? q.cursor : '', client, (id) => cfg.screens.find((x) => x.id === id) || null, nowMs);
  const active = () => (alertsOn ? activeFor(screen.id) : []);
  const commands = out.reset ? active().map((a) => ({ ...a, type: 'announce' })) : out.commands;
  const res = {
    revision: cfg.revision,
    screenId: screen.id,
    now: new Date(nowMs).toISOString(),
    serverVersion,
    cursor: out.cursor,
    reset: out.reset,
    commands,
    next: nextDelay(q.hidden === '1', nowMs),
  };
  if (out.reset || commands.some((c) => c.type === 'announce' || c.type === 'announce-clear')) {
    res.activeAnnouncementIds = active().map((a) => a.id);
  }
  return res;
}

export function onStreamClose(client) {
  load();
  if (client.preview) return;
  const d = registry.get(client.clientId);
  if (!d) return;
  d.streams = Math.max(0, (d.streams || 1) - 1);
  d.lastSeen = new Date().toISOString();
  if (!isLive(d)) d.connectedAt = null;
  scheduleSave();
}

// ---------- heartbeat (§4.3) ----------
const clampStr = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);
const finite = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);
const wh = (v) => {
  if (!v || typeof v !== 'object') return null;
  const w = finite(v.w, 0, 100000);
  const h = finite(v.h, 0, 100000);
  return w === null || h === null ? null : { w: Math.round(w), h: Math.round(h) };
};
const boolOrNull = (v) => (typeof v === 'boolean' ? v : null);

/**
 * Validate/clamp a DisplayHeartbeat body (unknown keys ignored). Returns { ok, value } or { ok: false, error }.
 */
export function sanitizeHeartbeat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'expected object' };
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (!CLIENT_ID_RE.test(clientId) || clientId.startsWith('anon-')) return { ok: false, error: 'invalid clientId' };
  const override = ['on', 'off', 'auto'].includes(body.nightOverride) ? body.nightOverride : null;
  return {
    ok: true,
    value: {
      clientId,
      screen: (clampStr(body.screen, 64) || '').trim(),
      screenId: clampStr(body.screenId, 64),
      version: clampStr(body.version, 40),
      build: clampStr(body.build, 40),
      viewport: wh(body.viewport),
      screenRes: wh(body.screenRes),
      dpr: finite(body.dpr, 0.1, 16),
      webgl: boolOrNull(body.webgl),
      lite: boolOrNull(body.lite),
      night: boolOrNull(body.night),
      nightOverride: override,
      uptimeSec: (() => { const n = finite(body.uptimeSec, 0, 1e9); return n === null ? null : Math.round(n); })(),
      lastError: body.lastError === null ? null : clampStr(body.lastError, 200),
      photoFrame: sanitizePhotoFrame(body.photoFrame),
    },
  };
}

/** Photo panel geometry measured by the display ({ aspect, targetY, freeTop, freeBottom, blocks }), or null. */
function sanitizePhotoFrame(f) {
  if (!f || typeof f !== 'object') return null;
  const aspect = finite(f.aspect, 0.05, 20);
  const unit = (v) => finite(v, 0, 1);
  const targetY = unit(f.targetY), freeTop = unit(f.freeTop), freeBottom = unit(f.freeBottom);
  if (aspect === null || targetY === null || freeTop === null || freeBottom === null) return null;
  const blocks = (Array.isArray(f.blocks) ? f.blocks : []).slice(0, 8)
    .filter((b) => Array.isArray(b) && unit(b[0]) !== null && unit(b[1]) !== null)
    .map((b) => [unit(b[0]), unit(b[1])]);
  return { aspect, targetY, freeTop, freeBottom, blocks };
}

/** Record a heartbeat. Returns HeartbeatResponse or { error }. */
export function recordHeartbeat(body, req) {
  load();
  const r = sanitizeHeartbeat(body);
  if (!r.ok) return { error: r.error };
  const hb = r.value;
  const cfg = getConfig();
  const nowIso = new Date().toISOString();
  let d = registry.get(hb.clientId);
  if (!d) {
    if (registry.size >= MAX_DISPLAYS) prune();
    if (registry.size >= MAX_DISPLAYS) return { error: 'too many displays' };
    d = blankEntry(hb.clientId, nowIso);
    registry.set(hb.clientId, d);
  }
  // Prefer the screen of the open stream; else resolve what the display says it asked for.
  const stream = listClients().find((c) => c.clientId === hb.clientId);
  const bound = boundScreen(cfg, req);
  const screenId = stream?.screenId || bound || resolveScreen(cfg, hb.screen).screen.id;
  const access = accessOf(req);
  Object.assign(d, {
    screenKey: stream ? stream.screenKey : bound || hb.screen,
    screenId,
    ...(req?.displayAccess ? { access: access.via, deviceId: access.deviceId } : {}),
    ip: req?.ip || d.ip,
    userAgent: String(req?.get?.('user-agent') || d.userAgent || '').slice(0, 300),
    lastSeen: nowIso,
    viewport: hb.viewport, screenRes: hb.screenRes, dpr: hb.dpr, webgl: hb.webgl, lite: hb.lite,
    version: hb.version, build: hb.build, night: hb.night, nightOverride: hb.nightOverride,
    uptimeSec: hb.uptimeSec, lastError: hb.lastError, photoFrame: hb.photoFrame,
  });
  scheduleSave();
  return { ok: true, now: nowIso, revision: cfg.revision };
}

/** DisplayInfo for one entry. */
function toInfo(d, cfg) {
  const m = screenMeta(cfg, d.screenId);
  const connected = isLive(d);
  return {
    clientId: d.clientId,
    ...m,
    connected,
    ip: d.ip || '',
    userAgent: d.userAgent || '',
    uaShort: shortUserAgent(d.userAgent),
    connectedAt: connected ? d.connectedAt : null,
    firstSeen: d.firstSeen,
    lastSeen: d.lastSeen,
    viewport: d.viewport ?? null,
    screenRes: d.screenRes ?? null,
    dpr: d.dpr ?? null,
    webgl: d.webgl ?? null,
    lite: d.lite ?? null,
    version: d.version ?? null,
    build: d.build ?? null,
    // Old builds never send a heartbeat (anonymous) → outdated too.
    outdated: d.version ? d.version !== serverVersion : d.clientId.startsWith('anon-'),
    night: d.night ?? null,
    nightOverride: d.nightOverride ?? null,
    uptimeSec: d.uptimeSec ?? null,
    lastError: d.lastError ?? null,
    photoFrame: d.photoFrame ?? null,
    // How the display got in: private link ('key'), paired device ('device'), admin session or open (no key).
    access: d.access || 'open',
    deviceId: d.deviceId || null,
    deviceName: d.deviceId ? deviceName(d.deviceId) : null,
  };
}

/** DisplayInfo[]: connected first, then by lastSeen desc. */
export function listDisplays() {
  load();
  const cfg = getConfig();
  return [...registry.values()].map((d) => toInfo(d, cfg))
    .sort((a, b) => (a.connected !== b.connected ? (a.connected ? -1 : 1) : a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0));
}

/** Forget an offline display. Returns 'ok' | 'not_found' | 'connected'. */
export function forgetDisplay(clientId) {
  load();
  const d = registry.get(clientId);
  if (!d) return 'not_found';
  if (isLive(d)) return 'connected';
  registry.delete(clientId);
  scheduleSave();
  return 'ok';
}

/** Screen ids for a list of ids/slugs. Returns { ids } or { error: 'unknown screen', unknown }. */
export function resolveScreenList(cfg, keys) {
  if (keys === undefined || keys === null) return { ids: [] };
  if (!Array.isArray(keys)) return { error: 'screens must be an array' };
  const ids = [];
  const unknown = [];
  for (const k of keys.slice(0, 50)) {
    const key = typeof k === 'string' ? k.trim().toLowerCase() : '';
    const s = key && cfg.screens.find((x) => x.slug === key || x.id.toLowerCase() === key);
    if (s) { if (!ids.includes(s.id)) ids.push(s.id); } else unknown.push(String(k).slice(0, 64));
  }
  return unknown.length ? { error: 'unknown screen', unknown } : { ids };
}

/**
 * Run a display command (§4.2). `cmd` = DisplayCommandRequest. Returns { ok, delivered } or { error, status }.
 */
export function runCommand(cmd) {
  const cfg = getConfig();
  if (!cmd || typeof cmd !== 'object') return { error: 'invalid body', status: 400 };
  const { action } = cmd;
  if (!['reload', 'identify', 'night'].includes(action)) return { error: 'action must be reload, identify or night', status: 400 };
  if (action === 'night' && !['on', 'off', 'auto'].includes(cmd.mode)) return { error: 'mode must be on, off or auto', status: 400 };
  const scr = resolveScreenList(cfg, cmd.screens);
  if (scr.error) return { error: scr.error, unknown: scr.unknown, status: 400 };
  let clientIds = [];
  if (cmd.clientIds !== undefined) {
    if (!Array.isArray(cmd.clientIds)) return { error: 'clientIds must be an array', status: 400 };
    clientIds = cmd.clientIds.filter((x) => typeof x === 'string').slice(0, 100);
    if (cmd.clientIds.length && !clientIds.length) return { error: 'invalid clientIds', status: 400 };
  }
  const target = { screenIds: scr.ids, clientIds };
  let delivered = 0;
  if (action === 'reload') delivered = publish('reload', {}, target);
  else if (action === 'night') delivered = publish('night', { mode: cmd.mode }, target);
  else {
    // identify: each client gets its own screen name + clientId (pollers get theirs when they read it).
    delivered = recordIdentify(target);
    for (const c of listClients()) {
      if (!matches(c, target)) continue;
      const s = cfg.screens.find((x) => x.id === c.screenId);
      if (send(c, 'identify', { name: s?.name || '', slug: s?.slug || '', clientId: c.anonymous ? null : c.clientId, durationSec: 10 })) delivered++;
    }
  }
  return { ok: true, delivered, target };
}

/** Config saved: re-resolve every known display's screen from the key it asked for (renamed slug / deleted screen). */
export function reresolveDisplays(cfg) {
  load();
  let changed = false;
  for (const d of registry.values()) {
    const id = resolveScreen(cfg, d.screenKey || '').screen.id;
    if (id !== d.screenId) { d.screenId = id; changed = true; }
  }
  if (changed) scheduleSave();
}

/** Testing helper: forget the in-memory registry (next call reloads from disk) and the poll channel state. */
export function _resetDisplays() {
  _resetPoll();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  dirty = false;
  registry = null;
  loadedFrom = null;
}
