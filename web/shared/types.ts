// Shared JSON contracts, see docs/API.md and docs/ARCHITECTURE.md. Imported by both the display and the admin panel.
// Keep in sync with the server (server/validate.js, server/defaults.js).
import type { PhotoFrame } from './focus';

export type Lang = 'es' | 'en' | 'pt';
export type LayoutPreset = 'bigCalendar' | 'leftRight' | 'topBottom' | 'bigTime' | 'agenda';
export type SourceKind = 'generic' | 'airbnb' | 'birthdays' | 'holidays';
export type SourceType = 'ics' | 'google';
export type DateFormat = 'weekday_month_d' | 'weekday_d_month' | 'weekday_d_dot_month';

export interface NightMode {
  enabled: boolean;
  from: string; // "HH:MM"
  to: string; // "HH:MM"
  dim: number; // 0..1 (brightness multiplier applied at night)
}

export interface ScreenConfig {
  name: string;
  language: Lang;
  fontScale: number;
  theme: 'dark' | 'light' | string;
  accent: string;
  orientation: 'auto' | 'landscape' | 'portrait' | string;
  customCss: string;
  nightMode: NightMode;
}

export interface LayoutConfig {
  preset: LayoutPreset;
  sidePanel: 'left' | 'right';
  sideWidth: number; // 0..1 fraction of the screen width
}

export interface BackgroundConfig {
  enabled: boolean;
  source: 'stock' | 'gallery' | 'mixed';
  stockTopic: string;
  /** gallery rotation order: shuffled (no immediate repeats), newest upload first, or by file name */
  order?: 'random' | 'newest' | 'name';
  intervalSec: number;
  brightness: number;
  showMeta: boolean;
  cover: boolean;
  transition: 'webgl' | 'fade' | 'none';
  ambient: 'aurora' | 'particles' | 'none';
  /** frosted weather card: backdrop blur (px at 1080p, 0 = off) and darkness (0..1, 0.5 = default) */
  panelBlur?: number;
  panelShade?: number;
}

export interface CalendarSource {
  id: string;
  type: SourceType;
  name: string;
  url?: string; // ics only
  googleCalendarId?: string; // google only
  googleAccount?: string; // google only
  color: string;
  emoji?: string;
  kind: SourceKind;
  enabled: boolean;
  refreshMin: number;
}

/** Public projection of a source sent to the display (no urls / account info). */
export interface PublicCalendarSource {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  kind: SourceKind;
}

export interface IconRule {
  id: string;
  match: string[];
  emoji: string;
  color: string | null;
}

export interface CalendarConfig<S = CalendarSource> {
  enabled: boolean;
  view: 'month' | 'agenda' | 'week';
  weeks: number;
  weekStart: number; // 0 = Sunday, 1 = Monday
  showLocation: boolean;
  showEndTime: boolean;
  showDayXofY: boolean;
  showLegend: boolean;
  hidePast: boolean;
  maxEventsPerDay: number;
  /** v2, per screen: null = every enabled source (incl. 'local' + 'birthdays'); array = only these ids. */
  sourceIds?: string[] | null;
  sources: S[];
  iconRules: IconRule[];
}

export interface DateTimeConfig {
  enabled: boolean;
  timezone: string;
  clock: 'digital' | 'analog';
  format24: boolean;
  showSeconds: boolean;
  showAmPm: boolean;
  dateFormat: DateFormat;
}

export interface WeatherConfig {
  enabled: boolean;
  provider: 'open-meteo' | 'homeassistant';
  locationName: string;
  lat: number;
  lon: number;
  units: 'metric' | 'imperial';
  forecastDays: number;
  showHourly: boolean;
  showPrecipChance: boolean;
  haWeatherEntity: string;
  haIndoorTempEntity: string;
  haIndoorHumidityEntity: string;
}

export interface NewsFeed {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface NewsConfig {
  enabled: boolean;
  feeds: NewsFeed[];
  rotateSec: number;
  maxItems: number;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoConfig {
  enabled: boolean;
  items: TodoItem[];
}

export interface MessageConfig {
  enabled: boolean;
  text: string;
  emoji: string;
}

export interface HomeAssistantConfig {
  enabled: boolean;
  url: string;
}

export interface AuthConfig {
  allowedGoogleEmails: string[];
  passwordLoginEnabled: boolean;
}

// ---- display access: private links + paired devices (docs/API.md "Display access") ----

/** 'private': displays need their private link (/d/<key>) or a paired-device token. 'open': legacy LAN mode. */
export type DisplayAccessMode = 'private' | 'open';
export type DisplayAccessVia = 'key' | 'device' | 'session' | 'open';

export interface SecurityConfig {
  displayAccess: DisplayAccessMode;
}

/** GET /api/admin/display-links item: one private link per saved screen. */
export interface DisplayLink {
  screenId: string;
  slug: string;
  name: string;
  /** UUIDv4 */
  key: string;
  /** "/d/<key>" */
  path: string;
  createdAt: string;
}

export interface DisplayLinksResponse {
  mode: DisplayAccessMode;
  links: DisplayLink[];
  /** this server's LAN IPv4 addresses (LAN_ADDRESS overrides; empty inside a container) */
  lanAddresses?: string[];
  /** PUBLIC_URL origin when set to something else than localhost */
  publicUrl?: string | null;
}

export interface PairedDevice {
  id: string;
  name: string;
  /** first characters of the token ("md_abcd"), for recognising it */
  prefix: string;
  screenId: string;
  screenSlug: string;
  screenName: string;
  createdAt: string;
  lastSeenAt: string | null;
  lastIp: string | null;
  userAgent: string;
  connected: boolean;
  clientIds: string[];
}

export interface DevicesResponse {
  mode: DisplayAccessMode;
  devices: PairedDevice[];
}

/** POST /api/pair/start */
export interface PairStartResponse {
  /** secret: only this display knows it; the token is handed out to it alone */
  sessionId: string;
  /** 6 characters, shown on the screen and typed in the admin */
  code: string;
  expiresAt: string;
  pollMs: number;
}

/** POST /api/pair/status { sessionId } */
export type PairStatusResponse =
  | { status: 'waiting'; code: string; expiresAt: string }
  | { status: 'paired'; token: string; screen: { id: string; slug: string; name: string }; device: { id: string; name: string } }
  | { status: 'expired' };

export interface PairClaimRequest {
  code: string;
  screenId: string;
  name?: string;
}

/**
 * FLAT per-screen VIEW of the v2 config (docs/ARCHITECTURE.md): global sections merged with ONE screen's sections,
 * in the historical v1 shape (+ the new global keys). This is what admin sections edit (`SectionProps.cfg`);
 * build it with `projectScreen()` and write it back with `applyScreen()` from web/shared/screens.ts.
 * NOT the stored/wire format any more: GET/PUT /api/admin/config use `StoredConfig`.
 */
export interface AppConfig {
  version: number;
  revision: number;
  /** id of the screen this view was projected from */
  screenId: string;
  slug: string;
  defaultScreen: string;
  screen: ScreenConfig;
  layout: LayoutConfig;
  background: BackgroundConfig;
  calendar: CalendarConfig<CalendarSource>;
  datetime: DateTimeConfig;
  weather: WeatherConfig;
  news: NewsConfig;
  todo: TodoConfig;
  message: MessageConfig;
  countdowns: CountdownsConfig & ScreenCountdownsConfig;
  alerts: ScreenAlertsConfig;
  localEvents: LocalEventsConfig;
  birthdays: BirthdaysConfig;
  eventRules: { items: EventRule[] };
  schedules: { items: ScheduledMessage[] };
  homeassistant: HomeAssistantConfig;
  auth: AuthConfig;
  security: SecurityConfig;
}

/** GET /api/display/config[?screen=<slug|id>] */
export interface DisplayConfig {
  revision: number;
  /** v2 fields below are always sent by the server; optional only because older cached payloads lack them. */
  screenId?: string;
  slug?: string;
  /** true when ?screen= did not match any screen and the default screen was served instead */
  screenFallback?: boolean;
  countdowns?: ScreenCountdownsConfig;
  alerts?: ScreenAlertsConfig;
  /** enabled scheduled messages targeting this screen (screenIds stripped) */
  schedules?: Omit<ScheduledMessage, 'screenIds'>[];
  screen: ScreenConfig;
  layout: LayoutConfig;
  background: BackgroundConfig;
  calendar: CalendarConfig<PublicCalendarSource>;
  datetime: DateTimeConfig;
  weather: WeatherConfig;
  news: { enabled: boolean; rotateSec: number };
  todo: TodoConfig;
  message: MessageConfig;
}

/** CalEvent from GET /api/events */
export interface CalEvent {
  id: string;
  sourceId: string;
  title: string;
  /** ISO with offset, or YYYY-MM-DD for allDay */
  start: string;
  /** exclusive end; ISO with offset, or YYYY-MM-DD for allDay */
  end: string;
  allDay: boolean;
  location?: string | null;
  color: string;
  emoji?: string | null;
  kind: SourceKind;
  multiDay: boolean;
  description?: string | null;
  /** F2: birthdays with a known birth year (and birthdays.showAge) → age turned on that day. Display: "🎂 María (34)" */
  age?: number | null;
}

export interface EventsResponse {
  generatedAt: string;
  hash: string;
  events: CalEvent[];
  errors: { sourceId: string; message: string }[];
}

export interface WeatherCurrent {
  temp: number;
  feelsLike: number;
  humidity: number;
  windKmh: number;
  windDir: number; // degrees
  windDirLabel: string;
  code: number; // WMO
  isDay: boolean;
  description: string;
  pressure?: number | null;
  uv?: number | null;
}

export interface WeatherToday {
  sunrise: string;
  sunset: string;
  min: number;
  max: number;
  precipChance: number;
}

export interface WeatherDaily {
  date: string; // YYYY-MM-DD
  code: number;
  min: number;
  max: number;
  precipChance: number;
  windKmh: number;
}

export interface WeatherHourly {
  time: string;
  temp: number;
  code: number;
  precipChance: number;
  isDay: boolean;
}

export interface WeatherResponse {
  updatedAt: string;
  locationName: string;
  current: WeatherCurrent;
  today: WeatherToday;
  daily: WeatherDaily[];
  hourly: WeatherHourly[];
  indoor: { temp: number | null; humidity: number | null } | null;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  date: string;
  image?: string;
}

export interface NewsResponse {
  updatedAt: string;
  items: NewsItem[];
}

export interface Photo {
  url: string;
  author?: string;
  title?: string;
  source: 'stock' | 'gallery';
  /** gallery file name (gallery photos only) */
  file?: string;
  /** Focal point (0..1 of width / height, from the top-left) the cover crop is kept around. Gallery only. */
  focusX?: number;
  focusY?: number;
}

export interface PhotosResponse {
  photos: Photo[];
}

export interface HealthResponse {
  ok: boolean;
  uptime: number;
  version: string;
}

/** SSE /api/stream?screen=&client= event payloads (docs/ARCHITECTURE.md) */
export type StreamEvent =
  | ({ type: 'hello' } & StreamHello)
  | { type: 'config'; revision: number }
  | { type: 'reload' }
  | { type: 'events'; hash: string }
  | ({ type: 'announce' } & Announcement)
  | { type: 'announce-clear'; id: string | null }
  | ({ type: 'identify' } & IdentifyPayload)
  | { type: 'night'; mode: NightCommand }
  | { type: 'ping'; t: number };

// ---- Admin API ----

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
  method: 'password' | 'google';
}

export interface AuthMeResponse {
  user: AuthUser | null;
  googleConfigured: boolean;
  passwordLoginEnabled: boolean;
  /** Logged in with the initial/default password: it must be changed (only accepted from the LAN until then). */
  mustChangePassword?: boolean;
  /** Fresh install: no admin password yet → the admin shows the setup wizard. */
  needsSetup?: boolean;
  /** The initial password came from ADMIN_PASSWORD (headless install): the panel offers to change it. */
  passwordFromEnv?: boolean;
}

/** GET /api/setup/status */
export interface SetupStatus {
  needsSetup: boolean;
  googleConfigured: boolean;
  version: string;
  suggestedLanguage: Lang;
  /** only while needsSetup: a setup token is needed (SETUP_TOKEN set, or the browser is not on the LAN) */
  tokenRequired?: boolean;
  /** only while needsSetup and when a token was sent (x-setup-token): whether it is right */
  tokenValid?: boolean | null;
  defaults?: { timezone: string; location: string };
  /** only while needsSetup, for LAN clients: this machine's LAN IPv4 addresses (kiosk / wizard opened on localhost → QR code).
   *  Empty in a container unless LAN_ADDRESS is set. */
  lanAddresses?: string[];
}

/** POST /api/setup/complete */
export interface SetupRequest {
  token?: string;
  password: string;
  passwordConfirm: string;
  language: Lang;
  screenName: string;
  location?: { name: string; lat: number; lon: number; timezone: string | null };
  /** time zone without a location (location skipped) */
  timezone?: string;
  units?: 'metric' | 'imperial';
  format24?: boolean;
  calendars?: { name: string; url: string; kind: 'holidays' | 'generic'; color?: string }[];
  photos?: { source: 'stock' | 'gallery' | 'mixed' };
  layout?: { preset: LayoutPreset };
  accent?: string;
  ambient?: 'aurora' | 'particles' | 'none';
  theme?: 'dark' | 'light';
}

export interface SetupCompleteResponse {
  ok: true;
  user: AuthUser;
  /** displayPath: the screen's private link ("/d/<key>") */
  screen: { id?: string; slug: string; name: string; displayPath?: string | null };
  displayAccess?: DisplayAccessMode;
}

export interface GoogleAccount {
  email: string;
  name?: string;
  picture?: string;
}

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
}

export interface TestIcsResponse {
  ok: boolean;
  count?: number;
  sample?: string[];
  error?: string;
}

export interface TestRssResponse {
  ok: boolean;
  title?: string;
  count?: number;
  error?: string;
}

export interface TestHomeAssistantResponse {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface HaEntity {
  entity_id: string;
  name: string;
  state: string;
  unit?: string;
}

export interface AdminPhoto {
  file: string;
  /** includes a ?v=<mtime> cache-busting version */
  url: string;
  /** small JPEG preview for the grid (falls back to `url` until one exists) */
  thumbUrl?: string;
  hasThumb?: boolean;
  size: number;
  mtime: string | number;
  /** pixel size as displayed (EXIF orientation applied) */
  w?: number;
  h?: number;
  focusX?: number;
  focusY?: number;
  uploadedAt?: string;
  /** excluded from the background rotation */
  hidden?: boolean;
}

export type PhotoConflictPolicy = 'replace' | 'rename' | 'skip';

export interface PhotoNameCheck {
  name: string;
  /** the name the server will store it under */
  sanitized: string;
  exists: boolean;
  /** name it would get with "keep both" */
  renamed?: string;
}

export interface PhotoUploadResult {
  ok: true;
  files: (AdminPhoto & { status: 'created' | 'replaced' | 'renamed'; requested: string })[];
  skipped: string[];
}

export interface SourceStatus {
  id: string;
  name: string;
  enabled?: boolean;
  lastFetch: string | null;
  lastSuccess?: string | null;
  ok: boolean;
  count: number;
  error?: string | null;
}

export interface AdminStatus {
  sources: SourceStatus[];
  weather: { ok: boolean; updatedAt: string | null };
  news: { ok: boolean; updatedAt: string | null; count?: number; error?: string | null };
  displays: number;
  uptime: number;
}

// =================================================================================================
// v2 admin management (docs/ARCHITECTURE.md). 
// =================================================================================================

/** Built-in pseudo-source ids (F2). */
export const LOCAL_SOURCE_ID = 'local';
export const BIRTHDAYS_SOURCE_ID = 'birthdays';

export type AlertStyle = 'info' | 'success' | 'warning' | 'urgent';
export type NightCommand = 'on' | 'off' | 'auto';

// ---- §2 stored config (data/config.json, GET/PUT /api/admin/config) ----

export interface ScreenCountdownsConfig {
  enabled: boolean;
  /** max chips shown (display may show fewer if space is short) 1..12 */
  max: number;
}

export interface ScreenAlertsConfig {
  /** show announcements + scheduled messages on this screen */
  enabled: boolean;
  /** play the WebAudio chime when an alert asks for it */
  sound: boolean;
  /** 0..1 */
  volume: number;
}

/** One screen profile (F1). `screen.name` lives in `name`. */
export interface ScreenProfile {
  id: string; // "s_xxx", stable, never changes
  slug: string; // URL key for ?screen=, unique, ^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$
  name: string;
  screen: Omit<ScreenConfig, 'name'>;
  layout: LayoutConfig;
  background: BackgroundConfig;
  calendar: Pick<CalendarConfig, 'enabled' | 'view' | 'weeks' | 'weekStart' | 'showLocation' | 'showEndTime' | 'showDayXofY' | 'showLegend' | 'hidePast' | 'maxEventsPerDay'> & { sourceIds: string[] | null };
  datetime: Omit<DateTimeConfig, 'timezone'>;
  weather: Pick<WeatherConfig, 'enabled' | 'forecastDays' | 'showHourly' | 'showPrecipChance'>;
  news: { enabled: boolean; rotateSec: number };
  todo: { enabled: boolean };
  message: MessageConfig;
  countdowns: ScreenCountdownsConfig;
  alerts: ScreenAlertsConfig;
}

export type RepeatFreq = 'none' | 'weekly' | 'monthly' | 'yearly';

/** F2 local event (dates/times are local to datetime.timezone). */
export interface LocalEvent {
  id: string; // "l_xxx"
  title: string;
  emoji: string; // '' → icon rules / localEvents.emoji
  color: string | null; // null → localEvents.color
  location: string;
  notes: string;
  allDay: boolean;
  date: string; // YYYY-MM-DD first day
  endDate: string; // YYYY-MM-DD last day, INCLUSIVE (= date for single-day)
  startTime: string; // 'HH:MM' when !allDay, else ''
  endTime: string; // 'HH:MM' when !allDay (on endDate), else ''
  repeat: {
    freq: RepeatFreq;
    interval: number; // every N weeks/months/years, 1..99
    until: string | null; // YYYY-MM-DD inclusive (last occurrence start), null = forever
    weekdays: number[]; // weekly only, 0 = Sunday … 6; [] = weekday of `date`
  };
  /** occurrence start dates (YYYY-MM-DD) that are skipped */
  exceptions: string[];
  /** also show as a countdown chip (F4) */
  countdown: boolean;
}

export interface LocalEventsConfig {
  enabled: boolean;
  name: string; // legend name of the 'local' source
  color: string;
  emoji: string;
  items: LocalEvent[];
}

/** F2 birthday → yearly all-day event of kind 'birthdays' on source 'birthdays'. */
export interface Birthday {
  id: string; // "b_xxx"
  name: string;
  month: number; // 1..12
  day: number; // 1..31 (29/02 → 28/02 on non-leap years)
  year: number | null; // birth year → age
  emoji: string; // '' → birthdays.emoji
}

export interface BirthdaysConfig {
  enabled: boolean;
  name: string;
  color: string;
  emoji: string;
  showAge: boolean;
  items: Birthday[];
}

export type EventRuleAction = 'hide' | 'rename' | 'style';

/** F3 filter / override rule. Evaluated: hide → rename (in order, chained) → style (first match). */
export interface EventRule {
  id: string; // "f_xxx"
  enabled: boolean;
  action: EventRuleAction;
  /** accent/case-insensitive text */
  match: string;
  matchMode: 'contains' | 'exact' | 'startsWith';
  /** 'title' or 'any' (title + description + location) */
  field: 'title' | 'any';
  /** [] = every source (ids may include 'local' / 'birthdays') */
  sourceIds: string[];
  /** rename: replacement for the matched text (contains/startsWith) or the whole title (exact) */
  replaceWith: string;
  /** style: '' = unchanged */
  emoji: string;
  /** style: null = unchanged */
  color: string | null;
  /** style: also show matching events as countdown chips (F4) */
  countdown: boolean;
  note: string;
}

/** F4 manual countdown. */
export interface Countdown {
  id: string; // "k_xxx"
  title: string;
  emoji: string;
  color: string | null;
  date: string; // YYYY-MM-DD
  yearly: boolean; // repeats every year on the same month/day
}

/** Global countdown settings (per-screen enabled/max live in ScreenCountdownsConfig). */
export interface CountdownsConfig {
  items: Countdown[];
  includeBirthdays: boolean;
  /** birthdays are included when they are ≤ N days away */
  birthdayDays: number;
  /** include events flagged `countdown` (local events, style rules) */
  includeFlagged: boolean;
  /** ignore anything further than N days */
  horizonDays: number;
}

/** F5 scheduled message (recurring time window). */
export interface ScheduledMessage {
  id: string; // "m_xxx"
  enabled: boolean;
  title: string;
  body: string;
  emoji: string;
  style: AlertStyle;
  /** 0 = Sunday … 6; [] = every day. The day refers to the START of the window. */
  days: number[];
  from: string; // HH:MM
  to: string; // HH:MM; to < from → window crosses midnight
  startDate: string | null; // YYYY-MM-DD inclusive
  endDate: string | null;
  /** screen ids; [] = all screens */
  screenIds: string[];
  /** chime when the window starts */
  sound: boolean;
}

/** v2 stored config: GET/PUT /api/admin/config, backups, export. */
export interface StoredConfig {
  version: 2;
  revision: number;
  defaultScreen: string;
  screens: ScreenProfile[];
  calendar: { sources: CalendarSource[]; iconRules: IconRule[] };
  datetime: { timezone: string };
  weather: Omit<WeatherConfig, 'enabled' | 'forecastDays' | 'showHourly' | 'showPrecipChance'>;
  news: { feeds: NewsFeed[]; maxItems: number };
  todo: { items: TodoItem[] };
  localEvents: LocalEventsConfig;
  birthdays: BirthdaysConfig;
  eventRules: { items: EventRule[] };
  countdowns: CountdownsConfig;
  schedules: { items: ScheduledMessage[] };
  homeassistant: HomeAssistantConfig;
  auth: AuthConfig;
  security: SecurityConfig;
}

export interface ValidationError {
  path: string;
  message: string;
}

// ---- §3 events: preview, CSV, countdowns ----

export interface EventsPreviewRequest {
  /** default today (server tz) */
  from?: string;
  /** 1..60, default 14 */
  days?: number;
  /** screen id/slug to filter sources; omitted → all enabled sources */
  screen?: string;
  /** draft calendar settings of that screen (which sources it shows) instead of the saved ones */
  screenCalendar?: { enabled: boolean; sourceIds: string[] | null };
  /** draft values to preview instead of the saved ones (all optional) */
  eventRules?: EventRule[];
  iconRules?: IconRule[];
  localEvents?: LocalEventsConfig;
  birthdays?: BirthdaysConfig;
}

export interface PreviewEvent extends CalEvent {
  hidden: boolean;
  /** title before rename rules (after kind normalisation, e.g. Airbnb) */
  originalTitle: string;
  sourceName: string;
  /** rules that changed this event, in evaluation order */
  applied: { ruleId: string; action: EventRuleAction }[];
  /** icon rule that set emoji/color (null = none / overridden) */
  iconRuleId: string | null;
}

export interface EventsPreviewResponse {
  from: string;
  to: string;
  events: PreviewEvent[];
  /** ruleId → number of events affected in the window */
  ruleHits: Record<string, number>;
  errors: { sourceId: string; message: string }[];
}

export interface BirthdayCsvResult {
  items: Birthday[]; // parsed, with fresh ids (not saved)
  errors: { line: number; text: string; message: string }[];
  duplicates: number; // lines matching an existing birthday (same name + day + month), skipped
}

export interface CountdownItem {
  id: string;
  title: string;
  emoji: string;
  color: string | null;
  date: string; // YYYY-MM-DD (next occurrence)
  /** days from server "today" at generation time (0 = today); display recomputes at midnight from `date` */
  days: number;
  origin: 'manual' | 'birthday' | 'event';
  age?: number | null;
}

export interface CountdownsResponse {
  generatedAt: string;
  today: string; // YYYY-MM-DD server tz
  hash: string;
  items: CountdownItem[];
}

// ---- §4 displays ----

/** Sent by the display: POST /api/display/heartbeat (on SSE open, every 60 s, after a command). */
export interface DisplayHeartbeat {
  clientId: string; // [A-Za-z0-9_-]{8,64}, persisted in localStorage
  screen: string; // ?screen= value as requested ('' = default)
  screenId: string; // resolved screen id from DisplayConfig
  version: string; // __APP_VERSION__
  build: string; // __APP_BUILD__ (ISO build time)
  viewport: { w: number; h: number }; // innerWidth/innerHeight
  screenRes: { w: number; h: number }; // screen.width/height
  dpr: number;
  webgl: boolean; // three.js layers actually running
  lite: boolean;
  night: boolean; // dimmed right now
  nightOverride: NightCommand; // 'auto' = following the schedule
  uptimeSec: number; // since page load
  lastError: string | null; // last uncaught error message (≤ 200 chars)
  /** photo panel geometry and the part not covered by text (focal-point editor preview) */
  photoFrame?: PhotoFrame | null;
}

export interface HeartbeatResponse {
  ok: true;
  now: string; // server ISO time
  revision: number;
}

export interface DisplayInfo {
  clientId: string;
  screenId: string;
  screenSlug: string;
  screenName: string;
  connected: boolean; // SSE stream open now
  ip: string;
  userAgent: string;
  uaShort: string; // "Chromium 128 · Linux aarch64"
  connectedAt: string | null; // current SSE connection start
  firstSeen: string;
  lastSeen: string; // last heartbeat or SSE activity
  viewport: { w: number; h: number } | null;
  screenRes: { w: number; h: number } | null;
  dpr: number | null;
  webgl: boolean | null;
  lite: boolean | null;
  version: string | null;
  build: string | null;
  /** version !== server version → display runs an old build */
  outdated: boolean;
  night: boolean | null;
  nightOverride: NightCommand | null;
  uptimeSec: number | null;
  lastError: string | null;
  photoFrame?: PhotoFrame | null;
  /** how the display got in: private link, paired device, admin session or open mode (no key) */
  access?: DisplayAccessVia;
  deviceId?: string | null;
  deviceName?: string | null;
}

export interface DisplaysResponse {
  displays: DisplayInfo[];
  serverVersion: string;
}

export interface DisplayCommandRequest {
  action: 'reload' | 'identify' | 'night';
  mode?: NightCommand; // required for 'night'
  clientIds?: string[];
  /** screen ids or slugs */
  screens?: string[];
}

export interface StreamHello {
  revision: number;
  screenId: string;
  slug: string;
  clientId: string | null;
  serverVersion: string;
  now: string; // server ISO time (clock-offset for announcement expiry)
  /** announcements still active for this screen; the display drops any other it is showing (missed clears) */
  activeAnnouncementIds: string[];
}

export interface IdentifyPayload {
  name: string;
  slug: string;
  clientId: string | null;
  durationSec: number; // 10
}

// ---- §5 announcements, tokens ----

export interface AnnounceRequest {
  title?: string; // ≤120; title or body required
  body?: string; // ≤500
  emoji?: string;
  style?: AlertStyle; // default 'info'
  durationSec?: number; // 5..86400, default 30
  sound?: boolean; // default false
  /** screen ids or slugs; omitted/[] = all */
  screens?: string[];
}

export interface Announcement {
  id: string; // "a_xxx"
  title: string;
  body: string;
  emoji: string;
  style: AlertStyle;
  durationSec: number;
  sound: boolean;
  /** screen ids; [] = all */
  screenIds: string[];
  createdAt: string;
  expiresAt: string;
  via: 'admin' | 'hook';
  by: string; // admin email or "token:<name>"
  /** set when removed before expiry */
  clearedAt?: string | null;
}

export interface AnnounceResponse {
  ok: true;
  announcement: Announcement;
  delivered: number; // SSE clients that received it
}

export interface AnnouncementsResponse {
  active: Announcement[];
  history: Announcement[]; // newest first, ≤ 50
}

export interface ApiTokenInfo {
  id: string; // "tk_xxx"
  name: string;
  prefix: string; // first 8 chars of the token, e.g. "cs_Ab3x"
  createdAt: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  useCount: number;
}

export interface ApiTokenCreated {
  token: string; // shown ONCE
  info: ApiTokenInfo;
}

// ---- §6 backups, export/import, activity ----

export type BackupReason = 'save' | 'manual' | 'restore' | 'import' | 'migration';

export interface BackupInfo {
  id: string; // file name
  createdAt: string;
  revision: number;
  reason: BackupReason;
  size: number;
  screens: number;
  sources: number;
}

export interface ExportSecrets {
  passwordHash?: string;
  homeassistant?: { token?: string };
  google?: { accounts: Record<string, unknown> };
  apiTokens?: unknown[];
}

export interface ExportBundle {
  format: 'marco-backup';
  formatVersion: 1;
  exportedAt: string;
  appVersion: string;
  config: StoredConfig;
  secrets?: ExportSecrets;
}

export interface ImportPreview {
  ok: boolean;
  errors: ValidationError[];
  fromVersion: number; // config version found (1 or 2)
  appVersion: string | null;
  exportedAt: string | null;
  hasSecrets: boolean;
  /** what importing the secrets would change in display access (null: the bundle has no links / devices) */
  secretsImpact?: { linksChanged: string[]; devicesRemoved: string[]; devicesAdded: number } | null;
  /** current display access mode: imports and restores always keep it */
  displayAccess?: 'private' | 'open';
  sections: { key: string; changed: boolean; summary: string }[];
  screens: { added: string[]; removed: string[]; changed: string[] };
  sources: { added: string[]; removed: string[]; changed: string[] };
  /** enabled scheduled messages that a partial import would leave without target screens (they get disabled) */
  orphanSchedules: { screensOnly: string[]; schedulesOnly: string[] };
  counts: { localEvents: number; birthdays: number; eventRules: number; countdowns: number; schedules: number };
}

export interface ImportApplyRequest {
  bundle: unknown;
  includeSecrets: boolean;
  /** top-level config keys to take from the bundle; omitted = all */
  sections?: string[];
}

export type ActivityType =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.password_changed'
  | 'auth.setup_completed'
  | 'auth.setup_rejected'
  | 'google.connected'
  | 'google.removed'
  | 'config.saved'
  | 'config.restored'
  | 'config.imported'
  | 'config.exported'
  | 'config.migrated'
  | 'backup.created'
  | 'backup.deleted'
  | 'source.error'
  | 'source.recovered'
  | 'announce.sent'
  | 'announce.cleared'
  | 'token.created'
  | 'token.revoked'
  | 'token.used'
  | 'token.rejected'
  | 'display.connected'
  | 'display.command'
  | 'display.link_regenerated'
  | 'display.paired'
  | 'display.pair_failed'
  | 'display.device_updated'
  | 'display.device_revoked'
  | 'activity.cleared';

export interface ActivityEntry {
  id: string; // sortable (time-based)
  ts: string;
  type: ActivityType;
  level: 'info' | 'warn' | 'error';
  actor: string; // email | "password" | "token:<name>" | "system" | "anonymous"
  ip: string | null;
  data?: Record<string, unknown>;
}

export interface ActivityResponse {
  items: ActivityEntry[]; // newest first
  hasMore: boolean;
}

// ---- §7 dashboard ----

export interface DashboardResponse {
  version: string;
  uptime: number;
  revision: number;
  screens: { id: string; slug: string; name: string; isDefault: boolean; displaysOnline: number }[];
  displays: DisplayInfo[];
  nextEvents: CalEvent[];
  sources: SourceStatus[];
  weather: (WeatherCurrent & { locationName: string; updatedAt: string; min: number; max: number }) | null;
  announcements: Announcement[];
  schedulesNow: { id: string; title: string; emoji: string; screenIds: string[]; until: string }[];
  activity: ActivityEntry[];
  /** codes: default_password | source_errors | no_displays | outdated_displays | google_auth_failed */
  warnings: string[];
}
