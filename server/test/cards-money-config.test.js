// Tarjeta Dinero (fork fsrhome): validación, bloque para la pantalla y cardVisible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../core/validate.js';
import { defaultConfig } from '../core/defaults.js';
import { displayCards } from '../core/screens.js';
import { CARD_TYPES, SENSITIVE_CARD_TYPES, cardVisible } from '../core/trainingCore.js';

const base = () => { const c = defaultConfig(); c.calendar.sources = []; return c; };
const money = (over = {}) => ({ id: 'k_dinero', type: 'money', name: 'Dinero', enabled: true, options: { money: {} }, ...over });

test('validate: tarjeta money válida; nombre vacío → "Dinero"; opciones de más se tiran', () => {
  const c = base();
  c.cards = { items: [money({ name: '  ', options: { money: { url: 'http://x' }, training: { source: 'coach' } } })] };
  const r = validateConfig(c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.cards.items[0], { id: 'k_dinero', type: 'money', name: 'Dinero', enabled: true, options: { money: {} } });
});

test('tipos: money y org son sensibles; training y ages no', () => {
  assert.ok(CARD_TYPES.includes('money'));
  assert.deepEqual(SENSITIVE_CARD_TYPES, ['money', 'org']);
});

test('cardVisible: en modo privado ninguna; fuera de él todas', () => {
  for (const type of CARD_TYPES) {
    assert.equal(cardVisible({ type }, { privateMode: true }), false);
    assert.equal(cardVisible({ type }, { privateMode: false }), true);
  }
});

test('displayCards: money viaja solo con id, tipo y nombre; privado → lista vacía', () => {
  const c = base();
  c.cards = { items: [money()] };
  const screen = { screen: { cards: { items: ['k_dinero'], everyMin: 20, showSec: 30, corner: 'br' } } };
  assert.deepEqual(displayCards(c, screen).items, [{ id: 'k_dinero', type: 'money', name: 'Dinero' }]);
  assert.deepEqual(displayCards(c, screen, { isPrivate: true }).items, []);
});
