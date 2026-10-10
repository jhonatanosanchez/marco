// Titles cut short slide slowly to show the rest (calendar.marquee): all-day and multi-day bars of the month and
// week grids and the titles of the list-like views. A title that fits never moves; timed chips in month cells keep
// their ellipsis. The motion is one Web Animation on the transform of an inner span (runs on the compositor, no
// per-frame script); titles are measured once after each render and when the screen size changes.
import { ctx } from './ctx';
import { MARQUEE_MAX, MARQUEE_MAX_LITE, marqueeDelay, marqueeTiming, pickMovers } from './motion';

const TARGETS = [
  '.cal .ev.bar:not(.wrap) > .tt', // all-day and multi-day bars (month, week, two weeks)
  '.agenda .ag-tt', // agenda view and the side agenda
  '.td-chip > b', '.td-tt', '.td-l1 > span', // today
  '.pp-chip > b', '.pp-tt', // per person
  '.bd-agenda .bd-tt', // board: agenda card
].join(',');

interface MqEl extends HTMLElement {
  __mq?: { distance: number; anim: Animation | null };
}

const reduceQuery = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)');
  } catch {
    return null;
  }
})();

/** Narrowest box (in display units) worth sliding a title in. */
const MIN_BOX_U = 5;

let frame = 0;

/** Measure again in the next frame (coalesced: many calls in one frame measure once). */
export function refreshMarquee(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    scan();
  });
}

function enabled(): boolean {
  return ctx.cfg.calendar.marquee !== false && !reduceQuery?.matches;
}

function stop(el: MqEl): void {
  const st = el.__mq;
  if (!st) return;
  st.anim?.cancel();
  el.__mq = undefined;
  const inner = el.firstElementChild;
  if (inner?.classList.contains('mq-in') && el.childNodes.length === 1) el.replaceChildren(...Array.from(inner.childNodes));
  el.classList.remove('mq');
}

function innerOf(el: HTMLElement): HTMLElement | null {
  const c = el.firstElementChild as HTMLElement | null;
  return c && c.classList.contains('mq-in') && el.childNodes.length === 1 ? c : null;
}

function scan(): void {
  const els = Array.from(document.querySelectorAll<MqEl>(TARGETS));
  const on = enabled();
  const unit = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
  const vw = window.innerWidth, vh = window.innerHeight;
  // read every size first, then write (one layout pass)
  const over = els.map((el) => {
    // a chip on a busy day's page that is not showing does not move (nor count against the budget)
    if (!on || !el.isConnected || el.closest('.pg-off')) return 0;
    // clipped off the screen (the Agenda's extra columns, rows below the fold): no motion nobody sees
    const r = el.getBoundingClientRect();
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return 0;
    const box = el.clientWidth;
    // a box squeezed to a few letters would only show a blur of moving text: keep the ellipsis there
    if (box < MIN_BOX_U * unit) return 0;
    const inner = innerOf(el);
    return (inner ? inner.offsetWidth : el.scrollWidth) - box;
  });
  const movers = new Set(pickMovers(over.map((o) => !!marqueeTiming(o, unit)), ctx.lite ? MARQUEE_MAX_LITE : MARQUEE_MAX));
  let n = 0;
  els.forEach((el, i) => {
    if (!movers.has(i)) return stop(el);
    const t = marqueeTiming(over[i], unit)!;
    const st = el.__mq;
    if (st && Math.abs(st.distance - t.distance) <= 1 && innerOf(el)) {
      n++;
      return; // already sliding the right distance: leave it running
    }
    st?.anim?.cancel();
    let inner = innerOf(el);
    if (!inner) {
      inner = document.createElement('span');
      inner.className = 'mq-in';
      inner.append(...Array.from(el.childNodes));
      el.append(inner);
    }
    el.classList.add('mq');
    const [a, b, c] = t.offsets;
    const x = (px: number) => ({ transform: `translateX(${-px}px)` });
    let anim: Animation | null = null;
    try {
      anim = inner.animate(
        [
          { ...x(0), offset: 0 },
          { ...x(0), offset: a, easing: 'ease-in-out' },
          { ...x(t.distance), offset: b },
          { ...x(t.distance), offset: c, easing: 'ease-in-out' },
          { ...x(0), offset: 1 },
        ],
        { duration: t.duration, delay: marqueeDelay(n), iterations: Infinity },
      );
    } catch {
      anim = null; // no Web Animations: the title just shows its start
    }
    el.__mq = { distance: t.distance, anim };
    n++;
  });
}

// The screen size, the fonts or the motion preference changed: measure again.
try {
  reduceQuery?.addEventListener('change', refreshMarquee);
} catch { /* old browser */ }
try {
  if ('ResizeObserver' in window) {
    let w = 0, h = 0;
    new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (Math.abs(r.width - w) < 1 && Math.abs(r.height - h) < 1) return;
      w = r.width;
      h = r.height;
      refreshMarquee(); // in the next frame, never inside the observer callback (no loop warnings)
    }).observe(document.documentElement);
  }
} catch { /* ignore */ }
try {
  void document.fonts?.ready.then(refreshMarquee);
} catch { /* old browser */ }
