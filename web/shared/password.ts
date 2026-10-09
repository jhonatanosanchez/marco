// Admin password rules for instant feedback in the panel. Mirrors server/lib/password.js (the server is authoritative).

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

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

export function isTrivialPassword(pw: string): boolean {
  const s = pw.toLowerCase().replace(/\s+/g, '');
  if (!s) return true;
  if (COMMON.has(s)) return true;
  const core = s.replace(/[\d\W_]+$/u, '').replace(/^[\d\W_]+/u, '');
  if (core && COMMON.has(core)) return true;
  if (new Set(s).size <= 2) return true;
  for (let n = 1; n <= s.length / 2; n++) if (s.length % n === 0 && s.slice(0, n).repeat(s.length / n) === s) return true;
  return SEQUENCES.some((q) => q.includes(s));
}

export type PasswordProblem = 'too_short' | 'too_long' | 'too_common' | null;

export function passwordProblem(pw: string): PasswordProblem {
  if ([...pw].length < MIN_PASSWORD) return 'too_short';
  if (pw.length > MAX_PASSWORD) return 'too_long';
  if (isTrivialPassword(pw)) return 'too_common';
  return null;
}

/** 0 (empty/unacceptable) … 4 (strong): length + character variety, capped at 1 when the rules fail. */
export function passwordScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  if (passwordProblem(pw)) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const unique = new Set(pw).size;
  let s = 2;
  if (pw.length >= 14 || (pw.length >= 12 && classes >= 3)) s = 3;
  if ((pw.length >= 16 && classes >= 2 && unique >= 10) || (pw.length >= 13 && classes === 4)) s = 4;
  if (unique < 6) s = Math.min(s, 2);
  return s as 2 | 3 | 4;
}
