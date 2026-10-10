// Admin capabilities (web/admin/caps.ts), the feature filters for the nav, palette and settings search
// (navFilter.ts), validation with features and limits (util.ts validateAll), the sign-in redirects
// (authRedirect.ts), screen URLs (screenUrl.ts) and the generated adminContract.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURE_KEYS, healthBody } from '../capabilities.js';
import { validateConfig as serverValidate } from '../core/validate.js';
import { CONTRACT_PATH, contractText, generateContract } from '../../scripts/gen-contract.mjs';
import { loadWebModules } from './webModules.js';

const [capsMod, nav, search, util, auth, urls] = await loadWebModules(
  '/web/admin/caps.ts',
  '/web/admin/navFilter.ts',
  '/web/admin/searchIndex.ts',
  '/web/admin/util.ts',
  '/web/admin/authRedirect.ts',
  '/web/admin/screenUrl.ts'
);
const { capsFrom, hasFeature, limitOf, setCaps } = capsMod;

/** The Marco Cloud health block as the plan sets it for the first cloud admin release. */
const cloudHealth = () => {
  const features = {};
  for (const k of FEATURE_KEYS) features[k] = true;
  for (const k of ['homeassistant', 'insecureTls', 'openDisplayAccess', 'passwordLogin', 'includeSecrets', 'setupWizard', 'news', 'gallery', 'apiTokens', 'webhooks', 'googleCalendar', 'googleLogin']) features[k] = false;
  return {
    ok: true,
    uptime: null,
    version: '1.0.0',
    live: 'poll',
    edition: 'cloud',
    tenancy: 'multi',
    runtime: 'workers',
    pairCodeLength: 8,
    features,
    limits: { screens: 6, sources: 10, devices: 12, photos: 500, newsFeeds: 5, apiTokens: 20, backups: 20, customCssBytes: 10240 },
    displayOrigin: 'https://tv.example.com',
  };
};
const selfHosted = () => capsFrom(healthBody({ version: '0.5.0', env: {} }));
const oldServer = () => capsFrom({ ok: true, uptime: 5, version: '0.4.0' });
const cloud = () => capsFrom(cloudHealth());

const baseConfig = () => ({ ...serverValidate({}).value, revision: 1 });

test('caps: old servers and self-hosted keep every feature on', () => {
  const old = oldServer();
  assert.equal(old.edition, 'self-hosted');
  assert.equal(old.features, null);
  for (const k of FEATURE_KEYS) assert.equal(hasFeature(old, k), true, k);
  assert.equal(old.pairCodeLength, 6);
  assert.equal(old.displayOrigin, null);

  const sh = capsFrom({ ok: true, uptime: 1, version: '0.5.0', edition: 'self-hosted', features: { news: true } });
  assert.equal(hasFeature(sh, 'gallery'), true, 'a missing key is on in self-hosted');
  const sh2 = capsFrom({ ok: true, uptime: 1, version: '0.5.0', edition: 'self-hosted', features: { news: false } });
  assert.equal(hasFeature(sh2, 'news'), false, 'an explicit false is off everywhere');
});

test('caps: cloud reads features, limits, pairing length and display origin', () => {
  const c = cloud();
  assert.equal(c.edition, 'cloud');
  assert.equal(c.runtime, 'workers');
  assert.equal(c.live, 'poll');
  assert.equal(c.pairCodeLength, 8);
  assert.equal(c.uptime, null);
  assert.equal(c.displayOrigin, 'https://tv.example.com');
  assert.equal(hasFeature(c, 'homeassistant'), false);
  assert.equal(hasFeature(c, 'activity'), true);
  const missing = capsFrom({ ...cloudHealth(), features: { news: true } });
  assert.equal(hasFeature(missing, 'gallery'), false, 'a missing key is off outside self-hosted');
  assert.equal(limitOf(c, 'screens'), 6);
  assert.equal(limitOf(c, 'devices'), 12);
  assert.equal(limitOf(c, 'birthdays'), 500, 'validator cap when the plan sets none');
  assert.equal(limitOf(selfHosted(), 'screens'), 12, 'self-hosted keeps the validator cap');
  assert.equal(limitOf(selfHosted(), 'photos'), null, 'no limit');
  // a plan limit never raises the validator cap
  assert.equal(limitOf(capsFrom({ ...cloudHealth(), limits: { screens: 50 } }), 'screens'), 12);
});

test('caps: odd health values fall back to safe defaults', () => {
  const c = capsFrom({ edition: 'cloud', pairCodeLength: 99, displayOrigin: 'javascript:alert(1)', limits: { screens: -1, sources: 'x' } });
  assert.equal(c.pairCodeLength, 6);
  assert.equal(c.displayOrigin, null);
  assert.deepEqual(c.limits, {});
  assert.equal(capsFrom({ displayOrigin: 'https://tv.example.com/some/path' }).displayOrigin, 'https://tv.example.com');
  assert.equal(capsFrom(null).edition, 'self-hosted');
});

test('caps: loadCaps keeps everything on when /api/health cannot be read', async () => {
  const c = await capsMod.loadCaps(async () => {
    throw new Error('network');
  });
  assert.equal(c.features, null);
  assert.equal(capsMod.has('news'), true);
  await capsMod.loadCaps(async () => cloudHealth());
  assert.equal(capsMod.has('news'), false);
  assert.equal(capsMod.atLimit('screens', 6), true);
  assert.equal(capsMod.atLimit('screens', 5), false);
  setCaps(capsFrom(null));
});

test('navFilter: cloud caps hide news, photos, Home Assistant and the API page', () => {
  const ids = nav.filterNav(nav.NAV_ITEMS, cloud()).map((n) => n.id);
  for (const hidden of ['news', 'photos', 'homeassistant', 'api']) assert.ok(!ids.includes(hidden), hidden);
  for (const shown of ['home', 'screen', 'calendars', 'alerts', 'displays', 'backups', 'activity', 'security', 'status']) assert.ok(ids.includes(shown), shown);
});

test('navFilter: self-hosted defaults and old servers show everything', () => {
  const all = nav.NAV_ITEMS.map((n) => n.id);
  assert.deepEqual(nav.filterNav(nav.NAV_ITEMS, selfHosted()).map((n) => n.id), all);
  assert.deepEqual(nav.filterNav(nav.NAV_ITEMS, oldServer()).map((n) => n.id), all);
  const routes = all;
  assert.equal(nav.filterSettings(search.SETTINGS_INDEX, oldServer(), routes).length, search.SETTINGS_INDEX.length);
  // without Google credentials a self-hosted admin still lists the Google entries (with the setup hint)
  assert.equal(nav.filterSettings(search.SETTINGS_INDEX, selfHosted(), routes).length, search.SETTINGS_INDEX.length);
  const actions = Object.keys(nav.ACTION_FEATURES).map((id) => ({ id }));
  assert.equal(nav.filterActions(actions, selfHosted()).length, actions.length);
});

test('navFilter: palette and settings search follow the features', () => {
  const c = cloud();
  const visible = nav.filterNav(nav.NAV_ITEMS, c).map((n) => n.id);
  const labels = nav.filterSettings(search.SETTINGS_INDEX, c, visible).map((s) => s.label);
  for (const gone of ['Cambiar contraseña', 'Emails de Google permitidos', 'Sensores de Home Assistant para el tiempo', 'Fuentes de noticias (RSS)', 'Tokens de API', 'Galería de fotos', 'Acceso a las pantallas', 'Cuentas de Google Calendar', 'Cerrar sesión en todos los dispositivos']) {
    assert.ok(!labels.includes(gone), gone);
  }
  assert.ok(labels.includes('CSS personalizado'));
  assert.ok(labels.includes('Exportar configuración'));
  for (const s of search.SETTINGS_INDEX) assert.ok(nav.NAV_ITEMS.some((n) => n.id === s.route), `unknown route ${s.route}`);

  const noCmds = capsFrom({ ...cloudHealth(), features: { ...cloudHealth().features, displayCommands: false } });
  const kept = nav.filterActions(['a-refresh', 'a-identify', 'a-night-on', 'a-pair', 'a-view'].map((id) => ({ id })), noCmds).map((a) => a.id);
  assert.deepEqual(kept, ['a-pair', 'a-view']);
  assert.equal(nav.routeFor('news', nav.filterNav(nav.NAV_ITEMS, c)), 'home');
  assert.equal(nav.routeFor('calendars', nav.filterNav(nav.NAV_ITEMS, c)), 'calendars');
});

test('validateAll: the password rule applies only with password login', () => {
  const cfg = baseConfig();
  cfg.auth = { ...cfg.auth, passwordLoginEnabled: false, allowedGoogleEmails: [] };
  assert.ok('auth.passwordLoginEnabled' in util.validateAll(cfg, selfHosted()).global);
  assert.ok('auth.passwordLoginEnabled' in util.validateAll(cfg, oldServer()).global);
  const r = util.validateAll(cfg, cloud());
  assert.ok(!('auth.passwordLoginEnabled' in r.global));
  assert.equal(r.total, 0, JSON.stringify(r));
});

test('validateAll: Home Assistant rules apply only with the feature', () => {
  const cfg = baseConfig();
  cfg.homeassistant = { ...cfg.homeassistant, enabled: true, url: 'not a url' };
  cfg.weather = { ...cfg.weather, enabled: true, provider: 'homeassistant', haWeatherEntity: '' };
  const sh = util.validateAll(cfg, selfHosted());
  assert.ok('homeassistant.url' in sh.global);
  assert.ok('weather.haWeatherEntity' in sh.global);
  const cl = util.validateAll(cfg, cloud());
  assert.ok(!('homeassistant.url' in cl.global));
  assert.ok(!('weather.haWeatherEntity' in cl.global));
});

test('validateAll: going over a limit is flagged', () => {
  const cfg = baseConfig();
  const screen = cfg.screens[0];
  cfg.screens = Array.from({ length: 7 }, (_, i) => ({ ...structuredClone(screen), id: `s_${i}`, slug: `screen-${i}`, name: `Screen ${i}` }));
  cfg.calendar.sources = Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, type: 'ics', name: `Cal ${i}`, url: `https://example.com/${i}.ics`, color: '#336699', emoji: '', kind: 'generic', enabled: true, refreshMin: 30 }));
  cfg.screens[0].screen.customCss = 'a{}'.repeat(4000);

  const cl = util.validateAll(cfg, cloud());
  assert.equal(cl.global['limit.screens'], util.LIMIT_EXCEEDED);
  assert.equal(cl.global['limit.sources'], util.LIMIT_EXCEEDED);
  assert.equal(cl.screens.s_0['screen.customCss'], util.LIMIT_EXCEEDED);
  assert.equal(util.sectionForError('limit.screens'), 'screens');
  assert.equal(util.sectionForError('limit.sources'), 'calendars');
  assert.equal(util.sectionForError('limit.newsFeeds'), 'news');

  const sh = util.validateAll(cfg, selfHosted());
  assert.ok(!('limit.screens' in sh.global), '7 screens are fine self-hosted');
  assert.ok(!('limit.sources' in sh.global));
  assert.ok(!('screen.customCss' in sh.screens.s_0), 'no CSS cap self-hosted');

  cfg.screens = Array.from({ length: 13 }, (_, i) => ({ ...structuredClone(screen), id: `s_${i}`, slug: `screen-${i}`, name: `Screen ${i}` }));
  assert.equal(util.validateAll(cfg, selfHosted()).global['limit.screens'], util.LIMIT_EXCEEDED, 'the validator cap applies everywhere');
});

test('authRedirect: account mode goes to the login page with next', () => {
  const me = { user: { email: 'a@example.com', name: 'A', method: 'account' }, googleConfigured: false, passwordLoginEnabled: false, account: { loginUrl: '/login', accountUrl: '/account', sessionsUrl: '/account/sessions', deleteUrl: '/account/delete', household: { name: 'Home', role: 'owner' } } };
  assert.equal(auth.authRedirect(me, cloud(), '/admin/#/calendars'), `/login?next=${encodeURIComponent('/admin/#/calendars')}`);
  assert.equal(auth.authRedirect({ user: null, googleConfigured: false, passwordLoginEnabled: false }, cloud(), '/admin/'), `/login?next=${encodeURIComponent('/admin/')}`);
  assert.equal(auth.authRedirect(me, cloud(), 'https://evil.example/admin/'), `/login?next=${encodeURIComponent('/admin/')}`);
  assert.equal(auth.authRedirect(me, cloud(), '/admin//evil.example'), `/login?next=${encodeURIComponent('/admin/')}`);
  assert.equal(auth.authRedirect({ user: null, googleConfigured: false, passwordLoginEnabled: true }, selfHosted(), '/admin/'), null);
  assert.equal(auth.logoutRedirect(me, cloud(), { ok: true, next: '/goodbye' }), '/goodbye');
  assert.equal(auth.logoutRedirect(me, cloud(), { next: '//evil.example' }), '/login');
  // browsers drop tabs and newlines in URLs, so these would become "//evil.example"
  assert.equal(auth.logoutRedirect(me, cloud(), { next: '/\t/evil.example' }), '/login');
  assert.equal(auth.logoutRedirect(me, cloud(), { next: '/\n/evil.example' }), '/login');
  assert.equal(auth.logoutRedirect(me, cloud(), { next: '/\\evil.example' }), '/login');
  assert.equal(auth.authRedirect(me, cloud(), '/admin/\t/x'), `/login?next=${encodeURIComponent('/admin/')}`);
  assert.equal(auth.logoutRedirect({ user: { email: '', name: '', method: 'password' }, googleConfigured: false, passwordLoginEnabled: true }, selfHosted(), {}), null);
});

test('screenUrl: private links, display origin and open mode', () => {
  const origin = 'http://marco.local:3000';
  assert.equal(urls.screenUrl({ slug: 'kitchen', origin }), '/?screen=kitchen');
  assert.equal(urls.screenUrl({ slug: 'kitchen', origin, preview: true }), '/?screen=kitchen&preview=1');
  assert.equal(urls.screenUrl({ slug: null, origin }), null);
  assert.equal(urls.screenUrl({ slug: 'kitchen', linkKey: 'k-1', origin }), `${origin}/d/k-1`);
  assert.equal(urls.screenUrl({ slug: 'kitchen', linkKey: 'k-1', origin, displayOrigin: 'https://tv.example.com/', preview: true }), 'https://tv.example.com/d/k-1?preview=1');
});

test('adminContract.json is up to date', () => {
  assert.equal(readFileSync(CONTRACT_PATH, 'utf8'), contractText(), 'run `npm run contract`');
});

test('adminContract.json: shape, features and account endpoints', () => {
  const c = generateContract();
  const seen = new Set();
  for (const e of c.endpoints) {
    const id = `${e.method} ${e.path}`;
    assert.ok(!seen.has(id), `duplicate ${id}`);
    seen.add(id);
    assert.match(e.method, /^(GET|POST|PUT|PATCH|DELETE)$/);
    assert.match(e.path, /^\/api\//);
    assert.ok(e.feature === null || FEATURE_KEYS.includes(e.feature), `${id}: unknown feature ${e.feature}`);
    assert.ok(Array.isArray(e.callers) && e.callers.length, id);
  }
  const get = (id) => c.endpoints.find((e) => `${e.method} ${e.path}` === id);
  assert.equal(get('GET /api/admin/config').request, null);
  assert.equal(get('PUT /api/admin/config').request, 'StoredConfig');
  assert.ok(get('GET /api/admin/config').responseKeys.includes('screens'));
  assert.ok(get('GET /api/health').responseKeys.includes('features?'));
  assert.equal(get('GET /api/admin/photos').feature, 'gallery');
  assert.equal(get('GET /api/admin/photos').responseArray, true);
  assert.equal(get('PUT /api/admin/password').feature, 'passwordLogin');
  assert.equal(get('POST /api/admin/pair/claim').feature, null);
  assert.equal(get('POST /api/account/lang').feature, 'accountMenu');
  assert.equal(get('PATCH /api/admin/household').feature, 'accountMenu');
  assert.deepEqual(get('GET /api/admin/google/calendars').query, ['account']);
  assert.ok(get('GET /api/admin/activity').query.includes('before'));
  assert.ok(get('GET /api/auth/me').responseKeys.includes('account?'));
});
