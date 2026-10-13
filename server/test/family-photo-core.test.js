// Profile photos: the checks and the clean copy (familyPhotoCore.js), without a server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFamilyPhoto, photoIdsOf, photoPath, MAX_PHOTO_BYTES } from '../core/familyPhotoCore.js';
import { sanitizeFamily, displayFamily, phoneFamily, emptyState } from '../core/familyCore.js';
import { makeJpeg, makePng, makeWebp } from './photoBytes.js';

const has = (bytes, s) => Buffer.from(bytes).includes(Buffer.from(s, 'latin1'));

test('JPEG, PNG and WebP squares are accepted and come back without their metadata', () => {
  const j = makeJpeg(384, 384);
  assert.ok(has(j, 'GPS'));
  const rj = cleanFamilyPhoto(j);
  assert.equal(rj.ok, true, rj.error);
  assert.equal(rj.type, 'image/jpeg');
  assert.equal(rj.width, 384);
  assert.ok(!has(rj.bytes, 'GPS') && !has(rj.bytes, 'Exif') && !has(rj.bytes, 'a comment'));
  assert.ok(has(rj.bytes, 'JFIF'));
  assert.deepEqual([...rj.bytes.slice(-2)], [0xff, 0xd9]);

  const p = makePng(96, 96, { text: 'secret place', extra: [['eXIf', Buffer.from('GPS')], ['iCCP', Buffer.from('icc')]] });
  const rp = cleanFamilyPhoto(p);
  assert.equal(rp.ok, true, rp.error);
  assert.ok(!has(rp.bytes, 'secret place') && !has(rp.bytes, 'eXIf') && !has(rp.bytes, 'iCCP'));
  assert.ok(has(rp.bytes, 'IDAT') && has(rp.bytes, 'IEND'));

  const w = makeWebp(256, 256);
  const rw = cleanFamilyPhoto(w);
  assert.equal(rw.ok, true, rw.error);
  assert.ok(!has(rw.bytes, 'GPS') && !has(rw.bytes, 'EXIF'));
  assert.equal(rw.bytes[20] & 0x08, 0, 'the VP8X EXIF flag is cleared');
  assert.equal(Buffer.from(rw.bytes).readUInt32LE(4), rw.bytes.length - 8, 'RIFF size matches');
});

test('refused: SVG, GIF, HTML, empty, too big, not square, too small or large, animated, broken', () => {
  const err = (b) => cleanFamilyPhoto(b).error;
  assert.equal(err(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), 'svg');
  assert.equal(err(Buffer.from('<?xml version="1.0"?><svg></svg>')), 'svg');
  assert.equal(err(Buffer.from('GIF89a\x10\x00\x10\x00\x00\x00\x00;', 'latin1')), 'not_image');
  assert.equal(err(Buffer.from('<html><body>hi</body></html>')), 'not_image');
  assert.equal(err(Buffer.alloc(0)), 'empty');
  assert.equal(err('not bytes'), 'empty');
  assert.equal(err(Buffer.concat([makeJpeg(384, 384), Buffer.alloc(MAX_PHOTO_BYTES)])), 'too_big');
  assert.equal(err(makeJpeg(400, 300)), 'not_square');
  assert.equal(err(makePng(32, 32)), 'bad_size');
  assert.equal(err(makeJpeg(2048, 2048)), 'bad_size');
  assert.ok(['animated', 'corrupt'].includes(err(makeWebp(128, 128, { animated: true }))));
  assert.equal(err(makeJpeg(128, 128).subarray(0, 40)), 'corrupt');
  const noEnd = makePng(96, 96);
  assert.equal(err(noEnd.subarray(0, noEnd.length - 12)), 'corrupt');
});

test('the config keeps a valid photo id only; the TV drops the photo while private, the phone always has it', () => {
  const errs = [];
  const fam = sanitizeFamily({
    enabled: true,
    members: [
      { id: 'm_a', name: 'Ana', avatar: '🦊', photo: 'ab'.repeat(12) },
      { id: 'm_b', name: 'Bruno', avatar: '🐻', photo: '../../etc/passwd' },
      { id: 'm_c', name: 'Carla', avatar: '🌷' },
    ],
  }, (p, m) => errs.push([p, m]));
  assert.deepEqual(fam.members.map((m) => m.photo), ['ab'.repeat(12), null, null]);
  assert.deepEqual(errs, [['family.members[1].photo', 'invalid photo id']]);
  assert.deepEqual([...photoIdsOf(fam)], ['ab'.repeat(12)]);
  assert.equal(photoPath('ab'.repeat(12)), `/media/avatars/${'ab'.repeat(12)}`);
  assert.equal(photoPath('x'), null);

  const cfg = { family: fam };
  const screen = { family: { memberIds: null, touch: false, showQr: true } };
  const open = displayFamily(cfg, screen, emptyState(), { today: '2026-10-13' });
  assert.deepEqual(open.members.map((m) => m.photo), [`/media/avatars/${'ab'.repeat(12)}`, null, null]);
  const priv = displayFamily(cfg, screen, emptyState(), { today: '2026-10-13', private: true });
  assert.deepEqual(priv.members.map((m) => m.photo), [null, null, null]);
  assert.equal(priv.members[0].avatar, '🦊', 'the emoji stays');
  const phone = phoneFamily(cfg, emptyState(), { today: '2026-10-13' });
  assert.equal(phone.members[0].photo, `/media/avatars/${'ab'.repeat(12)}`);
});

test('the round crop: fills the window, zooms around a point, never leaves the picture', async () => {
  let m;
  try { m = await import('../../web/admin/avatarCrop.ts'); } catch { return; } // TypeScript imports need Node >= 22.18
  const { initialCrop, panBy, zoomTo, cropRect, placement, clampCrop, MAX_ZOOM } = m;
  const W = 1600, H = 1200, V = 300;
  const c0 = initialCrop(W, H);
  assert.deepEqual(cropRect(c0, W, H), { sx: 200, sy: 0, side: 1200 });
  assert.deepEqual(placement(c0, W, H, V), { x: -50, y: 0, width: 400, height: 300 });
  // the window 30 px in from the stage's edges: the picture moves with it, the dimmed rest shows around it
  assert.deepEqual(placement(c0, W, H, V, 30), { x: -20, y: 30, width: 400, height: 300 });
  assert.equal(m.stagePad(340), 34);
  // dragging right shows more of the left side, up to the edge
  assert.equal(cropRect(panBy(c0, 30, 0, W, H, V), W, H).sx, 80);
  assert.equal(cropRect(panBy(c0, 9999, 9999, W, H, V), W, H).sx, 0);
  assert.equal(cropRect(panBy(c0, 0, 50, W, H, V), W, H).sy, 0, 'no room up or down at zoom 1');
  // zoom 2 around the middle: half the side, same centre; around a corner point: that point stays put
  const z = zoomTo(c0, 2, W, H, V);
  assert.deepEqual(cropRect(z, W, H), { sx: 500, sy: 300, side: 600 });
  const zc = zoomTo(c0, 2, W, H, V, 0, 0);
  assert.deepEqual(cropRect(zc, W, H), { sx: 200, sy: 0, side: 600 });
  assert.equal(clampCrop({ cx: 0, cy: 0, zoom: 99 }, W, H).zoom, MAX_ZOOM);
  const r = cropRect({ cx: -5, cy: 5000, zoom: 3 }, W, H);
  assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.side <= W && r.sy + r.side <= H);
});

test('JPEG: nothing after the first EOI, nothing between scans, one frame, a fixed APP0', () => {
  const seg = (m, data) => Buffer.concat([Buffer.from([0xff, m, (data.length + 2) >> 8, (data.length + 2) & 255]), data]);
  const base = makeJpeg(128, 128);
  // a second EOI with EXIF / GPS, a script and a ZIP header glued after the real end
  const poly = Buffer.concat([
    base,
    seg(0xe1, Buffer.from('Exif\0\0GPS secret', 'latin1')),
    Buffer.from('<script>alert(1)</script>PK\x03\x04', 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);
  const r = cleanFamilyPhoto(poly);
  assert.equal(r.ok, true, r.error);
  assert.ok(!has(r.bytes, 'secret') && !has(r.bytes, '<script>') && !has(r.bytes, 'PK'));
  assert.equal(Buffer.from(r.bytes).indexOf(Buffer.from([0xff, 0xd9])), r.bytes.length - 2, 'one EOI, at the end');

  // a progressive-style file: APP1 and COM between two scans go, the second scan and its table stay
  const eoi = base.length - 2;
  const twoScans = Buffer.concat([
    base.subarray(0, eoi),
    seg(0xe1, Buffer.from('Exif\0\0GPS between', 'latin1')),
    seg(0xfe, Buffer.from('note between', 'latin1')),
    seg(0xc4, Buffer.alloc(20, 0)),
    seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    Buffer.from([0xab, 0xff, 0x00, 0xff, 0xd3, 0xcd]),
    Buffer.from([0xff, 0xd9]),
  ]);
  const r2 = cleanFamilyPhoto(twoScans);
  assert.equal(r2.ok, true, r2.error);
  assert.ok(!has(r2.bytes, 'between'));
  assert.ok(has(r2.bytes, '\xab\xff\x00\xff\xd3\xcd'), 'stuffed bytes and RSTn stay inside the scan');

  // the original APP0 (thumbnail, anything) is replaced by a 16-byte JFIF one
  const app0 = seg(0xe0, Buffer.concat([Buffer.from('JFIF\0\x01\x02\0\0\x01\0\x01\x02\x02', 'latin1'), Buffer.from('THUMBTHUMBTHUMB')]));
  const withThumb = Buffer.concat([base.subarray(0, 2), app0, base.subarray(2)]);
  const r3 = cleanFamilyPhoto(withThumb);
  assert.equal(r3.ok, true, r3.error);
  assert.ok(!has(r3.bytes, 'THUMB'));
  assert.deepEqual([...r3.bytes.subarray(2, 6)], [0xff, 0xe0, 0, 16]);

  // a second frame (its size would not be checked) and a file with no end are refused
  const sofAt = base.indexOf(Buffer.from([0xff, 0xc0]));
  const sofLen = base.readUInt16BE(sofAt + 2);
  const sof2 = Buffer.from(base.subarray(sofAt, sofAt + 2 + sofLen));
  sof2.writeUInt16BE(60000, 5);
  sof2.writeUInt16BE(60000, 7);
  const twoFrames = Buffer.concat([base.subarray(0, sofAt + 2 + sofLen), sof2, base.subarray(sofAt + 2 + sofLen)]);
  assert.equal(cleanFamilyPhoto(twoFrames).error, 'corrupt');
  assert.equal(cleanFamilyPhoto(base.subarray(0, base.length - 2)).error, 'corrupt');
});

test('the screens and the phone get the address photoUrl() gives (null: the emoji)', () => {
  const fam = sanitizeFamily({ enabled: true, members: [{ id: 'm_a', name: 'Ana', avatar: '🦊', photo: 'cd'.repeat(12) }] });
  const cfg = { family: fam };
  const screen = { family: { memberIds: null, touch: false, showQr: true } };
  const signed = (id) => `/m/h1/avatars/${id}.jpg?e=1&s=x`;
  assert.equal(displayFamily(cfg, screen, emptyState(), { today: '2026-10-13', photoUrl: signed }).members[0].photo, signed('cd'.repeat(12)));
  assert.equal(displayFamily(cfg, screen, emptyState(), { today: '2026-10-13', photoUrl: () => null }).members[0].photo, null);
  let asked = 0;
  assert.equal(displayFamily(cfg, screen, emptyState(), { today: '2026-10-13', private: true, photoUrl: () => { asked++; return 'x'; } }).members[0].photo, null);
  assert.equal(asked, 0, 'never asked in privacy mode');
  assert.equal(phoneFamily(cfg, emptyState(), { today: '2026-10-13', photoUrl: signed }).members[0].photo, signed('cd'.repeat(12)));
});
