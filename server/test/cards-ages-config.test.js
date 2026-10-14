// Tarjeta "A esta edad" (fork fsrhome): validación y bloque para la pantalla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../core/validate.js';
import { defaultConfig } from '../core/defaults.js';
import { displayConfig } from '../core/screens.js';

const ALBUM = '49e20c6a-82ec-4bb0-aaef-7663a5f60edb';
const base = () => { const c = defaultConfig(); c.calendar.sources = []; return c; };
const ages = (over = {}) => ({ id: 'k_edad', type: 'ages', name: 'A esta edad', enabled: true, options: { ages: { person: 'Arantza', birthDate: '2020-06-22', albumId: ALBUM, everyMin: 15, ...over } } });
const paths = (r) => r.errors.map((e) => e.path);

test('validate: tarjeta ages válida; álbum en minúsculas', () => {
  const c = base();
  c.cards = { items: [ages({ albumId: ALBUM.toUpperCase() })] };
  const r = validateConfig(c);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.cards.items[0].options, { ages: { person: 'Arantza', birthDate: '2020-06-22', albumId: ALBUM, everyMin: 15 } });
});

test('validate: sin álbum, fecha inválida o futura, persona vacía y cada cuánto fuera de rango → errores', () => {
  const c = base();
  c.cards = { items: [ages({ albumId: '' }), ages({ birthDate: '2020-13-40' }), ages({ birthDate: '2999-01-01' }), ages({ person: '  ' }), ages({ everyMin: 2 })] };
  const r = validateConfig(c);
  assert.equal(r.ok, false);
  const p = paths(r);
  assert.ok(p.includes('cards.items[0].options.ages.albumId'));
  assert.ok(p.includes('cards.items[1].options.ages.birthDate'));
  assert.ok(p.includes('cards.items[2].options.ages.birthDate'));
  assert.ok(p.includes('cards.items[3].options.ages.person'));
  assert.ok(p.includes('cards.items[4].options.ages.everyMin'));
});

test('displayConfig: la ref de ages lleva su cada cuánto y 45 s, sin álbum ni fecha; la de training conserva source', () => {
  const c = base();
  c.cards = { items: [ages(), { id: 'k_run', type: 'training', name: 'Entreno', enabled: true, options: { training: { source: 'coach', garminUrl: 'http://g:4400', coachUrl: 'http://c:4300' } } }] };
  c.screens[0].screen.cards = { items: ['k_edad', 'k_run'], everyMin: 20, showSec: 30, corner: 'br' };
  const v = validateConfig(c).value;
  const d = displayConfig(v, v.screens[0]);
  assert.deepEqual(d.cards.items, [
    { id: 'k_edad', type: 'ages', name: 'A esta edad', everyMin: 15, showSec: 45 },
    { id: 'k_run', type: 'training', name: 'Entreno', source: 'coach' },
  ]);
  assert.doesNotMatch(JSON.stringify(d.cards), /49e20c6a|2020-06-22/);
});

test('revisión 2: fecha de nacimiento de hace más de 120 años → error (evita miles de consultas a Immich)', () => {
  const c = base();
  c.cards = { items: [ages({ birthDate: '0002-06-22' })] };
  const r = validateConfig(c);
  assert.ok(paths(r).includes('cards.items[0].options.ages.birthDate'));
  assert.equal(r.value.cards.items[0].options.ages.birthDate, '2020-06-22');
});
