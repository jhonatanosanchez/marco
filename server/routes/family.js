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
//   familyPublicRouter() mounted at /api (the family page, header X-Family-Key):
//     GET    /family/state     → FamilyPhoneState
//     POST   /family/toggle    { choreId, done } → { ok, state }  (today)
//     POST   /family/redeem    { rewardId, memberId } → { ok, state }  (only when parents allow it)
//   familyDisplayRouter() mounted at /api (after displayAuth):
//     GET    /display/family   → FamilyDisplayState of the request's screen
//     POST   /display/family/toggle { choreId, done } → { ok, state }  (only screens with touch on, not private)
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getConfig } from '../store.js';
import { requestScreen } from '../displayAccess.js';
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
