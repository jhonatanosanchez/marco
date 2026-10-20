// Tarjeta Organización (fork fsrhome): reglas puras. Lista cerrada de lo que llega de `organizacion` y el resumen con
// su firma. Spec: homelab-docs/specs/2026-10-19-panel-organizacion-design.md §6
const ID = /^#[A-Z]\d{1,5}$/;
const SEV = new Set(['info', 'atencion', 'alta']);
const PESO = { alta: 0, atencion: 1, info: 2 };
const MAX = 20;
const corto = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);

/** → { pendientes, altas24h } o null si la forma no es la esperada */
export function pickOrg(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pendientes) || !Array.isArray(raw.altas24h)) return null;
  const pendientes = raw.pendientes
    .filter((p) => p && typeof p.id === 'string' && ID.test(p.id) && SEV.has(p.severidad))
    .slice(0, MAX)
    .map((p) => ({ id: p.id, lider: corto(p.lider, 20) ?? '', emoji: corto(p.emoji, 8) ?? '', severidad: p.severidad,
      en: corto(p.en, 30) ?? '', resumen: corto(p.resumen, 140), accion: corto(p.accion, 140), estado: corto(p.estado, 20) ?? '' }));
  const altas24h = raw.altas24h.filter((x) => typeof x === 'string' && ID.test(x)).slice(0, MAX);
  return { pendientes, altas24h };
}

/** estado, firma (cambia con los ids, no con los textos) y hasta 5 filas para la tarjeta y la hoja */
export function orgSummary(data) {
  if (!data) return { estado: 'mudo', firma: 'mudo||', accionables: 0, pendientes: [], altas: 0 };
  const acc = data.pendientes.filter((p) => p.estado === 'pendiente');
  const estado = acc.some((p) => p.severidad === 'alta') || data.altas24h.length ? 'alerta' : acc.length ? 'aviso' : 'calma';
  const firma = `${estado}|${acc.map((p) => p.id).sort().join(',')}|${[...data.altas24h].sort().join(',')}`;
  const orden = [...data.pendientes].sort((a, b) => Number(b.estado === 'pendiente') - Number(a.estado === 'pendiente')
    || PESO[a.severidad] - PESO[b.severidad] || b.en.localeCompare(a.en));
  return { estado, firma, accionables: acc.length, pendientes: orden.slice(0, 5), altas: data.altas24h.length };
}
