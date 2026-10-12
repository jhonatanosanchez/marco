// Minimal reactive store for the display.
import type { CountdownsResponse, DisplayConfig, EventsResponse, NewsResponse, PhotosResponse, WeatherResponse } from '../shared/types';
import { isPreview, screenNs } from './identity';

export interface State {
  config: DisplayConfig | null;
  events: EventsResponse | null;
  weather: WeatherResponse | null;
  news: NewsResponse | null;
  photos: PhotosResponse | null;
  countdowns: CountdownsResponse | null;
  online: boolean;
  demo: boolean;
}

export type Topic = keyof State;
type Fn = (s: State) => void;

const subs = new Map<Topic, Set<Fn>>();

export const state: State = {
  config: null, events: null, weather: null, news: null, photos: null, countdowns: null, online: true, demo: false,
};

/** Admin preview only: unsaved settings laid over every config the server sends (null = none). */
let configOverlay: ((c: DisplayConfig) => DisplayConfig) | null = null;
/** The last config as it came, before the overlay. */
let baseConfig: DisplayConfig | null = null;

/** Lay `fn` over the config (and over every later one), or take it away with null. */
export function setConfigOverlay(fn: ((c: DisplayConfig) => DisplayConfig) | null): void {
  configOverlay = fn;
  if (baseConfig) put('config', fn ? fn(baseConfig) : baseConfig);
}

export function set<K extends Topic>(k: K, v: State[K]): void {
  if (k === 'config' && v) {
    baseConfig = v as DisplayConfig;
    if (configOverlay) v = configOverlay(baseConfig) as State[K];
  }
  if (state[k] === v) return;
  put(k, v);
}

function put<K extends Topic>(k: K, v: State[K]): void {
  state[k] = v;
  const s = subs.get(k);
  if (s) for (const fn of s) {
    try {
      fn(state);
    } catch (e) {
      console.error(`[store] subscriber for ${k} failed`, e);
    }
  }
}

export function on(k: Topic | Topic[], fn: Fn): void {
  for (const t of Array.isArray(k) ? k : [k]) {
    if (!subs.has(t)) subs.set(t, new Set());
    subs.get(t)!.add(fn);
  }
}

/**
 * Persist last good data so the screen boots with content even when the server is unreachable.
 * Keyed per screen (`cs.cache.<screen>.<topic>`) so two profiles opened in the same browser never mix.
 */
const LS_PREFIX = `cs.cache.${screenNs}.`;
export function saveCache(k: Topic, v: unknown): void {
  if (isPreview) return; // the admin preview never writes this browser's storage (identity.ts)
  try {
    localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
  } catch { /* quota / private mode */ }
}
export function loadCache<T>(k: Topic): T | null {
  if (isPreview) return null; // the preview shows what the server sends now, not another display's cached data
  try {
    let s = localStorage.getItem(LS_PREFIX + k);
    // v1 builds cached the (single) screen under `cs.cache.<topic>` → reuse it for the default screen once.
    if (!s && screenNs === '_default') s = localStorage.getItem(`cs.cache.${k}`);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Per-screen copies for a carousel (`cs.cache.<ns>.m.<screenId>.<part>`): a display that boots offline keeps
 * looping through the screens it has data for. Config, events and countdowns only (photos are refetched).
 */
const CAROUSEL_PARTS = ['config', 'events', 'countdowns'];
export function saveScreenCache(screenId: string, part: string, v: unknown): void {
  if (isPreview || !CAROUSEL_PARTS.includes(part) || !/^[A-Za-z0-9_-]{1,64}$/.test(screenId)) return;
  try {
    localStorage.setItem(`${LS_PREFIX}m.${screenId}.${part}`, JSON.stringify(v));
  } catch { /* quota / private mode */ }
}
export function loadScreenCache<T>(screenId: string, part: string): T | null {
  if (isPreview || !/^[A-Za-z0-9_-]{1,64}$/.test(screenId)) return null;
  try {
    const s = localStorage.getItem(`${LS_PREFIX}m.${screenId}.${part}`);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
