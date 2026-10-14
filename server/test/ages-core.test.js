// Reglas de "A esta edad" (fork fsrhome): las de echo-reloj (html/js/edades.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ac from '../core/agesCore.js';

const NO_MARKS = { favorites: new Set(), hidden: new Set() };
const a = (n, over = {}) => ({ id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`, type: 'IMAGE', originalFileName: `IMG_${n}.HEIC`, localDateTime: '2025-09-25T10:00:00.000Z', isFavorite: false, isArchived: false, isTrashed: false, people: [], ...over });

test('monthsBetween y addMonths', () => {
  assert.equal(ac.monthsBetween('2020-06-22', '2026-10-13'), 75);
  assert.equal(ac.monthsBetween('2020-06-22', '2026-10-22'), 76);
  assert.equal(ac.monthsBetween('2020-06-22', '2020-06-01'), -1);
  assert.equal(ac.addMonths('2020-06-22', 3), '2020-09-22');
  assert.equal(ac.addMonths('2020-06-22', 7), '2021-01-22');
});

test('ageWindows: un tramo por año a la misma edad, del día 22 al 22 siguiente', () => {
  const w = ac.ageWindows('2020-06-22', '2026-10-13');
  assert.equal(w.length, 7);
  assert.deepEqual(w[0], { months: 3, year: '2020', from: '2020-09-22', to: '2020-10-22' });
  assert.deepEqual(w[6], { months: 75, year: '2026', from: '2026-09-22', to: '2026-10-22' });
  assert.deepEqual(ac.ageWindows('2020-06-22', '2020-06-01'), []);
});

test('inWindow usa la fecha local de la foto (localDateTime), sin la hora', () => {
  const w = { from: '2025-09-22', to: '2025-10-22' };
  assert.equal(ac.inWindow(a(1, { localDateTime: '2025-09-21T23:30:00.000Z', fileCreatedAt: '2025-09-22T05:30:00.000Z' }), w), false);
  assert.equal(ac.inWindow(a(2, { localDateTime: '2025-09-22T00:10:00.000Z' }), w), true);
  assert.equal(ac.inWindow(a(3, { localDateTime: '2025-10-22T08:00:00.000Z' }), w), false);
});

test('seed: la de echo-reloj', () => {
  assert.equal(ac.seed(''), 0);
  assert.equal(ac.seed('ab'), (97 * 31 + 98) % 2147483647);
});

test('pickAsset: ❤️/favorita > sola > con alguien > cualquiera; 🚫, capturas y archivadas fuera', () => {
  const sola = a(2, { people: [{ name: 'Arantza' }] });
  const conAlguien = a(3, { people: [{ name: 'Arantza' }, { name: 'Andrea' }] });
  const cualquiera = a(4);
  assert.equal(ac.pickAsset([cualquiera, conAlguien, sola], 'k', NO_MARKS, 'Arantza').id, sola.id);
  assert.equal(ac.pickAsset([cualquiera, conAlguien], 'k', NO_MARKS, 'Arantza').id, conAlguien.id);
  const fav = a(5, { isFavorite: true });
  assert.equal(ac.pickAsset([sola, fav], 'k', NO_MARKS, 'Arantza').id, fav.id);
  const marks = { favorites: new Set([cualquiera.id]), hidden: new Set([sola.id]) };
  assert.equal(ac.pickAsset([sola, cualquiera], 'k', marks, 'Arantza').id, cualquiera.id);
  const basura = [a(6, { originalFileName: 'Screenshot_2025.png' }), a(7, { originalFileName: 'IMG-20250925-WA0001.jpg' }), a(8, { isArchived: true }), a(9, { type: 'VIDEO' }), a(10, { isTrashed: true })];
  assert.equal(ac.pickAsset(basura, 'k', NO_MARKS, 'Arantza'), null);
  assert.equal(ac.pickAsset([a(11, { people: [{ name: 'arantza' }] }), a(12)], 'k', NO_MARKS, 'Arantza').id, a(11).id);
});

test('pickAsset: sorteo estable el mismo día (sin importar el orden) y distinto con otra clave', () => {
  const xs = Array.from({ length: 9 }, (_, i) => a(20 + i));
  const one = ac.pickAsset(xs, '2026-10-132025', NO_MARKS, 'Arantza').id;
  assert.equal(ac.pickAsset([...xs].reverse(), '2026-10-132025', NO_MARKS, 'Arantza').id, one);
  const others = ['2026-10-142025', '2026-10-152025', '2026-10-162025'].map((k) => ac.pickAsset(xs, k, NO_MARKS, 'Arantza').id);
  assert.ok(others.some((id) => id !== one));
});

test('parseMarks: ids de echo-reloj (/api/marcas) a listas limpias en minúsculas', () => {
  const id1 = 'AAAAAAAA-0000-4000-8000-000000000001';
  const id2 = 'aaaaaaaa-0000-4000-8000-000000000002';
  assert.deepEqual(ac.parseMarks({ favoritas: [{ id: id1, fecha: 'x' }, { id: 'malo' }, id2, { id: id1 }], ocultas: [id2, 5] }), {
    favorites: [id1.toLowerCase(), id2], hidden: [id2],
  });
  assert.deepEqual(ac.parseMarks(null), { favorites: [], hidden: [] });
});
