// tarjeta y hoja de Organización (fork fsrhome)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWebModules } from './webModules.js';

const [ot, i18n] = await loadWebModules('/web/display/orgText.ts', '/web/shared/i18n.ts');
const t = i18n.makeT('es');
const REF = { id: 'k_org', type: 'org', name: 'Organización', everyMin: 30 };
const EVIL = '<img src=x onerror=alert(1)>';
const P = (o = {}) => ({ id: '#C1', lider: 'centi', emoji: '🛡️', severidad: 'alta', en: '2026-10-19T17:00:00.000Z', resumen: `Token ${EVIL}`, accion: 'Rotar', estado: 'pendiente', ...o });
const SUM = (o = {}) => ({ estado: 'alerta', firma: 'alerta|#C1|', accionables: 1, pendientes: [P()], altas: 0, ...o });
const UI = (o = {}) => ({ confirm: null, saving: false, sent: [], error: null, ...o });

test('tarjeta: cuenta, primeras 2 con emoji y escape', () => {
  const h = ot.orgCardHtml(SUM({ accionables: 3, pendientes: [P(), P({ id: '#A2', lider: 'atalaya', emoji: '🛰️', resumen: 'Kuma' }), P({ id: '#N3' })] }), REF, t);
  assert.match(h, /3 propuestas pendientes/);
  assert.match(h, /🛰️/);
  assert.equal((h.match(/<li/g) ?? []).length, 2);
  assert.doesNotMatch(h, /<img/);
});

test('tarjeta: Arce sin texto, gris sin datos, calma "Sin pendientes", solo altas', () => {
  assert.match(ot.orgCardHtml(SUM({ pendientes: [P({ lider: 'arce', emoji: '🍁', resumen: null, accion: null })] }), REF, t), /Propuesta de Arce/);
  assert.match(ot.orgCardHtml(SUM({ estado: 'mudo', accionables: 0, pendientes: [] }), REF, t), /Sin datos de la organización/);
  assert.match(ot.orgCardHtml(SUM({ estado: 'calma', accionables: 0, pendientes: [] }), REF, t), /Sin pendientes/);
  assert.match(ot.orgCardHtml(SUM({ accionables: 0, pendientes: [], altas: 1 }), REF, t), /severidad alta/);
});

test('hoja: Aprobar solo en pendientes; confirmación en línea; enviada; guardando sin botones activos; error escapado', () => {
  const r = { ok: true, at: 0, data: { pendientes: [P(), P({ id: '#A2', estado: 'aplicando' })], altas24h: [] } };
  const base = ot.orgSheetHtml(r, REF, UI(), t, 0);
  assert.equal((base.match(/data-aprobar=/g) ?? []).length, 1);
  assert.match(base, /Aplicando…/);
  assert.doesNotMatch(base, /<img/);
  assert.match(ot.orgSheetHtml(r, REF, UI({ confirm: '#C1' }), t, 0), /Sí, mándame la pregunta/);
  assert.match(ot.orgSheetHtml(r, REF, UI({ sent: ['#C1'] }), t, 0), /Esperando tu sí en WhatsApp/);
  assert.doesNotMatch(ot.orgSheetHtml(r, REF, UI({ confirm: '#C1', saving: true }), t, 0), /data-si=/);
  assert.doesNotMatch(ot.orgSheetHtml(r, REF, UI({ error: EVIL }), t, 0), /<img/);
  assert.match(ot.orgSheetHtml({ ok: false }, REF, UI(), t, 0), /Sin datos de la organización/);
});

test('revisión final C: «Propuesta de Arce» solo para Arce; otro líder sin resumen muestra su acción', () => {
  const s = SUM({ pendientes: [P({ lider: 'atalaya', emoji: '🛰️', resumen: null, accion: 'Crear monitor' })] });
  const h = ot.orgCardHtml(s, REF, t);
  assert.doesNotMatch(h, /Propuesta de Arce/);
  assert.match(h, /Crear monitor/);
});

test('revisión final C: hoja solo con altas de 24 h no dice "Sin pendientes"', () => {
  const h = ot.orgSheetHtml({ ok: true, at: 0, data: { pendientes: [], altas24h: ['#A9'] } }, REF, UI(), t, 0);
  assert.doesNotMatch(h, /Sin pendientes/);
  assert.match(h, /severidad alta/);
});
