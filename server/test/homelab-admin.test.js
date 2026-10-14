// Admin de la tarjeta Homelab (fork fsrhome): botón, campos y textos en todos los idiomas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWebModules } from './webModules.js';

const [{ ROWS_CARDS, NL_CARDS, DA_CARDS }] = await loadWebModules('/web/admin/i18n-dict-cards.ts');
const src = readFileSync(new URL('../../web/admin/sections/Cards.tsx', import.meta.url), 'utf8');
const KEYS = [
  'Homelab',
  'El estado del servidor. Sale solo cuando hay algo: aviso, alerta o sin datos. De 5 a 8 a.m. resume la noche.',
  'Repetir cada (min)',
  'Zonas de cámaras para "Anoche"',
  'Nombres de zonas de Frigate separados por comas.',
];

test('Cards.tsx: crea homelab con valores por defecto y la dibuja con sus campos y "Mostrar ahora"', () => {
  assert.match(src, /type: 'homelab', name: 'Homelab', enabled: true,\s*options: \{ homelab: \{ everyMin: 10, zones: \['pipol', 'pipol2', 'Entrada', 'mi-patio'\] \} \}/);
  assert.match(src, /k\.type === 'homelab'/);
  assert.match(src, /h\.everyMin = Number\(v\)/);
  assert.match(src, /h\.zones = v\.split/);
  // sin filtrar al escribir: si no, la coma que se acaba de teclear desaparece en el siguiente render
  assert.doesNotMatch(src, /h\.zones = v\.split\(','\)\.map\(\(z\) => z\.trim\(\)\)\.filter/);
  assert.match(src, /show\(k\.id\)/);
});

test('textos del admin en es/en/pt/nl/da', () => {
  for (const k of KEYS) {
    const row = ROWS_CARDS.find((r) => r[0] === k);
    assert.ok(row && row[1] && row[2], `fila ${k}`);
    assert.ok(NL_CARDS[k], `nl ${k}`);
    assert.ok(DA_CARDS[k], `da ${k}`);
  }
});
