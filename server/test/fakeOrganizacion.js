// organizacion falsa para la tarjeta Organización (fork fsrhome).
//   GET /api/marco/resumen  → state.resumen (500 con state.down); exige x-marco-token = state.token (401 si no)
//   POST /api/marco/aprobar → state.approveStatus (202 por defecto) con { error } si ≥ 400; guarda el cuerpo en `bodies`
import http from 'node:http';

export async function fakeOrganizacion(data = {}) {
  const state = { down: false, token: 't'.repeat(40), approveStatus: 202, resumen: { ahora: 'x', pendientes: [], altas24h: [] }, ...data };
  const bodies = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (state.down) { res.writeHead(500); return res.end(); }
      if (req.headers['x-marco-token'] !== state.token) { res.writeHead(401); return res.end(); }
      if (req.method === 'GET' && req.url === '/api/marco/resumen') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(state.resumen)); }
      if (req.method === 'POST' && req.url === '/api/marco/aprobar') {
        bodies.push(raw);
        res.writeHead(state.approveStatus, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(state.approveStatus >= 400 ? { error: 'ya está aplicando' } : { estado: 'por_confirmar' }));
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, state, bodies, stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
