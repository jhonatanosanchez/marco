// API client for the public display endpoints (docs/API.md).
// Every per-screen endpoint gets `?screen=<key>` when the display was opened with one; every request carries the
// display credential (private-link key or paired-device token) in X-Marco-Key.
import type {
  CountdownsResponse, DisplayConfig, DisplayHeartbeat, EventsResponse, FamilyDisplayState, HealthResponse, HeartbeatResponse, HomelabSilenceHasta, NewsResponse,
  PhotosResponse, PollResponse, WeatherResponse,
} from '../shared/types';
import { authHeaders, withScreen, withTarget } from './identity';

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = '') {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(path, {
      ...init, signal: ctl.signal, cache: 'no-store', headers: { Accept: 'application/json', ...authHeaders(), ...(init.headers || {}) },
    });
    if (!r.ok) {
      // 401 key_required / 403 invalid_key: the display shows the pairing / "link no longer valid" screen;
      // 404 screen_not_found: the "Screen not found" page.
      let code = '';
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        try {
          code = String(((await r.json()) as { code?: string }).code || '');
        } catch { /* not JSON */ }
      }
      throw new ApiError(`${path} → HTTP ${r.status}`, r.status, code);
    }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new ApiError(`${path} → not JSON`, r.status);
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(`${path} → ${(e as Error).message || 'network error'}`);
  } finally {
    clearTimeout(tm);
  }
}

export function getJSON<T>(path: string, timeoutMs = 15000): Promise<T> {
  return request<T>(path, {}, timeoutMs);
}

// `screen` (optional) asks for one screen of the carousel the display runs (a prefetch); left out, the request is for
// the screen on display.
export const api = {
  config: (screen?: string) => getJSON<DisplayConfig>(withScreen('/api/display/config', screen)),
  /** First config fetch at boot: short timeout so an unreachable server falls back to the cache quickly. */
  configQuick: () => getJSON<DisplayConfig>(withScreen('/api/display/config'), 5000),
  events: (from: string, to: string, screen?: string) =>
    getJSON<EventsResponse>(withScreen(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, screen)),
  weather: (screen?: string) => getJSON<WeatherResponse>(withScreen('/api/weather', screen)),
  news: () => getJSON<NewsResponse>('/api/news'),
  /** `after` = gallery file shown last, so sequential orders continue from there and random avoids repeating it. */
  photos: (count = 20, after = '', screen?: string) =>
    getJSON<PhotosResponse>(withScreen(`/api/photos?count=${count}${after ? `&after=${encodeURIComponent(after)}` : ''}`, screen)),
  countdowns: (screen?: string) => getJSON<CountdownsResponse>(withScreen('/api/countdowns', screen)),
  /** Familia of a screen (kids layouts): today's routines, stars and the meals of the week. */
  family: (screen?: string) => getJSON<FamilyDisplayState>(withScreen('/api/display/family', screen)),
  /** A tap on a routine (only screens with touch on): the new state of that screen. */
  familyToggle: (choreId: string, done: boolean, screen?: string) =>
    request<{ ok: boolean; state: FamilyDisplayState }>(withScreen('/api/display/family/toggle', screen), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choreId, done }),
    }, 8000),
  /** Silenciar o reactivar una alerta del homelab desde la hoja (tarjeta homelab de esta pantalla). */
  homelabSilence: (id: string, clave: string, hasta: HomelabSilenceHasta) =>
    request<{ ok: boolean }>(withScreen(`/api/display/cards/${encodeURIComponent(id)}/silence`), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clave, hasta }),
    }, 8000),
  /** Aprobar una propuesta de la organización desde la hoja: pide el «sí» por WhatsApp. */
  orgApprove: (cardId: string, id: string) =>
    request<{ ok: boolean; error?: string }>(withScreen(`/api/display/cards/${encodeURIComponent(cardId)}/approve`), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
    }, 8000),
  health: () => getJSON<HealthResponse>('/api/health', 5000),
  /** `q` from stream.ts pollUrl (client, cursor, rev, hidden, preview). Asks for what the display is bound to. */
  poll: (q: string) => getJSON<PollResponse>(withTarget(`/api/display/poll?${q}`), 10000),
  heartbeat: (hb: DisplayHeartbeat) =>
    request<HeartbeatResponse>('/api/display/heartbeat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(hb),
    }, 8000),
};
