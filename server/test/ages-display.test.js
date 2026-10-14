// "A esta edad" en la pantalla (fork fsrhome): texto de edad, acomodo de las instantáneas, HTML escapado y ritmo propio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWebModules } from './webModules.js';

const [txt, cards] = await loadWebModules('/web/display/agesText.ts', '/web/display/cardsText.ts');
const t = (k, v = {}) => ({
  agesYear: `${v.n} año`, agesYears: `${v.n} años`, agesMonth: `${v.n} mes`, agesMonths: `${v.n} meses`,
  agesTitle: `Así ha crecido ${v.name}`, agesToday: `Hoy tiene ${v.age}`,
}[k] ?? k);

test('ageText: singular, plural, solo meses y solo años', () => {
  assert.equal(txt.ageText(3, t), '3 meses');
  assert.equal(txt.ageText(1, t), '1 mes');
  assert.equal(txt.ageText(12, t), '1 año');
  assert.equal(txt.ageText(15, t), '1 año 3 meses');
  assert.equal(txt.ageText(75, t), '6 años 3 meses');
  assert.equal(txt.ageText(0, t), '0 meses');
});

test('ageLayout: más altas cada año, paradas en el zoclo, dentro de la pared; se enciman ≤ 34 % o se encogen', () => {
  for (const n of [2, 4, 7, 9]) {
    const b = txt.ageLayout(n, 961, 601);
    assert.equal(b.length, n);
    for (let i = 1; i < n; i++) assert.ok(b[i].h > b[i - 1].h, `n=${n} i=${i}`);
    for (const x of b) {
      assert.ok(Math.abs(x.y + x.h - (601 - 78)) < 0.5);
      assert.ok(x.x >= 118 - 0.5 && x.x + x.w <= 961 - 36 + 0.5);
      assert.ok(x.h <= 601 * 0.8 + 0.5);
    }
    for (let i = 1; i < n; i++) assert.ok(b[i].x - (b[i - 1].x + b[i - 1].w) >= -0.34 * b[0].w - 0.5);
  }
});

test('agesHtml: título y edad escapados, una instantánea y una marca por foto, la primera marcada', () => {
  const list = { person: '<b>Arantza</b>', today: '2026-10-13', months: 75, photos: [
    { id: 'a1', v: 'x', months: 3, year: '2020' }, { id: 'a2', v: 'y', months: 15, year: '2021' },
  ] };
  const h = txt.agesHtml(list, txt.ageLayout(2, 961, 601), t, (p) => `/media/immich/${p.id}?v=${p.v}`);
  assert.doesNotMatch(h, /<b>Arantza/);
  assert.match(h, /Así ha crecido &lt;b&gt;Arantza&lt;\/b&gt;/);
  assert.match(h, /Hoy tiene 6 años 3 meses/);
  assert.equal((h.match(/class="instantanea/g) || []).length, 2);
  assert.equal((h.match(/class="marca-lapiz"/g) || []).length, 2);
  assert.match(h, /class="instantanea primera"/);
  assert.match(h, /<span>2020<\/span>/);
  assert.match(h, /\/media\/immich\/a2\?v=y/);
});

test('cardsSig cambia si cambia el ritmo de una tarjeta a pantalla completa', () => {
  const c = { items: [{ id: 'k_e', type: 'ages', name: 'E', everyMin: 15, showSec: 45 }], everyMin: 20, showSec: 30, corner: 'br' };
  assert.notEqual(cards.cardsSig(c), cards.cardsSig({ ...c, items: [{ ...c.items[0], everyMin: 30 }] }));
});

test('CardsController: ages con rotación propia, bloqueada si hay otra tarjeta u hoja; closeAll la cierra', () => {
  const src = readFileSync(new URL('../../web/display/widgets/cards.ts', import.meta.url), 'utf8');
  // revisión 1: las dos rotaciones piden turno en el mismo escenario (prueba de abajo)
  assert.match(src, /closeAll\(\): void \{\s*this\.hide\(\);\s*this\.o\.sheet\.close\(\);\s*this\.o\.ages\.close\(\);/);
  const main = readFileSync(new URL('../../web/display/main.ts', import.meta.url), 'utf8');
  assert.match(main, /new CardsController\(\{ paused: cardsPaused, sheet: cardSheet, ages: agesView \}\)/);
  const css = readFileSync(new URL('../../web/display/styles-ages.css', import.meta.url), 'utf8');
  assert.match(css, /@font-face \{ font-family: "Patrick Hand";/);
  assert.match(css, /prefers-reduced-motion/);
});

test('revisión 1: todas las tarjetas piden turno en el mismo escenario; ages se descarta si la cierran mientras carga', () => {
  const src = readFileSync(new URL('../../web/display/widgets/cards.ts', import.meta.url), 'utf8');
  assert.equal((src.match(/blocked: \(\) => isPreview \|\| o\.sheet\.isOpen \|\| this\.stage\.busy/g) || []).length, 2);
  assert.match(src, /const tk = this\.stage\.begin\(\);\s*if \(!tk\) return;/);
  const view = readFileSync(new URL('../../web/display/widgets/agesView.ts', import.meta.url), 'utf8');
  assert.match(view, /if \(gen !== this\.gen \|\| photos\.length < 2 \|\| this\.paused\(\)\) return;/);
});
