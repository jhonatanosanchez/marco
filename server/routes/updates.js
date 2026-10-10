// Updates (self-hosted only, features.updates). Mounted at /api/admin (session required), docs/API.md:
//   GET  /update            what is running, the latest release, the install type, settings, the last update
//   PUT  /update/settings   { check?, auto?, from?, to? }
//   POST /update/check      ask GitHub now
//   POST /update/apply      ask the root service (marco-update.path) to install the latest release
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getConfig, paths, ROOT } from '../store.js';
import { logActivity } from '../activity.js';
import { getUpdater, settingsErrors, MANUAL_CHECK_GAP_MS } from '../updates.js';

/** The updater of this server (data folder of the store, version of the running package). */
export function serverUpdater(version) {
  return getUpdater(() => ({
    version,
    dataDir: paths.data,
    root: ROOT,
    timezone: () => getConfig()?.datetime?.timezone || 'UTC',
    log: (type, data) => logActivity(type, { actor: 'system', level: type === 'update.failed' ? 'warn' : 'info', data }),
  }));
}

export function updatesRouter({ version, updater = null }) {
  const r = Router();
  const u = () => updater ?? serverUpdater(version);
  r.use('/update', requireAuth, (req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
  });

  r.get('/update', (req, res) => res.json(u().info()));

  r.put('/update/settings', (req, res) => {
    const body = req.body ?? {};
    const errors = settingsErrors(body);
    if (errors.length) return res.status(400).json({ error: 'invalid', details: errors });
    const patch = {};
    for (const k of ['check', 'auto', 'from', 'to']) if (k in body) patch[k] = body[k];
    const next = u().saveSettings(patch);
    logActivity('update.settings', { req, data: next });
    res.json(u().info());
  });

  r.post('/update/check', async (req, res) => {
    const cur = u().info();
    if (cur.checks === 'env-off') return res.status(409).json({ error: 'checks_disabled' });
    const last = Date.parse(cur.checkedAt || '');
    // A burst of clicks costs one request to GitHub.
    if (!Number.isNaN(last) && Date.now() - last < MANUAL_CHECK_GAP_MS && Date.now() >= last) return res.json(cur);
    res.json(await u().check({ force: true }));
  });

  r.post('/update/apply', (req, res) => {
    const out = u().request({ by: 'admin' });
    if (!out.ok) return res.status(409).json({ error: out.error });
    logActivity('update.requested', { req, data: { by: 'admin', from: out.from, to: out.to } });
    res.json(u().info());
  });

  return r;
}
