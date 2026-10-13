// Familia (server/family.js, server/core/familyCore.js). Every answer: cache-control private, no-store. POST bodies
// must be JSON (415 otherwise), so a page on another site cannot post a plain form here without a CORS preflight.
//   familyAdminRouter() mounted at /api/admin (session required):
//     GET    /family                         → FamilyAdminState
//     POST   /family/toggle    { choreId, date?, done } → { ok, state }  (today or up to 7 days back)
//     POST   /family/adjust    { memberId, delta, note? } → { ok, state }
//     POST   /family/redeem    { rewardId, memberId, force? } → { ok, state }
//     DELETE /family/redemptions/:id, /family/adjustments/:id → { ok, state }
//     POST   /family/link      → { link }  (create, or replace: the old link stops working)
//     DELETE /family/link      → { ok }
//     POST   /family/photos    { data: base64 } → { photo: id }  (a profile photo, cropped in the browser; the
//                               config's family.members[].photo then names it; familyPhotos.js)
//   familyPublicRouter() mounted at /api (the family page, header X-Family-Key):
//     GET    /family/state     → FamilyPhoneState
//     POST   /family/toggle    { choreId, done } → { ok, state }  (today)
//     POST   /family/redeem    { rewardId, memberId } → { ok, state }  (only when parents allow it)
//   familyDisplayRouter() mounted at /api (after displayAuth):
//     GET    /display/family   → FamilyDisplayState of the request's screen
//     POST   /display/family/toggle { choreId, done } → { ok, state }  (only screens with touch on, not private)
//   familyPhotoMedia: GET /media/avatars/<id> (app.js, before the /media guard), a member's profile photo for
//     - the family page: X-Family-Key (the photo of a current member)
//     - an admin session: any stored photo (also one uploaded and not saved yet, for the preview)
//     - a display: link key, paired device (?k=) or open mode (LAN only), naming its screen like every display request; only
//       the photos of the members that screen shows, never while its privacy mode is on
//     Anything else: 404 (401/403 for a missing or wrong display credential). Private, no-cache, ETag = the id.
import { Router } from 'express';
import { requireAuth, isLanClient } from '../auth.js';
import { getConfig } from '../store.js';
import {
  requestScreen, resolveDisplayAccess, unknownScreenRequest, bareScreenRequest, SCREEN_NOT_FOUND,
} from '../displayAccess.js';
import { KEY_HEADER as FAMILY_KEY_HEADER } from '../family.js';
import { storeFamilyPhoto, photoFile } from '../familyPhotos.js';
import { PHOTO_ID_RE, photoIdsOf, MAX_PHOTO_BYTES } from '../core/familyPhotoCore.js';
import fs from 'node:fs';
import { screenPrivacy } from '../privacy.js';
import {
  adminFamilyState, phoneFamilyState, displayFamilyState, toggleChore, redeemReward, adjustPoints, undoFamilyEntry,
  rotateFamilyLink, revokeFamilyLink, familyKeyAuth, allowFamilyAction, allowDisplayToggle, familyQrUrl, trustedDisplay,
} from '../family.js';

/** HTTP status of each familyCore / family.js error code. */
const STATUS = {
  unknown_chore: 404, unknown_reward: 404, unknown_member: 404, not_found: 404,
  not_today: 409, not_enough: 409, not_kid: 400, bad_delta: 400, bad_date: 400,
};
const fail = (res, code) => res.status(STATUS[code] || 400).json({ error: code, code });

const noStore = (req, res, next) => { res.set('cache-control', 'private, no-store'); next(); };

/** POSTs must carry JSON. */
export function jsonOnly(req, res, next) {
  if (req.method !== 'POST') return next();
  if (!String(req.get('content-type') || '').toLowerCase().startsWith('application/json')) return res.status(415).json({ error: 'json required' });
  next();
}

const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

export function familyAdminRouter() {
  const r = Router();
  r.use('/family', requireAuth, noStore);

  r.get('/family', (req, res) => res.json(adminFamilyState()));

  r.post('/family/toggle', (req, res) => {
    const b = body(req);
    const out = toggleChore({ choreId: b.choreId, date: b.date || undefined, done: b.done === true, by: 'admin', req });
    if (out.error) return fail(res, out.error);
    res.json({ ok: true, state: adminFamilyState() });
  });

  r.post('/family/adjust', (req, res) => {
    const b = body(req);
    const out = adjustPoints({ memberId: b.memberId, delta: b.delta, note: b.note, req });
    if (out.error) return fail(res, out.error);
    res.json({ ok: true, state: adminFamilyState() });
  });

  r.post('/family/redeem', (req, res) => {
    const b = body(req);
    const out = redeemReward({ rewardId: b.rewardId, memberId: b.memberId, by: 'admin', force: b.force === true, req });
    if (out.error) return fail(res, out.error);
    res.json({ ok: true, state: adminFamilyState() });
  });

  for (const [path, kind] of [['redemptions', 'redemption'], ['adjustments', 'adjustment']]) {
    r.delete(`/family/${path}/:id`, (req, res) => {
      const out = undoFamilyEntry({ kind, id: String(req.params.id), req });
      if (out.error) return fail(res, out.error);
      res.json({ ok: true, state: adminFamilyState() });
    });
  }

  r.post('/family/photos', (req, res) => {
    const data = body(req).data;
    if (typeof data !== 'string' || !data || data.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 64) {
      return res.status(typeof data === 'string' && data ? 413 : 400).json({ error: 'too_big', code: typeof data === 'string' && data ? 'too_big' : 'empty' });
    }
    const b64 = data.replace(/^data:[^,]*,/, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return res.status(400).json({ error: 'not_image', code: 'not_image' });
    const out = storeFamilyPhoto(new Uint8Array(Buffer.from(b64, 'base64')));
    if (out.error) return res.status(out.error === 'too_many' ? 409 : out.error === 'too_big' ? 413 : 400).json({ error: out.error, code: out.error });
    res.json({ photo: out.id });
  });

  r.post('/family/link', (req, res) => res.json({ link: rotateFamilyLink({ req }) }));
  r.delete('/family/link', (req, res) => {
    if (!revokeFamilyLink({ req })) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });
  return r;
}

export function familyPublicRouter() {
  const r = Router();
  r.use('/family', noStore, jsonOnly, familyKeyAuth);

  r.get('/family/state', (req, res) => res.json(phoneFamilyState()));

  r.post('/family/toggle', (req, res) => {
    const b = body(req);
    if (!allowFamilyAction()) {
      res.set('retry-after', '60');
      return res.status(429).json({ error: 'too many changes, wait a minute', code: 'rate_limited' });
    }
    // the family page only changes today
    const out = toggleChore({ choreId: b.choreId, date: b.date || undefined, done: b.done === true, by: 'phone', req });
    if (out.error) return fail(res, out.error);
    res.json({ ok: true, state: phoneFamilyState() });
  });

  r.post('/family/redeem', (req, res) => {
    const b = body(req);
    if (!getConfig().family.allowRedeemFromPhone) return res.status(403).json({ error: 'rewards are redeemed with a parent', code: 'redeem_off' });
    if (!allowFamilyAction()) {
      res.set('retry-after', '60');
      return res.status(429).json({ error: 'too many changes, wait a minute', code: 'rate_limited' });
    }
    const out = redeemReward({ rewardId: b.rewardId, memberId: b.memberId, by: 'phone', req });
    if (out.error) return fail(res, out.error);
    res.json({ ok: true, state: phoneFamilyState() });
  });
  return r;
}

/** FamilyDisplayState for a display request. */
function displayState(cfg, req) {
  const { screen } = requestScreen(cfg, req);
  return displayFamilyState(cfg, screen, { priv: screenPrivacy(cfg, screen).active, qrUrl: familyQrUrl(req) });
}

const TOUCH_OFF = { error: 'touch is off on this screen', code: 'touch_off' };

export function familyDisplayRouter() {
  const r = Router();
  r.use('/display/family', noStore, jsonOnly);

  r.get('/display/family', (req, res) => {
    const cfg = getConfig();
    if (!cfg.family.enabled) return res.status(404).json({ error: 'family is off', code: 'family_off' });
    res.json(displayState(cfg, req));
  });

  // A tap on the TV. Only screens whose touch setting is on and that are not private, only routines of the members
  // that screen shows, and only from a display that is known (link key, paired device, admin session) or, in the
  // open mode, on the local network. Redeeming from a TV does not exist.
  r.post('/display/family/toggle', (req, res) => {
    const cfg = getConfig();
    const { screen, empty } = requestScreen(cfg, req);
    const trusted = trustedDisplay(req);
    const sf = screen.family;
    const b = body(req);
    const chore = cfg.family.chores.find((c) => c.id === b.choreId);
    if (!cfg.family.enabled || empty || !sf?.touch || !trusted || screenPrivacy(cfg, screen).active
      || !chore || (sf.memberIds && !sf.memberIds.includes(chore.memberId))) return res.status(403).json(TOUCH_OFF);
    if (!allowDisplayToggle(screen.id)) {
      res.set('retry-after', '60');
      return res.status(429).json({ error: 'too many changes, wait a minute', code: 'rate_limited' });
    }
    const out = toggleChore({ choreId: chore.id, done: b.done === true, by: 'display', screen, req });
    if (out.error) return fail(res, out.error);
    res.json({ ok: true, state: displayState(cfg, req) });
  });
  return r;
}

const DISPLAY_ERRORS = { key_required: 'display key required', invalid_key: 'this display link or device is no longer valid' };

/** GET /media/avatars/:id (see the top of this file). */
export function familyPhotoMedia(req, res) {
  res.set('cache-control', 'private, no-store');
  const notFound = () => res.status(404).type('text/plain').send('not found');
  const id = String(req.params.id || '');
  if (!PHOTO_ID_RE.test(id)) return notFound();
  const cfg = getConfig();
  const send = () => {
    const f = photoFile(id);
    if (!f) return notFound();
    // the id is the content: same id, same bytes
    const etag = `"${id}"`;
    // no-cache: every load asks again (a 304 when nothing changed), so a revoked key or a screen gone private stops
    // showing it at once
    res.set({ etag, 'cache-control': 'private, no-cache', 'content-security-policy': "default-src 'none'; frame-ancestors 'self'" });
    if (String(req.get('if-none-match') || '').split(/\s*,\s*/).includes(etag)) return res.status(304).end();
    let bytes;
    try { bytes = fs.readFileSync(f.file); } catch { return notFound(); }
    res.type(f.type).send(bytes);
  };

  // The family page (its key travels in the header: the page loads the photo with fetch)
  if (req.get(FAMILY_KEY_HEADER) !== undefined) {
    return familyKeyAuth(req, res, () => (photoIdsOf(getConfig().family).has(id) ? send() : notFound()));
  }

  const a = resolveDisplayAccess(req, { allowQuery: true });
  if (!a.ok) return res.status(a.status).type('text/plain').send(DISPLAY_ERRORS[a.code] || 'forbidden');
  req.displayAccess = a;
  if (a.via === 'session') return send();
  // open mode serves the LAN only, like every other display request (displayAccess.js)
  if (a.via === 'open' && !isLanClient(req)) return notFound();
  if (!cfg.family.enabled) return notFound();
  // like any display request: an unknown screen, or (open mode, from another machine) no screen at all, gets nothing
  if (unknownScreenRequest(cfg, req) || bareScreenRequest(cfg, req)) return res.status(404).json(SCREEN_NOT_FOUND);
  const { screen, empty } = requestScreen(cfg, req);
  if (empty || screenPrivacy(cfg, screen).active) return notFound();
  const ids = screen.family?.memberIds;
  const shown = cfg.family.members.some((m) => m.photo === id && (!ids || ids.includes(m.id)));
  return shown ? send() : notFound();
}
