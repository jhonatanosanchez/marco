// API client for the public display endpoints (docs/API.md).
// Every per-screen endpoint gets `?screen=<key>` when the display was opened with one.
import type {
  CountdownsResponse, DisplayConfig, DisplayHeartbeat, EventsResponse, HealthResponse, HeartbeatResponse, NewsResponse,
  PhotosResponse, WeatherResponse,
} from '../shared/types';
import { withScreen } from './identity';

export class ApiError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(path, {
      ...init, signal: ctl.signal, cache: 'no-store', headers: { Accept: 'application/json', ...(init.headers || {}) },
    });
    if (!r.ok) throw new ApiError(`${path} → HTTP ${r.status}`, r.status);
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

export const api = {
  config: () => getJSON<DisplayConfig>(withScreen('/api/display/config')),
  events: (from: string, to: string) =>
    getJSON<EventsResponse>(withScreen(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)),
  weather: () => getJSON<WeatherResponse>(withScreen('/api/weather')),
  news: () => getJSON<NewsResponse>('/api/news'),
  /** `after` = gallery file shown last, so sequential orders continue from there and random avoids repeating it. */
  photos: (count = 20, after = '') =>
    getJSON<PhotosResponse>(withScreen(`/api/photos?count=${count}${after ? `&after=${encodeURIComponent(after)}` : ''}`)),
  countdowns: () => getJSON<CountdownsResponse>(withScreen('/api/countdowns')),
  health: () => getJSON<HealthResponse>('/api/health', 5000),
  heartbeat: (hb: DisplayHeartbeat) =>
    request<HeartbeatResponse>('/api/display/heartbeat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(hb),
    }, 8000),
};
