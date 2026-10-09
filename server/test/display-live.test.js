// Display live mode (web/display/live.ts, loaded through Node's TypeScript type stripping) and the server's
// /api/health `live` field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { publicRouter } from '../routes/public.js';
import { liveModeOf, detectLiveMode, startConfigPoll } from '../../web/display/live.ts';

test('health advertises live: sse', async () => {
  const app = express();
  app.use('/api', publicRouter({ version: '9.9.9' }));
  const srv = app.listen(0);
  try {
    await new Promise((r) => srv.once('listening', r));
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/health`);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.version, '9.9.9');
    assert.equal(j.live, 'sse');
    assert.equal(liveModeOf(j), 'sse');
  } finally {
    srv.close();
  }
});

test('live mode: only an explicit poll disables SSE', () => {
  assert.equal(liveModeOf({ ok: true, live: 'poll' }), 'poll');
  assert.equal(liveModeOf({ ok: true, live: 'sse' }), 'sse');
  assert.equal(liveModeOf({ ok: true }), 'sse');
  assert.equal(liveModeOf({ ok: true, live: 'other' }), 'sse');
  assert.equal(liveModeOf(null), 'sse');
});

test('detectLiveMode retries network errors and settles on SSE for HTTP errors', async () => {
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  let n = 0;
  const net = Object.assign(new Error('offline'), { status: 0 });
  const mode = await detectLiveMode({
    health: async () => { if (++n < 4) throw net; return { ok: true, live: 'poll' }; },
    answered: (e) => e.status > 0,
    wait,
  });
  assert.equal(mode, 'poll');
  assert.deepEqual(waits, [5000, 10000, 20000]);
  const http = Object.assign(new Error('404'), { status: 404 });
  assert.equal(await detectLiveMode({ health: async () => { throw http; }, answered: (e) => e.status > 0, wait }), 'sse');
  assert.equal(await detectLiveMode({ health: async () => { throw net; }, answered: () => false, cancelled: () => true, wait }), null);
});

test('config poll refetches data only when the revision changes', async () => {
  let rev = 1;
  let serverRev = 1;
  let ok = true;
  let changed = 0;
  const p = startConfigPoll({
    revision: () => rev,
    fetchConfig: async () => { if (!ok) return false; rev = serverRev; return true; },
    changed: () => changed++,
    intervalMs: 3_600_000,
  });
  try {
    await p.tick();
    assert.equal(changed, 0);
    serverRev = 2;
    await p.tick();
    assert.equal(changed, 1);
    await p.tick();
    assert.equal(changed, 1);
    // failed fetch (offline, or 401 / 403 handled by fetchConfig): nothing refetched
    serverRev = 3;
    ok = false;
    await p.tick();
    assert.equal(changed, 1);
    ok = true;
    p.close();
    await p.tick();
    assert.equal(changed, 1, 'closed poll does nothing');
  } finally {
    p.close();
  }
});
