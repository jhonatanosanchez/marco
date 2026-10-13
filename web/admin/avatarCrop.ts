// The round crop of a profile photo (Familia > Miembros), as plain numbers so it can be tested without a browser.
// The image (w x h pixels) sits under a round window `view` CSS pixels wide (the stage around it is wider, so the
// rest of the photo shows dimmed around the circle: placement()'s `pad`). `zoom` 1 = the short side fills the
// window; (cx, cy) = the image pixel at the middle of the window. The window never shows anything outside the image.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export interface Crop {
  cx: number;
  cy: number;
  zoom: number;
}

/** CSS pixels per image pixel. */
export const scaleOf = (w: number, h: number, view: number, zoom: number) => (view / Math.min(w, h)) * zoom;

/** Keep the zoom in range and the window inside the image. */
export function clampCrop(c: Crop, w: number, h: number): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(c.zoom) ? c.zoom : 1));
  const half = Math.min(w, h) / zoom / 2;
  const cl = (v: number, size: number) => Math.min(size - half, Math.max(half, Number.isFinite(v) ? v : size / 2));
  return { cx: cl(c.cx, w), cy: cl(c.cy, h), zoom };
}

/** Centred and filling the window. */
export const initialCrop = (w: number, h: number): Crop => ({ cx: w / 2, cy: h / 2, zoom: 1 });

/** Move by (dx, dy) CSS pixels (a drag: the picture follows the finger). */
export function panBy(c: Crop, dx: number, dy: number, w: number, h: number, view: number): Crop {
  const s = scaleOf(w, h, view, c.zoom);
  return clampCrop({ ...c, cx: c.cx - dx / s, cy: c.cy - dy / s }, w, h);
}

/**
 * Zoom to `zoom`, keeping the picture point under (px, py) where it is (CSS pixels from the window's top left;
 * default the middle).
 */
export function zoomTo(c: Crop, zoom: number, w: number, h: number, view: number, px = view / 2, py = view / 2): Crop {
  const s0 = scaleOf(w, h, view, c.zoom);
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const s1 = scaleOf(w, h, view, z);
  // picture point under the pointer before, and where the middle must go so it stays there
  const ix = c.cx + (px - view / 2) / s0;
  const iy = c.cy + (py - view / 2) / s0;
  return clampCrop({ zoom: z, cx: ix - (px - view / 2) / s1, cy: iy - (py - view / 2) / s1 }, w, h);
}

/** The square of the image the window shows: source rectangle for drawImage. */
export function cropRect(c: Crop, w: number, h: number): { sx: number; sy: number; side: number } {
  const k = clampCrop(c, w, h);
  const side = Math.min(w, h) / k.zoom;
  return { sx: k.cx - side / 2, sy: k.cy - side / 2, side };
}

/**
 * Where the image goes on the stage: its left/top offset and drawn size, in CSS pixels. The window sits `pad` pixels
 * in from the stage's edges.
 */
export function placement(c: Crop, w: number, h: number, view: number, pad = 0): { x: number; y: number; width: number; height: number } {
  const s = scaleOf(w, h, view, c.zoom);
  return { x: pad + view / 2 - c.cx * s, y: pad + view / 2 - c.cy * s, width: w * s, height: h * s };
}

/** Margin around the round window on a stage `stage` pixels wide. */
export const stagePad = (stage: number) => Math.round(stage * 0.1);
