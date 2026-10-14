// "A esta edad" (fork fsrhome): arma una vez al día por tarjeta la lista de fotos (una por año de vida, a la misma edad
// que hoy) con las reglas de core/agesCore.js, consultando a Immich por tramo. Las pantallas reciben la lista por la ruta
// de tarjetas (cards.js) y las imágenes por /media/immich (solo las de la lista, solo a pantallas con la tarjeta).
// Spec: homelab-docs/specs/2026-10-13-marco-a-esta-edad-design.md
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, paths } from './store.js';
import { immichJson, setExtraAssetVersions } from './immich.js';
import { compactAsset } from './core/immichCore.js';
import { addDays, localDay } from './core/trainingCore.js';
import { MIN_PHOTOS, ageWindows, inWindow, monthsBetween, pickAsset } from './core/agesCore.js';

const PAGE = 250;
const MAX_PAGES = 8;

/** cardId → { sig, value } (lista del día) */
const lists = new Map();
/** cardId → promesa en curso */
const inflight = new Map();
let marksCache = null;

export function _resetAges() {
  lists.clear();
  inflight.clear();
  marksCache = null;
}

/** ❤️/🚫 importadas de echo-reloj (data/ages-marks.json; scripts/import-ages-marks.mjs) */
function marks() {
  if (marksCache) return marksCache;
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(path.join(paths.data, 'ages-marks.json'), 'utf8'));
  } catch {
    /* sin marcas */
  }
  const set = (xs) => new Set((Array.isArray(xs) ? xs : []).filter((x) => typeof x === 'string').map((x) => x.toLowerCase()));
  marksCache = { favorites: set(raw.favorites), hidden: set(raw.hidden) };
  return marksCache;
}

const timezone = (cfg) => cfg.datetime?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Fotos del álbum en el tramo `w` (un día de margen a cada lado en la consulta; el corte fino es por fecha local). */
async function windowAssets(albumId, w) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const j = await immichJson('/api/search/metadata', {
      method: 'POST',
      json: { albumIds: [albumId], type: 'IMAGE', takenAfter: `${addDays(w.from, -1)}T00:00:00.000Z`, takenBefore: `${addDays(w.to, 1)}T00:00:00.000Z`, withPeople: true, size: PAGE, page },
    });
    const items = j?.assets?.items;
    if (!Array.isArray(items)) throw new Error('bad_response');
    out.push(...items);
    if (!j.assets.nextPage) break;
  }
  return out.filter((a) => inWindow(a, w));
}

async function build(card, today) {
  const o = card.options.ages;
  const m = marks();
  const windows = ageWindows(o.birthDate, today);
  // un tramo que falla tumba la lista: no se guarda nada y la siguiente petición reintenta (como echo-reloj)
  const per = await Promise.all(windows.map((w) => windowAssets(o.albumId, w)));
  const photos = windows.map((w, i) => {
    const a = pickAsset(per[i], today + w.year, m, o.person);
    return a ? { id: a.id.toLowerCase(), v: compactAsset(a).v, months: w.months, year: w.year } : null;
  }).filter(Boolean);
  return { person: o.person, today, months: monthsBetween(o.birthDate, today), photos: photos.length >= MIN_PHOTOS ? photos : [] };
}

/** Lista del día de la tarjeta (copia hasta que cambie el día o la tarjeta). */
export async function agesList(card, now = Date.now()) {
  const o = card.options.ages;
  const today = localDay(now, timezone(getConfig()));
  const sig = JSON.stringify([today, o.person, o.birthDate, o.albumId]);
  const hit = lists.get(card.id);
  if (hit?.sig === sig) return hit.value;
  let p = inflight.get(card.id);
  if (!p) {
    p = build(card, today).then((value) => {
      lists.set(card.id, { sig, value });
      return value;
    }).finally(() => inflight.delete(card.id));
    inflight.set(card.id, p);
  }
  return p;
}

/** Versión de una foto de la lista del día de alguna tarjeta ages de `screens` (null = sesión del admin: todas). */
export function agesAssetVersion(id, screens) {
  const cfg = getConfig();
  const wanted = new Set(screens === null ? (cfg.cards?.items ?? []).map((k) => k.id) : screens.flatMap((s) => s.screen?.cards?.items ?? []));
  for (const k of cfg.cards?.items ?? []) {
    if (k.type !== 'ages' || !k.enabled || !wanted.has(k.id)) continue;
    const p = lists.get(k.id)?.value.photos.find((x) => x.id === id);
    if (p) return p.v;
  }
  return null;
}

setExtraAssetVersions(agesAssetVersion);
