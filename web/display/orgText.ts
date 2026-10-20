// Tarjeta Organización (fork fsrhome): HTML de la tarjeta y de su hoja. Puro, para que las pruebas lo carguen en Node.
// Todo texto de los líderes pasa por escHtml. Spec: homelab-docs/specs/2026-10-19-panel-organizacion-design.md §6
import type { DisplayCardRef, OrgDetailResponse, OrgPendiente, OrgSummary } from '../shared/types';
import { escHtml } from './cardsText';

type T = (k: string, v?: Record<string, string | number>) => string;
export interface OrgSheetUi { confirm: string | null; saving: boolean; sent: string[]; error: string | null }

const COLOR: Record<string, string> = { calma: 'var(--hl-ok)', aviso: 'var(--hl-warn)', alerta: 'var(--hl-bad)', alta: 'var(--hl-bad)', atencion: 'var(--hl-warn)', info: 'var(--hl-dim)' };
const dot = (k: string): string => `<span class="hl-dot" style="background:${COLOR[k] ?? 'var(--hl-dim)'}"></span>`;
const ESTADO_TXT: Record<string, string> = { aplicando: 'orgStateAplicando', fallo: 'orgStateFallo', por_confirmar: 'orgStatePorConfirmar', sin_cierre: 'orgStateSinCierre' };
const texto = (p: OrgPendiente, t: T): string => (p.lider === 'arce' ? t('orgArce') : p.resumen ?? p.accion ?? p.id);
const head = (ref: DisplayCardRef, t: T): string =>
  `<div class="mcard-head"><span class="mcard-title"><span class="mcard-ico">🧭</span>${escHtml(ref.name || t('orgTitle'))}</span></div>`;

export function orgCardHtml(s: OrgSummary, ref: DisplayCardRef, t: T): string {
  if (s.estado === 'mudo') return `${head(ref, t)}<div class="mcard-main hl-line">${dot('mudo')}${escHtml(t('orgNoData'))}</div>`;
  if (s.estado === 'calma') return `${head(ref, t)}<div class="mcard-main hl-line">${dot('calma')}${escHtml(t('orgNone'))}</div>`;
  const main = s.accionables === 0 ? t('orgHighOnly') : s.accionables === 1 ? t('orgPendingOne') : t('orgPendingMany', { n: s.accionables });
  const li = s.pendientes.filter((p) => p.estado === 'pendiente').slice(0, 2)
    .map((p) => `<li>${escHtml(p.emoji)} ${escHtml(texto(p, t))}</li>`).join('');
  return `${head(ref, t)}<div class="mcard-main hl-line">${dot(s.estado)}${escHtml(main)}</div>${li ? `<ul class="hl-list">${li}</ul>` : ''}`;
}

function filaHtml(p: OrgPendiente, ui: OrgSheetUi, t: T): string {
  const sub = p.accion ? `<span>→ ${escHtml(p.accion)}</span>` : '';
  let pie = '';
  if (ui.sent.includes(p.id) || p.estado === 'por_confirmar') pie = `<div class="org-note">${escHtml(t('orgSent'))}</div>`;
  else if (p.estado !== 'pendiente') pie = `<div class="org-note">${escHtml(t(ESTADO_TXT[p.estado] ?? 'orgStateAplicando'))}</div>`;
  else if (ui.confirm === p.id) {
    pie = ui.saving ? `<div class="org-note">…</div>`
      : `<div class="hl-opts"><button class="org-si" data-si="${escHtml(p.id)}">${escHtml(t('orgConfirm'))}</button><button class="hl-cancel">${escHtml(t('orgCancel'))}</button></div>`;
  } else pie = `<div class="hl-opts"><button class="org-aprobar" data-aprobar="${escHtml(p.id)}">${escHtml(t('orgApprove'))}</button></div>`;
  return `<li class="hl-alert ${p.severidad === 'alta' ? 'is-bad' : p.severidad === 'atencion' ? 'is-warn' : 'is-dim'}"><b>${escHtml(p.emoji)} ${escHtml(texto(p, t))}</b>${sub}${pie}</li>`;
}

export function orgSheetHtml(r: OrgDetailResponse, ref: DisplayCardRef, ui: OrgSheetUi, t: T, _now: number): string {
  const name = escHtml(ref.name || t('orgTitle'));
  const top = `<div class="msheet-head"><div class="msheet-title">🧭 ${name}</div></div>`;
  if (!r.ok) return `${top}<div class="hl-empty">${dot('mudo')}${escHtml(t('orgNoData'))}</div>`;
  const filas = r.data.pendientes;
  if (!filas.length) {
    // sin propuestas pero con un informe de severidad alta reciente: la hoja dice lo mismo que la tarjeta
    if (r.data.altas24h.length) return `${top}<div class="hl-empty">${dot('alerta')}${escHtml(t('orgHighOnly'))}</div>`;
    return `${top}<div class="hl-empty">${dot('calma')}${escHtml(t('orgNone'))}</div>`;
  }
  const error = ui.error ? `<div class="org-note is-bad">${escHtml(t('orgFailed', { msg: ui.error }))}</div>` : '';
  return `${top}<div class="hl-scroll">${error}<ul class="hl-alerts">${filas.map((p) => filaHtml(p, ui, t)).join('')}</ul></div>`;
}
