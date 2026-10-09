// Private display links, paired devices and pairing. See docs/API.md ("Display access") and SECURITY.md.
//   accessAdminRouter() mounted at /api/admin (session required):
//     GET    /display-links                         → { mode, links: DisplayLink[], lanAddresses, publicUrl }
//     POST   /display-links/:screenId/regenerate    → { link: DisplayLink }
//     GET    /devices                               → { mode, devices: PairedDevice[] }
//     PATCH  /devices/:id   { name?, screenId? }    → { device }
//     DELETE /devices/:id                           → { ok }
//     POST   /pair/claim    { code, screenId, name? } → { device }
//   pairPublicRouter() mounted at /api (no auth; rate-limited):
//     POST   /pair/start                            → { sessionId, code, expiresAt, pollMs }
//     POST   /pair/status   { sessionId }           → { status: 'waiting' | 'paired' | 'expired', … }
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { lanAddresses } from '../setup.js';
import {
  displayAccessMode, listDisplayLinks, regenerateKey, listDevices, updateDevice, revokeDevice,
} from '../displayAccess.js';
import { startPairing, pairingStatus, claimPairing } from '../pairing.js';

/** PUBLIC_URL when it points somewhere else than this machine (http(s) only), else null. */
function publicUrl() {
  const v = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|\[::1\])/.test(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function accessAdminRouter() {
  const r = Router();
  r.use(['/display-links', '/devices', '/pair'], requireAuth);
  r.use(['/display-links', '/devices', '/pair'], (req, res, next) => { res.set('cache-control', 'private, no-store'); next(); });

  // lanAddresses / publicUrl: an admin opened on the server itself (http://localhost) builds the links, QR codes and
  // kiosk commands for other devices from these instead of "localhost".
  r.get('/display-links', (req, res) => res.json({ mode: displayAccessMode(), links: listDisplayLinks(), lanAddresses: lanAddresses(), publicUrl: publicUrl() }));

  r.post('/display-links/:screenId/regenerate', (req, res) => {
    const key = regenerateKey(String(req.params.screenId), { req });
    if (!key) return res.status(404).json({ error: 'unknown screen' });
    res.json({ link: listDisplayLinks().find((l) => l.screenId === req.params.screenId) });
  });

  r.get('/devices', (req, res) => res.json({ mode: displayAccessMode(), devices: listDevices() }));

  r.patch('/devices/:id', (req, res) => {
    const out = updateDevice(String(req.params.id), req.body || {}, { req });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json(out);
  });

  r.delete('/devices/:id', (req, res) => {
    if (!revokeDevice(String(req.params.id), { req })) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  r.post('/pair/claim', (req, res) => {
    const out = claimPairing(req, req.body || {});
    if (out.error) {
      if (out.status === 429) res.set('retry-after', '600');
      return res.status(out.status).json({ error: out.error, code: out.code });
    }
    res.json(out);
  });
  return r;
}

export function pairPublicRouter() {
  const r = Router();
  r.use('/pair', (req, res, next) => { res.set('cache-control', 'private, no-store'); next(); });
  r.post('/pair/start', (req, res) => {
    const out = startPairing(req);
    if (out.error) {
      res.set('retry-after', '60');
      return res.status(out.status).json({ error: out.error });
    }
    res.json(out);
  });
  r.post('/pair/status', (req, res) => {
    const out = pairingStatus(req.body?.sessionId);
    res.status(out.status === 'expired' ? 404 : 200).json(out);
  });
  return r;
}
