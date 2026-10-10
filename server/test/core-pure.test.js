// The pure modules in server/core on their own: image headers (with fuzzing), file names, pairing codes, hashing,
// announcements, feed parsing and the activity helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { imageInfo, imageHeaderNeed, exifOrientation, sniffImage, sanitizeFilename, isGalleryFile, uploadName, baseName, extName } from '../core/imageInfo.js';
import { CODE_ALPHABET, CODE_LENGTH, randomCode, normalizeCode } from '../core/pairCore.js';
import { hash, sha1Hex, randomId } from '../core/lib/text.js';
import { hash as nodeHash } from '../lib/text.js';
import { sanitizeAnnounce, makeAnnouncement, splitExpired, activeFor, alertsFilter, ACTIVE_MAX } from '../core/announceCore.js';
import { parseFeed, MAX_FEED_ITEMS } from '../core/newsParse.js';
import { changedSections, redactSecrets, capData, MAX_DATA_CHARS } from '../core/activityCore.js';
import { makeBundle, parseImport, mergeImport } from '../core/backupsCore.js';
import { defaultConfig, DEFAULT_ICON_RULES } from '../core/defaults.js';
import ICON_RULES from '../core/iconRules.js';

/** Small deterministic PRNG (mulberry32), so a failing fuzz case can be reproduced. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randomBytes = (rand, n) => Uint8Array.from({ length: n }, () => Math.floor(rand() * 256));

function exifSegment(orientation, { le = false } = {}) {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write(le ? 'II' : 'MM', 0, 'latin1');
  const w16 = (v, o) => (le ? tiff.writeUInt16LE(v, o) : tiff.writeUInt16BE(v, o));
  const w32 = (v, o) => (le ? tiff.writeUInt32LE(v, o) : tiff.writeUInt32BE(v, o));
  w16(42, 2); w32(8, 4); w16(1, 8); w16(0x0112, 10); w16(3, 12); w32(1, 14); w16(orientation, 18);
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
}

function jpeg(w, h, orientation = 0, { le = false } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    const body = exifSegment(orientation, { le });
    const hdr = Buffer.from([0xff, 0xe1, 0, 0]);
    hdr.writeUInt16BE(body.length + 2, 2);
    parts.push(hdr, body);
  }
  const sof = Buffer.from([0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  parts.push(sof, Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]));
  return Buffer.concat(parts);
}

function png(w, h) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}

function webp(kind, w, h) {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1'); b.write('WEBP', 8, 'latin1'); b.write(kind, 12, 'latin1');
  if (kind === 'VP8X') { b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); }
  if (kind === 'VP8 ') { b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); }
  if (kind === 'VP8L') b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21);
  return b;
}

const isInfo = (r) => r === null || (Number.isInteger(r.w) && Number.isInteger(r.h) && r.w >= 0 && r.h >= 0
  && Number.isInteger(r.orientation) && r.orientation >= 1 && r.orientation <= 8);

test('imageInfo on bytes: JPEG (EXIF big and little endian), PNG and the three WebP kinds', () => {
  assert.deepEqual(imageInfo(jpeg(6000, 4000)), { w: 6000, h: 4000, orientation: 1 });
  assert.deepEqual(imageInfo(jpeg(6000, 4000, 6)), { w: 4000, h: 6000, orientation: 6 });
  assert.deepEqual(imageInfo(jpeg(6000, 4000, 8, { le: true })), { w: 4000, h: 6000, orientation: 8 });
  assert.deepEqual(imageInfo(jpeg(640, 480, 3)), { w: 640, h: 480, orientation: 3 });
  assert.deepEqual(imageInfo(png(1920, 1080)), { w: 1920, h: 1080, orientation: 1 });
  assert.deepEqual(imageInfo(webp('VP8X', 800, 600)), { w: 800, h: 600, orientation: 1 });
  assert.deepEqual(imageInfo(webp('VP8 ', 800, 600)), { w: 800, h: 600, orientation: 1 });
  assert.deepEqual(imageInfo(webp('VP8L', 800, 600)), { w: 800, h: 600, orientation: 1 });
  assert.deepEqual(imageInfo(new Uint8Array(jpeg(10, 20))), { w: 10, h: 20, orientation: 1 }); // plain Uint8Array
  for (const bad of [null, undefined, 'not bytes', [0xff, 0xd8], {}, new ArrayBuffer(8)]) assert.equal(imageInfo(bad), null);
  assert.equal(exifOrientation(exifSegment(6)), 6);
  assert.equal(exifOrientation(exifSegment(6, { le: true })), 6);
  assert.equal(exifOrientation(exifSegment(9)), 0); // out of range
  for (const bad of [null, 'Exif', new Uint8Array(0)]) assert.equal(exifOrientation(bad), 0);
});

test('imageInfo / exifOrientation fuzz: every truncation of valid headers, random bytes, mutations', () => {
  const rand = rng(20261010);
  const samples = [jpeg(6000, 4000, 6), jpeg(320, 200, 3, { le: true }), jpeg(10, 10), png(1920, 1080),
    webp('VP8X', 800, 600), webp('VP8 ', 800, 600), webp('VP8L', 800, 600)];
  for (const s of samples) {
    const full = imageInfo(s);
    for (let n = 0; n <= s.length; n++) {
      const r = imageInfo(s.subarray(0, n));
      assert.ok(isInfo(r), `truncated to ${n}: ${JSON.stringify(r)}`);
      if (r) assert.deepEqual(r, full, `a truncated header never gives a different size (n=${n})`);
    }
  }
  for (const o of [3, 6]) {
    const seg = exifSegment(o);
    for (let n = 0; n <= seg.length; n++) {
      const v = exifOrientation(seg.subarray(0, n));
      assert.ok(v === 0 || v === o, `exif truncated to ${n}: ${v}`);
    }
  }
  for (let i = 0; i < 3000; i++) {
    const garbage = randomBytes(rand, Math.floor(rand() * 200));
    // Half the time give it a real magic number so the parsers go past the first check.
    if (i % 2 && garbage.length > 12) {
      const pick = samples[i % samples.length];
      garbage.set(pick.subarray(0, Math.min(16, garbage.length)));
    }
    assert.ok(isInfo(imageInfo(garbage)));
    const seg = randomBytes(rand, Math.floor(rand() * 80));
    if (i % 3 === 0 && seg.length > 8) seg.set([0x45, 0x78, 0x69, 0x66, 0, 0, i % 2 ? 0x49 : 0x4d, i % 2 ? 0x49 : 0x4d]);
    const o = exifOrientation(seg);
    assert.ok(Number.isInteger(o) && o >= 0 && o <= 8);
  }
  for (let i = 0; i < 2000; i++) {
    const s = Buffer.from(samples[i % samples.length]);
    for (let k = 0; k < 1 + (i % 4); k++) s[Math.floor(rand() * s.length)] = Math.floor(rand() * 256);
    assert.ok(isInfo(imageInfo(s)));
  }
  // Huge IFD entry count in a short segment, and a JPEG of nothing but fill bytes: bounded, no throw.
  const seg = Buffer.concat([Buffer.from('Exif\0\0MM\0\x2a\0\0\0\x08\xff\xff', 'latin1'), Buffer.alloc(20)]);
  assert.equal(exifOrientation(seg), 0);
  assert.equal(imageInfo(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(5000, 0xff)])), null);
});

test('imageHeaderNeed: a cut-off header asks for more bytes, anything else gives 0', () => {
  const samples = [jpeg(6000, 4000, 6), jpeg(320, 200, 3, { le: true }), png(1920, 1080),
    webp('VP8X', 800, 600), webp('VP8 ', 800, 600), webp('VP8L', 800, 600)];
  for (const s of samples) {
    assert.equal(imageHeaderNeed(s), 0);
    for (let n = 0; n < s.length; n++) {
      const cut = s.subarray(0, n);
      const need = imageHeaderNeed(cut);
      if (imageInfo(cut)) assert.equal(need, 0);
      else {
        assert.ok(need > n && need <= s.length, `n=${n} need=${need}`);
        // With the bytes it asked for, it either finds the size or asks for more, never fewer.
        const more = s.subarray(0, need);
        assert.ok(imageInfo(more) || imageHeaderNeed(more) > need);
      }
    }
  }
  // Not an image, or a broken one: more data cannot help.
  assert.equal(imageHeaderNeed(new TextEncoder().encode('not an image at all, sorry')), 0);
  assert.equal(imageHeaderNeed(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0])), 0); // scan before SOF
  assert.equal(imageHeaderNeed(new TextEncoder().encode('RIFF\0\0\0\0AVI LIST')), 0);
  assert.equal(imageHeaderNeed(null), 0);
  // A big segment before the size: asks for the end of the segment.
  const big = new Uint8Array([0xff, 0xd8, 0xff, 0xe2, 0xff, 0xff, 1, 2, 3]);
  assert.equal(imageHeaderNeed(big), 2 + 2 + 0xffff + 4);
});

test('sniffImage: JPEG, PNG and WebP by magic bytes; SVG, HEIC, GIF and short input refused', () => {
  assert.equal(sniffImage(jpeg(1, 1)), 'image/jpeg');
  assert.equal(sniffImage(png(1, 1)), 'image/png');
  assert.equal(sniffImage(webp('VP8X', 1, 1)), 'image/webp');
  const heic = Buffer.alloc(32); heic.write('\0\0\0\x18ftypheic', 0, 'latin1');
  for (const b of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), heic, Buffer.from('GIF89a......'),
    Buffer.from([0xff, 0xd8]), new Uint8Array(0), null, 'x']) {
    assert.equal(sniffImage(b), null);
  }
  // A PNG prefix alone is not enough.
  assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), null);
});

/** The node:path version the server used before the name rules moved to core. */
function legacySanitize(name) {
  const base = path.basename(String(name || '')).normalize('NFD').replace(/\p{M}+/gu, '');
  let ext = path.extname(base).toLowerCase();
  if (ext === '.jpeg') ext = '.jpg';
  const stem = path.basename(base, path.extname(base)).toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').replace(/-{2,}/g, '-').slice(0, 80) || 'foto';
  return `${stem}${ext}`;
}

test('file names: same results as node:path for baseName, extName and the sanitizer', () => {
  const rand = rng(7);
  const chars = ['a', 'B', '.', '/', ' ', '-', '_', 'é', 'Ñ', '漢', '\\', 'J', 'P', 'G', '1'];
  const names = ['', '.', '..', '...', '.a', 'a.', 'a..', '.a.b', 'a.b.c', '/', 'a/', 'a//', '/a/b.jpg/', 'x.JPEG',
    '../../etc/Fotó Família 2024!.JPEG', '.hidden.png', 'C:\\fotos\\a.jpg'];
  for (let i = 0; i < 4000; i++) names.push(Array.from({ length: Math.floor(rand() * 14) }, () => chars[Math.floor(rand() * chars.length)]).join(''));
  for (const n of names) {
    assert.equal(baseName(n), path.posix.basename(n), `basename ${JSON.stringify(n)}`);
    const b = baseName(n);
    assert.equal(extName(b), path.posix.extname(b), `extname ${JSON.stringify(b)}`);
    assert.equal(sanitizeFilename(n), legacySanitize(n), `sanitize ${JSON.stringify(n)}`);
  }
  assert.equal(sanitizeFilename('../../etc/Fotó Família 2024!.JPEG'), 'foto-familia-2024.jpg');
  assert.equal(uploadName('captura', 'image/webp'), 'captura.webp');
  assert.equal(uploadName('IMG_0001.HEIC'), 'img_0001.jpg');
  assert.equal(isGalleryFile('a.webp'), true);
  for (const n of ['../x.jpg', 'a/b.jpg', '.x.jpg', 'a.svg', '', null]) assert.equal(isGalleryFile(n), false);
});

test('pairCore: codes use the alphabet, any length, unbiased rejection, normalisation', () => {
  assert.equal(CODE_LENGTH, 6);
  assert.equal(CODE_ALPHABET.length, 31);
  for (const len of [6, 8]) {
    for (let i = 0; i < 200; i++) {
      const c = randomCode(len);
      assert.equal(c.length, len);
      assert.ok([...c].every((ch) => CODE_ALPHABET.includes(ch)));
      assert.equal(normalizeCode(c.toLowerCase(), len), c);
    }
  }
  // Bytes from 248 up are skipped (248 = 8 × 31), so each symbol is equally likely.
  const fed = [255, 248, 0, 31, 30, 247, 249, 62];
  let k = 0;
  const code = randomCode(5, (n) => Uint8Array.from({ length: n }, () => fed[k++ % fed.length]));
  assert.equal(code, [0, 31, 30, 247, 62].map((b) => CODE_ALPHABET[b % 31]).join(''));
  assert.equal(normalizeCode('abc-234'), 'ABC234');
  assert.equal(normalizeCode('ab c-23 4'), 'ABC234');
  assert.equal(normalizeCode('ABCD2345', 8), 'ABCD2345');
  assert.equal(normalizeCode('ABCD2345'), null);
  assert.equal(normalizeCode('ABC1O0'), null);
  assert.equal(normalizeCode(123456), null);
});

test('text: the pure SHA-1 matches node:crypto, randomId has the old format', () => {
  const rand = rng(99);
  const inputs = ['', 'a', 'abc', 'é漢🎉', ...[55, 56, 63, 64, 65, 119, 120, 1000].map((n) => 'x'.repeat(n))];
  for (let i = 0; i < 300; i++) inputs.push(String.fromCodePoint(...Array.from({ length: Math.floor(rand() * 90) }, () => Math.floor(rand() * 0xd000))));
  for (const s of inputs) {
    assert.equal(sha1Hex(s), crypto.createHash('sha1').update(s).digest('hex'));
    assert.equal(hash(s), nodeHash(s));
  }
  assert.equal(hash({ b: 1, a: [1, 2] }, 12), nodeHash({ a: [1, 2], b: 1 }, 12));
  assert.match(randomId('a_', 6), /^a_[0-9a-f]{12}$/);
  assert.match(randomId(), /^[0-9a-f]{12}$/);
});

test('icon rules: one list for server, admin and display', () => {
  assert.ok(ICON_RULES.length >= 18);
  assert.deepEqual(DEFAULT_ICON_RULES, ICON_RULES.map((r) => ({ id: r.id, match: r.match, emoji: r.emoji, color: null })));
  assert.deepEqual(defaultConfig().calendar.iconRules, DEFAULT_ICON_RULES);
  assert.equal(new Set(ICON_RULES.map((r) => r.id)).size, ICON_RULES.length);
});

test('announceCore: validation (emoji rule from validate.js), record, expiry, targeting, alerts filter', () => {
  const resolve = (keys) => (keys === undefined ? { ids: [] } : { ids: keys });
  const ok = sanitizeAnnounce({ title: ' Hola ', emoji: ' 🍽️ ', screens: ['s1'] }, resolve);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { title: 'Hola', body: '', emoji: '🍽️', style: 'info', durationSec: 30, sound: false, screenIds: ['s1'] });
  const bad = sanitizeAnnounce({ title: 'x', emoji: 'e'.repeat(17) }, resolve);
  assert.deepEqual(bad.details, [{ path: 'emoji', message: 'too long (max 16)' }]);
  assert.deepEqual(sanitizeAnnounce({ title: 'x', emoji: 5 }, resolve).details, [{ path: 'emoji', message: 'expected string' }]);

  const now = new Date('2026-01-01T10:00:00Z');
  const a = makeAnnouncement({ ...ok.value, durationSec: 60 }, { via: 'hook', by: 'token:x'.padEnd(200, 'y'), now, id: 'a_1' });
  assert.equal(a.expiresAt, '2026-01-01T10:01:00.000Z');
  assert.equal(a.by.length, 120);
  assert.match(makeAnnouncement(ok.value, { via: 'admin', by: 'a' }).id, /^a_[0-9a-f]{12}$/);
  const all = makeAnnouncement({ ...ok.value, screenIds: [] }, { via: 'admin', by: 'a', now, id: 'a_2' });
  const t = now.getTime();
  assert.deepEqual(activeFor([a, all], 's1', t).map((x) => x.id), ['a_1', 'a_2']);
  assert.deepEqual(activeFor([a, all], 's2', t).map((x) => x.id), ['a_2']);
  assert.deepEqual(activeFor([a, all], 's1', t + 60_000), []);
  const sp = splitExpired([a, { ...all, expiresAt: '2026-01-01T09:00:00Z' }], t);
  assert.deepEqual([sp.keep.map((x) => x.id), sp.expired.map((x) => x.id)], [['a_1'], ['a_2']]);
  const cfg = { screens: [{ id: 's1', alerts: { enabled: false } }, { id: 's2', alerts: { enabled: true } }] };
  const f = alertsFilter(cfg);
  assert.deepEqual(['s1', 's2', 'unknown'].map((screenId) => f({ screenId })), [false, true, true]);
  assert.equal(ACTIVE_MAX, 50);
});

test('newsParse: item cap applied before mapping, no entity expansion', () => {
  const items = Array.from({ length: 300 }, (_, i) => `<item><title>Item ${i}</title><guid>g${i}</guid></item>`).join('');
  const xml = `<rss><channel><title>Big</title>${items}</channel></rss>`;
  assert.equal(parseFeed(xml).items.length, MAX_FEED_ITEMS);
  assert.deepEqual(parseFeed(xml, '', { maxItems: 3 }).items.map((i) => i.title), ['Item 0', 'Item 1', 'Item 2']);
  assert.equal(parseFeed(xml, '', { maxItems: 0 }).items.length, 0);
  // "Billion laughs": entities stay unexpanded and parsing is instant.
  let ents = '<!ENTITY lol "lol">';
  for (let i = 1; i < 10; i++) ents += `<!ENTITY lol${i} "${`&lol${i === 1 ? '' : i - 1};`.repeat(10)}">`;
  const bomb = `<?xml version="1.0"?><!DOCTYPE rss [${ents}]><rss><channel><title>&lol9;</title><item><title>A &lol9; B</title></item></channel></rss>`;
  const started = Date.now();
  const f = parseFeed(bomb);
  assert.ok(Date.now() - started < 500);
  assert.ok(f.items[0].title.length < 50, f.items[0].title);
  assert.ok(!f.items[0].title.includes('lollol'));
});

test('activityCore: redaction, data cap, changed sections', () => {
  assert.equal(redactSecrets('GET /d/abc123?k=secret&x=1'), 'GET /d/[redacted]?k=[redacted]&x=1');
  assert.deepEqual(capData({ url: '/d/0123456789abcdef' }), { url: '/d/[redacted]' });
  const big = capData({ s: 'x'.repeat(MAX_DATA_CHARS + 10) });
  assert.equal(big.truncated, true);
  assert.equal(big.preview.length, 300);
  const cyclic = {}; cyclic.self = cyclic;
  assert.deepEqual(capData(cyclic), { truncated: true });
  assert.deepEqual(changedSections(null, {}), ['*']);
});

test('backupsCore: bundle → parse → merge round trip without files', () => {
  const cfg = defaultConfig();
  const bundle = makeBundle(cfg, { appVersion: '0.0.0', now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(bundle.format, 'marco-backup');
  assert.equal(bundle.secrets, undefined);
  const p = parseImport(JSON.parse(JSON.stringify(bundle)));
  assert.equal(p.ok, true, JSON.stringify(p.errors));
  const merged = mergeImport({ ...cfg, revision: 7 }, p.value, ['news']);
  assert.equal(merged.revision, 7);
});
