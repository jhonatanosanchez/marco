// The electricity price widget ('prices'): drawn by the display from GET /api/display/prices?zone= (the server
// fetches and caches the zone, server/prices.js). Placed by widgets/custom.ts like any widget: a corner, the side
// column or the whole screen (the 'widget' layout).
//
// Views (PriceWidgetOptions.view): 'now' (the price now, cheap / normal / expensive, next hour), 'chart' (bars from
// today 00:00, tomorrow added once published, now marked), 'cheap' (the cheapest stretches still ahead) and 'auto'
// (by place: corner = now, large corner or side = now + chart, full screen = everything).
// Every time is in the household's time zone (ctx.tz): on DST days the chart has 23 or 25 hours.
import type { DisplayWidget, PricesResponse, PriceWidgetOptions } from '../../shared/types';
import {
  cheapestWindows, hourly, levelLimits, levelOf, localMidnight, pricedSlots, priceUnit, priceZone, slotAt, trend, wallClock,
  widgetCurrency,
} from '../../../server/core/pricesCore.js';
import type { PricedSlot } from '../../../server/core/pricesCore.js';
import { LOCALES, formatHM } from '../../shared/i18n';
import { getJSON } from '../api';
import { ctx } from '../ctx';

const POLL_MS = 10 * 60_000;
const RETRY_MS = 60_000;
const SVG = 'http://www.w3.org/2000/svg';

// ------------------------------------------------------------------------------------------- data

interface Feed {
  subs: Set<(d: PricesResponse | null, failed: boolean) => void>;
  data: PricesResponse | null;
  failed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}
const feeds = new Map<string, Feed>();

/** Made-up prices for the demo when the server has none (?demo=1 without a server). */
function demoPrices(zone: string): PricesResponse {
  const tz = priceZone(zone)?.tz || ctx.tz;
  const start = localMidnight(Date.now(), tz, 0);
  const dkk = priceZone(zone)?.currency === 'DKK';
  const slots: PricesResponse['slots'] = [];
  for (let t = start; t < localMidnight(Date.now(), tz, 2); t += 15 * 60_000) {
    const p = wallClock(t, tz);
    const h = p.h + p.mi / 60;
    const g = (c: number, w: number) => Math.exp(-(((h - c) / w) ** 2));
    const eur = 80 + 70 * g(8, 1.6) + 120 * g(19.5, 2) - 46 * g(13, 2.4) - 22 * g(3.5, 2.2) + Math.sin(t / 3.7e6) * 5;
    slots.push(dkk ? [t / 1000, 15, eur, eur * 7.46] : [t / 1000, 15, eur]);
  }
  return { zone, currency: dkk ? 'DKK' : 'EUR', converted: false, source: 'demo', credit: 'Demo', fetchedAt: new Date().toISOString(), stale: false, error: null, slots };
}

async function poll(zone: string, f: Feed): Promise<void> {
  if (f.timer) clearTimeout(f.timer);
  f.timer = null;
  if (document.hidden) {
    document.addEventListener('visibilitychange', () => void poll(zone, f), { once: true });
    return;
  }
  let next = POLL_MS;
  try {
    f.data = await getJSON<PricesResponse>(`/api/display/prices?zone=${encodeURIComponent(zone)}`);
    f.failed = false;
  } catch {
    if (ctx.params.get('demo') === '1') f.data = demoPrices(zone);
    else {
      f.failed = true;
      next = f.data ? POLL_MS / 2 : RETRY_MS;
    }
  }
  if (feeds.get(zone) !== f) return;
  for (const cb of f.subs) cb(f.data, f.failed);
  f.timer = setTimeout(() => void poll(zone, f), next * (0.9 + Math.random() * 0.2));
}

/** Prices of `zone` for one widget: `cb` now (when known) and on every new answer. Returns the unsubscribe. */
function subscribe(zone: string, cb: Feed['subs'] extends Set<infer F> ? F : never): () => void {
  let f = feeds.get(zone);
  if (!f) {
    f = { subs: new Set(), data: null, failed: false, timer: null };
    feeds.set(zone, f);
    void poll(zone, f);
  } else if (f.data || f.failed) cb(f.data, f.failed);
  f.subs.add(cb);
  const feed = f;
  return () => {
    feed.subs.delete(cb);
    if (feed.subs.size) return;
    if (feed.timer) clearTimeout(feed.timer);
    feeds.delete(zone);
  };
}

// ------------------------------------------------------------------------------------------- drawing

export type PricePlace = 'corner' | 'side' | 'full';
type Mode = 'now' | 'nowchart' | 'chart' | 'cheap' | 'full';

/** What a widget shows where it is. */
export function priceMode(view: PriceWidgetOptions['view'], place: PricePlace, size: string): Mode {
  if (view === 'auto') return place === 'full' ? 'full' : place === 'side' || size === 'l' ? 'nowchart' : 'now';
  return view;
}

/** Font scale per place and size (1 = the side column's cards). */
const SCALE: Record<string, number> = { s: 0.82, m: 1, l: 1.18 };
/** Smallest scale a crowded card is shrunk to (side column, a shared corner); under it, the card is not shown. */
const FLOOR = 0.6;
/** The price-now card, in rem: its padding (fixed) and its content at scale 1 (measured: 3.2 + 13.3). */
const NOW_CARD_PAD_REM = 3.2;
const NOW_CARD_REM = 13.8;

/** Height (px) of the smallest price-now card: the room the side column keeps for one (custom.ts). */
export function priceFloorHeight(): number {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
  return (NOW_CARD_PAD_REM + NOW_CARD_REM * FLOOR) * rem + 2;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const TREND_PATH: Record<string, string> = {
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  flat: 'M5 12h14M13 6l6 6-6 6',
};
function arrow(dir: string): SVGSVGElement {
  const s = svg('svg', { viewBox: '0 0 24 24', class: `pw-trend pw-trend--${dir}`, 'aria-hidden': 'true' });
  s.appendChild(svg('path', { d: TREND_PATH[dir], fill: 'none', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return s;
}

interface Model {
  unit: { label: string; factor: number; decimals: number };
  fmt: Intl.NumberFormat;
  fmtShort: Intl.NumberFormat;
  /** what the chart draws, from today 00:00 */
  bars: PricedSlot[];
  hours: PricedSlot[];
  now: PricedSlot | null;
  nextHour: PricedSlot | null;
  /** what the trend arrow compares the price now with: the next hour, or the next quarter with quarter-hour bars */
  next: PricedSlot | null;
  /** cheap / expensive limits of today (the price now, today's bars) and of tomorrow (its bars) */
  limits: { low: number; high: number };
  limitsTomorrow: { low: number; high: number };
  todayStart: number;
  tomorrowStart: number;
  hasTomorrow: boolean;
  min: number;
  max: number;
}

export class PriceCard {
  readonly el: HTMLElement;
  private w: DisplayWidget;
  private data: PricesResponse | null = null;
  private failed = false;
  private unsub: (() => void) | null = null;
  private tick: ReturnType<typeof setTimeout> | null = null;
  private place: PricePlace = 'corner';
  private maxW = 0;
  private maxH = 0;
  private sig = '';
  /** called when the card first has prices, fails before having any, or turns stale / fresh */
  onState: ((s: 'ok' | 'stale' | 'failed') => void) | null = null;

  constructor(w: DisplayWidget) {
    this.w = w;
    this.el = el('div', 'uw-media pw');
  }

  get zone(): string {
    return this.w.prices?.zone ?? '';
  }

  start(): void {
    if (this.unsub) return;
    this.unsub = subscribe(this.zone, (d, failed) => {
      this.data = d;
      this.failed = failed;
      this.draw();
      this.onState?.(d ? (d.stale || failed ? 'stale' : 'ok') : 'failed');
    });
    this.minuteTick();
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
    if (this.tick) clearTimeout(this.tick);
    this.tick = null;
  }

  /** New options from the config (same zone: the widget's `v` changes with the zone). */
  update(w: DisplayWidget): void {
    this.w = w;
    this.draw();
  }

  /** Room the card may take (px) and where it is. */
  layout(maxW: number, maxH: number, place: PricePlace): void {
    this.maxW = Math.max(0, Math.floor(maxW));
    this.maxH = Math.max(0, Math.floor(maxH));
    this.place = place;
    this.draw();
  }

  get hasData(): boolean {
    return !!this.data?.slots.length;
  }

  private minuteTick(): void {
    const ms = 60_000 - (Date.now() % 60_000) + 200;
    this.tick = setTimeout(() => {
      this.draw(true);
      this.minuteTick();
    }, ms);
  }

  private model(now: number): Model | null {
    const d = this.data;
    const o = this.w.prices;
    if (!d || !o || !d.slots.length) return null;
    const currency = widgetCurrency(d.zone, o.currency) === 'EUR' ? 'EUR' : d.currency;
    const unit = priceUnit(currency, o.unit);
    const raw = d.slots.map(([t, m, eur, loc]) => ({ t: t * 1000, m, eur, loc }));
    const priced = pricedSlots(raw, { currency, surcharge: o.surcharge, vat: o.vat }).map((s) => ({ ...s, p: s.p * unit.factor }));
    const hours = hourly(priced);
    const todayStart = localMidnight(now, ctx.tz, 0);
    const tomorrowStart = localMidnight(now, ctx.tz, 1);
    const dayAfter = localMidnight(now, ctx.tz, 2);
    const src = o.resolution === 'quarter' ? priced : hours;
    const bars = src.filter((s) => s.t >= todayStart && s.t < dayAfter);
    const hasTomorrow = bars.some((s) => s.t >= tomorrowStart);
    const today = bars.filter((s) => s.t < tomorrowStart).map((s) => s.p);
    const tomorrow = bars.filter((s) => s.t >= tomorrowStart).map((s) => s.p);
    const all = bars.map((s) => s.p);
    const nowSlot = slotAt(o.resolution === 'quarter' ? priced : hours, now) ?? slotAt(priced, now);
    const curHour = slotAt(hours, now);
    const nextHour = curHour ? hours.find((s) => s.t === curHour.t + 3600_000) ?? null : null;
    const nowP = curHour && o.resolution !== 'quarter' ? curHour : nowSlot;
    const next = o.resolution === 'quarter' && nowP ? priced.find((s) => s.t === nowP.t + nowP.m * 60_000) ?? null : nextHour;
    const loc = LOCALES[ctx.lang] ?? 'es-ES';
    return {
      unit,
      fmt: new Intl.NumberFormat(loc, { minimumFractionDigits: unit.decimals, maximumFractionDigits: unit.decimals }),
      fmtShort: new Intl.NumberFormat(loc, { minimumFractionDigits: Math.max(0, unit.decimals - 1), maximumFractionDigits: Math.max(0, unit.decimals - 1) }),
      bars,
      hours,
      now: nowP,
      nextHour,
      next,
      limits: levelLimits(today.length ? today : all),
      limitsTomorrow: levelLimits(tomorrow.length ? tomorrow : all),
      todayStart,
      tomorrowStart,
      hasTomorrow,
      min: all.length ? Math.min(...all) : 0,
      max: all.length ? Math.max(...all) : 0,
    };
  }

  private hm(t: number): string {
    const p = wallClock(t, ctx.tz);
    const dt = ctx.cfg.datetime;
    return formatHM(p.h, p.mi, dt.format24 !== false, !!dt.showAmPm);
  }

  /** Draws again; on the minute tick only when something visible changed. */
  draw(tick = false): void {
    const now = Date.now();
    const o = this.w.prices;
    let mode = priceMode(o?.view ?? 'auto', this.place, this.w.size);
    // too little room for a chart (a crowded side column, a short corner): the price now only
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    const k = this.place === 'full' ? 1.9 : SCALE[this.w.size] ?? 1;
    const need = mode === 'nowchart' ? 22 : mode === 'chart' ? 16 : 0;
    if (this.place !== 'full' && need && this.maxH < need * rem * k) mode = 'now';
    const sig = JSON.stringify([this.data?.fetchedAt, this.data?.stale, this.failed, o, mode, this.maxW, this.maxH, this.w.name, this.w.size, ctx.lang, ctx.tz, Math.floor(now / (o?.resolution === 'quarter' ? 900_000 : 3600_000))]);
    if (tick && sig === this.sig) return;
    this.sig = sig;
    const m = this.model(now);
    const card = this.el;
    card.className = `uw-media pw pw--${mode} pw--${this.place} pw--${this.w.size}`;
    // full screen: the chart views fill it; a lone price or list is drawn larger, to read from across the room
    const pk = this.place === 'full' ? (mode === 'now' || mode === 'cheap' ? 2.6 : 1.9) : SCALE[this.w.size] ?? 1;
    card.style.setProperty('--pk', String(pk));
    card.replaceChildren();
    if (!m || !o) return;
    const lvl = m.now ? levelOf(m.now.p, m.limits) : 'mid';
    card.dataset.level = lvl;

    // sizes: the cards with a chart take the room they are given, the others fit their content
    const chart = mode === 'chart' || mode === 'nowchart' || mode === 'full';
    card.style.width = '';
    card.style.height = '';
    card.style.maxWidth = `${this.maxW}px`;
    card.style.maxHeight = `${this.maxH}px`;
    if (chart) {
      const w = this.place === 'corner' ? this.maxW : this.maxW;
      const h = this.place === 'full' ? this.maxH : Math.min(this.maxH, Math.round(w * (mode === 'nowchart' ? 0.66 : 0.52)));
      card.style.width = `${w}px`;
      card.style.height = `${h}px`;
    } else if (this.place === 'side') card.style.width = `${this.maxW}px`;

    card.appendChild(this.header(m, mode));
    if (mode === 'now') card.appendChild(this.nowBlock(m, lvl, true));
    if (mode === 'nowchart') card.appendChild(this.nowBlock(m, lvl, false));
    if (mode === 'full') {
      const top = el('div', 'pw-top');
      top.appendChild(this.nowBlock(m, lvl, true));
      top.appendChild(this.cheapBlock(m, now, 3));
      card.appendChild(top);
    }
    if (chart) {
      const box = el('div', 'pw-chart');
      card.appendChild(box);
      // measured once in the document
      requestAnimationFrame(() => this.chart(box, m, now));
    }
    if (mode === 'cheap') card.appendChild(this.cheapBlock(m, now, this.place === 'full' ? 4 : this.place === 'side' ? 3 : this.w.size === 's' ? 1 : this.w.size === 'm' ? 2 : 3));
    card.appendChild(this.footer(m, mode));
    if (this.place !== 'full') this.fit(pk);
  }

  /**
   * A card taller than its room (a crowded side column, a corner shared with other widgets) is drawn smaller, down to
   * FLOOR; with less room than that, nothing is shown rather than a sliver of card.
   */
  private fit(pk: number): void {
    const card = this.el;
    if (!card.isConnected || !this.maxH) return;
    let k = pk;
    const cs = getComputedStyle(card);
    // the padding does not scale
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + 2;
    for (let i = 0; i < 4 && card.scrollHeight > this.maxH + 2; i++) {
      const next = (k * Math.max(0, this.maxH - pad)) / Math.max(1, card.scrollHeight - pad) - 0.005;
      if (next < FLOOR) {
        card.classList.add('pw-cramped');
        return;
      }
      k = next;
      card.style.setProperty('--pk', k.toFixed(3));
    }
  }

  private title(): string {
    const n = this.w.name.trim();
    return n && n !== 'Widget' ? n : ctx.t('priceTitle');
  }

  private zoneLabel(): string {
    const z = this.zone;
    return z === 'ES-PVPC' ? 'PVPC' : z;
  }

  private header(m: Model, mode: Mode): HTMLElement {
    const h = el('div', 'pw-h');
    const title = el('span', 'pw-title', this.title());
    h.appendChild(title);
    h.appendChild(el('span', 'pw-zone', this.zoneLabel()));
    // the chart and the list carry the price now in their header
    if ((mode === 'chart' || mode === 'cheap') && m.now) {
      const v = el('span', 'pw-hnow');
      v.appendChild(el('b', '', m.fmt.format(m.now.p)));
      v.appendChild(el('span', 'pw-u', ` ${m.unit.label}`));
      h.appendChild(v);
    }
    return h;
  }

  private nowBlock(m: Model, lvl: string, withNext: boolean): HTMLElement {
    const b = el('div', 'pw-now');
    const row = el('div', 'pw-nowrow');
    row.appendChild(el('span', 'pw-val', m.now ? m.fmt.format(m.now.p) : '–'));
    row.appendChild(el('span', 'pw-unit', m.unit.label));
    if (m.now && m.next) row.appendChild(arrow(trend(m.now.p, m.next.p)));
    b.appendChild(row);
    const sub = el('div', 'pw-sub');
    const tag = el('span', `pw-level pw-level--${lvl}`, ctx.t(lvl === 'cheap' ? 'priceCheap' : lvl === 'high' ? 'priceHigh' : 'priceMid'));
    sub.appendChild(tag);
    if (withNext && m.nextHour) sub.appendChild(el('span', 'pw-next', ctx.t('priceNextHour', { p: m.fmt.format(m.nextHour.p) })));
    b.appendChild(sub);
    return b;
  }

  private cheapBlock(m: Model, now: number, count: number): HTMLElement {
    const hours = this.w.prices?.windowHours ?? 3;
    const list = cheapestWindows(m.hours, now, hours, count);
    const b = el('div', 'pw-cheap');
    b.appendChild(el('div', 'pw-cheap-h', ctx.t(hours === 1 ? 'priceCheapestHours' : 'priceCheapestStretches', { n: hours })));
    if (!list.length) {
      b.appendChild(el('div', 'pw-empty', ctx.t('priceNoneLeft')));
      return b;
    }
    const ol = el('ol', 'pw-cheap-list');
    for (const w of list) {
      // every window listed is one of the cheapest ahead: all drawn as cheap
      const li = el('li', 'pw-win pw-win--cheap');
      const when = el('span', 'pw-when');
      if (w.t >= m.tomorrowStart) when.appendChild(el('span', 'pw-day', ctx.t('tomorrow')));
      if (w.t <= now) when.appendChild(el('span', 'pw-day pw-day--now', ctx.t('now')));
      when.appendChild(document.createTextNode(ctx.t('priceRange', { a: this.hm(w.t), b: this.hm(w.end) })));
      li.appendChild(when);
      li.appendChild(el('span', 'pw-avg', m.fmt.format(w.p)));
      ol.appendChild(li);
    }
    b.appendChild(ol);
    return b;
  }

  private footer(m: Model, mode: Mode): HTMLElement {
    const f = el('div', 'pw-foot');
    if (mode !== 'now' && mode !== 'cheap' && m.bars.length) {
      f.appendChild(el('span', 'pw-range', ctx.t('priceMinMax', { a: m.fmtShort.format(m.min), b: m.fmtShort.format(m.max) })));
    }
    const credit = this.data?.credit;
    if (credit) f.appendChild(el('span', 'pw-credit', credit));
    return f;
  }

  /** The bars, drawn at the box's size in pixels (crisp text, no scaling). */
  private chart(box: HTMLElement, m: Model, now: number): void {
    if (!box.isConnected) return;
    const W = Math.floor(box.clientWidth);
    const H = Math.floor(box.clientHeight);
    if (W < 40 || H < 30) return;
    const fs = parseFloat(getComputedStyle(box).fontSize) || 12;
    const axisH = Math.round(fs * 1.7);
    const top = Math.round(fs * 0.5);
    const plotH = H - axisH - top;
    const bars = m.bars;
    if (!bars.length || plotH < 10) return;
    const start = m.todayStart;
    const end = bars[bars.length - 1].t + bars[bars.length - 1].m * 60_000;
    const span = Math.max(1, end - start);
    const x = (t: number) => ((t - start) / span) * W;
    const lo = Math.min(0, m.min);
    const hi = Math.max(m.max, lo + 1e-9);
    const y = (p: number) => top + plotH - ((p - lo) / (hi - lo)) * plotH;
    const zeroY = y(0);
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'pw-svg', 'aria-hidden': 'true' });
    const slotW = (15 * 60_000 / span) * W;
    const gapFrac = slotW * (bars[0].m / 15) > 6 ? 0.22 : 0.08;
    // tomorrow: a light band behind and a divider
    if (m.hasTomorrow) {
      const tx = x(m.tomorrowStart);
      s.appendChild(svg('rect', { x: tx, y: 0, width: W - tx, height: top + plotH, class: 'pw-tmw' }));
      s.appendChild(svg('line', { x1: tx, x2: tx, y1: 0, y2: top + plotH, class: 'pw-div' }));
    }
    for (const b of bars) {
      const x0 = x(b.t);
      const w = Math.max(1, x(b.t + b.m * 60_000) - x0);
      const g = w * gapFrac;
      const yv = y(b.p);
      const y0 = Math.min(yv, zeroY);
      const h = Math.max(1, Math.abs(zeroY - yv));
      const past = b.t + b.m * 60_000 <= now;
      const cur = b.t <= now && now < b.t + b.m * 60_000;
      const r = Math.min((w - g) / 2, fs * 0.25);
      s.appendChild(svg('rect', {
        x: x0 + g / 2, y: y0, width: Math.max(1, w - g), height: h, rx: r, ry: r,
        class: `pw-bar pw-bar--${levelOf(b.p, b.t >= m.tomorrowStart ? m.limitsTomorrow : m.limits)}${past ? ' is-past' : ''}${cur ? ' is-now' : ''}`,
      }));
    }
    // now: a thin line over the plot and a dot on top of the current bar
    const nx = x(now);
    if (nx >= 0 && nx <= W) {
      s.appendChild(svg('line', { x1: nx, x2: nx, y1: top - fs * 0.2, y2: top + plotH, class: 'pw-nowline' }));
      const cur = slotAt(bars, now);
      if (cur) s.appendChild(svg('circle', { cx: nx, cy: Math.max(fs * 0.35, Math.min(y(cur.p), zeroY) - fs * 0.55), r: fs * 0.3, class: 'pw-nowdot' }));
    }
    if (lo < 0) s.appendChild(svg('line', { x1: 0, x2: W, y1: zeroY, y2: zeroY, class: 'pw-zero' }));
    // hour labels: every 6 hours (3 on wide charts with only today), tomorrow's name after the divider
    const step = m.hasTomorrow || W < fs * 26 ? 6 : 3;
    const ay = H - fs * 0.35;
    const dayLabel = ctx.t('tomorrow');
    const h24 = ctx.cfg.datetime.format24 !== false;
    // the day's name takes the place of the hours right after midnight
    const dayEnd = m.hasTomorrow ? x(m.tomorrowStart) + fs * (0.4 + dayLabel.length * 0.62 + 0.8) : -1;
    for (let t = start; t < end; t += 3600_000) {
      const p = wallClock(t, ctx.tz);
      if (p.mi !== 0 || p.h % step !== 0) continue;
      if (m.hasTomorrow && t === m.tomorrowStart) continue;
      const lx = x(t);
      if (lx > W - fs * 1.4) continue;
      if (lx >= x(m.tomorrowStart) && lx < dayEnd) continue;
      const tx = svg('text', { x: lx, y: ay, class: 'pw-ax' });
      // the household's clock: 00 06 12 18, or 12a 6a 12p 6p
      tx.textContent = h24 ? String(p.h).padStart(2, '0') : `${p.h % 12 || 12}${p.h < 12 ? 'a' : 'p'}`;
      s.appendChild(tx);
    }
    if (m.hasTomorrow) {
      const tx = svg('text', { x: x(m.tomorrowStart) + fs * 0.4, y: ay, class: 'pw-ax pw-ax--day' });
      tx.textContent = dayLabel;
      s.appendChild(tx);
    }
    box.replaceChildren(s);
  }
}
