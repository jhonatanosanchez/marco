// Tarjeta Homelab (fork fsrhome): validación, bloque para la pantalla y que no es sensible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../core/validate.js';
import { defaultConfig } from '../core/defaults.js';
import { displayCards } from '../core/screens.js';
import { CARD_TYPES, SENSITIVE_CARD_TYPES, HOMELAB_DEFAULTS } from '../core/trainingCore.js';

const base = () => { const c = defaultConfig(); c.calendar.sources = []; return c; };
const homelab = (over = {}) => ({ id: 'k_homelab', type: 'homelab', name: 'Homelab', enabled: true, options: { homelab: { everyMin: 10, zones: ['pipol'] } }, ...over });

test('validate: homelab válida; nombre vacío → "Homelab"; sin opciones → valores por defecto', () => {
  const c = base();
  c.cards = { items: [homelab({ name: ' ', options: {} })] };
  const r = validateConfig(c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.cards.items[0], { id: 'k_homelab', type: 'homelab', name: 'Homelab', enabled: true, options: { homelab: { everyMin: 10, zones: ['pipol', 'pipol2', 'Entrada', 'mi-patio'] } } });
});

test('validate: everyMin fuera de 5–120 y zonas inválidas dan error; un decimal se redondea (como en "A esta edad")', () => {
  const r = base();
  r.cards = { items: [homelab({ options: { homelab: { everyMin: 7.5, zones: ['pipol'] } } })] };
  assert.equal(validateConfig(r).value.cards.items[0].options.homelab.everyMin, 8);
  for (const everyMin of [4, 121, 'x']) {
    const c = base();
    c.cards = { items: [homelab({ options: { homelab: { everyMin, zones: ['pipol'] } } })] };
    assert.equal(validateConfig(c).ok, false, `everyMin ${everyMin}`);
  }
  for (const zones of [[], ['a b'], ['<x>'], Array.from({ length: 11 }, (_, i) => `z${i}`), ['x'.repeat(41)]]) {
    const c = base();
    c.cards = { items: [homelab({ options: { homelab: { everyMin: 10, zones } } })] };
    assert.equal(validateConfig(c).ok, false, `zones ${JSON.stringify(zones)}`);
  }
});

test('validate: zonas vacías (coma al final mientras se escribe en el admin) se descartan', () => {
  const c = base();
  c.cards = { items: [homelab({ options: { homelab: { everyMin: 10, zones: ['pipol', ' ', '', 'Entrada'] } } })] };
  const r = validateConfig(c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.cards.items[0].options.homelab.zones, ['pipol', 'Entrada']);
  c.cards = { items: [homelab({ options: { homelab: { everyMin: 10, zones: ['', ' '] } } })] };
  assert.equal(validateConfig(c).ok, false); // nada que quede → error
});

test('tipos: homelab existe y NO es sensible', () => {
  assert.ok(CARD_TYPES.includes('homelab'));
  assert.equal(SENSITIVE_CARD_TYPES.includes('homelab'), false);
  assert.deepEqual(HOMELAB_DEFAULTS, { everyMin: 10, zones: ['pipol', 'pipol2', 'Entrada', 'mi-patio'] });
});

test('displayCards: homelab viaja con id, tipo, nombre y everyMin (sin zonas); privado → vacía', () => {
  const c = base();
  c.cards = { items: [homelab()] };
  const screen = { screen: { cards: { items: ['k_homelab'], everyMin: 20, showSec: 30, corner: 'br' } } };
  assert.deepEqual(displayCards(c, screen).items, [{ id: 'k_homelab', type: 'homelab', name: 'Homelab', everyMin: 10 }]);
  assert.deepEqual(displayCards(c, screen, { isPrivate: true }).items, []);
});
