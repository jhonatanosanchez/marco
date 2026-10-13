// Profile photos of the family members: the checks and the clean copy of an uploaded image. Pure functions on a
// Uint8Array (Node buffers are ones too): no fs, no express, so Marco Cloud runs the same code (server/familyPhotos.js
// stores the files here).
//
// The admin crops the photo in the browser and uploads one small square (JPEG, PNG or WebP made by a canvas, which
// already has no camera data). Here it is checked again: the magic bytes (never SVG, GIF or anything else), the
// size in bytes, a square between MIN_SIDE and MAX_SIDE pixels, no animation. Then the file is rewritten keeping
// only the chunks that draw the picture: EXIF (GPS, camera, date), XMP, ICC profiles, comments and text chunks are
// left out. The pixels are not decoded or re-encoded here (there is no image decoder on the server); what is kept
// is exactly what a browser needs to draw it.
//
// A stored photo is named by the first 24 hex characters of the SHA-256 of the clean bytes (the caller hashes), so
// the name changes with every new photo (cache busting) and cannot be guessed.
import { widgetImageInfo, sniffWidgetImage, looksLikeSvg } from './imageInfo.js';

/** A stored photo's id: 24 lower-case hex characters (96 bits of SHA-256). */
export const PHOTO_ID_RE = /^[a-f0-9]{24}$/;
/** Largest upload accepted (the browser sends about 30 KB; six of these still fit an export comfortably). */
export const MAX_PHOTO_BYTES = 150 * 1024;
export const MIN_SIDE = 64;
export const MAX_SIDE = 1024;
/** Side the admin uploads (square). */
export const UPLOAD_SIDE = 384;
export const PHOTO_TYPES = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });

/** Address of a stored photo (the display, the family page and the admin add their own credential). */
export const photoPath = (id) => (PHOTO_ID_RE.test(String(id || '')) ? `/media/avatars/${id}` : null);

const ascii = (b, s, e) => {
  let out = '';
  for (let i = s; i < e && i < b.length; i++) out += String.fromCharCode(b[i]);
  return out;
};
const u32be = (b, o) => (o + 4 <= b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : -1);
const u32le = (b, o) => (o + 4 <= b.length ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : -1);

function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// The APP0 every clean JPEG gets: JFIF 1.1, no density, no thumbnail (the original APP0 can carry a thumbnail or up
// to 64 KB of anything, so it is never copied).
const JFIF_APP0 = Uint8Array.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/**
 * JPEG: SOI, a fixed JFIF APP0, the tables (DQT, DHT, DAC, DRI), one SOFn and the scans, then EOI. The scans are
 * walked byte by byte (FF00 stuffing and RSTn stay inside them), so whatever sits between scans (APPn, COM) is left
 * out and nothing after the first EOI survives (an EXIF block, a script, a ZIP glued to the end). Null when the
 * structure does not hold together: no frame, a second frame, a scan before the frame, an unknown marker, no EOI.
 */
function cleanJpeg(b) {
  const n = b.length;
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts = [b.subarray(0, 2), JFIF_APP0];
  let pos = 2;
  let frame = false;
  let scanned = false;
  let inScan = false;
  while (pos < n) {
    if (inScan) {
      // entropy-coded data up to the next real marker
      let i = pos;
      while (i + 1 < n) {
        if (b[i] === 0xff) {
          const m = b[i + 1];
          if (m !== 0x00 && m !== 0xff && !(m >= 0xd0 && m <= 0xd7)) break;
        }
        i++;
      }
      if (i + 1 >= n) return null;
      parts.push(b.subarray(pos, i));
      pos = i;
      inScan = false;
    }
    if (b[pos] !== 0xff || pos + 1 >= n) return null;
    let marker = b[pos + 1];
    while (marker === 0xff && pos + 2 < n) {
      pos++;
      marker = b[pos + 1];
    }
    if (marker === 0xd9) {
      if (!frame || !scanned) return null;
      parts.push(b.subarray(pos, pos + 2));
      return concat(parts);
    }
    if (pos + 4 > n) return null;
    const len = (b[pos + 2] << 8) | b[pos + 3];
    if (len < 2 || pos + 2 + len > n) return null;
    const seg = b.subarray(pos, pos + 2 + len);
    if (isSof(marker)) {
      if (frame) return null;
      frame = true;
      parts.push(seg);
    } else if (marker === 0xdb || marker === 0xc4 || marker === 0xcc || marker === 0xdd) {
      parts.push(seg);
    } else if (marker === 0xda) {
      if (!frame) return null;
      parts.push(seg);
      scanned = true;
      inScan = true;
    } else if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) {
      // APPn and COM are dropped; anything else (DNL, DHP, EXP, JPG extensions, a stray RSTn) is not a plain photo
      return null;
    }
    pos += 2 + len;
  }
  return null;
}

const PNG_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'bKGD', 'pHYs']);

/** PNG: keep the chunks that draw the picture (no tEXt / iTXt / zTXt / eXIf / tIME / iCCP; never APNG frames). */
function cleanPng(b) {
  const parts = [b.subarray(0, 8)];
  let pos = 8;
  let end = false;
  while (pos + 12 <= b.length) {
    const len = u32be(b, pos);
    const type = ascii(b, pos + 4, pos + 8);
    if (len < 0 || len > b.length || pos + 12 + len > b.length) return null;
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') return null;
    if (PNG_KEEP.has(type)) parts.push(b.subarray(pos, pos + 12 + len));
    pos += 12 + len;
    if (type === 'IEND') { end = true; break; }
  }
  if (!end || ascii(b, 12, 16) !== 'IHDR') return null;
  return concat(parts);
}

/** WebP: keep VP8 / VP8L / ALPH and VP8X (its ICC, EXIF and XMP flags cleared); never animated. */
function cleanWebp(b) {
  const size = u32le(b, 4);
  if (size < 4 || size + 8 > b.length) return null;
  const parts = [];
  let pos = 12;
  let image = false;
  const limit = Math.min(b.length, size + 8);
  while (pos + 8 <= limit) {
    const type = ascii(b, pos, pos + 4);
    const len = u32le(b, pos + 4);
    const padded = len + (len & 1);
    if (len < 0 || pos + 8 + len > limit) return null;
    if (type === 'ANIM' || type === 'ANMF') return null;
    if (type === 'VP8X') {
      if (len !== 10) return null;
      const c = b.slice(pos, pos + 8 + padded);
      if (c[8] & 0x02) return null; // animation flag
      c[8] &= ~(0x20 | 0x08 | 0x04); // ICC, EXIF, XMP
      parts.push(c);
    } else if (type === 'VP8 ' || type === 'VP8L' || type === 'ALPH') {
      if (type !== 'ALPH') image = true;
      parts.push(b.subarray(pos, Math.min(pos + 8 + padded, limit)));
    }
    pos += 8 + padded;
  }
  if (!image) return null;
  const body = concat(parts);
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  const n = body.length + 4;
  head.set([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff], 4);
  head.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return concat([head, body]);
}

/**
 * Check an uploaded profile photo and make its clean copy.
 * @returns {{ ok: true, type: string, ext: string, bytes: Uint8Array, width: number, height: number }
 *   | { ok: false, error: 'empty' | 'too_big' | 'svg' | 'not_image' | 'animated' | 'bad_size' | 'not_square' | 'corrupt' }}
 */
export function cleanFamilyPhoto(input) {
  if (!(input instanceof Uint8Array) || input.length === 0) return { ok: false, error: 'empty' };
  if (input.length > MAX_PHOTO_BYTES) return { ok: false, error: 'too_big' };
  if (looksLikeSvg(input)) return { ok: false, error: 'svg' };
  const type = sniffWidgetImage(input);
  if (!type || !PHOTO_TYPES[type]) return { ok: false, error: 'not_image' };
  const info = widgetImageInfo(input);
  if (!info) return { ok: false, error: 'corrupt' };
  if (info.frames > 1) return { ok: false, error: 'animated' };
  if (info.w !== info.h) return { ok: false, error: 'not_square' };
  if (info.w < MIN_SIDE || info.w > MAX_SIDE) return { ok: false, error: 'bad_size' };
  let bytes = null;
  try {
    bytes = type === 'image/jpeg' ? cleanJpeg(input) : type === 'image/png' ? cleanPng(input) : cleanWebp(input);
  } catch {
    bytes = null;
  }
  if (!bytes) return { ok: false, error: 'corrupt' };
  // the clean copy must still read as the same picture
  const again = widgetImageInfo(bytes);
  if (!again || again.w !== info.w || again.h !== info.h || again.frames > 1) return { ok: false, error: 'corrupt' };
  return { ok: true, type, ext: PHOTO_TYPES[type], bytes, width: info.w, height: info.h };
}

/** Ids of the photos the family config uses. */
export function photoIdsOf(family) {
  const out = new Set();
  for (const m of family?.members || []) if (typeof m?.photo === 'string' && PHOTO_ID_RE.test(m.photo)) out.add(m.photo);
  return out;
}
