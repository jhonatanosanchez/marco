// Widget images (server/core/imageInfo.js, shared with Marco Cloud): magic bytes, sizes with every GIF / WebP / APNG
// frame, and metadata stripping. The images are tiny real ones (3x2, made by a browser) with metadata added here;
// stripping it must give the original bytes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageInfo, sniffImage, sniffWidgetImage, widgetImageInfo, stripImageMetadata } from '../core/imageInfo.js';

const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const cat = (...parts) => new Uint8Array(Buffer.concat(parts.map((p) => Buffer.from(p))));
const has = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));

const JPEG = b64('/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAYEAADAQEAAAAAAAAAAAAAAAAAAQIRIf/EABUBAQEAAAAAAAAAAAAAAAAAAAUH/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECAzEzcf/aAAwDAQACEQMRAD8Al6p09ptvM6AABYKlRqjxH//Z');
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAHUlEQVR4AWI6Y2z83/iM8X8QzcQABDPTgQQDAwMAAAD//+vkQ/gAAAAGSURBVAMAhrUHmAxQM8MAAAAASUVORK5CYII=');
const WEBP = b64('UklGRiYCAABXRUJQVlA4WAoAAAAgAAAAAgAAAQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggOAAAAJABAJ0BKgMAAgABQCYlqAJ0ugADmAD+7wEQcL7PyM73/Abr4tpl/9mMiL7d/7Bx/0xkRfbv6WgA');
/** 1x1 GIF89a with a loop extension (NETSCAPE2.0), a graphic control block and one frame. */
const GIF = b64('R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAAAAAACwAAAAAAQABAAACAkQBADs=');

/** A JPEG segment: FF marker, length, payload. */
const seg = (marker, payload) => {
  const p = Buffer.from(payload, 'latin1');
  return cat([0xff, marker, (p.length + 2) >> 8, (p.length + 2) & 255], p);
};
/** A PNG chunk (the CRC is not checked by the stripper; zeros are fine here). */
const chunk = (type, data) => {
  const d = Buffer.from(data, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(d.length);
  return cat(len, Buffer.from(type, 'latin1'), d, Buffer.alloc(4));
};
/** A RIFF (WebP) chunk, padded to an even size. */
const riffChunk = (type, data) => {
  const d = Buffer.from(data, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(d.length);
  return cat(Buffer.from(type, 'latin1'), len, d, d.length & 1 ? [0] : []);
};

test('widget images: real files sniffed and sized; GIF stays out of the gallery', () => {
  assert.equal(sniffWidgetImage(JPEG), 'image/jpeg');
  assert.equal(sniffWidgetImage(PNG), 'image/png');
  assert.equal(sniffWidgetImage(WEBP), 'image/webp');
  assert.equal(sniffWidgetImage(GIF), 'image/gif');
  for (const img of [JPEG, PNG, WEBP]) assert.deepEqual(widgetImageInfo(img), { w: 3, h: 2, frames: 1, area: 6 });
  assert.deepEqual(widgetImageInfo(GIF), { w: 1, h: 1, frames: 1, area: 1 });
  assert.equal(sniffImage(GIF), null, 'the gallery still refuses GIF');
  // what a widget image is not
  assert.equal(sniffWidgetImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniffWidgetImage(Buffer.from('﻿<html><script>alert(1)</script>')), null);
  assert.equal(sniffWidgetImage(cat([0x1f, 0x8b, 0x08, 0x00])), null, 'svgz');
  assert.equal(sniffWidgetImage(Buffer.from('<svg/>', 'utf16le')), null);
});

test('stripImageMetadata: JPEG loses EXIF, XMP, MPF, comments and what follows EOI; keeps JFIF and the ICC profile', () => {
  const soi = JPEG.subarray(0, 2);
  const dirty = cat(
    soi,
    seg(0xe1, 'Exif\0\0GPSLatitude 40.4168'),
    seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS</x:xmpmeta>'),
    seg(0xe2, 'MPF\0secondary image with its own GPS'),
    seg(0xfe, 'a comment'),
    JPEG.subarray(2),
    Buffer.from('ftypmp42 motion photo video GPS', 'latin1'),
  );
  const clean = stripImageMetadata(dirty, 'image/jpeg');
  assert.deepEqual(Buffer.from(clean), Buffer.from(JPEG));
  assert.ok(has(clean, 'ICC_PROFILE'));
  assert.ok(!has(clean, 'GPS') && !has(clean, 'comment'));
  assert.deepEqual(stripImageMetadata(JPEG, 'image/jpeg'), JPEG);
  // cut off before the end of the image, or not a JPEG: nothing to serve
  assert.equal(stripImageMetadata(JPEG.subarray(0, JPEG.length - 40), 'image/jpeg'), null);
  assert.equal(stripImageMetadata(PNG, 'image/jpeg'), null);
});

test('stripImageMetadata: PNG keeps only drawing chunks and stops at IEND', () => {
  const ihdrEnd = 8 + 25;
  const dirty = cat(
    PNG.subarray(0, ihdrEnd),
    chunk('tEXt', 'Comment\0taken at home'),
    chunk('eXIf', 'MM\0*GPS'),
    chunk('tIME', '\x07\xea\x0a\x0c\x00\x00\x00'),
    chunk('prVt', 'private data'),
    PNG.subarray(ihdrEnd),
    Buffer.from('trailing GPS data', 'latin1'),
  );
  const clean = stripImageMetadata(dirty, 'image/png');
  assert.deepEqual(Buffer.from(clean), Buffer.from(PNG));
  assert.deepEqual(widgetImageInfo(clean), widgetImageInfo(PNG));
  assert.equal(stripImageMetadata(PNG.subarray(0, PNG.length - 6), 'image/png'), null);
});

test('stripImageMetadata: WebP drops EXIF and XMP, clears their flags and fixes the RIFF size', () => {
  const body = cat(WEBP.subarray(12), riffChunk('EXIF', 'MM\0*GPS 40.4'), riffChunk('XMP ', '<x:xmpmeta>GPS</x:xmpmeta>'));
  const head = Buffer.from(WEBP.subarray(0, 12));
  head.writeUInt32LE(body.length + 4, 4);
  const dirty = Buffer.from(cat(head, body, Buffer.from('after the RIFF', 'latin1')));
  dirty[20] |= 0x08 | 0x04; // VP8X says EXIF and XMP are there
  const clean = stripImageMetadata(dirty, 'image/webp');
  assert.deepEqual(Buffer.from(clean), Buffer.from(WEBP));
  assert.equal(Buffer.from(clean).readUInt32LE(4), clean.length - 8);
  assert.ok(!has(clean, 'GPS'));
});

test('stripImageMetadata: GIF keeps its frames and the loop extension, drops comments, XMP and trailing data', () => {
  // header + colour table (13 + 6), then the NETSCAPE2.0 extension (19 bytes), then the rest
  const at = 13 + 6;
  const xmp = cat([0x21, 0xff, 11], Buffer.from('XMP DataXMP', 'latin1'), [8], Buffer.from('GPS 40.4', 'latin1'), [0]);
  const comment = cat([0x21, 0xfe, 9], Buffer.from('a comment', 'latin1'), [0]);
  const dirty = cat(GIF.subarray(0, at), xmp, comment, GIF.subarray(at), Buffer.from('after the trailer', 'latin1'));
  const clean = stripImageMetadata(dirty, 'image/gif');
  assert.deepEqual(Buffer.from(clean), Buffer.from(GIF));
  assert.ok(has(clean, 'NETSCAPE2.0'));
  assert.deepEqual(widgetImageInfo(clean), widgetImageInfo(GIF));
  assert.equal(stripImageMetadata(GIF.subarray(0, GIF.length - 4), 'image/gif'), null);
});

test('stripImageMetadata: unknown types and non-bytes give null', () => {
  assert.equal(stripImageMetadata(PNG, 'image/svg+xml'), null);
  assert.equal(stripImageMetadata('not bytes', 'image/png'), null);
  assert.equal(stripImageMetadata(new Uint8Array(0), 'image/webp'), null);
});

test('widgetImageInfo: frames hidden from the header still count (APNG fcTL past acTL, WebP frames after junk)', () => {
  const ihdrEnd = 8 + 25;
  const fctl = chunk('fcTL', '\0'.repeat(26));
  const iend = PNG.length - 12;
  const apng = cat(PNG.subarray(0, ihdrEnd), chunk('acTL', '\0\0\0\x01\0\0\0\0'), fctl, PNG.subarray(ihdrEnd, iend), ...Array(400).fill(fctl), PNG.subarray(iend));
  assert.equal(widgetImageInfo(apng).frames, 401, 'acTL says 1, 401 fcTL');
  const le24 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
  const vp8x = riffChunk('VP8X', Buffer.from([0x02, 0, 0, 0, ...le24(2), ...le24(1)]));
  const anmf = riffChunk('ANMF', Buffer.from([...le24(0), ...le24(0), ...le24(2), ...le24(1), ...le24(100), 0]));
  const body = cat(vp8x, riffChunk('ANIM', '\0'.repeat(6)), ...Array(100001).fill(riffChunk('JUNK', '')), ...Array(350).fill(anmf));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length + 4);
  const webp = cat(Buffer.from('RIFF'), len, Buffer.from('WEBP'), body);
  assert.equal(widgetImageInfo(webp).frames, 350);
});

test('stripImageMetadata: a JPEG keeps its EXIF orientation alone', () => {
  const exif = 'Exif\0\0MM\0\x2a\0\0\0\x08\0\x02' + '\x01\x0f\0\x02\0\0\0\x04Can\0' + '\x01\x12\0\x03\0\0\0\x01\0\x06\0\0' + '\0\0\0\0GPSLatitude';
  const clean = stripImageMetadata(cat(JPEG.subarray(0, 2), seg(0xe1, exif), JPEG.subarray(2)), 'image/jpeg');
  assert.ok(!has(clean, 'GPS') && !has(clean, 'Can'));
  const app1 = Buffer.from(clean).indexOf(Buffer.from('Exif\0\0', 'latin1'));
  assert.ok(app1 > 0);
  assert.equal(imageInfo(clean).orientation, 6);
  // upright pictures get no EXIF at all
  const upright = exif.replace('\x01\x12\0\x03\0\0\0\x01\0\x06', '\x01\x12\0\x03\0\0\0\x01\0\x01');
  assert.ok(!has(stripImageMetadata(cat(JPEG.subarray(0, 2), seg(0xe1, upright), JPEG.subarray(2)), 'image/jpeg'), 'Exif'));
});
