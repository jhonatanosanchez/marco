// Widgets: the admin's "Probar" button (POST /api/admin/test/widget). The TVs load widget addresses themselves, so
// this only tells the owner whether the address answers with something a screen can show: an image (format, size)
// or a web page that lets itself be framed. Only admins reach it, so LAN addresses are allowed (they are the point).
// Never logs the address: it may carry a token in its query string.
import http from 'node:http';
import https from 'node:https';
import { widgetUrlError } from './core/validate.js';
import { sniffWidgetImage, widgetImageInfo, looksLikeSvg } from './core/imageInfo.js';
import { BROWSER_UA } from './lib/http.js';

export const WIDGET_TEST_TIMEOUT = 10_000;
export const WIDGET_MAX_BYTES = 20 * 1024 * 1024;
const WEB_READ_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const LARGE_BYTES = 5 * 1024 * 1024;
const LARGE_SIDE = 3840;
/** pixels decoded over all frames of an animation */
const LARGE_AREA = 50_000_000;

class FetchFail extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * GET `url` once (no redirects followed): { status, headers, body } with at most `maxBytes` of body. With
 * `truncate` a longer body is cut there instead of failing ('too_large'). Rejects with a FetchFail code.
 */
function getOnce(url, { accept, maxBytes, truncate, deadline }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    let settled = false;
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(v);
    };
    const req = mod.request(u, {
      method: 'GET',
      headers: { accept, 'user-agent': BROWSER_UA, 'accept-encoding': 'identity' },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return done(resolve, { status, headers: res.headers, body: Buffer.alloc(0) });
      }
      const len = Number(res.headers['content-length'] || 0);
      if (!truncate && len > maxBytes) {
        req.destroy();
        return done(reject, new FetchFail('too_large'));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        if (settled) return;
        size += c.length;
        if (size > maxBytes) {
          if (truncate) {
            chunks.push(c.subarray(0, c.length - (size - maxBytes)));
            req.destroy();
            return done(resolve, { status, headers: res.headers, body: Buffer.concat(chunks) });
          }
          req.destroy();
          return done(reject, new FetchFail('too_large'));
        }
        chunks.push(c);
      });
      res.on('end', () => done(resolve, { status, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', () => done(reject, new FetchFail('fetch_failed')));
    });
    const timer = setTimeout(() => {
      req.destroy();
      done(reject, new FetchFail('timeout'));
    }, Math.max(1, deadline - Date.now()));
    req.on('error', () => done(reject, new FetchFail('fetch_failed')));
    req.end();
  });
}

/** GET with redirects followed by hand (at most 3, each one http or https). */
async function fetchWidget(url, opts) {
  let cur = url;
  for (let hop = 0; ; hop++) {
    const r = await getOnce(cur, opts);
    r.url = cur;
    if (r.status < 300 || r.status >= 400) return r;
    const loc = r.headers.location;
    if (!loc) return r;
    if (hop >= MAX_REDIRECTS) throw new FetchFail('too_many_redirects');
    let next;
    try { next = new URL(String(loc), cur); } catch { throw new FetchFail('invalid_url'); }
    if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new FetchFail('invalid_url');
    cur = next.href;
  }
}

const httpCode = (status) => (status === 404 || status === 410 ? 'http_not_found' : status === 401 || status === 403 ? 'http_denied' : 'http_error');

/** True when the page's headers keep other sites from showing it in a frame (X-Frame-Options, CSP frame-ancestors). */
export function refusesFraming(headers) {
  const xfo = String(headers['x-frame-options'] || '').toLowerCase();
  if (/\b(deny|sameorigin)\b/.test(xfo)) return true;
  const csp = [].concat(headers['content-security-policy'] || []).join(';');
  const m = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(csp);
  if (!m) return false;
  return m[1].trim() !== '*';
}

/**
 * Test a widget address. `secure` = the admin page came over https, `host` = its Host (for the warnings).
 * Returns TestWidgetResponse (web/shared/types.ts): { ok, error? , format?, width?, height?, bytes?, warnings? }.
 */
export async function testWidget({ type, url, secure = false, host = '', timeoutMs = WIDGET_TEST_TIMEOUT } = {}) {
  const u = typeof url === 'string' ? url.trim() : '';
  if (type !== 'image' && type !== 'web') return { ok: false, error: 'invalid_type' };
  if (!u || u.length > 2048 || widgetUrlError(u)) return { ok: false, error: 'invalid_url' };
  const warnings = [];
  const parsed = new URL(u);
  if (secure && parsed.protocol === 'http:') warnings.push('http_on_https');
  if (type === 'web' && host && parsed.host.toLowerCase() === String(host).toLowerCase()) warnings.push('same_origin');
  const web = type === 'web';
  let r;
  try {
    r = await fetchWidget(parsed.href, {
      accept: web ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' : 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml;q=0.9,*/*;q=0.1',
      maxBytes: web ? WEB_READ_BYTES : WIDGET_MAX_BYTES,
      truncate: web,
      deadline: Date.now() + timeoutMs,
    });
  } catch (e) {
    return { ok: false, error: e instanceof FetchFail ? e.code : 'fetch_failed', ...(warnings.length ? { warnings } : {}) };
  }
  if (r.status >= 300) return { ok: false, error: r.status < 400 ? 'too_many_redirects' : httpCode(r.status), ...(warnings.length ? { warnings } : {}) };
  if (web) {
    if (refusesFraming(r.headers)) warnings.push('refuses_framing');
    // a page that sends the screen on to this server (the display refuses to frame it, see custom.ts)
    if (host && !warnings.includes('same_origin') && new URL(r.url).host.toLowerCase() === String(host).toLowerCase()) warnings.push('same_origin');
    return { ok: true, warnings };
  }
  const bytes = r.body.length;
  const mime = sniffWidgetImage(r.body);
  if (!mime) {
    // a TV loads an SVG in an <img>, where its scripts never run
    if (looksLikeSvg(r.body)) return { ok: true, format: 'svg', bytes, warnings };
    return { ok: false, error: 'not_image', ...(warnings.length ? { warnings } : {}) };
  }
  const info = widgetImageInfo(r.body);
  // no size in it (cut off, or 0 pixels wide or high): no screen shows it
  if (!info) return { ok: false, error: 'not_image', ...(warnings.length ? { warnings } : {}) };
  if (bytes > LARGE_BYTES || Math.max(info.w, info.h) > LARGE_SIDE || info.area > LARGE_AREA) warnings.push('large_image');
  return { ok: true, format: mime.slice(6), width: info.w, height: info.h, bytes, warnings };
}
