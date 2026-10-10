// Place search for the weather location: GET /api/admin/geocode?q=&lang= (docs/API.md "Geocode").
// The admin and the setup wizard ask this server, which asks Open-Meteo's geocoding API, so the browser only talks
// to its own server (Marco Cloud answers the same path with the same shape).
//
// Who may call it: a signed-in admin, or the setup wizard while the install has no password yet (same rules as the
// other wizard endpoints: the setup token when one is required). Rate limited per client address and globally,
// because every miss is a request to a free third-party service. Answers are cached for a day.
import { Router } from 'express';
import { sessionValid, needsSetup } from './auth.js';
import { setupGate } from './setup.js';
import { requestJson } from './lib/http.js';
import { ipBucket } from './lib/net.js';
import { LANGS } from './core/lib/i18n.js';

export const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export const GEOCODE_LIMIT = { max: 60, windowMs: 10 * 60_000 }; // per client address (IPv6: /64)
export const GEOCODE_GLOBAL = { max: 600, windowMs: 10 * 60_000 }; // all clients together
const CACHE_TTL = 24 * 3600_000;
const CACHE_MAX = 500;
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 8;

const cache = new Map(); // `${lang}|${query}` → { at, data }
const hits = new Map(); // ip bucket → number[] (ms)
let globalHits = [];

const str = (v, max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/** Open-Meteo geocoding answer → { results: GeocodeResult[] } (the shape Marco Cloud returns too). */
export function mapGeocode(j) {
  const list = Array.isArray(j?.results) ? j.results : [];
  const results = [];
  for (const r of list) {
    if (results.length >= MAX_RESULTS) break;
    const lat = Number(r?.latitude);
    const lon = Number(r?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    results.push({
      name: str(r.name, 120),
      admin1: str(r.admin1, 120),
      country: str(r.country, 120),
      countryCode: str(r.country_code, 2).toUpperCase(),
      lat,
      lon,
      timezone: str(r.timezone, 64),
    });
  }
  return { results };
}

function allowed(bucket, now) {
  const fresh = (list) => list.filter((t) => now - t < GEOCODE_LIMIT.windowMs);
  globalHits = fresh(globalHits);
  const mine = fresh(hits.get(bucket) || []);
  if (mine.length >= GEOCODE_LIMIT.max || globalHits.length >= GEOCODE_GLOBAL.max) {
    hits.set(bucket, mine);
    return false;
  }
  mine.push(now);
  hits.set(bucket, mine);
  globalHits.push(now);
  if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); if (hits.size <= 4000) break; }
  return true;
}

/**
 * Search places. Returns { status, body }. `fetchJson(url, opts)` is only replaced in tests.
 * Cached answers do not count against the rate limit.
 */
export async function geocode({ q, lang, ip }, { fetchJson = requestJson, now = Date.now() } = {}) {
  const query = str(q, 100);
  const l = LANGS.includes(lang) ? lang : 'en';
  if (query.length < 2) return { status: 200, body: { results: [] } };
  const key = `${l}|${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL) return { status: 200, body: hit.data };
  if (!allowed(ipBucket(ip), now)) return { status: 429, body: { error: 'rate_limited' }, retryAfter: Math.ceil(GEOCODE_LIMIT.windowMs / 1000) };
  const url = `${GEOCODE_URL}?${new URLSearchParams({ name: query, count: String(MAX_RESULTS), language: l, format: 'json' })}`;
  try {
    const data = mapGeocode(await fetchJson(url, { timeout: TIMEOUT_MS }));
    cache.delete(key);
    cache.set(key, { at: now, data });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return { status: 200, body: data };
  } catch {
    return { status: 502, body: { error: 'geocode_unavailable' } };
  }
}

/** Router mounted at /api/admin before the session-only routers (the wizard has no session yet). */
export function geocodeRouter({ fetchJson } = {}) {
  const r = Router();
  r.get('/geocode', async (req, res, next) => {
    try {
      res.set('cache-control', 'private, no-store');
      if (!sessionValid(req)) {
        if (!needsSetup()) return res.status(401).json({ error: 'unauthorized' });
        if (!setupGate(req, res)) return;
      }
      const out = await geocode({ q: req.query.q, lang: req.query.lang, ip: req.ip }, fetchJson ? { fetchJson } : {});
      if (out.retryAfter) res.set('retry-after', String(out.retryAfter));
      res.status(out.status).json(out.body);
    } catch (err) {
      next(err);
    }
  });
  return r;
}

/** Tests only. */
export function _resetGeocode() {
  cache.clear();
  hits.clear();
  globalHits = [];
}
