// Pure helpers for the two calendar motions (no DOM, so the tests can load them with Node):
// - marquee: a title cut short slides left until its end shows, waits, slides back, waits, and so on;
// - busy days: a month-grid day with more events than lanes pages through them.

/** Sliding speed in display units (1rem ≈ 10px at 1080p) per second: about 30px/s on a 1080p screen. */
export const MARQUEE_SPEED_U = 3;
/** Pause at each end of the slide. */
export const MARQUEE_PAUSE_MS = 2500;
/** Overflow (px) below which a title is left alone (sub-pixel rounding, a cut descender). */
export const MARQUEE_MIN_PX = 3;
/** At most this many titles move at once; ?lite=1 (Raspberry Pi) uses the lower one. */
export const MARQUEE_MAX = 40;
export const MARQUEE_MAX_LITE = 6;
/** Time each page of a busy day stays on screen. */
export const PAGE_MS = 8000;

export interface MarqueeTiming {
  /** one full cycle: pause, slide out, pause, slide back */
  duration: number;
  /** keyframe offsets (0..1) where the slide out starts, ends, and where the slide back starts */
  offsets: [number, number, number];
  /** pixels to slide (the hidden part of the title) */
  distance: number;
}

/**
 * Timing of the ping-pong slide for a title that overflows its box by `overflowPx`, on a screen whose display unit
 * (the root font size) is `unitPx`. Returns null when the title fits.
 */
export function marqueeTiming(overflowPx: number, unitPx: number, pauseMs = MARQUEE_PAUSE_MS): MarqueeTiming | null {
  if (!(overflowPx >= MARQUEE_MIN_PX)) return null;
  const speed = Math.max(8, MARQUEE_SPEED_U * (unitPx > 0 ? unitPx : 10)); // px per second
  const distance = Math.ceil(overflowPx);
  const move = Math.max(600, (distance / speed) * 1000);
  const duration = Math.round(2 * pauseMs + 2 * move);
  const a = pauseMs / duration;
  const b = (pauseMs + move) / duration;
  const c = (2 * pauseMs + move) / duration;
  return { duration, offsets: [a, b, c], distance };
}

/** Start delay of the i-th moving title, so they do not all set off together (a few seconds apart, repeating). */
export function marqueeDelay(i: number): number {
  return 1200 + ((i * 1700) % 8500);
}

/** Indexes (in screen order) of the titles that may move, given which ones overflow and the budget. */
export function pickMovers(overflowing: boolean[], max: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < overflowing.length && out.length < max; i++) if (overflowing[i]) out.push(i);
  return out;
}

export interface Paged<T> {
  item: T;
  page: number;
  lane: number;
}

/**
 * Spread the events of a busy day over pages. `freeLanes` are the lanes of that day not taken by bars that span
 * other days too (those stay put so they keep lining up). Every page fills the free lanes in order; the last page
 * may be shorter. Returns null when there is no free lane (nothing can rotate).
 */
export function planPages<T>(items: T[], freeLanes: number[]): { pages: number; placed: Paged<T>[] } | null {
  const k = freeLanes.length;
  if (!k) return null;
  const placed = items.map((item, i) => ({ item, page: Math.floor(i / k), lane: freeLanes[i % k] }));
  return { pages: Math.max(1, Math.ceil(items.length / k)), placed };
}

/** Page shown by a day with `pages` pages after `step` page turns. */
export function pageAt(step: number, pages: number): number {
  return pages > 1 ? ((step % pages) + pages) % pages : 0;
}

/** Text of the page indicator ("1/3"). */
export function pageLabel(page: number, pages: number): string {
  return `${page + 1}/${pages}`;
}
