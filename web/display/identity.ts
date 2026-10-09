// Display identity (docs/ARCHITECTURE.md): which screen profile this display shows (?screen=) and a stable
// client id (?client= from the kiosk, else persisted in localStorage, else generated).

const params = new URLSearchParams(location.search);

/** Requested screen key (slug or id) as typed in the URL; '' = default screen. */
export const screenKey = (params.get('screen') || '').trim().slice(0, 64);

/** Storage namespace for per-screen caches (`cs.cache.<ns>.config` …). */
export const screenNs = screenKey ? screenKey.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : '_default';

const CLIENT_RE = /^[A-Za-z0-9_-]{8,64}$/;

function sanitizeClient(raw: string): string {
  let s = raw.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  if (!s) return '';
  if (s.length < 8) s = `d_${s}`.padEnd(8, '0');
  return CLIENT_RE.test(s) ? s : '';
}

function randomId(): string {
  let s = '';
  try {
    const a = new Uint8Array(10);
    crypto.getRandomValues(a);
    for (const b of a) s += (b % 36).toString(36);
  } catch {
    while (s.length < 10) s += Math.floor(Math.random() * 36).toString(36);
  }
  return `d_${s}`;
}

function resolveClientId(): string {
  const fromUrl = sanitizeClient(params.get('client') || '');
  if (fromUrl) return fromUrl;
  try {
    const stored = localStorage.getItem('cs.clientId');
    if (stored && CLIENT_RE.test(stored)) return stored;
    const id = randomId();
    localStorage.setItem('cs.clientId', id);
    return id;
  } catch {
    // private mode / storage disabled: stable for this page load only
    return randomId();
  }
}

export const clientId = resolveClientId();

/** Admin preview iframe (`?preview=1`): live updates but never registered as a connected display. */
export const isPreview = params.get('preview') === '1';

/** Append `screen=` (when set) to an API path. */
export function withScreen(path: string): string {
  if (!screenKey) return path;
  return `${path}${path.includes('?') ? '&' : '?'}screen=${encodeURIComponent(screenKey)}`;
}
