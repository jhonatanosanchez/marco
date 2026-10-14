// A small fake Immich server for the tests (node:http or node:https on port 0). It answers the parts of the API
// Marco uses, in the shapes of three release lines:
//   1.120  /server/version, /api-keys/me, album assets through GET /albums/:id?withoutAssets=false
//   2.5    the same plus POST /search/metadata { albumIds } with pages
//   3.3    /search/metadata only (albums no longer carry their assets)
// `legacy: true` answers only the pre-1.118 /server-info/* routes and has no /api-keys/me.
import http from 'node:http';
import https from 'node:https';

export const uuid = (prefix, n) => `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export const assetId = (n) => uuid('aaaaaaaa', n);
export const albumId = (n) => uuid('bbbbbbbb', n);

/** A tiny JPEG (only the magic bytes matter to Marco). */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0fake-image-bytes')]);

/** Asset in the shape Immich answers; `over` replaces fields. */
export function asset(n, over = {}) {
  const day = String((n % 28) + 1).padStart(2, '0');
  return {
    id: assetId(n),
    type: 'IMAGE',
    originalFileName: `IMG_${String(n).padStart(4, '0')}.jpg`,
    localDateTime: `2019-08-${day}T12:00:00.000Z`,
    fileCreatedAt: `2019-08-${day}T10:00:00.000Z`,
    updatedAt: '2024-01-01T00:00:00.000Z',
    isFavorite: n % 2 === 0,
    isTrashed: false,
    isOffline: false,
    visibility: 'timeline',
    exifInfo: { city: 'Valencia', country: 'Spain' },
    ...over,
  };
}

/**
 * Start a fake server. opts: version ('1.120.0' | '2.5.0' | '3.3.0'), legacy, key, permissions,
 * albums: [{ id, albumName, assets: [...] }], tls: { key, cert }, thumb: (req, res, id) => boolean (custom answer),
 * thumbDelayMs. Returns { url, hits, stop, state } (`state` can be changed while it runs).
 */
export async function fakeImmich(opts = {}) {
  const state = {
    version: opts.version || '3.3.0',
    legacy: opts.legacy === true,
    key: opts.key || 'test-key-0123456789',
    permissions: opts.permissions || ['all'],
    albums: opts.albums || [],
    thumb: opts.thumb || null,
    thumbDelayMs: opts.thumbDelayMs || 0,
    down: false,
  };
  const hits = [];
  let active = 0;
  const stats = { maxActive: 0, thumbs: 0 };
  const [major, minor, patch] = state.version.split('.').map(Number);
  const atLeast = (a, b) => major > a || (major === a && minor >= b);
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const handler = async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    hits.push({ method: req.method, path: p, key: req.headers['x-api-key'] || '' });
    if (state.down) return req.socket.destroy();
    let body = '';
    for await (const c of req) body += c;
    if (p === '/api/server/version' && !state.legacy) return json(res, 200, { major, minor, patch });
    if (p === '/api/server-info/version' && state.legacy) return json(res, 200, { major, minor, patch });
    if (req.headers['x-api-key'] !== state.key) return json(res, 401, { message: 'Invalid API key', statusCode: 401 });
    const can = (perm) => state.permissions.includes('all') || state.permissions.includes(perm);
    const deny = (perm) => json(res, 403, { message: `Missing required permission: ${perm}`, statusCode: 403 });
    if (p === '/api/api-keys/me' && !state.legacy) return json(res, 200, { id: 'k1', name: 'marco', permissions: state.permissions });
    if (p === '/api/albums' && req.method === 'GET') {
      if (!can('album.read')) return deny('album.read');
      return json(res, 200, state.albums.map((a) => ({
        id: a.id, albumName: a.albumName, assetCount: a.assets.length, albumThumbnailAssetId: a.assets[0]?.id ?? null,
        shared: false, startDate: '2019-08-01T00:00:00.000Z', endDate: '2019-08-28T00:00:00.000Z',
      })));
    }
    let m = /^\/api\/albums\/([^/]+)$/.exec(p);
    if (m && req.method === 'GET') {
      if (!can('album.read')) return deny('album.read');
      const a = state.albums.find((x) => x.id === m[1]);
      if (!a) return json(res, 400, { message: 'Not found or no album.read access' }); // what Immich answers
      const out = { id: a.id, albumName: a.albumName, assetCount: a.assets.length };
      if (!atLeast(3, 0) && u.searchParams.get('withoutAssets') === 'false') out.assets = a.assets;
      return json(res, 200, out);
    }
    if (p === '/api/search/metadata' && req.method === 'POST' && atLeast(1, 135)) {
      if (!can('asset.read')) return deny('asset.read');
      const q = JSON.parse(body || '{}');
      const ids = q.albumIds || [];
      const albums = state.albums.filter((a) => ids.includes(a.id));
      if (albums.length !== ids.length) return json(res, 400, { message: 'Not found or no album.read access' });
      let items = albums.flatMap((a) => a.assets);
      if (q.type) items = items.filter((a) => a.type === q.type);
      if (q.isFavorite !== undefined) items = items.filter((a) => a.isFavorite === q.isFavorite);
      // "A esta edad" (fork fsrhome): rango de fechas por localDateTime y personas solo si se piden
      if (q.takenAfter) items = items.filter((a) => (a.localDateTime || '') >= q.takenAfter);
      if (q.takenBefore) items = items.filter((a) => (a.localDateTime || '') < q.takenBefore);
      if (!q.withPeople) items = items.map(({ people, ...rest }) => rest);
      const size = q.size || 250, page = q.page || 1;
      const slice = items.slice((page - 1) * size, page * size);
      const more = page * size < items.length;
      return json(res, 200, { albums: { items: [], total: 0, count: 0, nextPage: null }, assets: { items: slice, total: slice.length, count: slice.length, nextPage: more ? String(page + 1) : null } });
    }
    m = /^\/api\/assets\/([^/]+)\/thumbnail$/.exec(p);
    if (m) {
      if (!can('asset.view')) return deny('asset.view');
      stats.thumbs++;
      active++;
      stats.maxActive = Math.max(stats.maxActive, active);
      try {
        if (state.thumbDelayMs) await new Promise((r) => setTimeout(r, state.thumbDelayMs));
        if (state.thumb && state.thumb(req, res, m[1], u.searchParams.get('size'))) return;
        res.writeHead(200, { 'content-type': 'image/jpeg' });
        res.end(JPEG);
      } finally {
        active--;
      }
      return;
    }
    json(res, 404, { message: 'Not found' });
  };
  const server = opts.tls ? https.createServer(opts.tls, handler) : http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `${opts.tls ? 'https' : 'http'}://127.0.0.1:${server.address().port}`;
  return {
    url,
    hits,
    stats,
    state,
    count: (re) => hits.filter((h) => re.test(h.path)).length,
    stop: async () => {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    },
  };
}
