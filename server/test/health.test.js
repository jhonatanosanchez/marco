// GET /api/health capability block: edition, runtime, pairing code length and feature flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { publicRouter } from '../routes/public.js';
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

test('self-hosted features default to on, except Google without credentials and the account menu', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined }, async () => {
    const { features } = await getHealth();
    for (const k of FEATURE_KEYS) {
      const expected = !['googleCalendar', 'googleLogin', 'accountMenu'].includes(k);
      assert.equal(features[k], expected, k);
    }
  });
  await withEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }, () => {
    const f = selfHostedFeatures();
    assert.equal(f.googleCalendar, true);
    assert.equal(f.googleLogin, true);
    assert.equal(f.accountMenu, false);
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
