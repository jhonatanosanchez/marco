// Marco server: display API + admin API + static frontend (dist/) + SSE.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { initStore, getConfig, events as storeEvents, paths, ROOT, migratedOnLoad, StoreError } from './store.js';
import { sessionMiddleware, lanOrSession, csrfGuard, ensurePassword, loginHandler, logoutHandler, logoutAllHandler, meHandler,
  googleLoginHandler, googleConnectHandler, googleCallbackHandler } from './auth.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { screensAdminRouter, displayPublicRouter } from './routes/screens.js';
import { hooksRouter } from './routes/hooks.js';
import { announceRouter } from './routes/announce.js';
import { systemRouter } from './routes/system.js';
import { eventsAdminRouter, eventsPublicRouter } from './routes/localEvents.js';
import { broadcast, closeAll, reresolveClients } from './sse.js';
import { startRefresher, stopRefresher, runRefresh } from './refresher.js';
import { logActivity, changedSections } from './activity.js';
import { resolveScreen } from './screens.js';
import { setServerVersion, flushDisplays, reresolveDisplays } from './displays.js';
import { pruneScreens } from './announce.js';
import { flushTokenUsage } from './tokens.js';
import { setupRouter, logSetupHint } from './setup.js';
import { hostGuard } from './lib/net.js';
import { invalidateIcsParsing } from './calendars.js';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

try {
  initStore();
} catch (err) {
  if (!(err instanceof StoreError)) throw err;
  console.error(err.message);
  process.exit(1);
}
setServerVersion(pkg.version);
if (migratedOnLoad) {
  logActivity('config.migrated', { actor: 'system', data: { ...migratedOnLoad, backup: 'config-v1-premigration.json' } });
}
// Floating ICS times (no TZID) are interpreted in the process zone; align it with the configured zone (and keep
// it aligned when the zone is changed in the admin or the wizard, see the 'config' listener below). A TZ set in
// the environment wins and is never changed.
const tzFromEnv = Boolean(process.env.TZ);
if (!tzFromEnv) process.env.TZ = getConfig().datetime.timezone;
await ensurePassword();

const app = express();
app.disable('x-powered-by');
// TRUST_PROXY: Express "trust proxy" value (default loopback). Set it to the address the reverse proxy connects
// from whenever that is not loopback — a proxy on another host (TRUST_PROXY=192.168.1.10), or any proxy in front
// of the Docker container (it connects from the bridge gateway: TRUST_PROXY=172.16.0.0/12) — so
// X-Forwarded-Proto/For are honoured (secure cookies, real client IP, LAN checks). See lib/net.js isLanClient.
const trustProxy = process.env.TRUST_PROXY?.trim();
app.set('trust proxy', !trustProxy ? 'loopback' : trustProxy === 'true' ? true : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy.split(',').map((x) => x.trim()));

// DNS-rebinding guard: only LAN host names, IP literals, PUBLIC_URL and ALLOWED_HOSTS (lib/net.js).
app.use(hostGuard());
app.use(sessionMiddleware());
// Route-specific body limits must come before the global parser (body-parser skips already-parsed bodies).
app.use(['/api/admin/import/preview', '/api/admin/import/apply'], express.json({ limit: '5mb' }));
app.use('/api/display/heartbeat', express.json({ limit: '4kb' }));
app.use('/api/hooks', express.json({ limit: '16kb' }));
app.use(express.json({ limit: '1mb' }));
app.use(['/api/admin', '/api/auth', '/api/setup'], csrfGuard({ multipartPaths: ['/photos', /^\/photos\/[^/]+\/thumb$/] }));

// --- auth ---
app.get('/api/auth/me', meHandler);
app.post('/api/auth/login', (req, res, next) => loginHandler(req, res).catch(next));
app.post('/api/auth/logout', logoutHandler);
app.post('/api/auth/logout-all', logoutAllHandler);
app.get('/auth/google/login', googleLoginHandler);
app.get('/auth/google/connect', googleConnectHandler);
app.get('/auth/google/callback', (req, res, next) => googleCallbackHandler(req, res).catch(next));

// --- APIs ---
// First-run setup wizard (open only while no admin password exists; server/setup.js).
app.use('/api/setup', setupRouter({ version: pkg.version }));
// Webhooks (bearer API tokens, no cookies → outside the CSRF guard) (docs/ARCHITECTURE.md).
app.use('/api/hooks', hooksRouter());
// Admin routers: each one applies requireAuth; unmatched paths fall through to the next one.
app.use('/api/admin', adminRouter());
app.use('/api/admin', screensAdminRouter(), announceRouter(), systemRouter({ version: pkg.version }), eventsAdminRouter());
// Public (display) routers.
app.use('/api', displayPublicRouter(), eventsPublicRouter());
app.use('/api', publicRouter({ version: pkg.version }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// --- media ---
// Family photos: LAN clients (the displays) or a signed-in admin only (auth.js lanOrSession).
app.use('/media', lanOrSession);
// Gallery URLs carry ?v=<mtime> (replaced photos get a new URL), so they can be cached for long.
app.use('/media/photos', express.static(paths.photos, { maxAge: '30d', dotfiles: 'deny', index: false, fallthrough: false }));
// Browser-made thumbnails (always JPEG, whatever the photo's extension) for the admin gallery grid.
app.use('/media/thumbs', express.static(path.join(paths.photos, '.thumbs'), {
  maxAge: '365d', immutable: true, dotfiles: 'deny', index: false, fallthrough: false,
  setHeaders: (res) => res.type('image/jpeg'),
}));

// --- frontend (production build) ---
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => {
    if (p.includes(`${path.sep}assets${path.sep}`)) res.set('cache-control', 'public, max-age=31536000, immutable');
  } }));
  const sendHtml = (file) => (req, res) => {
    res.set('cache-control', 'no-cache');
    res.sendFile(path.join(dist, file));
  };
  app.get(['/admin', '/admin/', '/admin/*splat'], (req, res, next) =>
    fs.existsSync(path.join(dist, 'admin', 'index.html')) ? sendHtml('admin/index.html')(req, res) : next());
  app.get(['/', '/index.html'], sendHtml('index.html'));
} else {
  app.get('/', (req, res) => res.type('text/plain').send(
    'Marco API running. Frontend not built: run `npm run build` (production) or `npm run dev` (vite on :5173).'));
}

// --- errors ---
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || (err.code === 'LIMIT_FILE_SIZE' ? 413 : err.name === 'MulterError' ? 400 : 500);
  if (status >= 500) console.error('[server]', req.method, req.originalUrl, err);
  const message = err.type === 'entity.parse.failed' ? 'invalid JSON' : status >= 500 ? 'internal error' : err.message;
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/auth')) return res.status(status).json({ error: message });
  res.status(status).type('text/plain').send(message);
});

// Config saved (admin, restore, import or server-side) → re-resolve each display's screen (slug renamed / screen
// deleted), displays refetch their config, calendars may have changed; activity log gets the changed sections.
storeEvents.on('config', (cfg, prev, { reason, req } = {}) => {
  if (!tzFromEnv && cfg.datetime.timezone && cfg.datetime.timezone !== process.env.TZ) {
    process.env.TZ = cfg.datetime.timezone; // Node applies a runtime TZ change to new Date computations
    invalidateIcsParsing();
  }
  reresolveClients((key) => resolveScreen(cfg, key).screen.id);
  reresolveDisplays(cfg);
  pruneScreens(cfg);
  broadcast('config', { revision: cfg.revision });
  runRefresh().catch(() => {});
  if (reason !== 'restore' && reason !== 'import') {
    logActivity('config.saved', { req, ...(req ? {} : { actor: 'system' }), data: { revision: cfg.revision, sections: changedSections(prev, cfg), ...(reason && reason !== 'admin' ? { reason } : {}) } });
  }
});

const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, process.env.HOST || '0.0.0.0', (err) => {
  // Express 5 passes listen errors (EADDRINUSE, EACCES…) to this callback.
  if (err) {
    console.error(`[server] cannot listen on port ${PORT}: ${err.code || err.message}`);
    process.exit(1);
  }
  console.log(`[server] Marco v${pkg.version} on http://localhost:${PORT} (data: ${paths.data})`);
  logSetupHint(PORT);
  startRefresher();
});

function shutdown(sig) {
  console.log(`[server] ${sig}, shutting down`);
  stopRefresher();
  try { flushDisplays(); flushTokenUsage(); } catch { /* ignore */ }
  closeAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
// Photo uploads can be up to 100 MB (fallback when the browser cannot optimize them): allow slow uplinks.
server.requestTimeout = 30 * 60_000;
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => console.error('[server] unhandled rejection:', err));
