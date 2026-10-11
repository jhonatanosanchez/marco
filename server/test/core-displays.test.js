// SSE targeting, display registry + heartbeat validation, announcements, screen template.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import * as store from '../store.js';
import { defaultConfig, defaultScreenProfile } from '../core/defaults.js';
import { sseHandler, broadcast, closeAll, clientCount, reresolveClients } from '../sse.js';
import {
  streamInit, streamHello, onStreamOpen, onStreamClose, recordHeartbeat, sanitizeHeartbeat, listDisplays,
  forgetDisplay, runCommand, shortUserAgent, setServerVersion, flushDisplays, _resetDisplays, resolveScreenList,
  subscriptionFor, reresolveDisplays,
} from '../displays.js';
import { sanitizeAnnounce, createAnnouncement, listAnnouncements, clearAnnouncements, activeFor, _resetAnnouncements } from '../announce.js';
import { screenTemplate } from '../routes/screens.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-core-disp-'));
  const c = defaultConfig();
  c.calendar.sources = [];
  c.screens.push(defaultScreenProfile({ id: 's_cocina', slug: 'cocina', name: 'Cocina' }));
  c.screens.push(defaultScreenProfile({ id: 's_entrada', slug: 'entrada', name: 'Entrada' }));
  c.screens[2].alerts.enabled = false;
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(c));
  store.initStore(dir);
  _resetDisplays();
  _resetAnnouncements();
  setServerVersion('9.9.9');
  return dir;
}

/** Open a fake SSE connection through the real handler. Returns { events, close, client info }. */
function connect({ screen, client, ip = '192.168.1.20', ua = 'Mozilla/5.0 (X11; Linux aarch64) Chrome/128.0.0.0 Safari/537.36' } = {}) {
  const req = new EventEmitter();
  req.ip = ip;
  req.query = { ...(screen !== undefined ? { screen } : {}), ...(client !== undefined ? { client } : {}) };
  req.get = (h) => (h.toLowerCase() === 'user-agent' ? ua : undefined);
  const chunks = [];
  const res = { writeHead() {}, write(s) { chunks.push(s); return true; }, end() {} };
  sseHandler({ init: streamInit, hello: streamHello, onOpen: onStreamOpen, onClose: onStreamClose })(req, res);
  const events = () => chunks.join('').split('\n\n').filter((b) => b.startsWith('event:')).map((b) => {
    const [ev, data] = b.split('\n');
    return { event: ev.slice(7), data: JSON.parse(data.slice(6)) };
  });
  return { events, close: () => req.emit('close') };
}

test('sse: hello carries the resolved screen, clientId and server version; broadcast targets screens/clients', () => {
  const dir = setup();
  const a = connect({ screen: 'COCINA', client: 'kiosk-cocina' });
  const b = connect({ screen: 'nope', client: 'kiosk-salon' });
  const c = connect({}); // old build: no screen, no client
  const [ha] = a.events();
  assert.equal(ha.event, 'hello');
  assert.equal(ha.data.screenId, 's_cocina');
  assert.equal(ha.data.slug, 'cocina');
  assert.equal(ha.data.clientId, 'kiosk-cocina');
  assert.equal(ha.data.serverVersion, '9.9.9');
  assert.ok(Date.parse(ha.data.now));
  assert.equal(b.events()[0].data.screenId, ''); // unknown: no screen, never the default one
  assert.equal(broadcast('reload', {}, { screenIds: ['s_main'] }), 1); // only c (no ?screen= = default screen)
  assert.ok(!b.events().some((e) => e.event === 'reload'));
  assert.ok(!listDisplays().some((d) => d.clientId === 'kiosk-salon')); // not registered as a display
  assert.equal(c.events()[0].data.clientId, null);
  assert.equal(clientCount(), 3);

  assert.equal(broadcast('reload', {}, { screenIds: ['s_cocina'] }), 1);
  assert.equal(broadcast('reload', {}, { clientIds: ['kiosk-salon'] }), 1);
  assert.equal(broadcast('reload', {}, { screenIds: ['s_cocina'], clientIds: ['kiosk-salon'] }), 2);
  assert.equal(broadcast('config', { revision: 1 }), 3);
  assert.deepEqual(a.events().map((e) => e.event), ['hello', 'reload', 'reload', 'config']);
  assert.deepEqual(c.events().map((e) => e.event), ['hello', 'reload', 'config']);
  a.close(); b.close(); c.close();
  assert.equal(clientCount(), 0);
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('displays: registry from SSE + heartbeat, connected/offline, outdated, forget, kiosk restart dedupe, persistence', () => {
  const dir = setup();
  const s1 = connect({ screen: 'cocina', client: 'kiosk-cocina', ip: '10.0.0.5' });
  const r = recordHeartbeat({
    clientId: 'kiosk-cocina', screen: 'cocina', screenId: 's_cocina', version: '9.9.9', build: '2026-10-09T10:00:00Z',
    viewport: { w: 1920.4, h: 1080 }, screenRes: { w: 1920, h: 1080 }, dpr: 1.5, webgl: true, lite: false, night: false,
    nightOverride: 'auto', uptimeSec: 61.7, lastError: null, unknownKey: 'x',
  }, { ip: '10.0.0.5', get: () => 'UA' });
  assert.equal(r.ok, true);
  assert.equal(typeof r.revision, 'number');
  let [d] = listDisplays();
  assert.equal(d.clientId, 'kiosk-cocina');
  assert.equal(d.connected, true);
  assert.equal(d.screenSlug, 'cocina');
  assert.equal(d.screenName, 'Cocina');
  assert.deepEqual(d.viewport, { w: 1920, h: 1080 });
  assert.equal(d.dpr, 1.5);
  assert.equal(d.uptimeSec, 62);
  assert.equal(d.outdated, false);
  assert.ok(d.connectedAt);
  assert.equal(d.unknownKey, undefined);

  // a second, legacy display (no clientId) is listed as outdated
  const s2 = connect({});
  const legacy = listDisplays().find((x) => x.clientId.startsWith('anon-'));
  assert.equal(legacy.outdated, true);

  assert.equal(forgetDisplay('kiosk-cocina'), 'connected');
  s1.close();
  s2.close();
  d = listDisplays().find((x) => x.clientId === 'kiosk-cocina');
  assert.equal(d.connected, false);
  assert.equal(d.connectedAt, null);
  // the kiosk restarts with a new id on the same ip + screen → the offline entry is replaced
  const s3 = connect({ screen: 'cocina', client: 'kiosk-new', ip: '10.0.0.5' });
  assert.ok(!listDisplays().some((x) => x.clientId === 'kiosk-cocina'));
  assert.equal(listDisplays()[0].clientId, 'kiosk-new');
  s3.close();
  assert.equal(forgetDisplay('kiosk-new'), 'ok');
  assert.equal(forgetDisplay('kiosk-new'), 'not_found');
  // persisted (anonymous entries are not)
  connect({ screen: 'entrada', client: 'pi-entrada' }).close();
  flushDisplays();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'displays.json'), 'utf8'));
  assert.deepEqual(saved.map((x) => x.clientId), ['pi-entrada']);
  _resetDisplays();
  assert.equal(listDisplays()[0].clientId, 'pi-entrada');
  assert.equal(listDisplays()[0].connected, false);
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('heartbeat validation: clientId required, fields clamped, junk ignored', () => {
  assert.equal(sanitizeHeartbeat(null).ok, false);
  assert.equal(sanitizeHeartbeat([]).ok, false);
  assert.equal(sanitizeHeartbeat({ clientId: 'bad id' }).ok, false);
  assert.equal(sanitizeHeartbeat({ clientId: 'anon-3' }).ok, false);
  assert.equal(sanitizeHeartbeat({ clientId: 'x'.repeat(65) }).ok, false);
  const { value } = sanitizeHeartbeat({
    clientId: 'd_abc123xyz0', version: 'v'.repeat(500), viewport: { w: 'big', h: 3 }, screenRes: { w: 1e12, h: -5 },
    dpr: Infinity, webgl: 'yes', nightOverride: 'party', uptimeSec: -10, lastError: 'e'.repeat(1000), screen: 42,
  });
  assert.equal(value.version.length, 40);
  assert.equal(value.viewport, null);
  assert.deepEqual(value.screenRes, { w: 100000, h: 0 });
  assert.equal(value.dpr, null);
  assert.equal(value.webgl, null);
  assert.equal(value.nightOverride, null);
  assert.equal(value.uptimeSec, 0);
  assert.equal(value.lastError.length, 200);
  assert.equal(value.screen, '');
});

test('display commands: validation, targeting, identify payload per client', () => {
  const dir = setup();
  const a = connect({ screen: 'cocina', client: 'k1' });
  const b = connect({ screen: 'living-room', client: 'k2' });
  assert.equal(runCommand({ action: 'dance' }).status, 400);
  assert.equal(runCommand({ action: 'night' }).status, 400);
  assert.equal(runCommand({ action: 'reload', screens: ['nope'] }).status, 400);
  assert.equal(runCommand({ action: 'reload', clientIds: 'k1' }).status, 400);
  assert.equal(runCommand({ action: 'night', mode: 'on' }).delivered, 2);
  assert.equal(runCommand({ action: 'reload', screens: ['COCINA'] }).delivered, 1);
  assert.equal(runCommand({ action: 'identify', clientIds: ['k2'] }).delivered, 1);
  const id = b.events().find((e) => e.event === 'identify');
  assert.deepEqual(id.data, { name: 'Living room', slug: 'living-room', clientId: 'k2', durationSec: 10 });
  assert.deepEqual(a.events().map((e) => e.event), ['hello', 'night', 'reload']);
  assert.deepEqual(resolveScreenList(store.getConfig(), ['living-room', 's_cocina', 'LIVING-ROOM']).ids, ['s_main', 's_cocina']);
  a.close(); b.close();
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('announcements: validation, targeting, alerts.enabled filter, replay on connect, clear, persistence', () => {
  const dir = setup();
  const cfg = store.getConfig();
  const resolve = (k) => resolveScreenList(cfg, k);
  assert.equal(sanitizeAnnounce({}, resolve).ok, false);
  assert.equal(sanitizeAnnounce({ title: 'x', durationSec: 2 }, resolve).ok, false);
  assert.equal(sanitizeAnnounce({ title: 'x', style: 'loud' }, resolve).ok, false);
  assert.equal(sanitizeAnnounce({ title: 'x', screens: ['zzz'] }, resolve).ok, false);
  assert.equal(sanitizeAnnounce({ title: 'x'.repeat(121) }, resolve).ok, false);
  const ok = sanitizeAnnounce({ body: '  Cena lista  ', sound: true, screens: ['cocina'] }, resolve);
  assert.deepEqual(ok.value, { title: '', body: 'Cena lista', emoji: '', style: 'info', durationSec: 30, sound: true, screenIds: ['s_cocina'] });

  const salon = connect({ screen: 'living-room', client: 'k-salon' });
  const cocina = connect({ screen: 'cocina', client: 'k-cocina' });
  const entrada = connect({ screen: 'entrada', client: 'k-entrada' }); // alerts disabled
  const all = createAnnouncement(sanitizeAnnounce({ title: 'Para todos', durationSec: 60 }, resolve).value, { via: 'admin', by: 'admin' });
  assert.equal(all.delivered, 2); // entrada has alerts.enabled = false
  assert.match(all.announcement.id, /^a_/);
  assert.equal(Date.parse(all.announcement.expiresAt) - Date.parse(all.announcement.createdAt), 60_000);
  const one = createAnnouncement(ok.value, { via: 'hook', by: 'token:HA' });
  assert.equal(one.delivered, 1);
  assert.equal(cocina.events().filter((e) => e.event === 'announce').length, 2);
  assert.equal(salon.events().filter((e) => e.event === 'announce').length, 1);
  assert.equal(entrada.events().filter((e) => e.event === 'announce').length, 0);

  // replay on connect: only those targeting the client's screen
  const late = connect({ screen: 'cocina', client: 'k-late' });
  assert.deepEqual(late.events().filter((e) => e.event === 'announce').map((e) => e.data.id), [all.announcement.id, one.announcement.id]);
  const lateSalon = connect({ screen: 'living-room', client: 'k-late2' });
  assert.deepEqual(lateSalon.events().filter((e) => e.event === 'announce').map((e) => e.data.id), [all.announcement.id]);
  assert.equal(activeFor('s_entrada').length, 1); // targeted, but the screen filters it at delivery

  // persisted across restarts
  _resetAnnouncements();
  assert.equal(listAnnouncements().active.length, 2);
  assert.equal(listAnnouncements().active[0].id, one.announcement.id); // newest first

  assert.equal(clearAnnouncements(one.announcement.id).length, 1);
  const clr = salon.events().filter((e) => e.event === 'announce-clear');
  assert.deepEqual(clr.map((e) => e.data), [{ id: one.announcement.id }]);
  const l = listAnnouncements();
  assert.equal(l.active.length, 1);
  assert.equal(l.history[0].id, one.announcement.id);
  assert.ok(l.history[0].clearedAt);
  assert.equal(clearAnnouncements(null).length, 1);
  assert.deepEqual(salon.events().filter((e) => e.event === 'announce-clear').at(-1).data, { id: null });
  assert.equal(clearAnnouncements(null).length, 0);
  for (const c of [salon, cocina, entrada, late, lateSalon]) c.close();
  closeAll();
  _resetAnnouncements();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('announcements expire into the history', () => {
  const dir = setup();
  const past = new Date(Date.now() - 120_000);
  createAnnouncement({ title: 'Viejo', body: '', emoji: '', style: 'info', durationSec: 5, sound: false, screenIds: [] }, { via: 'admin', by: 'admin', now: past });
  const l = listAnnouncements();
  assert.equal(l.active.length, 0);
  assert.equal(l.history[0].title, 'Viejo');
  assert.equal(l.history[0].clearedAt, null);
  _resetAnnouncements();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('uaShort and screen template', () => {
  assert.equal(shortUserAgent('Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'), 'Chromium 128 · Linux aarch64');
  assert.equal(shortUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'), 'Edge 129 · Windows');
  assert.equal(shortUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari 17 · iOS');
  assert.equal(shortUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'), 'Firefox 131 · Linux x86_64');
  assert.equal(shortUserAgent(''), '');
  const cfg = defaultConfig();
  cfg.screens.push(defaultScreenProfile({ id: 's_c', slug: 'cocina', name: 'Cocina' }));
  const t = screenTemplate(cfg, '  Cocina ');
  assert.equal(t.slug, 'cocina-2');
  assert.equal(t.name, 'Cocina');
  assert.match(t.id, /^s_[0-9a-f]{10}$/);
  assert.equal(t.calendar.sourceIds, null);
  assert.equal(screenTemplate(cfg, '').name, 'Screen');
});

test('admin preview streams (?preview=1) get live events but are never registered as displays', () => {
  setup();
  const req = new EventEmitter();
  req.ip = '127.0.0.1';
  req.query = { screen: 'cocina', client: 'd_previewtest', preview: '1' };
  req.get = () => 'Mozilla/5.0 Chrome/128.0.0.0';
  const chunks = [];
  const res = { writeHead() {}, write(s) { chunks.push(s); return true; }, end() {} };
  sseHandler({ init: streamInit, hello: streamHello, onOpen: onStreamOpen, onClose: onStreamClose })(req, res);
  assert.equal(listDisplays().length, 0);
  assert.match(chunks.join(''), /"clientId":null/);
  // the preview gets the event but is not counted as a display reached (delivered counts = real screens)
  assert.equal(broadcast('config', { revision: 2 }, { screenIds: ['s_cocina'] }), 0);
  assert.match(chunks.join(''), /event: config/);
  const { delivered } = createAnnouncement({ title: 'Hola', body: '', emoji: '', style: 'info', durationSec: 60, sound: false, screenIds: [] }, { via: 'admin', by: 'test' });
  assert.equal(delivered, 0);
  assert.match(chunks.join(''), /event: announce/);
  req.emit('close');
  assert.equal(listDisplays().length, 0);
  closeAll();
});

test('screen deleted while displays are connected: their streams get reload and close, never the default screen', () => {
  const dir = setup();
  const a = connect({ screen: 'cocina', client: 'kiosk-cocina' });
  const b = connect({ screen: 'entrada', client: 'kiosk-entrada' });
  const cfg = structuredClone(store.getConfig());
  cfg.screens = cfg.screens.filter((x) => x.id !== 's_cocina');
  assert.deepEqual(subscriptionFor(cfg, 'cocina'), { screenId: '', memberIds: null, notFound: true });
  assert.deepEqual(subscriptionFor(cfg, ''), { screenId: 's_main', memberIds: null });
  reresolveClients((key) => subscriptionFor(cfg, key));
  reresolveDisplays(cfg);
  assert.deepEqual(a.events().map((e) => e.event), ['hello', 'reload']);
  assert.equal(clientCount(), 1);
  assert.equal(broadcast('reload', {}, { screenIds: ['s_main'] }), 0);
  assert.equal(listDisplays().find((d) => d.clientId === 'kiosk-cocina').screenId, 's_cocina'); // not moved to s_main
  assert.deepEqual(b.events().map((e) => e.event), ['hello']); // untouched
  a.close(); b.close();
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});
