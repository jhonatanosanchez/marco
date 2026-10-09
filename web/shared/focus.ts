// Cover-fit crop around a focal point — shared by the display (CSS + WebGL) and the admin previews so they agree.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const unit = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : 0.5);

export interface CoverWindow {
  /** visible fraction of the image on each axis (≤ 1) */
  sx: number;
  sy: number;
  /** centre of the visible window, image coords 0..1 (y from the top) */
  cx: number;
  cy: number;
  /** where the focal point lands inside the box, 0..1 (y from the top) — the Ken Burns zoom anchor */
  ax: number;
  ay: number;
}

/**
 * The part of an iw×ih image that `cover` shows in a bw×bh box, moved so the focal point (fx, fy) lands as close as
 * possible to the target point (tx, ty) of the box (default: its centre; the display passes the centre of the band
 * not hidden by the clock / weather card) without ever showing an edge.
 */
export function coverWindow(iw: number, ih: number, bw: number, bh: number, fx?: number, fy?: number, tx = 0.5, ty = 0.5): CoverWindow {
  const ri = iw / Math.max(ih, 1);
  const rb = bw / Math.max(bh, 1);
  const sx = rb > ri ? 1 : rb / ri;
  const sy = rb > ri ? ri / rb : 1;
  const x = unit(fx);
  const y = unit(fy);
  const left = clamp(x - clamp(tx, 0, 1) * sx, 0, 1 - sx);
  const top = clamp(y - clamp(ty, 0, 1) * sy, 0, 1 - sy);
  const cx = left + sx / 2;
  const cy = top + sy / 2;
  return { sx, sy, cx, cy, ax: clamp((x - left) / sx, 0, 1), ay: clamp((y - top) / sy, 0, 1) };
}

/** CSS `background-position` / `object-position` (percent strings) equivalent to coverWindow(). */
export function coverPosition(iw: number, ih: number, bw: number, bh: number, fx?: number, fy?: number, tx = 0.5, ty = 0.5): string {
  const w = coverWindow(iw, ih, bw, bh, fx, fy, tx, ty);
  const pct = (c: number, s: number) => (s >= 0.9999 ? 50 : ((c - s / 2) / (1 - s)) * 100);
  return `${pct(w.cx, w.sx).toFixed(2)}% ${pct(w.cy, w.sy).toFixed(2)}%`;
}

export const hasFocus = (p: { focusX?: number; focusY?: number }) =>
  typeof p.focusX === 'number' && typeof p.focusY === 'number';

/** Where text covers the photo panel, as measured by a display: free band + covered blocks (fractions of the height). */
export interface PhotoFrame {
  /** photo panel width / height */
  aspect: number;
  /** centre of the largest uncovered horizontal band (0..1 from the top): where the focal point is placed */
  targetY: number;
  freeTop: number;
  freeBottom: number;
  /** covered vertical ranges [top, bottom] (clock + pills, weather card, side widgets) */
  blocks: [number, number][];
}

/**
 * Largest vertical band of a box not covered by any of the given [top, bottom] ranges (all 0..1). Bands under
 * `minBand` of the height are ignored (then the photo is simply centred).
 */
export function freeBand(blocks: [number, number][], minBand = 0.12): { top: number; bottom: number; target: number } {
  const bs = blocks.map(([a, b]) => [clamp(a, 0, 1), clamp(b, 0, 1)] as [number, number]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let best = { top: 0, bottom: 1, size: -1 };
  let cursor = 0;
  for (const [a, b] of [...bs, [1, 1] as [number, number]]) {
    if (a - cursor > best.size) best = { top: cursor, bottom: a, size: a - cursor };
    cursor = Math.max(cursor, b);
  }
  if (best.size < minBand) return { top: 0, bottom: 1, target: 0.5 };
  return { top: best.top, bottom: best.bottom, target: (best.top + best.bottom) / 2 };
}
