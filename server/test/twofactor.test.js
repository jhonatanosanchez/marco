// Two-step sign-in: TOTP against the RFC 6238 test vectors, recovery codes, and the real createApp for the setup,
// the sign-in challenge (no session before the code, expiry, attempts, replay, rate limits), sessions kept when it
// is turned on, turning it off, exports without the secret and the command-line way out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../store.js';
import { ensurePassword, hashPassword, _resetLoginLimits, GLOBAL_FAIL_LIMIT } from '../auth.js';
import { createApp } from '../app.js';
import { _resetActivityThrottle, listActivity } from '../activity.js';
import {
  base32Encode, base32Decode, hotp, totp, verifyTotp, stepAt, otpauthUri, newSecret, newRecoveryCodes, hashRecoveryCode,
  findRecoveryCode, normalizeRecoveryCode, STEP_SECONDS,
} from '../lib/totp.js';
import { startChallenge, challengeOf, dropAllChallenges, CHALLENGE_TTL_MS, CHALLENGE_ATTEMPTS, SETUP_TTL_MS, _challengeCount } from '../twofactor.js';
import { disableTwoFactorFile } from '../disable-2fa.js';

const PASSWORD = 'secret-pass-123';
const realFetch = globalThis.fetch;

// ---------------------------------------------------------------- TOTP and recovery codes

test('TOTP: the RFC 6238 appendix B test vectors (SHA-1, SHA-256, SHA-512, 8 digits)', () => {
  const seeds = {
    sha1: Buffer.from('12345678901234567890'),
    sha256: Buffer.from('12345678901234567890123456789012'),
    sha512: Buffer.from('1234567890123456789012345678901234567890123456789012345678901234'),
  };
  const vectors = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [sec, s1, s256, s512] of vectors) {
    assert.equal(totp(seeds.sha1, sec * 1000, { digits: 8, algorithm: 'sha1' }), s1, `sha1 @${sec}`);
    assert.equal(totp(seeds.sha256, sec * 1000, { digits: 8, algorithm: 'sha256' }), s256, `sha256 @${sec}`);
    assert.equal(totp(seeds.sha512, sec * 1000, { digits: 8, algorithm: 'sha512' }), s512, `sha512 @${sec}`);
  }
  // RFC 4226 appendix D (HOTP, 6 digits)
  const hotps = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  hotps.forEach((v, i) => assert.equal(hotp(seeds.sha1, i), v));
});

test('base32: RFC 4648 vectors, round trip, spaces and case ignored, garbage refused', () => {
  const vec = { f: 'MY', fo: 'MZXQ', foo: 'MZXW6', foob: 'MZXW6YQ', fooba: 'MZXW6YTB', foobar: 'MZXW6YTBOI' };
  for (const [plain, enc] of Object.entries(vec)) {
    assert.equal(base32Encode(Buffer.from(plain)), enc);
    assert.equal(base32Decode(enc).toString(), plain);
  }
  assert.equal(base32Decode('mzxw 6ytb-oi').toString(), 'foobar');
  assert.equal(base32Decode('MZXW1'), null);
  assert.equal(base32Decode(''), null);
  const s = newSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.equal(base32Decode(s).length, 20);
});

test('verifyTotp: one step of drift either way, never two; a used step and older ones are refused', () => {
  const secret = newSecret();
  const key = base32Decode(secret);
  const now = 1_760_000_000_000;
  const cur = stepAt(now);
  const at = (d) => totp(key, now + d * STEP_SECONDS * 1000);
  assert.equal(verifyTotp(secret, at(0), { now }), cur);
  assert.equal(verifyTotp(secret, at(-1), { now }), cur - 1);
  assert.equal(verifyTotp(secret, at(1), { now }), cur + 1);
  assert.equal(verifyTotp(secret, at(2), { now }), null);
  assert.equal(verifyTotp(secret, at(-2), { now }), null);
  // typed with a space in the middle
  assert.equal(verifyTotp(secret, `${at(0).slice(0, 3)} ${at(0).slice(3)}`, { now }), cur);
  // replay: the step just used, and anything before it
  assert.equal(verifyTotp(secret, at(0), { now, afterStep: cur }), null);
  assert.equal(verifyTotp(secret, at(-1), { now, afterStep: cur }), null);
  assert.equal(verifyTotp(secret, at(1), { now, afterStep: cur }), cur + 1);
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, 123456]) assert.equal(verifyTotp(secret, bad, { now }), null, String(bad));
});

test('otpauth URI: issuer, account, algorithm, digits and period', () => {
  const u = new URL(otpauthUri({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'Marco', account: 'admin@192.168.1.5' }));
  assert.equal(u.protocol, 'otpauth:');
  assert.equal(u.host, 'totp');
  assert.equal(decodeURIComponent(u.pathname), '/Marco:admin@192.168.1.5');
  assert.equal(u.searchParams.get('secret'), 'JBSWY3DPEHPK3PXP');
  assert.equal(u.searchParams.get('issuer'), 'Marco');
  assert.equal(u.searchParams.get('algorithm'), 'SHA1');
  assert.equal(u.searchParams.get('digits'), '6');
  assert.equal(u.searchParams.get('period'), '30');
});

test('recovery codes: 10 different ones, easy to copy, matched by hash in any typing', () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
  const hashes = codes.map(hashRecoveryCode);
  for (const h of hashes) assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(findRecoveryCode(hashes, codes[3]), 3);
  assert.equal(findRecoveryCode(hashes, ` ${codes[3].toUpperCase().replace('-', ' ')} `), 3);
  assert.equal(findRecoveryCode(hashes, 'aaaaa-aaaaa'), -1);
  assert.equal(findRecoveryCode(hashes, '123456'), -1);
  assert.equal(normalizeRecoveryCode('l0l0l-l0l0l'), null, 'no look-alike characters');
  assert.equal(findRecoveryCode(['not a hash', ...hashes], codes[0]), 1);
});

test('challenges: expire after 5 minutes and after 5 wrong codes; ids are random and unguessable', () => {
  dropAllChallenges();
  const now = Date.now();
  const id = startChallenge({ email: 'admin', method: 'password' }, now);
  assert.match(id, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(challengeOf(id, now + CHALLENGE_TTL_MS - 1));
  assert.equal(challengeOf(id, now + CHALLENGE_TTL_MS + 1), null);
  assert.equal(challengeOf(id, now), null, 'an expired challenge is gone for good');
  const id2 = startChallenge({ email: 'admin', method: 'password' }, now);
  challengeOf(id2, now).attempts = CHALLENGE_ATTEMPTS;
  assert.equal(challengeOf(id2, now), null);
  for (const bad of [undefined, null, '', 'x', `${id2}x`, 42]) assert.equal(challengeOf(bad, now), null);
  dropAllChallenges();
  assert.equal(_challengeCount(), 0);
});

// ---------------------------------------------------------------- the real app

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-2fa-'));
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ passwordHash: await hashPassword(PASSWORD), passwordIsDefault: false }));
  store.initStore(dir);
  _resetActivityThrottle();
  _resetLoginLimits();
  dropAllChallenges();
  await ensurePassword();
  const app = createApp({ version: '0.14.0', dist: path.join(dir, 'no-dist') });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { body, headers = {}, cookie = '' } = {}) => {
    const r = await realFetch(base + url, {
      method,
      headers: { ...headers, ...(cookie ? { cookie } : {}), ...(body !== undefined && !headers['content-type'] ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    const setCookie = r.headers.getSetCookie?.() || [];
    return { status: r.status, json, setCookie, cookie: setCookie.map((x) => x.split(';')[0]).join('; ') };
  };
  /** Sign in with the password; with two-step sign-in on, `code` (a function of nothing, or a string) finishes it. */
  const login = async ({ code, headers = {} } = {}) => {
    const r = await call('POST', '/api/auth/login', { body: { password: PASSWORD }, headers });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    if (!r.json.twoFactor) return r.cookie;
    assert.equal(r.json.user, undefined, 'no user before the code');
    const c = await call('POST', '/api/auth/2fa', { body: { code: typeof code === 'function' ? code() : code }, cookie: r.cookie, headers });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    return c.cookie;
  };
  try {
    await fn({ call, login, dir });
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
    _resetLoginLimits();
    dropAllChallenges();
  }
}

const codeAt = (secret, steps = 0) => totp(base32Decode(secret), Date.now() + steps * STEP_SECONDS * 1000);

/** Turn it on through the API from a fresh session. Returns { secret, recoveryCodes }. */
async function enable(call, cookie) {
  const s = await call('POST', '/api/admin/2fa/setup', { body: {}, cookie });
  assert.equal(s.status, 200, JSON.stringify(s.json));
  assert.match(s.json.secret, /^[A-Z2-7]{32}$/);
  assert.match(s.json.uri, /^otpauth:\/\/totp\/Marco:admin%40127\.0\.0\.1\?secret=/);
  const e = await call('POST', '/api/admin/2fa/enable', { body: { code: codeAt(s.json.secret) }, cookie });
  assert.equal(e.status, 200, JSON.stringify(e.json));
  assert.equal(e.json.recoveryCodes.length, 10);
  return { secret: s.json.secret, recoveryCodes: e.json.recoveryCodes };
}

/** Move every stored session's last password proof (and sign-in) back by `ms`. */
function ageSessions(ms) {
  store.updateSecrets((s) => { for (const rec of Object.values(s.sessions || {})) { rec.authAt = (rec.authAt ?? rec.iat) - ms; rec.iat -= ms; } });
}

test('setup: off by default; needs a recent sign-in or the password; a wrong code does not turn it on', async () => {
  await withServer(async ({ call, login }) => {
    const cookie = await login();
    assert.deepEqual((await call('GET', '/api/admin/2fa', { cookie })).json, { enabled: false, enabledAt: null, recoveryLeft: 0 });
    assert.equal((await call('GET', '/api/admin/2fa')).status, 401, 'signed out');
    assert.equal((await call('GET', '/api/auth/me', { cookie })).json.twoFactorPending, false);
    ageSessions(11 * 60_000);
    const late = await call('POST', '/api/admin/2fa/setup', { body: {}, cookie });
    assert.equal(late.status, 403);
    assert.equal(late.json.code, 'password_required');
    assert.equal((await call('POST', '/api/admin/2fa/setup', { body: { password: 'wrong-password-1' }, cookie })).json.code, 'password_incorrect');
    const s = await call('POST', '/api/admin/2fa/setup', { body: { password: PASSWORD }, cookie });
    assert.equal(s.status, 200);
    assert.equal(store.getSecrets().twoFactor, undefined, 'not on before the first code');
    assert.equal(store.getSecrets().twoFactorSetup.secret, s.json.secret);
    const wrong = await call('POST', '/api/admin/2fa/enable', { body: { code: codeAt(s.json.secret, 3) }, cookie });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json.code, 'code_invalid');
    assert.equal((await call('GET', '/api/admin/2fa', { cookie })).json.enabled, false);
    // too late: the setup expires
    store.updateSecrets((x) => { x.twoFactorSetup.createdAt -= SETUP_TTL_MS + 1000; });
    assert.equal((await call('POST', '/api/admin/2fa/enable', { body: { code: codeAt(s.json.secret) }, cookie })).status, 410);
    assert.equal((await call('POST', '/api/admin/2fa/enable', { body: { code: codeAt(s.json.secret) }, cookie })).status, 409, 'no setup any more');
  });
});

test('turning it on keeps every open session; new sign-ins need the code and have no session before it', async () => {
  await withServer(async ({ call, login }) => {
    const a = await login();
    const b = await login();
    const sessionsBefore = Object.keys(store.getSecrets().sessions).sort();
    const { secret } = await enable(call, a);
    assert.deepEqual(Object.keys(store.getSecrets().sessions).sort(), sessionsBefore, 'no session record was dropped');
    for (const cookie of [a, b]) assert.equal((await call('GET', '/api/admin/config', { cookie })).status, 200);
    const st = (await call('GET', '/api/admin/2fa', { cookie: a })).json;
    assert.equal(st.enabled, true);
    assert.equal(st.recoveryLeft, 10);
    assert.ok(Date.parse(st.enabledAt));

    // password right: a challenge, nothing more
    const r = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { twoFactor: true });
    const pending = r.cookie;
    assert.equal((await call('GET', '/api/admin/config', { cookie: pending })).status, 401);
    assert.equal((await call('GET', '/api/admin/2fa', { cookie: pending })).status, 401);
    assert.equal((await call('POST', '/api/admin/2fa/disable', { body: { password: PASSWORD }, cookie: pending })).status, 401);
    assert.equal((await call('POST', '/api/auth/logout-all', { cookie: pending })).status, 401);
    const me = (await call('GET', '/api/auth/me', { cookie: pending })).json;
    assert.equal(me.user, null);
    assert.equal(me.twoFactorPending, true);
    // wrong password: no challenge (and no hint that two-step sign-in is on)
    const bad = await call('POST', '/api/auth/login', { body: { password: 'nope-nope-nope' } });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.twoFactor, undefined);

    // the code used to turn it on cannot be used again
    const replay = await call('POST', '/api/auth/2fa', { body: { code: codeAt(secret, -1) }, cookie: pending });
    assert.equal(replay.status, 401);
    assert.equal(replay.json.code, 'code_invalid');
    assert.equal(replay.json.attemptsLeft, CHALLENGE_ATTEMPTS - 1);
    const next = codeAt(secret, 1);
    const ok = await call('POST', '/api/auth/2fa', { body: { code: next }, cookie: pending });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.user.method, 'password');
    assert.equal((await call('GET', '/api/admin/config', { cookie: ok.cookie })).status, 200);
    assert.equal((await call('GET', '/api/auth/me', { cookie: ok.cookie })).json.twoFactorPending, false);
    // the challenge is used up, and the same code does not open a second sign-in
    assert.equal((await call('POST', '/api/auth/2fa', { body: { code: next }, cookie: pending })).json.code, 'challenge_expired');
    const again = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    const replay2 = await call('POST', '/api/auth/2fa', { body: { code: next }, cookie: again.cookie });
    assert.equal(replay2.status, 401);
    assert.equal(replay2.json.code, 'code_invalid');

    const log = listActivity({ type: 'auth.', limit: 50 }).items.map((e) => e.type);
    assert.ok(log.includes('auth.2fa_enabled'));
    assert.ok(log.includes('auth.2fa_failed'));
    const signIn = listActivity({ type: 'auth.login', limit: 50 }).items.find((e) => e.type === 'auth.login' && e.data?.twoFactor);
    assert.equal(signIn.data.twoFactor, 'app');
    // the secret and the codes never reach the log
    assert.ok(!JSON.stringify(listActivity({ limit: 200 })).includes(secret));
  });
});

test('challenge: 5 wrong codes end it, a wrong code is never a session, no POST without a challenge', async () => {
  await withServer(async ({ call, login }) => {
    const { secret } = await enable(call, await login());
    assert.equal((await call('POST', '/api/auth/2fa', { body: { code: codeAt(secret) } })).json.code, 'challenge_expired', 'no challenge at all');
    const r = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    let last;
    for (let i = 1; i <= CHALLENGE_ATTEMPTS; i++) {
      _resetLoginLimits(); // the per-address limit is tested below; here only the challenge's own count
      last = await call('POST', '/api/auth/2fa', { body: { code: '000000' }, cookie: r.cookie });
      assert.equal(last.status, 401);
      assert.equal((await call('GET', '/api/admin/config', { cookie: last.cookie || r.cookie })).status, 401);
    }
    assert.equal(last.json.code, 'challenge_expired');
    _resetLoginLimits();
    const late = await call('POST', '/api/auth/2fa', { body: { code: codeAt(secret, 1) }, cookie: r.cookie });
    assert.equal(late.status, 401);
    assert.equal(late.json.code, 'challenge_expired', 'even the right code needs the password again');
  });
});

test('rate limits: wrong codes count per address and, from outside the LAN, toward the shared budget', async () => {
  await withServer(async ({ call, login }) => {
    const { secret } = await enable(call, await login());
    // per address: 5 wrong codes a minute, over several challenges
    const c1 = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/api/auth/2fa', { body: { code: '111111' }, cookie: c1.cookie })).status, 401);
    const c2 = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    assert.equal((await call('POST', '/api/auth/2fa', { body: { code: '111111' }, cookie: c2.cookie })).status, 401);
    const blocked = await call('POST', '/api/auth/2fa', { body: { code: codeAt(secret, 1) }, cookie: c2.cookie });
    assert.equal(blocked.status, 429, 'locked even with the right code');
    _resetLoginLimits();

    // shared budget: addresses outside the LAN (through the trusted loopback proxy) together
    const per = 5;
    let n = 0;
    for (let ip = 1; n < GLOBAL_FAIL_LIMIT; ip++) {
      const headers = { 'x-forwarded-for': `203.0.113.${ip}` };
      const ch = await call('POST', '/api/auth/login', { body: { password: PASSWORD }, headers });
      assert.equal(ch.status, 200, JSON.stringify(ch.json));
      for (let i = 0; i < per - 1 && n < GLOBAL_FAIL_LIMIT; i++, n++) {
        assert.equal((await call('POST', '/api/auth/2fa', { body: { code: '222222' }, cookie: ch.cookie, headers })).status, 401);
      }
    }
    const headers = { 'x-forwarded-for': '198.51.100.7' };
    const late = await call('POST', '/api/auth/login', { body: { password: PASSWORD }, headers });
    assert.equal(late.status, 429, 'password checks from outside are refused as well');
    // the LAN is never locked out by it
    assert.equal((await call('POST', '/api/auth/login', { body: { password: PASSWORD } })).json.twoFactor, true);
  });
});

test('recovery codes: each works once; new ones replace the old ones; the count goes down', async () => {
  await withServer(async ({ call, login }) => {
    const first = await login();
    const { recoveryCodes } = await enable(call, first);
    const r = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    const ok = await call('POST', '/api/auth/2fa', { body: { code: recoveryCodes[0].toUpperCase() }, cookie: r.cookie });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.recoveryLeft, 9);
    assert.equal((await call('GET', '/api/admin/2fa', { cookie: ok.cookie })).json.recoveryLeft, 9);
    const r2 = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    assert.equal((await call('POST', '/api/auth/2fa', { body: { code: recoveryCodes[0] }, cookie: r2.cookie })).status, 401, 'used up');
    const used = listActivity({ type: 'auth.login', limit: 20 }).items.find((e) => e.data?.twoFactor === 'recovery');
    assert.equal(used.level, 'warn');

    // new codes: password needed (a password session), then the old ones stop working
    assert.equal((await call('POST', '/api/admin/2fa/recovery-codes', { body: {}, cookie: ok.cookie })).json.code, 'password_required');
    const renewed = await call('POST', '/api/admin/2fa/recovery-codes', { body: { password: PASSWORD }, cookie: ok.cookie });
    assert.equal(renewed.status, 200);
    assert.equal(renewed.json.recoveryCodes.length, 10);
    assert.equal(renewed.json.recoveryCodes.filter((c) => recoveryCodes.includes(c)).length, 0);
    const r3 = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    assert.equal((await call('POST', '/api/auth/2fa', { body: { code: recoveryCodes[1] }, cookie: r3.cookie })).status, 401);
    assert.equal((await call('POST', '/api/auth/2fa', { body: { code: renewed.json.recoveryCodes[1] }, cookie: r3.cookie })).status, 200);
    assert.ok(listActivity({ type: 'auth.2fa_codes_renewed' }).items.length);
    // only hashes are stored
    const stored = JSON.stringify(store.getSecrets().twoFactor);
    for (const c of renewed.json.recoveryCodes) assert.ok(!stored.includes(c));
  });
});

test('turning it off: the password, or a code from a recent sign-in; no session ends', async () => {
  await withServer(async ({ call, login }) => {
    const a = await login();
    const { secret } = await enable(call, a);
    assert.equal((await call('POST', '/api/admin/2fa/disable', { body: {}, cookie: a })).json.code, 'password_required');
    assert.equal((await call('POST', '/api/admin/2fa/disable', { body: { password: 'wrong-password-1' }, cookie: a })).json.code, 'password_incorrect');
    assert.equal((await call('POST', '/api/admin/2fa/disable', { body: { code: '123456' }, cookie: a })).json.code, 'code_incorrect');
    ageSessions(11 * 60_000);
    const stale = await call('POST', '/api/admin/2fa/disable', { body: { code: codeAt(secret, 1) }, cookie: a });
    assert.equal(stale.status, 403);
    assert.equal(stale.json.code, 'reauth_required');
    assert.equal((await call('GET', '/api/admin/2fa', { cookie: a })).json.enabled, true);
    const b = await login({ code: () => codeAt(secret, 1) });
    const off = await call('POST', '/api/admin/2fa/disable', { body: { code: codeAt(secret, 1) }, cookie: b });
    // the code just used for the sign-in cannot turn it off as well
    assert.equal(off.json.code, 'code_incorrect');
    const off2 = await call('POST', '/api/admin/2fa/disable', { body: { password: PASSWORD }, cookie: b });
    assert.equal(off2.status, 200);
    assert.equal(store.getSecrets().twoFactor, undefined);
    for (const cookie of [a, b]) assert.equal((await call('GET', '/api/admin/config', { cookie })).status, 200);
    // the password alone signs in again
    const r = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    assert.equal(r.json.user.method, 'password');
    assert.ok(listActivity({ type: 'auth.2fa_disabled' }).items.length);
  });
});

test('a pending challenge ends when the password changes; exports never carry the secret', async () => {
  await withServer(async ({ call, login }) => {
    const a = await login();
    const { secret } = await enable(call, a);
    const r = await call('POST', '/api/auth/login', { body: { password: PASSWORD } });
    const changed = await call('PUT', '/api/admin/password', { body: { current: PASSWORD, next: 'another-pass-456' }, cookie: a });
    assert.equal(changed.status, 200);
    assert.equal((await call('POST', '/api/auth/2fa', { body: { code: codeAt(secret, 1) }, cookie: r.cookie })).json.code, 'challenge_expired');
    const ex = await call('POST', '/api/admin/export', { body: { includeSecrets: true }, cookie: changed.cookie });
    assert.equal(ex.status, 200, JSON.stringify(ex.json));
    assert.ok(ex.json.secrets?.passwordHash, 'secrets were exported');
    const text = JSON.stringify(ex.json);
    assert.ok(!text.includes(secret));
    assert.ok(!/twoFactor/.test(text));
    // and an import with secrets leaves it on
    const im = await call('POST', '/api/admin/import/apply', { body: { bundle: ex.json, includeSecrets: true }, cookie: changed.cookie });
    assert.equal(im.status, 200, JSON.stringify(im.json));
    assert.equal(store.getSecrets().twoFactor.secret, secret);
  });
});

test('CSRF guard and body rules on the new routes', async () => {
  await withServer(async ({ call, login }) => {
    const cookie = await login();
    const evil = { origin: 'http://evil.example' };
    assert.equal((await call('POST', '/api/admin/2fa/setup', { body: {}, cookie, headers: evil })).status, 403);
    assert.equal((await call('POST', '/api/auth/2fa', { body: { code: '123456' }, headers: evil })).status, 403);
    assert.equal((await call('POST', '/api/admin/2fa/disable', { body: { password: PASSWORD }, cookie, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    const form = await call('POST', '/api/auth/2fa', { body: 'code=123456', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(form.status, 415);
    const multipart = await call('POST', '/api/admin/2fa/enable', { body: '--x\r\n\r\n', cookie, headers: { 'content-type': 'multipart/form-data; boundary=x', 'x-requested-with': 'fetch' } });
    assert.equal(multipart.status, 415, 'multipart only where uploads are');
  });
});

test('locked out: server/disable-2fa.js turns it off in the data folder and logs it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marco-2fa-cli-'));
  try {
    const file = path.join(dir, 'secrets.json');
    fs.writeFileSync(file, JSON.stringify({ passwordHash: 'scrypt$a$b', twoFactor: { secret: 'JBSWY3DPEHPK3PXP', recovery: [] }, sessions: { k: { iat: 1 } } }));
    const r = disableTwoFactorFile(dir);
    assert.equal(r.ok, true);
    assert.equal(r.changed, true);
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(s.twoFactor, undefined);
    assert.equal(s.passwordHash, 'scrypt$a$b');
    assert.deepEqual(s.sessions, { k: { iat: 1 } });
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const line = JSON.parse(fs.readFileSync(path.join(dir, 'activity.jsonl'), 'utf8').trim());
    assert.equal(line.type, 'auth.2fa_disabled');
    assert.equal(disableTwoFactorFile(dir).changed, false);
    assert.equal(disableTwoFactorFile(path.join(dir, 'missing')).ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
