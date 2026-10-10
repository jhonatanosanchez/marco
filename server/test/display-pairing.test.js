// Screen URLs in the admin (displayLinks.ts on top of screenUrl.ts), pairing codes in the admin (pairCode.ts), the
// display's pairing helpers (code length from /api/health, where to open the admin, the page after pairing) and the
// preview mode that leaves the browser's storage alone (identity.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../capabilities.js';
import { loadWebModules } from './webModules.js';

/** Run `fn` with browser globals for the display modules, restoring the previous ones afterwards. */
async function withBrowser({ url, storage = {} }, fn) {
  const saved = { location: globalThis.location, localStorage: globalThis.localStorage };
  const u = new URL(url);
  const data = new Map(Object.entries(storage));
  const writes = [];
  const ls = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { writes.push(['set', k]); data.set(k, String(v)); },
    removeItem: (k) => { writes.push(['remove', k]); data.delete(k); },
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  Object.defineProperty(globalThis, 'location', { value: { href: u.href, origin: u.origin, protocol: u.protocol, host: u.host, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
  try {
    return await fn({ data, writes });
  } finally {
    for (const [k, v] of Object.entries(saved)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
}

const cloudHealth = () => {
  const features = {};
  for (const k of FEATURE_KEYS) features[k] = true;
  for (const k of ['homeassistant', 'insecureTls', 'openDisplayAccess', 'passwordLogin', 'includeSecrets', 'setupWizard']) features[k] = false;
  return { ok: true, uptime: null, version: '1.0.0', edition: 'cloud', tenancy: 'multi', runtime: 'workers', pairCodeLength: 8, features, displayOrigin: 'https://tv.example.com' };
};

const KEY = '0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const saved = (displayAccess) => ({
  revision: 4,
  security: { displayAccess },
  screens: [
    { id: 's_main', slug: 'salon', name: 'Salón' },
    { id: 's_kitchen', slug: 'cocina', name: 'Cocina' },
  ],
});
const linksResponse = (extra = {}) => ({
  mode: 'private',
  links: [{ screenId: 's_kitchen', slug: 'cocina', name: 'Cocina', key: KEY, path: `/d/${KEY}`, createdAt: '2026-01-01T00:00:00Z' }],
  ...extra,
});

test('screen URLs: Marco Cloud, self-hosted private, self-hosted open, display origin', async () => {
  await withBrowser({ url: 'http://192.168.1.20:3000/admin/' }, async () => {
    const [capsMod, dl] = await loadWebModules('/web/admin/caps.ts', '/web/admin/displayLinks.ts');
    const ready = (data) => ({ data, settled: true });

    // self-hosted, private mode: the private link on this origin
    capsMod.setCaps(capsMod.capsFrom({ ok: true, version: '0.5.0', uptime: 1 }));
    assert.equal(dl.usesPrivateLinks(saved('private')), true);
    assert.equal(dl.screenHref(saved('private'), 's_kitchen', ready(linksResponse())), `http://192.168.1.20:3000/d/${KEY}`);
    assert.equal(dl.screenHref(saved('private'), 's_kitchen', ready(linksResponse()), { preview: true }), `http://192.168.1.20:3000/d/${KEY}?preview=1`);
    // links still loading: nothing to open yet (no flash of the wrong page in the preview)
    assert.equal(dl.screenHref(saved('private'), 's_kitchen', { data: null, settled: false }), null);
    // links failed: the address an admin session can open
    assert.equal(dl.screenHref(saved('private'), 's_kitchen', ready(null)), '/?screen=cocina');
    // a screen without a link in the response (just added): same fallback
    assert.equal(dl.screenHref(saved('private'), 's_main', ready(linksResponse())), '/?screen=salon');
    // unknown or unsaved screen
    assert.equal(dl.screenHref(saved('private'), 's_nope', ready(linksResponse())), null);

    // self-hosted, open mode: no links needed, /?screen=
    assert.equal(dl.usesPrivateLinks(saved('open')), false);
    assert.equal(dl.screenHref(saved('open'), 's_kitchen', { data: null, settled: false }), '/?screen=cocina');
    assert.equal(dl.screenHref(saved('open'), 's_kitchen', { data: null, settled: false }, { preview: true }), '/?screen=cocina&preview=1');

    // Marco Cloud: always private (open access is off), on the display origin from health
    capsMod.setCaps(capsMod.capsFrom(cloudHealth()));
    assert.equal(dl.usesPrivateLinks(saved('open')), true);
    assert.equal(dl.screenHref(saved('private'), 's_kitchen', ready(linksResponse()), { preview: true }), `https://tv.example.com/d/${KEY}?preview=1`);
    assert.equal(dl.screenHref(saved('private'), 's_kitchen', ready(linksResponse())), `https://tv.example.com/d/${KEY}`);

    // display origin only in the links response (health without it)
    const h = cloudHealth();
    delete h.displayOrigin;
    capsMod.setCaps(capsMod.capsFrom(h));
    assert.equal(dl.screenHref(saved('private'), 's_kitchen', ready(linksResponse({ displayOrigin: 'https://tv2.example.com' }))), `https://tv2.example.com/d/${KEY}`);
    assert.equal(dl.displayOriginOf(null), null);
  });
});

test('admin pairing codes follow pairCodeLength; claim answers from both servers', async () => {
  const [capsMod, pc] = await loadWebModules('/web/admin/caps.ts', '/web/admin/pairCode.ts');
  capsMod.setCaps(capsMod.capsFrom({ ok: true, version: '0.5.0', uptime: 1 }));
  assert.equal(pc.cleanCode('abc-23o4x9'), 'ABC234', 'self-hosted: 6 characters, O is not in the alphabet');
  assert.equal(pc.formatCode('ABC234'), 'ABC 234');
  assert.equal(pc.formatCode('AB'), 'AB');
  capsMod.setCaps(capsMod.capsFrom(cloudHealth()));
  assert.equal(pc.cleanCode('abcd 2345 6789'), 'ABCD2345', 'cloud: 8 characters');
  assert.equal(pc.formatCode('ABCD2345'), 'ABCD 2345');
  assert.equal(pc.cleanCode('abcd2345', 12), 'ABCD2345');
  // error code: self-hosted { error: message, code }, cloud { error: code }
  assert.equal(pc.claimErrorCode({ error: 'unknown or expired code', code: 'invalid_code' }), 'invalid_code');
  assert.equal(pc.claimErrorCode({ error: 'invalid_code' }), 'invalid_code');
  assert.equal(pc.claimErrorCode('HTTP 500'), '');
  assert.equal(pc.claimErrorCode(null), '');
  // where the waiting display is
  assert.equal(pc.confirmWhere({ where: '192.168.1.50', screenId: 's', screenName: 'x' }), '192.168.1.50');
  assert.equal(pc.confirmWhere({ where: '', screenId: 's', screenName: 'x' }), '');
  assert.equal(pc.confirmWhere({ country: 'PT', city: 'Porto', screenId: 's' }), 'Porto, PT');
  assert.equal(pc.confirmWhere({ country: null, city: null, screenId: 's' }), '');
});

test('display pairing: code length from health, where to open the admin, the page after pairing', async () => {
  await withBrowser({ url: 'http://localhost:3000/pair' }, async () => {
    const [p] = await loadWebModules('/web/display/widgets/pairing.ts');
    // pairCodeLength
    assert.equal(p.fmtCode('ABC234'), 'ABC 234');
    assert.equal(p.fmtCode('ABCD2345'), 'ABCD 2345');
    assert.equal(p.codePlaceholder(6), '··· ···');
    assert.equal(p.codePlaceholder(8), '···· ····');
    assert.equal(p.codePlaceholder(undefined), '··· ···');
    assert.equal(p.codePlaceholder(99), '······ ······');

    const loc = (u) => {
      const x = new URL(u);
      return { protocol: x.protocol, host: x.host, hostname: x.hostname, port: x.port, origin: x.origin, pathname: x.pathname, search: x.search };
    };
    // a kiosk on localhost: the LAN address from health, with this page's port
    assert.deepEqual(p.adminTarget({ lanAddresses: ['192.168.1.20'] }, loc('http://localhost:3000/pair')), { where: '192.168.1.20:3000/admin', url: 'http://192.168.1.20:3000/admin/' });
    assert.deepEqual(p.adminTarget({ lanAddresses: ['192.168.1.20'] }, loc('http://127.0.0.1/')), { where: '192.168.1.20/admin', url: 'http://192.168.1.20/admin/' });
    // nothing better than localhost: the generic text, the QR stays on this origin
    assert.deepEqual(p.adminTarget({}, loc('http://localhost:3000/')), { where: '', url: 'http://localhost:3000/admin/' });
    assert.equal(p.adminTarget({ lanAddresses: ['<b>'] }, loc('http://localhost:3000/')).where, '');
    // opened by its address: that address
    assert.deepEqual(p.adminTarget({ lanAddresses: ['10.0.0.1'] }, loc('http://marco.local:3000/')), { where: 'marco.local:3000/admin', url: 'http://marco.local:3000/admin/' });
    // display origin other than the admin's (Marco Cloud)
    assert.deepEqual(p.adminTarget({ adminOrigin: 'https://app.example.com' }, loc('https://tv.example.com/pair')), { where: 'app.example.com/admin', url: 'https://app.example.com/admin/' });
    assert.equal(p.adminTarget({ adminOrigin: 'javascript:alert(1)' }, loc('https://tv.example.com/pair')).url, 'https://tv.example.com/admin/');

    // after pairing: /pair stays /pair; a dead link continues at / (self-hosted) or /pair (other editions)
    assert.equal(p.afterPairUrl({}, { pathname: '/pair', search: '?client=kiosk-1&k=old' }), '/pair?client=kiosk-1');
    assert.equal(p.afterPairUrl({ edition: 'self-hosted' }, { pathname: `/d/${KEY}`, search: '' }), '/');
    assert.equal(p.afterPairUrl({}, { pathname: `/d/${KEY}`, search: '?lang=pt' }), '/?lang=pt');
    assert.equal(p.afterPairUrl({ edition: 'cloud' }, { pathname: `/d/${KEY}`, search: '' }), '/pair');
    assert.equal(p.afterPairUrl({ edition: 'self-hosted' }, { pathname: '/', search: '' }), '/');
  });
});

test('display preview (?preview=1) neither reads nor writes the stored key, device token or client id', async () => {
  const TOKEN = `md_${'A'.repeat(43)}`;
  const storage = { 'marco.deviceToken': TOKEN, 'cs.clientId': 'd_realdisplay', 'cs.cache._device.config': '{}', [`cs.cache.k_${KEY.slice(0, 6)}.config`]: '{"stale":true}' };

  // control: a real display reads the stored token and keeps its client id
  await withBrowser({ url: 'http://192.168.1.20:3000/', storage }, async ({ writes }) => {
    const [id] = await loadWebModules('/web/display/identity.ts');
    assert.equal(id.isPreview, false);
    assert.equal(id.credential, TOKEN);
    assert.equal(id.clientId, 'd_realdisplay');
    id.saveDeviceToken(`md_${'B'.repeat(43)}`);
    assert.deepEqual(writes, [['set', 'marco.deviceToken']]);
  });

  // preview of a private link in a browser where a real display runs
  await withBrowser({ url: `https://tv.example.com/d/${KEY}?preview=1&v=3`, storage }, async ({ data, writes }) => {
    const [id, store] = await loadWebModules('/web/display/identity.ts', '/web/display/store.ts');
    assert.equal(id.isPreview, true);
    assert.equal(id.credential, KEY);
    assert.notEqual(id.clientId, 'd_realdisplay');
    assert.equal(id.storedDeviceToken(), '');
    id.saveDeviceToken(`md_${'C'.repeat(43)}`);
    id.clearDeviceToken();
    id.clearCaches();
    store.saveCache('config', { x: 1 });
    assert.equal(store.loadCache('config'), null, 'no cached data read');
    assert.deepEqual(writes, [], 'nothing written or removed');
    assert.equal(data.get('marco.deviceToken'), TOKEN);
    assert.equal(data.get('cs.clientId'), 'd_realdisplay');
    assert.equal(data.get('cs.cache._device.config'), '{}');
  });

  // preview by slug (self-hosted admin session): the stored device token does not choose the screen
  await withBrowser({ url: 'http://192.168.1.20:3000/?preview=1&screen=cocina', storage }, async ({ writes }) => {
    const [id] = await loadWebModules('/web/display/identity.ts');
    assert.equal(id.credential, '');
    assert.equal(id.screenKey, 'cocina');
    assert.deepEqual(writes, []);
  });
});
