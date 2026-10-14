// "A esta edad" (fork fsrhome): texto de la edad, acomodo de las instantáneas y HTML del marco de la puerta, portados de
// echo-reloj (html/js/edades.js). Puro (sin imports de runtime) para las pruebas.
import type { AgesList, AgesPhoto } from '../shared/types';

type T = (k: string, v?: Record<string, string | number>) => string;
export interface Box { x: number; y: number; w: number; h: number }

const GIROS = [-3, 2.2, -1.6, 2.8, -2.2, 1.4, -2.6, 2];
const CINTAS = ['var(--crayon-rosa)', 'var(--crayon-sol)', 'var(--crayon-menta)'];
/** ancho / alto del marco blanco de la instantánea */
const RATIO = 0.78;
/** encimarse se vale hasta este tanto del ancho de la más chica; si no caben así, se encogen todas */
const OVERLAP_MAX = 0.34;

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

export function ageText(months: number, t: T): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const out: string[] = [];
  if (years) out.push(t(years === 1 ? 'agesYear' : 'agesYears', { n: years }));
  if (rest || !years) out.push(t(rest === 1 ? 'agesMonth' : 'agesMonths', { n: rest }));
  return out.join(' ');
}

/** Cada año más alta, parada en el zoclo, como marcar la estatura en el marco de la puerta. */
export function ageLayout(n: number, width: number, height: number): Box[] {
  const floor = height - 78, x0 = 118, x1 = width - 36;
  let scale = 1;
  let boxes: Box[] = [];
  let total = 0;
  let step = 0;
  for (let attempt = 0; attempt < 30; attempt++, scale *= 0.95) {
    const hMin = height * 0.4 * scale, hMax = height * 0.8 * scale;
    boxes = [];
    total = 0;
    for (let i = 0; i < n; i++) {
      const h = n === 1 ? hMax : hMin + ((hMax - hMin) * i) / (n - 1);
      boxes.push({ x: 0, y: 0, w: h * RATIO, h });
      total += h * RATIO;
    }
    step = n > 1 ? Math.min((x1 - x0 - total) / (n - 1), 48) : 0; // negativo = se enciman
    if (step >= -OVERLAP_MAX * boxes[0].w) break;
  }
  let x = x0 + Math.max(0, x1 - x0 - total - step * (n - 1)) / 2;
  for (const b of boxes) {
    b.x = x;
    b.y = floor - b.h;
    x += b.w + step;
  }
  return boxes;
}

/** HTML del marco de la puerta (pared, regla, zoclo, cabecera, marcas de lápiz e instantáneas). */
export function agesHtml(list: AgesList, boxes: Box[], t: T, src: (p: AgesPhoto) => string): string {
  let marks = '';
  let photos = '';
  list.photos.forEach((p, i) => {
    const b = boxes[i];
    const style = `--retraso:${(0.4 + i * 0.45).toFixed(2)}s;`;
    marks += `<div class="marca-lapiz" style="${style}top:${b.y.toFixed(0)}px;width:${(b.x + b.w / 2 - 76).toFixed(0)}px"><span>${esc(p.year)}</span></div>`;
    const pad = (b.w * 0.06).toFixed(0);
    photos += `<div class="instantanea${i === 0 ? ' primera' : ''}" style="${style}z-index:${list.photos.length - i};--giro:${GIROS[i % GIROS.length]}deg;`
      + `left:${b.x.toFixed(0)}px;top:${b.y.toFixed(0)}px;width:${b.w.toFixed(0)}px;height:${b.h.toFixed(0)}px;`
      + `padding:${pad}px ${pad}px 0;font-size:${Math.min(28, b.w * 0.105).toFixed(0)}px">`
      + `<div class="cinta" style="--color-cinta:${CINTAS[i % CINTAS.length]};--giro-cinta:${i % 2 ? 4 : -5}deg"></div>`
      + `<div class="foto" style="background-image:url('${esc(src(p))}')"></div>`
      + `<div class="pie">${esc(ageText(p.months, t))}</div></div>`;
  });
  const stars = '<svg class="edades-estrellas" viewBox="0 0 74 50" aria-hidden="true">'
    + '<path d="M20 6l4 10 11 1-8 7 3 11-10-6-10 6 3-11-8-7 11-1z" fill="#F5C84A" stroke="#D9A21E" stroke-width="1.5" stroke-linejoin="round"/>'
    + '<path d="M58 22l2.5 6 6.5.6-5 4.3 1.6 6.4-5.6-3.5-5.6 3.5 1.6-6.4-5-4.3 6.5-.6z" fill="#F08BA6" stroke="#D0607F" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  return '<div class="edades-regla"></div><div class="edades-zoclo"></div>'
    + `<div class="edades-cabecera"><div class="edades-titulo">${esc(t('agesTitle', { name: list.person }))}</div>`
    + `<div class="edades-sub">${esc(t('agesToday', { age: ageText(list.months, t) }))}</div>${stars}</div>`
    + `<div class="edades-fotos">${marks}${photos}</div>`;
}
