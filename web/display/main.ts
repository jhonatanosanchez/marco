// Wall display entry point: wires config, data polling, SSE, the ticker, widgets and WebGL layers.
// Self-hosted fonts (bundled by Vite): the display must render with no Internet.
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import '../shared/emoji-font.css';
import './styles.css';
import type {
  Announcement, CountdownsResponse, DisplayConfig, EventsResponse, NewsResponse, NightCommand, WeatherResponse,
} from '../shared/types';
import { addDays, startOfWeek } from '../shared/i18n';
import { api, ApiError } from './api';
import { parseColor, toHex } from './color';
import { ctx, setCtxConfig } from './ctx';
import { normalizeConfig } from './defaults';
import { Heartbeat, noteError } from './heartbeat';
import { clearDeviceToken, clientId, credential, credentialKind, screenKey, storedDeviceToken } from './identity';
import { $ } from './dom';
import { type NEvent, normalizeEvents } from './eventModel';
import type { AmbientLayer } from './gl/ambientLayer';
import type { Engine } from './gl/engine';
import type { PhotoLayer } from './gl/photoLayer';
import type { PrecipLayer } from './gl/precipLayer';
import type { WeatherFxLayer } from './gl/weatherFxLayer';
import { precipOf, sunnyOf } from './icons';
import { mockAnnouncements, mockConfig, mockCountdowns, mockEvents, mockNews, mockPhotos, mockWeather } from './mock';
import { loadCache, on, saveCache, set, state } from './store';
import { detectLiveMode, startConfigPoll } from './live';
import { connectStream } from './stream';
import { current, onTick, setClockOffset, setTimezone, startTicker, type Tick } from './time';
import { Agenda } from './widgets/agenda';
import { Announcements, IdentifyOverlay, ScheduleBanners, setServerNow } from './widgets/alerts';
import { Countdowns } from './widgets/countdowns';
import { MonthCalendar } from './widgets/calendar';
import { Clock } from './widgets/clock';
import { renderMessage, renderTodo } from './widgets/extras';
import { Highlights } from './widgets/highlights';
import { News } from './widgets/news';
import { Photos } from './widgets/photos';
import { Weather } from './widgets/weather';
import { checkSetup, showWelcome, waitForSetup } from './widgets/welcome';
import { afterPairUrl, pairHealth, pairingLang, showPairing } from './widgets/pairing';
import { healthOnce, loadEmojiWebFont } from './health';

const params = ctx.params;
const forceDemo = params.get('demo') === '1';
const lite = ctx.lite;
if (lite) document.documentElement.classList.add('lite');

// ?now=2026-10-09T10:43 → fixed clock offset (for screenshots / testing)
const nowParam = params.get('now');
if (nowParam) {
  const target = Date.parse(nowParam);
  if (Number.isFinite(target)) setClockOffset(target - Date.now());
}

// ---------------------------------------------------------------------------------------------
// DOM + widgets
// ---------------------------------------------------------------------------------------------
const app = $('#app');
const photoArea = $('.photo-area');
const sideEl = $('.side');
const mainEl = $('.main');
const clock = new Clock($('#clock'));
const highlights = new Highlights($('#highlights'));
const weather = new Weather($('#weather'));
const calendar = new MonthCalendar($('#calendar'));
const agenda = new Agenda($('#agenda'), { days: 14 });
const sideAgenda = new Agenda($('#side-agenda'), { days: 3, compact: true, maxPerDay: 4 });
const news = new News($('#news'));
const photos = new Photos(photoArea, $('.photo-meta'));
const countdowns = new Countdowns($('#countdowns'), $('#cd-strip'));
const schedules = new ScheduleBanners($('#sched'), $('#sched-strip'));
const announcements = new Announcements($('#alerts'));
const identify = new IdentifyOverlay($('#identify'));
const screenNote = $('#screen-note');
const statusDot = $('#status');
const night = $('#night');
let customStyle: HTMLStyleElement | null = null;

let nEvents: NEvent[] = [];
let nEventsKey = '';

// ---------------------------------------------------------------------------------------------
// WebGL (optional, never fatal)
// ---------------------------------------------------------------------------------------------
let engine: Engine | null = null;
let photoLayer: PhotoLayer | null = null;
let ambient: AmbientLayer | null = null;
let precip: PrecipLayer | null = null;
let wxfx: WeatherFxLayer | null = null;

let glLoading: Promise<void> | null = null;
/** three.js is loaded lazily so ?lite=1 / no-WebGL screens never download or parse it. */
function initGL(): Promise<void> {
  if (engine || lite) return Promise.resolve();
  if (glLoading) return glLoading;
  glLoading = (async () => {
  try {
    const [{ Engine }, { PhotoLayer }, { PrecipLayer }, { AmbientLayer }, { WeatherFxLayer }] = await Promise.all([
      import('./gl/engine'), import('./gl/photoLayer'), import('./gl/precipLayer'), import('./gl/ambientLayer'), import('./gl/weatherFxLayer'),
    ]);
    engine = Engine.create($('#gl') as HTMLCanvasElement);
    if (!engine) throw new Error('no webgl2');
    photoLayer = new PhotoLayer(() => photoArea);
    precip = new PrecipLayer(() => photoArea);
    wxfx = new WeatherFxLayer(() => photoArea);
    wxfx.night = nightNow;
    ambient = new AmbientLayer(() => mainEl);
    engine.add(ambient);
    engine.add(photoLayer);
    engine.add(precip);
    engine.add(wxfx);
    engine.onLost = () => {
      disableGL();
      scheduleGLRetry();
    };
    photos.setGL(photoLayer);
    document.documentElement.classList.add('gl');
    engine.start();
  } catch (e) {
    console.warn('[gl] disabled', e);
    disableGL();
  }
  })();
  return glLoading;
}

// Context loss / frame failure after long uptime: retry with backoff on a fresh canvas instead of staying
// in DOM-only mode until a manual reload.
let glRetries = 0;
let glRetryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleGLRetry(): void {
  if (glRetryTimer || glRetries >= 6) return;
  const delay = Math.min(30_000 * 2 ** glRetries, 30 * 60_000);
  glRetries++;
  glRetryTimer = setTimeout(() => {
    glRetryTimer = null;
    const old = document.getElementById('gl');
    if (old) old.replaceWith(old.cloneNode(false)); // a lost context stays bound to its canvas
    glLoading = null;
    glFailed = false;
    if (state.config) applyConfig(state.config);
  }, delay);
}

function disableGL(): void {
  try {
    engine?.dispose();
  } catch { /* ignore */ }
  engine = null;
  photoLayer = null;
  ambient = null;
  precip = null;
  wxfx = null;
  document.documentElement.classList.remove('gl', 'gl-ambient');
  photos.setGL(null);
  photos.applyConfig();
}

// ---------------------------------------------------------------------------------------------
// Config application
// ---------------------------------------------------------------------------------------------
function hueShift(hex: string, deg: number): string {
  const [r, g, b] = parseColor(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

function effectivePreset(cfg: DisplayConfig): string {
  const p = params.get('preset') || cfg.layout.preset;
  return ['bigCalendar', 'leftRight', 'topBottom', 'bigTime', 'agenda'].includes(p) ? p : 'bigCalendar';
}

function isPortrait(cfg: DisplayConfig): boolean {
  const o = cfg.screen.orientation;
  if (o === 'portrait') return true;
  if (o === 'landscape') return false;
  return window.innerHeight > window.innerWidth * 1.05;
}

function applyLayout(): void {
  const cfg = ctx.cfg;
  const preset = effectivePreset(cfg);
  const portrait = isPortrait(cfg);
  const side = params.get('side') || cfg.layout.sidePanel;
  app.className = [
    `preset-${preset}`, `side-${side === 'right' ? 'right' : 'left'}`, portrait ? 'portrait' : 'landscape',
    cfg.background.enabled ? 'has-photo' : 'no-photo',
  ].join(' ');
  const view = params.get('view') || cfg.calendar.view;
  const showAgendaMain = preset === 'agenda' || view === 'agenda';
  app.classList.toggle('view-agenda', showAgendaMain);
  app.classList.toggle('cal-off', !cfg.calendar.enabled);
  engine?.invalidate();
}

function applyConfig(raw: DisplayConfig): void {
  const cfg = normalizeConfig(raw);
  const v = params.get('view');
  if (v === 'month' || v === 'agenda' || v === 'week') cfg.calendar.view = v;
  // URL overrides (handy for testing a screen without touching the saved config)
  const pc = params.get('clock');
  if (pc === 'analog' || pc === 'digital') cfg.datetime.clock = pc;
  const pt = params.get('theme');
  if (pt === 'light' || pt === 'dark') cfg.screen.theme = pt;
  const pa = params.get('ambient');
  if (pa === 'aurora' || pa === 'particles' || pa === 'none') cfg.background.ambient = pa;
  const ptr = params.get('transition');
  if (ptr === 'webgl' || ptr === 'fade' || ptr === 'none') cfg.background.transition = ptr;
  const pfx = params.get('wxfx');
  if (pfx === 'off' || pfx === 'simple' || pfx === 'rich') cfg.background.weatherFx = pfx;
  // the top-bottom preset has a shorter calendar: cap the number of week rows so chips stay readable
  if (effectivePreset(cfg) === 'topBottom') cfg.calendar.weeks = Math.min(cfg.calendar.weeks, 4);
  // Small landscape screens (e.g. 1280×720 on the Pi): one week fewer so text can be bigger.
  if (window.innerWidth > window.innerHeight && window.innerHeight <= 820) cfg.calendar.weeks = Math.min(cfg.calendar.weeks, 4);
  setCtxConfig(cfg);
  setTimezone(ctx.tz);
  const root = document.documentElement;
  root.lang = ctx.lang;
  const accent = cfg.screen.accent;
  const light = cfg.screen.theme === 'light';
  root.classList.toggle('theme-light', light);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', parseColor(accent).join(' '));
  root.style.setProperty('--fs', String(cfg.screen.fontScale));
  root.style.setProperty('--panel-blur', String(cfg.background.panelBlur ?? 18));
  root.style.setProperty('--panel-shade', String((cfg.background.panelShade ?? 0.5) * 2));
  root.style.setProperty('--side-w', `${(cfg.layout.sideWidth * 100).toFixed(2)}%`);

  if (cfg.screen.customCss) {
    if (!customStyle) {
      customStyle = document.createElement('style');
      customStyle.id = 'custom-css';
      document.head.appendChild(customStyle);
    }
    if (customStyle.textContent !== cfg.screen.customCss) customStyle.textContent = cfg.screen.customCss;
  } else if (customStyle) customStyle.textContent = '';

  applyLayout();

  // WebGL needs
  const preset = effectivePreset(cfg);
  const wantAmbient = !lite && cfg.background.ambient !== 'none' && (preset === 'bigCalendar' || preset === 'agenda' || preset === 'topBottom');
  const wantGLPhoto = !lite && cfg.background.enabled && cfg.background.transition === 'webgl';
  if ((wantAmbient || wantGLPhoto) && !engine && !glFailed) {
    void initGL().then(() => {
      if (engine) applyGL(wantAmbient, accent, light);
      else glFailed = true;
      photos.applyConfig();
      renderWeather(current());
    });
  }
  applyGL(wantAmbient, accent, light);
  photos.applyConfig();

  announcements.applyConfig(cfg);
  renderScreenNote(raw);
  renderAll();
  app.classList.remove('booting');
}

/** Small unobtrusive notice when ?screen= did not match any screen (the default one is shown instead). */
function renderScreenNote(raw: DisplayConfig): void {
  const show = !!raw.screenFallback && !!screenKey && !state.demo;
  screenNote.textContent = show ? ctx.t('screenNotFound', { s: screenKey }) : '';
  screenNote.classList.toggle('show', show);
}

let glFailed = false;
function applyGL(wantAmbient: boolean, accent: string, light: boolean): void {
  const cfg = ctx.cfg;
  const root = document.documentElement;
  if (engine) {
    const bg = light ? '#f4f2ee' : '#000000';
    engine.setClearColor(bg);
    if (ambient) {
      ambient.mode = wantAmbient ? cfg.background.ambient : 'none';
      ambient.setColors(accent, hueShift(accent, 165), bg, light);
    }
    root.classList.toggle('gl-ambient', wantAmbient);
    const fx = cfg.background.weatherFx ?? 'simple';
    if (precip) precip.enabled = cfg.background.enabled && fx === 'simple';
    // the drops refract the GL photo, so only with the WebGL transition (a DOM photo would cover the canvas)
    if (wxfx) wxfx.enabled = cfg.background.enabled && fx === 'rich' && cfg.background.transition === 'webgl';
  }
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------
function eventsNormalized(): NEvent[] {
  const ev = state.events;
  const key = `${ev?.hash}|${ev?.generatedAt}|${ctx.tz}`;
  if (key !== nEventsKey) {
    nEventsKey = key;
    nEvents = normalizeEvents(ev?.events ?? [], ctx.tz);
  }
  return nEvents;
}

function renderCalendar(tick: Tick): void {
  const evs = eventsNormalized();
  const cfg = ctx.cfg;
  const preset = effectivePreset(cfg);
  if (!cfg.calendar.enabled) return;
  if (app.classList.contains('view-agenda')) agenda.render(evs, tick);
  else calendar.render(evs, tick);
  if (preset === 'leftRight' || preset === 'bigTime') sideAgenda.render(evs, tick);
  highlights.render(evs, tick);
}

function renderCountdowns(tick: Tick): void {
  // birthdays already shown today as a highlight pill are not repeated as a "¡Hoy!" countdown chip
  const today = tick.dayKey;
  const shown = new Set(
    eventsNormalized()
      .filter((e) => e.allDay && e.ev.kind === 'birthdays' && e.startKey <= today && e.lastKey >= today)
      .map((e) => e.title),
  );
  countdowns.render(state.countdowns, today, shown);
}

function renderWeather(tick: Tick): void {
  weather.render(state.weather, tick.dayKey);
  const cur = ctx.cfg.weather.enabled ? state.weather?.current : undefined;
  const pm = cur ? precipOf(cur.code) : null;
  if (precip) precip.mode = pm;
  if (wxfx) wxfx.mode = pm ?? (cur && sunnyOf(cur.code, cur.isDay) ? 'sun' : null);
}

function renderAll(): void {
  const tick = current();
  clock.update(tick);
  renderCalendar(tick);
  renderWeather(tick);
  news.setData(state.news);
  renderMessage($('#message'));
  renderTodo($('#todo'));
  renderCountdowns(tick);
  schedules.render(tick);
  updateNight(tick);
  fitSide();
}

/**
 * Progressively drop secondary side-panel content until everything fits without clipping:
 * hourly strip → countdown chips one by one (keeps the nearest) → extra pills / done to-dos → whole mid area.
 */
const FIT_STEPS = ['fit-1', 'fit-2', 'fit-3'];
function fitSide(): void {
  fitSideContent();
  photos.reframe(); // what's left uncovered of the photo may have changed
}
function fitSideContent(): void {
  const mid = sideEl.querySelector('.side-mid') as HTMLElement;
  const cdChips = Array.from(document.querySelectorAll<HTMLElement>('#countdowns > .cd'));
  const overflowing = () => {
    const midHasContent = Array.from(mid.children).some((c) => (c as HTMLElement).style.display !== 'none' && (c as HTMLElement).offsetHeight > 0);
    // bigTime fades its mid column out with a mask: overflowing there is by design (agenda simply fades out)
    const midMasked = app.classList.contains('preset-bigTime');
    return sideEl.scrollHeight > sideEl.clientHeight + 2 || (!midMasked && midHasContent && mid.scrollHeight > mid.clientHeight + 2);
  };
  app.classList.remove(...FIT_STEPS);
  for (const c of cdChips) c.classList.remove('fit-hide');
  fitStrip();
  if (!overflowing()) return;
  app.classList.add('fit-1');
  for (let i = cdChips.length - 1; i >= 1 && overflowing(); i--) cdChips[i].classList.add('fit-hide');
  if (!overflowing()) return;
  for (const step of FIT_STEPS.slice(1)) {
    app.classList.add(step);
    if (!overflowing()) break;
  }
}

/** One-line strip of scheduled banners + countdown chips (topBottom): drop what does not fit entirely. */
function fitStrip(): void {
  const strip = document.querySelector('.main-strip') as HTMLElement | null;
  if (!strip || !strip.offsetWidth) return;
  const chips = Array.from(strip.querySelectorAll<HTMLElement>('.sched, .cd'));
  for (const c of chips) c.classList.remove('fit-hide');
  const maxRight = strip.getBoundingClientRect().right + 1;
  let hide = false;
  for (const c of chips) {
    if (!hide && c.getBoundingClientRect().right > maxRight) hide = true;
    if (hide) c.classList.add('fit-hide');
  }
}

function hmToMin(s: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  return m ? +m[1] * 60 + +m[2] : -1;
}

// Night command (§5.6): 'on'/'off' override the automatic state until it next changes by itself (or 'auto').
let nightOverride: NightCommand = 'auto';
let overrideBase: boolean | null = null;
let nightNow = false;

function autoNight(tick: Tick): boolean {
  const nm = ctx.cfg.screen.nightMode;
  let on = false;
  if (nm.enabled) {
    const f = hmToMin(nm.from), t = hmToMin(nm.to);
    const n = tick.parts.hour * 60 + tick.parts.minute;
    if (f >= 0 && t >= 0 && f !== t) on = f < t ? n >= f && n < t : n >= f || n < t;
  }
  if (params.get('night') === '1') on = true;
  return on;
}

function setNightCommand(mode: NightCommand): void {
  nightOverride = mode;
  overrideBase = mode === 'auto' ? null : autoNight(current());
  updateNight(current());
}

function updateNight(tick: Tick): void {
  const nm = ctx.cfg.screen.nightMode;
  const auto = autoNight(tick);
  if (nightOverride !== 'auto' && overrideBase !== null && auto !== overrideBase) {
    nightOverride = 'auto'; // the schedule moved on: hand control back to it
    overrideBase = null;
    heartbeat.soon();
  }
  const on = nightOverride === 'on' ? true : nightOverride === 'off' ? false : auto;
  nightNow = on;
  const dim = Number.isFinite(nm.dim) ? nm.dim : 0.35;
  night.style.opacity = on ? String(Math.min(0.95, Math.max(0, 1 - dim))) : '0';
  document.documentElement.classList.toggle('night', on);
  if (engine) engine.fps = on ? 15 : 30;
  if (wxfx) wxfx.night = on;
}

function setOnline(ok: boolean): void {
  set('online', ok);
  statusDot.classList.toggle('show', !ok && !state.demo);
}

// ---------------------------------------------------------------------------------------------
// Display access (private links / paired devices): 401 → pairing screen, 403 → "link no longer valid"
// ---------------------------------------------------------------------------------------------
let accessDenied = false;
let liveStream: { close(): void } | null = null;

/** Stop everything, forget cached data and show the pairing / invalid-link screen (no family data). */
function denyAccess(status: number): void {
  if (accessDenied || state.demo) return;
  accessDenied = true;
  // A dead private link (kiosk URL) but this browser was paired since: use the device token instead.
  // Marco Cloud continues at /pair, where "/" is not the display (pairing.ts afterPairUrl).
  if (status === 403 && credentialKind === 'key' && storedDeviceToken()) {
    void pairHealth().then((h) => location.replace(afterPairUrl(h)));
    return;
  }
  if (status === 403 && credentialKind === 'device') clearDeviceToken();
  intervals.forEach(clearInterval);
  intervals.length = 0;
  liveStream?.close();
  heartbeat.stop();
  // keep the language the screen was showing; the browser's language may differ
  const deniedLang = state.config ? ctx.lang : pairingLang(params);
  for (const k of ['config', 'events', 'weather', 'news', 'photos', 'countdowns'] as const) state[k] = null;
  showPairing(status === 403 ? 'invalid' : 'pair', deniedLang);
}

/** True (and the access screen shown) when `e` is a 401 / 403 from the display API. */
function deniedBy(e: unknown): boolean {
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
    denyAccess(e.status);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------
function eventsRange(): [string, string] {
  const today = current().dayKey;
  const from = startOfWeek(today, ctx.cfg.calendar.weekStart);
  const to = addDays(from, Math.max(ctx.cfg.calendar.weeks * 7, 21) + 1);
  return [from, to];
}

async function fetchEvents(): Promise<void> {
  if (state.demo) {
    const m = mockEvents(current().now);
    if (state.events?.hash !== m.hash) set('events', m);
    return;
  }
  try {
    const [from, to] = eventsRange();
    const r = await api.events(from, to);
    setOnline(true);
    if (r.errors?.length) console.warn('[events] source errors', r.errors);
    if (!state.events || state.events.hash !== r.hash) {
      set('events', r);
      saveCache('events', r);
    }
  } catch (e) {
    if (deniedBy(e)) return;
    console.warn('[events]', (e as Error).message);
    setOnline(false);
  }
}

async function fetchWeather(): Promise<void> {
  if (state.demo) {
    const w = mockWeather(current().now, params.get('wx'));
    return set('weather', w);
  }
  try {
    const r = await api.weather();
    set('weather', r);
    saveCache('weather', r);
  } catch (e) {
    if (deniedBy(e)) return;
    console.warn('[weather]', (e as Error).message);
  }
}

async function fetchNews(): Promise<void> {
  if (state.demo) return set('news', mockNews());
  try {
    const r = await api.news();
    set('news', r);
    saveCache('news', r);
  } catch (e) {
    if (deniedBy(e)) return;
    console.warn('[news]', (e as Error).message);
  }
}

async function fetchPhotos(): Promise<void> {
  if (state.demo) return set('photos', mockPhotos());
  try {
    set('photos', await api.photos(20, photos.lastGalleryFile));
  } catch (e) {
    if (deniedBy(e)) return;
    console.warn('[photos]', (e as Error).message);
    if (!state.photos) set('photos', mockPhotos());
  }
}

async function fetchCountdowns(): Promise<void> {
  if (state.demo) return set('countdowns', mockCountdowns(current().now));
  try {
    const r = await api.countdowns();
    if (!state.countdowns || state.countdowns.hash !== r.hash || state.countdowns.today !== r.today) {
      set('countdowns', r);
      saveCache('countdowns', r);
    }
  } catch (e) {
    if (deniedBy(e)) return;
    // older server without /api/countdowns (404) or offline: keep what we have
    console.warn('[countdowns]', (e as Error).message);
  }
}

async function fetchConfig(): Promise<boolean> {
  try {
    const c = await api.config();
    setOnline(true);
    saveCache('config', c);
    set('config', c);
    return true;
  } catch (e) {
    if (deniedBy(e)) return false;
    console.warn('[config]', (e as Error).message);
    setOnline(false);
    return false;
  }
}

let photoSig = '';
on('config', (s) => {
  if (!s.config) return;
  applyConfig(s.config);
  // photo source changed in the admin → fetch a fresh list right away
  const b = ctx.cfg.background;
  const sig = `${b.enabled}|${b.source}|${b.stockTopic}|${b.order ?? 'random'}`;
  if (photoSig && sig !== photoSig) void fetchPhotos();
  photoSig = sig;
});
on('events', () => {
  renderCalendar(current());
  renderCountdowns(current());
  fitSide();
});
on('weather', () => {
  renderWeather(current());
  fitSide();
});
on('news', (s) => news.setData(s.news));
on('countdowns', () => {
  renderCountdowns(current());
  fitSide();
});
on('photos', (s) => s.photos && photos.setList(s.photos.photos || []));
photos.onExhausted = () => fetchPhotos();

// ---------------------------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------------------------
const intervals: ReturnType<typeof setInterval>[] = [];
function startPolling(): void {
  intervals.forEach(clearInterval);
  intervals.length = 0;
  intervals.push(setInterval(fetchEvents, 60_000));
  intervals.push(setInterval(fetchWeather, 10 * 60_000));
  intervals.push(setInterval(fetchNews, 15 * 60_000));
  intervals.push(setInterval(fetchPhotos, 60 * 60_000));
  intervals.push(setInterval(fetchCountdowns, 30 * 60_000));
}

onTick((tick) => {
  clock.update(tick);
  if (tick.minuteChanged) {
    renderCalendar(tick);
    renderWeather(tick);
    renderCountdowns(tick);
    schedules.render(tick);
    updateNight(tick);
    fitSide();
  }
  if (tick.dayChanged) {
    void fetchEvents();
    void fetchWeather();
    void fetchCountdowns();
    renderAll();
  }
});

// Chip line-wrapping measures text on a canvas: re-plan once the bundled fonts are really available.
try {
  void document.fonts?.ready.then(() => {
    if (state.config) {
      renderCalendar(current());
      fitSide();
    }
  });
} catch { /* old browser */ }

// Re-layout the grid when the calendar's available height changes (news appearing, fonts loading, …)
let lastWeeksH = 0;
let roT: ReturnType<typeof setTimeout> | null = null;
try {
  const weeksEl = document.querySelector('#calendar .cal-weeks');
  if (weeksEl && 'ResizeObserver' in window) {
    new ResizeObserver((entries) => {
      const h = Math.round(entries[0].contentRect.height);
      if (Math.abs(h - lastWeeksH) < 2) return;
      lastWeeksH = h;
      if (roT) clearTimeout(roT);
      roT = setTimeout(() => renderCalendar(current()), 60);
    }).observe(weeksEl);
  }
} catch { /* ignore */ }

let resizeT: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  if (resizeT) clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    applyLayout();
    renderAll();
    photos.reframe();
  }, 150);
});

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------
function enterDemo(): void {
  state.demo = true;
  statusDot.classList.remove('show');
  set('config', mockConfig());
  void fetchEvents();
  void fetchWeather();
  void fetchNews();
  void fetchPhotos();
  void fetchCountdowns();
  // ?demo=1&announce=1|info|success|warning|urgent|all → sample announcements; &identify=1 → identify overlay
  const an = params.get('announce');
  if (an) setTimeout(() => mockAnnouncements(an).forEach((a: Announcement) => announcements.show(a)), 900);
  if (params.get('identify') === '1') {
    setTimeout(() => identify.show({ durationSec: 600 }, { name: ctx.cfg.screen.name, slug: ctx.cfg.slug || 'living-room', clientId }), 900);
  }
}

async function boot(): Promise<void> {
  startTicker();
  void healthOnce().then((h) => loadEmojiWebFont(h));
  if (forceDemo) {
    enterDemo();
    startPolling();
    return;
  }
  // Fresh install: welcome screen with the admin URL + QR until the setup wizard is completed.
  const setup = await checkSetup();
  if (setup) {
    const pl = params.get('lang');
    heartbeat.stop();
    showWelcome(setup, pl === 'es' || pl === 'en' || pl === 'pt' ? pl : setup.suggestedLanguage);
    waitForSetup();
    return;
  }
  // /pair always shows the pairing screen for a browser without a key (also in open mode).
  if (location.pathname === '/pair' && !credential) {
    heartbeat.stop();
    showPairing('pair', pairingLang(params));
    return;
  }
  // Ask the server first (short timeout): a revoked link or a private install without a key must never flash
  // cached family data. Offline → last known data (offline tolerance), then go live.
  let first: DisplayConfig | null = null;
  try {
    first = await api.configQuick();
  } catch (e) {
    if (deniedBy(e)) return;
  }
  if (first) {
    setOnline(true);
    saveCache('config', first);
    set('config', first);
    void goLive();
    return;
  }
  const cached = loadCache<DisplayConfig>('config');
  if (cached) {
    set('events', loadCache<EventsResponse>('events'));
    set('weather', loadCache<WeatherResponse>('weather'));
    set('news', loadCache<NewsResponse>('news'));
    set('countdowns', loadCache<CountdownsResponse>('countdowns'));
    set('config', cached);
  }
  const ok = await fetchConfig();
  if (accessDenied) return;
  if (!ok && !cached) {
    if (import.meta.env.DEV) {
      console.info('[display] /api unreachable, running with the built-in demo dataset');
      enterDemo();
      startPolling();
      // keep probing the real API; switch over without a reload when it appears
      const probe = setInterval(async () => {
        try {
          const c = await api.config();
          clearInterval(probe);
          state.demo = false;
          set('config', c);
          state.events = null;
          void goLive();
        } catch { /* still down */ }
      }, 30_000);
      return;
    }
    // Production without any data yet: defaults + keep retrying.
    set('config', normalizeConfig({}) as DisplayConfig);
    const retry = setInterval(async () => {
      if (await fetchConfig()) {
        clearInterval(retry);
        void goLive();
      }
    }, 10_000);
  }
  void goLive();
}

let streamStarted = false;
async function goLive(): Promise<void> {
  if (accessDenied) return;
  startPolling();
  void fetchEvents();
  void fetchWeather();
  void fetchNews();
  void fetchPhotos();
  void fetchCountdowns();
  if (streamStarted) return;
  streamStarted = true;
  heartbeat.start();
  // A server without SSE (live: 'poll' in /api/health) gets a config revision poll instead of the stream.
  const mode = await detectLiveMode({
    health: () => api.health(),
    answered: (e) => e instanceof ApiError && e.status > 0,
    cancelled: () => accessDenied,
  });
  if (!mode || accessDenied) return;
  if (mode === 'poll') {
    // No hello here, so no version reload either: the nightly 04:00 reload picks up a new build.
    liveStream = startConfigPoll({
      revision: () => state.config?.revision,
      fetchConfig,
      changed: () => {
        void fetchEvents();
        void fetchCountdowns();
      },
    });
    heartbeat.soon();
    return;
  }
  liveStream = connectStream({
    hello: (d) => {
      setOnline(true);
      setServerNow(d.now);
      if (Array.isArray(d.activeAnnouncementIds)) announcements.sync(d.activeAnnouncementIds);
      if (typeof d.revision === 'number' && d.revision !== state.config?.revision) void fetchConfig();
      void fetchEvents();
      void fetchCountdowns();
      heartbeat.soon();
      if (d.serverVersion) void maybeReloadForVersion(d.serverVersion);
    },
    // Config can change the event range (weeks/weekStart), colours, icons and countdowns → refetch them too.
    config: () => void fetchConfig().then((ok) => (ok ? Promise.all([fetchEvents(), fetchCountdowns()]) : undefined)),
    // gallery changed in the admin (upload, replace, delete, focal point, shown / hidden) → fresh list;
    // a photo taken out of the rotation while on screen is replaced right away
    photos: (d) =>
      void fetchPhotos().then(() => {
        if (photos.currentFile && d.hidden?.includes(photos.currentFile)) void photos.next();
      }),
    events: (d) => {
      if (!state.events || d.hash !== state.events.hash) void fetchEvents();
      void fetchCountdowns();
    },
    reload: () => location.reload(),
    announce: (a) => announcements.show(a),
    announceClear: (d) => announcements.clear(d.id),
    identify: (d) => {
      identify.show(d, { name: ctx.cfg.screen.name, slug: state.config?.slug || screenKey, clientId });
      heartbeat.soon();
    },
    night: (d) => {
      setNightCommand(d.mode);
      heartbeat.soon();
    },
    // Link regenerated / device revoked → "no longer valid"; switched to private without a key → pairing.
    revoked: (d) => denyAccess(d.code === 'key_required' ? 401 : 403),
    open: () => setOnline(true),
    down: () => setOnline(false),
  });
}

/**
 * The server runs a newer build than this page (hello.serverVersion ≠ __APP_VERSION__): reload once, but never
 * more than once per 10 min (sessionStorage guard) and only when /api/health answers.
 */
async function maybeReloadForVersion(serverVersion: string): Promise<void> {
  if (!serverVersion || serverVersion === __APP_VERSION__ || import.meta.env.DEV) return;
  const KEY = 'cs.versionReloadAt';
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 10 * 60_000) return;
    const h = await api.health();
    if (!h?.ok) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  console.info(`[display] server ${serverVersion} ≠ page ${__APP_VERSION__} → reloading`);
  location.reload();
}

const heartbeat = new Heartbeat(
  {
    screenId: () => state.config?.screenId || '',
    webgl: () => !!engine,
    lite: () => lite,
    night: () => nightNow,
    nightOverride: () => nightOverride,
    demo: () => state.demo,
    photoFrame: () => photos.frame,
  },
  (now) => setServerNow(now),
);
// The admin's focal-point editor previews the photo with this display's real free band.
photos.onFrameChange = () => heartbeat.soon(3000);

// Nightly soft reload (~04:00 local, page older than 12 h) to reclaim leaked renderer/browser memory on
// long-running kiosks. Only when the server answers, so an offline display never reloads into a blank page.
const bootAt = Date.now();
setInterval(async () => {
  if (state.demo || Date.now() - bootAt < 12 * 3600_000) return;
  const t = current();
  if (t.parts.hour !== 4 || t.parts.minute > 10) return;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (r.ok) location.reload();
  } catch { /* offline: try again later */ }
}, 5 * 60_000);

// Never let an unexpected error blank the screen.
window.addEventListener('error', (e) => {
  console.error('[display] error', e.error || e.message);
  noteError(e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[display] rejection', e.reason);
  noteError(e.reason);
});

void boot();
