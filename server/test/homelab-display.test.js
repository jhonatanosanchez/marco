// Tarjeta Homelab en la pantalla (fork fsrhome): textos, colores, HTML escapado, Anoche y opciones de silencio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWebModules } from './webModules.js';

const [ht, i18n] = await loadWebModules('/web/display/homelabText.ts', '/web/shared/i18n.ts');
const t = i18n.makeT('es');
const TZ = 'America/Mexico_City';
const NOW = Date.parse('2026-10-14T06:30:00-06:00');
const REF = { id: 'k_homelab', type: 'homelab', name: 'Homelab', everyMin: 10 };
const EVIL = '<img src=x onerror=alert(1)>';
const SUM = (over = {}) => ({
  estado: 'aviso', firma: 'ahora|aviso|swap', modo: 'ahora', veredicto: { texto: 'Una cosa necesita tu atención', estado: 'aviso' },
  metricas: { ramPct: 61.8, swapPct: 100, discoPct: 57.9, pingMs: 10.5 },
  alertas: [{ severidad: 'aviso', titulo: `Swap ${EVIL}`, dominio: 'Homelab', abiertaEn: null, clave: 'swap' }], anoche: null, ...over,
});
const WID = () => ({
  veredicto: { texto: 'Una cosa necesita tu atención', estado: 'aviso' },
  alertas: [{ severidad: 'critica', titulo: 'Bot caído', dominio: 'Kuma', abiertaEn: NOW - 5 * 60_000, clave: 'kuma:3' }, { severidad: 'aviso', titulo: 'Fuente muda', dominio: null, abiertaEn: null, clave: 'fuente:kuma' }],
  silenciadas: [{ clave: 'kuma:58', titulo: 'Evolution', hasta: 'arreglo' }],
  sistema: { cpu: 45, ramPct: 61, ramUsadaGb: 14.1, ramTotalGb: 22.8, swapPct: 100, discoPct: 57, load: 2.56, tempC: 73, uptimeS: 4 * 86400, estado: 'ok' },
  discos: [{ nombre: `SSD ${EVIL}`, usadoPct: 55.2, usadoGb: 127.7, totalGb: 231.2, saludSmartOk: true, tempC: 44, estado: 'ok' }],
  contenedores: { total: 66, caidos: 0 }, respaldo: { ok: true, edadHoras: 11.5, estado: 'ok' },
  isp: { estado: 'ok', pingMs: 10.5, perdidaPct: 0 }, speedtest: { bajadaMbps: 360.2, subidaMbps: 364.7 },
  red: { adguard: 'ok', meraki: 'aviso', tailscale: 'mudo' }, noche: [],
});
const UI = (over = {}) => ({ open: null, saving: false, error: false, ...over });

test('estadoColor: verde, ámbar, rojo y gris (lo desconocido es gris)', () => {
  assert.equal(ht.estadoColor('calma'), 'var(--hl-ok)');
  assert.equal(ht.estadoColor('aviso'), 'var(--hl-warn)');
  assert.equal(ht.estadoColor('alerta'), 'var(--hl-bad)');
  assert.equal(ht.estadoColor('mudo'), 'var(--hl-dim)');
  assert.equal(ht.estadoColor('otro'), 'var(--hl-dim)');
});

test('tarjeta: veredicto, métricas redondeadas, alerta escapada; gris sin datos; calma "Todo bien"', () => {
  const html = ht.homelabCardHtml(SUM(), REF, t, NOW, TZ);
  assert.match(html, /Una cosa necesita tu atención/);
  assert.match(html, /RAM 62 %.*Swap 100 %.*Disco 58 %.*Internet 11 ms/s);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(ht.homelabCardHtml(SUM({ estado: 'mudo', veredicto: null, metricas: null, alertas: [] }), REF, t, NOW, TZ), /Sin datos del homelab/);
  assert.match(ht.homelabCardHtml(SUM({ estado: 'calma', veredicto: { texto: 'Todo bien', estado: 'ok' }, alertas: [] }), REF, t, NOW, TZ), /var\(--hl-ok\)/);
});

test('tarjeta: el punto pinta el veredicto de ahora, no lo que subió la noche (Anoche + "Todo bien" = verde)', () => {
  const card = ht.homelabCardHtml(SUM({ modo: 'anoche', estado: 'aviso', veredicto: { texto: 'Todo bien', estado: 'ok' }, alertas: [], anoche: { respaldo: { ok: true, edadHoras: 3 }, personas: [{ camara: 'patio', nombre: 'Patio', n: 1 }], alertas: [] } }), REF, t, NOW, TZ);
  assert.match(card, /var\(--hl-ok\)/);
  assert.doesNotMatch(card, /var\(--hl-warn\)/);
  // un veredicto que Marco no conoce sigue siendo ámbar
  assert.match(ht.homelabCardHtml(SUM({ veredicto: { texto: 'x', estado: 'raro' } }), REF, t, NOW, TZ), /var\(--hl-warn\)/);
});

test('Anoche: respaldo con hora local, personas por cámara, alertas de la noche; Frigate caído', () => {
  const lines = ht.nightLines({ respaldo: { ok: true, edadHoras: 3.5 }, personas: [{ camara: 'cochera', nombre: 'Cochera', n: 2 }, { camara: 'patio', nombre: 'Patio', n: 1 }], alertas: [{ titulo: 'Kuma', abiertaEn: Date.parse('2026-10-14T02:10:00-06:00'), resuelta: true }] }, NOW, t, TZ);
  assert.deepEqual(lines.map((l) => l.texto), ['Respaldo a las 03:00 ✓', '3 personas en zona: Cochera 2, Patio 1', 'Kuma, 02:10 (ya pasó)']);
  assert.deepEqual(lines.map((l) => l.alto), [false, true, false]);
  const none = ht.nightLines({ respaldo: { ok: false, edadHoras: 30 }, personas: null, alertas: [] }, NOW, t, TZ);
  assert.deepEqual(none.map((l) => [l.texto, l.alto]), [['El respaldo no corrió', true], ['Cámaras: sin datos', false], ['Sin alertas en la noche', false]]);
  assert.equal(ht.nightLines({ respaldo: null, personas: [], alertas: [] }, NOW, t, TZ)[1].texto, 'Nadie pasó por las zonas');
  const card = ht.homelabCardHtml(SUM({ modo: 'anoche', anoche: { respaldo: { ok: true, edadHoras: 3.5 }, personas: [], alertas: [] } }), REF, t, NOW, TZ);
  assert.match(card, /Anoche/);
});

test('agoText y untilText', () => {
  assert.equal(ht.agoText(NOW - 30_000, NOW, t), 'hace 1 min');
  assert.equal(ht.agoText(NOW - 3 * 3600_000, NOW, t), 'hace 3 h');
  assert.equal(ht.agoText(NOW - 3 * 86400_000, NOW, t), 'hace 3 días');
  assert.equal(ht.agoText(null, NOW, t), '');
  assert.equal(ht.untilText('arreglo', t, 'es', TZ), 'Silenciada hasta que se arregle');
  assert.match(ht.untilText(Date.parse('2026-10-15T18:00:00-06:00'), t, 'es', TZ), /^Silenciada hasta el .*15.*18:00$/);
});

test('silenceChoices: fuente:* solo arreglo; silenciada solo reactivar', () => {
  assert.deepEqual(ht.silenceChoices('swap', false), ['arreglo', '1d', '7d']);
  assert.deepEqual(ht.silenceChoices('fuente:kuma', false), ['arreglo']);
  assert.deepEqual(ht.silenceChoices('kuma:58', true), [null]);
});

test('hoja: secciones, alertas con data-clave, silenciadas, fichas, todo escapado', () => {
  const html = ht.homelabSheetHtml({ ok: true, at: NOW, data: WID() }, REF, UI(), t, 'es', NOW, TZ);
  for (const s of ['Alertas', 'Silenciadas', 'Servidor', 'Discos y contenedores', 'Red', 'Bot caído', 'Kuma · hace 5 min · toca para silenciar', 'Silenciada hasta que se arregle', '14.1 de 23 GB', '4 días', '66 · todos sanos', 'bien · hace 12 h', '11 ms · 0 % pérdida', '360 ↓ / 365 ↑ Mbps', 'Router Meraki', 'Tailscale']) {
    assert.ok(html.includes(s), `falta "${s}"`);
  }
  assert.match(html, /class="hl-alert[^"]*" data-clave="kuma:3"/);
  assert.match(html, /data-clave="kuma:58" data-silenced="1"/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /hl-opt/); // sin opciones abiertas
  assert.match(ht.homelabSheetHtml({ ok: false }, REF, UI(), t, 'es', NOW, TZ), /Sin datos del homelab/);
});

test('hoja: opciones de silencio en línea, guardando y error', () => {
  const open = ht.homelabSheetHtml({ ok: true, at: NOW, data: WID() }, REF, UI({ open: 'kuma:3' }), t, 'es', NOW, TZ);
  assert.deepEqual([...open.matchAll(/data-hasta="([^"]+)"/g)].map((m) => m[1]), ['arreglo', '1d', '7d']);
  assert.match(open, /hl-cancel/);
  const muda = ht.homelabSheetHtml({ ok: true, at: NOW, data: WID() }, REF, UI({ open: 'fuente:kuma' }), t, 'es', NOW, TZ);
  assert.deepEqual([...muda.matchAll(/data-hasta="([^"]+)"/g)].map((m) => m[1]), ['arreglo']);
  const react = ht.homelabSheetHtml({ ok: true, at: NOW, data: WID() }, REF, UI({ open: 'kuma:58' }), t, 'es', NOW, TZ);
  assert.deepEqual([...react.matchAll(/data-hasta="([^"]+)"/g)].map((m) => m[1]), ['null']);
  assert.match(react, /Reactivar/);
  assert.match(ht.homelabSheetHtml({ ok: true, at: NOW, data: WID() }, REF, UI({ open: 'kuma:3', saving: true }), t, 'es', NOW, TZ), /Guardando…/);
  assert.match(ht.homelabSheetHtml({ ok: true, at: NOW, data: WID() }, REF, UI({ open: 'kuma:3', error: true }), t, 'es', NOW, TZ), /No se pudo guardar/);
});

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('cards.ts: homelab fuera de la rotación chica, un vigilante por tarjeta, mismo CardStage', () => {
  const s = src('web/display/widgets/cards.ts');
  assert.match(s, /i\.type !== 'ages' && i\.type !== 'homelab'/);
  assert.match(s, /new HomelabWatcher\(/);
  assert.match(s, /canPoll: \(\) => !isPreview && !o\.paused\(\) && !document\.hidden/);
  assert.match(s, /this\.stage\.begin\(\)/);
  assert.match(s, /for \(const w of this\.watchers\.values\(\)\) w\.stop\(\)/);
});

test('main.ts: la hoja de homelab está en el SheetSwitch; api.ts manda JSON por POST', () => {
  assert.match(src('web/display/main.ts'), /homelab: new HomelabSheet\(cardsPaused\)/);
  const api = src('web/display/api.ts');
  assert.match(api, /homelabSilence: \(id: string, clave: string, hasta: HomelabSilenceHasta\)/);
  assert.match(api, /\/silence`\)/);
  assert.match(api, /'content-type': 'application\/json'/);
});
