// Tarjeta Dinero (fork fsrhome): saneado del resumen de gastos-dashboard (/api/echo/resumen). Puro, con pruebas.
// A la pantalla llega una lista CERRADA de campos: `semana` y cualquier campo que gastos-dashboard agregue después se
// quedan en el servidor. Spec: homelab-docs/specs/2026-10-14-marco-dinero-design.md
export const RITMO_ESTADOS = ['bien', 'rapido', 'pasado', 'sin-plan'];
export const CATEGORIA_ESTADOS = ['bien', 'rapido', 'agotada'];
export const PERSONAS = ['andrea', 'jhonatan'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 40;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => (isNum(v) ? v : null);
const text = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : null);
const rows = (v, fn) => (Array.isArray(v) ? v.slice(0, MAX_ROWS).map(fn).filter(Boolean) : []);

function quincena(q) {
  if (!isObj(q)) return null;
  const keys = ['diasRestantes', 'diasTotales', 'presupuesto', 'gastado', 'queda', 'porDia'];
  if (!keys.every((k) => isNum(q[k]))) return null;
  return { rango: text(q.rango, 40) ?? '', ...Object.fromEntries(keys.map((k) => [k, q[k]])) };
}

function categoria(c) {
  if (!isObj(c) || !text(c.nombre) || !CATEGORIA_ESTADOS.includes(c.estado)) return null;
  if (![c.presupuesto, c.gastado, c.queda].every(isNum)) return null;
  return { nombre: text(c.nombre), presupuesto: c.presupuesto, gastado: c.gastado, queda: c.queda, pctUsado: numOrNull(c.pctUsado), estado: c.estado };
}

function pago(p) {
  if (!isObj(p) || !text(p.nombre) || !YMD.test(p.vencimiento ?? '') || !isNum(p.centavos)) return null;
  return { nombre: text(p.nombre), vencimiento: p.vencimiento, centavos: p.centavos };
}

function gasto(g) {
  if (!isObj(g) || !text(g.descripcion) || !YMD.test(g.fecha ?? '') || !isNum(g.centavos)) return null;
  return { fecha: g.fecha, descripcion: text(g.descripcion), persona: PERSONAS.includes(g.persona) ? g.persona : null, centavos: g.centavos };
}

/** El resumen saneado con `today` (YYYY-MM-DD de la zona de Marco), o null sin `ritmo` válido. */
export function sanitizeResumen(raw, today) {
  if (!isObj(raw) || !isObj(raw.ritmo) || !RITMO_ESTADOS.includes(raw.ritmo.estado)) return null;
  const r = raw.ritmo;
  return {
    generadoEn: text(raw.generadoEn, 40),
    today,
    quincena: quincena(raw.quincena),
    ritmo: { estado: r.estado, pctQueda: numOrNull(r.pctQueda), pctTiempo: numOrNull(r.pctTiempo) },
    categorias: rows(raw.categorias, categoria),
    proximos: rows(raw.proximos, pago),
    ultimos: rows(raw.ultimos, gasto),
  };
}
