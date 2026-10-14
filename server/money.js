// Tarjeta Dinero (fork fsrhome): el resumen de la quincena de gastos-dashboard (/api/echo/resumen, cabecera
// X-Echo-Token). Copia de 5 min; con la fuente caída, la última buena mientras tenga ≤ 30 min; si no, null.
// El token vive en el entorno (GASTOS_ECHO_TOKEN, /opt/stacks/marco/.env): nunca se registra ni sale de aquí.
// Spec: homelab-docs/specs/2026-10-14-marco-dinero-design.md
import { sanitizeResumen } from './core/moneyCore.js';

export const MONEY_CACHE_MS = 5 * 60_000;
export const MONEY_STALE_MS = 30 * 60_000;
const TIMEOUT_MS = 8000;
const UA = 'marco-cards';

/** { at, data } de la última lectura buena */
let copy = null;
/** petición en curso (dos pantallas a la vez no duplican) */
let inflight = null;
let warned = false;

export function _resetMoney() {
  copy = null;
  inflight = null;
  warned = false;
}

export const gastosSource = (env = process.env) => ({
  url: String(env.GASTOS_URL || 'http://gastos_dashboard:4200').replace(/\/+$/, ''),
  token: String(env.GASTOS_ECHO_TOKEN || ''),
});

export const moneyConfigured = (env = process.env) => gastosSource(env).token !== '';

/** → { at, data } (data = resumen saneado con `today`) o null sin datos. `today` = YYYY-MM-DD de la zona de Marco. */
export async function loadMoney(now = Date.now(), env = process.env, today = new Date(now).toISOString().slice(0, 10)) {
  if (copy && now - copy.at < MONEY_CACHE_MS) return copy;
  const { url, token } = gastosSource(env);
  if (!token) {
    if (!warned) { warned = true; console.warn('[cards] Dinero: falta GASTOS_ECHO_TOKEN; la tarjeta sale sin datos'); }
    return null;
  }
  if (!inflight) {
    inflight = (async () => {
      try {
        const r = await fetch(`${url}/api/echo/resumen`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { 'x-echo-token': token, accept: 'application/json', 'user-agent': UA },
        });
        if (!r.ok) throw new Error(`http ${r.status}`);
        const data = sanitizeResumen(await r.json(), today);
        if (!data) throw new Error('forma inesperada');
        copy = { at: now, data };
      } catch {
        // se queda la copia anterior (si la hay)
      } finally {
        inflight = null;
      }
    })();
  }
  await inflight;
  return copy && now - copy.at <= MONEY_STALE_MS ? copy : null;
}
