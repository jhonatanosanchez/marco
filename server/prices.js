// Electricity prices for the 'prices' widget on a self-hosted server: one cache entry per zone in memory for every
// screen. The screens only ever ask this server (GET /api/display/prices), never the sources. What to ask, how to
// read it and one refresh round are in core/pricesCore.js (Marco Cloud runs the same round on Workers).
//
// - Refresh: after the day-ahead auction until tomorrow's prices are in, then once a day (pricesCore nextRefreshAt).
//   With prices cached, a due refresh runs in the background: a slow source never holds a screen up.
// - A source that answers 429 is left alone for its Retry-After; calls to one source are spaced out (Energy-Charts
//   refuses more than a few quick calls).
// - A failed refresh keeps the last prices; they are marked stale once they no longer cover the current time or are
//   over 3 hours old. Failures back off (2 minutes up to 1 hour).
// - Redirects only on the same host (the ENTSO-E token is in the query string), answers over 2 MB refused.
// - The ENTSO-E token lives in secrets.json (prices.entsoeToken), never in the config and never sent back.
import fs from 'node:fs';
import {
  checkEntsoeToken as checkToken, entsoeTokenStatus as tokenStatus, PricesError, pricesResponse, priceZone, refreshDue,
  refreshZone, retryAfterMs,
} from './core/pricesCore.js';
import { fakePricesFetch } from './core/pricesFake.js';
import { loadFakeFixtures } from './pricesFixtures.js';
import { getSecrets } from './store.js';

export { PricesError, ENTSOE_TOKEN_RE } from './core/pricesCore.js';

const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '0';
  }
})();
const USER_AGENT = `Marco/${VERSION} (+https://github.com/mr-reb00t/marco)`;
/** A self-hosted server is one household: the zones published for private use may be shown. */
export const PRIVATE_USE = true;
const TIMEOUT = 15_000;
const MAX_BODY = 2 * 1024 * 1024;
/** Spacing between two calls to the same source; Energi Data Service answers 3 calls per 10 seconds or so. */
const SOURCE_GAP_MS = 2_000;
const SOURCE_GAP = { eds: 3_600 };
const FORGET_AFTER_MS = 3 * 86400_000;

/** GET `url`, following redirects only on the same host (https), at most 3. */
async function realFetch(url) {
  const signal = AbortSignal.timeout(TIMEOUT);
  let u = url;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/xml, text/plain, */*' }, signal, redirect: 'manual' });
    if (r.status < 300 || r.status >= 400 || !r.headers.get('location')) return r;
    const next = new URL(r.headers.get('location'), u);
    if (next.host !== new URL(u).host || next.protocol !== 'https:') throw new PricesError('bad_response', 'redirect to another host');
    u = next.href;
  }
  throw new PricesError('bad_response', 'too many redirects');
}

/** The body as text, refused past MAX_BODY (read in chunks, so a huge answer is never held whole). */
async function readBody(res) {
  const len = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(len) && len > MAX_BODY) throw new PricesError('bad_response', 'too large');
  if (!res.body?.getReader) {
    const text = await res.text();
    if (text.length > MAX_BODY) throw new PricesError('bad_response', 'too large');
    return text;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > MAX_BODY) {
      void reader.cancel().catch(() => {});
      throw new PricesError('bad_response', 'too large');
    }
    text += dec.decode(value, { stream: true });
  }
  return text + dec.decode();
}

const fake = process.env.MARCO_PRICES_FAKE;
if (fake) loadFakeFixtures();
// MARCO_PRICES_FAKE_DELAY / MARCO_PRICES_FAKE_GRID_DELAY (ms): slow made-up sources, to see the loading states
const fakeSlow = { delay: Number(process.env.MARCO_PRICES_FAKE_DELAY) || 0, gridDelay: Number(process.env.MARCO_PRICES_FAKE_GRID_DELAY) || 0 };
let outbound = fake ? fakePricesFetch(fake, undefined, fakeSlow) : realFetch;
let clock = () => Date.now();

/** Tests replace the network (a fetch-like function) and the clock; null restores them. Clears the cache. */
export function setPricesFetch(f, now = null) {
  outbound = f || (fake ? fakePricesFetch(fake, undefined, fakeSlow) : realFetch);
  clock = now || (() => Date.now());
  cache.clear();
  inflight.clear();
  gates.clear();
  for (const fn of resets) fn();
}

/** The household's ENTSO-E token (secrets.json). */
export const entsoeToken = () => String(getSecrets()?.prices?.entsoeToken || '');

/** zone → { slots, source, converted, fetchedAt, nextAt, fails, error, usedAt } */
const cache = new Map();
const inflight = new Map();
/** source → { chain: Promise (calls one at a time), until: ms (rate limited until) } */
const gates = new Map();

function gate(source) {
  let g = gates.get(source);
  if (!g) gates.set(source, (g = { chain: Promise.resolve(), until: 0 }));
  return g;
}

const netError = (err) => (err instanceof PricesError ? err : new PricesError(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'fetch_failed'));

/** One request through the source's gate: { status, text }. */
function call(source, req) {
  const g = gate(source);
  const run = g.chain.then(async () => {
    if (clock() < g.until) throw new PricesError('rate_limited');
    let res;
    try {
      res = await outbound(req.url);
    } catch (err) {
      throw netError(err);
    }
    const status = res.status;
    const ra = retryAfterMs(res.headers?.get?.('retry-after'), clock());
    if (status === 429) {
      g.until = clock() + (ra ?? 60_000);
      throw new PricesError('rate_limited');
    }
    try {
      return { status, text: await readBody(res) };
    } catch (err) {
      throw netError(err);
    }
  });
  // the next call waits for this one plus a short gap, whatever its outcome
  g.chain = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, outbound === realFetch ? SOURCE_GAP[source] ?? SOURCE_GAP_MS : 0)));
  return run;
}

/**
 * One GET through a source's gate (grid tariffs, server/tariffs.js): { status, text }. A 429 that asks for a short
 * wait (15 seconds at most, Energi Data Service's window) is waited out and asked once more.
 */
export async function sourceGet(source, url) {
  try {
    return await call(source, { url });
  } catch (err) {
    const wait = gate(source).until - clock();
    if (!(err instanceof PricesError) || err.code !== 'rate_limited' || wait > 15_000) throw err;
    await new Promise((r) => setTimeout(r, Math.max(0, wait) + 250));
    return call(source, { url });
  }
}
/** The clock the price cache runs on (tests replace it with setPricesFetch). */
export const pricesNow = () => clock();
const resets = new Set();
/** `fn` runs whenever setPricesFetch swaps the network (the tariff cache clears itself). */
export const onPricesReset = (fn) => void resets.add(fn);

async function refresh(zoneId, prev) {
  const e = await refreshZone(zoneId, prev, {
    now: clock(), call, token: entsoeToken(), privateUse: PRIVATE_USE, log: (m) => console.warn(`[prices] ${m}`),
  });
  e.usedAt = prev?.usedAt ?? clock();
  cache.set(zoneId, e);
  return e;
}

function forgetUnused(now) {
  for (const [k, e] of cache) if (now - e.usedAt > FORGET_AFTER_MS) cache.delete(k);
}

/**
 * Prices of `zoneId` as the screens get them (pricesResponse). Throws PricesError when there are none at all.
 * When prices are cached a due refresh runs in the background and the cached ones are answered at once; only a zone
 * with nothing yet, or `force`, waits for it. `force` asks the sources again unless the last answer is under a minute
 * old.
 */
export async function getPrices(zoneId, { force = false } = {}) {
  if (!priceZone(zoneId)) throw new PricesError('invalid_zone');
  const now = clock();
  forgetUnused(now);
  let e = cache.get(zoneId);
  if (refreshDue(e, now, force)) {
    let p = inflight.get(zoneId);
    if (!p) {
      p = refresh(zoneId, e).finally(() => inflight.delete(zoneId));
      inflight.set(zoneId, p);
    }
    if (force || !e?.slots.length) e = await p;
    else p.catch(() => {});
  }
  e.usedAt = now;
  return pricesResponse(zoneId, e, now);
}

/** Cached state of every zone in use (admin status): zone → { source, fetchedAt, error }. */
export function pricesStatus() {
  return Object.fromEntries([...cache].map(([k, e]) => [k, { source: e.source, fetchedAt: e.fetchedAt ? new Date(e.fetchedAt).toISOString() : null, error: e.error }]));
}

/**
 * POST /api/admin/test/prices: the zone's prices now, through the cache (so a test never costs more than one round of
 * calls a minute), with the grid tariffs `gridTariffs()` gives (server/tariffs.js) when the widget has a grid company.
 * { ok, ...getPrices, grid? } or { ok: false, error }.
 */
export async function testPrices(zoneId, gridTariffs = null) {
  try {
    const out = { ok: true, ...(await getPrices(zoneId, { force: true })) };
    if (gridTariffs) out.grid = await gridTariffs();
    return out;
  } catch (err) {
    return { ok: false, error: err instanceof PricesError ? err.code : 'fetch_failed' };
  }
}

/** Whether a token is saved and its last 4 characters, never the token. */
export const entsoeTokenStatus = (token = entsoeToken()) => tokenStatus(token);

/** Tries an ENTSO-E token once (Germany, today): true, false (refused) or null (could not tell). */
export const checkEntsoeToken = (token) => checkToken(token, { now: clock(), call });

/** A new token: zones that use ENTSO-E are asked again. */
export function tokenChanged() {
  for (const e of cache.values()) e.nextAt = 0;
}
