// Tarjetas (fork fsrhome): configuración global, por pantalla y bloque que recibe la pantalla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../core/validate.js';
import { defaultConfig } from '../core/defaults.js';
import { displayConfig, displayCards } from '../core/screens.js';

const base = () => {
  const c = defaultConfig();
  c.calendar.sources = [];
  return c;
};
const card = (id, extra = {}) => ({
  id, type: 'training', name: id.toUpperCase(), enabled: true,
  options: { training: { source: 'coach', garminUrl: 'http://garmin-stats:4400', coachUrl: 'http://running-coach:4300' } },
  ...extra,
});
const paths = (r) => r.errors.map((e) => e.path);

test('defaults: sin tarjetas; cada pantalla con 20 min, 30 s y esquina br', () => {
  const c = defaultConfig();
  assert.deepEqual(c.cards, { items: [] });
  assert.deepEqual(c.screens[0].screen.cards, { items: [], everyMin: 20, showSec: 30, corner: 'br' });
});

test('validate: tarjeta de entreno válida; URL sin barra final; id borrado se cae sin error', () => {
  const c = base();
  c.cards = { items: [card('k_abc', { options: { training: { source: 'coach', garminUrl: 'http://garmin-stats:4400/', coachUrl: 'http://running-coach:4300' } } })] };
  c.screens[0].screen.cards = { items: ['k_abc', 'k_borrada', 'k_abc'], everyMin: 20, showSec: 30, corner: 'tl' };
  const r = validateConfig(c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.cards.items[0].options.training.garminUrl, 'http://garmin-stats:4400');
  assert.deepEqual(r.value.screens[0].screen.cards.items, ['k_abc']);
  assert.equal(r.value.screens[0].screen.cards.corner, 'tl');
});

test('validate: solo Garmin no exige coach; nombre vacío = "Entreno"; id inválido se regenera', () => {
  const c = base();
  c.cards = { items: [card('nada', { name: '  ', options: { training: { source: 'garmin', garminUrl: 'http://garmin-andrea:4400', coachUrl: '' } } })] };
  const r = validateConfig(c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const k = r.value.cards.items[0];
  assert.match(k.id, /^k_[a-z0-9]+$/);
  assert.equal(k.name, 'Entreno');
  assert.equal(k.options.training.coachUrl, '');
});

test('validate: tipo desconocido, fuente rara y URL que no es http se rechazan', () => {
  const c = base();
  c.cards = { items: [
    card('k_a', { type: 'lottery' }),
    card('k_b', { options: { training: { source: 'x', garminUrl: 'http://g:4400', coachUrl: 'http://c:4300' } } }),
    card('k_c', { options: { training: { source: 'coach', garminUrl: 'file:///etc/passwd', coachUrl: 'http://c:4300' } } }),
  ] };
  const r = validateConfig(c);
  assert.equal(r.ok, false);
  assert.ok(paths(r).includes('cards.items[0].type'));
  assert.ok(paths(r).includes('cards.items[1].options.training.source'));
  assert.ok(paths(r).includes('cards.items[2].options.training.garminUrl'));
});

test('validate: cada cuánto y cuánto dura fuera de rango → error y default', () => {
  const c = base();
  c.screens[0].screen.cards = { items: [], everyMin: 1, showSec: 999, corner: 'xx' };
  const r = validateConfig(c);
  assert.ok(paths(r).includes('screens[0].screen.cards.everyMin'));
  assert.ok(paths(r).includes('screens[0].screen.cards.showSec'));
  assert.deepEqual(r.value.screens[0].screen.cards, { items: [], everyMin: 20, showSec: 30, corner: 'br' });
});

test('displayConfig: solo las encendidas de esta pantalla, en su orden y sin URLs; ninguna en privado', () => {
  const c = base();
  c.cards = { items: [card('k_c1'), card('k_c2', { enabled: false }), card('k_c3', { options: { training: { source: 'garmin', garminUrl: 'http://garmin-andrea:4400', coachUrl: '' } } })] };
  c.screens[0].screen.cards = { items: ['k_c3', 'k_c2', 'k_c1'], everyMin: 30, showSec: 15, corner: 'bl' };
  const v = validateConfig(c).value;
  const d = displayConfig(v, v.screens[0]);
  assert.deepEqual(d.cards, {
    items: [{ id: 'k_c3', type: 'training', name: 'K_C3', source: 'garmin' }, { id: 'k_c1', type: 'training', name: 'K_C1', source: 'coach' }],
    everyMin: 30, showSec: 15, corner: 'bl',
  });
  assert.doesNotMatch(JSON.stringify(d.cards), /http/);
  assert.deepEqual(displayCards(v, v.screens[0], { isPrivate: true }).items, []);
});
