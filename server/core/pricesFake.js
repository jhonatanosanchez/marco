// Made-up electricity prices in each source's own format, for test servers and screenshots (MARCO_PRICES_FAKE=1).
// It answers the very requests pricesCore.js builds, so the real parsers run end to end. Never used unless the
// variable is set. MARCO_PRICES_FAKE=today: tomorrow is not published yet; =all: it always is; =fail: every source is down.
import { localMidnight, tzOffset, wallClock, priceZone, PRICE_ZONES, DKK_PER_EUR } from './pricesCore.js';

// Real answers saved for the tests (trimmed), given by the caller (no files here: this runs on Workers too): DataHub
// tariffs of every Danish grid company (October 2026 to April 2027) and the DK2 day-ahead prices of 2026-10-13,
// served for those dates so a test server shows real numbers. server/pricesFixtures.js reads them for Node.
let fixtureData = { datahub: [], dk2: new Map() };
/** Sets the saved answers: { datahub: DatahubPricelist records, dk2: DayAheadPrices records }. */
export function setFakeFixtures({ datahub = [], dk2 = [] } = {}) {
  fixtureData = { datahub, dk2: new Map(dk2.map((r) => [Date.parse(`${r.TimeUTC}Z`), r])) };
}
const fixtures = () => fixtureData;

/** DatahubPricelist: the saved records that match the filter, ValidFrom before `end`, newest first. */
function fakeDatahub(url) {
  const q = url.searchParams;
  const f = JSON.parse(q.get('filter') || '{}');
  const end = q.get('end') || '9999';
  const glns = f.GLN_Number ?? [];
  const codes = f.ChargeTypeCode ?? [];
  const records = fixtures().datahub
    .filter((r) => glns.includes(r.GLN_Number) && codes.includes(String(r.ChargeTypeCode).trim()) && r.ValidFrom < end)
    .sort((a, b) => (a.ValidFrom < b.ValidFrom ? 1 : -1))
    .slice(0, Number(q.get('limit')) || 100);
  return { total: records.length, dataset: 'DatahubPricelist', records };
}

const pad = (n) => String(n).padStart(2, '0');

/** A believable day: cheap at night and around midday (solar), peaks in the morning and the evening. EUR/MWh. */
export function fakePrice(ms, tz, seed = 0) {
  const p = wallClock(ms, tz);
  const h = p.h + p.mi / 60;
  const day = Math.floor(ms / 86400_000) + seed;
  const wave = (c, w) => Math.exp(-(((h - c) / w) ** 2));
  const noise = Math.sin(day * 12.9898 + h * 3.1) * 6 + Math.sin(h * 7.3 + day) * 3;
  const tomorrowish = (day % 2) * 12;
  return Math.round((78 + 70 * wave(8, 1.6) + 120 * wave(19.5, 2) - 46 * wave(13, 2.4) - 22 * wave(3.5, 2.2) + noise + tomorrowish) * 100) / 100;
}

function window(url) {
  const q = url.searchParams;
  const parse = (v) => (v ? Date.parse(/Z|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`) : NaN);
  if (url.hostname.includes('energidataservice')) return [parse(q.get('start')), parse(q.get('end'))];
  if (url.hostname.includes('energy-charts')) return [parse(q.get('start')), parse(q.get('end')) + 60_000];
  if (url.hostname.includes('awattar')) return [Number(q.get('start')), Number(q.get('end'))];
  if (url.hostname.includes('elering')) return [parse(q.get('start')), parse(q.get('end')) + 1];
  if (url.hostname.includes('entsoe')) {
    const e = (v) => Date.parse(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(8, 10)}:${v.slice(10, 12)}Z`);
    return [e(q.get('periodStart')), e(q.get('periodEnd'))];
  }
  return [NaN, NaN];
}

function steps(from, to, min, published) {
  const out = [];
  for (let t = from; t < Math.min(to, published); t += min * 60000) out.push(t);
  return out;
}

const offsetIso = (ms, tz) => {
  const p = wallClock(ms, tz);
  const off = tzOffset(ms, tz) / 60000;
  const s = off >= 0 ? '+' : '-';
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:00.000${s}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
};

/** A fetch-like function for the price sources: { status, headers: { get }, text() }. */
export function fakePricesFetch(mode = '1', now = () => Date.now()) {
  return async (raw) => {
    const url = new URL(raw);
    const reply = (status, text, type = 'application/json') => ({
      status, ok: status >= 200 && status < 300, headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
      text: async () => (typeof text === 'string' ? text : JSON.stringify(text)),
    });
    if (mode === 'fail') return reply(503, { error: 'down' });
    // tomorrow is published at 13:00 Brussels time, or never with MARCO_PRICES_FAKE=today
    const n = now();
    // MARCO_PRICES_FAKE=all: tomorrow is always out (screenshots at any hour)
    const pub = mode === 'all' ? localMidnight(n, 'Europe/Brussels', 2) : mode === 'today' || n < localMidnight(n, 'Europe/Brussels') + 13 * 3600_000
      ? localMidnight(n, 'Europe/Brussels', 1)
      : localMidnight(n, 'Europe/Brussels', 2);
    const [from, to] = window(url);
    const host = url.hostname;
    if (host.includes('energidataservice') && url.pathname.includes('DatahubPricelist')) return reply(200, fakeDatahub(url));
    if (host.includes('energidataservice')) {
      const area = JSON.parse(url.searchParams.get('filter')).PriceArea[0];
      const z = PRICE_ZONES.find((x) => x.eds === area);
      return reply(200, {
        total: 0, dataset: 'DayAheadPrices',
        records: steps(from, to, 15, pub).map((t) => {
          const real = area === 'DK2' ? fixtures().dk2.get(t) : null;
          if (real) return { TimeUTC: real.TimeUTC, TimeDK: '', PriceArea: area, DayAheadPriceEUR: real.DayAheadPriceEUR, DayAheadPriceDKK: real.DayAheadPriceDKK };
          const eur = fakePrice(t, z.tz);
          return { TimeUTC: new Date(t).toISOString().slice(0, 19), TimeDK: '', PriceArea: area, DayAheadPriceEUR: eur, DayAheadPriceDKK: Math.round(eur * DKK_PER_EUR * 1000) / 1000 };
        }),
      });
    }
    if (host.includes('energy-charts')) {
      const z = PRICE_ZONES.find((x) => x.ec === url.searchParams.get('bzn'));
      const ts = steps(from, to, 15, pub);
      return reply(200, { license_info: 'CC BY 4.0', unix_seconds: ts.map((t) => t / 1000), price: ts.map((t) => fakePrice(t, z.tz, 3)), unit: 'EUR / MWh', deprecated: false });
    }
    if (host.includes('awattar')) {
      return reply(200, { object: 'list', data: steps(from, to, 60, pub).map((t) => ({ start_timestamp: t, end_timestamp: t + 3600_000, marketprice: fakePrice(t, 'Europe/Berlin', 5), unit: 'Eur/MWh' })) });
    }
    if (host.includes('elering')) {
      const data = {};
      for (const k of ['ee', 'fi', 'lv', 'lt']) data[k] = steps(from, to, 15, pub).map((t) => ({ timestamp: t / 1000, price: fakePrice(t, 'Europe/Tallinn', k.length) }));
      return reply(200, { success: true, data });
    }
    if (host.includes('ree.es')) {
      const q = url.searchParams;
      const s = Date.parse(`${q.get('start_date')}:00Z`);
      const e = Date.parse(`${q.get('end_date')}:00Z`);
      const a = localMidnight(s + 12 * 3600_000, 'Europe/Madrid');
      const b = localMidnight(e - 12 * 3600_000, 'Europe/Madrid', 1);
      const pvpcPub = mode === 'today' || n < localMidnight(n, 'Europe/Madrid') + 20.5 * 3600_000 ? localMidnight(n, 'Europe/Madrid', 1) : localMidnight(n, 'Europe/Madrid', 2);
      const series = (id, type, min, until, add) => ({
        type, id, attributes: { title: type, values: steps(a, b, min, until).map((t) => ({ value: Math.round((fakePrice(t, 'Europe/Madrid', 7) + add) * 100) / 100, percentage: 0.5, datetime: offsetIso(t, 'Europe/Madrid') })) },
      });
      return reply(200, { data: { type: 'Precios mercado peninsular en tiempo real', id: 'mer13', attributes: {} }, included: [series('1001', 'PVPC', 60, pvpcPub, 55), series('600', 'Precio mercado spot (€/MWh)', 15, pub, 0)] });
    }
    if (host.includes('omie')) {
      const day = /marginalpdbc_(\d{4})(\d\d)(\d\d)/.exec(url.searchParams.get('filename'));
      const start = localMidnight(Date.UTC(+day[1], +day[2] - 1, +day[3], 12), 'Europe/Madrid');
      if (start >= pub) return reply(404, 'Not found', 'text/html');
      const end = localMidnight(start + 12 * 3600_000, 'Europe/Madrid', 1);
      const lines = ['MARGINALPDBC;'];
      steps(start, end, 15, end).forEach((t, i) => {
        const v = fakePrice(t, 'Europe/Madrid', 9);
        lines.push(`${day[1]};${day[2]};${day[3]};${i + 1};${v};${v};`);
      });
      lines.push('*');
      return reply(200, lines.join('\n'), 'text/plain');
    }
    if (host.includes('spot-hinta')) {
      const z = priceZone(url.searchParams.get('region')) ?? priceZone('FI');
      const s = localMidnight(n, z.tz);
      return reply(200, steps(s, localMidnight(n, z.tz, 2), 15, pub).map((t, i) => ({ Rank: i + 1, DateTime: offsetIso(t, z.tz), PriceNoTax: fakePrice(t, z.tz, 11) / 1000, PriceWithTax: fakePrice(t, z.tz, 11) / 800 })));
    }
    if (host.includes('entsoe')) {
      const ts = steps(from, to, 15, pub);
      if (!ts.length) return reply(200, '<Acknowledgement_MarketDocument><Reason><text>No matching data found</text></Reason></Acknowledgement_MarketDocument>', 'text/xml');
      const pts = ts.map((t, i) => `<Point><position>${i + 1}</position><price.amount>${fakePrice(t, 'Europe/Oslo', 13)}</price.amount></Point>`).join('');
      const end = ts[ts.length - 1] + 15 * 60000;
      return reply(200, `<?xml version="1.0"?><Publication_MarketDocument><TimeSeries><Period><timeInterval><start>${new Date(ts[0]).toISOString().slice(0, 16)}Z</start><end>${new Date(end).toISOString().slice(0, 16)}Z</end></timeInterval><resolution>PT15M</resolution>${pts}</Period></TimeSeries></Publication_MarketDocument>`, 'text/xml');
    }
    return reply(404, 'unknown source', 'text/plain');
  };
}
