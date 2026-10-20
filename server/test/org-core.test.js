// reglas puras de la tarjeta Organización (fork fsrhome)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickOrg, orgSummary } from '../core/orgCore.js';

const P = (o = {}) => ({ id: '#C1', lider: 'centi', emoji: '🛡️', severidad: 'atencion', en: '2026-10-19T17:00:00.000Z', resumen: 'r', accion: 'a', estado: 'pendiente', ...o });

test('pickOrg: lista cerrada, recortes y forma', () => {
  const d = pickOrg({ ahora: 'x', pendientes: [{ ...P(), secreto: 'no', resumen: 'r'.repeat(500) }], altas24h: ['#A1', 5], extra: 1 });
  assert.deepEqual(Object.keys(d.pendientes[0]).sort(), ['accion', 'emoji', 'en', 'estado', 'id', 'lider', 'resumen', 'severidad']);
  assert.equal(d.pendientes[0].resumen.length, 140);
  assert.deepEqual(d.altas24h, ['#A1']);
  assert.equal(pickOrg({ pendientes: 'x' }), null);
  assert.equal(pickOrg(null), null);
  assert.equal(pickOrg({ pendientes: [P({ id: '<b>' })], altas24h: [] }).pendientes.length, 0);
});

test('orgSummary: mudo, calma, aviso, alerta y firma estable', () => {
  assert.equal(orgSummary(null).estado, 'mudo');
  assert.equal(orgSummary({ pendientes: [P({ estado: 'aplicando' })], altas24h: [] }).estado, 'calma');
  const a = orgSummary({ pendientes: [P({ id: '#C2' }), P({ id: '#A1' })], altas24h: [] });
  assert.equal(a.estado, 'aviso');
  assert.equal(a.firma, 'aviso|#A1,#C2|');
  assert.equal(a.accionables, 2);
  assert.equal(orgSummary({ pendientes: [P({ severidad: 'alta' })], altas24h: [] }).estado, 'alerta');
  assert.equal(orgSummary({ pendientes: [], altas24h: ['#A9'] }).estado, 'alerta');
  // cambiar el texto no cambia la firma
  assert.equal(orgSummary({ pendientes: [P({ resumen: 'otro' })], altas24h: [] }).firma, orgSummary({ pendientes: [P()], altas24h: [] }).firma);
});

test('orgSummary: hasta 5 pendientes, accionables primero y alta antes', () => {
  const s = orgSummary({ pendientes: [P({ id: '#C1', estado: 'fallo' }), ...Array.from({ length: 6 }, (_, i) => P({ id: `#A${i + 1}`, severidad: i === 3 ? 'alta' : 'info' }))], altas24h: [] });
  assert.equal(s.pendientes.length, 5);
  assert.equal(s.pendientes[0].id, '#A4');
});
