// Month / week grid: huge thin day numbers, lane-allocated event chips and continuous multi-day bars.
import { addDays, diffDays, monthName, startOfWeek, weekdayNames, weekdayOfKey } from '../../shared/i18n';
import { chipColors } from '../color';
import { ctx } from '../ctx';
import { esc, reconcile, setHTML, type Spec } from '../dom';
import { type NEvent, sortForDay, timeLabel } from '../eventModel';
import type { Tick } from '../time';

interface Placed {
  e: NEvent;
  /** 0-based half-day slots within the week [s, eSlot) (14 slots per week) */
  s: number;
  eSlot: number;
  lane: number;
  contL: boolean;
  contR: boolean;
  /** lanes spanned (P1a: single-day chips with a long title may grow into free lanes below and wrap) */
  span?: number;
  /** title still longer than the lines available → slightly smaller font */
  long?: boolean;
}

/** Text width measurement (canvas, cached context) used to decide which chips deserve a second line. */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, px: number, weight: number): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return text.length * px * 0.55;
  measureCtx.font = `${weight} ${px}px 'Inter Variable', Inter, system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}

export class MonthCalendar {
  readonly root: HTMLElement;
  private head: HTMLElement;
  private dow: HTMLElement;
  private weeks: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('cal');
    root.innerHTML = `<div class="cal-head"><div class="cal-title"></div><div class="legend"></div></div>
      <div class="cal-dow"></div><div class="cal-weeks"></div>`;
    this.head = root.querySelector('.cal-head')!;
    this.dow = root.querySelector('.cal-dow')!;
    this.weeks = root.querySelector('.cal-weeks')!;
  }

  render(events: NEvent[], tick: Tick): void {
    const { cfg, lang, tz, t } = ctx;
    const c = cfg.calendar;
    const isWeek = c.view === 'week';
    const nWeeks = isWeek ? 1 : c.weeks;
    const wantL = Math.max(1, isWeek ? Math.min(14, c.maxEventsPerDay * 3) : c.maxEventsPerDay);
    this.root.classList.toggle('is-week', isWeek);
    const L = Math.max(1, Math.min(wantL, this.lanesThatFit(nWeeks)));
    const today = tick.dayKey;
    const nowMs = tick.now.getTime();
    const gridStart = startOfWeek(today, c.weekStart);
    this.root.style.setProperty('--weeks', String(nWeeks));
    this.root.style.setProperty('--lanes', String(L));

    // ---- header: month title + legend
    // Just the current month: the grid itself marks where the next one starts ("Nov").
    const title = `<b>${esc(monthName(lang, +today.slice(5, 7)))}</b> <span>${today.slice(0, 4)}</span>`;
    setHTML(this.head.querySelector('.cal-title') as HTMLElement, title);
    const legend = c.showLegend
      ? c.sources
          .map((s) => {
            const col = chipColors(s.color);
            return `<span class="lg"><i style="--c:${col.base}"></i>${s.emoji ? `<span class="em">${esc(s.emoji)}</span>` : ''}${esc(s.name)}</span>`;
          })
          .join('')
      : '';
    setHTML(this.head.querySelector('.legend') as HTMLElement, legend);

    // ---- weekday header
    const names = weekdayNames(lang, c.weekStart, 'short');
    const todayCol = (weekdayOfKey(today) - c.weekStart + 7) % 7;
    setHTML(
      this.dow,
      names
        .map((n, i) => {
          const wd = (c.weekStart + i) % 7;
          return `<div class="${i === todayCol ? 'is-today' : ''}${wd === 0 || wd === 6 ? ' we' : ''}">${esc(n)}</div>`;
        })
        .join(''),
    );

    // ---- weeks
    let list = events;
    if (c.hidePast) list = list.filter((e) => e.spanLast >= today && !(e.timed && e.endMs <= nowMs));
    const weekSpecs: Spec[] = [];
    const weekRows: { key: string; start: string }[] = [];
    for (let w = 0; w < nWeeks; w++) {
      const ws = addDays(gridStart, w * 7);
      weekRows.push({ key: ws, start: ws });
      weekSpecs.push({ key: `w${ws}`, className: 'wk', html: '' });
    }
    reconcile(this.weeks, weekSpecs, { flip: true });
    const rowEls = Array.from(this.weeks.children).filter((x) => !(x as any).__leaving) as HTMLElement[];

    this.geom = this.measureGeom();
    weekRows.forEach((row, w) => {
      const el = rowEls[w];
      if (!el) return;
      reconcile(el, this.weekSpecs(row.start, list, L, today, nowMs, t, tz, isWeek), { flip: true });
    });
  }

  private geom: { colW: number; rem: number; chipPx: number } | null = null;

  /** Column width + chip font size in px (null while the grid is not laid out yet). */
  private measureGeom(): { colW: number; rem: number; chipPx: number } | null {
    const w = this.weeks.clientWidth;
    if (!w) return null;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    const raw = getComputedStyle(this.root).getPropertyValue('--chip-fs').trim();
    const n = parseFloat(raw);
    const chipPx = Number.isFinite(n) ? (raw.endsWith('px') ? n : n * rem) : 1.68 * rem;
    return { colW: w / 7, rem, chipPx };
  }

  /**
   * Widest single word of the title vs the chip's inner width: 1 = fits, 0.9 = fits only with the smaller font,
   * 0 = never fits (wrapping would split a word: keep the one-line ellipsis instead).
   */
  private wordScale(e: NEvent): number {
    const g = this.geom;
    if (!g) return 1;
    const inner = g.colW - 0.8 * g.rem - (e.timed ? 1.8 : 1.6) * g.rem - 2;
    let widest = 0;
    e.title.split(/\s+/).filter(Boolean).forEach((w, i) => {
      let ww = textWidth(w, g.chipPx, 560) * 1.04;
      // the emoji is glued (word joiner) to the first word when there is no time label in between
      if (i === 0 && e.emoji && !e.timed) ww += g.chipPx * 1.12 + 0.45 * g.rem;
      widest = Math.max(widest, ww);
    });
    if (widest <= inner) return 1;
    if (widest * 0.9 <= inner) return 0.9;
    return 0;
  }

  /** Lines a single-day chip needs to show its whole title (emoji + time inline on the first line). */
  private linesNeeded(e: NEvent, timeText: string, extra: string): number {
    const g = this.geom;
    if (!g) return 1;
    const { colW, rem, chipPx } = g;
    const inner = colW - 0.8 * rem - (e.timed ? 1.8 : 1.6) * rem - 2;
    if (inner <= 0) return 1;
    let w = textWidth(e.title, chipPx, 560);
    if (e.emoji) w += chipPx * 1.12 + 0.55 * rem;
    if (timeText) w += textWidth(timeText, chipPx, 700) + 0.55 * rem;
    if (extra) w += textWidth(extra, chipPx, 400) + 0.55 * rem;
    // word-wrapping wastes some of every line: be a bit pessimistic
    return Math.max(1, Math.ceil((w * 1.04) / inner + (w > inner ? 0.12 : 0)));
  }

  /**
   * P1a: let single-day chips grow into free lanes below them (2 lines; 3 when it is the only event of the day)
   * instead of truncating "Merca…". Only days whose chips are all visible are re-laid out, so the "+N"
   * capacity logic (lanes ≥ L hidden) is unchanged. Multi-day bars keep their lanes.
   */
  private planWrap(segs: Placed[], hidden: Set<Placed>, L: number, labels: Map<Placed, { tm: string; extra: string }>): void {
    if (!this.geom) return;
    const isSingle = (sg: Placed) => sg.eSlot - sg.s === 2 && sg.s % 2 === 0 && !sg.e.airbnb;
    const blocked: boolean[][] = Array.from({ length: L }, () => new Array(14).fill(false));
    for (const sg of segs) {
      if (hidden.has(sg) || isSingle(sg) || sg.lane >= L) continue;
      for (let i = sg.s; i < sg.eSlot; i++) blocked[sg.lane][i] = true;
    }
    // Make room: when a long single-day chip can't grow because a multi-day bar sits in the lane right below it
    // (e.g. a reservation starting that afternoon), push that bar down to a lane that is free along its whole
    // span. Bars only ever move down into free space, so nothing overlaps and no new "+N" appears.
    const occupied = (lane: number, s0: number, s1: number, skip: Placed[]) =>
      segs.some((o) => !skip.includes(o) && !hidden.has(o) && o.lane <= lane && lane < o.lane + (o.span ?? 1) && o.s < s1 && s0 < o.eSlot);
    for (let d = 0; d < 7; d++) {
      const day = segs.filter((sg) => isSingle(sg) && sg.s === 2 * d && !hidden.has(sg));
      if (day.length !== 1) continue;
      const sg = day[0];
      const lb = labels.get(sg);
      if (this.wordScale(sg.e) === 0 || this.linesNeeded(sg.e, lb?.tm ?? '', lb?.extra ?? '') < 2) continue;
      const below = sg.lane + 1;
      if (below >= L) continue;
      const bars = segs.filter((o) => o !== sg && !hidden.has(o) && !isSingle(o) && o.lane === below && o.s < 2 * d + 2 && 2 * d < o.eSlot);
      if (!bars.length) continue;
      const moves: [Placed, number][] = [];
      for (const b of bars) {
        let target = -1;
        for (let t = below + 1; t < L; t++) {
          if (!occupied(t, b.s, b.eSlot, [b, ...moves.map((m) => m[0])])) { target = t; break; }
        }
        if (target < 0) { moves.length = 0; break; }
        moves.push([b, target]);
      }
      if (moves.length !== bars.length) continue;
      for (const [b, t] of moves) {
        for (let i = b.s; i < b.eSlot; i++) blocked[b.lane][i] = false;
        b.lane = t;
        for (let i = b.s; i < b.eSlot; i++) blocked[t][i] = true;
      }
    }
    for (let d = 0; d < 7; d++) {
      const day = segs.filter((sg) => isSingle(sg) && sg.s === 2 * d);
      if (!day.length || day.some((sg) => hidden.has(sg))) continue;
      const free: number[] = [];
      for (let l = 0; l < L; l++) if (!blocked[l][2 * d] && !blocked[l][2 * d + 1]) free.push(l);
      if (free.length < day.length) continue;
      day.sort((a, b) => a.lane - b.lane);
      const maxSpan = day.length === 1 ? 3 : 2;
      let p = 0;
      day.forEach((sg, i) => {
        const lb = labels.get(sg);
        const scale = this.wordScale(sg.e);
        const need = this.linesNeeded(sg.e, lb?.tm ?? '', lb?.extra ?? '');
        const want = scale === 0 ? 1 : Math.min(maxSpan, need);
        const rest = day.length - i - 1;
        let span = 1;
        while (span < want && p + span < free.length - rest && free[p + span] === free[p] + span) span++;
        sg.lane = free[p];
        sg.span = span;
        sg.long = scale < 1 || need > span;
        p += span;
      });
    }
  }

  /** How many event lanes fit in a week row without squashing chips (measured, rem-based CSS vars). */
  private lanesThatFit(nWeeks: number): number {
    const h = this.weeks.clientHeight;
    if (!h) return 99;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    const cs = getComputedStyle(this.root);
    const v = (name: string, def: number) => {
      const raw = cs.getPropertyValue(name).trim();
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return def * rem;
      return raw.endsWith('px') ? n : n * rem;
    };
    const rowH = h / nWeeks - 1;
    const numH = v('--num-h', 5.8);
    const laneH = v('--lane-min', 2.45);
    const gap = v('--lane-gap', 0.42);
    return Math.floor((rowH - numH - gap) / (laneH + gap));
  }

  private weekSpecs(
    ws: string, events: NEvent[], L: number, today: string, nowMs: number, t: Ctx['t'], tz: string, isWeek: boolean,
  ): Spec[] {
    const { cfg, lang } = ctx;
    const c = cfg.calendar;
    const we = addDays(ws, 6);
    const specs: Spec[] = [];

    // Day cells + numbers
    for (let d = 0; d < 7; d++) {
      const key = addDays(ws, d);
      const wd = weekdayOfKey(key);
      const dayNum = +key.slice(8, 10);
      const past = key < today;
      const isToday = key === today;
      const first = dayNum === 1;
      const col = `grid-column:${2 * d + 1} / span 2`;
      const cls = `${past ? ' past' : ''}${isToday ? ' today' : ''}${wd === 0 || wd === 6 ? ' we' : ''}${first ? ' m1' : ''}`;
      specs.push({ key: `b${key}`, className: `cell${cls}`, style: col, html: '' });
      let label = first ? esc(monthName(lang, +key.slice(5, 7), 'short')) : String(dayNum);
      if (isWeek && !first) label = `${dayNum}`;
      const numHtml = isToday ? `<span class="dot"><span>${label}</span></span>` : `<span>${label}</span>`;
      specs.push({ key: `n${key}`, className: `num${cls}`, style: `${col};grid-row:1`, html: numHtml });
    }

    // Collect segments overlapping this week
    const segs: Placed[] = [];
    for (const e of events) {
      if (e.spanLast < ws || e.spanFirst > we) continue;
      const contL = e.spanFirst < ws;
      const contR = e.spanLast > we;
      const d0 = contL ? 0 : diffDays(ws, e.spanFirst);
      const d1 = contR ? 6 : diffDays(ws, e.spanLast);
      let s = d0 * 2;
      let eSlot = d1 * 2 + 2;
      if (e.halfStart && !contL) s += 1;
      if (e.halfEnd && !contR) eSlot -= 1;
      segs.push({ e, s, eSlot, lane: -1, contL, contR });
    }
    segs.sort((a, b) => {
      const ab = a.e.bar || a.eSlot - a.s > 2, bb = b.e.bar || b.eSlot - b.s > 2;
      if (ab !== bb) return ab ? -1 : 1;
      if (ab) {
        if (a.s !== b.s) return a.s - b.s;
        if (b.eSlot - b.s !== a.eSlot - a.s) return b.eSlot - b.s - (a.eSlot - a.s);
      }
      return sortForDay(a.e, b.e);
    });

    // Greedy lane allocation on half-day slots
    const occ: boolean[][] = [];
    for (const sg of segs) {
      let lane = 0;
      for (;; lane++) {
        const row = (occ[lane] ||= new Array(14).fill(false));
        let free = true;
        for (let i = sg.s; i < sg.eSlot; i++) if (row[i]) { free = false; break; }
        if (free) {
          for (let i = sg.s; i < sg.eSlot; i++) row[i] = true;
          break;
        }
      }
      sg.lane = lane;
    }

    // Overflow: days with items beyond L lanes show "+N" in the last lane.
    const days = (sg: Placed) => {
      const out: number[] = [];
      for (let d = Math.floor(sg.s / 2); d <= Math.floor((sg.eSlot - 1) / 2); d++) out.push(d);
      return out;
    };
    // "+N" lives in the day-number row, so it never steals a lane.
    const hidden = new Set<Placed>(segs.filter((s) => s.lane >= L));
    const moreCount = new Array(7).fill(0);
    for (const h of hidden) for (const d of days(h)) moreCount[d]++;

    const f24 = cfg.datetime.format24;
    const ampm = cfg.datetime.showAmPm;
    if (!isWeek) {
      const labels = new Map<Placed, { tm: string; extra: string }>();
      for (const sg of segs) {
        labels.set(sg, {
          tm: sg.e.timed ? timeLabel(sg.e, tz, f24, ampm, c.showEndTime, true) : '',
          extra: c.showLocation && sg.e.ev.location ? `· ${sg.e.ev.location}` : '',
        });
      }
      this.planWrap(segs, hidden, L, labels);
    }
    for (const sg of segs) {
      if (hidden.has(sg)) continue;
      const e = sg.e;
      const col = chipColors(e.color);
      const kind = e.bar ? 'bar' : 'timed';
      const pastEv = e.timed ? e.endMs <= nowMs : e.spanLast < today;
      const ongoing = e.timed && e.startMs <= nowMs && e.endMs > nowMs;
      const cls = [
        'ev', kind, e.allDay && !(sg.eSlot - sg.s > 2) ? 'single' : '',
        sg.contL ? 'cont-l' : '', sg.contR ? 'cont-r' : '',
        e.halfStart && !sg.contL ? 'half-l' : '', e.halfEnd && !sg.contR ? 'half-r' : '',
        pastEv ? 'past' : '', ongoing ? 'ongoing' : '', (e.airbnb && !e.checkoutMarker) ? 'airbnb' : '',
        (sg.span ?? 1) > 1 ? 'wrap' : '', (sg.span ?? 1) > 1 && sg.long ? 'long' : '',
      ].filter(Boolean).join(' ');
      let html = e.emoji ? `<span class="em">${esc(e.emoji)}</span>` : '';
      if (e.timed) {
        html += `<span class="tm">${esc(timeLabel(e, tz, f24, ampm, c.showEndTime, true))}</span>`;
      }
      const short = sg.contL && sg.eSlot - sg.s <= 2;
      if (short && (e.airbnb && !e.checkoutMarker) && !sg.contR) html = `<span class="em">🚪</span>`;
      else html += `<span class="tt">${esc(e.title)}</span>`;
      if (c.showLocation && e.ev.location) html += `<span class="loc">${esc(e.ev.location)}</span>`;
      if (c.showDayXofY && e.bar && sg.contL && e.days > 1 && !short) {
        const x = diffDays(e.spanFirst, ws) + 1;
        html += `<span class="dx">${esc(t('dayXofY', { x, y: (e.airbnb && !e.checkoutMarker) ? e.days + 1 : e.days }))}</span>`;
      }
      if ((e.airbnb && !e.checkoutMarker) && !sg.contR && !short && sg.eSlot - sg.s >= 3) html += `<span class="co">🚪</span>`;
      const span = sg.span ?? 1;
      if (span > 1) {
        // multi-line chip: emoji + time glued to the first word (U+2060 word joiner; emoji allow a break after
        // them), and a real space between time and title so the title wraps naturally.
        const WJ = '\u2060';
        let tx = e.emoji ? `<span class="em">${esc(e.emoji)}</span>${WJ}` : '';
        if (e.timed) tx += `<span class="tm">${esc(timeLabel(e, tz, f24, ampm, c.showEndTime, true))}</span> `;
        tx += `<span class="tt">${esc(e.title)}</span>`;
        if (c.showLocation && e.ev.location) tx += ` <span class="loc">${esc(e.ev.location)}</span>`;
        html = `<span class="tx">${tx}</span>`;
      }
      const row = span > 1 ? `${sg.lane + 2} / span ${span};--clamp:${span}` : `${sg.lane + 2}`;
      specs.push({
        key: `e${e.id}@${ws}`,
        className: cls,
        style: `grid-column:${sg.s + 1} / ${sg.eSlot + 1};grid-row:${row};--c:${col.base};--on:${col.onSolid};--tint:${col.tint};--shade:${col.shade}`,
        html,
      });
    }
    for (let d = 0; d < 7; d++) {
      if (!moreCount[d]) continue;
      const key = addDays(ws, d);
      specs.push({
        key: `m${key}`,
        className: `more${key < today ? ' past' : ''}`,
        style: `grid-column:${2 * d + 1} / span 2`,
        html: esc(t('more', { n: moreCount[d] })),
      });
    }
    return specs;
  }
}

type Ctx = typeof ctx;
