// Shared crop math (web/shared/focus.ts) used by the display (CSS + WebGL) and the admin previews.
// Imports the TypeScript module directly (Node ≥ 22.18 strips types); skipped on older runtimes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let focus = null;
try {
  focus = await import('../../web/shared/focus.ts');
} catch {
  focus = null;
}
const opts = { skip: focus ? false : 'TypeScript imports need Node ≥ 22.18' };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('coverWindow: centred by default, follows the focal point, never shows an edge', opts, () => {
  const { coverWindow } = focus;
  // 3:2 landscape photo in a 0.64 portrait panel: 42.7 % of the width is visible
  let w = coverWindow(3000, 2000, 0.64, 1);
  near(w.sx, 0.64 / 1.5);
  near(w.sy, 1);
  near(w.cx, 0.5);
  w = coverWindow(3000, 2000, 0.64, 1, 0.3, 0.5);
  near(w.cx, 0.3);
  near(w.ax, 0.5);
  w = coverWindow(3000, 2000, 0.64, 1, 0.02, 0.5); // clamped to the left edge
  near(w.cx - w.sx / 2, 0);
  near(w.ax, 0.02 / w.sx);
  w = coverWindow(3000, 2000, 0.64, 1, 1, 0.5); // clamped to the right edge
  near(w.cx + w.sx / 2, 1);
});

test('coverWindow: the focal point goes to the target (free band), as close as the image allows', opts, () => {
  const { coverWindow } = focus;
  // 9:16 phone photo in a 0.64 panel → 87.9 % of the height visible; focus at 33 %, target band centre at 30 %
  let w = coverWindow(900, 1600, 0.64, 1, 0.5, 0.33, 0.5, 0.3);
  near(w.sy, 0.5625 / 0.64);
  near(w.cy - w.sy / 2, 0.33 - 0.3 * w.sy); // focus lands exactly on the target
  near(w.ay, 0.3);
  // not enough room: clamped, the focus ends up as close to the target as possible
  w = coverWindow(900, 1600, 0.64, 1, 0.5, 0.2, 0.5, 0.3);
  near(w.cy - w.sy / 2, 0);
  near(w.ay, 0.2 / w.sy);
});

test('coverPosition: CSS percentages equivalent to the window', opts, () => {
  const { coverPosition } = focus;
  assert.equal(coverPosition(3000, 2000, 0.64, 1), '50.00% 50.00%');
  assert.equal(coverPosition(3000, 2000, 0.64, 1, 0, 0.5), '0.00% 50.00%');
  assert.equal(coverPosition(3000, 2000, 0.64, 1, 1, 0.5), '100.00% 50.00%');
  assert.equal(coverPosition(900, 1600, 0.64, 1, 0.5, 0.2, 0.5, 0.3), '50.00% 0.00%');
});

test('freeBand: largest uncovered band between the clock and the weather card', opts, () => {
  const { freeBand } = focus;
  assert.deepEqual(freeBand([]), { top: 0, bottom: 1, target: 0.5 });
  const b = freeBand([[0.03, 0.23], [0.42, 0.97]]);
  near(b.top, 0.23);
  near(b.bottom, 0.42);
  near(b.target, 0.325);
  // overlapping blocks merge; a tiny gap is ignored (photo simply centred)
  assert.deepEqual(freeBand([[0, 0.5], [0.45, 0.95]]), { top: 0, bottom: 1, target: 0.5 });
});
