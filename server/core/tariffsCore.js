// Grid tariffs and time bands for the electricity price widget: the pure part, next to pricesCore.js. No network, no
// files, no clock (callers pass `now`): server/tariffs.js fetches and caches the Danish tariffs, the display and the
// admin add them to the market price.
//
// What a household pays per kWh: (market + grid tariff or time band + fixed extra) * (1 + VAT). Two ways to get the
// middle part:
// - Denmark ('grid'): the household's grid company (netselskab) publishes an hourly tariff in Energinet's DataHub
//   (dataset DatahubPricelist on Energi Data Service, no key, CC BY 4.0). Marco adds the company's household (C)
//   tariff, Energinet's transmission and system tariffs and the electricity tax (elafgift), all per hour.
// - Anywhere ('bands'): up to 4 time bands the household types in, each with a price per kWh, the hours of a working
//   day, optionally other hours on weekends and holidays (Spain 2.0TD: punta, llano, valle).
//
// DatahubPricelist (checked 2026-10): prices are DKK/kWh without VAT. Price{n} is Danish wall-clock hour n-1, so
// Price18 is 17:00 to 18:00. 'P1D' and 'P1M' records only fill Price1, for the whole day. ValidFrom/ValidTo are Danish
// wall times, ValidTo is exclusive and null means open-ended. The autumn DST day has no Price25: both 02:00 hours use
// Price3; the spring day skips Price3.
import { localDay, localMidnight, wallClock } from './pricesCore.js';

export const DATAHUB_TZ = 'Europe/Copenhagen';
export const DATAHUB_CREDIT = 'Energinet DataHub';
/** Energinet: transmission and system tariffs and the electricity tax, the same for every household. */
export const ENERGINET_GLN = '5790000432752';
export const ENERGINET_CODES = { transmission: '40000', system: '41000', tax: 'EA-001' };

const G = (id, name, zone, gln, codes) => ({ id, name, zone, gln, codes });
/**
 * Danish grid companies and the charge codes of their household (C) tariff, summed (discount codes are negative).
 * Checked hour by hour against Strømligning for 2026-10-13. NKE-Elnet and Videbæk Elnet are not in DataHub.
 */
export const DK_GRID_COMPANIES = [
  G('aal', 'Aal El-Net', 'DK1', '5790001095451', ['AAL-NT-05', 'AAL-NT-12', 'AAL-NTR05', 'AAL-NTR12']),
  G('cerius', 'Cerius', 'DK2', '5790000705184', ['30TR_C_ET', '30RE_C_ET']),
  G('dinel', 'Dinel', 'DK1', '5790000610099', ['TCL>100_02']),
  G('kongerslev', 'El-net Kongerslev (N1 016)', 'DK1', '5790002502699', ['C-Tarif']),
  G('elektrus', 'Elektrus', 'DK2', '5790000836239', ['6000091']),
  G('elinord', 'Elinord', 'DK1', '5790001095277', ['43300']),
  G('elnet-midt', 'Elnet Midt', 'DK1', '5790001100520', ['T3001']),
  G('flow', 'FLOW Elnet', 'DK1', '5790000392551', ['FE1 NT-01']),
  G('forsyning', 'Forsyning Elnet', 'DK1', '5790001088309', ['STR-NT-03', 'STR-NT-02']),
  G('grindsted', 'Grindsted Elnet', 'DK1', '5790000681105', ['GEV-NT-01', 'GEV-NTR01']),
  G('hammel', 'Hammel Elforsyning Net', 'DK1', '5790001090166', ['C-Tarif', '50001']),
  G('hjerting', 'Hjerting Transformatorforening', 'DK1', '5790001095376', ['C-Tarif']),
  G('hurup', 'Hurup Elværk Net', 'DK1', '5790000610839', ['HEV-NT-01T']),
  G('ikast', 'Ikast El Net', 'DK1', '5790000682102', ['IEV-NT-01']),
  G('kimbrer', 'Kimbrer Elnet', 'DK1', '5790001095239', ['C-Tarif']),
  G('konstant-151', 'Konstant Net (151)', 'DK1', '5790000704842', ['C_FBTNTR_B', 'C_FBTNTR_R']),
  G('konstant-245', 'Konstant Net (245)', 'DK1', '5790000683345', ['C_FBTNTR_B', 'C_FBTNTR_R']),
  G('l-net', 'L-Net', 'DK1', '5790001090111', ['3000']),
  G('laeso', 'Læsø Elnet', 'DK1', '5790001103460', ['43100']),
  G('midtfyns', 'Midtfyns Elforsyning', 'DK1', '5790001089023', ['TNT15000']),
  G('n1-131', 'N1 (131)', 'DK1', '5790001089030', ['CD']),
  G('n1-344', 'N1 (344)', 'DK1', '5790000611003', ['T-C-F-T-TD']),
  G('elvaerk', 'Netselskabet Elværk', 'DK1', '5790000681358', ['5NCFF', '5RCFF']),
  G('noe', 'NOE Net', 'DK1', '5790000395620', ['30030']),
  G('nord-energi', 'Nord Energi Net', 'DK1', '5790000610877', ['TAC']),
  G('radius', 'Radius Elnet', 'DK2', '5790000705689', ['DT_C_01']),
  G('rah', 'RAH Net', 'DK1', '5790000681327', ['RAH-C']),
  G('ravdex', 'Ravdex', 'DK1', '5790000836727', ['NT-C', 'NTB60']),
  G('sunds', 'Sunds Net', 'DK1', '5790001095444', ['SEF-NT-05', 'SEF-NT-05R']),
  G('tarm', 'Tarm Elværk Net', 'DK1', '5790000706419', ['TEV-NT-01T', 'TEV-NT-01R']),
  G('trefor', 'TREFOR El-net', 'DK1', '5790000392261', ['C']),
  G('trefor-ost', 'TREFOR El-net Øst', 'DK2', '5790000706686', ['46']),
  G('veksel', 'Veksel', 'DK1', '5790001088217', ['NT-01']),
  G('vores', 'Vores Elnet', 'DK1', '5790000610976', ['TNT1009']),
  G('zeanet', 'Zeanet', 'DK2', '5790001089375', ['43110']),
];
export const GRID_IDS = DK_GRID_COMPANIES.map((c) => c.id);
const BY_ID = new Map(DK_GRID_COMPANIES.map((c) => [c.id, c]));
export const gridCompany = (id) => BY_ID.get(id) ?? null;
/** Zones with grid companies to pick from. */
export const GRID_ZONES = ['DK1', 'DK2'];

export const TARIFF_MODES = ['none', 'grid', 'bands'];
/** PVPC already includes the tolls and charges: time bands would count them twice. */
export const BANDS_EXCLUDED_ZONES = ['ES-PVPC'];

/**
 * How a widget's tariff applies to its zone: 'grid' (a company of the same zone), 'bands' (not on PVPC) or 'none'.
 * A choice that does not fit the zone (picked before the zone was changed) counts as none.
 */
export function tariffMode(o) {
  if (!o) return 'none';
  if (o.tariff === 'grid') return gridCompany(o.grid)?.zone === o.zone ? 'grid' : 'none';
  if (o.tariff === 'bands') return !BANDS_EXCLUDED_ZONES.includes(o.zone) && o.bands?.list?.length ? 'bands' : 'none';
  return 'none';
}

// ------------------------------------------------------------------------------------------- DataHub requests

const COLUMNS = ['GLN_Number', 'ChargeType', 'ChargeTypeCode', 'ValidFrom', 'ValidTo', 'ResolutionDuration', ...Array.from({ length: 24 }, (_, i) => `Price${i + 1}`)];

function pricelistUrl(glns, codes, end, limit) {
  const filter = encodeURIComponent(JSON.stringify({ GLN_Number: glns, ChargeTypeCode: codes }));
  return `https://api.energidataservice.dk/dataset/DatahubPricelist?filter=${filter}&end=${end}&sort=ValidFrom%20desc&limit=${limit}&columns=${COLUMNS.join(',')}`;
}

/**
 * The requests for one company: one per tariff code (a code with records of a few days, Aal or Hurup, would push a
 * code that has run for years out of a shared answer), and Energinet's (shared by every company, its own cache
 * entry). `end` filters on ValidFrom: everything that starts before the day after tomorrow, newest first (never
 * `start`: records in force today may have started years ago).
 */
export function datahubRequests(company, now) {
  const end = localDay(localMidnight(now, DATAHUB_TZ, 3) + 3600_000, DATAHUB_TZ);
  const c = typeof company === 'string' ? gridCompany(company) : company;
  return {
    company: c ? c.codes.map((code) => ({ code, url: pricelistUrl([c.gln], [code], end, 20) })) : [],
    energinet: { url: pricelistUrl([ENERGINET_GLN], Object.values(ENERGINET_CODES), end, 30) },
  };
}

export class TariffParseError extends Error {
  constructor(msg) {
    super(msg);
    this.code = 'bad_response';
  }
}

/** A Danish wall time 'YYYY-MM-DDTHH:MM:SS' as a "naive" ms (the wall clock read as if it were UTC). */
const naive = (s) => (typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s) ? Date.parse(`${s.slice(0, 19)}Z`) : NaN);
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);

/**
 * DatahubPricelist answer → tariff records { gln, code, from, to (naive ms; to = Infinity when open), daily, prices
 * (24 numbers, or 1 for a daily price) }. Only tariffs (D03); codes trimmed (a stale record has leading spaces);
 * records with no price are left out. A record of another resolution (PT15M: none yet, and the dataset has only
 * Price1..Price24) is kept as `unknown`: the hours it covers have no known tariff, rather than an older record's.
 */
export function parseDatahub(body) {
  let d = body;
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      throw new TariffParseError('not JSON');
    }
  }
  if (!d || !Array.isArray(d.records)) throw new TariffParseError('no records');
  const out = [];
  for (const r of d.records) {
    if (!r || (r.ChargeType && r.ChargeType !== 'D03')) continue;
    const from = naive(r.ValidFrom);
    const to = r.ValidTo == null ? Infinity : naive(r.ValidTo);
    if (!Number.isFinite(from) || Number.isNaN(to) || to <= from) continue;
    const res = String(r.ResolutionDuration || 'PT1H');
    const daily = res === 'P1D' || res === 'P1M';
    const gln = String(r.GLN_Number ?? '').trim();
    const code = String(r.ChargeTypeCode ?? '').trim();
    if (!daily && res !== 'PT1H') {
      out.push({ gln, code, from, to, daily: false, prices: [], unknown: true });
      continue;
    }
    const prices = daily ? [num(r.Price1)] : Array.from({ length: 24 }, (_, i) => num(r[`Price${i + 1}`]));
    // an hourly record with gaps takes Price1 for the missing hours (some companies fill only the first)
    if (!Number.isFinite(prices[0])) continue;
    for (let i = 1; i < prices.length; i++) if (!Number.isFinite(prices[i])) prices[i] = prices[0];
    if (prices.some((p) => Math.abs(p) > 50)) continue;
    out.push({ gln, code, from, to, daily, prices });
  }
  return out;
}

/** How long past its end a record is carried forward when nothing newer is published (estimated). */
export const CARRY_FORWARD_MS = 31 * 86400_000;

/**
 * The value of one charge at a Danish wall-clock hour (`at`: naive ms of the hour's start): the record in force (the
 * latest ValidFrom when several cover it). None in force: the last one that ended before (published only until
 * New Year, for example), for up to 31 days, flagged estimated; an ended discount (a negative price) is not carried:
 * 0, estimated. { value, estimated } or null when the charge is unknown (never published, ended longer ago, or a
 * resolution Marco cannot read).
 */
export function chargeAt(records, gln, code, at) {
  let best = null;
  let last = null;
  for (const r of records) {
    if (r.gln !== gln || r.code !== code) continue;
    if (r.from <= at && at < r.to) {
      if (!best || r.from > best.from) best = r;
    } else if (r.to <= at && (!last || r.to > last.to || (r.to === last.to && r.from > last.from))) last = r;
  }
  const r = best ?? last;
  if (!r || r.unknown) return null;
  const h = new Date(at).getUTCHours();
  const value = r.daily ? r.prices[0] : r.prices[h];
  if (best) return { value, estimated: false };
  if (at - r.to > CARRY_FORWARD_MS) return null;
  return { value: value < 0 ? 0 : value, estimated: true };
}

/**
 * Per hour from `from` to `to` (ms UTC, whole hours): { t, grid (the company's codes), net (Energinet transmission +
 * system), tax (elafgift), est (some charge carried forward) }, DKK/kWh without VAT. `grid` is null when any of the
 * company's codes is unknown that hour, `net` and `tax` when any of Energinet's is: a part left out would show a
 * price too low. Hours are read on the Danish wall clock: both 02:00 of the autumn DST day take Price3.
 */
export function gridHours(company, companyRecords, energinetRecords, from, to) {
  const c = typeof company === 'string' ? gridCompany(company) : company;
  const out = [];
  if (!c) return out;
  for (let t = Math.floor(from / 3600_000) * 3600_000; t < to; t += 3600_000) {
    const w = wallClock(t, DATAHUB_TZ);
    const at = Date.UTC(w.y, w.mo - 1, w.d, w.h);
    let grid = 0;
    let est = false;
    for (const code of c.codes) {
      const v = chargeAt(companyRecords, c.gln, code, at);
      if (!v) {
        grid = null;
        break;
      }
      grid += v.value;
      est ||= v.estimated;
    }
    const e = (code) => {
      const v = chargeAt(energinetRecords, ENERGINET_GLN, code, at);
      if (v?.estimated) est = true;
      return v ? v.value : null;
    };
    const tr = e(ENERGINET_CODES.transmission);
    const sy = e(ENERGINET_CODES.system);
    const tax = e(ENERGINET_CODES.tax);
    const known = tr != null && sy != null && tax != null;
    out.push({ t, grid, net: known ? tr + sy : null, tax: known ? tax : null, est });
  }
  return out;
}

// ------------------------------------------------------------------------------------------- time bands

export const MAX_BANDS = 4;
export const MAX_BAND_PRICE = 10;
export const MIN_BAND_PRICE = -10;
export const BAND_NAME_MAX = 24;
export const HOLIDAY_SETS = ['none', 'ES'];
/**
 * Spain: the national holidays with a fixed date that a region cannot move (CNMC Circular 3/2020: all of them are
 * valley hours, as is 6 January). Good Friday, regional and local holidays and Monday make-up days are not.
 */
export const ES_NATIONAL_HOLIDAYS = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];

const hoursOf = (spec) => {
  // spec: { index: [[from, to], ...] }, every hour 0..23 once
  const a = new Array(24).fill(0);
  for (const [i, ranges] of Object.entries(spec)) for (const [f, t] of ranges) for (let h = f; h < t; h++) a[h] = Number(i);
  return a;
};
/**
 * Presets: the hours of a tariff, the prices left to the household (0 until typed). Spain 2.0TD (CNMC Circular
 * 3/2020, since June 2021): punta 10-14 and 18-22, llano 8-10, 14-18 and 22-24, valle 0-8 on working days; all day
 * valle on weekends and national holidays. Ceuta and Melilla one hour later.
 */
export const BAND_PRESETS = {
  'es-20td': {
    names: ['Punta', 'Llano', 'Valle'],
    weekday: hoursOf({ 0: [[10, 14], [18, 22]], 1: [[8, 10], [14, 18], [22, 24]], 2: [[0, 8]] }),
    weekend: new Array(24).fill(2),
    holidays: 'ES',
  },
  'es-20td-cm': {
    names: ['Punta', 'Llano', 'Valle'],
    weekday: hoursOf({ 0: [[11, 15], [19, 23]], 1: [[8, 11], [15, 19], [23, 24]], 2: [[0, 8]] }),
    weekend: new Array(24).fill(2),
    holidays: 'ES',
  },
};
export const BAND_PRESET_IDS = ['', ...Object.keys(BAND_PRESETS)];

/** An empty custom set: one band all day. */
export const emptyBands = () => ({ preset: '', list: [{ name: '', price: 0 }], weekday: new Array(24).fill(0), weekend: null, holidays: 'none' });

/** A preset's hours and names; prices kept from `prev` band by band where there were some. */
export function presetBands(id, prev = null) {
  const p = BAND_PRESETS[id];
  if (!p) return emptyBands();
  return {
    preset: id,
    list: p.names.map((name, i) => ({ name, price: prev?.list?.[i]?.price ?? 0 })),
    weekday: [...p.weekday],
    weekend: p.weekend ? [...p.weekend] : null,
    holidays: p.holidays,
  };
}

const pad = (n) => String(n).padStart(2, '0');
/** Whether a local date is a holiday of the set ('ES': Spain's national fixed-date holidays). */
export function isHoliday(set, mo, d) {
  return set === 'ES' && ES_NATIONAL_HOLIDAYS.includes(`${pad(mo)}-${pad(d)}`);
}

/**
 * The band index at `ms` in the household's time zone: the weekend hours on Saturdays, Sundays and the holidays of
 * the set (when the bands have weekend hours), the working-day hours otherwise.
 */
export function bandIndexAt(bands, ms, tz) {
  const w = wallClock(ms, tz);
  const dow = new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay();
  const off = dow === 0 || dow === 6 || isHoliday(bands.holidays, w.mo, w.d);
  const hours = off && Array.isArray(bands.weekend) ? bands.weekend : bands.weekday;
  const i = hours?.[w.h] ?? 0;
  return i >= 0 && i < (bands.list?.length ?? 0) ? i : 0;
}

/** The band price at `ms` (main unit per kWh, before VAT). */
export const bandPriceAt = (bands, ms, tz) => Number(bands?.list?.[bandIndexAt(bands, ms, tz)]?.price) || 0;

// ------------------------------------------------------------------------------------------- price parts

/**
 * Per-kWh parts of a price, in the main unit of the widget: market, grid (company), net (Energinet), tax, band,
 * extra (the fixed surcharge), vat (the amount), total = (all before VAT) * (1 + VAT %).
 */
export function priceParts(market, { grid = 0, net = 0, tax = 0, band = 0, extra = 0, vat = 0 } = {}) {
  const before = market + grid + net + tax + band + extra;
  const v = (before * (Number(vat) || 0)) / 100;
  return { market, grid, net, tax, band, extra, vat: v, total: before + v };
}

/**
 * The function that gives, for a slot start (ms), what a widget adds per kWh before VAT on top of the market and the
 * fixed extra, in `currency` ('DKK' or 'EUR': Danish tariffs are in kroner and are converted at `dkkPerEur`), and its
 * parts. `gridList`: the server's [[t (s), grid, net, tax, est]] for the zone. Returns null when nothing applies.
 */
export function tariffAdder(o, { gridList = null, tz, currency = 'EUR', dkkPerEur = 7.46038 } = {}) {
  const mode = tariffMode(o);
  if (mode === 'bands') {
    return (t) => {
      const band = bandPriceAt(o.bands, t, tz);
      return { add: band, band, grid: 0, net: 0, tax: 0, est: false };
    };
  }
  if (mode === 'grid' && gridList?.length) {
    const k = currency === 'DKK' ? 1 : 1 / dkkPerEur;
    const byHour = new Map(gridList.map(([t, grid, net, tax, est]) => [t * 1000, { grid: (grid ?? 0) * k, net: net * k, tax: tax * k, est: !!est }]));
    return (t) => {
      const h = byHour.get(Math.floor(t / 3600_000) * 3600_000);
      if (!h) return null;
      return { add: h.grid + h.net + h.tax, band: 0, ...h };
    };
  }
  return null;
}
