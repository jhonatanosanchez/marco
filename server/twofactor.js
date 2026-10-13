// Two-step sign-in for the admin (an authenticator app code after the password or Google), off until the admin turns
// it on in Security. State lives in data/secrets.json next to the password hash (same file, mode 600):
//   twoFactor      { secret (base32), enabledAt, lastStep, recovery: [sha256 hex of each unused code] }
//   twoFactorSetup { secret, createdAt, tries } while the admin is setting it up (not active yet)
// Neither is ever in an export (core/backupsCore.js exportSecrets lists what goes out), so an import or a restore
// leaves two-step sign-in as it is on this server. Turning it on or off never ends existing sessions.
// The step between a correct password and the code is a challenge kept here in memory (a server restart drops it:
// sign in again); the browser only holds its random id in the signed session cookie.
import crypto from 'node:crypto';
import { getSecrets, updateSecrets } from './store.js';
import { newSecret, verifyTotp, newRecoveryCodes, hashRecoveryCode, findRecoveryCode, normalizeCode, normalizeRecoveryCode } from './lib/totp.js';

/** A started setup must be confirmed with a code within this time. */
export const SETUP_TTL_MS = 15 * 60_000;
/** Wrong codes allowed while confirming one setup; then it has to be started again. */
export const SETUP_TRIES = 10;
/** Time to type the code after the password. */
export const CHALLENGE_TTL_MS = 5 * 60_000;
/** Wrong codes allowed per challenge; then the password has to be typed again. */
export const CHALLENGE_ATTEMPTS = 5;
const MAX_CHALLENGES = 200;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function state() {
  const t = getSecrets().twoFactor;
  return isObj(t) && typeof t.secret === 'string' && t.secret ? t : null;
}

export const twoFactorEnabled = () => state() !== null;

/** GET /api/admin/2fa */
export function twoFactorStatus() {
  const t = state();
  return {
    enabled: Boolean(t),
    enabledAt: t?.enabledAt ?? null,
    recoveryLeft: t && Array.isArray(t.recovery) ? t.recovery.length : 0,
  };
}

/** Start (or start over) setting it up: a new secret waits for its first code. Returns the secret (base32). */
export function startSetup(now = Date.now()) {
  const secret = newSecret();
  updateSecrets((s) => { s.twoFactorSetup = { secret, createdAt: now, tries: 0 }; });
  return secret;
}

/**
 * Turn it on with the first code from the app. Returns { ok: true, recoveryCodes } (shown once, only their hashes
 * are kept) or { ok: false, reason: 'no_setup' | 'expired' | 'code_invalid' | 'already_enabled' }.
 */
export function confirmSetup(code, now = Date.now()) {
  if (state()) return { ok: false, reason: 'already_enabled' };
  const p = getSecrets().twoFactorSetup;
  if (!isObj(p) || typeof p.secret !== 'string') return { ok: false, reason: 'no_setup' };
  if (now - (Number(p.createdAt) || 0) > SETUP_TTL_MS || (Number(p.tries) || 0) >= SETUP_TRIES) {
    updateSecrets((s) => { delete s.twoFactorSetup; });
    return { ok: false, reason: 'expired' };
  }
  const step = verifyTotp(p.secret, code, { now });
  if (step === null) {
    updateSecrets(() => { p.tries = (Number(p.tries) || 0) + 1; });
    return { ok: false, reason: 'code_invalid' };
  }
  const codes = newRecoveryCodes();
  updateSecrets((s) => {
    s.twoFactor = { secret: p.secret, enabledAt: new Date(now).toISOString(), lastStep: step, recovery: codes.map(hashRecoveryCode) };
    delete s.twoFactorSetup;
  });
  dropAllChallenges();
  return { ok: true, recoveryCodes: codes };
}

/** Turn it off (admin, or server/disable-2fa.js when locked out). */
export function disableTwoFactor() {
  updateSecrets((s) => { delete s.twoFactor; delete s.twoFactorSetup; });
  dropAllChallenges();
}

/** New recovery codes; the old ones stop working. Null when two-step sign-in is off. */
export function renewRecoveryCodes() {
  const t = state();
  if (!t) return null;
  const codes = newRecoveryCodes();
  updateSecrets(() => { t.recovery = codes.map(hashRecoveryCode); });
  return codes;
}

/** What was typed looks like an app code, a recovery code, or neither. */
export const codeKind = (code) => (normalizeCode(code) ? 'app' : normalizeRecoveryCode(code) ? 'recovery' : null);

/**
 * Check a code from the app (each one works once: its step is remembered) or an unused recovery code (used up
 * here). No rate limit here: the callers reserve an attempt first (auth.js checkSecondFactorLimited).
 * Returns { ok: true, kind: 'app' | 'recovery', recoveryLeft } or { ok: false, reason: 'off' | 'code_invalid' }.
 */
export function checkSecondFactor(code, now = Date.now()) {
  const t = state();
  if (!t) return { ok: false, reason: 'off' };
  const kind = codeKind(code);
  if (kind === 'app') {
    const step = verifyTotp(t.secret, code, { now, afterStep: Number.isInteger(t.lastStep) ? t.lastStep : -1 });
    if (step === null) return { ok: false, reason: 'code_invalid' };
    updateSecrets(() => { t.lastStep = step; });
    return { ok: true, kind, recoveryLeft: t.recovery?.length ?? 0 };
  }
  if (kind === 'recovery') {
    const i = findRecoveryCode(t.recovery, code);
    if (i < 0) return { ok: false, reason: 'code_invalid' };
    updateSecrets(() => { t.recovery.splice(i, 1); });
    return { ok: true, kind, recoveryLeft: t.recovery.length };
  }
  return { ok: false, reason: 'code_invalid' };
}

// ---------- the step between the password (or Google) and the code ----------

const challenges = new Map(); // sha256(id) → { user, createdAt, attempts }
const chKey = (id) => crypto.createHash('sha256').update(String(id)).digest('hex');
const CH_ID_RE = /^[A-Za-z0-9_-]{32}$/;

function pruneChallenges(now) {
  for (const [k, c] of challenges) if (now - c.createdAt > CHALLENGE_TTL_MS) challenges.delete(k);
  // Oldest first (Map keeps insertion order).
  while (challenges.size >= MAX_CHALLENGES) challenges.delete(challenges.keys().next().value);
}

/** A new challenge for `user` (the session user it signs in once the code is right). Returns its id for the cookie. */
export function startChallenge(user, now = Date.now()) {
  pruneChallenges(now);
  const id = crypto.randomBytes(24).toString('base64url');
  challenges.set(chKey(id), { user: { ...user }, createdAt: now, attempts: 0 });
  return id;
}

/** The live challenge with this id, or null (unknown, expired, used up). */
export function challengeOf(id, now = Date.now()) {
  if (typeof id !== 'string' || !CH_ID_RE.test(id)) return null;
  const c = challenges.get(chKey(id));
  if (!c) return null;
  if (now - c.createdAt > CHALLENGE_TTL_MS || c.attempts >= CHALLENGE_ATTEMPTS) {
    challenges.delete(chKey(id));
    return null;
  }
  return c;
}

export function dropChallenge(id) {
  if (typeof id === 'string') challenges.delete(chKey(id));
}

/** Every pending challenge ends (two-step sign-in turned on or off, password changed, everyone signed out). */
export function dropAllChallenges() {
  challenges.clear();
}

/** Tests only. */
export const _challengeCount = () => challenges.size;
