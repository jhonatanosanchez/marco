// gastos-dashboard falso para las pruebas de la tarjeta Dinero (fork fsrhome): node:http en el puerto 0.
//   GET /api/echo/resumen → state.resumen si la cabecera x-echo-token coincide con state.token; 401 si no;
//   500 con state.down. `tokens` guarda la cabecera recibida en cada petición (para comprobar que se manda).
import http from 'node:http';

export async function fakeGastos(data = {}) {
  const state = { down: false, token: 'gastos-prueba', resumen: null, ...data };
  const hits = [];
  const tokens = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(`${req.method} ${u.pathname}`);
    tokens.push(req.headers['x-echo-token'] ?? null);
    if (state.down) { res.writeHead(500); return res.end(); }
    if (u.pathname !== '/api/echo/resumen') { res.writeHead(404); return res.end(); }
    if (req.headers['x-echo-token'] !== state.token) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state.resumen));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, state, hits, tokens, stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
