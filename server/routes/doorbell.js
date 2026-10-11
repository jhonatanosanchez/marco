// Doorbell camera routes. See docs/API.md.
//   POST /api/hooks/doorbell             (bearer token, mounted by hooks.js)  → { ok, action, delivered, screens, expiresAt? }
//   POST /api/admin/doorbell             (admin session: the "Test" button)   → same answer
//   GET  /api/display/doorbell/frame     (display credential)                 → the camera picture, only while ringing
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getConfig } from '../store.js';
import { resolveScreenList } from '../displays.js';
import { requestScreen } from '../displayAccess.js';
import { logActivity } from '../activity.js';
import { isLanClient } from '../lib/net.js';
import { sanitizeDoorbell } from '../core/doorbellCore.js';
import { frameFor, runDoorbell } from '../doorbell.js';

/**
 * Shared by the webhook and the admin: validate, ring or dismiss, log. Returns [status, body].
 * @param {any} req  Express request (body = DoorbellRequest)
 * @param {'admin'|'hook'} via
 */
export function handleDoorbell(req, via) {
  const cfg = getConfig();
  const v = sanitizeDoorbell(req.body, cfg.homeassistant.doorbell, (keys) => resolveScreenList(cfg, keys));
  if (!v.ok) return [400, { error: v.error, details: v.details }];
  const out = runDoorbell(v.value);
  const slugs = out.screenIds.map((id) => cfg.screens.find((s) => s.id === id)?.slug || id);
  // One entry per ring or dismiss; the camera is a Home Assistant entity id, not a secret.
  logActivity('display.doorbell', {
    req,
    data: {
      action: out.action, screens: slugs, delivered: out.delivered, via,
      ...(out.action === 'ring' ? { seconds: v.value.seconds, camera: v.value.camera || null, extended: out.rings.some((r) => r.rings > 1) } : {}),
    },
  });
  const expiresAt = out.rings.length ? out.rings.map((r) => r.expiresAt).sort().at(-1) : null;
  return [200, { ok: true, action: out.action, delivered: out.delivered, screens: slugs, ...(out.action === 'ring' ? { expiresAt } : {}) }];
}

export function doorbellAdminRouter() {
  const r = Router();
  r.post('/doorbell', requireAuth, (req, res) => {
    res.set('cache-control', 'no-store');
    const [status, body] = handleDoorbell(req, 'admin');
    res.status(status).json(body);
  });
  return r;
}

/** Mounted under /api after displayAuth (app.js DISPLAY_API_PATHS covers /api/display). */
export function doorbellPublicRouter() {
  const r = Router();
  r.get('/display/doorbell/frame', async (req, res, next) => {
    try {
      res.set('cache-control', 'private, no-store, max-age=0');
      res.set('pragma', 'no-cache');
      // Open display access (legacy LAN mode): camera pictures only for LAN clients or an admin session, like photos.
      if (req.displayAccess?.via === 'open' && !isLanClient(req)) return res.status(404).json({ error: 'not found', code: 'no_ring' });
      const { screen } = requestScreen(getConfig(), req);
      const [status, out] = await frameFor(screen.id);
      if (status !== 200) return res.status(status).json(out);
      res.set('content-type', out.type);
      res.set('content-length', String(out.body.length));
      res.set('x-content-type-options', 'nosniff');
      res.end(out.body);
    } catch (err) {
      next(err);
    }
  });
  return r;
}
