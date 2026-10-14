// Tarjeta Homelab (fork fsrhome): reglas puras — modo, ventana de la noche, lista cerrada, conteo, estado y firma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homelabMode, nightWindow, pickWidget, countPersons, homelabSummary } from '../core/homelabCore.js';

const TZ = 'America/Mexico_City'; // UTC-6 todo el año
const at = (hhmm, day = '2026-10-14') => Date.parse(`${day}T${hhmm}:00-06:00`);
const WIDGET = (over = {}) => ({
  ahora: 1, veredicto: { texto: 'Todo bien', estado: 'ok' }, alertas: [], silenciadas: [],
  sistema: { cpu: 10, ramPct: 50, ramUsadaGb: 11, ramTotalGb: 22, swapPct: 20, discoPct: 55, load: 1, tempC: 50, uptimeS: 86400 * 3, estado: 'ok', extra: 1 },
  contenedores: { total: 66, caidos: 0 }, discos: [{ punto: '/', nombre: 'SSD', usadoPct: 55, usadoGb: 127, totalGb: 231, saludSmartOk: true, tempC: 44, estado: 'ok', tipo: 'nvme' }],
  respaldo: { nombre: 'x.tar.gz', ok: true, edadHoras: 3, estado: 'ok' }, isp: { estado: 'ok', etiqueta: 'Saludable', pingMs: 10.5, perdidaPct: 0 },
  speedtest: { bajadaMbps: 360, subidaMbps: 364, pingMs: 5 }, red: { adguard: 'ok', meraki: 'ok', tailscale: 'ok' }, noche: [], fuentesTotal: 7,
  ...over,
});
const ALERTA = (clave, titulo = clave, severidad = 'aviso') => ({ severidad, titulo, dominio: 'Homelab', abiertaEn: 1000, clave });

test('homelabMode: 5:00–7:59 es "anoche" (bordes)', () => {
  assert.equal(homelabMode(at('04:59'), TZ), 'ahora');
  assert.equal(homelabMode(at('05:00'), TZ), 'anoche');
  assert.equal(homelabMode(at('07:59'), TZ), 'anoche');
  assert.equal(homelabMode(at('08:00'), TZ), 'ahora');
});

test('nightWindow: 22:00 de ayer a 6:00 de hoy, hora local (cruza el mes)', () => {
  assert.deepEqual(nightWindow(at('06:30', '2026-11-01'), TZ), { after: at('22:00', '2026-10-31') / 1000, before: at('06:00', '2026-11-01') / 1000 });
});

test('pickWidget: lista cerrada; forma rara → null', () => {
  const w = pickWidget(WIDGET({ alertas: [{ ...ALERTA('swap'), secreto: 'x' }], nuevoCampo: { a: 1 } }));
  assert.equal('nuevoCampo' in w, false);
  assert.equal('fuentesTotal' in w, false);
  assert.equal('extra' in w.sistema, false);
  assert.equal('punto' in w.discos[0], false);
  assert.equal('nombre' in w.respaldo, false);
  assert.equal('etiqueta' in w.isp, false);
  assert.equal('pingMs' in w.speedtest, false);
  assert.deepEqual(w.alertas, [ALERTA('swap')]);
  assert.equal(pickWidget(null), null);
  assert.equal(pickWidget({ veredicto: 'ok', alertas: [] }), null);
  assert.equal(pickWidget({ veredicto: { texto: 'x', estado: 'ok' } }), null);
  // una alerta sin clave no pasa (sin clave no se puede silenciar ni firmar)
  assert.deepEqual(pickWidget(WIDGET({ alertas: [{ severidad: 'aviso', titulo: 'x' }] })).alertas, []);
});

test('countPersons: solo personas, por cámara, nombre de la config, orden por cuenta', () => {
  const cams = [{ id: 'patio', name: 'Patio' }, { id: 'cochera', name: 'Cochera' }];
  const ev = (camera, label = 'person') => ({ id: 'e', camera, label, start_time: 1 });
  assert.deepEqual(countPersons([ev('patio'), ev('cochera'), ev('cochera'), ev('patio', 'car'), ev('otra')], cams), [
    { camara: 'cochera', nombre: 'Cochera', n: 2 },
    { camara: 'patio', nombre: 'Patio', n: 1 },
    { camara: 'otra', nombre: 'otra', n: 1 },
  ]);
});

test('homelabSummary: calma, aviso, alerta, mudo y estado desconocido', () => {
  const opts = { now: at('12:00'), tz: TZ };
  assert.equal(homelabSummary(pickWidget(WIDGET()), null, opts).estado, 'calma');
  assert.equal(homelabSummary(pickWidget(WIDGET({ veredicto: { texto: 'x', estado: 'aviso' }, alertas: [ALERTA('swap')] })), null, opts).estado, 'aviso');
  assert.equal(homelabSummary(pickWidget(WIDGET({ veredicto: { texto: 'x', estado: 'critico' }, alertas: [ALERTA('respaldo', 'r', 'critica')] })), null, opts).estado, 'alerta');
  assert.equal(homelabSummary(pickWidget(WIDGET({ veredicto: { texto: 'x', estado: 'raro' } })), null, opts).estado, 'aviso');
  const m = homelabSummary(null, null, opts);
  assert.equal(m.estado, 'mudo');
  assert.equal(m.veredicto, null);
});

test('homelabSummary: máximo 2 alertas, la crítica primero; métricas con ping', () => {
  const w = pickWidget(WIDGET({ veredicto: { texto: 'x', estado: 'critico' }, alertas: [ALERTA('a'), ALERTA('b'), ALERTA('c', 'c', 'critica')] }));
  const s = homelabSummary(w, null, { now: at('12:00'), tz: TZ });
  assert.deepEqual(s.alertas.map((a) => a.clave), ['c', 'a']);
  assert.deepEqual(s.metricas, { ramPct: 50, swapPct: 20, discoPct: 55, pingMs: 10.5 });
  assert.equal(homelabSummary(pickWidget(WIDGET({ sistema: { estado: 'mudo' } })), null, { now: at('12:00'), tz: TZ }).metricas, null);
});

test('firma: cambia con una clave nueva o el estado; no con el título', () => {
  const opts = { now: at('12:00'), tz: TZ };
  const s = (alertas) => homelabSummary(pickWidget(WIDGET({ veredicto: { texto: 'x', estado: 'aviso' }, alertas })), null, opts).firma;
  assert.equal(s([ALERTA('swap', 'Swap al 98 %')]), s([ALERTA('swap', 'Swap al 97 %')]));
  assert.notEqual(s([ALERTA('swap')]), s([ALERTA('swap'), ALERTA('kuma:3')]));
  assert.equal(s([ALERTA('b'), ALERTA('a')]), s([ALERTA('a'), ALERTA('b')]));
  assert.match(s([ALERTA('swap')]), /^ahora\|aviso\|swap$/);
});

test('anoche: noche tranquila = calma; personas o alertas = aviso; respaldo falló = alerta', () => {
  const opts = { now: at('06:30'), tz: TZ };
  const quiet = homelabSummary(pickWidget(WIDGET()), { personas: [] }, opts);
  assert.equal(quiet.modo, 'anoche');
  assert.equal(quiet.estado, 'calma');
  assert.deepEqual(quiet.anoche, { respaldo: { ok: true, edadHoras: 3 }, personas: [], alertas: [] });
  assert.equal(homelabSummary(pickWidget(WIDGET()), { personas: [{ camara: 'patio', nombre: 'Patio', n: 2 }] }, opts).estado, 'aviso');
  const noche = [{ titulo: 'Kuma', abiertaEn: 1, resuelta: true }, { titulo: 'A', abiertaEn: 2, resuelta: false }, { titulo: 'B', abiertaEn: 3, resuelta: true }];
  const n = homelabSummary(pickWidget(WIDGET({ noche })), { personas: null }, opts);
  assert.equal(n.estado, 'aviso');
  assert.deepEqual(n.anoche.alertas.map((a) => a.titulo), ['A', 'B']); // las últimas 2
  assert.equal(n.anoche.personas, null);
  assert.equal(homelabSummary(pickWidget(WIDGET({ respaldo: { ok: false, edadHoras: 30, estado: 'critico' } })), { personas: [] }, opts).estado, 'alerta');
  assert.match(quiet.firma, /^anoche\|calma\|$/);
  // fuera de la ventana no hay bloque "anoche"
  assert.equal(homelabSummary(pickWidget(WIDGET()), { personas: [] }, { now: at('12:00'), tz: TZ }).anoche, null);
});
