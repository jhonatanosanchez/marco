// Device pairing: a display without a key shows a short code; an admin types it in the panel and picks a screen;
// the display receives a per-device token. See SECURITY.md ("Pairing") and docs/API.md.
//
//   display:  POST /api/pair/start   → { sessionId, code, expiresAt, pollMs }      (unauthenticated, rate-limited)
//             POST /api/pair/status  { sessionId } → waiting | paired (+ token, once) | expired
//   admin:    POST /api/admin/pair/claim { code, screenId, name? }                → { confirm: { where, … } }
//             POST /api/admin/pair/claim { code, screenId, name?, confirm: true } → { device }
//
// The code is only a rendezvous label shown on the screen: it never returns the token. The token is handed out
// only to whoever polls with the session id (256 random bits) that /start returned to that display, so somebody
// who reads the code over the owner's shoulder cannot collect the token. Codes: 6 characters from a 31-symbol
// alphabet without look-alikes (0/O, 1/I/L): 31^6 ≈ 8.9 × 10^8 combinations, valid 10 minutes, single use, and
// only while the display keeps polling (claims for a display that stopped waiting fail). Claims need an admin
// session and are rate-limited per session + client address and globally (brute-force math in SECURITY.md).
import crypto from 'node:crypto';
import { ipBucket } from './lib/net.js';
import { createDevice } from './displayAccess.js';
import { getConfig } from './store.js';
import { logActivityThrottled } from './activity.js';
import { CODE_LENGTH, randomCode, normalizeCode } from './core/pairCore.js';

export { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from './core/pairCore.js';

export const PAIR_TTL_MS = 10 * 60_000;
export const POLL_MS = 2000;
/** A claim only succeeds while the display polled within this window (it is really there, waiting). */
export const WAITING_GRACE_MS = 15_000;
export const MAX_PENDING = 100;
export const START_LIMIT = 10; // pairing sessions started per client address per window
export const CLAIM_FAIL_LIMIT = 10; // wrong codes per admin session + client address per window
export const CLAIM_FAIL_GLOBAL = 50; // wrong codes across all admins per window
export const LIMIT_WINDOW_MS = 10 * 60_000;
/** A paired token waits this long for the display to collect it. */
const PAIRED_PICKUP_MS = 2 * 60_000;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const shaHex = (s) => sha(s).toString('hex');

const sessions = new Map(); // sha256(sessionId) hex → PairingSession
const startHits = new Map(); // ip bucket → number[] (ms)
const claimFails = new Map(); // `${session}|${ip bucket}` → number[] (ms)
let globalFails = []; // ms

function prune(now = Date.now()) {
  for (const [k, s] of sessions) {
    if (s.expiresAt <= now || (s.state === 'paired' && now - s.pairedAt > PAIRED_PICKUP_MS)) sessions.delete(k);
  }
  const fresh = (list) => list.filter((t) => now - t < LIMIT_WINDOW_MS);
  for (const [k, v] of startHits) { const f = fresh(v); if (f.length) startHits.set(k, f); else startHits.delete(k); }
  for (const [k, v] of claimFails) { const f = fresh(v); if (f.length) claimFails.set(k, f); else claimFails.delete(k); }
  globalFails = fresh(globalFails);
}

/** Start a pairing session for a waiting display. Returns PairStartResponse or { error, status }. */
export function startPairing(req, now = Date.now()) {
  prune(now);
  const bucket = ipBucket(req.ip);
  const hits = startHits.get(bucket) || [];
  if (hits.length >= START_LIMIT) return { error: 'too many pairing codes from this address, wait a few minutes', status: 429 };
  if (sessions.size >= MAX_PENDING) return { error: 'too many screens are waiting to be paired, try again later', status: 503 };
  hits.push(now);
  startHits.set(bucket, hits);
  const live = new Set([...sessions.values()].map((s) => s.code));
  let code;
  do code = randomCode(CODE_LENGTH); while (live.has(code));
  const sessionId = crypto.randomBytes(32).toString('base64url');
  sessions.set(shaHex(sessionId), {
    code, codeHash: sha(code), createdAt: now, expiresAt: now + PAIR_TTL_MS, lastPollAt: now, state: 'waiting',
    ip: String(req.ip || '').slice(0, 64), userAgent: String(req.get?.('user-agent') || '').slice(0, 300),
    token: null, device: null, pairedAt: 0,
  });
  return { sessionId, code, expiresAt: new Date(now + PAIR_TTL_MS).toISOString(), pollMs: POLL_MS };
}

/** Poll a pairing session by its secret id. Returns PairStatusResponse. The token is handed out exactly once. */
export function pairingStatus(sessionId, now = Date.now()) {
  prune(now);
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) return { status: 'expired' };
  const key = shaHex(sessionId);
  const s = sessions.get(key);
  if (!s) return { status: 'expired' };
  s.lastPollAt = now;
  if (s.state === 'paired') {
    sessions.delete(key);
    return { status: 'paired', token: s.token, screen: s.screen, device: { id: s.device.id, name: s.device.name } };
  }
  return { status: 'waiting', code: s.code, expiresAt: new Date(s.expiresAt).toISOString() };
}

function rateKey(req) {
  const sid = req.session?.epoch ? shaHex(`${req.session.epoch}|${req.session.user?.email || ''}`).slice(0, 16) : 'nosession';
  return `${sid}|${ipBucket(req.ip)}`;
}

/** The waiting display's address as the owner would recognise it ("192.168.1.50"; "" when unknown). */
export function displayAddress(ip) {
  const a = String(ip || '').replace(/^::ffff:/i, '').trim();
  if (!a) return '';
  if (a === '::1' || a.startsWith('127.')) return 'localhost';
  return a.slice(0, 64);
}

/**
 * Admin claims a code for a screen, in two steps (the same contract as Marco Cloud):
 *   { code, screenId, name? }                → { confirm: { where, screenId, screenName } }
 *   { code, screenId, name?, confirm: true } → { device }
 * Errors: { error, status, code }.
 * Wrong codes count against the per-admin (session + address) and the global limits; once either is reached every
 * claim answers 429 until the window passes (also for a right code: no oracle while locked).
 */
export function claimPairing(req, body, now = Date.now()) {
  prune(now);
  const rk = rateKey(req);
  const mine = claimFails.get(rk) || [];
  if (mine.length >= CLAIM_FAIL_LIMIT || globalFails.length >= CLAIM_FAIL_GLOBAL) {
    return { error: 'too many wrong codes, wait a few minutes', status: 429, code: 'rate_limited' };
  }
  const screenId = typeof body?.screenId === 'string' ? body.screenId : '';
  if (!getConfig().screens.some((s) => s.id === screenId)) return { error: 'unknown screen', status: 400, code: 'unknown_screen' };
  const code = normalizeCode(body?.code);
  let hit = null;
  if (code) {
    const h = sha(code);
    // Constant-time: compare against every waiting session, no early exit.
    for (const s of sessions.values()) {
      const eq = crypto.timingSafeEqual(s.codeHash, h);
      if (eq && s.state === 'waiting' && s.expiresAt > now && now - s.lastPollAt <= WAITING_GRACE_MS) hit = s;
    }
  }
  if (!hit) {
    mine.push(now);
    claimFails.set(rk, mine);
    globalFails.push(now);
    logActivityThrottled('display.pair_failed', rk, { everyMs: 60_000, perMinute: 10 },
      { req, level: 'warn', data: { reason: code ? 'unknown_code' : 'malformed_code', attempt: mine.length } });
    return { error: 'unknown or expired code: check the code shown on the screen', status: 404, code: 'invalid_code' };
  }
  // First step: only say which display is waiting (its address), so the owner confirms a code that came from a
  // link or a message really belongs to the screen in front of them. Nothing is paired until `confirm: true`.
  if (body?.confirm !== true) {
    const screen = getConfig().screens.find((s) => s.id === screenId);
    return { confirm: { where: displayAddress(hit.ip), screenId, screenName: screen?.name ?? '' } };
  }
  const r = createDevice({ name: body?.name, screenId, ip: hit.ip, userAgent: hit.userAgent }, { req });
  if (r.error) return { error: r.error, status: r.status, code: 'device_error' };
  hit.state = 'paired';
  hit.pairedAt = now;
  hit.token = r.token;
  hit.device = r.device;
  hit.screen = { id: r.device.screenId, slug: r.device.screenSlug, name: r.device.screenName };
  return { device: r.device };
}

/** Tests only. */
export function _resetPairing() {
  sessions.clear();
  startHits.clear();
  claimFails.clear();
  globalFails = [];
}
/** Tests only: number of pending sessions. */
export const _pendingCount = () => sessions.size;
