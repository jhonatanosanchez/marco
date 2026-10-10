// Where the admin sends the browser to sign in or after signing out. Plain TypeScript with type-only imports,
// so the server tests can load it.
//
// Self-hosted: the admin shows its own login screen, so these return null.
// Account mode (Marco Cloud, user.method 'account'): sign-in happens on the account pages, which come back
// to `next` (path + hash, for example "/admin/#/calendars") after a successful login.
import type { AuthMeResponse } from '../shared/types';
import type { Caps } from './caps';

const DEFAULT_LOGIN = '/login';

/** True when sign-in is handled by the account pages rather than the admin's own login screen. */
export function accountMode(me: AuthMeResponse | null, caps: Caps): boolean {
  if (me?.user?.method === 'account' || !!me?.account) return true;
  return caps.edition === 'cloud' && caps.tenancy === 'multi';
}

/** Keep only a same-site admin path for `next`; anything else falls back to "/admin/". */
export function safeNext(pathAndHash: string): string {
  const v = String(pathAndHash || '');
  if (!v.startsWith('/admin/') || v.includes('//') || v.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(v)) return '/admin/';
  return v;
}

/** Login URL with `next`, or null when the admin shows its own login screen. */
export function authRedirect(me: AuthMeResponse | null, caps: Caps, pathAndHash: string): string | null {
  if (!accountMode(me, caps)) return null;
  const login = me?.account?.loginUrl || DEFAULT_LOGIN;
  const sep = login.includes('?') ? '&' : '?';
  return `${login}${sep}next=${encodeURIComponent(safeNext(pathAndHash))}`;
}

/** After POST /api/auth/logout: the server's `next`, else the login page in account mode, else null (stay). */
export function logoutRedirect(me: AuthMeResponse | null, caps: Caps, res: unknown): string | null {
  if (!accountMode(me, caps)) return null;
  const next = res && typeof res === 'object' ? (res as { next?: unknown }).next : undefined;
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) return next;
  return me?.account?.loginUrl || DEFAULT_LOGIN;
}
