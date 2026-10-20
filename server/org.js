// Tarjeta Organización (fork fsrhome): lee el resumen de `organizacion` (red homelab, x-marco-token) con copia de 30 s;
// con la fuente caída, la última buena mientras tenga ≤ 10 min; si no, null (gris). Aprobar se reenvía con origen echo
// (organizacion → asistente-wa pide el «sí» por WhatsApp). Spec: homelab-docs/specs/2026-10-19-panel-organizacion-design.md §6
import { pickOrg } from './core/orgCore.js';

export const ORG_CACHE_MS = 30_000;
export const ORG_STALE_MS = 10 * 60_000;
const TIMEOUT_MS = 5000;
const UA = 'marco-cards';

let copy = null;
let inflight = null;
let failing = false;
let generation = 0;

export function _resetOrg() { copy = null; inflight = null; failing = false; generation++; }
export const invalidateOrg = () => { copy = null; inflight = null; generation++; };

export const orgSource = (env = process.env) => ({
  url: String(env.ORG_URL || 'http://organizacion:3000').replace(/\/+$/, ''),
  token: String(env.MARCO_ORG_TOKEN || ''),
});

function failReason(e) {
  const msg = String(e?.message ?? '');
  if (/^http \d+$/.test(msg) || msg === 'forma inesperada') return msg;
  if (e?.name === 'SyntaxError') return 'forma inesperada';
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout';
  return 'error de red';
}

/** → { at, data } o null sin datos */
export async function loadOrg(now = Date.now(), env = process.env) {
  if (copy && now - copy.at < ORG_CACHE_MS) return copy;
  const { url, token } = orgSource(env);
  if (!token) {
    // sin token no se pide nada (nunca una petición sin cabecera): la tarjeta queda gris
    if (!failing) { failing = true; console.warn('[cards] Organización: falta MARCO_ORG_TOKEN'); }
    return null;
  }
  if (!inflight) {
    const gen = generation;
    const p = (async () => {
      try {
        const r = await fetch(`${url}/api/marco/resumen`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json', 'user-agent': UA, 'x-marco-token': token } });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const data = pickOrg(await r.json());
        if (!data) throw new Error('forma inesperada');
        if (gen === generation) copy = { at: now, data };
        if (failing) { failing = false; console.info('[cards] Organización: organizacion responde de nuevo'); }
      } catch (e) {
        if (!failing) { failing = true; console.warn(`[cards] Organización: organizacion no respondió (${failReason(e)})`); }
      } finally {
        if (inflight === p) inflight = null;
      }
    })();
    inflight = p;
  }
  await inflight;
  return copy && now - copy.at <= ORG_STALE_MS ? copy : null;
}

/** La ruta ya validó la tarjeta y que el id sea accionable en la última lectura. */
export async function approveOrg(id, env = process.env) {
  const { url, token } = orgSource(env);
  if (!token) return { ok: false, status: 502, error: 'unavailable' };
  try {
    const r = await fetch(`${url}/api/marco/aprobar`, {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-marco-token': token }, body: JSON.stringify({ id }),
    });
    if (r.status >= 200 && r.status < 300) { invalidateOrg(); return { ok: true }; }
    if (r.status >= 400 && r.status < 500) {
      const j = await r.json().catch(() => ({}));
      invalidateOrg();
      // 409 (ya cambió u otra pregunta abierta en WhatsApp) se distingue en la hoja; lo demás, 400
      return { ok: false, status: r.status === 409 ? 409 : 400, error: typeof j.error === 'string' ? j.error.slice(0, 120) : 'rejected' };
    }
    return { ok: false, status: 502, error: 'unavailable' };
  } catch {
    return { ok: false, status: 502, error: 'unavailable' };
  }
}
