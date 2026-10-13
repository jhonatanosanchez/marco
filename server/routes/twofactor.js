// Two-step sign-in settings (server/twofactor.js), mounted at /api/admin (session required):
//   GET  /2fa                                 → { enabled, enabledAt, recoveryLeft }
//   POST /2fa/setup          { password? }     → { secret, uri }  (a sign-in in the last 10 minutes, or the password)
//   POST /2fa/enable         { code }          → { ok, recoveryCodes }  (the first code from the app; shown once)
//   POST /2fa/disable        { password? | code? } → { ok }
//   POST /2fa/recovery-codes { password? | code? } → { ok, recoveryCodes }
// The sign-in step itself is POST /api/auth/2fa (auth.js twoFactorLoginHandler). None of these end a session.
import { Router } from 'express';
import { requireAuth, requireRecentAuth, requirePasswordOrCode } from '../auth.js';
import { logActivity } from '../activity.js';
import { hostnameOf } from '../lib/net.js';
import { otpauthUri } from '../lib/totp.js';
import { twoFactorEnabled, twoFactorStatus, startSetup, confirmSetup, disableTwoFactor, renewRecoveryCodes } from '../twofactor.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const SETUP_ERRORS = { no_setup: 409, expired: 410, code_invalid: 400, already_enabled: 409 };

export function twoFactorRouter() {
  const r = Router();
  r.use('/2fa', requireAuth, (req, res, next) => { res.set('cache-control', 'private, no-store'); next(); });

  r.get('/2fa', (req, res) => res.json(twoFactorStatus()));

  r.post('/2fa/setup', wrap(async (req, res) => {
    if (twoFactorEnabled()) return res.status(409).json({ error: 'already on', code: 'already_enabled' });
    if (!(await requireRecentAuth(req, res, req.body?.password))) return;
    const secret = startSetup();
    // The app shows "Marco (admin@<host>)", so several installs can be told apart.
    const host = hostnameOf(req.get('host') || '') || 'marco';
    res.json({ secret, uri: otpauthUri({ secret, issuer: 'Marco', account: `admin@${host}` }) });
  }));

  r.post('/2fa/enable', (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.slice(0, 40) : '';
    const out = confirmSetup(code);
    if (!out.ok) return res.status(SETUP_ERRORS[out.reason] || 400).json({ error: out.reason, code: out.reason });
    logActivity('auth.2fa_enabled', { req, level: 'warn', data: { method: req.session.user.method } });
    res.json({ ok: true, recoveryCodes: out.recoveryCodes });
  });

  r.post('/2fa/disable', wrap(async (req, res) => {
    if (!twoFactorEnabled()) return res.json({ ok: true });
    if (!(await requirePasswordOrCode(req, res, req.body || {}))) return;
    disableTwoFactor();
    logActivity('auth.2fa_disabled', { req, level: 'warn', data: { method: req.session.user.method } });
    res.json({ ok: true });
  }));

  r.post('/2fa/recovery-codes', wrap(async (req, res) => {
    if (!twoFactorEnabled()) return res.status(409).json({ error: 'two-step sign-in is off', code: 'not_enabled' });
    if (!(await requirePasswordOrCode(req, res, req.body || {}))) return;
    const codes = renewRecoveryCodes();
    logActivity('auth.2fa_codes_renewed', { req, level: 'warn' });
    res.json({ ok: true, recoveryCodes: codes });
  }));

  return r;
}
