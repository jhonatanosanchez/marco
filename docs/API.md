# HTTP API

All endpoints speak JSON. TypeScript types for every request and response live in
[`web/shared/types.ts`](../web/shared/types.ts). See [ARCHITECTURE.md](ARCHITECTURE.md) for the data model.

- **Public (display) endpoints** need no authentication and are meant for your LAN. They never return calendar URLs,
  Google accounts, tokens or Home Assistant credentials.
- **Admin endpoints** need a session cookie (log in with `POST /api/auth/login`). Mutating requests must send
  `Content-Type: application/json` (CSRF guard; photo uploads are the multipart exception).
- **Webhooks** need `Authorization: Bearer <token>` (create tokens in *Admin → API & webhooks*).

Every display endpoint accepts `?screen=<slug|id>` (case-insensitive). Absent → default screen; unknown → default
screen with `screenFallback: true` in the config.

## Public (display) API

| Method & path | Response |
|---|---|
| `GET /api/health` | `{ ok, uptime, version }` |
| `GET /api/display/config?screen=` | `DisplayConfig` — flat view of one screen; `calendar.sources` only as `{ id, name, color, emoji, kind }`; enabled `schedules` for this screen |
| `GET /api/events?screen=&from=YYYY-MM-DD&to=YYYY-MM-DD` | `{ generatedAt, hash, events: CalEvent[], errors: [{ sourceId, message }] }` |
| `GET /api/weather?screen=` | `{ updatedAt, locationName, current, today, daily[], hourly[], indoor }` (localized descriptions, cache 10 min) |
| `GET /api/news` | `{ updatedAt, items: [{ id, title, summary, source, date, image? }] }` (cache 15 min) |
| `GET /api/photos?screen=&count=20&after=` | `{ photos: [{ url, author?, title?, source: "stock"\|"gallery", file?, focusX?, focusY? }] }` — gallery photos follow the screen's `background.order` (`random` \| `newest` \| `name`); hidden photos are never returned. `after` = gallery `file` the display showed last: sequential orders continue right after it (wrapping around), `random` avoids starting with it. Without `after`, the server remembers where the previous batch for that screen ended. Falls back to stock when no gallery photo is in rotation |
| `GET /api/countdowns?screen=` | `{ generatedAt, today, hash, items: [{ id, title, emoji, color, date, days, origin, age? }] }` |
| `POST /api/display/heartbeat` | Body `DisplayHeartbeat` (≤ 4 kB: clientId, screen, version, resolution, dpr, webgl, night state, photo frame…) → `HeartbeatResponse` |
| `GET /api/stream?screen=&client=` | Server-Sent Events, see below |
| `GET /media/photos/<file>`, `GET /media/thumbs/<file>` | Gallery images and thumbnails |

`CalEvent`: `{ id, sourceId, title, start, end, allDay, location, color, emoji, kind, multiDay, age? }` — `start`/`end`
are ISO strings with offset, or `YYYY-MM-DD` for all-day events (`end` exclusive).

### Server-Sent Events (`/api/stream`)

| Event | Data | When |
|---|---|---|
| `hello` | `{ revision, screenId, slug, clientId, serverVersion, now }` | on connect |
| `config` | `{ revision }` | config saved — the display refetches its config and re-renders without reloading |
| `events` | `{ hash }` | calendar data changed (also refetch countdowns) |
| `photos` | `{}` or `{ hidden: [file, …] }` | gallery changed (`hidden` lists photos just taken out of the rotation; a display showing one of them moves on right away) |
| `reload` | `{}` | "Refresh displays", display command or webhook |
| `announce` | `Announcement` | announcement sent; replayed on connect while still active |
| `announce-clear` | `{ id \| null }` | announcement removed early (`null` = all) |
| `identify` | `{ name, slug, clientId, durationSec }` | show the screen name full-screen |
| `night` | `{ mode: "on" \| "off" \| "auto" }` | night mode override |
| `ping` | `{ t }` | every 25 s |

Displays whose screen has alerts disabled do not receive `announce`.

## Authentication

| Method & path | Notes |
|---|---|
| `GET /api/auth/me` | `{ user: { email, name, picture, method } \| null, needsSetup, googleConfigured, passwordLoginEnabled, mustChangePassword, passwordFromEnv }` |
| `POST /api/auth/login` | `{ password }` — `409 { needsSetup: true }` while the install has no password yet |
| `POST /api/auth/logout`, `POST /api/auth/logout-all` | log out this session / every session |
| `GET /auth/google/login` | "Sign in with Google" (email must be in `auth.allowedGoogleEmails`; if the list is empty, the first Google login made while already logged in with the password adds itself) |
| `GET /auth/google/connect` | Link a Google account for calendars (scope `calendar.readonly`, offline access) — requires a session |
| `GET /auth/google/callback` | OAuth redirect URI: `${PUBLIC_URL}/auth/google/callback` |

## Setup (first run)

A fresh install has **no admin password** (and no default one): until the setup wizard completes, the admin panel
shows the wizard and the display shows a welcome screen. Installs that already have a password hash never enter
setup. When `ADMIN_PASSWORD` is set and no hash exists yet, it becomes the initial password at startup (headless
installs) and setup is skipped; the panel then offers to change it (`passwordFromEnv`).

| Method & path | Notes |
|---|---|
| `GET /api/setup/status` | `SetupStatus`: `{ needsSetup, googleConfigured, version, suggestedLanguage }`; while `needsSetup` also `tokenRequired`, `tokenValid` (when an `x-setup-token` header was sent; `null` otherwise — a wrong token counts towards the lockout below, `429` while locked), `defaults` and, for LAN clients, `lanAddresses` (real LAN interfaces only; empty in a container unless `LAN_ADDRESS` is set) |
| `POST /api/setup/test-ics` | `{ url }` → `TestIcsResponse` (the wizard's "Test" button). Unauthenticated, so it refuses loopback, link-local / cloud-metadata, multicast and unspecified destinations (also after redirects) and returns only generic errors (`address not allowed`, `HTTP <status>`, `could not load the calendar`) |
| `POST /api/setup/complete` | `SetupRequest` → `{ ok, user, screen: { slug, name } }` and a session cookie (logged in) |

`SetupRequest`: `{ password, passwordConfirm, language: es|en|pt, screenName, location?: { name, lat, lon, timezone },
timezone? (when the location is skipped), units?: metric|imperial, format24?, calendars?: [{ name, url, kind: holidays|generic }] (≤ 20), photos?: { source:
stock|gallery|mixed }, layout?: { preset }, accent?: #rrggbb, ambient?: aurora|particles|none, theme?: dark|light }`.
The password must have at least 10 characters, must not be a common password or a trivial pattern (`1234567890`,
`aaaaaaaaaa`, `qwertyuiop`, `password2024!`…) and must equal `passwordConfirm` (the same rules apply to
`PUT /api/admin/password`).

Rules for the mutating setup endpoints:

- **Single use**: once a password exists they answer `409 { error: "setup already completed" }`.
- **Race-safe**: the first `complete` claims the wizard before hashing; a concurrent one gets `409`.
- **JSON only, same origin**: `Content-Type: application/json` is required (`415` otherwise, even for an empty body)
  and a present `Origin` must match the host and be an allowed host name (`403`). Requests whose `Host` is not an
  allowed name get `421` on every route except `/api/health` and `/api/hooks/*` (DNS-rebinding guard: IP literals,
  `localhost`, single-label names, `*.local`/`*.lan`/`*.home.arpa`/`*.internal`, the `PUBLIC_URL` host, `ALLOWED_HOSTS`).
- **Validation**: `400 { error, details: [{ path, message }] }`; nothing is written until everything is valid.
- **Setup token**: with `SETUP_TOKEN` set, every request needs it (`x-setup-token` header or `{ token }` in the
  body). `SETUP_REQUIRE_TOKEN=1` (set in the Docker image) and an install whose config was saved before (revision > 1,
  i.e. `secrets.json` was lost) require the random per-process token in the same way. Otherwise LAN clients need no
  token — a loopback/private address that was not relayed by a proxy missing from `TRUST_PROXY` and is not the
  container's gateway — and any other client needs the per-process token printed in the server log at startup
  (`[setup] Open http://localhost:PORT/admin/?setup=<token> to finish setup`, plus one line per detected LAN address
  and the `PUBLIC_URL` when it is not localhost; replace `localhost` with the server's address from another device).
  Missing/wrong token → `403 { code: "token_required" | "invalid_token" }`; 10 wrong tokens (on any setup endpoint,
  `/status` included) from one IPv4 address or IPv6 /64 → `429` for 10 minutes. A locked client is still let in with
  a strong token (the generated one, or a `SETUP_TOKEN` of 20+ characters), so a neighbour cannot lock the owner out.
- A `secrets.json` that exists but cannot be read stops the server at startup (it is never replaced by defaults).
- Activity entries: `auth.setup_completed`, `auth.setup_rejected` (throttled).

## Admin API (session required)

**Configuration**

| Method & path | Notes |
|---|---|
| `GET /api/admin/config` | Full `StoredConfig` |
| `PUT /api/admin/config` | Validate + save (revision + 1, backup first, SSE `config`). `400 { error, details: [{ path, message }] }` when invalid |
| `PUT /api/admin/password` | `{ current, next }` — same password rules as the setup wizard (`400 { code: too_short \| too_common \| too_long }`); also logs out other sessions |
| `GET /api/admin/screens/template?name=` | New `ScreenProfile` with defaults and a free slug |
| `POST /api/admin/events/preview` | Body `{ from?, days? (1..60), screen?, eventRules?, iconRules?, localEvents?, birthdays? }` (draft values) → every event incl. hidden ones with `applied[]` rules and `ruleHits` |
| `POST /api/admin/birthdays/parse-csv` | `{ text }` — one `name;dd/mm[/yyyy]` per line (`;`, `,` or tab) → parsed rows, duplicates, errors with line numbers |
| `GET /api/admin/dashboard` | Next events, weather now, active schedules, recent activity, warnings |
| `GET /api/admin/status` | Per-source last fetch / errors, weather and news status, display count, uptime |

**Sources and integrations**

| Method & path | Notes |
|---|---|
| `GET /api/admin/google/accounts` · `DELETE /api/admin/google/accounts/:email` | Linked Google accounts |
| `GET /api/admin/google/calendars?account=` | Calendars of a linked account |
| `POST /api/admin/test/ics` | `{ url, insecureTls? }` → `{ ok, count, sample, error? }` |
| `POST /api/admin/test/rss` | `{ url }` → `{ ok, title, count, error? }` |
| `POST /api/admin/test/homeassistant` | `{ url, token? }` → `{ ok, version?, error? }` |
| `GET /api/admin/homeassistant/entities?domain=sensor\|weather` | `[{ entity_id, name, state, unit }]` |
| `PUT /api/admin/homeassistant/token` | `{ token }` |

**Photos**

| Method & path | Notes |
|---|---|
| `GET /api/admin/photos` | `[{ file, url, thumbUrl, size, mtime, w, h, focusX, focusY, uploadedAt, hidden }]` |
| `POST /api/admin/photos/check` | `{ names }` → which names already exist |
| `POST /api/admin/photos?onConflict=rename\|replace\|skip` | multipart `photos[]` (≤ 100 MB each), optional `thumbs[]` and `meta` (`[{ focusX, focusY }]`) |
| `PATCH /api/admin/photos/:file` | `{ focusX, focusY }` (0..1) and/or `{ hidden: boolean }` (take the photo out of / back into the rotation) → the photo |
| `POST /api/admin/photos/visibility` | `{ files: string[] (1..2000), hidden: boolean }` → `{ ok, updated, missing, total, inRotation }` (bulk show / hide) |
| `PUT /api/admin/photos/:file/thumb` | multipart `thumb` |
| `DELETE /api/admin/photos/:file` | |

**Displays, announcements, tokens**

| Method & path | Notes |
|---|---|
| `GET /api/admin/displays` | Connected and known displays (screen, IP, browser, resolution, dpr, WebGL, version, outdated…) |
| `POST /api/admin/displays/command` | `{ action: "reload"\|"identify"\|"night", mode?, clientIds?, screens? }` → `{ ok, delivered }` |
| `DELETE /api/admin/displays/:clientId` | Forget an offline display |
| `POST /api/admin/refresh-displays` | `{ screens? }` — hard reload |
| `POST /api/admin/announce` | `AnnounceRequest` (see webhooks) → `{ ok, announcement, delivered }` |
| `GET /api/admin/announcements` · `DELETE /api/admin/announcements[/:id]` | Active + history; clear one or all |
| `GET /api/admin/tokens` · `POST /api/admin/tokens { name }` · `DELETE /api/admin/tokens/:id` | API tokens (the full token is returned once on creation; max 20) |

**Backups and activity**

| Method & path | Notes |
|---|---|
| `GET /api/admin/backups` · `POST /api/admin/backups` | List / create a manual backup |
| `GET /api/admin/backups/:id` · `POST /api/admin/backups/:id/restore` · `DELETE /api/admin/backups/:id` | Download / restore (current config backed up first) / delete |
| `POST /api/admin/export` | `{ includeSecrets }` → `marco-YYYY-MM-DD.json` (secrets = password hash, HA token, Google accounts, API tokens; never the session secret) |
| `POST /api/admin/import/preview` | `{ bundle, lang? }` (export bundle or a bare config) → per-section summary in `lang` (es/en/pt; default: `Accept-Language`, else English), nothing saved |
| `POST /api/admin/import/apply` | `{ bundle, sections?, includeSecrets? }` → `{ ok, config, loggedOut? }` |
| `GET /api/admin/activity?type=&level=&q=&actor=&before=&limit=` | Newest first, paged with `before=<id>` |
| `DELETE /api/admin/activity` | Clear the log |

## Webhooks (`/api/hooks/*`)

Authentication: `Authorization: Bearer cs_…` only (no cookies, no tokens in URLs). JSON bodies.
Errors: `401` missing/invalid token, `400` invalid data (e.g. unknown screen), `415` body is not JSON,
`429` more than 30 requests per minute with the same token.

| Endpoint | Body | Response |
|---|---|---|
| `GET /api/hooks/ping` | — | `{ ok: true, token: "<name>" }` |
| `POST /api/hooks/announce` | `title` (≤ 120) and/or `body` (≤ 500), `emoji`, `style` (`info`/`success`/`warning`/`urgent`), `durationSec` (5–86400, default 30), `sound`, `screens` (slugs or ids; omitted = all) | `{ ok, announcement, delivered }` |
| `POST /api/hooks/reload` | `{ screens? }` | `{ ok, delivered }` |
| `POST /api/hooks/night` | `{ mode: "on"\|"off"\|"auto", screens? }` | `{ ok, delivered }` |

`delivered` = number of connected displays that received it. Active announcements survive server restarts.

```bash
TOKEN=cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
curl -H "Authorization: Bearer $TOKEN" http://192.168.1.50:3000/api/hooks/ping
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Oven is on!","emoji":"🔥","style":"urgent","durationSec":600,"sound":true,"screens":["kitchen"]}' \
  http://192.168.1.50:3000/api/hooks/announce
```
