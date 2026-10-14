// "A esta edad" (fork fsrhome): reglas puras portadas de echo-reloj (html/js/edades.js y el filtro de fotos.js).
// Spec: homelab-docs/specs/2026-10-13-marco-a-esta-edad-design.md

/** capturas, imágenes de WhatsApp/Facebook, collages y nombres hash: no son fotos para mostrar */
export const NOT_A_PHOTO = /^(FB_IMG|Screenshot|Captura|IMG-\d{8}-WA)|COLLAGE|^[0-9a-f]{32}\./i;
/** con menos de 2 años con foto no hay comparación: no sale */
export const MIN_PHOTOS = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parts = (ymd) => ymd.split('-').map(Number);

/** `ymd` + n meses (mismo día; como new Date(y, m + n, d) de echo-reloj) */
export function addMonths(ymd, n) {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}

/** meses cumplidos de `from` a `to` */
export function monthsBetween(from, to) {
  const [ay, am, ad] = parts(from);
  const [by, bm, bd] = parts(to);
  return (by - ay) * 12 + (bm - am) - (bd < ad ? 1 : 0);
}

/** Un tramo por año de vida, todos a la misma edad que hoy: del día que la cumplió al mismo día del mes siguiente. */
export function ageWindows(birth, today) {
  const m = monthsBetween(birth, today);
  if (m < 0) return [];
  const out = [];
  for (let k = m % 12; k <= m; k += 12) {
    const from = addMonths(birth, k);
    out.push({ months: k, year: from.slice(0, 4), from, to: addMonths(birth, k + 1) });
  }
  return out;
}

/** `localDateTime` de Immich es la hora local aunque traiga Z: cuenta solo la fecha */
export function inWindow(asset, w) {
  const d = String(asset?.localDateTime || '').slice(0, 10);
  return d >= w.from && d < w.to;
}

export function seed(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 2147483647;
  return h;
}

const lower = (s) => String(s || '').toLowerCase();

export function scoreAsset(a, marks, person) {
  if (a.isFavorite === true || marks.favorites.has(lower(a.id))) return 3;
  const people = Array.isArray(a.people) ? a.people : [];
  const withHer = people.some((p) => lower(p?.name) === lower(person));
  if (withHer && people.length === 1) return 2;
  return withHer ? 1 : 0;
}

const showable = (a, marks) => a && typeof a.id === 'string' && a.type === 'IMAGE' && a.isArchived !== true && a.isTrashed !== true
  && a.visibility !== 'hidden' && a.visibility !== 'locked' && !marks.hidden.has(lower(a.id)) && !NOT_A_PHOTO.test(a.originalFileName || '');

/** La foto de un tramo: lo mejor disponible, sorteado con `key` (hoy + año) entre candidatas ordenadas por id. */
export function pickAsset(assets, key, marks, person) {
  const photos = (Array.isArray(assets) ? assets : []).filter((a) => showable(a, marks));
  if (!photos.length) return null;
  const best = Math.max(...photos.map((a) => scoreAsset(a, marks, person)));
  const pool = photos.filter((a) => scoreAsset(a, marks, person) === best).sort((x, y) => (lower(x.id) < lower(y.id) ? -1 : 1));
  return pool[seed(key) % pool.length];
}

/** ❤️/🚫 de echo-reloj (GET /api/marcas: { favoritas: [{ id, … } | id], ocultas: [id] }) → listas de ids */
export function parseMarks(raw) {
  const ids = (xs) => [...new Set((Array.isArray(xs) ? xs : [])
    .map((x) => (typeof x === 'string' ? x : x?.id)).filter((x) => typeof x === 'string' && UUID.test(x)).map((x) => x.toLowerCase()))];
  return { favorites: ids(raw?.favoritas), hidden: ids(raw?.ocultas) };
}
