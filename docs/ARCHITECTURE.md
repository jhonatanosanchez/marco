# Architecture

This document describes how Marco is built: the processes, the data model and the behaviour the
display and the server guarantee. The HTTP endpoints and event formats are in [API.md](API.md).

## Overview

```
 ┌───────────────────────────── home server / NAS / Raspberry Pi ─────────────────────────────┐
 │  Node.js ≥ 20 · Express 5 · plain ESM JavaScript (server/, no build step)                  │
 │                                                                                             │
 │   sources ──► server/calendars.js ──► events pipeline ──► /api/events (per screen)          │
 │   ICS · Google · local events · birthdays    (rules, icons, rental feeds, countdowns)       │
 │   Open-Meteo / Home Assistant ──► /api/weather      RSS ──► /api/news                       │
 │   data/ (JSON files, atomic writes)          SSE hub ──► /api/stream (live updates)         │
 │   serves dist/ (Vite build): /  = display, /admin/ = admin panel                            │
 └───────────────▲──────────────────────────────────────────────▲──────────────────────────────┘
                 │ HTTP + Server-Sent Events                     │ HTTP (session cookie)
     displays: Chromium kiosk on a Pi, tablet, TV browser…      admin panel from a phone / laptop
     vanilla TypeScript + three.js (web/display)               Preact + TypeScript (web/admin)
```

| Folder | Content |
|---|---|
| `server/` | API and logic: ICS + recurrences (`node-ical`, `rrule`), Google Calendar, weather, RSS, photos, auth, SSE, backups, activity |
| `server/routes/` | Express routers: `public.js` (display API), `admin.js`, `screens.js`, `announce.js`, `hooks.js`, `system.js`, `localEvents.js` |
| `server/test/` | `node --test` suites and fixtures |
| `web/index.html`, `web/display/` | The display (vanilla TypeScript + three.js) |
| `web/admin/` | The admin panel (Preact + TypeScript) |
| `web/shared/` | Types shared by server contracts, display and admin; i18n; emoji rules; screen projection; focal-point crop |
| `deploy/` | Raspberry Pi installer, systemd unit, kiosk script, HDMI schedule, Caddy example |
| `scripts/demo.js` | `npm run demo` — throw-away data directory with a fictional family |
| `data/` | Runtime data (git-ignored; `DATA_DIR` overrides the location) |

Design constraints: no native modules and few runtime dependencies (it must install on a Raspberry Pi without build
tools), no database (JSON files written atomically: temp file + rename), every outbound fetch has a 15 s timeout and a
failing source never breaks the others.

## Data directory

| Path | Content |
|---|---|
| `config.json` | The whole configuration (schema v2 below). Bumped `revision` on every save. |
| `secrets.json` | Password hash (scrypt; absent on a fresh install → setup wizard, `server/setup.js`), `setupCompletedAt`, session secret/epoch, Google refresh tokens per account, Home Assistant token, API tokens (SHA-256 hashes). Mode 600. Never sent to displays. |
| `photos/` | Gallery images; `photos/.thumbs/` thumbnails (480 px); `photos/.meta.json` size + focal point per file |
| `cache/` | Source and feed caches |
| `backups/` | Rotating config backups (20 newest) + `config-v1-premigration.json` |
| `activity.jsonl` | Activity log (≈ 5000 newest entries) |
| `announcements.json` | Active announcements + history (50) |
| `displays.json` | Known displays registry (≤ 100, offline > 30 days pruned) |

## Configuration schema (v2)

The stored config has **global** sections shared by every screen and a list of **screen profiles**
(`server/defaults.js` → `defaultConfig()`, TS `StoredConfig` in `web/shared/types.ts`; limits in `server/validate.js`).

```jsonc
{
  "version": 2, "revision": 1,
  "defaultScreen": "s_main",                 // served when ?screen is absent or unknown
  "screens": [ ScreenProfile ],              // 1..12
  // ---------- global ----------
  "calendar":   { "sources": [CalendarSource], "iconRules": [IconRule] },
  "datetime":   { "timezone": "Europe/Lisbon" },
  "weather":    { "provider": "open-meteo", "locationName": "Lisbon, Portugal", "lat": 38.7223, "lon": -9.1393,
                  "units": "metric", "haWeatherEntity": "", "haIndoorTempEntity": "", "haIndoorHumidityEntity": "" },
  "news":       { "feeds": [{ "id", "name", "url", "enabled" }], "maxItems": 30 },
  "todo":       { "items": [{ "id", "text", "done" }] },
  "localEvents":{ "enabled": true, "name": "Family", "color": "#e76f51", "emoji": "", "items": [LocalEvent] },
  "birthdays":  { "enabled": true, "name": "Birthdays", "color": "#ff6f91", "emoji": "🎂", "showAge": true, "items": [Birthday] },
  "eventRules": { "items": [EventRule] },
  "countdowns": { "items": [Countdown], "includeBirthdays": true, "birthdayDays": 30, "includeFlagged": true, "horizonDays": 365 },
  "schedules":  { "items": [ScheduledMessage] },
  "homeassistant": { "enabled": false, "url": "http://homeassistant.local:8123" },   // token in secrets.json
  "auth":       { "allowedGoogleEmails": [], "passwordLoginEnabled": true }
}
```

**ScreenProfile** (one per physical display or group of displays):

```jsonc
{ "id": "s_main", "slug": "living-room", "name": "Living room",
  "screen":     { "language": "en", "fontScale": 1, "theme": "dark", "accent": "#ff5a4e", "orientation": "auto",
                  "customCss": "", "nightMode": { "enabled": false, "from": "23:00", "to": "07:00", "dim": 0.35 } },
  "layout":     { "preset": "bigCalendar", "sidePanel": "left", "sideWidth": 0.36 },   // bigCalendar | leftRight | topBottom | bigTime | agenda
  "background": { "enabled": true, "source": "stock", "stockTopic": "nature", "order": "random", "intervalSec": 120, "brightness": 0.85,
                  "showMeta": false, "cover": true, "transition": "webgl", "ambient": "aurora", "panelBlur": 18, "panelShade": 0.5 },
                  // source: stock | gallery | mixed · order: random | newest | name · transition: webgl | fade | none · ambient: aurora | particles | none
  "calendar":   { "enabled": true, "view": "month", "weeks": 5, "weekStart": 1, "showLocation": false, "showEndTime": false,
                  "showDayXofY": true, "showLegend": true, "hidePast": false, "maxEventsPerDay": 4,
                  "sourceIds": null },               // null = every enabled source (incl. new ones); array = only these
  "datetime":   { "enabled": true, "clock": "digital", "format24": true, "showSeconds": true, "showAmPm": false, "dateFormat": "weekday_d_month" },
  "weather":    { "enabled": true, "forecastDays": 5, "showHourly": true, "showPrecipChance": true },
  "news":       { "enabled": true, "rotateSec": 15 },
  "todo":       { "enabled": false },
  "message":    { "enabled": false, "text": "", "emoji": "💬" },
  "countdowns": { "enabled": true, "max": 4 },
  "alerts":     { "enabled": true, "sound": true, "volume": 0.6 } }
```

Global vs per-screen for the "split" sections:

| Section | Global part | Per-screen part |
|---|---|---|
| screen, layout, background, message, alerts | — | all |
| calendar | sources, iconRules | view settings + `sourceIds` |
| datetime | timezone | clock and date format, enabled |
| weather | provider, location, units, HA entities | enabled, forecastDays, showHourly, showPrecipChance |
| news | feeds, maxItems | enabled, rotateSec |
| todo | items | enabled |
| countdowns | items + inclusion settings | enabled, max |
| localEvents, birthdays, eventRules, schedules, homeassistant, auth | all | — |

The display and most admin pages work on a **flat view of one screen** (`AppConfig`): global sections merged with
one profile (`flatView()` in `server/screens.js`, `projectScreen()` / `applyScreen()` in `web/shared/screens.ts`,
lossless round-trip).

Item schemas (ids generated by the server when missing; prefixes in brackets):

- **CalendarSource** `[c_]`: `type` `ics|google`, `name`, `url` (ics; `webcal://` accepted), `googleCalendarId` +
  `googleAccount` (google), `color`, `emoji`, `kind` `generic|airbnb|birthdays|holidays`, `enabled`, `refreshMin`,
  `insecureTls` (accept self-signed certificates for this feed only). Ids `local` and `birthdays` are reserved for the
  built-in pseudo-sources.
- **IconRule**: `match` (keywords, case/accent-insensitive substring of title + description), `emoji`, `color|null`.
  First match wins.
- **LocalEvent** `[l_]`: `title`, `emoji`, `color|null`, `location`, `notes`, `allDay`, `date`, `endDate` (inclusive),
  `startTime`/`endTime` (`HH:MM`), `repeat { freq none|weekly|monthly|yearly, interval, until|null, weekdays[] }`,
  `exceptions[]`, `countdown`.
- **Birthday** `[b_]`: `name`, `month`, `day` (29/02 allowed), `year|null` (→ age), `emoji`.
- **EventRule** `[f_]`: `enabled`, `action hide|rename|style`, `match`, `matchMode contains|exact|startsWith`,
  `field title|any`, `sourceIds[]` (`[]` = all), `replaceWith`, `emoji`, `color|null`, `countdown`, `note`.
- **Countdown** `[k_]`: `title`, `emoji`, `color|null`, `date`, `yearly`.
- **ScheduledMessage** `[m_]`: `enabled`, `title`, `body`, `emoji`, `style info|success|warning|urgent`,
  `days` (0 = Sunday…6, `[]` = every day), `from`/`to` (`to < from` crosses midnight), `startDate|null`,
  `endDate|null`, `screenIds[]` (`[]` = all), `sound`.

Validation errors are reported with paths such as `calendar.sources[2].url` or `screens[1].screen.accent`.
Older single-screen (v1) configs are migrated automatically on load; the original file is kept in `data/backups/`.

## Events pipeline

`getEvents({ from, to, screen })` (server/calendars.js) builds the events for one screen:

1. **Sources** visible on the screen (`screen.calendar.sourceIds`, `null` = all enabled + `local` + `birthdays`).
   Each remote source is fetched with its own cache (`refreshMin`); on failure the stale cache is served and the
   error is reported (`errors[]`, activity `source.error` / `source.recovered` on transitions).
2. **Expansion** of recurrences inside the window (ICS RRULE/EXDATE/overrides; local events weekly/monthly/yearly with
   `interval`, `until` and exceptions; birthdays yearly, 29/02 → 28/02 on non-leap years). Times are interpreted in
   `datetime.timezone`: the process `TZ` follows it (set at startup and updated when the setting is saved, which also
   re-parses the ICS feeds), unless `TZ` is set in the environment.
3. **Kind normalisation**: `airbnb` sources turn "Reserved" into "Reservation · <guest>" (guest name from the
   description when present), mark "Not available" ranges as blocked, keep a leading emoji from feeds that already
   format titles (`🏠 Guest - 4p+1m`) and render guest counts as icons (`4p+1m` → 🧑🏻🧑🏻🧑🏻🧑🏻 🐶; with
   `Adults/Children/Infants` (or `Adultos/Niños/Bebés`) description lines adults 🧑🏻, children 🧒🏻 and babies 👶🏻 are
   told apart). `holidays` titles from Google feeds are translated (es/pt).
4. **Event rules** (filters): every matching `hide` rule hides; `rename` rules apply in order (chained); the first
   matching `style` rule sets emoji / color / countdown flag.
5. **Decoration**: emoji priority = item emoji > style rule > emoji already in the feed title > icon rule > source
   emoji > kind default (🏠 / 🎂 / 🎉). Color priority = item color > style rule > icon rule > source color.
   ALL-CAPS titles are tidied, birthdays get `age`.
6. Sort (all-day first, then start) and a stable `hash` so displays skip re-rendering unchanged data.

**Countdowns** (`/api/countdowns`) merge manual countdowns, upcoming birthdays (within `birthdayDays`) and events
flagged by a local event or a style rule (nearest occurrence per title), sorted by date.

## Display behaviour

- Never visibly reloads for routine updates: events every 60 s (and on SSE `events`), weather every 10 min, news every
  15 min, photos per interval; the DOM is patched in place. Day rollover at midnight re-renders the grid.
- Offline tolerant: last data is cached in `localStorage` per screen; a small status dot appears when the server is
  unreachable; SSE reconnects automatically.
- Raspberry Pi friendly: WebGL capped at 30 fps and `devicePixelRatio ≤ 1`, paused when hidden; `?lite=1` or
  `ambient: none` + `transition: fade` disables three.js entirely; CSS transforms/opacity only.
- Photos are cropped around their focal point; displays report the bands covered by the clock and weather cards in the
  heartbeat (`photoFrame`), and the crop keeps the subject in the largest free band (`web/shared/focus.ts`).
- Adaptive legibility: panel blur/shade and text contrast adapt to the photo behind them; small screens get larger
  relative type.
- Announcements: animated cards (info / success / warning / urgent, ≤ 3 stacked), WebAudio chime (no audio files),
  remaining time corrected with the server clock. Scheduled messages show as a banner while their window is active.
- Identity: `clientId` from `?client=`, else `localStorage`, else generated. `deploy/kiosk.sh` appends
  `client=<hostname>` because the kiosk runs incognito. If the server version changes, the display reloads once.

## Admin panel

- Draft model: the full `StoredConfig` is edited locally and saved with `PUT /api/admin/config`; per-screen pages edit
  the screen chosen in the header switcher ("Editing: Living room ▾").
- Navigation groups: Home (dashboard) · Screen (layout, background, settings, date & time — per screen) · Content
  (calendars, local events, birthdays, filters, icons, countdowns, weather, news, to-do, message) · Alerts ·
  Integrations (photos, Home Assistant, API & webhooks) · System (screens, connected displays, backups, activity,
  security, status).
- Command palette (Ctrl/Cmd+K or `/`): pages, individual settings, screens and actions.
- Photo pipeline in the browser (`web/admin/photoTools.ts`): EXIF rotation, resize to ≤ 2560 px JPEG, 480 px
  thumbnail, HEIC decoding through a lazily loaded chunk, automatic focal point (spectral saliency + skin tones,
  `web/admin/saliency.ts`). The server never decodes images.
- i18n: Spanish strings are the keys; English and Portuguese live in `web/admin/i18n-dict*.ts`. The first visit
  follows the browser language.

## Security model

See [SECURITY.md](../SECURITY.md). In short: the display API is unauthenticated and meant for the LAN, never returns
URLs/tokens; the admin uses a session cookie (`SameSite=Lax`) plus a JSON content-type CSRF guard on mutating routes;
webhooks use hashed bearer tokens with rate limiting; uploaded file names are sanitised. Network trust lives in
`server/lib/net.js`: the Host allowlist (DNS rebinding), `isLanClient` (private address, not relayed by an untrusted
proxy, not the container gateway in strict mode) used by the setup wizard, the weak-`ADMIN_PASSWORD` rule and the
photo routes, and the outbound address filter used by the unauthenticated setup ICS test.
