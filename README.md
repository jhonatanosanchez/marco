<div align="center">

<img src="docs/logo.svg" width="96" height="96" alt="Marco logo: a rounded photo frame holding a small calendar with a sun">

# Marco

### Your family's day, framed.

*Marco* is Spanish for "frame" — a photo frame that also frames your family's day.

**A beautiful family wall calendar and dashboard for a Raspberry Pi — or any browser — that you host yourself.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](#docker)
[![Languages](https://img.shields.io/badge/i18n-English%20%C2%B7%20Espa%C3%B1ol%20%C2%B7%20Portugu%C3%AAs-orange)](#)

**English** · [Español](README.es.md)

![Marco on a 1920×1080 display: clock, highlights, countdowns, weather and a month calendar with events, birthdays and vacation-rental stays](docs/screenshots/display-1920x1080.png)

</div>

## Why

Marco is inspired by [DAKboard](https://dakboard.com/): a wall display that shows your family calendar,
the time, the weather, photos and news at a glance. It is a **free, open-source, self-hosted alternative** that you run
on your own Raspberry Pi, home server or NAS **inside your local network**. There is no account, no subscription and
no cloud in the middle: your configuration, photos and calendar data stay at home. The only outbound traffic goes to the
calendars, weather and news feeds *you* connect.

> Marco is an independent project. It is not affiliated with, endorsed by or connected to DAKboard;
> DAKboard is a trademark of its owner.

**Contents:** [Features](#features) · [How it works](#how-it-works) · [Try it](#try-it-in-one-minute) ·
[Quick start](#quick-start) · [Raspberry Pi kiosk](#raspberry-pi-kiosk) · [Google Calendar](#connecting-google-calendar) ·
[Other integrations](#other-integrations) · [Photos](#photos) · [Screens, alerts & API](#multiple-screens-alerts-and-the-api) ·
[Configuration](#configuration-reference) · [Security](#security) · [Development](#development)

## Features

### The display

| | |
|---|---|
| ![Big calendar on a 1280×720 Raspberry Pi screen](docs/screenshots/display-1280x720.png) | ![Portrait layout 1080×1920](docs/screenshots/display-portrait-1080x1920.png) |
| ![Agenda layout](docs/screenshots/display-agenda.png) | ![Big clock layout](docs/screenshots/display-bigtime.png) |
| ![Week view](docs/screenshots/display-week.png) | ![Light theme, calendar left and photo right](docs/screenshots/display-light.png) |
| ![Announcement overlay from Home Assistant](docs/screenshots/display-announcement.png) | ![Analog clock, rain effect and a scheduled message](docs/screenshots/display-rain.png) |

- **Calendar** — month (configurable number of weeks), agenda and week views; five layouts (*big calendar*,
  *left/right*, *top/bottom*, *big time*, *agenda*), landscape or portrait, each calendar with its own colour.
- **Automatic emoji** — 🎂 birthdays, ✈️ flights, 🩺 doctor, 🎒 school, ⚽ sports, 🍽️ dinners, 💼 meetings, 🏖️
  holidays, 🚗 car, 🐾 vet… from editable keyword rules (English, Spanish and Portuguese keywords out of the box).
- **Birthdays with age** — "🎂 Grandma Isabel (72)", from a birthdays calendar or entered in the admin.
- **Vacation-rental feeds** (Airbnb "Reserved", Booking, or property-management tools that publish titles like
  `🏠 Guest - 4p+1m` and `Adults/Children/Infants` description lines): check-in → check-out bars across the days,
  guests as 🧑🏻🧒🏻👶🏻🐶 icons, 🚪 check-outs, "Check-in today" highlights and blocked dates you can hide.
- **Highlights & countdowns** — "In 18 min · Client call", "Check-out · Tomorrow", "🎃 Halloween party · Tomorrow!",
  "✈️ Trip to Madeira · In 12 days".
- **Weather** — current conditions, hourly and daily forecast from [Open-Meteo](https://open-meteo.com/) (no API key),
  or your own [Home Assistant](https://www.home-assistant.io/) weather entity and indoor sensors; animated rain/snow.
- **News ticker** from any RSS/Atom feed, a to-do list and a message of the day.
- **Photo background** — stock photos or your own gallery, WebGL transitions, slow zoom, a soft "aurora" ambient
  effect, and **smart cropping** that keeps the subject (faces, pets…) in the part of the screen not covered by the
  clock or the weather.
- **Always legible** — panel blur/shade adapts to the photo; small screens get larger relative type; night mode dims
  the screen on a schedule.
- **Invisible live updates** — changes saved in the admin appear in a second through Server-Sent Events; data refreshes
  in place without ever reloading the page; keeps working with the last data if the server goes away.
- **Announcements** — instant full-screen cards with a chime ("🧺 The washing machine is done"), and **scheduled
  messages** ("🗑️ Take out the bins", Tue & Fri 20:00–22:00).
- **Built for the Pi** — 30 fps cap, pauses when hidden, `?lite=1` turns off WebGL entirely.

### The admin panel

| | |
|---|---|
| ![Admin home dashboard](docs/screenshots/admin-home.png) | ![Calendars with a linked Google account](docs/screenshots/admin-calendars-google.png) |
| ![Filters and overrides](docs/screenshots/admin-filters.png) | ![Birthdays](docs/screenshots/admin-birthdays.png) |
| ![Photo gallery: rotation counter, filters and per-photo eye toggles](docs/screenshots/admin-photos.png) | ![Focal point editor](docs/screenshots/admin-photos-focus.png) |
| ![Connected displays](docs/screenshots/admin-displays.png) | ![API tokens and Home Assistant example](docs/screenshots/admin-api.png) |

- **Home dashboard** — connected screens, next events, calendar health, weather, active alerts, recent activity and
  quick actions (refresh, identify, night mode, send an alert).
- **Calendars** — iCal/ICS URLs (incl. `webcal://` and self-signed HTTPS), **Google Calendar** through OAuth, public
  holiday presets, per-calendar colour, emoji, type (general / vacation rental / birthdays / holidays) and refresh rate.
- **Local events** (one-off or repeating weekly / monthly / yearly, with exceptions) and **birthdays** (with CSV import).
- **Filters & overrides** — hide ("Not available"), rename, or force emoji/colour for a series, with a live preview of
  the next 14 days. **Icon rules** with a tester. **Countdowns**.
- **Photo gallery** — drag & drop, in-browser optimisation (EXIF rotation, resize, thumbnails), iPhone **HEIC**
  conversion, automatic focal point with a manual editor, duplicate-name handling.
- **Multiple screens** (living room, kitchen, hallway…) each with its own layout, background, calendars and widgets,
  and a **Connected displays** page (resolution, browser, version, reload / identify / night mode per device).
- **Private display links & pairing** — every screen has an unguessable link (`/d/<key>`, QR code, one-click
  regenerate) and new devices can be paired with a 6-character code; paired devices can be renamed or revoked.
- **Alerts** — send now or schedule; **API tokens & webhooks** for Home Assistant and scripts.
- **Backups** (automatic, export/import with preview), **activity log**, **command palette** (Ctrl/Cmd + K),
  phone-friendly layout, English / Spanish / Portuguese.

| | | |
|---|---|---|
| ![Command palette](docs/screenshots/admin-home-palette.png) | ![Local event editor](docs/screenshots/admin-local-edit.png) | ![Upload conflict dialog](docs/screenshots/admin-photos-conflict.png) |
| ![Screens](docs/screenshots/admin-screens.png) | ![Alerts](docs/screenshots/admin-alerts.png) | ![Activity log](docs/screenshots/admin-activity.png) |
| ![Backups](docs/screenshots/admin-backups.png) | ![Countdowns](docs/screenshots/admin-countdowns.png) | ![Icon rules](docs/screenshots/admin-icons.png) |
| ![Sign-in page](docs/screenshots/admin-login.png) | ![Local events](docs/screenshots/admin-local.png) | |

<p align="center">
  <img src="docs/screenshots/mobile-home.png" width="230" alt="Admin on a phone: home">
  <img src="docs/screenshots/mobile-home-menu.png" width="230" alt="Admin on a phone: menu">
  <img src="docs/screenshots/mobile-calendars.png" width="230" alt="Admin on a phone: calendars">
</p>

## How it works

```mermaid
flowchart LR
  subgraph home["Your home network"]
    server["Marco server<br/>Node.js · Pi / home server / NAS / Docker<br/>data/ = config, photos, backups"]
    tv["Wall display<br/>Raspberry Pi + Chromium kiosk"]
    tablet["Kitchen tablet / TV browser<br/>/d/&lt;private key&gt;"]
    phone["Phone or laptop<br/>/admin/"]
    ha["Home Assistant<br/>(optional)"]
  end
  google["Google Calendar API"]
  feeds["iCal feeds · Open-Meteo · RSS · picsum.photos"]

  server -- "HTTP + live updates (SSE)" --> tv
  server -- "HTTP + live updates (SSE)" --> tablet
  phone -- "configure" --> server
  ha -- "webhooks: alerts, night mode" --> server
  server -- "sensors, weather" --> ha
  server --> google
  server --> feeds
```

- One small **Node.js server** (no database, no native modules) fetches and caches your calendars, weather and news,
  stores your settings and photos in a `data/` folder and serves two web apps.
- **Displays** are just browsers: a Raspberry Pi in kiosk mode, an old tablet, a smart-TV browser. Each one opens its
  screen's **private link** (`/d/<key>`) or is **paired** with a code. They receive changes instantly through
  Server-Sent Events.
- The **admin panel** at `/admin/` works from any phone or computer on your network.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/API.md](docs/API.md).

## Try it in one minute

```bash
git clone https://github.com/mr-reb00t/marco.git
cd marco
npm ci
npm run demo
```

`npm run demo` builds the web UI if needed and starts a server with a **throw-away data directory** filled with a
fictional family: two screens ("Living room" and "Kitchen"), local events, birthdays, countdowns, filters, a
vacation-rental feed and a school calendar (served locally), sample photos from picsum.photos with focal points, an API
token and some activity history. Your real `data/` folder is never touched.

- Display: the demo prints each screen's **private link** (`http://localhost:3000/d/<key>`); <http://localhost:3000/pair>
  shows a pairing code to try *Connected screens → Pair a screen*
- Admin: <http://localhost:3000/admin/> — password **`demo-calendar`**
- Options: `--port 3080`, `--lang es` (or `pt`), `--no-photos`, `--data ./demo-data --keep`

![The demo's kitchen screen: light theme, agenda, to-do list and live weather](docs/screenshots/display-kitchen-live.png)

Just want to see the display? Any running instance shows a built-in sample dataset at `/?demo=1`
(add `&lang=es`, `&preset=agenda`, `&theme=light`, `&announce=success`, `&sched=1`, `&now=2026-10-09T10:42`…).

## Quick start

Requirements: **Node.js 20 or newer** (22 LTS recommended) on Linux, macOS or Windows — or Docker.

### With Node.js

```bash
git clone https://github.com/mr-reb00t/marco.git
cd marco
npm ci
cp .env.example .env        # optional: PORT, PUBLIC_URL, Google keys, SETUP_TOKEN
npm run build
npm start                   # http://localhost:3000/  and  http://localhost:3000/admin/
```

On a Raspberry Pi or any Debian-based machine, `deploy/install.sh` does all of this for you and installs a systemd
service — see [Raspberry Pi kiosk](#raspberry-pi-kiosk).

### Docker

```bash
git clone https://github.com/mr-reb00t/marco.git
cd marco
docker compose up -d        # builds the image and starts it on port 3000
docker compose logs marco | grep setup   # the one-time setup URL
```

Then open that setup URL — replace `localhost` with the server's address if you are on another device — and follow
the [setup wizard](#first-steps-the-setup-wizard). There is **no default password**: the wizard creates it. In Docker
the wizard **always** asks for this one-time code (the image sets `SETUP_REQUIRE_TOKEN=1`), because inside a container
every client can look like a LAN client. Data lives in the `marco-data` volume (`/data` in the container).
The image runs as a non-root user and has a health check on `/api/health`. Without Compose:
`docker build -t marco . && docker run -d -p 3000:3000 -v marco-data:/data marco`.

> **Exposed or remote installs** (a VPS, a port forward, a reverse proxy): put `SETUP_TOKEN=<long random value>` in
> the `.env` next to `docker-compose.yml` (e.g. `echo "SETUP_TOKEN=$(openssl rand -hex 16)" >> .env`) *before* the
> first start. The wizard then refuses to run without it, so nobody else can claim your fresh install; open
> `http://<server-address>:3000/admin/?setup=<token>`. Headless installs that cannot use a browser can set `ADMIN_PASSWORD`
> instead (the wizard is skipped and the panel offers to change it later).
>
> **Docker behind a reverse proxy** (Caddy, nginx, cloudflared — on the same host or not): the proxy reaches the
> container through the Docker bridge, so set `TRUST_PROXY=172.16.0.0/12` (or the proxy's address) in that `.env`.
> Otherwise the server cannot see the real client address: proxied visitors are treated as remote and the session
> cookie is not marked `Secure`. **Compose only passes the variables listed in `docker-compose.yml`** to the
> container (`SETUP_TOKEN`, `SETUP_REQUIRE_TOKEN`, `ADMIN_PASSWORD`, `PUBLIC_URL`, `ALLOWED_HOSTS`, `TRUST_PROXY`,
> `COOKIE_SECURE`, `SESSION_SECRET`, `LAN_ADDRESS`, the Google keys); add others there yourself.

### First steps: the setup wizard

A fresh install has no admin password and no settings to speak of. The first time you open
`http://<server-ip>:3000/admin/` a **setup wizard** walks you through everything in about two minutes, and the
display (`http://<server-ip>:3000/`) shows a welcome screen with the admin address and a QR code until you are done.

| | |
|---|---|
| ![Setup wizard, step 1: welcome and language](docs/screenshots/setup-1-welcome.png) | ![Step 2: admin password with strength meter](docs/screenshots/setup-2-password.png) |
| ![Step 3: city search, time zone, units and clock format](docs/screenshots/setup-3-location.png) | ![Step 4: public holidays by country, iCal feeds with a Test button, Google notes](docs/screenshots/setup-4-calendars.png) |
| ![Step 5: screen name, layout, accent colour, photos and ambient effect](docs/screenshots/setup-5-look.png) | ![Step 6: the screen's private link with copy button and QR code, summary and tips](docs/screenshots/setup-6-done.png) |

1. **Welcome** — pick the language (English, Español, Português).
2. **Admin password** — at least 10 characters, nothing obvious (`password123`, `1234567890`, `qwertyuiop`…), typed
   twice; a strength meter helps. The display itself never needs a password.
3. **Location** — search your city (Open-Meteo, no API key); the time zone comes with it (or from your browser),
   then choose °C/°F and a 24 h or 12 h clock. No Internet from the browser? Type the coordinates, or skip the
   location and add it later (weather needs it; the time zone is saved either way).
4. **Calendars** — tick your country's public holidays (preselected from the city), paste iCal (`.ics`) addresses
   and press **Test** to check them. Google Calendar: paste the calendar's *secret address in iCal format*, or link
   the account after setup when the server has [a Google OAuth client](#connecting-google-calendar).
5. **Look** — screen name, layout, accent colour, light/dark theme, background photos (stock now, your gallery
   later) and the ambient effect.
6. **Done** — the screen's **private link** to open on the TV / Raspberry Pi (copy button + QR code; when you ran the
   wizard on the server itself as `localhost`, it uses the server's LAN address), a summary and tips (`?lite=1` for
   slow devices, the kiosk-only installer command with the private link). You are logged in and land in the panel.
   A display that was showing the welcome screen switches to a [pairing code](#private-display-links--pairing).

<img src="docs/screenshots/setup-mobile.png" alt="The setup wizard on a phone" width="260" align="right">

The wizard works on a phone too, and everything it sets can be changed later in the panel.

**Who can run it.** The setup endpoints only work while no password exists (afterwards they answer `409`), only
one browser can complete them, and:

- from your **local network** the wizard just works: the client address is loopback or private, the request was not
  relayed by a reverse proxy that is missing from `TRUST_PROXY`, and (in a container) it is not the container's
  gateway address;
- from **anywhere else** it needs the one-time setup URL that the server prints at startup:
  `[setup] Open http://localhost:3000/admin/?setup=<token> to finish setup` (`journalctl -u marco | grep setup`,
  `docker compose logs marco | grep setup`, or the terminal running `npm start`). The log lists
  `localhost` with the real port plus the LAN addresses it can see; from another device use the server's address
  instead of `localhost` (and, in Docker, the published port);
- with **`SETUP_TOKEN`** set, the token is required from everywhere — recommended for VPSs, reverse proxies and
  anything reachable from the Internet. `SETUP_REQUIRE_TOKEN=1` (default in the Docker image) does the same with the
  generated token from the log. An install that was configured before but lost `data/secrets.json` also asks for it.

The server only answers to host names it knows (protection against DNS rebinding, where a malicious website points
its own name at your server): IP addresses, `localhost`, single-label names (`raspberrypi`), `*.local`, `*.lan`,
`*.home.arpa`, `*.internal`, the `PUBLIC_URL` host and anything in `ALLOWED_HOSTS`. Others get `421`.

Upgrading an existing install never shows the wizard: if a password is already saved, nothing changes. With
`ADMIN_PASSWORD` set and no saved password, that password is used (headless installs) and the panel suggests
changing it.

![The display's welcome screen on a fresh install: admin URL and QR code](docs/screenshots/display-welcome.png)

<br clear="right">

## Private display links & pairing

Since 0.3 every screen is **private** by default: a browser only shows the calendar once it has opened the screen's
**private link** or has been **paired** from the admin. Without one it shows a pairing code and nothing else. That
makes Marco safe on shared networks (flat-share Wi-Fi, office) and lets you reach it from the Internet behind HTTPS.

| | |
|---|---|
| ![Screen → Settings → Private link: link, QR code, regenerate and the Raspberry Pi command](docs/screenshots/admin-private-link.png) | ![Pair a screen: code, screen and device name](docs/screenshots/admin-pairing-dialog.png) |
| ![A new display without a key shows a pairing code and a QR code](docs/screenshots/display-pairing.png) | ![A regenerated link or revoked device: “This link is no longer valid”](docs/screenshots/display-invalid-link.png) |

- **Private link** — *Screen → Settings → Private link* shows the selected screen's link, e.g.
  `http://homeserver.lan:3000/d/3f6c0a52-9d1e-4b7a-a2c4-0e5b8f1d2c37`, with **Copy**, a **QR code**, **Open**,
  **Regenerate link** and the ready-to-paste Raspberry Pi command. Bookmark it on a tablet, use it as the kiosk URL, or
  scan the QR with the device. The link is the key: whoever has it sees that screen (and only that one — `?screen=` is
  ignored), so keep it to your own devices.
- **Pairing** — no long links to type on a TV: open the plain address (`http://homeserver.lan:3000/` or `/pair`) on the
  new device and it shows a big **6-character code** and a QR code. On your phone open *Connected screens → Pair a
  screen* (or scan the QR: it opens the admin with the code filled in), type the code, pick the screen and a name. The
  device starts within two seconds and keeps its own device token in the browser's storage — ideal for tablets, TVs
  and browsers you keep using. The Raspberry Pi kiosk runs Chromium in incognito mode (nothing survives a restart),
  so give it the private link instead.
- **Paired devices** — *Connected screens* lists them with the screen they show and when they were last seen; **Edit**
  renames or moves one to another screen, **Revoke** cuts it off.
- **Regenerate / revoke** — *Regenerate link* replaces the key at once; screens using the old link (or a revoked
  device) switch to “This link is no longer valid”, wipe their cached data and offer a new pairing code.
- **Display access mode** (*Security → Display access*): **Private** (default for new installs) or **Open (local
  network)** — the 0.2 behaviour, where `/` and `/?screen=<slug>` work without a key. **Upgrading from 0.2 keeps Open**
  so no kiosk goes blank, and the admin recommends switching: open each display's private link (or pair it) first;
  when you save Private, keyless displays show a pairing code. The admin preview and *View screen* keep working with
  your admin session either way.

![Connected screens: how each display got in, and the paired devices](docs/screenshots/admin-displays-paired.png)

The key is a random **UUIDv4** (122 random bits): easy to read and type on a Pi (lower-case hex, no ambiguous
letters) and impossible to guess. Brute-force math, what is logged (nothing secret) and the full threat model are in
[SECURITY.md](SECURITY.md#private-display-links-and-pairing-threat-model).

## Raspberry Pi kiosk

Tested with Raspberry Pi OS **Bookworm** (64-bit, desktop) on Pi 4/5; a Pi 3 works with `?lite=1`.
The installer is idempotent: run it again after every `git pull`.

### A. Server and display on the same Pi (all-in-one)

```bash
git clone https://github.com/mr-reb00t/marco.git ~/marco
cd ~/marco
./deploy/install.sh
sudo reboot
```

It installs Node.js 22 (if needed), Chromium and kiosk helpers, runs `npm ci` + `npm run build`, creates `.env` with
a random `SESSION_SECRET`, installs and starts the
`marco` systemd service, adds the kiosk to the desktop autostart (labwc, Wayfire and LXDE are supported),
disables screen blanking and enables desktop auto-login. After the reboot the screen shows the welcome screen with a
QR code: scan it with your phone to run the [setup wizard](#first-steps-the-setup-wizard). When you finish, the
screen shows a **pairing code**: pair it from the phone to start right away, or just reboot. On an all-in-one install
the kiosk opens the **default screen's private link by itself** — it reads it from the local data folder each time
Chromium starts (so a regenerated link is picked up on the next restart); `--url "http://localhost:3000/?screen=kitchen"`
picks another screen the same way. Pairings alone do not survive a restart there: the kiosk browser runs in incognito
mode.

### B. Server elsewhere, the Pi only shows it (kiosk-only)

Run the server on a home server, NAS or Docker host ([Quick start](#quick-start)), then on the Pi:

```bash
git clone https://github.com/mr-reb00t/marco.git ~/marco
~/marco/deploy/install.sh --kiosk-only --url http://homeserver.lan:3000/d/3f6c0a52-9d1e-4b7a-a2c4-0e5b8f1d2c37
sudo reboot
```

Use the **private link** of the screen this Pi should show: *Screen → Settings → Private link* has the exact command
ready to copy (the link decides the screen). Pairing is not an option here: the kiosk browser runs in incognito mode
and would forget it at the next restart.

This installs only Chromium + the kiosk autostart (no Node.js, no server), copies the kiosk script to
`~/.local/bin/` (you can delete the clone afterwards), turns off screen blanking and hides the cursor.
In **open** display-access mode `--url "http://homeserver.lan:3000/?screen=kitchen"` still works.

### Installer options

| Option | Meaning |
|---|---|
| *(none)* | Server + kiosk on this machine |
| `--no-kiosk` | Server only (no Chromium, no autostart) |
| `--kiosk-only --url <url>` | Kiosk only, showing a server running elsewhere |
| `--url <url>` | All-in-one, but show a specific URL (e.g. the private link `http://localhost:3000/d/<key>?lite=1`) |
| `--user <name>` | User that runs the service and the desktop session (default: current user) |
| `--skip-apt` | Do not install system packages |

### Kiosk tips

- Kiosk settings live in `~/.config/marco/kiosk.env` (`KIOSK_URL`, `KIOSK_CLIENT`, `KIOSK_EXTRA_ARGS`); after
  *Regenerate link*, put the new private link in `KIOSK_URL` (or run the installer again with `--url <new link>`);
  the log is `/tmp/marco-kiosk.log`. The script waits for the server, restarts Chromium if it exits and adds
  `client=<hostname>` so the device keeps its name in *Connected displays*.
- **Too big / too small?** Add `KIOSK_EXTRA_ARGS="--force-device-scale-factor=0.8"` (or `1.25`) to `kiosk.env`.
  The display also has a font-scale setting per screen.
- **Translate bubble**: the page declares `translate="no"` and the kiosk starts Chromium with
  `--disable-features=Translate`, so Chromium should not offer to translate the calendar.
- **Turn the screen off at night**: `deploy/screen-schedule.sh off|on` from cron (see the script header), or just use
  the dimming night mode from the admin.
- **Slow Pi**: set the ambient effect to *none* and transition to *fade*, or use `?lite=1` in `KIOSK_URL`.
- **Read-only file system (overlay)**: if you protect the SD card with Raspberry Pi OS's overlay file system,
  changes made by the installer are lost on reboot. Disable it, install, then enable it again:

  ```bash
  sudo raspi-config nonint disable_overlayfs && sudo reboot
  ./deploy/install.sh ...            # or --kiosk-only --url ...
  sudo raspi-config nonint enable_overlayfs && sudo reboot
  ```

  With the overlay on, keep the *server* (and its `data/` folder) on another machine (topology B).

Useful commands: `journalctl -u marco -f` (logs), `sudo systemctl restart marco`,
`git pull && ./deploy/install.sh` (update).

## Connecting Google Calendar

You have two options. **OAuth** (recommended) gives near-real-time updates and lets you pick calendars from a list;
the **secret iCal address** needs no setup at all but updates slowly. Both are read-only.

### 1. Create a Google Cloud project and OAuth client

1. Go to <https://console.cloud.google.com/>, sign in and **create a project** (e.g. `marco`).
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. Open **Google Auth Platform** (formerly "OAuth consent screen"):
   - **Branding**: app name (e.g. *Marco*), your support email, developer contact email. Save.
   - **Audience**: user type **External**. Under **Test users** add your own Google address (and the address of
     anyone else whose calendars you want to link).
   - **Data access** (optional): you can add the scopes `openid`, `email`, `profile` and
     `https://www.googleapis.com/auth/calendar.readonly`; Marco requests them anyway.
4. **Clients → Create client → Web application**:
   - **Authorized redirect URI**: `<PUBLIC_URL>/auth/google/callback` — exactly, e.g.
     `http://localhost:3000/auth/google/callback` or `https://calendar.example.com/auth/google/callback`
     (same scheme, host and port, no trailing slash).
   - Create, then copy the **Client ID** and **Client secret**.
5. Put them in `.env` and restart:

   ```ini
   PUBLIC_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```

   `sudo systemctl restart marco` (or `docker compose up -d` / restart `npm start`).

> **Testing vs. production.** While the app's publishing status is **Testing**, only the test users can sign in and
> Google **expires refresh tokens after 7 days**: the Google calendars stop updating after a week until you press
> *Connect* again. For personal use that is fine if you don't mind reconnecting weekly. To avoid it, **publish** the
> app (*Audience → Publish app*). Google then requires a homepage and privacy-policy URL on an authorized domain, and
> since the app is not verified you will see an "unverified app" screen when you link your account (*Advanced → Go to
> … (unsafe)*). Marco only asks for read-only access.

### 2. The redirect URI problem (and three ways around it)

Google only accepts redirect URIs on **`https://` public domains** or **`http://localhost`**. A LAN address like
`http://192.168.1.50:3000/auth/google/callback` is rejected (`redirect_uri_mismatch` / "invalid redirect"). Pick one:

**Option A — `localhost` just for linking (simplest).** Set `PUBLIC_URL=http://localhost:3000` and register
`http://localhost:3000/auth/google/callback`. Then open the admin *as localhost* only when you link an account —
on the server itself, or from your laptop through an SSH tunnel:

```bash
ssh -L 3000:localhost:3000 user@<server-ip>
# then browse to http://localhost:3000/admin/ on your laptop and press "Link account"
```

The refresh token is stored on the server and renewed automatically, so the rest of the time you use the admin
normally at `http://<server-ip>:3000/admin/` (only "Sign in with Google" needs the localhost URL).

**Option B — your own domain with HTTPS.** Put a reverse proxy with a valid certificate in front, set
`PUBLIC_URL=https://calendar.example.com` and register `https://calendar.example.com/auth/google/callback`.

- **Caddy** (automatic Let's Encrypt): see [`deploy/Caddyfile.example`](deploy/Caddyfile.example). It exposes only the
  admin, login and first-run setup routes (plus `/assets` and `/media`) to the Internet; the display and its API answer
  only to LAN addresses. Gallery photos under `/media/` pass the proxy, but the server itself only sends them to LAN
  clients or a signed-in admin.

  ```bash
  sudo apt install caddy
  sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile   # edit the domain
  sudo systemctl reload caddy
  ```

- **Cloudflare Tunnel** (no open ports): `cloudflared tunnel create calendar`, route
  `calendar.example.com` to `http://localhost:3000` in the tunnel config, and protect it with Cloudflare Access if you
  like. Server-Sent Events work through the tunnel.
- Set **`TRUST_PROXY`** whenever the proxy does not connect from `127.0.0.1`: a proxy on **another machine**
  (`TRUST_PROXY=<proxy-ip>`) or **any proxy in front of the Docker container** (`TRUST_PROXY=172.16.0.0/12`, the
  Docker bridge). Without it the server sees the proxy's address instead of the visitor's: everyone coming through it
  is treated as remote (the setup token is required, LAN-only things are refused) and the session cookie is not
  marked `Secure`. The log warns about an untrusted proxy when this happens.

**Option C — no OAuth: the secret iCal address.** In Google Calendar on the web → ⚙️ *Settings* → pick the calendar →
*Integrate calendar* → **Secret address in iCal format**. Add that URL as an **iCal** source. No Google Cloud project
needed; however Google refreshes this feed with a delay (minutes to hours) and anyone with the URL can read the
calendar — treat it like a password.

### 3. Pick your calendars

**Admin → Calendars → Google accounts → Link account**, accept the permissions, then tick the calendars to show.
Each one becomes a source you can rename and give an emoji, colour and **type** — e.g. a calendar that only contains
birthdays → type *Birthdays* (🎂 and ages), a holiday calendar → *Holidays*. You can link several Google accounts.

**Sign in with Google** for the admin: add the allowed addresses in **Security → Allowed Google emails** (if the list
is empty, the first Google sign-in made while you are already logged in with the password adds itself). You can then
disable password login if you want.

## Other integrations

- **iCal / ICS feeds** — any `http(s)://` or `webcal://` URL: school, sports club, work, public holidays (presets for
  several countries in *Calendars → Quick add*), vacation-rental platforms. *Test* shows how many events were read.
  If the feed uses a **self-signed certificate**, enable *Self-signed certificate* on that source only (or add your CA
  with `NODE_EXTRA_CA_CERTS`). A failing feed never breaks the others; errors show in *Status* and *Activity*.
- **Vacation rentals** — set the type to *Vacation rental*. Airbnb's "Reserved" / "Not available" entries become
  "Reservation · Guest" bars (blocked dates can be hidden with a filter); feeds that already format titles like
  `🏠 Guest - 4p+1m` keep their emoji and turn guest counts into icons; `Adults: 2 / Children: 1 / Infants: 1 / Pets: 1`
  lines in the description (also `Adultos/Niños/Bebés/Mascotas`) give 🧑🏻🧑🏻 🧒🏻 👶🏻 🐶.
- **Weather** — [Open-Meteo](https://open-meteo.com/), no key needed: just set the location (search by name or
  coordinates) and units in *Weather*.
- **Home Assistant** — in Home Assistant open your **profile → Security → Long-lived access tokens → Create token**;
  in *Admin → Home Assistant* enter the URL (e.g. `http://homeassistant.local:8123`) and the token, *Test connection*,
  then choose a `weather.*` entity and/or indoor temperature/humidity `sensor.*` entities in *Weather*. The token stays
  on the server. Home Assistant can also **send alerts** to the screens — see [webhooks](#api-tokens-and-webhooks).
- **News (RSS/Atom)** — add any feed in *News*. Some sites block non-browser clients; the server already uses a desktop
  browser User-Agent. Use *Test* to check a feed.

## Photos

- **Stock** photos come from [picsum.photos](https://picsum.photos/) (free, no key). **Gallery** uses your own photos;
  **Mixed** alternates both. Set interval, brightness, transition and ambient effect in *Background*.
- **Photo order** (*Background*): *Random* (shuffled, without repeating the previous batch), *Newest first* or
  *By name*. The sequential orders continue where the screen left off and start over at the end.
- **Choose which photos are shown**: every photo in the gallery has an eye toggle to take it out of the rotation (or
  put it back) without deleting it. The counter shows how many are in rotation; filter by *In rotation* / *Hidden*
  and use *Select* to show or hide many photos at once. If every gallery photo is hidden, the screen falls back to
  stock photos.
- Upload in **Admin → Gallery** by drag & drop (JPG, PNG, WebP, AVIF, GIF… and iPhone **HEIC**, up to 100 MB each).
  Photos are optimised **in your browser** before upload — rotated according to EXIF, resized to max 2560 px, saved as
  JPEG, with a 480 px thumbnail — so neither the server nor the Pi has to process images.
- A **focal point** is detected automatically (saliency + skin tones). Click a photo to adjust it: the editor shows
  exactly what the side panel and full-screen layouts will crop, including the bands covered by the clock and weather.
- Tip: **portrait photos** fit the side panel of the *big calendar* layout best; landscape photos shine in *big time*
  and *left/right*.
- Uploading a file with an existing name asks whether to replace it, keep both or skip it. Photos copied by hand
  into `data/photos/` can be optimised later with *Optimize and frame existing photos*.

## Multiple screens, alerts and the API

### Screens and connected displays

Create several **screens** in *System → Screens* ("Living room", "Kitchen", "Hallway"…). Each has its own layout,
theme, background, widgets and set of calendars; calendars, rules and integrations are shared. A device shows a screen
through that screen's [private link](#private-display-links--pairing) or by being paired to it (in open mode also
`http://<server-ip>:3000/?screen=<slug>`; without `?screen` the default one ★).
The **Editing: Living room ▾** switcher in the admin header selects which screen the per-screen pages edit.

*System → Connected displays* lists every browser showing a screen (IP, browser, resolution, pixel ratio, WebGL,
version, last heartbeat, and how it got in: private link, paired device or no key) with **Reload**, **Identify**
(shows the screen name in big letters for 10 s) and **Night / Day / Auto** buttons, plus **Pair a screen** and the
list of paired devices. Outdated displays are flagged; *Reload* fixes them.

### Alerts and scheduled messages

*Alerts → Send an alert now*: title, text, emoji, style (*info*, *success*, *warning*, *urgent*), duration, sound and
target screens. Active alerts survive a server restart. *Scheduled messages* appear at fixed times on chosen weekdays
(windows can cross midnight).

### API tokens and webhooks

Create a token in *Admin → API & webhooks* (shown once; only a hash is stored). Then, from Home Assistant:

```yaml
# configuration.yaml
rest_command:
  marco_alert:
    url: "http://192.168.1.50:3000/api/hooks/announce"
    method: POST
    headers:
      Authorization: "Bearer cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    content_type: "application/json"
    payload: >-
      {"title": {{ title | tojson }}, "body": {{ (body | default('')) | tojson }},
       "emoji": {{ (emoji | default('🔔')) | tojson }}, "style": "{{ style | default('info') }}",
       "durationSec": {{ duration | default(120) }}, "sound": true}

automation:
  - alias: "Alert: washing machine finished"
    triggers:
      - trigger: state
        entity_id: sensor.washing_machine_status
        to: "finished"
    actions:
      - action: rest_command.marco_alert
        data:
          title: "The washing machine is done 🧺"
          emoji: "🧺"
          style: "success"
          duration: 300
```

Or with `curl`:

```bash
TOKEN=cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
curl -H "Authorization: Bearer $TOKEN" http://192.168.1.50:3000/api/hooks/ping
# urgent alert on the kitchen screen for 10 minutes
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Oven is on!","emoji":"🔥","style":"urgent","durationSec":600,"sound":true,"screens":["kitchen"]}' \
  http://192.168.1.50:3000/api/hooks/announce
# reload every screen / night mode on|off|auto
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' http://192.168.1.50:3000/api/hooks/reload
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"mode":"on"}' http://192.168.1.50:3000/api/hooks/night
```

Limits: 30 requests/minute per token; errors `401` (bad token), `400` (invalid data), `415` (not JSON), `429`
(rate limit). Full reference: [docs/API.md](docs/API.md).

### Backups and activity

- Every save keeps the previous configuration in `data/backups/` (the 20 newest; quick successive saves count as one).
  *System → Backups* downloads, restores or deletes them and makes manual backups.
- **Export** downloads everything as one JSON file, optionally with secrets (password hash, Home Assistant token,
  Google accounts, API tokens — keep it safe). **Import** shows what changes per section before applying.
- *System → Activity* records sign-ins (and failed attempts), saves, restores, alerts, API usage, displays connecting
  and calendar errors. Passwords, tokens and calendar URLs are never logged.

## Configuration reference

### Environment variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Listen address |
| `PUBLIC_URL` | derived from each request | URL of the admin through your domain, used for the Google OAuth redirect `${PUBLIC_URL}/auth/google/callback`; its host is also accepted by the host-name check |
| `ALLOWED_HOSTS` | — | Extra host names the server answers to, comma-separated (`.example.com` = subdomains too). IPs, `localhost`, single-label names and `*.local`/`*.lan`/`*.home.arpa`/`*.internal` always work; other names get `421` (DNS-rebinding protection) |
| `SESSION_SECRET` | random (stored in `data/secrets.json`) | Secret that signs the session cookie |
| `SETUP_TOKEN` | — | Require this token (at least 16 characters) to run the first-run setup wizard (`/admin/?setup=<token>`). Without it, the wizard works from the LAN and needs the per-start token printed in the log from anywhere else |
| `SETUP_REQUIRE_TOKEN` | — (`1` in Docker) | `1` = the wizard always needs the per-start token from the log, even from the LAN |
| `ADMIN_PASSWORD` | — | Headless installs only: initial admin password instead of the wizard (used only until a password is saved; the panel offers to change it). A value that breaks the wizard's rules (fewer than 10 characters or a common password) only works from the LAN and must be changed |
| `LAN_ADDRESS` | detected | This server's LAN address for the display's welcome QR code (set it in Docker, where it cannot be detected) |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where configuration, secrets, photos and backups are stored |
| `COOKIE_SECURE` | per request | `1` = always `Secure` cookie, `0` = never |
| `TRUST_PROXY` | `loopback` | IP(s)/ranges of reverse proxies allowed to set `X-Forwarded-*`. Needed for a proxy on another host and for any proxy in front of Docker (`172.16.0.0/12`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | Google OAuth client ([guide](#connecting-google-calendar)) |
| `NODE_EXTRA_CA_CERTS` | — | Extra CA certificates for iCal feeds with a private CA |
| `TZ` | the zone set in *Date & time* (follows changes live) | Process time zone (used for "floating" iCal times). Setting it here pins it |

With Docker Compose only the variables listed in `docker-compose.yml` reach the container; `.env` next to it fills
them in.

### Data directory

```
data/
├── config.json          # all settings (screens, calendars, rules, events, birthdays…)
├── secrets.json         # password hash, session secret, Google & Home Assistant tokens, API token hashes,
│                        #   private-link keys per screen, paired-device token hashes (mode 600)
├── photos/              # gallery (+ .thumbs/ and .meta.json with focal points, hidden flags)
├── backups/             # automatic and manual configuration backups
├── cache/               # feed caches
├── activity.jsonl       # activity log
├── announcements.json   # active alerts + history
└── displays.json        # known displays
```

Back up the whole folder (or use *Export*) to keep everything.

### Display URL parameters

| Parameter | Effect |
|---|---|
| `/d/<key>` | A screen's private link (the key decides the screen) |
| `/pair` | Show a pairing code (also in open mode) |
| `?screen=<slug>` | Show that screen profile (default screen if absent or unknown); open mode or admin session only |
| `?lite=1` | No WebGL effects (slow devices) |
| `?demo=1` | Built-in sample data (no server data needed) |
| `?lang=en\|es\|pt` | Override the language |
| `?preset=…` `?view=month\|agenda\|week` `?theme=dark\|light` `?side=left\|right` `?clock=analog` | Override layout options (handy for testing) |
| `?client=<name>` | Name of this device in *Connected displays* (the kiosk script sets it) |

## Security

Marco was designed for a home network; since 0.3 the displays are **private by default**.

- **Displays** (`/`, `/d/<key>` and the display API: `/api/display/*`, `/api/events`, `/api/weather`, `/api/news`,
  `/api/photos`, `/api/countdowns`, `/api/stream`, `/media/*`) need the screen's private-link key, a paired-device
  token or an admin session; otherwise they answer `401`/`403` with no data. Keys are compared in constant time, never
  logged, kept out of referrers (`Referrer-Policy: no-referrer`) and caches (`no-store`). In **open** mode (upgraded
  0.2 installs until you switch) the display API has no login — then **do not expose it to the Internet**.
- **Protected**: the admin (`/admin/`, `/api/admin/*`) needs a session (password and/or allowed Google accounts);
  webhooks need a bearer token.
- A fresh install has **no default password**; the [setup wizard](#first-steps-the-setup-wizard) creates it. Set
  `SETUP_TOKEN` if the server is reachable from outside your LAN before you finish setup.
- Unknown host names are refused (DNS-rebinding protection); add your domain with `PUBLIC_URL` / `ALLOWED_HOSTS`.
- If you want remote access, use an **HTTPS reverse proxy** ([Caddy example](deploy/Caddyfile.example)) — in private
  mode the displays can go through it too; in open mode expose only the admin/login/setup routes — a **strong
  password**, and `TRUST_PROXY` whenever the proxy does not connect from loopback (another host, or Docker). On
  networks you do not control, use HTTPS so nobody can sniff a display key.
- Calendar, RSS and Home Assistant URLs you enter in the admin are fetched **by the server**, LAN addresses included.
- Keep `.env`, `data/secrets.json`, exports with secrets and `data/backups/` private.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Development

```bash
npm ci
npm run dev          # server on :3000 (node --watch) + Vite on :5173 (proxies /api, /auth, /media)
                     # display http://localhost:5173/  ·  admin http://localhost:5173/admin/
npm test             # server tests (node --test)
npm run typecheck    # TypeScript (display + admin)
npm run build        # production build into dist/
```

| Folder | Content |
|---|---|
| `server/` | Express 5 API, plain ESM JavaScript, no build step (`routes/`, `lib/`, `test/`) |
| `web/display/` | The display: vanilla TypeScript + three.js |
| `web/admin/` | The admin panel: Preact + TypeScript |
| `web/shared/` | Shared types, i18n, emoji rules, focal-point crop |
| `deploy/` | Raspberry Pi installer, systemd unit, kiosk & screen-schedule scripts, Caddy example |
| `scripts/demo.js` | `npm run demo` |
| `docs/` | [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), screenshots |

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md). Release notes: [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Marco contributors. Third-party components keep their own licenses — notably the
HEIC decoder (LGPL-3.0, loaded as a separate unmodified chunk) and the Inter / Outfit fonts (OFL-1.1); see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Acknowledgements

- [DAKboard](https://dakboard.com/) for the idea of a beautiful wall dashboard (this project is unaffiliated).
- [Open-Meteo](https://open-meteo.com/) — free weather API (data under CC BY 4.0).
- [Lorem Picsum](https://picsum.photos/) and the Unsplash photographers for the stock photos.
- [three.js](https://threejs.org/), [Preact](https://preactjs.com/), [Vite](https://vite.dev/),
  [Express](https://expressjs.com/), [node-ical](https://github.com/jens-maus/node-ical), [rrule](https://github.com/jkbrzt/rrule),
  [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser), [heic-to](https://github.com/hoppergee/heic-to),
  [Inter](https://rsms.me/inter/) and [Outfit](https://fonts.google.com/specimen/Outfit).
