# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Gallery: choose which photos are in the rotation — an always-visible eye toggle on each photo (with a confirmation
  toast), an "N of M in rotation" counter, *All / In rotation / Hidden* filters and a selection mode to show or hide
  many photos at once. Hidden photos stay in the gallery (flag stored in `photos/.meta.json`, kept on replace) and
  are skipped by the display immediately; if everything is hidden the screen falls back to stock photos.
- Background → *Photo order*: `random` (default; shuffled without repeating the previous batch), `newest` or `name`.
  Sequential orders continue where the screen left off (`GET /api/photos?after=`) and wrap around.
- API: `PATCH /api/admin/photos/:file` accepts `{ hidden }`; new `POST /api/admin/photos/visibility` for bulk
  changes; `background.order` in the screen config; the `photos` stream event may carry `{ hidden: [...] }`.

## [0.2.0] — 2026-10-09 — first public release

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
