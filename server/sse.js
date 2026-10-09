// Server-Sent Events: client registry, targeted broadcast, heartbeat.
// See docs/API.md and docs/ARCHITECTURE.md. Each client remembers the screen key it asked for (?screen=), the resolved
// screen id and its display clientId (?client=), so events can target screens or single displays.
let seq = 0;
const clients = new Set();
let heartbeat = null;
export const MAX_STREAMS_PER_IP = 24;

/**
 * @typedef {object} SseClient
 * @property {number} n           internal sequence number
 * @property {import('node:http').ServerResponse} res
 * @property {string} ip
 * @property {string} userAgent
 * @property {number} since       connect time (ms)
 * @property {string} screenKey   requested ?screen= ('' = default)
 * @property {string} screenId    resolved screen id (re-resolved on config save)
 * @property {string} clientId    display id (?client=, or "anon-<n>" for old builds)
 * @property {boolean} anonymous  true when the display did not send a clientId
 */

/**
 * Express handler for GET /api/stream.
 * @param {{ init: (req) => { screenKey: string, screenId: string, clientId: string, anonymous: boolean },
 *           hello: (client: SseClient) => object, onOpen?: (client: SseClient, req) => void,
 *           onClose?: (client: SseClient) => void }} hooks
 */
export function sseHandler(hooks) {
  if (typeof hooks === 'function') hooks = { init: () => ({}), hello: hooks }; // legacy signature
  return (req, res) => {
    // The stream is public: cap concurrent streams per ip (kiosk + a few admin previews need far fewer).
    const ip = req.ip || '';
    let fromIp = 0;
    for (const c of clients) if (c.ip === ip) fromIp++;
    if (fromIp >= MAX_STREAMS_PER_IP) {
      res.writeHead(429, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30' });
      return res.end('too many streams');
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    const client = {
      n: ++seq, res, ip: req.ip || '', userAgent: String(req.get?.('user-agent') || '').slice(0, 300), since: Date.now(),
      screenKey: '', screenId: '', clientId: '', anonymous: true,
      ...hooks.init(req),
    };
    clients.add(client);
    // A write after end / on a reset socket emits 'error' asynchronously: never let it crash the process.
    res.on?.('error', () => clients.delete(client));
    send(client, 'hello', hooks.hello(client));
    try { hooks.onOpen?.(client, req); } catch (err) { console.warn('[sse] onOpen:', err.message); }
    req.on('close', () => {
      clients.delete(client);
      try { hooks.onClose?.(client); } catch (err) { console.warn('[sse] onClose:', err.message); }
    });
    startHeartbeat();
  };
}

/** Write one event to one client. Returns true when written. */
export function send(client, event, data) {
  if (!writable(client)) { clients.delete(client); return false; }
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
    return true;
  } catch {
    clients.delete(client);
    return false;
  }
}

const writable = (c) => Boolean(c?.res && !c.res.writableEnded && !c.res.destroyed);

/**
 * Close a client's stream now and forget it (no later broadcast may write to it). Optionally sends one last event.
 * @param {SseClient} client
 * @param {{ event: string, data?: unknown }} [last]
 */
export function dropClient(client, last) {
  if (last) send(client, last.event, last.data);
  clients.delete(client);
  try { if (!client.res.writableEnded) client.res.end(); } catch { /* ignore */ }
}

/** True when `client` matches `target` ({ screenIds?, clientIds? }; empty/absent target = everybody). */
export function matches(client, target) {
  const sids = target?.screenIds?.length ? target.screenIds : null;
  const cids = target?.clientIds?.length ? target.clientIds : null;
  if (!sids && !cids) return true;
  return Boolean((sids && sids.includes(client.screenId)) || (cids && cids.includes(client.clientId)));
}

/**
 * Send an event to every client matching `target` (and `filter`, if given). Returns the number of displays
 * reached (admin preview clients receive it but are not counted).
 * @param {string} event
 * @param {unknown} data
 * @param {{ screenIds?: string[], clientIds?: string[] } | null} [target]
 * @param {(client: SseClient) => boolean} [filter]
 */
export function broadcast(event, data, target = null, filter = null) {
  let n = 0;
  for (const c of [...clients]) {
    if (!matches(c, target)) continue;
    if (filter && !filter(c)) continue;
    // Admin preview iframes get the event too, but don't count as a display reached.
    if (send(c, event, data) && !c.preview) n++;
  }
  return n;
}

export const clientCount = () => clients.size;
/** Snapshot of the connected clients (read-only use). */
export const listClients = () => [...clients];

/** Re-resolve every client's screen id (config saved: slugs may have changed, screens deleted). */
export function reresolveClients(resolve) {
  for (const c of clients) {
    try { c.screenId = resolve(c.screenKey) || c.screenId; } catch { /* keep */ }
  }
}

let validator = null;
/** Run `fn` before every heartbeat (re-checks each stream's credential: sessions expire, devices move…). */
export function setStreamValidator(fn) { validator = fn; }

function startHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    try { validator?.(); } catch (err) { console.warn('[sse] validator:', err.message); }
    for (const c of [...clients]) {
      // Named event (not an SSE comment) so the client watchdog sees it.
      send(c, 'ping', { t: Date.now() });
    }
  }, 25_000);
  heartbeat.unref();
}

export function closeAll() {
  for (const c of clients) { try { c.res.end(); } catch { /* ignore */ } }
  clients.clear();
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}
