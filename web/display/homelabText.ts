// Tarjeta Homelab (fork fsrhome): textos y HTML de la tarjeta y de su hoja. Puro (sin imports de runtime) para que las
// pruebas lo carguen en Node. Todo texto de estado-homelab y Frigate pasa por escHtml.
// Spec: homelab-docs/specs/2026-10-14-marco-homelab-design.md
import type { DisplayCardRef, HomelabDetailResponse, HomelabSilenceHasta, HomelabSummary, HomelabWidget, Lang } from '../shared/types';
import { formatTime, LOCALES } from '../shared/i18n';
import { escHtml } from './cardsText';

type T = (k: string, v?: Record<string, string | number>) => string;
type Anoche = NonNullable<HomelabSummary['anoche']>;

export interface SheetUi { open: string | null; saving: boolean; error: boolean }

export const RED_NAMES: Record<string, string> = { adguard: 'AdGuard', meraki: 'Router Meraki', tailscale: 'Tailscale' };

const COLOR: Record<string, string> = { calma: 'var(--hl-ok)', aviso: 'var(--hl-warn)', alerta: 'var(--hl-bad)' };
export const estadoColor = (estado: string): string => COLOR[estado] ?? 'var(--hl-dim)';
/** estado de una ficha de estado-homelab ('ok' | 'aviso' | 'critico' | 'mudo') → clase */
const fichaClass = (estado: string | null | undefined): string => (estado === 'critico' ? 'is-bad' : estado === 'aviso' ? 'is-warn' : estado === 'mudo' ? 'is-dim' : '');

const pct = (n: number | null | undefined): string => (typeof n === 'number' ? `${Math.round(n)} %` : '—');
const time = (ms: number, tz: string): string => formatTime(new Date(ms), tz);

export function agoText(ms: number | null, now: number, t: T): string {
  if (!ms) return '';
  const min = Math.round((now - ms) / 60_000);
  if (min < 60) return t('hlAgoMin', { n: Math.max(min, 1) });
  if (min < 48 * 60) return t('hlAgoH', { n: Math.round(min / 60) });
  return t('hlAgoD', { n: Math.round(min / 1440) });
}

export function untilText(hasta: 'arreglo' | number | null, t: T, lang: string, tz: string): string {
  if (hasta === 'arreglo' || hasta === null) return t('hlSilencedUntilFix');
  const d = new Date(hasta);
  const day = d.toLocaleDateString(LOCALES[lang as Lang] ?? 'es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
  return t('hlSilencedUntil', { date: `${day}, ${time(hasta, tz)}` });
}

/** una fuente muda solo se silencia hasta que se arregle (regla de silencios.py); una silenciada solo se reactiva */
export function silenceChoices(clave: string, silenced: boolean): HomelabSilenceHasta[] {
  if (silenced) return [null];
  return clave.startsWith('fuente:') ? ['arreglo'] : ['arreglo', '1d', '7d'];
}

export function nightLines(a: Anoche, now: number, t: T, tz: string): { texto: string; alto: boolean }[] {
  const out: { texto: string; alto: boolean }[] = [];
  const r = a.respaldo;
  if (!r || r.ok === null) out.push({ texto: t('hlBackupNoData'), alto: false });
  else if (!r.ok) out.push({ texto: t('hlBackupFailed'), alto: true });
  else out.push({ texto: t('hlBackupAt', { time: time(now - (r.edadHoras ?? 0) * 3600_000, tz) }), alto: false });
  if (a.personas === null) out.push({ texto: t('hlCamsNoData'), alto: false });
  else if (!a.personas.length) out.push({ texto: t('hlPeopleNone'), alto: false });
  else {
    const n = a.personas.reduce((s, p) => s + p.n, 0);
    const list = a.personas.map((p) => `${p.nombre} ${p.n}`).join(', ');
    out.push({ texto: t(n === 1 ? 'hlPeopleOne' : 'hlPeopleMany', { n, list }), alto: true });
  }
  if (!a.alertas.length) out.push({ texto: t('hlNightNone'), alto: false });
  for (const x of a.alertas) {
    out.push({ texto: `${x.titulo}${x.abiertaEn ? `, ${time(x.abiertaEn, tz)}` : ''}${x.resuelta ? ` ${t('hlNightPast')}` : ''}`, alto: !x.resuelta });
  }
  return out;
}

const dot = (estado: string): string => `<span class="hl-dot" style="background:${estadoColor(estado)}"></span>`;

export function homelabCardHtml(s: HomelabSummary, ref: DisplayCardRef, t: T, now: number, tz: string): string {
  const title = s.modo === 'anoche' ? escHtml(t('hlNight')) : escHtml(ref.name || t('hlTitle'));
  const head = `<div class="mcard-head"><span class="mcard-title"><span class="mcard-ico">🖥️</span>${title}</span></div>`;
  if (s.estado === 'mudo') return `${head}<div class="mcard-main hl-line">${dot('mudo')}${escHtml(t('hlNoData'))}</div>`;
  const verdict = s.estado === 'calma' && !s.veredicto?.texto ? t('hlAllGood') : s.veredicto?.texto ?? '';
  const main = `<div class="mcard-main hl-line">${dot(s.estado)}${escHtml(verdict)}</div>`;
  if (s.modo === 'anoche' && s.anoche) {
    const li = nightLines(s.anoche, now, t, tz).map((l) => `<li${l.alto ? ' class="is-high"' : ''}>${escHtml(l.texto)}</li>`).join('');
    return `${head}${main}<ul class="hl-list">${li}</ul>`;
  }
  const m = s.metricas;
  const metrics = m
    ? `<div class="mcard-sub hl-metrics"><span>${escHtml(t('hlRam', { v: pct(m.ramPct) }))}</span><span${(m.swapPct ?? 0) >= 90 ? ' class="is-high"' : ''}>${escHtml(t('hlSwap', { v: pct(m.swapPct) }))}</span><span>${escHtml(t('hlDisk', { v: pct(m.discoPct) }))}</span><span>${escHtml(t('hlNet', { v: m.pingMs !== null ? `${Math.round(m.pingMs)} ms` : '—' }))}</span></div>`
    : '';
  const alerts = s.alertas.length ? `<ul class="hl-list">${s.alertas.map((a) => `<li class="is-high">${escHtml(a.titulo)}</li>`).join('')}</ul>` : '';
  return `${head}${main}${metrics}${alerts}`;
}

const ficha = (name: string, value: string, cls = ''): string =>
  `<div class="hl-ficha ${cls}"><dt>${escHtml(name)}</dt><dd>${escHtml(value)}</dd></div>`;

const HASTA_LABEL: Record<string, string> = { arreglo: 'hlUntilFix', '1d': 'hlDay1', '7d': 'hlDay7', null: 'hlReactivate' };

function optionsHtml(clave: string, silenced: boolean, ui: SheetUi, t: T): string {
  if (ui.saving) return `<div class="hl-opts"><span class="hl-note">${escHtml(t('hlSaving'))}</span></div>`;
  if (ui.error) return `<div class="hl-opts"><span class="hl-note is-high">${escHtml(t('hlSaveFailed'))}</span><button class="hl-cancel">${escHtml(t('hlCancel'))}</button></div>`;
  const btns = silenceChoices(clave, silenced).map((h) => `<button class="hl-opt" data-hasta="${String(h)}">${escHtml(t(HASTA_LABEL[String(h)]))}</button>`).join('');
  return `<div class="hl-opts">${btns}<button class="hl-cancel">${escHtml(t('hlCancel'))}</button></div>`;
}

function alertsHtml(w: HomelabWidget, ui: SheetUi, t: T, lang: string, now: number, tz: string): string {
  const active = w.alertas.map((a) => {
    const sub = [a.dominio, agoText(a.abiertaEn, now, t), t('hlTapSilence')].filter(Boolean).join(' · ');
    const opts = ui.open === a.clave ? optionsHtml(a.clave, false, ui, t) : '';
    return `<li class="hl-alert ${a.severidad === 'critica' ? 'is-bad' : 'is-warn'}" data-clave="${escHtml(a.clave)}"><b>${escHtml(a.titulo)}</b><span>${escHtml(sub)}</span>${opts}</li>`;
  }).join('') || `<li class="hl-alert is-ok"><b>${escHtml(t('hlNoAlerts'))}</b><span>${escHtml(t('hlNoAlertsSub'))}</span></li>`;
  const silenced = w.silenciadas.map((a) => {
    const opts = ui.open === a.clave ? optionsHtml(a.clave, true, ui, t) : '';
    return `<li class="hl-alert is-dim" data-clave="${escHtml(a.clave)}" data-silenced="1"><b>🔕 ${escHtml(a.titulo)}</b><span>${escHtml(untilText(a.hasta, t, lang, tz))}</span>${opts}</li>`;
  }).join('');
  return `<section><h3>${escHtml(t('hlAlerts'))}</h3><ul class="hl-alerts">${active}</ul>${silenced ? `<h3>${escHtml(t('hlSilenced'))}</h3><ul class="hl-alerts">${silenced}</ul>` : ''}</section>`;
}

function serverHtml(w: HomelabWidget, t: T): string {
  const s = w.sistema;
  const server = !s || s.estado === 'mudo'
    ? ficha(t('hlServer'), t('hlNoDataShort'), 'is-dim')
    : ficha(t('hlCpu'), pct(s.cpu))
      + ficha('RAM', s.ramUsadaGb !== null && s.ramTotalGb !== null ? t('hlRamOf', { used: s.ramUsadaGb.toFixed(1), total: Math.round(s.ramTotalGb) }) : pct(s.ramPct))
      + ficha('Swap', pct(s.swapPct), (s.swapPct ?? 0) >= 90 ? 'is-warn' : '')
      + ficha(t('hlLoad'), s.load !== null ? s.load.toFixed(2) : '—')
      + ficha(t('hlTemp'), s.tempC !== null ? `${Math.round(s.tempC)}°` : '—')
      + ficha(t('hlUp'), s.uptimeS ? t('hlDays', { n: Math.floor(s.uptimeS / 86400) }) : '—');
  const discos = w.discos.map((d) => {
    const extra = d.saludSmartOk === false ? ` · ${t('hlSmartBad')}` : d.tempC ? ` · ${d.tempC}°` : '';
    return ficha(d.nombre, `${pct(d.usadoPct)} · ${Math.round(d.usadoGb ?? 0)} / ${Math.round(d.totalGb ?? 0)} GB${extra}`, fichaClass(d.estado));
  }).join('');
  const c = w.contenedores;
  const conts = c ? ficha(t('hlContainers'), `${c.total} · ${c.caidos ? t('hlUnhealthy', { n: c.caidos }) : t('hlAllHealthy')}`, c.caidos ? 'is-warn' : '') : '';
  const r = w.respaldo;
  const backup = r ? ficha(t('hlBackup'), r.ok ? t('hlBackupOk', { h: Math.round(r.edadHoras ?? 0) }) : t('hlBackupBad'), r.ok ? '' : 'is-bad') : '';
  return `<section><h3>${escHtml(t('hlServer'))}</h3><dl class="hl-fichas">${server}</dl><h3>${escHtml(t('hlDisks'))}</h3><dl class="hl-fichas">${discos}${conts}${backup}</dl></section>`;
}

function networkHtml(w: HomelabWidget, t: T): string {
  const isp = w.isp;
  const sp = w.speedtest;
  const net = ficha(t('hlInternet'), isp && isp.pingMs !== null ? t('hlPingLoss', { ms: Math.round(isp.pingMs), pct: isp.perdidaPct ?? 0 }) : t('hlNoDataShort'), fichaClass(isp?.estado))
    + ficha(t('hlSpeed'), sp && sp.bajadaMbps !== null && sp.subidaMbps !== null ? `${Math.round(sp.bajadaMbps)} ↓ / ${Math.round(sp.subidaMbps)} ↑ Mbps` : '—')
    + Object.entries(w.red).map(([k, v]) => ficha(RED_NAMES[k] ?? k, v === 'ok' ? t('hlFine') : v === 'mudo' ? t('hlNoDataShort') : v, v === 'ok' ? '' : fichaClass(v === 'mudo' ? 'mudo' : 'aviso'))).join('');
  return `<section><h3>${escHtml(t('hlNetwork'))}</h3><dl class="hl-fichas">${net}</dl></section>`;
}

export function homelabSheetHtml(r: HomelabDetailResponse, ref: DisplayCardRef, ui: SheetUi, t: T, lang: string, now: number, tz: string): string {
  const name = escHtml(ref.name || t('hlTitle'));
  if (!r.ok) return `<div class="msheet-head"><div class="msheet-title">🖥️ ${name}</div></div><div class="hl-empty">${dot('mudo')}${escHtml(t('hlNoData'))}</div>`;
  const w = r.data;
  const estado = ({ ok: 'calma', aviso: 'aviso', critico: 'alerta' } as Record<string, string>)[w.veredicto.estado] ?? 'aviso';
  const head = `<div class="msheet-head"><div class="msheet-title">🖥️ ${name}</div><div class="hl-verdict">${dot(estado)}${escHtml(w.veredicto.texto)}</div></div>`;
  return `${head}<div class="hl-cols"><div class="hl-scroll">${alertsHtml(w, ui, t, lang, now, tz)}</div><div class="hl-scroll">${serverHtml(w, t)}${networkHtml(w, t)}</div></div>`;
}
