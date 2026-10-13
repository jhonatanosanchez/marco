// Frigate + go2rtc falsos para las pruebas (un solo servidor node:http en el puerto 0).
//   GET /api/<cam>?fps=&h=                 MJPEG (multipart que no termina hasta que el cliente cierra)
//   GET /api/events?...                    state.events (JSON) o 500 con state.down
//   GET /api/events/<id>/snapshot.jpg      JPEG
//   GET /api/stream.mp4?src=<cam>          MP4 que no termina (302 si el User-Agent parece Safari)
//   GET /api/streams                       la URL RTSP con clave: las pruebas exigen que NUNCA se pida
import http from 'node:http';

export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0fake')]);

export async function fakeFrigate(opts = {}) {
  const state = { events: opts.events || [], down: false };
  const hits = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(`${req.method} ${u.pathname}${u.search} ua=${req.headers['user-agent'] || ''}`);
    if (u.pathname === '/api/streams') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"patio":"rtsp://admin:secreto@dvr"}'); }
    if (u.pathname === '/api/events') {
      if (state.down) { res.writeHead(500); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(state.events));
    }
    if (/^\/api\/events\/[^/]+\/snapshot\.jpg$/.test(u.pathname)) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(JPEG); }
    if (u.pathname === '/api/stream.mp4') {
      if (/Safari/.test(req.headers['user-agent'] || '')) { res.writeHead(302, { location: '/api/stream.m3u8' }); return res.end(); }
      res.writeHead(200, { 'content-type': 'video/mp4' });
      res.write(Buffer.from('ftypisom'));
      const t = setInterval(() => res.write(Buffer.from('moof')), 50);
      return req.on('close', () => clearInterval(t));
    }
    const cam = /^\/api\/([a-z0-9_]+)$/.exec(u.pathname);
    if (cam) {
      res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' });
      const frame = () => res.write(Buffer.concat([Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), JPEG, Buffer.from('\r\n')]));
      frame();
      const t = setInterval(frame, 50);
      return req.on('close', () => clearInterval(t));
    }
    res.writeHead(404);
    res.end();
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, hits, state,
    open: () => sockets.size,
    stop: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(r); }),
  };
}
