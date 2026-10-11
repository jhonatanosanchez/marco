// Pure helpers for compact busy days (calendar.compactBusyDays), no DOM so the tests can load them with Node:
// - week rows share the grid's height by what their events need instead of equal rows;
// - a day that cannot fit its events at normal size lists them as small one-line entries.

/**
 * Height of each week row (px) out of `total`, given what each row needs (`needs`, px) and the least a row gets
 * (`minRow`, px: the date and one event).
 * - When every row fits in an equal share, rows stay equal (the grid looks as it always did).
 * - When they all fit together, rows that need more get it and the others share the rest equally.
 * - When they do not, the rows that need little get what they need and the busiest ones share the rest equally
 *   (one very busy week cannot squeeze the others below what they need).
 * The heights always add up to `total`.
 */
export function shareRows(needs: number[], total: number, minRow: number): number[] {
  const n = needs.length;
  if (!n) return [];
  const equal = total / n;
  const want = needs.map((x) => Math.max(minRow, Number.isFinite(x) ? x : minRow));
  if (want.every((x) => x <= equal + 0.5) || minRow * n >= total) return needs.map(() => equal);
  const sum = want.reduce((a, b) => a + b, 0);
  if (sum <= total) {
    // water level: the rows that need more than it keep what they need, the others share the rest equally
    const order = want.map((_, i) => i).sort((x, y) => want[y] - want[x]);
    const big = new Set<number>();
    let rest = total;
    for (const i of order) {
      if (want[i] <= rest / (n - big.size)) break;
      big.add(i);
      rest -= want[i];
    }
    const each = rest / (n - big.size);
    return want.map((x, i) => (big.has(i) ? x : each));
  }
  // ceiling: the rows that need less than it get what they need, the busiest ones share the rest equally
  const order = want.map((_, i) => i).sort((x, y) => want[x] - want[y]);
  const fixed = new Set<number>();
  let rest = total;
  for (const i of order) {
    if (want[i] > rest / (n - fixed.size)) break;
    fixed.add(i);
    rest -= want[i];
  }
  const each = rest / (n - fixed.size);
  return want.map((x, i) => (fixed.has(i) ? x : each));
}

/** How many one-line entries of `lineH` px, `gap` px apart, fit in `space` px. */
export function linesThatFit(space: number, lineH: number, gap: number): number {
  if (!(space > 0) || !(lineH > 0)) return 0;
  return Math.max(0, Math.floor((space + gap + 0.5) / (lineH + gap)));
}

/**
 * Height (px) of a normal lane in a week row of `rowH` px with `lanes` lanes: CSS grid gives each lane its preferred
 * height (`laneH`) when there is room, never less than `laneMin`; whatever is left goes to the free space below.
 */
export function laneHeight(rowH: number, numH: number, lanes: number, laneH: number, laneMin: number, gap: number): number {
  if (lanes <= 0) return laneH;
  const avail = rowH - numH - (lanes + 1) * gap;
  return Math.min(laneH, Math.max(laneMin, avail / lanes));
}

export interface CompactDay {
  /** lanes taken on this day by bars that also cover other days (they stay put so they line up) */
  top: number;
  /** events of the day itself, plus one-day pieces of bars that did not get a lane */
  items: number;
}

/**
 * What one week row needs (px) to show every day: a day whose events fit in `maxLanes` normal lanes asks for those
 * lanes; a busier day asks for its bars' lanes plus one small line per event. `normalLanes` is the number of lanes
 * the busiest day takes at normal size (lanes are shared by the whole row).
 */
export function weekNeed(
  days: CompactDay[], normalLanes: number[], maxLanes: number,
  m: { numH: number; laneH: number; gap: number; lineH: number; lineGap: number; pad: number },
): number {
  const lane = m.laneH + m.gap;
  let need = 1; // one lane at least: an empty week still shows its dates and room for an event
  let px = lane;
  days.forEach((d, i) => {
    const normal = normalLanes[i] ?? 0;
    if (normal <= maxLanes) {
      need = Math.max(need, normal);
      px = Math.max(px, normal * lane);
      return;
    }
    const lines = d.items * (m.lineH + m.lineGap) - m.lineGap + m.pad;
    px = Math.max(px, Math.min(maxLanes, d.top) * lane + lines);
  });
  return m.numH + m.gap + Math.max(px, need * lane);
}

/** Compact entries: font size as a share of the normal chip font, line height in that font, gaps in display units. */
export const COMPACT_FONT = 0.86;
export const COMPACT_LINE = 1.34;
export const COMPACT_GAP_U = 0.2;
export const COMPACT_PAD_U = 0.3;
