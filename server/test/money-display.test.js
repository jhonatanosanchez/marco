// Tarjeta Dinero en la pantalla (fork fsrhome): frases, colores, montos solo revelados, HTML escapado, tiempos y hoja
// por tipo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWebModules } from './webModules.js';

const [mt, sw, i18n] = await loadWebModules('/web/display/moneyText.ts', '/web/display/sheetSwitch.ts', '/web/shared/i18n.ts');
const t = i18n.makeT('es');
const REF = { id: 'k_dinero', type: 'money', name: 'Dinero' };
// montos distintivos: ninguno puede aparecer sin revelar
const DATA = () => ({
  generadoEn: '2026-10-14T18:00:00.000Z', today: '2026-10-14',
  quincena: { rango: '1–14 oct', diasRestantes: 6, diasTotales: 14, presupuesto: 9876543, gastado: 3456789, queda: 6419754, porDia: 1069959 },
  ritmo: { estado: 'bien', pctQueda: 0.62, pctTiempo: 0.43 },
  categorias: [
    { nombre: 'Tianguis', presupuesto: 400000, gastado: 123456, queda: 276544, pctUsado: 0.31, estado: 'bien' },
    { nombre: 'Súper <b>', presupuesto: 300000, gastado: 300001, queda: -1, pctUsado: 1, estado: 'agotada' },
    { nombre: 'Gasolina', presupuesto: 200000, gastado: 150000, queda: 50000, pctUsado: 0.75, estado: 'rapido' },
  ],
  proximos: [{ nombre: 'CFE "luz"', vencimiento: '2026-10-17', centavos: 778899 }],
  ultimos: [{ fecha: '2026-10-14', descripcion: '<script>x</script>', persona: 'andrea', centavos: 445566 }, { fecha: '2026-10-13', descripcion: 'Pan', persona: null, centavos: 112233 }],
});
const OK = () => ({ ok: true, at: Date.now(), data: DATA() });
const AMOUNTS = /\$|98,765|34,568|64,198|10,700|2,765|7,789|4,456|1,122|1,235/;

test('ritmoPhrase: por estado, singular/plural de días, pctQueda null', () => {
  const d = DATA();
  assert.equal(mt.ritmoPhrase(d, t), 'Van bien · les queda el 62 % para 6 días');
  assert.equal(mt.ritmoPhrase({ ...d, ritmo: { ...d.ritmo, estado: 'rapido' }, quincena: { ...d.quincena, diasRestantes: 1 } }, t), 'Van rápido · les queda el 62 % para 1 día');
  assert.equal(mt.ritmoPhrase({ ...d, ritmo: { estado: 'pasado', pctQueda: 0, pctTiempo: 0.2 }, quincena: { ...d.quincena, diasRestantes: 4 } }, t), 'Ya se pasaron · faltan 4 días');
  assert.equal(mt.ritmoPhrase({ ...d, ritmo: { estado: 'bien', pctQueda: null, pctTiempo: 0.5 } }, t), 'Van bien');
  assert.equal(mt.ritmoPhrase({ ...d, ritmo: { estado: 'sin-plan', pctQueda: null, pctTiempo: 0.5 } }, t), 'Sin plan de la quincena');
  assert.equal(mt.ritmoPhrase({ ...d, quincena: null }, t), 'Van bien');
});

test('ritmoColor y formatMoney', () => {
  assert.equal(mt.ritmoColor('bien'), 'var(--money-ok)');
  assert.equal(mt.ritmoColor('rapido'), 'var(--money-warn)');
  assert.equal(mt.ritmoColor('pasado'), 'var(--money-bad)');
  assert.equal(mt.ritmoColor('sin-plan'), 'var(--money-dim)');
  assert.equal(mt.formatMoney(123456), '$1,235');
  assert.equal(mt.formatMoney(-4900), '$49');
});

test('tarjeta chica: frase sin un solo monto; sin datos → gris, nunca verde', () => {
  const html = mt.moneyCardHtml(OK(), REF, t);
  assert.match(html, /Van bien · les queda el 62 % para 6 días/);
  assert.match(html, /Toca para ver la quincena/);
  assert.doesNotMatch(html, AMOUNTS);
  const none = mt.moneyCardHtml({ ok: false }, REF, t);
  assert.match(none, /Sin datos de gastos/);
  assert.match(none, /var\(--money-dim\)/);
  assert.doesNotMatch(none, /var\(--money-ok\)/);
});

test('hoja sin revelar: todo el detalle y ningún monto; HTML escapado', () => {
  const html = mt.moneySheetHtml(OK(), REF, { reveal: false, secondsLeft: 0 }, t, 'es');
  for (const s of ['Tiempo que queda', 'Dinero que queda', 'Por categoría', 'Próximos pagos', 'Últimos gastos', 'Tianguis', 'Pan', 'Toca para ver las cifras', 'Quincena 1–14 oct']) assert.ok(html.includes(s), s);
  assert.doesNotMatch(html, AMOUNTS);
  assert.doesNotMatch(html, /<script>|<b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /CFE &quot;luz&quot;/);
  assert.match(html, /Súper &lt;b&gt; ⚠/); // agotada lleva ⚠
  assert.match(html, /mmoney-bar is-out"><i style="width:0%"/); // agotada: barra vacía
  assert.match(html, /mmoney-bar is-fast"><i style="width:25%"/); // rápido: ámbar, lo que queda (50000/200000)
  assert.match(html, /Andrea/);
});

test('hoja revelada: montos y cuenta regresiva', () => {
  const html = mt.moneySheetHtml(OK(), REF, { reveal: true, secondsLeft: 27 }, t, 'es');
  assert.match(html, /Les quedan \$64,198 · \$10,700 por día/);
  assert.match(html, /\$2,765 libres/);
  assert.match(html, /\$0 de más/);
  assert.match(html, /\$7,789/);
  assert.match(html, /\$4,456/);
  assert.match(html, /Las cifras se ocultan en 27 s/);
});

test('hoja sin datos: aviso en gris, sin montos aunque se pida revelar', () => {
  const html = mt.moneySheetHtml({ ok: false }, REF, { reveal: true, secondsLeft: 30 }, t, 'es');
  assert.match(html, /Sin datos de gastos/);
  assert.doesNotMatch(html, /\$/);
});

test('tiempos: segundos restantes y cierre que espera al revelado', () => {
  assert.equal(mt.REVEAL_MS, 30_000);
  assert.equal(mt.secondsLeft(10_000, 0), 10);
  assert.equal(mt.secondsLeft(10_000, 9_001), 1);
  assert.equal(mt.secondsLeft(10_000, 20_000), 0);
  assert.equal(mt.sheetCloseAt(0, 0), 90_000);
  assert.equal(mt.sheetCloseAt(0, 100_000), 100_000); // revelado a los 70 s: cierra a los 100 s
  assert.equal(mt.sheetCloseAt(0, 50_000), 90_000);
});

test('SheetSwitch: abre la hoja del tipo (u la de respaldo), cierra todas, isOpen de cualquiera', () => {
  const mk = () => { const s = { opened: [], closed: 0, isOpen: false, open(r) { this.opened.push(r.id); this.isOpen = true; }, close() { this.closed++; this.isOpen = false; } }; return s; };
  const money = mk();
  const other = mk();
  const s = new sw.SheetSwitch({ money }, other);
  s.open(REF);
  assert.deepEqual(money.opened, ['k_dinero']);
  assert.equal(s.isOpen, true);
  s.open({ id: 'k_e', type: 'training', name: 'Entreno' });
  assert.deepEqual(other.opened, ['k_e']);
  assert.equal(money.isOpen, false); // abrir otra cierra la de dinero (y sus montos)
  s.close();
  assert.equal(s.isOpen, false);
});

test('fuentes: la tarjeta money se dibuja con moneyCardHtml; la hoja de dinero suelta datos al cerrar; main la conecta', () => {
  const cards = readFileSync(new URL('../../web/display/widgets/cards.ts', import.meta.url), 'utf8');
  assert.match(cards, /ref\.type === 'money' \? moneyCardHtml\(/);
  const sheet = readFileSync(new URL('../../web/display/widgets/moneySheet.ts', import.meta.url), 'utf8');
  assert.match(sheet, /close\(\): void \{[\s\S]*this\.clock\.stop\(\);[\s\S]*this\.data = null;/);
  assert.doesNotMatch(sheet, /localStorage|sessionStorage|indexedDB/);
  const main = readFileSync(new URL('../../web/display/main.ts', import.meta.url), 'utf8');
  assert.match(main, /const cardSheet = new SheetSwitch\(\{ money: new MoneySheet\(cardsPaused\) \}, new CardSheet\(cardsPaused\)\);/);
  assert.match(main, /new CardsController\(\{ paused: cardsPaused, sheet: cardSheet, ages: agesView \}\)/);
});

// Reloj de la hoja (spec §6, reloj falso): revelar 30 s y volver a ocultar; cerrar a los 90 s esperando el revelado;
// stop() (closeAll) suelta todo.
const [rv] = await loadWebModules('/web/display/moneyReveal.ts');
const { mock } = await import('node:test');

function clockHarness() {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  const calls = { paint: [], close: 0 };
  const clock = new rv.RevealClock({ paint: () => calls.paint.push(clock.revealed), close: () => { calls.close++; clock.stop(); } });
  return { clock, calls };
}

test('RevealClock: revelar dura 30 s con repintado cada segundo y luego se oculta solo', () => {
  const { clock, calls } = clockHarness();
  try {
    clock.start();
    clock.reveal();
    assert.equal(clock.revealed, true);
    assert.equal(clock.secondsLeft, 30);
    mock.timers.tick(10_000);
    assert.equal(clock.secondsLeft, 20);
    mock.timers.tick(20_000);
    assert.equal(clock.revealed, false);
    assert.equal(calls.paint.at(-1), false); // el último repintado ya es sin montos
    const n = calls.paint.length;
    mock.timers.tick(5_000);
    assert.equal(calls.paint.length, n); // el tictac se detuvo
  } finally {
    mock.timers.reset();
  }
});

test('RevealClock: cierra a los 90 s; si se reveló a los 70 s, espera a los 100 s', () => {
  let h = clockHarness();
  try {
    h.clock.start();
    mock.timers.tick(89_999);
    assert.equal(h.calls.close, 0);
    mock.timers.tick(1);
    assert.equal(h.calls.close, 1);
  } finally {
    mock.timers.reset();
  }
  h = clockHarness();
  try {
    h.clock.start();
    mock.timers.tick(70_000);
    h.clock.reveal();
    mock.timers.tick(20_000); // 90 s: todavía revelado
    assert.equal(h.calls.close, 0);
    mock.timers.tick(10_000); // 100 s: se ocultó → cierra
    assert.equal(h.calls.close, 1);
  } finally {
    mock.timers.reset();
  }
});

test('RevealClock: stop() (closeAll) oculta, detiene tictac y cierre agendado', () => {
  const { clock, calls } = clockHarness();
  try {
    clock.start();
    clock.reveal();
    clock.stop();
    assert.equal(clock.revealed, false);
    const n = calls.paint.length;
    mock.timers.tick(200_000);
    assert.equal(calls.paint.length, n);
    assert.equal(calls.close, 0);
  } finally {
    mock.timers.reset();
  }
});
