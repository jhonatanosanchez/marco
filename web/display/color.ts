// Small colour helpers (contrast-aware text colours for event chips).

export type RGB = [number, number, number];

export function parseColor(hex: string | null | undefined, fallback: RGB = [76, 141, 255]): RGB {
  if (!hex) return fallback;
  let h = hex.trim().replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return fallback;
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return fallback;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function lin(c: number) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Best readable text colour (near-black or white) for a solid background. */
export function readableOn(bg: RGB): string {
  const dark: RGB = [16, 16, 20];
  const light: RGB = [255, 255, 255];
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? '#101014' : '#ffffff';
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Lighten a colour towards white until it reaches a target contrast on a dark background. */
export function readableTint(c: RGB, bg: RGB = [0, 0, 0], target = 7): RGB {
  let out = c;
  for (let i = 0; i < 12 && contrastRatio(out, bg) < target; i++) out = mix(out, [255, 255, 255], 0.18);
  return out;
}

/** Darken towards black until readable on a light background. */
export function readableShade(c: RGB, bg: RGB = [245, 243, 239], target = 5.5): RGB {
  let out = c;
  for (let i = 0; i < 12 && contrastRatio(out, bg) < target; i++) out = mix(out, [0, 0, 0], 0.15);
  return out;
}

export const rgbStr = ([r, g, b]: RGB) => `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;

export interface ChipColors {
  /** "r g b" triplet of the raw colour */ base: string;
  /** solid-fill text colour */ onSolid: string;
  /** readable tint for text on the dark panel */ tint: string;
  /** readable shade for text on the light panel */ shade: string;
}

const cache = new Map<string, ChipColors>();
export function chipColors(hex: string): ChipColors {
  let c = cache.get(hex);
  if (!c) {
    const rgb = parseColor(hex);
    // Slightly deepen very bright fills so white/black text sits nicely.
    c = { base: rgbStr(rgb), onSolid: readableOn(rgb), tint: toHex(readableTint(rgb)), shade: toHex(readableShade(rgb)) };
    cache.set(hex, c);
  }
  return c;
}
