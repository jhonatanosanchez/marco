import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../news.js';
import { stripHtml, truncate } from '../lib/text.js';
import { fixture } from './helpers.js';

test('RSS 2.0: entities, CDATA, HTML stripping, summary length, images', () => {
  const f = parseFeed(fixture('feed.xml'), 'Example News');
  assert.equal(f.title, 'Example News');
  assert.equal(f.items.length, 2);
  const [a, b] = f.items;
  assert.equal(a.title, 'El tiempo en Portugal & el fin de semana');
  assert.ok(a.summary.length <= 200, `len ${a.summary.length}`);
  assert.ok(a.summary.startsWith('Se esperan lluvias en el norte del país'));
  assert.ok(!/[<>]|&\w+;/.test(a.summary));
  assert.ok(a.summary.endsWith('…'));
  assert.equal(a.image, 'https://cdn.example.com/img/tiempo.jpg');
  assert.equal(a.date, '2026-10-09T09:01:00.000Z');
  assert.equal(a.source, 'Example News');
  assert.equal(b.title, 'Nueva línea de metro en Lisboa');
  assert.equal(b.image, 'https://cdn.example.com/img/metro.jpg');
  assert.equal(b.summary, 'Texto corto.');
  assert.notEqual(a.id, b.id);
});

test('Atom feeds with html summary and inline image', () => {
  const f = parseFeed(fixture('atom.xml'));
  assert.equal(f.title, 'Atom Test');
  assert.equal(f.items[0].title, 'Entrada Atom');
  assert.equal(f.items[0].link, 'https://example.com/a1');
  assert.equal(f.items[0].summary, 'Resumen con imagen');
  assert.equal(f.items[0].image, 'https://example.com/a1.png');
});

test('non-feed content (WAF challenge page) is rejected', () => {
  assert.throws(() => parseFeed('<html><body>Checking your browser…</body></html>'), /RSS/);
});

test('stripHtml / truncate helpers', () => {
  assert.equal(stripHtml('<p>Ol&aacute; &amp; adi&oacute;s<br/>mundo</p>'), 'Olá & adiós mundo');
  assert.equal(stripHtml('&lt;b&gt;x&lt;/b&gt;'), 'x');
  assert.equal(truncate('abc', 10), 'abc');
  assert.ok(truncate('palabra '.repeat(50), 200).length <= 200);
});
