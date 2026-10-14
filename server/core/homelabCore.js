// Tarjeta Homelab (fork fsrhome): reglas puras sobre estado-homelab (/api/widget) y los eventos de Frigate de la noche.
// Veredicto, severidades y claves los pone estado-homelab; aquí solo se elige qué ve la pantalla (lista cerrada), si la
// tarjeta tiene algo que decir y su firma. "No lo sé" no es "está bien": sin widget el estado es 'mudo', nunca 'calma'.
// Spec: homelab-docs/specs/2026-10-14-marco-homelab-design.md
const ANOCHE_DESDE = 5;
const ANOCHE_HASTA = 8;
const NOCHE_EMPIEZA = 22;
const NOCHE_TERMINA = 6;
const MAX_ROWS = 40;
const ESTADO = { ok: 'calma', aviso: 'aviso', critico: 'alerta' };

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (isNum(v) ? v : null);
const text = (v, max = 160) => (typeof v === 'string' ? v.slice(0, max) : null);
const rows = (v, fn, max = MAX_ROWS) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : []);

const fmts = new Map();
/** partes locales de `ms` en `tz` */
function parts(ms, tz) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    fmts.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute };
}

/** ms del instante local `y-mo-d h:00` en `tz` (Date.UTC acomoda d = 0 al mes anterior) */
function zoned(y, mo, d, h, tz) {
  const want = Date.UTC(y, mo - 1, d, h);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const p = parts(guess, tz);
    guess += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  }
  return guess;
}

export function homelabMode(now, tz) {
  const h = parts(now, tz).h;
  return h >= ANOCHE_DESDE && h < ANOCHE_HASTA ? 'anoche' : 'ahora';
}

/** la noche que resume "Anoche": 22:00 de ayer → 6:00 de hoy (segundos epoch, como pide Frigate) */
export function nightWindow(now, tz) {
  const p = parts(now, tz);
  return {
    after: Math.floor(zoned(p.y, p.mo, p.d - 1, NOCHE_EMPIEZA, tz) / 1000),
    before: Math.floor(zoned(p.y, p.mo, p.d, NOCHE_TERMINA, tz) / 1000),
  };
}

const alerta = (a) => (isObj(a) && text(a.clave, 120) && text(a.titulo)
  ? { severidad: text(a.severidad, 20) ?? 'aviso', titulo: text(a.titulo), dominio: text(a.dominio, 60), abiertaEn: num(a.abiertaEn), clave: text(a.clave, 120) }
  : null);
const silenciada = (a) => (isObj(a) && text(a.clave, 120) && text(a.titulo)
  ? { clave: text(a.clave, 120), titulo: text(a.titulo), hasta: a.hasta === 'arreglo' ? 'arreglo' : num(a.hasta) }
  : null);
const disco = (d) => (isObj(d) && text(d.nombre, 60)
  ? { nombre: text(d.nombre, 60), usadoPct: num(d.usadoPct), usadoGb: num(d.usadoGb), totalGb: num(d.totalGb), saludSmartOk: typeof d.saludSmartOk === 'boolean' ? d.saludSmartOk : null, tempC: num(d.tempC), estado: text(d.estado, 20) ?? 'ok' }
  : null);
const nocheAlerta = (a) => (isObj(a) && text(a.titulo) ? { titulo: text(a.titulo), abiertaEn: num(a.abiertaEn), resuelta: a.resuelta === true } : null);

function sistema(s) {
  if (!isObj(s)) return null;
  const keys = ['cpu', 'ramPct', 'ramUsadaGb', 'ramTotalGb', 'swapPct', 'discoPct', 'load', 'tempC', 'uptimeS'];
  return { ...Object.fromEntries(keys.map((k) => [k, num(s[k])])), estado: text(s.estado, 20) ?? 'ok' };
}

/** Lo único de /api/widget que puede llegar a una pantalla. null si la forma no es la esperada. */
export function pickWidget(raw) {
  if (!isObj(raw) || !isObj(raw.veredicto) || !Array.isArray(raw.alertas)) return null;
  const c = raw.contenedores;
  const r = raw.respaldo;
  const isp = raw.isp;
  const sp = raw.speedtest;
  return {
    veredicto: { texto: text(raw.veredicto.texto) ?? '', estado: text(raw.veredicto.estado, 20) ?? '' },
    alertas: rows(raw.alertas, alerta),
    silenciadas: rows(raw.silenciadas, silenciada),
    sistema: sistema(raw.sistema),
    discos: rows(raw.discos, disco, 8),
    contenedores: isObj(c) && isNum(c.total) ? { total: c.total, caidos: isNum(c.caidos) ? c.caidos : 0 } : null,
    respaldo: isObj(r) ? { ok: typeof r.ok === 'boolean' ? r.ok : null, edadHoras: num(r.edadHoras), estado: text(r.estado, 20) ?? '' } : null,
    isp: isObj(isp) ? { estado: text(isp.estado, 20) ?? '', pingMs: num(isp.pingMs), perdidaPct: num(isp.perdidaPct) } : null,
    speedtest: isObj(sp) ? { bajadaMbps: num(sp.bajadaMbps), subidaMbps: num(sp.subidaMbps) } : null,
    red: isObj(raw.red) ? Object.fromEntries(Object.entries(raw.red).slice(0, 8).filter(([k, v]) => /^[a-z0-9_-]{1,30}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 20)])) : {},
    noche: rows(raw.noche, nocheAlerta),
  };
}

/** personas por cámara en los eventos de Frigate (ya validados), con el nombre de la config de Marco */
export function countPersons(events, cameras) {
  const names = new Map((cameras ?? []).map((c) => [c.id, c.name || c.id]));
  const n = new Map();
  for (const e of events ?? []) if (e.label === 'person') n.set(e.camera, (n.get(e.camera) ?? 0) + 1);
  return [...n.entries()].map(([camara, k]) => ({ camara, nombre: names.get(camara) ?? camara, n: k })).sort((a, b) => b.n - a.n);
}

const grave = (a) => (a.severidad === 'critica' ? 0 : 1);

/** Lo que pinta la tarjeta, si tiene algo que decir (`estado`) y su firma (qué la hace "nueva"). */
export function homelabSummary(widget, night, { now, tz }) {
  const modo = homelabMode(now, tz);
  if (!widget) return { estado: 'mudo', firma: `${modo}|mudo|`, modo, veredicto: null, metricas: null, alertas: [], anoche: null };
  // un estado que Marco no conoce cuenta como aviso: nunca se pinta verde lo que no se entiende
  let estado = ESTADO[widget.veredicto.estado] ?? 'aviso';
  const s = widget.sistema;
  const metricas = s && s.estado !== 'mudo' ? { ramPct: s.ramPct, swapPct: s.swapPct, discoPct: s.discoPct, pingMs: widget.isp?.pingMs ?? null } : null;
  let anoche = null;
  if (modo === 'anoche') {
    const r = widget.respaldo;
    anoche = { respaldo: r ? { ok: r.ok, edadHoras: r.edadHoras } : null, personas: night?.personas ?? null, alertas: widget.noche.slice(-2) };
    const personas = (anoche.personas ?? []).reduce((t, p) => t + p.n, 0);
    if (r && r.ok === false) estado = 'alerta';
    else if (estado === 'calma' && (personas > 0 || anoche.alertas.length > 0)) estado = 'aviso';
  }
  const claves = widget.alertas.map((a) => a.clave).sort().join(',');
  return {
    estado,
    firma: `${modo}|${estado}|${claves}`,
    modo,
    veredicto: widget.veredicto,
    metricas,
    alertas: [...widget.alertas].sort((a, b) => grave(a) - grave(b)).slice(0, 2),
    anoche,
  };
}
