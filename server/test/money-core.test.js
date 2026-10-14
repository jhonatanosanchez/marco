// Tarjeta Dinero (fork fsrhome): saneado del resumen de gastos-dashboard (lista cerrada de campos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeResumen } from '../core/moneyCore.js';

const RAW = () => ({
  generadoEn: '2026-10-14T18:00:00.000Z',
  quincena: { rango: '1–14 oct', diasRestantes: 3, diasTotales: 14, presupuesto: 1000000, gastado: 400000, queda: 600000, porDia: 200000 },
  ritmo: { estado: 'bien', pctQueda: 0.6, pctTiempo: 0.214 },
  categorias: [{ nombre: 'Tianguis', presupuesto: 200000, gastado: 50000, queda: 150000, pctUsado: 0.25, estado: 'bien' }],
  proximos: [{ nombre: 'CFE', vencimiento: '2026-10-20', centavos: 45000 }],
  ultimos: [{ fecha: '2026-10-14', descripcion: 'Pan', persona: 'andrea', centavos: 4900 }],
  semana: [{ fecha: '2026-10-14', descripcion: 'Pan', persona: 'andrea' }],
  nuevo: { secreto: 1 },
});

test('sanitizeResumen: conserva la lista cerrada, agrega today, descarta semana y campos nuevos', () => {
  const d = sanitizeResumen(RAW(), '2026-10-14');
  assert.deepEqual(Object.keys(d).sort(), ['categorias', 'generadoEn', 'proximos', 'quincena', 'ritmo', 'today', 'ultimos']);
  assert.equal(d.today, '2026-10-14');
  assert.deepEqual(d.ritmo, { estado: 'bien', pctQueda: 0.6, pctTiempo: 0.214 });
  assert.deepEqual(d.proximos, [{ nombre: 'CFE', vencimiento: '2026-10-20', centavos: 45000 }]);
  assert.deepEqual(d.ultimos, [{ fecha: '2026-10-14', descripcion: 'Pan', persona: 'andrea', centavos: 4900 }]);
});

test('sanitizeResumen: sin ritmo válido → null; no es objeto → null', () => {
  assert.equal(sanitizeResumen({ ...RAW(), ritmo: null }, '2026-10-14'), null);
  assert.equal(sanitizeResumen({ ...RAW(), ritmo: { estado: 'raro' } }, '2026-10-14'), null);
  assert.equal(sanitizeResumen([], '2026-10-14'), null);
  assert.equal(sanitizeResumen(null, '2026-10-14'), null);
});

test('sanitizeResumen: filas con tipos inválidos se descartan; listas que no son arreglo → []', () => {
  const raw = RAW();
  raw.categorias.push({ nombre: 'Malo', presupuesto: 'mucho', gastado: 0, queda: 0, estado: 'bien' }, { nombre: 'Estado raro', presupuesto: 1, gastado: 0, queda: 1, estado: 'x' });
  raw.proximos.push({ nombre: 'Sin fecha', vencimiento: 'mañana', centavos: 1 });
  raw.ultimos.push({ fecha: '2026-10-13', descripcion: 'Texto', persona: 'otro', centavos: '12' });
  const d = sanitizeResumen(raw, '2026-10-14');
  assert.deepEqual(d.categorias.map((c) => c.nombre), ['Tianguis']);
  assert.equal(d.proximos.length, 1);
  assert.equal(d.ultimos.length, 1);
  assert.deepEqual(sanitizeResumen({ ...RAW(), categorias: 'x', proximos: null, ultimos: {} }, '2026-10-14').categorias, []);
});

test('sanitizeResumen: persona desconocida o ausente → null (la fila se queda); pctQueda null se conserva', () => {
  const raw = RAW();
  raw.ultimos = [{ fecha: '2026-10-14', descripcion: 'Pan', persona: 'visita', centavos: 100 }, { fecha: '2026-10-14', descripcion: 'Leche', centavos: 200 }];
  raw.ritmo = { estado: 'sin-plan', pctQueda: null, pctTiempo: 0.5 };
  const d = sanitizeResumen(raw, '2026-10-14');
  assert.deepEqual(d.ultimos.map((g) => g.persona), [null, null]);
  assert.equal(d.ritmo.pctQueda, null);
});
