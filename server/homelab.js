// Tarjeta Homelab (fork fsrhome): lee estado-homelab (/api/widget, red interna, sin token) con copia de 30 s; con la
// fuente caída, la última buena mientras tenga ≤ 10 min; si no, null (la tarjeta queda gris). "Anoche" pide a Frigate las
// personas de la noche. Los silencios se reenvían al puerto 8001 de estado-homelab (solo existe en la red homelab).
// Spec: homelab-docs/specs/2026-10-14-marco-homelab-design.md
import { pickWidget, nightWindow, countPersons } from './core/homelabCore.js';
import { validEvents } from './core/camerasCore.js';

export const HOMELAB_CACHE_MS = 30_000;
export const HOMELAB_STALE_MS = 10 * 60_000;
const NIGHT_CACHE_MS = 5 * 60_000;
const TIMEOUT_MS = 5000;
const UA = 'marco-cards';

let copy = null;
let inflight = null;
let failing = false;
/** `${card.id}|${after}` → { at, personas } */
const nights = new Map();

export function _resetHomelab() {
  copy = null;
  inflight = null;
  failing = false;
  nights.clear();
}

export const invalidateHomelab = () => { copy = null; };

export const homelabSource = (env = process.env) => ({
  url: String(env.HOMELAB_URL || 'http://estado-homelab:8000').replace(/\/+$/, ''),
  silenceUrl: String(env.HOMELAB_SILENCE_URL || 'http://estado-homelab:8001/api/silencios'),
});

/** motivo corto de una falla, nunca la URL */
function failReason(e) {
  const msg = String(e?.message ?? '');
  if (/^http \d+$/.test(msg) || msg === 'forma inesperada') return msg;
  if (e?.name === 'SyntaxError') return 'forma inesperada';
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout';
  return 'error de red';
}

/** → { at, data } (widget en lista cerrada) o null sin datos */
export async function loadHomelab(now = Date.now(), env = process.env) {
  if (copy && now - copy.at < HOMELAB_CACHE_MS) return copy;
  if (!inflight) {
    const { url } = homelabSource(env);
    inflight = (async () => {
      try {
        const r = await fetch(`${url}/api/widget`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json', 'user-agent': UA } });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const data = pickWidget(await r.json());
        if (!data) throw new Error('forma inesperada');
        copy = { at: now, data };
        if (failing) { failing = false; console.info('[cards] Homelab: estado-homelab responde de nuevo'); }
      } catch (e) {
        if (!failing) { failing = true; console.warn(`[cards] Homelab: estado-homelab no respondió (${failReason(e)})`); }
      } finally {
        inflight = null;
      }
    })();
  }
  await inflight;
  return copy && now - copy.at <= HOMELAB_STALE_MS ? copy : null;
}

/** personas en las zonas de la tarjeta durante la noche; Frigate apagado, caído o raro → { personas: null } */
export async function loadNight(card, frigate, now, tz) {
  if (!frigate?.enabled || !frigate.url) return { personas: null };
  const { after, before } = nightWindow(now, tz);
  const key = `${card.id}|${after}`;
  const hit = nights.get(key);
  if (hit && now - hit.at < NIGHT_CACHE_MS) return { personas: hit.personas };
  try {
    const q = new URLSearchParams({ limit: '300', labels: 'person', zones: card.options.homelab.zones.join(','), after: String(after), before: String(before) });
    const r = await fetch(`${String(frigate.url).replace(/\/+$/, '')}/api/events?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error(`http ${r.status}`);
    const cams = frigate.cameras ?? [];
    const personas = countPersons(validEvents(await r.json(), new Set(cams.map((c) => c.id))), cams);
    nights.set(key, { at: now, personas });
    return { personas };
  } catch {
    return { personas: null };
  }
}

/** Reenvía { clave, hasta } a silencios.py. La validación de forma y de clave la hace la ruta (cards.js). */
export async function silenceHomelab({ clave, hasta }, env = process.env) {
  try {
    const r = await fetch(homelabSource(env).silenceUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ clave, hasta }),
    });
    if (r.status >= 200 && r.status < 300) { invalidateHomelab(); return { ok: true }; }
    if (r.status >= 400 && r.status < 500) return { ok: false, status: 400, error: 'rejected' };
    return { ok: false, status: 502, error: 'unavailable' };
  } catch {
    return { ok: false, status: 502, error: 'unavailable' };
  }
}
