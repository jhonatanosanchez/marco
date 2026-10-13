// GET /api/health capability block: edition, runtime, pairing code length and feature flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { publicRouter, onThisMachine } from '../routes/public.js';
import { FEATURE_KEYS, healthBody, liveMode, selfHostedFeatures } from '../capabilities.js';

async function getHealth() {
  const app = express();
  app.use('/api', publicRouter({ version: '9.9.9' }));
  const srv = app.listen(0);
  try {
    await new Promise((r) => srv.once('listening', r));
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/health`);
    assert.equal(r.status, 200);
    return await r.json();
  } finally {
    srv.close();
  }
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  const restore = () => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  return Promise.resolve().then(fn).finally(restore);
}

test('health has the capability block', async () => {
  const j = await withEnv({ MARCO_LIVE: undefined }, getHealth);
  assert.equal(j.ok, true);
  assert.equal(j.version, '9.9.9');
  assert.equal(typeof j.uptime, 'number');
  assert.equal(j.live, 'sse');
  assert.equal(j.edition, 'self-hosted');
  assert.equal(j.tenancy, 'single');
  assert.equal(j.runtime, 'node');
  assert.equal(j.pairCodeLength, 6);
  assert.equal('limits' in j, false, 'self-hosted has no limits');
  assert.equal('displayOrigin' in j, false, 'self-hosted serves displays from its own origin');
  assert.deepEqual(Object.keys(j.features).sort(), [...FEATURE_KEYS].sort());
  for (const k of FEATURE_KEYS) assert.equal(typeof j.features[k], 'boolean', k);
});

test('self-hosted features default to on, except Google without credentials, the account menu, Microsoft calendars and the feedback form', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined }, async () => {
    const { features } = await getHealth();
    for (const k of FEATURE_KEYS) {
      const expected = !['googleCalendar', 'googleLogin', 'accountMenu', 'accountSettings', 'microsoftCalendar', 'feedback'].includes(k);
      assert.equal(features[k], expected, k);
    }
  });
  await withEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }, () => {
    const f = selfHostedFeatures();
    assert.equal(f.googleCalendar, true);
    assert.equal(f.googleLogin, false, 'sign in with Google is off by default: home servers use their password');
    assert.equal(f.accountMenu, false);
    assert.equal(f.accountSettings, false, 'account settings belong to Marco Cloud accounts');
    assert.equal(f.feedback, false, 'the feedback form reaches Marco Cloud only');
    assert.equal(f.microsoftCalendar, false, 'Microsoft calendars need an Entra app of the server');
  });
  await withEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', MARCO_GOOGLE_LOGIN: '1' }, () => {
    assert.equal(selfHostedFeatures().googleLogin, true, 'MARCO_GOOGLE_LOGIN=1 turns it on');
  });
});

test('sign in with Google stays on for a server that relies on it', async () => {
  const { googleLoginEnabled } = await import('../google.js');
  await withEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', MARCO_GOOGLE_LOGIN: undefined }, () => {
    assert.equal(googleLoginEnabled({ auth: { passwordLoginEnabled: true, allowedGoogleEmails: ['a@example.com'] } }), false);
    assert.equal(googleLoginEnabled({ auth: { passwordLoginEnabled: false, allowedGoogleEmails: ['a@example.com'] } }), true);
    assert.equal(googleLoginEnabled({ auth: { passwordLoginEnabled: false, allowedGoogleEmails: [] } }), false);
  });
});

test('MARCO_LIVE=poll makes live poll', async () => {
  const j = await withEnv({ MARCO_LIVE: 'poll' }, getHealth);
  assert.equal(j.live, 'poll');
  assert.equal(liveMode({ MARCO_LIVE: ' POLL ' }), 'poll');
  assert.equal(liveMode({ MARCO_LIVE: 'sse' }), 'sse');
  assert.equal(liveMode({ MARCO_LIVE: 'websocket' }), 'sse');
  assert.equal(liveMode({}), 'sse');
  assert.equal(healthBody({ version: '1', env: { MARCO_LIVE: 'poll' } }).live, 'poll');
});

test('health lists the LAN addresses only for a client on this machine (kiosk on localhost)', async () => {
  const get = async (headers = {}) => {
    const app = express();
    app.use('/api', publicRouter({ version: '9.9.9' }));
    const srv = app.listen(0, '127.0.0.1');
    try {
      await new Promise((r) => srv.once('listening', r));
      return await (await fetch(`http://127.0.0.1:${srv.address().port}/api/health`, { headers })).json();
    } finally {
      srv.close();
    }
  };
  await withEnv({ LAN_ADDRESS: '192.0.2.10' }, async () => {
    assert.deepEqual((await get()).lanAddresses, ['192.0.2.10']);
    // relayed by a proxy that is not trusted: the real client is somewhere else
    assert.equal((await get({ 'x-forwarded-for': '203.0.113.7' })).lanAddresses, undefined);
  });
  assert.equal(onThisMachine({ ip: '192.168.1.5', headers: {}, get: () => 'localhost' }), false);
  assert.equal(onThisMachine({ ip: '::ffff:127.0.0.1', headers: {}, get: () => 'localhost:3000' }), true);
  // a host name that public DNS could point here (DNS rebinding)
  assert.equal(onThisMachine({ ip: '127.0.0.1', headers: {}, get: () => 'evil.example.com' }), false);
  assert.equal('lanAddresses' in healthBody({ version: '1', lanAddresses: [] }), false);
  assert.deepEqual(healthBody({ version: '1', lanAddresses: ['a', 'b', 'c', 'd'] }).lanAddresses, ['a', 'b', 'c']);
});
