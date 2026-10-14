// Tarjeta Dinero (fork fsrhome): textos y HTML de la tarjeta y de su hoja. Puro (sin imports de runtime) para que las
// pruebas lo carguen en Node. Regla de oro (de echo-reloj): ningún monto en el HTML salvo con `reveal: true`; solo
// moneySheetHtml lo recibe. Todo texto de gastos-dashboard pasa por escHtml.
// Spec: homelab-docs/specs/2026-10-14-marco-dinero-design.md
import type { DisplayCardRef, MoneyCategoria, MoneyGasto, MoneyPago, MoneyResponse, MoneyResumen, MoneyRitmoEstado } from '../shared/types';
import { escHtml, SHEET_MS } from './cardsText';

type T = (k: string, v?: Record<string, string | number>) => string;

/** un toque en la hoja revela las cifras 30 s */
export const REVEAL_MS = 30_000;

const PHRASE: Record<MoneyRitmoEstado, string> = { bien: 'moneyFine', rapido: 'moneyFast', pasado: 'moneyOver', 'sin-plan': 'moneyNoPlan' };
const COLOR: Partial<Record<MoneyRitmoEstado, string>> = { bien: 'var(--money-ok)', rapido: 'var(--money-warn)', pasado: 'var(--money-bad)' };

export const ritmoColor = (estado: string): string => COLOR[estado as MoneyRitmoEstado] ?? 'var(--money-dim)';

/** '$1,235' (pesos, siempre es-MX). Solo se llama en ramas que ya comprobaron `reveal`. */
export const formatMoney = (centavos: number): string => `$${Math.round(Math.abs(centavos) / 100).toLocaleString('es-MX')}`;

const daysText = (n: number, t: T): string => t(n === 1 ? 'moneyDay' : 'moneyDays', { n });

/** "Van bien · les queda el 62 % para 6 días" / "Ya se pasaron · faltan 4 días" / "Sin plan de la quincena" — nunca un monto */
export function ritmoPhrase(d: MoneyResumen, t: T): string {
  const r = d.ritmo;
  const q = d.quincena;
  const base = t(PHRASE[r.estado] ?? 'moneyNoPlan');
  if ((r.estado === 'bien' || r.estado === 'rapido') && r.pctQueda !== null && q) {
    return `${base} · ${t('moneyLeft', { pct: Math.round(r.pctQueda * 100), days: daysText(q.diasRestantes, t) })}`;
  }
  if (r.estado === 'pasado' && q) return `${base} · ${t('moneyToGo', { days: daysText(q.diasRestantes, t) })}`;
  return base;
}

export const secondsLeft = (until: number, now: number): number => Math.max(0, Math.ceil((until - now) / 1000));

/** la hoja se cierra a los 90 s, o cuando se oculten las cifras si siguen reveladas */
export const sheetCloseAt = (openedAt: number, revealUntil: number): number => Math.max(openedAt + SHEET_MS, revealUntil);

const pct = (x: number | null): number => Math.round(Math.max(0, Math.min(1, x ?? 0)) * 100);
const dot = (color: string): string => `<span class="mmoney-dot" style="background:${color}"></span>`;
const bar = (fraction: number | null, cls: string): string => `<div class="mmoney-bar${cls ? ` ${cls}` : ''}"><i style="width:${pct(fraction)}%"></i></div>`;

function barClass(estado: string): string {
  if (estado === 'rapido') return 'is-fast';
  if (estado === 'agotada' || estado === 'pasado') return 'is-out';
  return '';
}

function shortDate(ymd: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
  } catch {
    return ymd;
  }
}

function whenText(ymd: string, today: string, t: T, lang: string): string {
  if (ymd === today) return t('cardToday');
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (ymd === y.toISOString().slice(0, 10)) return t('cardYesterday');
  return shortDate(ymd, lang);
}

const who = (p: MoneyGasto['persona']): string => (p ? p[0].toUpperCase() + p.slice(1) : '');

/** HTML de la tarjeta flotante: punto + frase, sin montos. Sin datos → gris. */
export function moneyCardHtml(r: MoneyResponse, ref: DisplayCardRef, t: T): string {
  const line = r.ok
    ? `${dot(ritmoColor(r.data.ritmo.estado))}<span>${escHtml(ritmoPhrase(r.data, t))}</span>`
    : `${dot('var(--money-dim)')}<span>${escHtml(t('moneyNoData'))}</span>`;
  return [
    `<div class="mcard-head"><span class="mcard-title"><span class="mcard-ico">💰</span>${escHtml(ref.name || t('moneyTitle'))}</span></div>`,
    `<div class="mcard-main mmoney-line">${line}</div>`,
    `<div class="mcard-sub">${escHtml(t('moneyTap'))}</div>`,
  ].join('');
}

function catHtml(c: MoneyCategoria, reveal: boolean, t: T): string {
  const amount = reveal
    ? `<span class="mmoney-amt">${escHtml(c.queda >= 0 ? t('moneyFree', { amount: formatMoney(c.queda) }) : t('moneyOverBy', { amount: formatMoney(c.queda) }))}</span>`
    : '';
  const left = c.presupuesto > 0 ? Math.max(0, c.queda) / c.presupuesto : 0;
  return `<li><div class="mmoney-row"><span>${escHtml(c.nombre)}${c.estado === 'agotada' ? ' ⚠' : ''}</span>${amount}</div>${bar(left, barClass(c.estado))}</li>`;
}

function pagoHtml(p: MoneyPago, reveal: boolean, lang: string): string {
  const amount = reveal ? `<span class="mmoney-amt">${escHtml(formatMoney(p.centavos))}</span>` : '';
  return `<li><span class="mmoney-name">${escHtml(p.nombre)}</span><span class="mmoney-when">${escHtml(shortDate(p.vencimiento, lang))}</span>${amount}</li>`;
}

function gastoHtml(g: MoneyGasto, today: string, reveal: boolean, t: T, lang: string): string {
  const amount = reveal ? `<span class="mmoney-amt">${escHtml(formatMoney(g.centavos))}</span>` : '';
  const when = [whenText(g.fecha, today, t, lang), who(g.persona)].filter(Boolean).join(', ');
  return `<li><span class="mmoney-name">${escHtml(g.descripcion)}</span><span class="mmoney-when">${escHtml(when)}</span>${amount}</li>`;
}

/** HTML de la hoja. Única función que escribe montos, y solo con `reveal: true` y datos. */
export function moneySheetHtml(r: MoneyResponse, ref: DisplayCardRef, o: { reveal: boolean; secondsLeft: number }, t: T, lang: string): string {
  const title = escHtml(ref.name || t('moneyTitle'));
  if (!r.ok) {
    return `<div class="msheet-head"><div class="msheet-title">💰 ${title}</div></div>`
      + `<div class="mmoney-empty">${dot('var(--money-dim)')}${escHtml(t('moneyNoData'))}</div>`
      + `<div class="msheet-foot">${escHtml(t('moneyTapHeadClose'))}</div>`;
  }
  const d = r.data;
  const reveal = o.reveal;
  const q = d.quincena;
  const range = q?.rango ? ` · ${escHtml(t('moneyRange', { range: q.rango }))}` : '';
  const figures = reveal && q
    ? escHtml(q.queda >= 0 ? t('moneyLeftAmount', { amount: formatMoney(q.queda), perDay: formatMoney(q.porDia) }) : t('moneyOverBy', { amount: formatMoney(q.queda) }))
    : '';
  const cats = d.categorias.map((c) => catHtml(c, reveal, t)).join('') || `<li class="mmoney-dim">${escHtml(t('moneyNoCats'))}</li>`;
  const pagos = d.proximos.map((p) => pagoHtml(p, reveal, lang)).join('') || `<li class="mmoney-dim">${escHtml(t('moneyNoNext'))}</li>`;
  const gastos = d.ultimos.map((g) => gastoHtml(g, d.today, reveal, t, lang)).join('') || `<li class="mmoney-dim">${escHtml(t('moneyNoLast'))}</li>`;
  const foot = reveal ? t('moneyHideIn', { n: o.secondsLeft }) : t('moneyTapReveal');
  return [
    `<div class="msheet-head"><div class="msheet-title">💰 ${title}${range}</div></div>`,
    '<div class="mmoney-cols">',
    '<div class="mmoney-left mmoney-scroll">',
    `<div class="mmoney-ritmo">${dot(ritmoColor(d.ritmo.estado))}<span>${escHtml(ritmoPhrase(d, t))}</span></div>`,
    `<div class="mmoney-figures">${figures}</div>`,
    `<div class="mmoney-barrow"><span>${escHtml(t('moneyTimeLeft'))}</span>${bar(d.ritmo.pctTiempo, '')}</div>`,
    `<div class="mmoney-barrow"><span>${escHtml(t('moneyMoneyLeft'))}</span>${bar(d.ritmo.pctQueda, barClass(d.ritmo.estado))}</div>`,
    `<h3>${escHtml(t('moneyByCat'))}</h3><p class="mmoney-dim">${escHtml(t('moneyCatNote'))}</p>`,
    `<ul class="mmoney-cats">${cats}</ul>`,
    '</div>',
    '<div class="mmoney-right mmoney-scroll">',
    `<h3>${escHtml(t('moneyNext'))}</h3><ul class="mmoney-list">${pagos}</ul>`,
    `<h3>${escHtml(t('moneyLast'))}</h3><ul class="mmoney-list">${gastos}</ul>`,
    '</div>',
    '</div>',
    `<div class="msheet-foot">${escHtml(foot)}</div>`,
  ].join('');
}
