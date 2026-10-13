// Time-based one-time passwords (RFC 6238, on HOTP from RFC 4226) for two-step sign-in with an authenticator app,
// plus the one-time recovery codes. Pure functions on node:crypto: no file or session access (server/twofactor.js).
import crypto from 'node:crypto';

/** Seconds per code. Authenticator apps assume 30 (and SHA-1, 6 digits) unless the otpauth URI says otherwise. */
export const STEP_SECONDS = 30;
export const DIGITS = 6;
/** Codes one step before and after the current one are accepted too (clock drift, typing slowly). */
export const WINDOW = 1;
/** Random bytes in a new secret (160 bits, what RFC 4226 recommends for SHA-1). */
export const SECRET_BYTES = 20;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding. */
export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Base32 to bytes; spaces, dashes and padding are ignored, case does not matter. Null when it is not base32. */
export function base32Decode(text) {
  const s = String(text ?? '').toUpperCase().replace(/[\s=-]/g, '');
  if (!s || !/^[A-Z2-7]+$/.test(s)) return null;
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret, base32. */
export const newSecret = () => base32Encode(crypto.randomBytes(SECRET_BYTES));

/** HOTP value for one counter (RFC 4226 §5.3), as a zero-padded string. */
export function hotp(key, counter, { digits = DIGITS, algorithm = 'sha1' } = {}) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(algorithm, key).update(msg).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The time step a moment falls in. */
export const stepAt = (ms = Date.now(), step = STEP_SECONDS) => Math.floor(ms / 1000 / step);

/** TOTP value at a moment (ms). `key` is the raw secret bytes. */
export const totp = (key, ms = Date.now(), { digits = DIGITS, algorithm = 'sha1', step = STEP_SECONDS } = {}) =>
  hotp(key, stepAt(ms, step), { digits, algorithm });

/** Only the digits of what was typed ("123 456" → "123456"); null unless that leaves exactly DIGITS digits. */
export function normalizeCode(code) {
  const s = String(code ?? '').replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${DIGITS}}$`).test(s) ? s : null;
}

/**
 * Checks a typed code against the secret (base32) for the current step and WINDOW steps around it. Returns the
 * step that matched, or null. A step at or before `afterStep` (the last one used) never matches, so a code cannot
 * be used twice, and neither can an older one once a newer one was used. Every candidate is compared in constant
 * time, and all of them are always computed.
 */
export function verifyTotp(secret, code, { now = Date.now(), afterStep = -1, window = WINDOW } = {}) {
  const key = base32Decode(secret);
  const typed = normalizeCode(code);
  if (!key || !typed) return null;
  const cur = stepAt(now);
  const want = Buffer.from(typed);
  let found = null;
  for (let s = cur - window; s <= cur + window; s++) {
    const same = crypto.timingSafeEqual(Buffer.from(hotp(key, s)), want);
    if (same && s > afterStep && found === null) found = s;
  }
  return found;
}

/** otpauth:// URI for the QR code (Key Uri Format used by Google Authenticator and the others). */
export function otpauthUri({ secret, issuer = 'Marco', account = 'admin' }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const q = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${q}`;
}

// ---------- recovery codes ----------

/** Codes shown once when two-step sign-in is turned on (or the codes are renewed). */
export const RECOVERY_CODES = 10;
// No 0/o, 1/l/i: easy to copy from paper. 31^10 ≈ 2^49 per code.
const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const RC_LEN = 10;

function recoveryCode() {
  let s = '';
  while (s.length < RC_LEN) {
    for (const b of crypto.randomBytes(16)) {
      // 248 = 8 × 31: rejection sampling keeps every character equally likely.
      if (b < 248 && s.length < RC_LEN) s += RC_ALPHABET[b % 31];
    }
  }
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** RECOVERY_CODES new codes, like "k7m2p-x9qrt". */
export function newRecoveryCodes(n = RECOVERY_CODES) {
  const out = new Set();
  while (out.size < n) out.add(recoveryCode());
  return [...out];
}

/** What a typed recovery code is compared as: lower case, no spaces or dashes. Null when it cannot be one. */
export function normalizeRecoveryCode(code) {
  const s = String(code ?? '').toLowerCase().replace(/[\s-]/g, '');
  return s.length === RC_LEN && [...s].every((c) => RC_ALPHABET.includes(c)) ? s : null;
}

/** SHA-256 (hex) of a normalized recovery code: the codes are random and long, so a plain hash is enough. */
export const hashRecoveryCode = (code) => {
  const n = normalizeRecoveryCode(code);
  return n ? crypto.createHash('sha256').update(`marco-recovery|${n}`).digest('hex') : null;
};

/**
 * Index of the stored hash that matches a typed recovery code, or -1. Every stored hash is compared (constant time),
 * whatever matched first.
 */
export function findRecoveryCode(hashes, code) {
  const h = hashRecoveryCode(code);
  if (!h || !Array.isArray(hashes)) return -1;
  const want = Buffer.from(h, 'hex');
  let found = -1;
  hashes.forEach((x, i) => {
    const b = typeof x === 'string' && /^[0-9a-f]{64}$/.test(x) ? Buffer.from(x, 'hex') : Buffer.alloc(32);
    if (crypto.timingSafeEqual(b, want) && found < 0) found = i;
  });
  return found;
}
