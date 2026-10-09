// Admin password rules (setup wizard + password change). Pure; unit-tested in setup.test.js.
// The admin panel mirrors these rules for instant feedback (web/shared/password.ts) — the server is authoritative.

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

// Frequent passwords / patterns (folded: lowercase, no spaces). Not exhaustive: it catches the obvious ones.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'p@ssword',
  'qwerty', 'qwertyuiop', 'qwerty123', 'qwerty1234', 'asdfghjkl', 'asdfghjkl1', 'zxcvbnm', '1q2w3e4r5t', '1qaz2wsx3edc',
  'iloveyou', 'iloveyou1', 'letmein', 'letmein123', 'welcome', 'welcome1', 'welcome123', 'admin', 'admin123',
  'admin1234', 'administrator', 'changeme', 'change-me', 'changeme123', 'trustno1', 'football', 'baseball',
  'sunshine', 'princess', 'dragon', 'monkey', 'superman', 'starwars', 'whatever', 'master', 'shadow',
  'calendar', 'calendar123', 'marco', 'marco123', 'marcomarco', 'dakboard', 'raspberry', 'raspberrypi',
  'contraseña', 'contrasena', 'contrasena123', 'senha', 'senha123', 'senha12345', 'familia', 'familia123',
  'family', 'family123', 'homeassistant', 'abc123', 'abcdefghij', 'abcdefgh123',
]);

const SEQUENCES = ['0123456789012345678901234567890', '9876543210987654321098765432109', 'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiopasdfghjklzxcvbnm', '1qaz2wsx3edc4rfv5tgb6yhn7ujm'];

/** Lowercase, collapse whitespace. */
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '');

/** True when the password is a known-common one or a trivial pattern (one repeated char/chunk, a keyboard run…). */
export function isTrivialPassword(pw) {
  const s = norm(pw);
  if (!s) return true;
  if (COMMON.has(s)) return true;
  // the common word plus a few digits/symbols ("password2024!", "admin12345")
  const core = s.replace(/[\d\W_]+$/u, '').replace(/^[\d\W_]+/u, '');
  if (core && COMMON.has(core)) return true;
  if (new Set(s).size <= 2) return true; // "aaaaaaaaaa", "ababababab"
  for (let n = 1; n <= s.length / 2; n++) { // "abcabcabcabc", "12341234"
    if (s.length % n === 0 && s.slice(0, n).repeat(s.length / n) === s) return true;
  }
  if (SEQUENCES.some((q) => q.includes(s))) return true; // "1234567890", "abcdefghijk", "qwertyuiop"
  return false;
}

/**
 * Validate a new admin password. Returns null when fine, else an error code:
 *   'too_short' | 'too_long' | 'too_common' | 'mismatch'
 * `confirm` is checked only when provided (undefined = caller already checked).
 */
export function passwordProblem(pw, confirm) {
  if (typeof pw !== 'string' || [...pw].length < MIN_PASSWORD) return 'too_short';
  if (pw.length > MAX_PASSWORD) return 'too_long';
  if (isTrivialPassword(pw)) return 'too_common';
  if (confirm !== undefined && confirm !== pw) return 'mismatch';
  return null;
}

export const PASSWORD_MESSAGES = {
  too_short: `password must be at least ${MIN_PASSWORD} characters`,
  too_long: `password must be at most ${MAX_PASSWORD} characters`,
  too_common: 'password is too common or too simple',
  mismatch: 'passwords do not match',
};
