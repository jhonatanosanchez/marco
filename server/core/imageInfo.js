// Image headers and photo file names, shared with Marco Cloud: magic-byte sniffing, pixel size and EXIF orientation
// read from the first bytes of a JPEG / PNG / WebP (no decoding), and the gallery file name rules. Works on a
// Uint8Array (a Node Buffer is one), checks every offset against the length and never throws on bad input.
// server/photos.js reads the bytes from disk.

/** Gallery file extensions and upload MIME types (JPEG, PNG and WebP only). */
export const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const isBytes = (b) => b instanceof Uint8Array;
const ascii = (b, start, end) => {
  if (end > b.length) return '';
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(b[i]);
  return s;
};
// Readers return -1 when the field is past the end of the data.
const u16be = (b, o) => (o >= 0 && o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : -1);
const u16le = (b, o) => (o >= 0 && o + 2 <= b.length ? b[o] | (b[o + 1] << 8) : -1);
const u24le = (b, o) => (o >= 0 && o + 3 <= b.length ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) : -1);
const u32be = (b, o) => (o >= 0 && o + 4 <= b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : -1);
const u32le = (b, o) => (o >= 0 && o + 4 <= b.length ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : -1);

/** True when `bytes` starts like a JPEG (FF D8 FF). */
export const isJpeg = (bytes) => isBytes(bytes) && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/** 'image/jpeg' | 'image/png' | 'image/webp' from the magic bytes, or null for anything else (SVG, HEIC, GIF…). */
export function sniffImage(bytes) {
  if (!isBytes(bytes)) return null;
  if (isJpeg(bytes)) return 'image/jpeg';
  if (u32be(bytes, 0) === 0x89504e47 && u32be(bytes, 4) === 0x0d0a1a0a) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Pixel size of a JPEG / PNG / WebP from its header. For JPEGs the EXIF orientation is read and w/h are swapped for
 * rotated (5–8) images, so they describe the photo as displayed. Returns { w, h, orientation } or null when the
 * format is unknown or the data ends before the size (see imageHeaderNeed to tell the two apart).
 */
export function imageInfo(bytes) {
  const r = parseHeader(bytes);
  return typeof r === 'number' ? null : r;
}

/**
 * How many bytes from the start imageInfo needs at least to find the size when `bytes` is a cut-off header of a
 * known format (more data may help), or 0 when it already found the size or more data cannot help (unknown or
 * broken file). Callers that read a file in steps use it to stop early on files that are not images.
 */
export function imageHeaderNeed(bytes) {
  const r = parseHeader(bytes);
  return typeof r === 'number' ? r : 0;
}

/** { w, h, orientation } when found, null when the data is not a usable header, or a byte count when it is cut off. */
function parseHeader(bytes) {
  if (!isBytes(bytes)) return null;
  const b = bytes;
  if (b.length < 4) return b.length === 0 || b[0] === 0x89 || b[0] === 0xff || b[0] === 0x52 ? 4 : null;
  if (u32be(b, 0) === 0x89504e47) {
    const w = u32be(b, 16), h = u32be(b, 20);
    return w < 0 || h < 0 ? 24 : { w, h, orientation: 1 };
  }
  if (ascii(b, 0, 4) === 'RIFF') {
    if (b.length < 16) return 16;
    if (ascii(b, 8, 12) !== 'WEBP') return null;
    const chunk = ascii(b, 12, 16);
    if (chunk === 'VP8X') {
      const w = u24le(b, 24), h = u24le(b, 27);
      return w < 0 || h < 0 ? 30 : { w: w + 1, h: h + 1, orientation: 1 };
    }
    if (chunk === 'VP8 ') {
      const w = u16le(b, 26), h = u16le(b, 28);
      return w < 0 || h < 0 ? 30 : { w: w & 0x3fff, h: h & 0x3fff, orientation: 1 };
    }
    if (chunk === 'VP8L') {
      const v = u32le(b, 21);
      return v < 0 ? 25 : { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1, orientation: 1 };
    }
    return null;
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let pos = 2;
  let orientation = 1;
  for (let guard = 0; guard < 500; guard++) {
    if (pos + 4 > b.length) return pos + 4;
    if (b[pos] !== 0xff) return null;
    const marker = b[pos + 1];
    if (marker === 0xff) { pos++; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
    if (marker === 0xda || marker === 0xd9) return null; // scan data before any SOF: give up
    const len = u16be(b, pos + 2);
    if (len < 2) return null;
    if (marker === 0xe1 && len > 16) {
      if (pos + 2 + len > b.length) return pos + 2 + len; // read the whole EXIF segment before trusting it
      orientation = exifOrientation(b.subarray(pos + 4, pos + 2 + len)) || orientation;
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = u16be(b, pos + 5), w = u16be(b, pos + 7);
      if (h < 0 || w < 0) return pos + 9;
      return orientation >= 5 && orientation <= 8 ? { w: h, h: w, orientation } : { w, h, orientation };
    }
    pos += 2 + len;
  }
  return null;
}

/** Orientation tag (0x0112) from an APP1 segment body ("Exif\0\0" + TIFF), or 0. */
export function exifOrientation(seg) {
  if (!isBytes(seg) || seg.length < 14 || ascii(seg, 0, 4) !== 'Exif') return 0;
  const t = 6;
  const order = ascii(seg, t, t + 2);
  if (order !== 'II' && order !== 'MM') return 0;
  const le = order === 'II';
  const u16 = (o) => (le ? u16le(seg, o) : u16be(seg, o));
  const u32 = (o) => (le ? u32le(seg, o) : u32be(seg, o));
  const off = u32(t + 4);
  if (off < 0) return 0;
  const ifd = t + off;
  const n = u16(ifd);
  if (n < 0) return 0;
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e);
    if (tag < 0) return 0; // truncated
    if (tag === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 0;
    }
  }
  return 0;
}

// ---------------------------------------------------------------- file names

/** POSIX basename (the part after the last "/", trailing slashes ignored), like node:path. */
export function baseName(name) {
  const s = String(name || '').replace(/\/+$/, '');
  return s.slice(s.lastIndexOf('/') + 1);
}

/** Extension of a base name with its dot ("" when none; ".x" and ".." have none), like node:path extname. */
export function extName(base) {
  const i = base.lastIndexOf('.');
  if (i <= 0 || base === '..') return '';
  return base.slice(i);
}

/** Safe gallery file name: no folders, no accents, lowercase [a-z0-9._-], `.jpeg` → `.jpg`, stem up to 80 chars. */
export function sanitizeFilename(name) {
  const base = baseName(name).normalize('NFD').replace(/\p{M}+/gu, '');
  const rawExt = extName(base);
  let ext = rawExt.toLowerCase();
  if (ext === '.jpeg') ext = '.jpg';
  const stem = base.slice(0, base.length - rawExt.length).toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').replace(/-{2,}/g, '-').slice(0, 80) || 'foto';
  return `${stem}${ext}`;
}

/** True for a plain gallery file name: no folder, not hidden, JPEG / PNG / WebP extension. */
export function isGalleryFile(name) {
  return typeof name === 'string' && name === baseName(name) && !name.startsWith('.') && ALLOWED_EXT.has(extName(name).toLowerCase());
}

/** Name an upload gets: sanitized, `.jpeg` → `.jpg`, extension added from the MIME type when missing. */
export function uploadName(original, mimetype = 'image/jpeg') {
  let name = sanitizeFilename(original);
  if (!ALLOWED_EXT.has(extName(name))) {
    name = name.replace(/\.[^.]*$/, '') || 'foto';
    name += mimetype === 'image/png' ? '.png' : mimetype === 'image/webp' ? '.webp' : '.jpg';
  }
  return name;
}
