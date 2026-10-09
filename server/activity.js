// activity log: in-memory ring + append-only data/activity.jsonl (capped).
// See docs/API.md and docs/ARCHITECTURE.md. Any server module may call logActivity(); it never throws.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { paths, writeFileAtomic } from './store.js';
import { fold, stableStringify } from './lib/text.js';

const MAX_ENTRIES = 5000; // kept after compaction
const COMPACT_AT = 6000; // lines in file before rewriting it
const MAX_DATA_CHARS = 2048; // serialised `data` above this is truncated (entries come from unauthenticated requests too)
let entries = null; // oldest → newest
let fileLines = 0;
let loadedFrom = null; // paths.activity the ring was loaded from (initStore may switch data dirs, e.g. tests)

function load() {
  if (entries && loadedFrom === paths.activity) return;
  loadedFrom = paths.activity;
  entries = [];
  fileLines = 0;
  try {
    const text = fs.readFileSync(paths.activity, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch { /* skip corrupt line */ }
    }
    fileLines = entries.length;
    if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  } catch { /* no file yet */ }
}

// Strictly increasing ids (time + per-ms sequence) so `before=<id>` paging never skips or repeats entries.
let lastT = 0;
let seq = 0;
function nextId() {
  const now = Date.now();
  if (now > lastT) { lastT = now; seq = 0; } else seq++;
  return `${lastT.toString(36)}${seq.toString(36).padStart(3, '0')}${crypto.randomBytes(1).toString('hex')}`;
}

/**
 * Who did it, from an Express request: session user email, "token:<name>", or "system".
 * @returns {{ actor: string, ip: string | null }}
 */
export function actorFrom(req) {
  if (!req) return { actor: 'system', ip: null };
  const u = req.session?.user;
  const actor = req.apiToken ? `token:${req.apiToken.name}` : u ? (u.email || u.method || 'admin') : 'anonymous';
  return { actor, ip: req.ip || null };
}

/** Keep `data` small: oversized payloads are replaced by a truncated preview. */
function capData(data) {
  let s;
  try { s = JSON.stringify(data); } catch { return { truncated: true }; }
  if (s === undefined || s.length <= MAX_DATA_CHARS) return data;
  return { truncated: true, preview: s.slice(0, 300) };
}

// Throttled logging for events any unauthenticated client can trigger (display connects, OAuth callbacks):
// at most one entry per `key` every `everyMs`, and at most `perMinute` entries of each type per minute, so a
// flood can neither push the real audit trail out of the capped log nor hammer the SD card.
const throttleLast = new Map(); // `${type}|${key}` → ms
const burst = new Map(); // type → { start, n }

/**
 * logActivity() unless throttled. Returns the entry, or null when dropped.
 * @param {string} type
 * @param {string} key   e.g. ip + screen
 * @param {{ everyMs?: number, perMinute?: number }} limits
 * @param {Parameters<typeof logActivity>[1]} [opts]
 */
export function logActivityThrottled(type, key, { everyMs = 10 * 60_000, perMinute = 20 } = {}, opts = {}, now = Date.now()) {
  const k = `${type}|${key}`;
  if (now - (throttleLast.get(k) || 0) < everyMs) return null;
  const b = burst.get(type);
  if (b && now - b.start < 60_000) {
    if (b.n >= perMinute) return null;
    b.n++;
  } else burst.set(type, { start: now, n: 1 });
  throttleLast.set(k, now);
  if (throttleLast.size > 2000) for (const [x, t] of throttleLast) if (now - t > 60 * 60_000) throttleLast.delete(x);
  if (throttleLast.size > 5000) throttleLast.clear();
  return logActivity(type, opts);
}

export function _resetActivityThrottle() {
  throttleLast.clear();
  burst.clear();
}

/**
 * Append an entry. `type` is one of ActivityType (web/shared/types.ts), e.g. "auth.login", "config.saved".
 * @param {string} type
 * @param {{ req?: any, actor?: string, ip?: string|null, level?: 'info'|'warn'|'error', data?: object }} [opts]
 */
export function logActivity(type, { req, actor, ip, level = 'info', data } = {}) {
  try {
    load();
    const who = actorFrom(req);
    const e = {
      id: nextId(),
      ts: new Date().toISOString(),
      type,
      level,
      actor: actor || who.actor,
      ip: ip ?? who.ip,
      ...(data ? { data: capData(data) } : {}),
    };
    entries.push(e);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    fs.appendFileSync(paths.activity, `${JSON.stringify(e)}\n`);
    if (++fileLines > COMPACT_AT) {
      writeFileAtomic(paths.activity, entries.map((x) => JSON.stringify(x)).join('\n') + '\n');
      fileLines = entries.length;
    }
    return e;
  } catch (err) {
    console.warn('[activity]', err.message);
    return null;
  }
}

/**
 * Newest first. Filters (docs/ARCHITECTURE.md): `type` = prefix ("auth." or "auth"), `level` = exact, `actor` = folded
 * substring, `q` = folded substring over type/actor/ip/JSON(data), `before` = entry id (exclusive, for paging).
 */
export function listActivity({ type = '', level = '', actor = '', q = '', before = '', limit = 50 } = {}) {
  load();
  limit = Math.max(1, Math.min(200, Number.isFinite(+limit) ? Math.round(+limit) : 50));
  const fq = fold(q).trim();
  const fa = fold(actor).trim();
  const types = String(type || '').split(',').map((t) => t.trim()).filter(Boolean);
  const out = [];
  for (let i = entries.length - 1; i >= 0 && out.length <= limit; i--) {
    const e = entries[i];
    if (before && e.id >= before) continue;
    if (types.length && !types.some((t) => e.type === t || e.type.startsWith(t.endsWith('.') ? t : `${t}.`))) continue;
    if (level && e.level !== level) continue;
    if (fa && !fold(e.actor).includes(fa)) continue;
    if (fq && !fold(`${e.type} ${e.actor} ${e.ip || ''} ${e.data ? JSON.stringify(e.data) : ''}`).includes(fq)) continue;
    out.push(e);
  }
  return { items: out.slice(0, limit), hasMore: out.length > limit };
}

/** Last `n` entries, newest first (dashboard). */
export function recentActivity(n = 8) {
  load();
  return entries.slice(-n).reverse();
}

export function clearActivity() {
  load();
  entries = [];
  fileLines = 0;
  writeFileAtomic(paths.activity, '');
}

/**
 * Changed sections between two stored configs, for `config.saved`: top-level keys plus
 * `screens:<slug>.<section>` per screen (`screens:+<slug>` added, `screens:-<slug>` removed). Pure.
 */
export function changedSections(prev, next) {
  if (!prev) return ['*'];
  const same = (a, b) => stableStringify(a) === stableStringify(b);
  const out = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (k === 'revision' || k === 'screens' || k === 'version') continue;
    if (!same(prev[k], next[k])) out.push(k);
  }
  const before = new Map((prev.screens || []).map((s) => [s.id, s]));
  const after = new Map((next.screens || []).map((s) => [s.id, s]));
  for (const [sid, s] of after) {
    const p = before.get(sid);
    if (!p) { out.push(`screens:+${s.slug}`); continue; }
    if (p.name !== s.name || p.slug !== s.slug) out.push(`screens:${s.slug}.name`);
    for (const sec of Object.keys(s)) {
      if (['id', 'slug', 'name'].includes(sec)) continue;
      if (!same(p[sec], s[sec])) out.push(`screens:${s.slug}.${sec}`);
    }
  }
  for (const [sid, p] of before) if (!after.has(sid)) out.push(`screens:-${p.slug}`);
  const order = (prev.screens || []).map((s) => s.id).filter((x) => after.has(x));
  const order2 = (next.screens || []).map((s) => s.id).filter((x) => before.has(x));
  if (!same(order, order2)) out.push('screens:order');
  return out;
}
