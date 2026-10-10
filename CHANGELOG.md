# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Display style** (*Layout → Display style*, `screen.style`): every screen can now be *Classic* (the look so far,
  still the default, so existing screens do not change) or *Modern*, a more minimal, Apple-like look: glass widget
  cards over the photo with a light edge, a Lock Screen clock with the date on top, the month grid in the iOS
  Calendar idiom (no column lines, today as a filled circle, colour dots for timed events), agenda days as list
  cards, a Weather-widget layout, notification-style alerts and scheduled messages. It works with every layout,
  portrait and landscape, the light and dark themes, night mode, the weather effect and `?lite=1` (solid cards
  instead of blur). Modern uses the system font (SF on Apple devices) and falls back to the bundled Inter
  elsewhere. Preview it with `?style=modern` (or `?style=classic`).

## [0.4.0] - 2026-10-09

A realistic weather effect over the photo, a polling mode for hosts without a live stream, and a language fix for
the pairing screen.

### Added
- **Weather effect** (*Background → Weather effect*, `background.weatherFx`): *Off*, *Simple* (the light rain and
  snow particles from earlier versions, still the default) or *Realistic*: drops on the glass that bend the photo
  only inside each drop, faint rain streaks, layered snow and soft sun rays on clear days. No blur or tint, so the
  calendar stays easy to read, and no flashes at night. *Realistic* needs WebGL and the WebGL photo transition;
  `?lite=1` turns the effect off.
- Demo URL parameters `?wx=clear|rain|snow|drizzle|thunder` and `?wxfx=off|simple|rich` to preview the weather and
  the effect without waiting for the forecast.
- **Poll mode for displays**: when `GET /api/health` returns `live: 'poll'`, the display skips the live stream and
  checks the config revision every 90 seconds. Self-hosted servers return `live: 'sse'` and keep the live stream.

### Fixed
- A screen whose private link was regenerated or whose paired device was revoked now keeps the language it was
  showing on the "This link is no longer valid" and pairing screens, instead of switching to the browser's language.

## [0.3.0] - 2026-10-09

Private display links and pairing, a one-line installer with the `marco` command, release packages, more icon
rules, a new logo and new screenshots, diagram and demo video.

### Added
- **Private display links**: every screen gets an unguessable link `/d/<key>` (random UUIDv4, 122 bits) shown in
  *Screen → Settings → Private link* with copy, QR code, open, **Regenerate link** and the ready-made Raspberry Pi
  command. The key binds the screen (`?screen=` is ignored with it).
- **Device pairing**: a display without a key (or at `/pair`) shows a 6-character code (31-symbol alphabet without
  look-alikes) and a QR code to `/admin/#pair=<code>`; *Connected screens → Pair a screen* claims it for a screen and the
  waiting display receives its own revocable device token (256 bits, stored hashed) through a secret pairing session
  id. Codes live 10 minutes, are single use, only valid while the display waits, and claims are rate-limited.
- *Connected screens*: how each display got in (private link, paired device, admin session, no key), **Paired devices**
  with last seen, edit (rename / move to another screen) and **Revoke**.
- **Display access** setting (*Security*): `private` (default for new installs) or `open` (legacy LAN mode). The
  dashboard, *Connected screens* and *Screen → Settings* recommend switching while open.
- Displays with a regenerated link, a revoked device or no key switch live (SSE `revoked`) to a "This link is no longer
  valid" / pairing screen that shows no family data and wipes the display's cached data.
- Setup wizard: the *Done* step shows the screen's private link and QR code (and the kiosk command with it); a display
  showing the welcome screen switches to a pairing code when setup completes.
- API: `GET /api/admin/display-links`, `POST /api/admin/display-links/:screenId/regenerate`, `GET/PATCH/DELETE
  /api/admin/devices[/:id]`, `POST /api/admin/pair/claim`, `POST /api/pair/start`, `POST /api/pair/status`; display
  credentials in `X-Marco-Key` (or `?k=` for the SSE stream and `/media/*`); `access`/`deviceName` in
  `GET /api/admin/displays`; `security.displayAccess` in the config. Exports with secrets carry the display keys and
  paired devices (hashes), so an import on a new server keeps every link and device working.
- `npm run demo` runs in private mode and prints each screen's private link (plus a paired demo device).
- **One-line installer**: `curl -fsSL https://marcohome.app/install | bash` (`install.sh` at the repository root).
  It asks what the device should do (all in one, server only, or screen only for a server elsewhere), or takes
  `--mode all|server|kiosk --url <private link> --port --dir --user --version --yes`. It checks the system (Debian
  12/13, Raspberry Pi OS Bookworm/Trixie, Ubuntu 22.04+; x86_64, arm64, armv7), the Raspberry Pi model, the desktop
  (labwc, Wayfire, X11, or X started from `~/.xinitrc`) and the read-only overlay, installs Node.js 22 when needed
  (checked against `SHASUMS256.txt`), downloads the prebuilt release and verifies its SHA-256, sets up the systemd
  service and the kiosk, and ends with the admin address and a QR code. `--dry-run` prints every action without
  changing anything; `--update` and `--uninstall [--purge]` are built in (uninstall asks first, with no as the
  default answer, and needs `--yes` when there is no terminal). Until a release is published it builds
  from git. A kiosk-only install downloads the four kiosk scripts it needs, so git is not required.
- **`marco` command**: `marco status`, `logs [-f]`, `restart`, `update` (checksum verified, switched in one step,
  rolled back if the new version does not start, never to an older version without `--force`), `url` (admin address and each screen's private link with QR
  codes), `version`, `uninstall` (keeps your data unless `--purge`).
- **Release packages**: tagging `v*` builds `marco-<version>.tar.gz` (server, built web interface, deploy scripts,
  no `node_modules`) with a `.sha256`, and publishes a GitHub release with the notes from this changelog plus
  `install.sh` and `install.sh.sha256`, so the installer can be checked before it runs. CI runs shellcheck on every
  shell script.
- **More icon rules**: 35 categories with about 400 keywords in English, Spanish and Portuguese (train, pharmacy,
  exams, swimming, haircut, coffee, drinks, parties, work, deliveries, repairs, cleaning, bin day, garden,
  deadlines, music lessons, babysitter and more). The list lives in `web/shared/iconRules.json`, shared by the
  server and the web UI. Existing installs get the new keywords and categories once, added after their own rules;
  nothing is removed or reordered, and rules deleted afterwards stay deleted (marker file `data/.iconrules-v2`).
- Gallery: choose which photos are in the rotation: an always-visible eye toggle on each photo (with a confirmation
  toast), an "N of M in rotation" counter, *All / In rotation / Hidden* filters and a selection mode to show or hide
  many photos at once. Hidden photos stay in the gallery (flag stored in `photos/.meta.json`, kept on replace) and
  are skipped by the display immediately; if everything is hidden the screen falls back to stock photos.
- Background → *Photo order*: `random` (default; shuffled without repeating the previous batch), `newest` or `name`.
  Sequential orders continue where the screen left off (`GET /api/photos?after=`) and wrap around.
- API: `PATCH /api/admin/photos/:file` accepts `{ hidden }`; new `POST /api/admin/photos/visibility` for bulk
  changes; `background.order` in the screen config; the `photos` stream event may carry `{ hidden: [...] }`.
- **Docs and media**: new screenshots of every admin page, the setup wizard, the display layouts and the pairing
  flow (WebP, in `docs/screenshots/`), a "How it works" diagram for light and dark themes, an animated preview and a
  poster frame (`docs/media/`). A 48-second demo video (`marco-demo.mp4`) is linked from the READMEs; it is kept in a fixed `media` release on
  GitHub because it is too big for the repository. The
  READMEs (English and Spanish) are rewritten around the one-line installer, with instructions to check it before
  running it.

### Changed
- The display API (`/api/display/*`, `/api/events`, `/api/weather`, `/api/news`, `/api/photos`, `/api/countdowns`,
  `/api/stream`, heartbeat) and `/media/*` require a display key, a device token or an admin session in private mode
  (`401 key_required` / `403 invalid_key`, no data). **Upgrading keeps your displays working**: a config saved by 0.2
  loads with display access `open`; switch to private in *Security* after opening each display's private link (or
  pairing it). Restoring an older backup or importing an older export keeps the current mode.
- Raspberry Pi docs and the setup wizard use the private link as the kiosk URL; on an all-in-one install
  `deploy/kiosk.sh` turns a keyless `http://localhost` URL into the screen's private link (read from the local data
  folder on every Chromium start; the kiosk log shows it redacted). `deploy/Caddyfile.example` explains what to expose
  in each mode.
- The private-link card and the setup wizard show the one-line kiosk command
  (`curl -fsSL https://marcohome.app/install | bash -s -- --mode kiosk --url <link>`).
- `deploy/install.sh` is now a thin wrapper around `install.sh` for git checkouts (same options as before, plus
  `--dry-run`); `marco update` on such an install runs `git pull` and rebuilds.
- `deploy/marco.service` takes the data folder and the `.env` path from the installer.
- Kiosk: Chromium starts with `--force-device-scale-factor=1` (override it in `KIOSK_EXTRA_ARGS`) and
  `--disable-translate`.
- New logo: two arches, one with the sun and one with the moon, inside an M-shaped frame. It replaces the calendar
  badge in the admin sidebar, login, setup wizard and the display's welcome and pairing screens, and comes as a
  favicon set (`favicon.svg`, 32 px PNG, 180 px `apple-touch-icon.png`, 512 px icon). Lockups for light and dark
  backgrounds are in `docs/`. The display page title is now "Marco".
- The server's Express app is built by `server/app.js` (`createApp()`), so the tests exercise the real middleware stack.
- Text clean-up in the docs, the admin and the display: plainer wording, and no em dashes in English, Spanish or
  Portuguese strings. Empty values in the admin show "–".

### Security
- Display keys, device tokens and pairing session ids are compared in constant time and never logged (server log URLs
  and activity-log data are redacted); every response sends `Referrer-Policy: no-referrer`, keyed responses
  `Cache-Control: private, no-store`, and `/d/*` adds `X-Robots-Tag: noindex`. Threat model and brute-force math in
  `SECURITY.md`.
- Open display streams follow every credential change, not only *Regenerate link* / *Revoke*: each stream keeps a hash
  of the key or device token it opened with and is re-checked after config saves, imports, session revocation and on
  every heartbeat. Importing secrets that replace a screen's key or drop a paired device closes the streams still
  using them (`revoked { code: "invalid_key" }`), and the import preview lists the links and devices it would change.
- Live streams opened with an admin session (previews, "View screen") close on *Log out everywhere*, a password change,
  an imported password, a disabled login method, a plain logout of the same browser and after the session lifetime.
- Moving a paired device to another screen closes its stream (after `reload`), so a client that ignores `reload` no
  longer receives the old screen's announcements.
- Restoring a backup or importing a bundle never changes *Display access*. The import preview says the mode is kept.
- The installer writes `.env` and `kiosk.env` with mode 600, never prints a private link in full, and keeps the
  folders it creates in a user's home owned by that user.

## [0.2.0] - 2026-10-09

First public release.

### Display
- Month calendar (configurable weeks), agenda and week views; five layouts (`bigCalendar`, `leftRight`, `topBottom`,
  `bigTime`, `agenda`), portrait and landscape, small-screen sizing and adaptive legibility over photos.
- Automatic emoji icons from editable keyword rules; birthdays with age ("🎂 Grandma Isabel (72)").
- Vacation-rental feeds (Airbnb "Reserved", Booking, property-management tools): check-in → check-out bars, guests as
  🧑🏻/🧒🏻/👶🏻/🐶 icons, 🚪 checkouts, blocked dates.
- Clock with seconds, weather (Open-Meteo or Home Assistant, indoor sensors, rain effect), RSS news ticker, countdowns,
  to-do list, message of the day, highlights ("Check-in today", "Next: …").
- Background photos (stock or your own gallery) with WebGL transitions, focal-point aware cropping and an ambient
  aurora; `?lite=1` for low-power devices; night mode.
- Invisible live refresh via Server-Sent Events, offline tolerance, instant announcements with chime, scheduled
  messages, identify / reload / night commands, multi-screen profiles (`?screen=slug`), built-in demo (`?demo=1`).

### Admin panel
- First-run setup wizard (language, admin password with strength meter, location, calendars with holiday presets and
  iCal test, look, display URL + QR code); no default password, optional `SETUP_TOKEN`; the display shows a welcome
  screen with a QR code until setup is done.
- Password and Google sign-in (allow-list), sessions management.
- Calendars (iCal/ICS and Google Calendar via OAuth), icon rules, local events with recurrence, birthdays (CSV import),
  filters & overrides with live preview, countdowns, weather, news, Home Assistant, photo gallery (in-browser
  optimisation, HEIC conversion, thumbnails, focal-point editor, duplicate handling).
- Multiple screens, connected displays, announcements and scheduled messages, API tokens and webhooks,
  backups / export / import, activity log, home dashboard, command palette (Ctrl/Cmd+K), English / Spanish / Portuguese.

### Deployment
- Raspberry Pi installer (all-in-one, server-only or kiosk-only with `--url`), systemd service, Chromium kiosk script,
  HDMI schedule script, Caddy example, Docker image and Compose file, `npm run demo`.

### Security
- Host-name allowlist against DNS rebinding (LAN names, IP addresses, `PUBLIC_URL`, `ALLOWED_HOSTS`); the CSRF
  guard also checks the `Origin` against it.
- "From the LAN" ignores clients relayed by a proxy missing from `TRUST_PROXY` and, for setup and weak passwords, the
  container gateway; the Docker image always asks for the setup token (`SETUP_REQUIRE_TOKEN=1`).
- Setup-token failures are counted on every setup endpoint (per IPv4 address / IPv6 /64, bounded table); an
  unreadable `secrets.json` stops the server instead of reopening setup; a previously configured install needs the token.
- The unauthenticated setup iCal test refuses loopback / link-local / metadata destinations and returns generic errors.
- Gallery photos (`/media/*`) are served only to LAN clients or a signed-in admin; an `ADMIN_PASSWORD` that breaks the
  password rules is LAN-only.
