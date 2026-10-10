// Gallery: metadata (.meta.json), header sizes + EXIF orientation, conflict policies, name check, focal point,
// thumbnails, upload size limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import * as store from '../store.js';
import { defaultConfig } from '../core/defaults.js';
import { sessionMiddleware, csrfGuard, ensurePassword, loginHandler, hashPassword } from '../auth.js';
import { adminRouter } from '../routes/admin.js';
import { publicRouter } from '../routes/public.js';
import {
  imageInfo, readMeta, writeMeta, updateMeta, listGallery, uploadName, sanitizeFilename, freeName, checkNames, MAX_UPLOAD_BYTES,
} from '../photos.js';

/** Minimal JPEG header: SOI, optional APP1/Exif with an orientation tag, SOF0 with the size, EOI. */
function fakeJpeg(w, h, orientation = 0, pad = 0) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    const tiff = Buffer.alloc(8 + 2 + 12 + 4);
    tiff.write('MM', 0, 'latin1');
    tiff.writeUInt16BE(42, 2);
    tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8);
    tiff.writeUInt16BE(0x0112, 10);
    tiff.writeUInt16BE(3, 12);
    tiff.writeUInt32BE(1, 14);
    tiff.writeUInt16BE(orientation, 18);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const hdr = Buffer.from([0xff, 0xe1, 0, 0]);
    hdr.writeUInt16BE(body.length + 2, 2);
    parts.push(hdr, body);
  }
  for (let left = pad; left > 0; left -= 60000) { // big comment segments (EXIF thumbnails push SOF far into the file)
    const n = Math.min(60000, left);
    const com = Buffer.alloc(n + 4);
    com[0] = 0xff; com[1] = 0xfe; com.writeUInt16BE(n + 2, 2);
    parts.push(com);
  }
  const sof = Buffer.from([0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}
const fakeThumb = () => fakeJpeg(480, 320);

async function withApp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-photos-'));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.news.feeds = [];
  c.screens[0].background.source = 'gallery';
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ passwordHash: await hashPassword('secret123'), passwordIsDefault: false }));
  store.initStore(dir);
  await ensurePassword();
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(sessionMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(['/api/admin', '/api/auth'], csrfGuard({ multipartPaths: ['/photos', /^\/photos\/[^/]+\/thumb$/] }));
  app.post('/api/auth/login', (req, res, next) => loginHandler(req, res).catch(next));
  app.use('/api/admin', adminRouter());
  app.use('/api', publicRouter({ version: 'test' }));
  app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : err.name === 'MulterError' ? 400 : 500);
    res.status(status).json({ error: err.message });
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const raw = async (method, url, { json, form } = {}) => {
    const r = await fetch(base + url, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(json !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: json !== undefined ? JSON.stringify(json) : form,
    });
    const set = r.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map((x) => x.split(';')[0]).join('; ');
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, body };
  };
  const call = (method, url, json) => raw(method, url, { json });
  const upload = (files, { policy, meta, thumbs } = {}) => {
    const fd = new FormData();
    if (meta) fd.append('meta', JSON.stringify(meta));
    files.forEach(([name, buf, type = 'image/jpeg'], i) => {
      fd.append('photos[]', new Blob([buf], { type }), name);
      if (thumbs?.[i]) fd.append('thumbs[]', new Blob([thumbs[i]], { type: 'image/jpeg' }), 'thumb.jpg');
    });
    return raw('POST', `/api/admin/photos${policy ? `?onConflict=${policy}` : ''}`, { form: fd });
  };
  try {
    assert.equal((await call('POST', '/api/auth/login', { password: 'secret123' })).status, 200);
    await fn({ call, raw, upload, dir, base, photos: path.join(dir, 'photos') });
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('imageInfo: JPEG size from SOF, EXIF orientation 6 swaps w/h, PNG and WebP headers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-imginfo-'));
  try {
    const w = (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p; };
    assert.deepEqual(imageInfo(w('a.jpg', fakeJpeg(6000, 4000))), { w: 6000, h: 4000, orientation: 1 });
    assert.deepEqual(imageInfo(w('b.jpg', fakeJpeg(6000, 4000, 6, 70000))), { w: 4000, h: 6000, orientation: 6 });
    assert.deepEqual(imageInfo(w('c.jpg', fakeJpeg(6000, 4000, 3))), { w: 6000, h: 4000, orientation: 3 });
    const png = Buffer.alloc(33);
    png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(0x0d0a1a0a, 4); png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'latin1');
    png.writeUInt32BE(1920, 16); png.writeUInt32BE(1080, 20);
    assert.deepEqual(imageInfo(w('d.png', png)), { w: 1920, h: 1080, orientation: 1 });
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'latin1'); webp.write('WEBP', 8, 'latin1'); webp.write('VP8X', 12, 'latin1');
    webp.writeUIntLE(799, 24, 3); webp.writeUIntLE(599, 27, 3);
    assert.deepEqual(imageInfo(w('e.webp', webp)), { w: 800, h: 600, orientation: 1 });
    assert.equal(imageInfo(w('f.jpg', Buffer.from('not an image at all, sorry'))), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sanitization: upload names, .jpeg → .jpg, missing extension, free names', () => {
  assert.equal(sanitizeFilename('Vacaciones Playa.JPEG'), 'vacaciones-playa.jpg');
  assert.equal(uploadName('Fotó del Perro.jpg'), 'foto-del-perro.jpg');
  assert.equal(uploadName('IMG_0001.HEIC'), 'img_0001.jpg');
  assert.equal(uploadName('captura', 'image/png'), 'captura.png');
  assert.equal(uploadName('../../etc/passwd.jpg'), 'passwd.jpg');
  // busboy hands multipart names over as latin1
  assert.equal(uploadName(Buffer.from('Niño.jpg', 'utf8').toString('latin1'), 'image/jpeg', { multipart: true }), 'nino.jpg');
});

test('meta: atomic read/write, missing file → {}, pruned and filled in by the listing', async () => {
  await withApp(async ({ photos }) => {
    assert.deepEqual(readMeta(), {});
    writeMeta({ 'x.jpg': { w: 1, h: 1, bytes: 1 } });
    assert.deepEqual(readMeta(), { 'x.jpg': { w: 1, h: 1, bytes: 1 } });
    assert.ok(!fs.readdirSync(photos).some((f) => f.endsWith('.tmp')), 'no temp files left behind');
    updateMeta((m) => void (m['y.jpg'] = { w: 2, h: 2, bytes: 2 }));
    assert.deepEqual(Object.keys(readMeta()).sort(), ['x.jpg', 'y.jpg']);
    fs.writeFileSync(path.join(photos, '.meta.json'), '{broken');
    assert.deepEqual(readMeta(), {});
    // a photo copied in by hand gets its size read from the header; entries without a file are pruned
    fs.writeFileSync(path.join(photos, 'manual.jpg'), fakeJpeg(3000, 2000, 6));
    writeMeta({ 'gone.jpg': { w: 1, h: 1, bytes: 1 } });
    const list = listGallery();
    assert.equal(list.length, 1);
    assert.equal(list[0].w, 2000);
    assert.equal(list[0].h, 3000);
    assert.equal(list[0].focusX, undefined);
    assert.equal(list[0].hasThumb, false);
    assert.equal(list[0].thumbUrl, list[0].url, 'falls back to the photo until a thumbnail exists');
    assert.match(list[0].url, /^\/media\/photos\/manual\.jpg\?v=\w+$/);
    assert.deepEqual(Object.keys(readMeta()), ['manual.jpg']);
    assert.ok(!listGallery().some((p) => p.file.startsWith('.')), '.meta.json / .thumbs are never listed');
  });
});

test('upload: meta + thumbnail stored, default policy renames, replace / skip, check endpoint', async () => {
  await withApp(async ({ call, upload, photos }) => {
    let r = await upload([['Perro Feliz.jpg', fakeJpeg(2560, 1707)]], { meta: [{ focusX: 0.3, focusY: 0.25 }], thumbs: [fakeThumb()] });
    assert.equal(r.status, 200);
    assert.equal(r.body.files[0].file, 'perro-feliz.jpg');
    assert.equal(r.body.files[0].status, 'created');
    let meta = readMeta()['perro-feliz.jpg'];
    assert.equal(meta.w, 2560);
    assert.equal(meta.h, 1707);
    assert.equal(meta.focusX, 0.3);
    assert.equal(meta.focusY, 0.25);
    assert.ok(meta.bytes > 0 && meta.uploadedAt);
    assert.ok(fs.existsSync(path.join(photos, '.thumbs', 'perro-feliz.jpg')));
    assert.ok(!fs.readdirSync(photos).some((f) => f.startsWith('.upload-')), 'temp upload renamed into place');

    const list = (await call('GET', '/api/admin/photos')).body;
    assert.equal(list[0].focusX, 0.3);
    assert.match(list[0].thumbUrl, /^\/media\/thumbs\/perro-feliz\.jpg\?v=/);
    const pub = (await call('GET', '/api/photos?count=5')).body.photos;
    assert.equal(pub[0].source, 'gallery');
    assert.equal(pub[0].focusX, 0.3);
    assert.equal(pub[0].focusY, 0.25);

    // check: server-side sanitization and existence
    r = await call('POST', '/api/admin/photos/check', { names: ['Perro Feliz.jpg', 'otra.jpg', 'perro-feliz.JPEG'] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.results.map((x) => [x.sanitized, x.exists, x.renamed]), [
      ['perro-feliz.jpg', true, 'perro-feliz-2.jpg'], ['otra.jpg', false, undefined], ['perro-feliz.jpg', true, 'perro-feliz-2.jpg'],
    ]);
    assert.equal((await call('POST', '/api/admin/photos/check', { names: 'x' })).status, 400);
    assert.equal((await call('POST', '/api/admin/photos/check', { names: [''] })).status, 400);
    assert.equal((await call('POST', '/api/admin/photos/check', { names: Array(501).fill('a.jpg') })).status, 400);

    // default = rename (never overwrite silently)
    r = await upload([['perro feliz.jpg', fakeJpeg(800, 600)]]);
    assert.equal(r.body.files[0].file, 'perro-feliz-2.jpg');
    assert.equal(r.body.files[0].status, 'renamed');
    assert.equal(readMeta()['perro-feliz.jpg'].w, 2560, 'original untouched');

    // skip
    r = await upload([['perro-feliz.jpg', fakeJpeg(10, 10)]], { policy: 'skip', thumbs: [fakeThumb()] });
    assert.deepEqual(r.body.files, []);
    assert.deepEqual(r.body.skipped, ['perro-feliz.jpg']);
    assert.equal(readMeta()['perro-feliz.jpg'].w, 2560);
    assert.ok(!fs.readdirSync(photos).some((f) => f.startsWith('.upload-')), 'skipped files leave no temp files');

    // replace: content, metadata (old focus dropped unless sent) and URL version change; stale thumb removed
    const before = (await call('GET', '/api/admin/photos')).body.find((p) => p.file === 'perro-feliz.jpg');
    await new Promise((res) => setTimeout(res, 15));
    r = await upload([['perro-feliz.jpg', fakeJpeg(1200, 1800)]], { policy: 'replace' });
    assert.equal(r.body.files[0].status, 'replaced');
    assert.equal(r.body.files[0].file, 'perro-feliz.jpg');
    meta = readMeta()['perro-feliz.jpg'];
    assert.equal(meta.w, 1200);
    assert.equal(meta.focusX, undefined);
    assert.ok(!fs.existsSync(path.join(photos, '.thumbs', 'perro-feliz.jpg')), 'stale thumbnail dropped');
    assert.notEqual(r.body.files[0].url, before.url, 'cache-busting version changes');

    assert.equal((await upload([['a.jpg', fakeJpeg(10, 10)]], { policy: 'overwrite' })).status, 400);
    // wrong type
    assert.equal((await upload([['a.gif', Buffer.from('GIF89a'), 'image/gif']])).status, 415);
  });
});

test('PATCH focal point: validation, 404, persisted; thumbnail endpoint; delete removes meta + thumb', async () => {
  await withApp(async ({ call, raw, upload, photos }) => {
    await upload([['casa.jpg', fakeJpeg(2000, 1000)]]);
    for (const bad of [{}, { focusX: 0.5 }, { focusX: -0.1, focusY: 0.5 }, { focusX: 0.5, focusY: 1.5 }, { focusX: '0.5', focusY: 0.5 }, { focusX: null, focusY: 0.2 }]) {
      assert.equal((await call('PATCH', '/api/admin/photos/casa.jpg', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await call('PATCH', '/api/admin/photos/nope.jpg', { focusX: 0.5, focusY: 0.5 })).status, 404);
    assert.equal((await call('PATCH', '/api/admin/photos/.meta.json', { focusX: 0.5, focusY: 0.5 })).status, 404);
    const r = await call('PATCH', '/api/admin/photos/casa.jpg', { focusX: 0.123456, focusY: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.body.focusX, 0.1235);
    assert.equal(r.body.focusY, 1);
    assert.equal(readMeta()['casa.jpg'].focusX, 0.1235);
    assert.equal(readMeta()['casa.jpg'].w, 2000);

    // thumbnail for an existing photo
    const fd = new FormData();
    fd.append('thumb', new Blob([fakeThumb()], { type: 'image/jpeg' }), 't.jpg');
    let t = await raw('PUT', '/api/admin/photos/casa.jpg/thumb', { form: fd });
    assert.equal(t.status, 200);
    assert.equal(t.body.hasThumb, true);
    const bad = new FormData();
    bad.append('thumb', new Blob([Buffer.from('nope')], { type: 'image/jpeg' }), 't.jpg');
    assert.equal((await raw('PUT', '/api/admin/photos/casa.jpg/thumb', { form: bad })).status, 400);
    const fd2 = new FormData();
    fd2.append('thumb', new Blob([fakeThumb()], { type: 'image/jpeg' }), 't.jpg');
    assert.equal((await raw('PUT', '/api/admin/photos/zzz.jpg/thumb', { form: fd2 })).status, 404);

    assert.equal((await call('DELETE', '/api/admin/photos/casa.jpg')).status, 200);
    assert.deepEqual(readMeta(), {});
    assert.ok(!fs.existsSync(path.join(photos, '.thumbs', 'casa.jpg')));
  });
});

test('auth + CSRF: photo endpoints need a session and a same-origin JSON body', async () => {
  assert.equal(MAX_UPLOAD_BYTES, 100 * 1024 * 1024);
  await withApp(async ({ raw, upload, base }) => {
    await upload([['casa.jpg', fakeJpeg(200, 100)]]);
    // logged in, but not JSON → refused by the CSRF guard
    assert.equal((await raw('PATCH', '/api/admin/photos/casa.jpg', { form: new URLSearchParams({ focusX: '0.5', focusY: '0.5' }) })).status, 415);
    // no session
    const anon = (method, url, body) => fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    assert.equal((await anon('PATCH', '/api/admin/photos/casa.jpg', { focusX: 0.5, focusY: 0.5 })).status, 401);
    assert.equal((await anon('POST', '/api/admin/photos/check', { names: ['a.jpg'] })).status, 401);
    assert.equal((await anon('GET', '/api/admin/photos')).status, 401);
  });
});

test('upload limit: an oversized file is rejected with 413 and leaves no temp file behind', async () => {
  const { uploadMiddleware } = await import('../photos.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-limit-'));
  store.initStore(dir);
  const app = express();
  app.post('/up', (req, res, next) => { req.conflictPolicy = 'rename'; next(); }, uploadMiddleware({ maxBytes: 1000 }), (req, res) => res.json({ n: req.files.length }));
  app.use((err, req, res, next) => res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500).json({ error: err.message }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const post = (buf) => {
      const fd = new FormData();
      fd.append('photos[]', new Blob([buf], { type: 'image/jpeg' }), 'x.jpg');
      return fetch(`http://127.0.0.1:${server.address().port}/up`, { method: 'POST', body: fd });
    };
    assert.equal((await post(fakeJpeg(10, 10))).status, 200);
    assert.equal((await post(fakeJpeg(10, 10, 0, 5000))).status, 413);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(fs.readdirSync(path.join(dir, 'photos')).filter((f) => f.startsWith('.upload-')).length, 1, 'only the accepted (unfinalized) one');
  } finally {
    await new Promise((res) => server.close(res));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rotation: hidden flag (PATCH + bulk), validation, excluded from /api/photos, all-hidden → stock', async () => {
  const { _setPicsumList, resetPhotoHistory } = await import('../photos.js');
  _setPicsumList([10, 11, 12, 13, 14, 15].map((id) => ({ id, author: 'A', width: 1600, height: 900 })));
  resetPhotoHistory();
  await withApp(async ({ call, upload, base }) => {
    await upload(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'].map((n) => [n, fakeJpeg(800, 600)]));
    let list = (await call('GET', '/api/admin/photos')).body;
    assert.ok(list.every((p) => p.hidden === false), 'included by default');

    // PATCH { hidden } (alone or with a focal point), validation
    for (const bad of [{ hidden: 'yes' }, { hidden: 1 }, { hidden: null }, { hidden: true, focusX: 0.5 }]) {
      assert.equal((await call('PATCH', '/api/admin/photos/a.jpg', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await call('PATCH', '/api/admin/photos/zz.jpg', { hidden: true })).status, 404);
    let r = await call('PATCH', '/api/admin/photos/a.jpg', { hidden: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.hidden, true);
    assert.equal(readMeta()['a.jpg'].hidden, true);
    // a focal-point edit keeps the flag
    r = await call('PATCH', '/api/admin/photos/a.jpg', { focusX: 0.2, focusY: 0.3 });
    assert.equal(r.body.hidden, true);
    assert.equal(r.body.focusX, 0.2);

    // bulk endpoint validation
    for (const bad of [{}, { files: [], hidden: true }, { files: 'a.jpg', hidden: true }, { files: ['a.jpg'] }, { files: ['a.jpg'], hidden: 'x' },
      { files: ['../x.jpg'], hidden: true }, { files: ['.meta.json'], hidden: true }, { files: [3], hidden: true }, { files: Array(2001).fill('a.jpg'), hidden: true }]) {
      assert.equal((await call('POST', '/api/admin/photos/visibility', bad)).status, 400, JSON.stringify(bad).slice(0, 80));
    }
    const anon = await fetch(base + '/api/admin/photos/visibility', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: ['a.jpg'], hidden: true }) });
    assert.equal(anon.status, 401);
    r = await call('POST', '/api/admin/photos/visibility', { files: ['b.jpg', 'c.jpg', 'nope.jpg'], hidden: true });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.updated, ['b.jpg', 'c.jpg']);
    assert.deepEqual(r.body.missing, ['nope.jpg']);
    assert.equal(r.body.inRotation, 1);
    assert.equal(r.body.total, 4);

    for (let k = 0; k < 3; k++) {
      const pub = (await call('GET', '/api/photos?count=10')).body.photos;
      assert.deepEqual(pub.map((p) => p.file), ['d.jpg'], 'only the photo in rotation');
    }

    // a replaced (re-uploaded) photo stays hidden
    await upload([['b.jpg', fakeJpeg(900, 600)]], { policy: 'replace' });
    assert.equal(readMeta()['b.jpg'].hidden, true);

    // everything hidden → behaves like an empty gallery: stock
    r = await call('POST', '/api/admin/photos/visibility', { files: ['d.jpg'], hidden: true });
    assert.equal(r.body.inRotation, 0);
    let pub = (await call('GET', '/api/photos?count=4')).body.photos;
    assert.equal(pub.length, 4);
    assert.ok(pub.every((p) => p.source === 'stock'));

    // show again
    r = await call('POST', '/api/admin/photos/visibility', { files: ['a.jpg', 'd.jpg'], hidden: false });
    assert.equal(r.body.inRotation, 2);
    assert.equal(readMeta()['a.jpg'].hidden, undefined);
    assert.equal(readMeta()['a.jpg'].focusX, 0.2, 'focal point kept');
    pub = (await call('GET', '/api/photos?count=10')).body.photos;
    assert.deepEqual(pub.map((p) => p.file).sort(), ['a.jpg', 'd.jpg']);
  });
  _setPicsumList(null);
});

test('rotation order: name / newest continue across batches and wrap; random avoids the previous batch', async () => {
  const { getPhotos, resetPhotoHistory, _setPicsumList } = await import('../photos.js');
  _setPicsumList([{ id: 10, author: 'A', width: 1600, height: 900 }, { id: 11, author: 'B', width: 1600, height: 900 }, { id: 12, author: 'C', width: 1600, height: 900 }]);
  resetPhotoHistory();
  await withApp(async ({ call, upload }) => {
    const names = ['foto-10.jpg', 'foto-2.jpg', 'foto-1.jpg', 'casa.jpg', 'zeta.jpg', 'arbol.jpg', 'mar.jpg'];
    for (const n of names) await upload([[n, fakeJpeg(800, 600)]]); // uploaded in this order (uploadedAt increases)
    const meta = readMeta();
    names.forEach((n, i) => (meta[n].uploadedAt = new Date(Date.UTC(2026, 0, 1 + i)).toISOString()));
    writeMeta(meta);
    const byName = ['arbol.jpg', 'casa.jpg', 'foto-1.jpg', 'foto-2.jpg', 'foto-10.jpg', 'mar.jpg', 'zeta.jpg'];
    const bg = (order, source = 'gallery') => ({ source, order });
    const files = (l) => l.filter((p) => p.source === 'gallery').map((p) => p.file);

    // name: natural sort, continues where the last batch ended (server memory per screen), wraps around
    assert.deepEqual(files(await getPhotos(3, bg('name'), { key: 's1' })), byName.slice(0, 3));
    assert.deepEqual(files(await getPhotos(3, bg('name'), { key: 's1' })), byName.slice(3, 6));
    assert.deepEqual(files(await getPhotos(3, bg('name'), { key: 's1' })), [byName[6], byName[0], byName[1]]);
    // another screen has its own cursor
    assert.deepEqual(files(await getPhotos(2, bg('name'), { key: 's2' })), byName.slice(0, 2));
    // `after` (what the display showed last) wins over the memory
    assert.deepEqual(files(await getPhotos(2, bg('name'), { key: 's1', after: 'foto-2.jpg' })), ['foto-10.jpg', 'mar.jpg']);
    // a batch larger than the gallery returns each photo once
    assert.deepEqual(files(await getPhotos(20, bg('name'), { key: 's3', after: 'mar.jpg' })), ['zeta.jpg', ...byName.slice(0, 6)]);
    // the reference photo was hidden meanwhile: continue after its position, skipping it
    await call('PATCH', '/api/admin/photos/casa.jpg', { hidden: true });
    assert.deepEqual(files(await getPhotos(3, bg('name'), { key: 's4', after: 'casa.jpg' })), ['foto-1.jpg', 'foto-2.jpg', 'foto-10.jpg']);
    assert.deepEqual(files(await getPhotos(3, bg('name'), { key: 's4', after: 'arbol.jpg' })), ['foto-1.jpg', 'foto-2.jpg', 'foto-10.jpg'], 'hidden skipped');
    await call('PATCH', '/api/admin/photos/casa.jpg', { hidden: false });

    // newest: by upload date, newest first, sequential with wraparound
    const newest = [...names].reverse();
    assert.deepEqual(files(await getPhotos(4, bg('newest'), { key: 'n1' })), newest.slice(0, 4));
    assert.deepEqual(files(await getPhotos(4, bg('newest'), { key: 'n1' })), [...newest.slice(4), newest[0]]);
    assert.deepEqual(files(await getPhotos(4, bg('newest'), { key: 'n1' })), newest.slice(1, 5));

    // mixed: gallery half in order, interleaved with stock
    const mixed = await getPhotos(6, bg('name', 'mixed'), { key: 'm1' });
    assert.deepEqual(mixed.map((p) => p.source), ['gallery', 'stock', 'gallery', 'stock', 'gallery', 'stock']);
    assert.deepEqual(files(mixed), byName.slice(0, 3));
    assert.deepEqual(files(await getPhotos(6, bg('name', 'mixed'), { key: 'm1' })), byName.slice(3, 6));

    // random: the next batch starts with photos not in the previous one; never repeats the last shown first
    for (let k = 0; k < 20; k++) {
      const a = files(await getPhotos(3, bg('random'), { key: 'r1' }));
      const b = files(await getPhotos(3, bg('random'), { key: 'r1' }));
      assert.equal(new Set(a).size, 3);
      assert.ok(b.every((f) => !a.includes(f)), `${a} / ${b}`);
      const all1 = files(await getPhotos(20, bg('random'), { key: 'r2' }));
      const all2 = files(await getPhotos(20, bg('random'), { key: 'r2' }));
      assert.equal(all1.length, 7);
      assert.notEqual(all2[0], all1[6], 'no immediate repeat across the batch boundary');
      const c = files(await getPhotos(5, bg('random'), { key: 'r3', after: 'mar.jpg' }));
      assert.notEqual(c[0], 'mar.jpg');
    }
    // over HTTP: ?after= is honoured, ?screen= picks the screen's order
    const c = store.getConfig();
    c.screens[0].background.order = 'name';
    assert.ok(store.saveConfig(c).ok);
    const pub = (await call('GET', '/api/photos?count=2&after=foto-10.jpg')).body.photos;
    assert.deepEqual(pub.map((p) => p.file), ['mar.jpg', 'zeta.jpg']);
    assert.deepEqual((await call('GET', '/api/photos?count=2&after=..%2Fx')).body.photos.map((p) => p.file).length, 2);
  });
  _setPicsumList(null);
});
