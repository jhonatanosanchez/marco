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
| `server/app.js` | `createApp()`: the whole Express stack (host guard, sessions, CSRF, display access, routers, static files); `server/index.js` adds the store, listen and shutdown |
| `server/displayAccess.js`, `server/pairing.js` | Private display links, paired devices and pairing codes (see *Display access* below) |
| `server/routes/` | Express routers: `public.js` (display API), `admin.js`, `screens.js`, `announce.js`, `hooks.js`, `system.js`, `localEvents.js`, `access.js` (links, devices, pairing) |
| `server/test/` | `node --test` suites and fixtures |
| `web/index.html`, `web/display/` | The display (vanilla TypeScript + three.js) |
| `web/admin/` | The admin panel (Preact + TypeScript) |
| `web/shared/` | Types shared by server contracts, display and admin; i18n; emoji rules; screen projection; focal-point crop |
| `install.sh` | One-line installer (`curl -fsSL https://marcohome.app/install \| bash`): modes all / server / kiosk, prebuilt release with checksum, `--dry-run`, update with rollback, uninstall. See *Installer and releases* below |
| `deploy/` | `marco` command, systemd unit, kiosk script, HDMI schedule, Caddy example; `deploy/install.sh` installs a git checkout in place (wrapper around `install.sh --source`) |
| `scripts/package-release.sh`, `scripts/release-notes.js` | Release tarball and notes (used by `.github/workflows/release.yml` on `v*` tags) |
| `scripts/demo.js` | `npm run demo`: throw-away data directory with a fictional family |
| `data/` | Runtime data (git-ignored; `DATA_DIR` overrides the location) |

Design constraints: no native modules and few runtime dependencies (it must install on a Raspberry Pi without build
tools), no database (JSON files written atomically: temp file + rename), every outbound fetch has a 15 s timeout and a
failing source never breaks the others.

## Data directory

| Path | Content |
|---|---|
| `config.json` | The whole configuration (schema v2 below). Bumped `revision` on every save. |
| `secrets.json` | Password hash (scrypt; absent on a fresh install → setup wizard, `server/setup.js`), `setupCompletedAt`, session secret/epoch, Google refresh tokens per account, Home Assistant token, API tokens (SHA-256 hashes), `displayKeys` (one private-link key per screen id), `devices` (paired devices: name, screen, SHA-256 of the token, last seen). Mode 600. Never sent to displays. |
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
  "auth":       { "allowedGoogleEmails": [], "passwordLoginEnabled": true },
  "security":   { "displayAccess": "private" }      // "open" = legacy LAN mode (installs upgraded from 0.2)
}
```

**ScreenProfile** (one per physical display or group of displays):

```jsonc
{ "id": "s_main", "slug": "living-room", "name": "Living room",
  "screen":     { "language": "en", "fontScale": 1, "theme": "dark", "style": "classic", "accent": "#ff5a4e", "orientation": "auto",
                  "customCss": "", "nightMode": { "enabled": false, "from": "23:00", "to": "07:00", "dim": 0.35 } },
                  // style: classic | modern, independent of the layout. Missing (older configs) = classic.
  "layout":     { "preset": "bigCalendar", "sidePanel": "left", "sideWidth": 0.36 },   // bigCalendar | leftRight | topBottom | bigTime | agenda
  "background": { "enabled": true, "source": "stock", "stockTopic": "nature", "order": "random", "intervalSec": 120, "brightness": 0.85,
                  "showMeta": false, "cover": true, "transition": "webgl", "ambient": "aurora", "panelBlur": 18, "panelShade": 0.5, "weatherFx": "simple" },
                  // source: stock | gallery | mixed · order: random | newest | name · transition: webgl | fade | none · ambient: aurora | particles | none · weatherFx: off | simple | rich
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
| screen, layout, background, message, alerts | none | all |
| calendar | sources, iconRules | view settings + `sourceIds` |
| datetime | timezone | clock and date format, enabled |
| weather | provider, location, units, HA entities | enabled, forecastDays, showHourly, showPrecipChance |
| news | feeds, maxItems | enabled, rotateSec |
| todo | items | enabled |
| countdowns | items + inclusion settings | enabled, max |
| localEvents, birthdays, eventRules, schedules, homeassistant, auth | all | none |

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
- Live mode comes from `GET /api/health`: `live: 'poll'` replaces the SSE stream with a config revision check every
  90 s (no announcements, identify, night or remote reload in that mode). No field or `'sse'` keeps the stream.
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
- Access (`web/display/identity.ts`): the credential is the key in the path (`/d/<key>`), else a paired-device token
  from `localStorage` (`marco.deviceToken`). Every fetch sends it as `X-Marco-Key`; the SSE URL and same-origin
  `/media/*` photo URLs carry it as `?k=`. The first config fetch happens before cached data is shown: `401` → pairing
  screen, `403` → "This link is no longer valid" (cached data is wiped; a revoked device token is forgotten). The SSE
  `revoked` event does the same while running. Paired → the token is stored and the page reloads at `/`.

## Display access

`config.security.displayAccess` (`private` | `open`) decides who may read the display API
(`server/displayAccess.js`):

| Request carries | private | open |
|---|---|---|
| a valid display key (UUIDv4) | the key's screen | the key's screen |
| a valid device token (`md_…`) | the device's screen | the device's screen |
| an unknown / revoked key or token | `403 invalid_key` | `403 invalid_key` |
| an admin session cookie | any screen (`?screen=`) | any screen |
| nothing | `401 key_required` | default screen / `?screen=` (as in 0.2) |

- A credential always decides the screen; `?screen=` is ignored with it. `/media/*` follows the same rules (in open
  mode keyless media stays LAN-only). `/api/health`, `/api/setup/*`, `/api/pair/*` and the webhooks are outside it.
- Keys: one per screen in `secrets.displayKeys`, created with the screen, dropped when the screen is deleted,
  replaced by *Regenerate link* (SSE clients that used the old key get `revoked` and are closed).
- Pairing (`server/pairing.js`, memory only): `POST /api/pair/start` → `{ sessionId, code }`; the display polls
  `POST /api/pair/status` with the secret `sessionId`; an admin claims the 6-character code
  (`POST /api/admin/pair/claim`) for a screen → a device with a random 256-bit token is created (only its hash is
  stored) and handed to the polling display once. Codes live 10 minutes, are single use and claimable only while the
  display polled in the last 15 s. Devices of a deleted screen move to the default screen.
- New installs start `private`; a stored config without `security` (saved by 0.2 or older) is migrated to `open` on
  load, and a save without `security` (old admin build, old backup or export) keeps the current mode. Restores and
  imports always keep the current mode (it is owned by the running install, not by a file).
- Live streams: each SSE client stores how it got in (`access.via`, screen, device id, a sha256 of its key or token,
  and for admin sessions the request + a per-login `sid`). `revalidateStreams()` re-checks them after every config
  save, import with secrets, session-epoch rotation (`authEvents`) and on each heartbeat; a plain logout closes the
  streams with that login's `sid`. Closed clients are removed from the registry before `res.end()`
  (`sse.dropClient`), so a broadcast in the same tick never writes to an ended response.
- A keyless display on the pairing screen probes `/api/display/config` every 30 s and reloads once it is allowed again
  (display access switched back to open).

## Admin panel

- Draft model: the full `StoredConfig` is edited locally and saved with `PUT /api/admin/config`; per-screen pages edit
  the screen chosen in the header switcher ("Editing: Living room ▾").
- Navigation groups: Home (dashboard) · Screen (layout, background, settings, date & time, per screen) · Content
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

See [SECURITY.md](../SECURITY.md). In short: the display API needs a private-link key, a paired-device token or an
admin session (open mode: unauthenticated, LAN) and never returns URLs/tokens; the admin uses a session cookie (`SameSite=Lax`) plus a JSON content-type CSRF guard on mutating routes;
webhooks use hashed bearer tokens with rate limiting; uploaded file names are sanitised. Network trust lives in
`server/lib/net.js`: the Host allowlist (DNS rebinding), `isLanClient` (private address, not relayed by an untrusted
proxy, not the container gateway in strict mode) used by the setup wizard, the weak-`ADMIN_PASSWORD` rule and the
photo routes, and the outbound address filter used by the unauthenticated setup ICS test.

## Installer and releases

`install.sh` at the repository root is the only installer; `deploy/install.sh` calls it with `--source <checkout>`.

- **Release installs** (default): `<dir>/releases/<version>/` holds an extracted release tarball with its
  `node_modules` (`npm ci --omit=dev`), `<dir>/current` is a symlink to the running one, `<dir>/data/` and `<dir>/.env`
  are shared (each release links to them as `data` and `.env`). `<dir>` is `~/marco` for a normal user (the installer
  uses sudo for the system parts) and `/opt/marco` when run as root (service user: `$SUDO_USER`, or a system user
  `marco` for a server-only install).
- **Updates** (`marco update`, or the installer again) download the newest `marco-<version>.tar.gz`, check it against
  its `.sha256`, prepare it next to the running one, swap `current` (rename of a new symlink), restart and wait for
  `/api/health`. If the new version does not answer within 45 s, `current` goes back to the previous release (kept on
  disk) and the service restarts. Older releases are removed. Data is never touched. The `marco` command and the
  stored installer are replaced only after the new version answers, so a rollback keeps the previous copies.
  An update never installs an older version than the running one (`--force` allows it), and an install made from a
  release stops with an error when GitHub does not say which release is the latest, instead of building from git.
- **No release yet**: the installer clones the repository (`--version x.y.z` clones the tag `vx.y.z`), runs `npm ci`,
  `npm run build` and `npm prune --omit=dev`, then continues as above. When the clone is the commit already running,
  it says so and stops (`--force` rebuilds).
- **Checkout installs** (made with `git clone` + `deploy/install.sh`): updated in place with `git pull --ff-only`,
  `npm ci` and `npm run build`; data stays in `<checkout>/data`.
- `/etc/marco.conf` records mode, layout, folder and user for the `marco` command (`deploy/marco`, installed to
  `/usr/local/bin/marco`); the installer keeps a copy of itself in `/usr/local/lib/marco/install.sh` for
  `marco update` and `marco uninstall`.
- **Release tarball** (`scripts/package-release.sh`, run by `.github/workflows/release.yml` on `v*` tags after tests and
  the build): `server/` (without tests), `dist/`, `deploy/`, `install.sh`, `package.json`, `package-lock.json`,
  `web/shared/iconRules.json`, `.env.example` and the license files. The release notes are the version's CHANGELOG
  section (`scripts/release-notes.js`). The release also carries `install.sh` and `install.sh.sha256`, so the
  installer can be checked before it runs (`releases/latest/download/install.sh`).
- **Demo video**: `marco-demo.mp4` (about 15 MB) is too big for the repository. It lives in a fixed pre-release
  tagged `media`, created once with
  `gh release create media marco-demo.mp4 --prerelease --title "Media" --notes "Files linked from the README"`
  (a pre-release, so `releases/latest` keeps pointing at the newest version). The READMEs link to
  `releases/download/media/marco-demo.mp4`, which does not change from one release to the next. The release
  workflow also copies the video into each version's release when the `media` release has it. The animated preview and the screenshots live in `docs/media/` and
  `docs/screenshots/` (WebP).
- Testing hooks (not for normal use): `--tarball-url <url>` or `MARCO_TARBALL_URL` installs a given tarball (its
  `.sha256` must sit next to it), `MARCO_REPO_URL` changes the git source.
