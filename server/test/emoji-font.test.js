// The "Marco Emoji" font (scripts/build-emoji-font.mjs): built from the picker's emoji and the default icon rules,
// served from the app itself; the display page loads nothing from other origins on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fontEmoji, unicodeRange, MANIFEST_PATH } from '../../scripts/build-emoji-font.mjs';
import { loadWebModules } from './webModules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(root, p));

test('the emoji font covers every emoji the picker offers and the default icon rules use', () => {
  const built = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const missing = fontEmoji().filter((e) => !built.emoji.includes(e));
  assert.deepEqual(missing, [], 'rebuild the font: node scripts/build-emoji-font.mjs <Noto-COLRv1.ttf>');
  assert.ok(built.emoji.length > 300);
  assert.equal(built.license, 'OFL-1.1');
  assert.equal(read('web/shared/fonts/marco-emoji.woff2').subarray(0, 4).toString('latin1'), 'wOF2');
  assert.match(read('web/shared/fonts/OFL.txt').toString(), /SIL Open Font License/);
  const css = read('web/shared/emoji-font.css').toString();
  assert.match(css, /font-family: 'Marco Emoji'/);
  assert.match(css, /url\('\.\/fonts\/marco-emoji\.woff2'\)/, 'relative: bundled into /assets, served from the same origin');
  assert.ok(css.includes(`unicode-range: ${unicodeRange(built.emoji)};`), 'unicode-range matches the manifest');
});

/** Table tags of a WOFF2 file (its table directory; enough to check the colour tables survived the subsetting). */
function woff2Tables(buf) {
  const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
    'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB',
    'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar',
    'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf',
    'Glat', 'Gloc', 'Feat', 'Sill'];
  const n = buf.readUInt16BE(12);
  let o = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = buf[o++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('bad UIntBase128');
  };
  const tags = [];
  for (let i = 0; i < n; i++) {
    const flags = buf[o++];
    let tag = KNOWN[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', o, o + 4); o += 4; }
    base128();
    const version = flags >> 6;
    if (((tag === 'glyf' || tag === 'loca') && version === 0) || (tag === 'hmtx' && version === 1)) base128();
    tags.push(tag);
  }
  return tags;
}

test('the emoji font keeps its colour tables (COLR, CPAL)', () => {
  const tables = woff2Tables(read('web/shared/fonts/marco-emoji.woff2'));
  for (const t of ['COLR', 'CPAL', 'cmap', 'glyf', 'GSUB']) assert.ok(tables.includes(t), `${t} in ${tables.join(',')}`);
});

test('unicode-range: ranges merged, ASCII (keycap bases) left out', () => {
  assert.equal(unicodeRange(['☀️', '☁️', '#️⃣', '🎂']), 'U+20E3, U+2600-2601, U+FE0F, U+1F382');
});

test('both pages use the font; the display page has no inline script and no third-party stylesheet', () => {
  assert.match(read('web/admin/main.tsx').toString(), /import '\.\.\/shared\/emoji-font\.css';/);
  assert.match(read('web/display/main.ts').toString(), /import '\.\.\/shared\/emoji-font\.css';/);
  assert.match(read('web/admin/styles.css').toString(), /--font: [^;]*'Marco Emoji'/);
  assert.match(read('web/display/styles.css').toString(), /--font-emoji: [^;]*'Marco Emoji'/);
  const html = read('web/index.html').toString();
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'no inline event handlers');
  assert.doesNotMatch(html, /https?:\/\//, 'nothing from other origins');
});

test('the Google Fonts emoji stylesheet is only added on self-hosted servers', async () => {
  const [h] = await loadWebModules('/web/display/health.ts');
  const fakeDoc = () => {
    const added = [];
    return {
      added,
      getElementById: (id) => added.find((e) => e.id === id) ?? null,
      createElement: () => ({ listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } }),
      head: { appendChild: (e) => added.push(e) },
    };
  };
  for (const health of [{}, { edition: 'self-hosted' }]) {
    const doc = fakeDoc();
    assert.equal(h.loadEmojiWebFont(health, doc), true);
    assert.equal(h.loadEmojiWebFont(health, doc), false, 'once');
    const [link] = doc.added;
    assert.match(link.href, /^https:\/\/fonts\.googleapis\.com\//);
    assert.equal(link.media, 'print');
    link.listeners.load();
    assert.equal(link.media, 'all');
  }
  const cloud = fakeDoc();
  assert.equal(h.loadEmojiWebFont({ edition: 'cloud' }, cloud), false);
  assert.equal(cloud.added.length, 0);
});
