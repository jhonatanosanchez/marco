// Focal point finder (no dependencies): spectral-residual saliency (Hou & Zhang, 2007) on a 64×64 luminance image —
// what "stands out" from its surroundings: an animal's face on a floor, a person on a landscape — plus a skin-tone
// map (faces) and a mild centre prior. The focal point is the weighted centre of the strongest region.
// (smartcrop.js was evaluated first: its crop scoring prefers large crops and localised subjects poorly.)

const N = 64;

function fft1(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wr = Math.cos(a), wi = Math.sin(a);
    const half = len / 2;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const p = i + k, q = p + half;
        const vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr;
        im[q] = im[p] - vi;
        re[p] += vr;
        im[p] += vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}

function fft2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const r = new Float64Array(N), i2 = new Float64Array(N);
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        const k = pass ? b * N + a : a * N + b;
        r[b] = re[k];
        i2[b] = im[k];
      }
      fft1(r, i2, inverse);
      for (let b = 0; b < N; b++) {
        const k = pass ? b * N + a : a * N + b;
        re[k] = r[b];
        im[k] = i2[b];
      }
    }
  }
}

/** Separable box blur (radius in cells). */
function blur(src: Float64Array, rad: number): Float64Array {
  const t = new Float64Array(N * N), o = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, x - rad); k <= Math.min(N - 1, x + rad); k++) (s += src[y * N + k]), c++;
      t[y * N + x] = s / c;
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, y - rad); k <= Math.min(N - 1, y + rad); k++) (s += t[k * N + x]), c++;
      o[y * N + x] = s / c;
    }
  return o;
}

function normalize(a: Float64Array): Float64Array {
  let mx = 0;
  for (const v of a) mx = Math.max(mx, v);
  if (mx > 0) for (let i = 0; i < a.length; i++) a[i] /= mx;
  return a;
}

/** Focal point (0..1 of width / height) of any drawable (a small thumbnail is plenty). */
export function saliencyFocus(src: CanvasImageSource): { focusX: number; focusY: number } {
  const c = document.createElement('canvas');
  c.width = c.height = N; // aspect is irrelevant for locating the subject
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, N, N);
  const px = g.getImageData(0, 0, N, N).data;
  c.width = c.height = 0;

  const re = new Float64Array(N * N), im = new Float64Array(N * N), skin = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = px[i * 4], gr = px[i * 4 + 1], b = px[i * 4 + 2];
    const l = (0.299 * r + 0.587 * gr + 0.114 * b) / 255;
    re[i] = l;
    // skin: chromaticity close to a typical skin tone, warm (r > g, r ≫ b), neither black nor blown out
    const m = Math.hypot(r, gr, b) || 1;
    const d = Math.hypot(r / m - 0.78, gr / m - 0.57, b / m - 0.44);
    skin[i] = d < 0.25 && l > 0.2 && l < 0.97 && r - b > 18 && r > gr ? 1 - d / 0.25 : 0;
  }

  // spectral residual: log amplitude minus its local average, back with the original phase
  fft2(re, im, false);
  const logA = new Float64Array(N * N), phase = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) {
    logA[i] = Math.log(Math.hypot(re[i], im[i]) + 1e-9);
    phase[i] = Math.atan2(im[i], re[i]);
  }
  const avg = blur(logA, 1);
  for (let i = 0; i < N * N; i++) {
    const a = Math.exp(logA[i] - avg[i]);
    re[i] = a * Math.cos(phase[i]);
    im[i] = a * Math.sin(phase[i]);
  }
  fft2(re, im, true);
  let sal: Float64Array = new Float64Array(N * N);
  for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) sal[y * N + x] = re[y * N + x] ** 2 + im[y * N + x] ** 2; // border = FFT artefacts
  sal = normalize(blur(blur(sal, 3), 3));
  const sk = normalize(blur(skin, 2));

  const map = new Float64Array(N * N);
  let mx = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5;
      const centre = Math.exp(-(dx * dx + dy * dy) / 0.18);
      const v = (sal[y * N + x] * 0.8 + sk[y * N + x] * 1.3) * (0.55 + 0.45 * centre);
      map[y * N + x] = v;
      mx = Math.max(mx, v);
    }
  if (!(mx > 0)) return { focusX: 0.5, focusY: 0.5 };
  let sx = 0, sy = 0, sw = 0;
  const cut = mx * 0.6;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const w = map[y * N + x] - cut;
      if (w > 0) (sx += w * (x + 0.5)), (sy += w * (y + 0.5)), (sw += w);
    }
  const r3 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  return { focusX: r3(sx / sw / N), focusY: r3(sy / sw / N) };
}
