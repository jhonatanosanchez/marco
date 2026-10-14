// Admin de la tarjeta Dinero (fork fsrhome): botón, tarjeta, aviso de token y textos en todos los idiomas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWebModules } from './webModules.js';

const [{ ROWS_CARDS, NL_CARDS, DA_CARDS }] = await loadWebModules('/web/admin/i18n-dict-cards.ts');

const src = readFileSync(new URL('../../web/admin/sections/Cards.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../web/admin/api.ts', import.meta.url), 'utf8');
const KEYS = [
  'Dinero',
  'El ritmo de la quincena, sin montos. Tocar la hoja muestra las cifras 30 s.',
  'Los montos solo se ven 30 s al tocar la hoja. No sale en modo privado.',
  'Falta el token de gastos en el servidor (GASTOS_ECHO_TOKEN).',
];

test('Cards.tsx: crea money, la dibuja con su aviso de token y "Mostrar ahora"', () => {
  assert.match(src, /type: 'money', name: 'Dinero', enabled: true, options: \{ money: \{\} \}/);
  assert.match(src, /k\.type === 'money'/);
  assert.match(src, /api\.cardsStatus\(\)/);
  assert.match(src, /!status\.moneyToken/);
  assert.match(api, /cardsStatus: \(\) => request<CardsStatus>\('GET', '\/api\/admin\/cards\/status'\)/);
});

test('textos del admin en es/en/pt/nl/da', () => {
  for (const k of KEYS) {
    const row = ROWS_CARDS.find((r) => r[0] === k);
    assert.ok(row && row[1] && row[2], `fila ${k}`);
    assert.ok(NL_CARDS[k], `nl ${k}`);
    assert.ok(DA_CARDS[k], `da ${k}`);
  }
});
