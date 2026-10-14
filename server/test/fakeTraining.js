// running-coach + garmin-stats falsos para las pruebas de Tarjetas (fork fsrhome): un servidor node:http en el puerto 0.
//   GET /plan, /api/activities, /api/health-metrics, /api/adherence → state.<campo> como JSON; 500 con state.down
import http from 'node:http';

export async function fakeTraining(data = {}) {
  const state = { down: false, plan: { sessions: {} }, activities: [], health: {}, adherence: { rows: [], blocks: [] }, ...data };
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(`${req.method} ${u.pathname}${u.search}`);
    if (state.down) { res.writeHead(500); return res.end(); }
    const body = { '/plan': state.plan, '/api/activities': state.activities, '/api/health-metrics': state.health, '/api/adherence': state.adherence }[u.pathname];
    if (body === undefined) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, state, hits, stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
