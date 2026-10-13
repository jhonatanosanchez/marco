// Tiny image files built by hand for the profile photo tests (no encoder needed): the structure is real, the picture
// data is not meant to be looked at.
import zlib from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A real (decodable) RGB PNG, w x h, with optional text chunks (metadata the server must drop). */
export function makePng(w, h, { text = null, extra = [] } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3;
    raw[o] = (x * 4) & 255; raw[o + 1] = (y * 4) & 255; raw[o + 2] = 160;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    ...(text ? [pngChunk('tEXt', Buffer.from(`Comment\0${text}`, 'latin1'))] : []),
    ...extra.map(([t, d]) => pngChunk(t, d)),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const seg = (marker, data) => {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(data.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, data]);
};

/** A JPEG-shaped file w x h: JFIF, an EXIF block with a GPS-looking string, a comment, tables, SOF0, a scan. */
export function makeJpeg(w, h, { exif = 'GPS 40.4168 -3.7038' } = {}) {
  const sof = Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    ...(exif ? [seg(0xe1, Buffer.from(`Exif\0\0${exif}`, 'latin1'))] : []),
    seg(0xfe, Buffer.from('a comment', 'latin1')),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xc0, sof),
    seg(0xc4, Buffer.alloc(20, 0)),
    seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

const riffChunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from(type, 'ascii'), len, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};

/** An extended WebP (VP8X) w x h with an EXIF chunk, or animated. */
export function makeWebp(w, h, { exif = 'GPS 1 2', animated = false } = {}) {
  const x = Buffer.alloc(10);
  x[0] = (exif ? 0x08 : 0) | (animated ? 0x02 : 0);
  x.writeUIntLE(w - 1, 4, 3);
  x.writeUIntLE(h - 1, 7, 3);
  // VP8L: signature 0x2f, then 14 bits w-1, 14 bits h-1
  const l = Buffer.alloc(10);
  l[0] = 0x2f;
  l.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 1);
  const body = Buffer.concat([
    riffChunk('VP8X', x),
    ...(animated ? [riffChunk('ANIM', Buffer.alloc(6)), riffChunk('ANMF', Buffer.concat([Buffer.alloc(16), riffChunk('VP8L', l)]))] : [riffChunk('VP8L', l)]),
    ...(exif ? [riffChunk('EXIF', Buffer.from(exif, 'latin1'))] : []),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length + 4);
  return Buffer.concat([Buffer.from('RIFF'), size, Buffer.from('WEBP'), body]);
}
