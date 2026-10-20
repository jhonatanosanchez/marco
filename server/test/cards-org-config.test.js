// tipo de tarjeta org (fork fsrhome)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../core/validate.js';
import { defaultConfig } from '../core/defaults.js';
import { displayCards } from '../core/screens.js';
import { cardVisible, SENSITIVE_CARD_TYPES } from '../core/trainingCore.js';

const conTarjeta = (k) => { const c = defaultConfig(); c.cards = { items: [k] }; c.screens[0].screen.cards = { items: [k.id], everyMin: 20, showSec: 30, corner: 'br' }; return c; };

test('org: valores por defecto, rango de everyMin y nombre', () => {
  const r = validateConfig(conTarjeta({ id: 'k_org', type: 'org', name: '', enabled: true, options: {} }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.cards.items[0], { id: 'k_org', type: 'org', name: 'Organización', enabled: true, options: { org: { everyMin: 30 } } });
  const mal = validateConfig(conTarjeta({ id: 'k_org', type: 'org', name: 'x', enabled: true, options: { org: { everyMin: 1 } } }));
  assert.equal(mal.ok, false);
});

test('org: a la pantalla solo id, tipo, nombre y everyMin; es sensible', () => {
  const c = validateConfig(conTarjeta({ id: 'k_org', type: 'org', name: 'Org', enabled: true, options: { org: { everyMin: 15 } } })).value;
  assert.deepEqual(displayCards(c, c.screens[0]).items, [{ id: 'k_org', type: 'org', name: 'Org', everyMin: 15 }]);
  assert.deepEqual(displayCards(c, c.screens[0], { isPrivate: true }).items, []);
  assert.ok(SENSITIVE_CARD_TYPES.includes('org'));
  assert.equal(cardVisible({ type: 'org' }, { privateMode: true }), false);
});
