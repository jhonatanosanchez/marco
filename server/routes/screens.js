// screens & connected displays. See docs/API.md and docs/ARCHITECTURE.md.
//   screensAdminRouter() mounted at /api/admin (session required):
//     GET    /screens/template?name=   → ScreenProfile with defaults (fresh id/slug)
//     GET    /displays                 → { displays: DisplayInfo[], serverVersion }
//     POST   /displays/command         → { ok, delivered }
//     DELETE /displays/:clientId       → { ok }
//   displayPublicRouter() mounted at /api (no auth, LAN):
//     POST /display/heartbeat          → { ok, now, revision }
import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getConfig } from '../store.js';
import { defaultScreenProfile } from '../core/defaults.js';
import { slugify } from '../core/validate.js';
import { listDisplays, runCommand, forgetDisplay, recordHeartbeat, getServerVersion } from '../displays.js';
import { logActivity } from '../activity.js';
import { markFast } from '../pollHub.js';

/** A fresh screen profile named `name` whose slug is not used by `cfg`. */
export function screenTemplate(cfg, name) {
  const n = (typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 60) : '') || 'Screen';
  const used = new Set(cfg.screens.map((s) => s.slug));
  const base = slugify(n) || 'screen';
  let slug = base;
  for (let i = 2; used.has(slug); i++) slug = `${base.slice(0, 29)}-${i}`;
  const ids = new Set(cfg.screens.map((s) => s.id));
  let id;
  do id = `s_${crypto.randomBytes(5).toString('hex')}`; while (ids.has(id));
  return defaultScreenProfile({ id, slug, name: n });
}

export function screensAdminRouter() {
  const r = Router();
  r.use(requireAuth);

  r.get('/screens/template', (req, res) => {
    res.set('cache-control', 'no-store');
    res.json(screenTemplate(getConfig(), req.query.name));
  });

  r.get('/displays', (req, res) => {
    res.set('cache-control', 'no-store');
    // Polling displays check in every few seconds while someone has this page open (Identify, night mode).
    markFast(60_000);
    res.json({ displays: listDisplays(), serverVersion: getServerVersion() });
  });

  r.post('/displays/command', (req, res) => {
    const out = runCommand(req.body);
    if (out.error) return res.status(out.status || 400).json({ error: out.error, ...(out.unknown ? { unknown: out.unknown } : {}) });
    const b = req.body;
    logActivity('display.command', {
      req,
      data: {
        action: b.action, ...(b.mode ? { mode: b.mode } : {}),
        ...(out.target.screenIds.length ? { screens: out.target.screenIds } : {}),
        ...(out.target.clientIds.length ? { clientIds: out.target.clientIds } : {}),
        delivered: out.delivered,
      },
    });
    res.json({ ok: true, delivered: out.delivered });
  });

  r.delete('/displays/:clientId', (req, res) => {
    const r2 = forgetDisplay(String(req.params.clientId));
    if (r2 === 'not_found') return res.status(404).json({ error: 'not found' });
    if (r2 === 'connected') return res.status(409).json({ error: 'display is connected' });
    res.json({ ok: true });
  });

  return r;
}

export function displayPublicRouter() {
  const r = Router();
  r.post('/display/heartbeat', (req, res) => {
    res.set('cache-control', 'no-store');
    const out = recordHeartbeat(req.body, req);
    if (out.error) return res.status(out.error === 'too many displays' ? 429 : 400).json({ error: out.error });
    res.json(out);
  });
  return r;
}
