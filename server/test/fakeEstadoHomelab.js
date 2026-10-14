// estado-homelab falso (y Frigate falso) para las pruebas de la tarjeta Homelab (fork fsrhome): node:http en el puerto 0.
//   GET /api/widget     → state.widget (500 con state.down)
//   POST /api/silencios → state.silenceStatus (200 por defecto); guarda el cuerpo y su content-type en `bodies`
//   GET /api/events     → state.events (Frigate); guarda la consulta en `queries`
import http from 'node:http';

export async function fakeEstadoHomelab(data = {}) {
  const state = { down: false, widget: null, silenceStatus: 200, events: [], ...data };
  const hits = [];
  const bodies = [];
  const queries = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(`${req.method} ${u.pathname}`);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (state.down) { res.writeHead(500); return res.end(); }
      if (req.method === 'GET' && u.pathname === '/api/widget') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(state.widget));
      }
      if (req.method === 'POST' && u.pathname === '/api/silencios') {
        bodies.push({ type: req.headers['content-type'] ?? null, body: raw });
        res.writeHead(state.silenceStatus, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(state.silenceStatus < 300 ? { ok: true } : { error: 'no' }));
      }
      if (req.method === 'GET' && u.pathname === '/api/events') {
        queries.push(Object.fromEntries(u.searchParams));
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(state.events));
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, state, hits, bodies, queries, stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
