// Image headers and photo file names, shared with Marco Cloud: magic-byte sniffing, pixel size and EXIF orientation
// read from the first bytes of a JPEG / PNG / WebP (no decoding), the gallery file name rules, and the widget image
// helpers (GIF too, frame sizes, metadata stripping). Works on a Uint8Array (a Node Buffer is one), checks every
// offset against the length and never throws on bad input.
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

// ---------------------------------------------------------------- widget images
// Image widgets (config.widgets): JPEG, PNG, WebP and GIF, never SVG. The gallery keeps its own rules above
// (sniffImage refuses GIF). Marco Cloud passes widget images to screens through stripImageMetadata.

/** 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' from the magic bytes, or null (SVG, HTML, anything else). */
export function sniffWidgetImage(bytes) {
  if (!isBytes(bytes) || bytes.length < 4) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (u32be(bytes, 0) === 0x89504e47 && u32be(bytes, 4) === 0x0d0a1a0a) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  const gif = ascii(bytes, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  return null;
}

/** True when the bytes look like an SVG document (text starting with <svg, or <?xml with an <svg in it). */
export function looksLikeSvg(bytes) {
  if (!isBytes(bytes)) return false;
  let head = '';
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) head += String.fromCharCode(bytes[i]);
  head = head.replace(/^(?:\uFEFF|\xEF\xBB\xBF)/, '').trimStart();
  return /^<svg[\s>/]/i.test(head) || (/^<\?xml/i.test(head) && /<svg[\s>/]/i.test(head));
}

/**
 * { w, h, frames, area } of a JPEG / PNG / WebP / GIF from its headers (no decoding), or null when unknown, cut off
 * before the size, or 0 pixels wide or high.
 * - `w`, `h`: the size a browser decodes it at. For a GIF that is the largest of the logical screen and every frame's
 *   own extent (browsers grow the canvas to a frame that sticks out, so a 1x1 header can hide an 8000x8000 frame);
 *   for an animated WebP the canvas and its frames likewise.
 * - `frames`: frame count (1 for a still image; APNG from acTL, GIF and WebP by walking the frames).
 * - `area`: pixels decoded over all frames (what an animation costs), at least w * h.
 */
export function widgetImageInfo(bytes) {
  const type = sniffWidgetImage(bytes);
  let r = null;
  if (type === 'image/png') r = pngInfo(bytes);
  else if (type === 'image/gif') r = gifInfo(bytes);
  else if (type === 'image/webp') r = webpInfo(bytes);
  else if (type === 'image/jpeg') r = jpegInfo(bytes);
  if (!r || !(r.w >= 1) || !(r.h >= 1)) return null;
  const frames = Math.max(1, r.frames ?? 1);
  return { w: r.w, h: r.h, frames, area: Math.max(r.area ?? 0, r.w * r.h) };
}

function pngInfo(b) {
  const w = u32be(b, 16), h = u32be(b, 20);
  if (w < 0 || h < 0) return null;
  // APNG: acTL (before the first IDAT) holds the frame count; every frame fits inside the IHDR size
  let frames = 1;
  for (let pos = 8, guard = 0; pos + 8 <= b.length && guard < 10000; guard++) {
    const len = u32be(b, pos);
    const t = ascii(b, pos + 4, pos + 8);
    if (len < 0 || t === 'IDAT' || t === 'IEND') break;
    if (t === 'acTL') {
      const n = u32be(b, pos + 8);
      if (n > 0) frames = n;
      break;
    }
    pos += 12 + len;
  }
  return { w, h, frames, area: w * h * frames };
}

/** Skips GIF data sub-blocks from `pos` (a size byte, that many bytes, ... a 0): the position after them, or -1. */
function gifSkipBlocks(b, pos) {
  while (pos < b.length) {
    const n = b[pos];
    pos += 1;
    if (n === 0) return pos;
    pos += n;
  }
  return -1;
}

function gifInfo(b) {
  if (b.length < 13) return null;
  let w = u16le(b, 6), h = u16le(b, 8);
  const flags = b[10];
  let pos = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  let frames = 0, area = 0;
  while (pos >= 0 && pos < b.length) {
    const t = b[pos];
    if (t === 0x3b) break; // trailer
    if (t === 0x21) {
      // extension: introducer, label, sub-blocks
      pos = gifSkipBlocks(b, pos + 2);
      continue;
    }
    if (t !== 0x2c || pos + 10 > b.length) break; // not an image descriptor: stop where it stops making sense
    const left = u16le(b, pos + 1), top = u16le(b, pos + 3), fw = u16le(b, pos + 5), fh = u16le(b, pos + 7);
    const lf = b[pos + 9];
    frames++;
    area += fw * fh;
    w = Math.max(w, left + fw);
    h = Math.max(h, top + fh);
    pos += 10 + (lf & 0x80 ? 3 * (1 << ((lf & 7) + 1)) : 0) + 1; // + local colour table + LZW code size
    pos = gifSkipBlocks(b, pos);
  }
  return { w, h, frames, area };
}

function webpInfo(b) {
  const chunk = ascii(b, 12, 16);
  if (chunk === 'VP8 ') {
    const w = u16le(b, 26), h = u16le(b, 28);
    return w < 0 || h < 0 ? null : { w: w & 0x3fff, h: h & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const v = u32le(b, 21);
    return v < 0 ? null : { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 };
  }
  if (chunk !== 'VP8X') return null;
  let w = u24le(b, 24), h = u24le(b, 27);
  if (w < 0 || h < 0) return null;
  w += 1;
  h += 1;
  if (!(b[20] & 0x02)) return { w, h };
  // animated: walk the chunks for ANMF frames (each one's offset and size)
  let frames = 0, area = 0;
  for (let pos = 12, guard = 0; pos + 8 <= b.length && guard < 100000; guard++) {
    const len = u32le(b, pos + 4);
    if (len < 0) break;
    if (ascii(b, pos, pos + 4) === 'ANMF') {
      const x = u24le(b, pos + 8), y = u24le(b, pos + 11), fw = u24le(b, pos + 14), fh = u24le(b, pos + 17);
      if (fh < 0) break;
      frames++;
      area += (fw + 1) * (fh + 1);
      w = Math.max(w, x * 2 + fw + 1);
      h = Math.max(h, y * 2 + fh + 1);
    }
    pos += 8 + len + (len & 1);
  }
  return { w, h, frames, area };
}

function jpegInfo(b) {
  let pos = 2;
  for (let guard = 0; guard < 1000; guard++) {
    if (pos + 4 > b.length || b[pos] !== 0xff) return null;
    const marker = b[pos + 1];
    if (marker === 0xff) { pos++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
    if (marker === 0xda || marker === 0xd9) return null;
    const len = u16be(b, pos + 2);
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = u16be(b, pos + 5), w = u16be(b, pos + 7);
      return h < 0 || w < 0 ? null : { w, h };
    }
    pos += 2 + len;
  }
  return null;
}

/** PNG chunks a widget image keeps (everything a browser needs to draw it, APNG included); text, EXIF, time and
 *  private chunks go. */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD', 'cICP', 'acTL', 'fcTL', 'fdAT']);
/** WebP chunks a widget image keeps (EXIF and XMP go). */
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
/** GIF application extensions a widget image keeps (looping); comments and the rest (XMP...) go. */
const GIF_APPS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

const concat = (parts) => {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/**
 * The image without its metadata (where it was taken, the camera, comments, editing history...), ready to pass to
 * a screen as is. Keeps only what draws the picture (an allowlist per format) and cuts anything after its end
 * marker (a JPEG's hidden second image or video, data after a PNG's IEND, past a WebP's RIFF size or a GIF's
 * trailer). JPEG keeps APP0, the ICC profile (APP2 ICC_PROFILE) and APP14 Adobe; PNG and WebP keep the chunks above,
 * GIF its frames and loop extension. Returns a new Uint8Array, or null when the bytes do not parse as `mime`.
 */
export function stripImageMetadata(bytes, mime) {
  if (!isBytes(bytes)) return null;
  try {
    if (mime === 'image/jpeg') return stripJpeg(bytes);
    if (mime === 'image/png') return stripPng(bytes);
    if (mime === 'image/webp') return stripWebp(bytes);
    if (mime === 'image/gif') return stripGif(bytes);
  } catch {
    return null;
  }
  return null;
}

function stripJpeg(b) {
  if (!isJpeg(b)) return null;
  const parts = [b.subarray(0, 2)];
  let pos = 2;
  for (let guard = 0; guard < 100000; guard++) {
    if (pos + 2 > b.length || b[pos] !== 0xff) return null;
    const marker = b[pos + 1];
    if (marker === 0xff) { pos++; continue; }
    if (marker === 0xd9) {
      parts.push(b.subarray(pos, pos + 2));
      return concat(parts);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    const len = u16be(b, pos + 2);
    if (len < 2 || pos + 2 + len > b.length) return null;
    const seg = b.subarray(pos, pos + 2 + len);
    let keep = true;
    if (marker === 0xfe) keep = false; // comment
    else if (marker >= 0xe1 && marker <= 0xef) {
      const id = ascii(b, pos + 4, Math.min(pos + 2 + len, pos + 16));
      keep = (marker === 0xe2 && id.startsWith('ICC_PROFILE\0')) || (marker === 0xee && id.startsWith('Adobe'));
    }
    if (keep) parts.push(seg);
    pos += 2 + len;
    if (marker === 0xda) {
      // entropy-coded data up to the next marker (FF 00 is a byte, FF D0..D7 restart markers, FF FF fill)
      const from = pos;
      while (pos + 1 < b.length) {
        if (b[pos] === 0xff) {
          const m = b[pos + 1];
          if (m !== 0x00 && !(m >= 0xd0 && m <= 0xd7) && m !== 0xff) break;
        }
        pos++;
      }
      if (pos + 1 >= b.length) return null;
      parts.push(b.subarray(from, pos));
    }
  }
  return null;
}

function stripPng(b) {
  if (u32be(b, 0) !== 0x89504e47) return null;
  const parts = [b.subarray(0, 8)];
  let pos = 8;
  for (let guard = 0; guard < 1000000; guard++) {
    const len = u32be(b, pos);
    if (len < 0 || pos + 12 + len > b.length) return null;
    const type = ascii(b, pos + 4, pos + 8);
    if (PNG_KEEP.has(type)) parts.push(b.subarray(pos, pos + 12 + len));
    pos += 12 + len;
    if (type === 'IEND') return concat(parts);
  }
  return null;
}

function stripWebp(b) {
  if (ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 12) !== 'WEBP') return null;
  const end = Math.min(b.length, u32le(b, 4) + 8);
  const parts = [];
  let pos = 12;
  while (pos + 8 <= end) {
    const len = u32le(b, pos + 4);
    const size = 8 + len + (len & 1);
    if (len < 0 || pos + 8 + len > end) return null;
    const type = ascii(b, pos, pos + 4);
    if (WEBP_KEEP.has(type)) {
      const chunk = new Uint8Array(b.subarray(pos, Math.min(pos + size, end)));
      if (type === 'VP8X') chunk[8] &= ~(0x08 | 0x04); // no EXIF, no XMP
      parts.push(chunk);
    }
    pos += size;
  }
  // a picture must be left: a frame (VP8, VP8L) or an animation (ANMF)
  if (!parts.some((p) => ['VP8 ', 'VP8L', 'ANMF'].includes(ascii(p, 0, 4)))) return null;
  const body = concat(parts);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  const riff = body.length + 4;
  head[4] = riff & 255;
  head[5] = (riff >>> 8) & 255;
  head[6] = (riff >>> 16) & 255;
  head[7] = (riff >>> 24) & 255;
  return concat([head, body]);
}

function stripGif(b) {
  const sig = ascii(b, 0, 6);
  if ((sig !== 'GIF87a' && sig !== 'GIF89a') || b.length < 13) return null;
  const flags = b[10];
  let pos = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  if (pos > b.length) return null;
  const parts = [b.subarray(0, pos)];
  for (let guard = 0; guard < 10000000 && pos < b.length; guard++) {
    const t = b[pos];
    if (t === 0x3b) {
      parts.push(b.subarray(pos, pos + 1));
      return concat(parts);
    }
    if (t === 0x21) {
      const label = b[pos + 1];
      const next = gifSkipBlocks(b, pos + 2);
      if (next < 0) return null;
      let keep = label === 0xf9 || label === 0x01; // graphic control, plain text
      if (label === 0xff) keep = b[pos + 2] === 11 && GIF_APPS.has(ascii(b, pos + 3, pos + 14));
      if (keep) parts.push(b.subarray(pos, next));
      pos = next;
      continue;
    }
    if (t !== 0x2c || pos + 10 > b.length) return null;
    const lf = b[pos + 9];
    const dataAt = pos + 10 + (lf & 0x80 ? 3 * (1 << ((lf & 7) + 1)) : 0) + 1;
    const next = gifSkipBlocks(b, dataAt);
    if (next < 0) return null;
    parts.push(b.subarray(pos, next));
    pos = next;
  }
  return null;
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
