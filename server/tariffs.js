// Danish grid tariffs for the electricity price widget (tariffsCore.js has the pure part). One cache entry per grid
// company (one request per tariff code, 1 to 4) plus one for Energinet's own charges, shared by every screen; asked
// from Energi Data Service (DatahubPricelist) through the same gate as the day-ahead prices (server/prices.js).
//
// - Refresh: twice a day is plenty (tariffs change a few times a year and are published weeks ahead). Failures back
//   off (2 minutes up to 1 hour) and keep the last records; a company never fetched answers its error.
// - The screens get the hours with their prices (GET /api/display/prices?zone=&grid=), never the source.
import { failureBackoff, fetchWindow, priceZone } from './core/pricesCore.js';
import { DATAHUB_CREDIT, datahubRequests, gridCompany, gridHours, parseDatahub } from './core/tariffsCore.js';
import { onPricesReset, PricesError, pricesNow, sourceGet } from './prices.js';

const REFRESH_MS = 12 * 3600_000;
const FORGET_AFTER_MS = 3 * 86400_000;
const ENERGINET = '_energinet';

/** key (company id or ENERGINET) → { records, fetchedAt, triedAt, nextAt, fails, error, usedAt } */
const cache = new Map();
const inflight = new Map();
onPricesReset(() => {
  cache.clear();
  inflight.clear();
});

async function fetchRecords(url) {
  const { status, text } = await sourceGet('eds', url);
  if (status === 401 || status === 403) throw new PricesError('http_denied');
  if (status < 200 || status >= 300) throw new PricesError('http_error', `HTTP ${status}`);
  try {
    return parseDatahub(text);
  } catch (err) {
    throw new PricesError('bad_response', err.message);
  }
}

async function refresh(key, urls, prev) {
  const now = pricesNow();
  try {
    const records = [];
    for (const url of urls) records.push(...(await fetchRecords(url)));
    if (!records.length) throw new PricesError('no_data');
    const e = { records, fetchedAt: now, triedAt: now, nextAt: now + REFRESH_MS, fails: 0, error: null, usedAt: prev?.usedAt ?? now };
    cache.set(key, e);
    return e;
  } catch (err) {
    const code = err instanceof PricesError ? err.code : 'fetch_failed';
    console.warn(`[tariffs] ${key}: ${code}`);
    const fails = (prev?.fails ?? 0) + 1;
    const e = prev
      ? { ...prev, fails, error: code, triedAt: now, nextAt: now + failureBackoff(fails) }
      : { records: [], fetchedAt: 0, triedAt: now, nextAt: now + failureBackoff(fails), fails, error: code, usedAt: now };
    cache.set(key, e);
    return e;
  }
}

/**
 * The records of one entry: cached ones at once (a due refresh runs behind), a first fetch waited for. `force` (the
 * admin's test) asks again at most once a minute, counted from the last attempt, failed ones too.
 */
async function entry(key, urls, force) {
  const now = pricesNow();
  let e = cache.get(key);
  const due = !e || now >= e.nextAt || (force && now - (e.triedAt || 0) > 60_000);
  if (due) {
    let p = inflight.get(key);
    if (!p) {
      p = refresh(key, urls, e).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    if (force || !e?.records.length) e = await p;
    else p.catch(() => {});
  }
  e.usedAt = now;
  return e;
}

/**
 * The grid tariff hours of `companyId` over the zone's price window: { id, name, credit, fetchedAt, error, hours:
 * [[t (s), grid, net, tax, est (0|1)]] } in DKK/kWh without VAT. `hours` is empty when the tariffs could not be had
 * (the company's or Energinet's: without either part the price would read too low), and an hour with any charge
 * unknown is left out. `wait` (ms): answer { hours: [], error: 'pending' } if a first fetch takes longer, the fetch
 * going on behind for the next ask.
 */
export async function getGridTariffs(companyId, zoneId, { force = false, wait = 0 } = {}) {
  const c = gridCompany(companyId);
  if (!c) throw new PricesError('invalid_grid');
  const now = pricesNow();
  for (const [k, e] of cache) if (now - e.usedAt > FORGET_AFTER_MS) cache.delete(k);
  const req = datahubRequests(c, now);
  const both = Promise.all([entry(c.id, req.company.map((r) => r.url), force), entry(ENERGINET, [req.energinet.url], force)]);
  let timer = null;
  const late = wait > 0 ? new Promise((r) => (timer = setTimeout(() => r(null), wait))) : null;
  const got = await (late ? Promise.race([both, late]) : both);
  if (timer) clearTimeout(timer);
  const head = { id: c.id, name: c.name, credit: DATAHUB_CREDIT };
  if (!got) {
    both.catch(() => {});
    return { ...head, fetchedAt: null, error: 'pending', hours: [] };
  }
  const [ce, en] = got;
  const win = fetchWindow(priceZone(zoneId) ?? priceZone(c.zone), now);
  const list = ce.records.length && en.records.length ? gridHours(c, ce.records, en.records, win.from, win.to) : [];
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const hours = list
    .filter((h) => h.grid != null && h.net != null && h.tax != null)
    .map((h) => [h.t / 1000, r6(h.grid), r6(h.net), r6(h.tax), h.est ? 1 : 0]);
  return {
    ...head,
    fetchedAt: ce.fetchedAt ? new Date(ce.fetchedAt).toISOString() : null,
    error: hours.length ? null : (!ce.records.length && ce.error) || (!en.records.length && en.error) || ce.error || en.error || 'no_data',
    hours,
  };
}
