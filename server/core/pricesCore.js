// Electricity prices (the 'prices' widget): the pure part. Zones, the free sources that publish each zone's day-ahead
// price, how to ask them, how to read their answers, and the price math the screens and the admin share. No network,
// no files, no clock (callers pass `now`): server/prices.js fetches and caches, the display draws.
//
// Every source is read into the same slots: { t (start, ms UTC), m (minutes: 15, 30 or 60), eur (EUR/MWh),
// loc (local currency/MWh, only where the zone has one) }. Answers are always read on UTC instants (or on the source's
// own offsets), never on local wall times: the autumn DST day repeats 02:00 and the spring one skips it.
//
// Licences (checked 2026-10): Energi Data Service CC BY 4.0 (credit Energinet); Energy-Charts CC BY 4.0 from SMARD for
// a list of zones only, the others are for private use (so only on a self-hosted server, `privateUse`); ENTSO-E needs
// the household's own free token. Elering, Red Eléctrica, OMIE, aWATTar and spot-hinta.fi publish without a key.

/** Sources in the order they are tried (zoneSources), with the credit the widget shows. */
export const PRICE_SOURCES = {
  eds: { name: 'Energi Data Service', credit: 'Energinet', url: 'https://www.energidataservice.dk/' },
  elering: { name: 'Elering', credit: 'Elering', url: 'https://dashboard.elering.ee/' },
  ree: { name: 'Red Eléctrica (REData)', credit: 'Red Eléctrica', url: 'https://www.ree.es/es/datos/apidatos' },
  omie: { name: 'OMIE', credit: 'OMIE', url: 'https://www.omie.es/' },
  energycharts: { name: 'Energy-Charts', credit: 'Energy-Charts / SMARD', url: 'https://www.energy-charts.info/' },
  awattar: { name: 'aWATTar', credit: 'aWATTar', url: 'https://www.awattar.de/' },
  entsoe: { name: 'ENTSO-E Transparency', credit: 'ENTSO-E', url: 'https://transparency.entsoe.eu/', token: true },
  spothinta: { name: 'spot-hinta.fi', credit: 'spot-hinta.fi', url: 'https://spot-hinta.fi/' },
};

/** Danish krone per euro when no source gives the rate (the krone is pegged to the euro, ERM II central rate). */
export const DKK_PER_EUR = 7.46038;

const Z = (id, countries, area, tz, eic, src = {}) => ({ id, countries, area, tz, eic, currency: 'EUR', ...src });
/**
 * Bidding zones a widget can show. `countries` (ISO 3166) groups them in the admin, `area` is the zone's own name
 * where a country has several. `ec` = Energy-Charts zone (`ecOpen` when it is CC BY), `eds` = Energi Data Service area,
 * `elering` = its key, `awattar` = 'de' | 'at', `omie` = 'ES' | 'PT', `ree` = REE series ('spot' | 'pvpc'),
 * `spothinta` = its region.
 */
export const PRICE_ZONES = [
  Z('AT', ['AT'], '', 'Europe/Vienna', '10YAT-APG------L', { ec: 'AT', ecOpen: true, awattar: 'at' }),
  Z('BE', ['BE'], '', 'Europe/Brussels', '10YBE----------2', { ec: 'BE', ecOpen: true }),
  Z('BG', ['BG'], '', 'Europe/Sofia', '10YCA-BULGARIA-R', { ec: 'BG' }),
  Z('CH', ['CH'], '', 'Europe/Zurich', '10YCH-SWISSGRIDZ', { ec: 'CH', ecOpen: true }),
  Z('CZ', ['CZ'], '', 'Europe/Prague', '10YCZ-CEPS-----N', { ec: 'CZ', ecOpen: true }),
  Z('DE-LU', ['DE', 'LU'], '', 'Europe/Berlin', '10Y1001A1001A82H', { ec: 'DE-LU', ecOpen: true, awattar: 'de', eds: 'DE' }),
  { ...Z('DK1', ['DK'], 'Vest (Jylland, Fyn)', 'Europe/Copenhagen', '10YDK-1--------W', { eds: 'DK1', ec: 'DK1', ecOpen: true, spothinta: 'DK1' }), currency: 'DKK' },
  { ...Z('DK2', ['DK'], 'Øst (Sjælland, København)', 'Europe/Copenhagen', '10YDK-2--------M', { eds: 'DK2', ec: 'DK2', ecOpen: true, spothinta: 'DK2' }), currency: 'DKK' },
  Z('EE', ['EE'], '', 'Europe/Tallinn', '10Y1001A1001A39I', { elering: 'ee', ec: 'EE', spothinta: 'EE' }),
  Z('ES', ['ES'], 'Mercado mayorista', 'Europe/Madrid', '10YES-REE------0', { ree: 'spot', omie: 'ES', ec: 'ES' }),
  Z('ES-PVPC', ['ES'], 'PVPC', 'Europe/Madrid', '', { ree: 'pvpc' }),
  Z('FI', ['FI'], '', 'Europe/Helsinki', '10YFI-1--------U', { elering: 'fi', ec: 'FI', spothinta: 'FI' }),
  Z('FR', ['FR'], '', 'Europe/Paris', '10YFR-RTE------C', { ec: 'FR', ecOpen: true }),
  Z('GR', ['GR'], '', 'Europe/Athens', '10YGR-HTSO-----Y', { ec: 'GR' }),
  Z('HR', ['HR'], '', 'Europe/Zagreb', '10YHR-HEP------M', { ec: 'HR' }),
  Z('HU', ['HU'], '', 'Europe/Budapest', '10YHU-MAVIR----U', { ec: 'HU', ecOpen: true }),
  Z('IE-SEM', ['IE'], 'SEM', 'Europe/Dublin', '10Y1001A1001A59C', { ec: 'IE(SEM)' }),
  Z('IT-North', ['IT'], 'Nord', 'Europe/Rome', '10Y1001A1001A73I', { ec: 'IT-North', ecOpen: true }),
  Z('IT-Centre-North', ['IT'], 'Centro-Nord', 'Europe/Rome', '10Y1001A1001A70O', { ec: 'IT-Centre-North' }),
  Z('IT-Centre-South', ['IT'], 'Centro-Sud', 'Europe/Rome', '10Y1001A1001A71M', { ec: 'IT-Centre-South' }),
  Z('IT-South', ['IT'], 'Sud', 'Europe/Rome', '10Y1001A1001A788', { ec: 'IT-South' }),
  Z('IT-Calabria', ['IT'], 'Calabria', 'Europe/Rome', '10Y1001C--00096J', { ec: 'IT-Calabria' }),
  Z('IT-Sicily', ['IT'], 'Sicilia', 'Europe/Rome', '10Y1001A1001A75E', { ec: 'IT-Sicily' }),
  Z('IT-Sardinia', ['IT'], 'Sardegna', 'Europe/Rome', '10Y1001A1001A74G', { ec: 'IT-Sardinia' }),
  Z('LT', ['LT'], '', 'Europe/Vilnius', '10YLT-1001A0008Q', { elering: 'lt', ec: 'LT', spothinta: 'LT' }),
  Z('LV', ['LV'], '', 'Europe/Riga', '10YLV-1001A00074', { elering: 'lv', ec: 'LV', spothinta: 'LV' }),
  Z('ME', ['ME'], '', 'Europe/Podgorica', '10YCS-CG-TSO---S', { ec: 'ME' }),
  Z('NL', ['NL'], '', 'Europe/Amsterdam', '10YNL----------L', { ec: 'NL', ecOpen: true }),
  Z('NO1', ['NO'], 'Øst (Oslo)', 'Europe/Oslo', '10YNO-1--------2', { ec: 'NO1', spothinta: 'NO1' }),
  Z('NO2', ['NO'], 'Sør (Kristiansand)', 'Europe/Oslo', '10YNO-2--------T', { eds: 'NO2', ec: 'NO2', ecOpen: true, spothinta: 'NO2' }),
  Z('NO3', ['NO'], 'Midt (Trondheim)', 'Europe/Oslo', '10YNO-3--------J', { ec: 'NO3', spothinta: 'NO3' }),
  Z('NO4', ['NO'], 'Nord (Tromsø)', 'Europe/Oslo', '10YNO-4--------9', { ec: 'NO4', spothinta: 'NO4' }),
  Z('NO5', ['NO'], 'Vest (Bergen)', 'Europe/Oslo', '10Y1001A1001A48H', { ec: 'NO5', spothinta: 'NO5' }),
  Z('PL', ['PL'], '', 'Europe/Warsaw', '10YPL-AREA-----S', { ec: 'PL', ecOpen: true }),
  Z('PT', ['PT'], '', 'Europe/Lisbon', '10YPT-REN------W', { omie: 'PT', ec: 'PT' }),
  Z('RO', ['RO'], '', 'Europe/Bucharest', '10YRO-TEL------P', { ec: 'RO' }),
  Z('RS', ['RS'], '', 'Europe/Belgrade', '10YCS-SERBIATSOV', { ec: 'RS' }),
  Z('SE1', ['SE'], 'Luleå', 'Europe/Stockholm', '10Y1001A1001A44P', { ec: 'SE1', spothinta: 'SE1' }),
  Z('SE2', ['SE'], 'Sundsvall', 'Europe/Stockholm', '10Y1001A1001A45N', { ec: 'SE2', spothinta: 'SE2' }),
  Z('SE3', ['SE'], 'Stockholm', 'Europe/Stockholm', '10Y1001A1001A46L', { eds: 'SE3', ec: 'SE3', spothinta: 'SE3' }),
  Z('SE4', ['SE'], 'Malmö', 'Europe/Stockholm', '10Y1001A1001A47J', { eds: 'SE4', ec: 'SE4', ecOpen: true, spothinta: 'SE4' }),
  Z('SI', ['SI'], '', 'Europe/Ljubljana', '10YSI-ELES-----O', { ec: 'SI', ecOpen: true }),
  Z('SK', ['SK'], '', 'Europe/Bratislava', '10YSK-SEPS-----K', { ec: 'SK' }),
];
export const PRICE_ZONE_IDS = PRICE_ZONES.map((z) => z.id);
const ZONES = new Map(PRICE_ZONES.map((z) => [z.id, z]));
export const priceZone = (id) => ZONES.get(id) ?? null;

/** A guess for a new widget: the zone of the household's time zone, else Denmark East. */
const TZ_ZONE = {
  'Europe/Copenhagen': 'DK2', 'Europe/Madrid': 'ES-PVPC', 'Atlantic/Canary': 'ES-PVPC', 'Europe/Lisbon': 'PT', 'Europe/Oslo': 'NO1',
  'Europe/Stockholm': 'SE3', 'Europe/Berlin': 'DE-LU', 'Europe/Luxembourg': 'DE-LU', 'Europe/Rome': 'IT-North',
};
export function zoneForTimeZone(tz) {
  if (TZ_ZONE[tz]) return TZ_ZONE[tz];
  const z = PRICE_ZONES.find((x) => x.tz === tz && !x.area);
  return z ? z.id : 'DK2';
}

/**
 * Sources for a zone, in the order they are tried. `privateUse` (self-hosted server: one household) adds the
 * Energy-Charts zones published for private use only, and spot-hinta.fi (no published terms); `token` = an ENTSO-E
 * token is saved. Marco Cloud passes privateUse false.
 */
export function zoneSources(zone, { privateUse = false, token = false } = {}) {
  const z = typeof zone === 'string' ? priceZone(zone) : zone;
  if (!z) return [];
  const out = [];
  if (z.eds && (z.eds !== 'DE')) out.push('eds');
  if (z.elering) out.push('elering');
  if (z.ree) out.push('ree');
  if (z.omie) out.push('omie');
  if (z.ec && z.ecOpen) out.push('energycharts');
  if (z.awattar) out.push('awattar');
  if (z.eds === 'DE') out.push('eds');
  if (token && z.eic) out.push('entsoe');
  if (privateUse && z.ec && !z.ecOpen) out.push('energycharts');
  if (privateUse && z.spothinta) out.push('spothinta');
  return out;
}

// ------------------------------------------------------------------------------------------- time zones

const dtfCache = new Map();
function dtf(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}
/** Wall clock of `ms` in `tz`: { y, mo, d, h, mi }. */
export function wallClock(ms, tz) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(new Date(ms))) p[type] = +value;
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}
/** Offset of `tz` from UTC at `ms`, in ms. */
export function tzOffset(ms, tz) {
  const p = wallClock(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - (ms - (((ms % 1000) + 1000) % 1000));
}
/** The instant of local midnight in `tz`, `days` days after the local day of `ms`. */
export function localMidnight(ms, tz, days = 0) {
  const p = wallClock(ms, tz);
  const guess = Date.UTC(p.y, p.mo - 1, p.d + days);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return t;
}
/** The instant of local `hh:mm` in `tz` on the local day of `ms` (+ `days`). */
export function localTime(ms, tz, hh, mm, days = 0) {
  const p = wallClock(ms, tz);
  const guess = Date.UTC(p.y, p.mo - 1, p.d + days, hh, mm);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return t;
}
const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' of `ms` in `tz`. */
export function localDay(ms, tz) {
  const p = wallClock(ms, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}
/** 'HH:MM' of `ms` in `tz`. */
export function localHM(ms, tz) {
  const p = wallClock(ms, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

// ------------------------------------------------------------------------------------------- requests

/**
 * Time window a fetch asks for: from 3 h before today's local midnight in the zone to 3 h after the end of tomorrow
 * (a household a time zone behind or ahead of its bidding zone, such as the Canary Islands on a Spanish zone, still
 * gets its own whole days).
 */
export function fetchWindow(zone, now) {
  const z = typeof zone === 'string' ? priceZone(zone) : zone;
  const tz = z?.tz || 'Europe/Brussels';
  return { from: localMidnight(now, tz, 0) - 3 * 3600_000, to: localMidnight(now, tz, 2) + 3 * 3600_000, tz };
}

const isoMin = (ms) => new Date(ms).toISOString().slice(0, 16);
const entsoeTime = (ms) => new Date(ms).toISOString().slice(0, 16).replace(/[-T:]/g, '');

/**
 * The requests that fetch `zone` from `source` for `win` (fetchWindow): [{ url, kind, day? }]. `token` = ENTSO-E
 * token. OMIE publishes one file per day (two requests; tomorrow's may not exist yet).
 */
export function sourceRequests(source, zone, win, { token = '' } = {}) {
  const z = typeof zone === 'string' ? priceZone(zone) : zone;
  if (!z) return [];
  const { from, to } = win;
  switch (source) {
    case 'eds': {
      const filter = encodeURIComponent(JSON.stringify({ PriceArea: [z.eds] }));
      return [{ url: `https://api.energidataservice.dk/dataset/DayAheadPrices?start=${isoMin(from)}&end=${isoMin(to)}&timezone=UTC&filter=${filter}&sort=TimeUTC%20asc&limit=1000` }];
    }
    case 'energycharts':
      return [{ url: `https://api.energy-charts.info/price?bzn=${encodeURIComponent(z.ec)}&start=${isoMin(from)}Z&end=${isoMin(to - 60_000)}Z` }];
    case 'awattar':
      return [{ url: `https://api.awattar.${z.awattar}/v1/marketdata?start=${from}&end=${to}` }];
    case 'elering':
      return [{ url: `https://dashboard.elering.ee/api/nps/price?start=${new Date(from).toISOString()}&end=${new Date(to - 1).toISOString()}` }];
    case 'ree': {
      // local Madrid wall times; the answer carries offsets
      const a = wallClock(from + 3 * 3600_000, 'Europe/Madrid');
      // Madrid's own two days: further ahead is never published yet
      const b = wallClock(to - 3 * 3600_000 - 60_000, 'Europe/Madrid');
      const s = `${a.y}-${pad(a.mo)}-${pad(a.d)}T00:00`;
      const e = `${b.y}-${pad(b.mo)}-${pad(b.d)}T23:59`;
      return [{ url: `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${s}&end_date=${e}&time_trunc=hour` }];
    }
    case 'omie': {
      const out = [];
      for (let d = 0; d < 2; d++) {
        const day = localDay(localMidnight(from + 3 * 3600_000, 'Europe/Madrid', d) + 3600_000, 'Europe/Madrid');
        out.push({ url: `https://www.omie.es/es/file-download?parents=marginalpdbc&filename=marginalpdbc_${day.replace(/-/g, '')}.1`, day, optional: d > 0 });
      }
      return out;
    }
    case 'spothinta':
      return [{ url: `https://api.spot-hinta.fi/TodayAndDayForward?region=${encodeURIComponent(z.spothinta)}` }];
    case 'entsoe':
      if (!token || !z.eic) return [];
      return [{
        url: `https://web-api.tp.entsoe.eu/api?securityToken=${encodeURIComponent(token)}&documentType=A44&in_Domain=${z.eic}&out_Domain=${z.eic}&contract_MarketAgreement.type=A01&periodStart=${entsoeTime(from)}&periodEnd=${entsoeTime(to)}`,
        secret: true,
      }];
    default:
      return [];
  }
}

// ------------------------------------------------------------------------------------------- parsers

export class PriceParseError extends Error {
  constructor(msg) {
    super(msg);
    this.code = 'bad_response';
  }
}
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);
/** Plausible day-ahead prices (EUR/MWh): the market caps are -500 and 4000; anything far outside is a bad answer. */
const sane = (x) => Number.isFinite(x) && x > -2000 && x < 20000;

/**
 * Sorted, de-duplicated slots; `m` from the spacing of the starts where the source does not say (15, 30 or 60),
 * else `defMin`. The last slot takes the one before it.
 */
export function normalizeSlots(list, defMin = 15) {
  const byT = new Map();
  for (const s of list) {
    if (!s || !Number.isFinite(s.t) || !sane(s.eur)) continue;
    if (!byT.has(s.t)) byT.set(s.t, s);
  }
  const sorted = [...byT.values()].sort((a, b) => a.t - b.t);
  let last = defMin;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if ([15, 30, 60].includes(s.m)) {
      last = s.m;
      continue;
    }
    const gap = i + 1 < sorted.length ? (sorted[i + 1].t - s.t) / 60000 : 0;
    s.m = [15, 30, 60].includes(gap) ? gap : last;
    last = s.m;
  }
  // a slot that starts inside the one before it (two series at different resolutions) is dropped
  const out = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (prev && s.t < prev.t + prev.m * 60000) continue;
    out.push(s);
  }
  return out.map((s) => (s.loc != null && Number.isFinite(s.loc) ? { t: s.t, m: s.m, eur: s.eur, loc: s.loc } : { t: s.t, m: s.m, eur: s.eur }));
}

function json(body) {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    throw new PriceParseError('not JSON');
  }
}

/** Energi Data Service DayAheadPrices: { records: [{ TimeUTC, DayAheadPriceEUR, DayAheadPriceDKK }] }. */
export function parseEds(body, zone) {
  const d = json(body);
  if (!d || !Array.isArray(d.records)) throw new PriceParseError('no records');
  const dkk = zone?.currency === 'DKK';
  return normalizeSlots(d.records.map((r) => ({
    t: Date.parse(`${String(r.TimeUTC).replace(/Z$/, '')}Z`),
    eur: num(r.DayAheadPriceEUR),
    loc: dkk ? num(r.DayAheadPriceDKK) : null,
  })));
}

/** Energy-Charts /price: { unix_seconds: [], price: [] }. */
export function parseEnergyCharts(body) {
  const d = json(body);
  if (!d || !Array.isArray(d.unix_seconds) || !Array.isArray(d.price)) throw new PriceParseError('no prices');
  return normalizeSlots(d.unix_seconds.map((s, i) => ({ t: s * 1000, eur: num(d.price[i]) })));
}

/** aWATTar /v1/marketdata: { data: [{ start_timestamp, end_timestamp, marketprice }] } (Eur/MWh, hourly). */
export function parseAwattar(body) {
  const d = json(body);
  if (!d || !Array.isArray(d.data)) throw new PriceParseError('no data');
  return normalizeSlots(d.data.map((r) => ({ t: num(r.start_timestamp), m: (num(r.end_timestamp) - num(r.start_timestamp)) / 60000, eur: num(r.marketprice) })), 60);
}

/** Elering /api/nps/price: { data: { ee: [{ timestamp, price }], fi, lv, lt } }. */
export function parseElering(body, zone) {
  const d = json(body);
  const list = d?.data?.[zone?.elering];
  if (!Array.isArray(list)) throw new PriceParseError('zone missing');
  return normalizeSlots(list.map((r) => ({ t: num(r.timestamp) * 1000, eur: num(r.price) })));
}

/** REData precios-mercados-tiempo-real: series 600 (spot, 15 min) and 1001 (PVPC, hourly), datetimes with offset. */
export function parseRee(body, zone) {
  const d = json(body);
  if (!d || !Array.isArray(d.included)) throw new PriceParseError('no series');
  const pvpc = zone?.ree === 'pvpc';
  const s = d.included.find((x) => String(x.id) === (pvpc ? '1001' : '600'))
    ?? d.included.find((x) => (pvpc ? /pvpc/i : /spot/i).test(String(x.type ?? x.attributes?.title ?? '')));
  const values = s?.attributes?.values;
  if (!Array.isArray(values)) throw new PriceParseError('series missing');
  return normalizeSlots(values.map((v) => ({ t: Date.parse(v.datetime), eur: num(v.value) })), pvpc ? 60 : 15);
}

/**
 * OMIE marginalpdbc_YYYYMMDD: "YYYY;MM;DD;period;PT;ES;" lines, periods numbered from local midnight in Madrid
 * (92, 96 or 100 quarter hours; 23, 24 or 25 hours in older files). The column is the zone's ('PT' or 'ES').
 */
export function parseOmie(body, zone) {
  if (typeof body !== 'string' || !/MARGINALPDBC/i.test(body)) throw new PriceParseError('not a marginalpdbc file');
  const rows = [];
  for (const line of body.split(/\r?\n/)) {
    const f = line.split(';');
    if (f.length < 6 || !/^\d{4}$/.test(f[0])) continue;
    rows.push({ y: +f[0], mo: +f[1], d: +f[2], p: +f[3], pt: num(f[4]), es: num(f[5]) });
  }
  if (!rows.length) throw new PriceParseError('no periods');
  const out = [];
  const days = new Map();
  for (const r of rows) {
    const k = `${r.y}-${r.mo}-${r.d}`;
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(r);
  }
  for (const list of days.values()) {
    const { y, mo, d } = list[0];
    const start = localMidnight(Date.UTC(y, mo - 1, d, 12), 'Europe/Madrid');
    const n = Math.max(...list.map((r) => r.p));
    if (n > 100) throw new PriceParseError('unexpected period count');
    // quarter hours since the 15-minute auction (1 October 2025), hours before
    const m = n > 25 || Date.UTC(y, mo - 1, d) >= Date.UTC(2025, 9, 1) ? 15 : 60;
    for (const r of list) out.push({ t: start + (r.p - 1) * m * 60000, m, eur: zone?.omie === 'PT' ? r.pt : r.es });
  }
  return normalizeSlots(out);
}

/** spot-hinta.fi TodayAndDayForward: [{ DateTime (with offset), PriceNoTax (EUR/kWh) }]. */
export function parseSpotHinta(body) {
  const d = json(body);
  if (!Array.isArray(d)) throw new PriceParseError('no list');
  return normalizeSlots(d.map((r) => ({ t: Date.parse(r.DateTime), eur: num(r.PriceNoTax) * 1000 })));
}

const PT_MIN = { PT15M: 15, PT30M: 30, PT60M: 60 };
/**
 * ENTSO-E A44 Publication_MarketDocument (XML). Curve type A03: a position whose price did not change is left out,
 * so each gap repeats the price before it. Only the day-ahead auction (contract type A01, when the series says): the
 * intraday auctions are A44 documents too. Several TimeSeries may cover the same time (some zones publish the day at
 * 60 and at 15 minutes): the finest resolution wins, then the first series.
 */
export function parseEntsoe(body) {
  if (typeof body !== 'string') throw new PriceParseError('not XML');
  if (/Acknowledgement_MarketDocument/.test(body)) {
    const reason = /<text>([^<]*)<\/text>/.exec(body)?.[1] ?? '';
    // "No matching data found": not published yet
    if (/no matching data/i.test(reason)) return [];
    throw new PriceParseError(reason || 'acknowledgement');
  }
  if (!/Publication_MarketDocument/.test(body)) throw new PriceParseError('not a price document');
  const series = [];
  for (const ts of body.split(/<TimeSeries>/).slice(1)) {
    const contract = /<contract_MarketAgreement\.type>([^<]*)<\/contract_MarketAgreement\.type>/.exec(ts)?.[1]?.trim();
    if (contract && contract !== 'A01') continue;
    const out = [];
    for (const per of ts.split(/<Period>/).slice(1)) {
      const start = Date.parse(/<timeInterval>\s*<start>([^<]+)<\/start>/.exec(per)?.[1] ?? '');
      const end = Date.parse(/<end>([^<]+)<\/end>/.exec(per)?.[1] ?? '');
      const m = PT_MIN[/<resolution>([^<]+)<\/resolution>/.exec(per)?.[1] ?? ''];
      if (!Number.isFinite(start) || !Number.isFinite(end) || !m) continue;
      const pts = new Map();
      for (const p of per.matchAll(/<Point>\s*<position>(\d+)<\/position>\s*<price\.amount>([^<]+)<\/price\.amount>/g)) pts.set(+p[1], num(p[2]));
      const n = Math.round((end - start) / 60000 / m);
      let prev = NaN;
      for (let i = 1; i <= n; i++) {
        if (pts.has(i)) prev = pts.get(i);
        if (Number.isFinite(prev)) out.push({ t: start + (i - 1) * m * 60000, m, eur: prev });
      }
    }
    series.push(out);
  }
  // finest first; a slot inside one already taken is left out
  const minM = (list) => Math.min(...list.map((s) => s.m), 999);
  series.sort((a, b) => minM(a) - minM(b));
  const taken = [];
  const all = [];
  for (const list of series) {
    for (const s of list) {
      const end = s.t + s.m * 60000;
      if (taken.some(([a, b]) => s.t < b && a < end)) continue;
      all.push(s);
    }
    for (const s of list) taken.push([s.t, s.t + s.m * 60000]);
  }
  return normalizeSlots(all);
}

const PARSERS = { eds: parseEds, energycharts: parseEnergyCharts, awattar: parseAwattar, elering: parseElering, ree: parseRee, omie: parseOmie, spothinta: parseSpotHinta, entsoe: parseEntsoe };
/** Slots from one answer of `source` for `zone`. Throws PriceParseError on an answer that cannot be read. */
export function parseSource(source, body, zone) {
  const z = typeof zone === 'string' ? priceZone(zone) : zone;
  const f = PARSERS[source];
  if (!f) throw new PriceParseError('unknown source');
  return f(body, z);
}

/**
 * Local-currency prices where the zone has its own currency and the source gave none: the rate seen in `ref` slots
 * (Energi Data Service gives both), else the peg. Returns { slots, converted }.
 */
export function withLocal(slots, zone, ref = []) {
  const z = typeof zone === 'string' ? priceZone(zone) : zone;
  if (!z || z.currency === 'EUR') return { slots: slots.map(({ loc, ...s }) => s), converted: false };
  if (slots.every((s) => s.loc != null)) return { slots, converted: false };
  const pairs = [...slots, ...ref].filter((s) => s.loc != null && Math.abs(s.eur) > 1);
  const rate = pairs.length ? pairs.reduce((n, s) => n + s.loc / s.eur, 0) / pairs.length : DKK_PER_EUR;
  const r = rate > 6 && rate < 9 ? rate : DKK_PER_EUR;
  return { slots: slots.map((s) => (s.loc != null ? s : { ...s, loc: Math.round(s.eur * r * 1000) / 1000 })), converted: true };
}

// ------------------------------------------------------------------------------------------- refresh

/**
 * When the next results are expected: [hh, mm, time zone]. The day-ahead auction is run on Brussels time for every
 * zone (results ~12:45 CET); PVPC is published in the evening, Madrid time.
 */
export const publishTime = (zone) => (zone?.ree === 'pvpc' ? [20, 30, 'Europe/Madrid'] : [12, 50, 'Europe/Brussels']);

/** End of the last slot (ms), or 0. */
export const slotsEnd = (slots) => (slots.length ? slots[slots.length - 1].t + slots[slots.length - 1].m * 60000 : 0);

/**
 * When to ask again after a good answer (ms): tomorrow's prices come out after the auction (~13:00 CET), so until
 * they are in, every 20 minutes from then; once they are in, at the next day's publication; otherwise at least every
 * 6 hours (late corrections), and every 30 minutes while not even today's prices are there.
 */
export function nextRefreshAt(slots, zone, now) {
  const z = typeof zone === 'string' ? priceZone(zone) : zone;
  const tz = z?.tz || 'Europe/Brussels';
  const [hh, mm, ptz] = publishTime(z);
  const end = slotsEnd(slots);
  const haveNow = slots.some((s) => s.t <= now && now < s.t + s.m * 60000);
  if (!haveNow) return now + 30 * 60_000;
  const haveTomorrow = end >= localMidnight(now, tz, 2) - 60 * 60_000;
  const pubToday = localTime(now, ptz, hh, mm);
  if (haveTomorrow) return Math.min(localTime(now, ptz, hh, mm, 1), now + 6 * 3600_000);
  if (now >= pubToday) return now + (now - pubToday < 4 * 3600_000 ? 20 : 60) * 60_000;
  return Math.min(pubToday, now + 6 * 3600_000);
}

/** Wait after the n-th failure in a row (ms): 2, 5, 15, 30, then 60 minutes. */
export const failureBackoff = (n) => [2, 5, 15, 30, 60][Math.min(Math.max(n, 1), 5) - 1] * 60_000;

/** Seconds of a Retry-After header (seconds or an HTTP date), capped at an hour; null when absent. */
export function retryAfterMs(v, now = Date.now()) {
  if (v == null || v === '') return null;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.min(3600, Math.max(1, s)) * 1000;
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.min(3600_000, Math.max(1000, d - now)) : null;
}

// ------------------------------------------------------------------------------------------- price math

export const PRICE_VIEWS = ['auto', 'chart', 'now', 'cheap'];
export const PRICE_UNITS = ['main', 'sub'];
export const PRICE_RESOLUTIONS = ['hour', 'quarter'];
export const MAX_VAT = 50;
export const MIN_SURCHARGE = -10;
export const MAX_SURCHARGE = 100;

/**
 * What the household pays per kWh (in the main unit: EUR, DKK): the market price per kWh plus `surcharge` (fixed
 * per kWh: grid fees, taxes, the supplier's margin), then `vat` percent on the whole.
 */
export function finalPrice(perMwh, { surcharge = 0, vat = 0 } = {}) {
  return (perMwh / 1000 + (Number(surcharge) || 0)) * (1 + (Number(vat) || 0) / 100);
}

/** Currency a widget shows: the zone's own when there is one and the widget does not ask for euros. */
export const widgetCurrency = (zone, opt = 'auto') => (opt === 'EUR' ? 'EUR' : (typeof zone === 'string' ? priceZone(zone) : zone)?.currency || 'EUR');

/** Slots with `p` = final price per kWh in `currency`. */
export function pricedSlots(slots, { currency = 'EUR', surcharge = 0, vat = 0 } = {}) {
  return slots.map((s) => ({ t: s.t, m: s.m, p: finalPrice(currency !== 'EUR' && s.loc != null ? s.loc : s.eur, { surcharge, vat }) }));
}

/** Averages per hour (time-weighted; hourly sources pass through). On the autumn DST day an hour repeats: 25 hours. */
export function hourly(slots) {
  const out = [];
  let cur = null;
  for (const s of slots) {
    const h = Math.floor(s.t / 3600_000) * 3600_000;
    if (!cur || cur.t !== h) {
      cur = { t: h, m: 60, sum: 0, w: 0 };
      out.push(cur);
    }
    const w = Math.min(s.m, 60);
    cur.sum += s.p * w;
    cur.w += w;
  }
  return out.map((h) => ({ t: h.t, m: 60, p: h.sum / h.w }));
}

/** The slot that covers `now`, or null. */
export const slotAt = (slots, now) => slots.find((s) => s.t <= now && now < s.t + s.m * 60000) ?? null;

/**
 * Cheap / normal / expensive limits for a set of prices: the lower and upper thirds. A flat day (spread under 5 %)
 * is all normal.
 */
export function levelLimits(prices) {
  const v = prices.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { low: -Infinity, high: Infinity };
  const q = (f) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))];
  const spread = v[v.length - 1] - v[0];
  if (spread <= Math.abs(v[Math.floor(v.length / 2)]) * 0.05) return { low: -Infinity, high: Infinity };
  return { low: q(1 / 3), high: q(2 / 3) };
}
export const levelOf = (p, { low, high }) => (p <= low ? 'cheap' : p >= high ? 'high' : 'mid');

/**
 * The cheapest stretches of `hours` hours that start from the current hour on (hourly slots), at most `count`, not
 * overlapping, in time order: [{ t, end, p (average) }].
 */
export function cheapestWindows(hourSlots, now, hours = 3, count = 3) {
  const from = Math.floor(now / 3600_000) * 3600_000;
  const list = hourSlots.filter((s) => s.t >= from);
  const cands = [];
  for (let i = 0; i + hours <= list.length; i++) {
    let ok = true;
    let sum = 0;
    for (let k = 0; k < hours; k++) {
      if (list[i + k].t !== list[i].t + k * 3600_000) {
        ok = false;
        break;
      }
      sum += list[i + k].p;
    }
    if (ok) cands.push({ t: list[i].t, end: list[i].t + hours * 3600_000, p: sum / hours });
  }
  cands.sort((a, b) => a.p - b.p || a.t - b.t);
  const out = [];
  for (const c of cands) {
    if (out.length >= count) break;
    if (out.some((o) => c.t < o.end && o.t < c.end)) continue;
    out.push(c);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** 'up' | 'down' | 'flat' from `a` to `b` (flat under 2 % of the larger one, or under 0.001). */
export function trend(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'flat';
  const d = b - a;
  if (Math.abs(d) < Math.max(0.001, Math.max(Math.abs(a), Math.abs(b)) * 0.02)) return 'flat';
  return d > 0 ? 'up' : 'down';
}

/** Unit label and factor: main unit (€/kWh, kr/kWh) or the hundredth (c/kWh, øre/kWh). */
export function priceUnit(currency, unit = 'main') {
  const sub = unit === 'sub';
  if (currency === 'DKK') return { label: sub ? 'øre/kWh' : 'kr/kWh', factor: sub ? 100 : 1, decimals: sub ? 0 : 2 };
  return { label: sub ? 'c/kWh' : '€/kWh', factor: sub ? 100 : 1, decimals: sub ? 1 : 3 };
}

// ------------------------------------------------------------------------------------------- one refresh round
// Shared by every runtime: the caller passes `call(source, req)` (its own network, rate limits and size cap) and keeps
// the entries where it wants (server/prices.js: memory; Marco Cloud: the Workers cache).

/** A failure with a code; the routes answer only the code (details go to the log). */
export class PricesError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

/** Last prices are stale once a refresh has failed and they are this old. */
export const STALE_AFTER_MS = 3 * 3600_000;

/**
 * Slots of `zone` from one source: `call(source, req)` answers { status, text } or throws a PricesError.
 * Throws a PricesError when the source has nothing usable for now.
 */
export async function fromSource(source, zone, now, { call, token = '' }) {
  const win = fetchWindow(zone, now);
  const reqs = sourceRequests(source, zone, win, { token });
  if (!reqs.length) throw new PricesError('not_configured');
  const all = [];
  for (const req of reqs) {
    const { status, text } = await call(source, req);
    if (status === 404 && req.optional) continue; // OMIE: tomorrow's file is not out yet
    if (status === 401 || status === 403) throw new PricesError('http_denied');
    if (status < 200 || status >= 300) throw new PricesError('http_error', `HTTP ${status}`);
    try {
      all.push(...parseSource(source, text, zone));
    } catch (err) {
      throw new PricesError('bad_response', err.message);
    }
  }
  const slots = all.filter((s) => s.t >= win.from && s.t < win.to).sort((a, b) => a.t - b.t);
  if (!slotAt(slots, now)) throw new PricesError('no_data');
  return slots;
}

/**
 * One refresh of `zoneId`: its sources in order until one answers. Returns the new entry { slots, source, converted,
 * fetchedAt, nextAt, fails, error }: the fresh prices, or `prev` kept with the error and a backoff.
 * `privateUse` / `token`: zoneSources. `log(message)` gets each source's failure.
 */
export async function refreshZone(zoneId, prev, { now, call, token = '', privateUse = false, log = () => {} }) {
  const zone = priceZone(zoneId);
  if (!zone) throw new PricesError('invalid_zone');
  const sources = zoneSources(zone, { privateUse, token: Boolean(token) });
  let lastErr = new PricesError('no_source');
  for (const source of sources) {
    try {
      const raw = await fromSource(source, zone, now, { call, token });
      const { slots, converted } = withLocal(raw, zone, prev?.slots ?? []);
      return { slots, source, converted, fetchedAt: now, nextAt: nextRefreshAt(slots, zone, now), fails: 0, error: null };
    } catch (err) {
      lastErr = err instanceof PricesError ? err : new PricesError('fetch_failed', err?.message);
      log(`${zoneId} from ${source}: ${lastErr.code}${lastErr.message !== lastErr.code ? ` (${lastErr.message})` : ''}`);
    }
  }
  const fails = (prev?.fails ?? 0) + 1;
  return prev?.slots?.length
    ? { ...prev, fails, error: lastErr.code, nextAt: now + failureBackoff(fails) }
    : { slots: [], source: null, converted: false, fetchedAt: 0, nextAt: now + failureBackoff(fails), fails, error: lastErr.code };
}

/** True when `e` should be refreshed now (`force`: the admin's test, at most once a minute). */
export const refreshDue = (e, now, force = false) => !e || now >= e.nextAt || (force && now - (e.fetchedAt || 0) > 60_000);

const round3 = (x) => Math.round(x * 1000) / 1000;
/**
 * What the screens get for an entry (GET /api/display/prices): { zone, currency, converted, source, credit, fetchedAt,
 * stale, error, slots: [[t (s), minutes, EUR/MWh, local/MWh?]] }. Throws a PricesError when there are no prices.
 */
export function pricesResponse(zoneId, e, now) {
  const zone = priceZone(zoneId);
  if (!zone) throw new PricesError('invalid_zone');
  if (!e?.slots?.length) throw new PricesError(e?.error || 'no_data');
  const covers = !!slotAt(e.slots, now);
  return {
    zone: zone.id,
    currency: zone.currency,
    converted: e.converted,
    source: e.source,
    credit: PRICE_SOURCES[e.source]?.credit ?? '',
    fetchedAt: new Date(e.fetchedAt).toISOString(),
    stale: !covers || (e.fails > 0 && now - e.fetchedAt > STALE_AFTER_MS),
    error: e.error,
    slots: e.slots.map((s) => (s.loc != null ? [s.t / 1000, s.m, round3(s.eur), round3(s.loc)] : [s.t / 1000, s.m, round3(s.eur)])),
  };
}

/** ENTSO-E security tokens (a UUID in practice). */
export const ENTSOE_TOKEN_RE = /^[A-Za-z0-9-]{20,64}$/;
/** Whether a token is saved and its last 4 characters, never the token. */
export function entsoeTokenStatus(token) {
  const k = String(token || '');
  return { set: k.length > 0, hint: k.length >= 8 ? k.slice(-4) : '' };
}

/**
 * Tries an ENTSO-E token once (Germany, today) through `call`: true, false (refused) or null (could not tell).
 */
export async function checkEntsoeToken(token, { now, call }) {
  const zone = priceZone('DE-LU');
  const [req] = sourceRequests('entsoe', zone, fetchWindow(zone, now), { token });
  try {
    const { status, text } = await call('entsoe', req);
    if (status === 401 || status === 403) return false;
    if (status !== 200) return /not authorized|invalid.*token/i.test(text) ? false : null;
    parseSource('entsoe', text, zone);
    return true;
  } catch {
    return null;
  }
}
