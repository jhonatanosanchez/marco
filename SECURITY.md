# Security policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private vulnerability reporting
(*Security → Report a vulnerability* on the repository page) and include steps to reproduce and the affected version.
You should get an answer within a week.

## Deployment model (what is and is not protected)

Marco is designed for a **home network (LAN)**:

- The display (`/`) and the display API (`/api/display/*`, `/api/events`, `/api/weather`, `/api/news`, `/api/photos`,
  `/api/countdowns`, `/api/stream`, `/api/display/heartbeat`) have **no authentication**, so any browser on your LAN can
  show the calendar. They never return calendar URLs, tokens, passwords or Home Assistant credentials, but they do
  return your events, so do not expose them to the Internet. Gallery photos (`/media/*`) are only sent to LAN clients
  or a signed-in admin.
- **Host names**: the server only answers to IP addresses, `localhost`, single-label names, `*.local` / `*.lan` /
  `*.home.arpa` / `*.internal`, the `PUBLIC_URL` host and `ALLOWED_HOSTS` (`421` otherwise; `/api/health` and the
  bearer-token webhooks are exempt). This stops DNS-rebinding attacks, where a website a LAN user visits points its
  own name at your server to read the display API or run the setup wizard from the victim's browser.
- **"From the LAN"** means: a loopback/private client address after `TRUST_PROXY` resolution, *not* relayed by a proxy
  that is missing from `TRUST_PROXY` (forwarding headers from an untrusted hop make the client remote), and for the
  setup wizard and weak passwords also not the container's default gateway (in Docker Desktop / rootless setups
  every client looks like that address). Set `TRUST_PROXY` whenever your reverse proxy does not connect from loopback
  — another host, or any proxy in front of the Docker container (`172.16.0.0/12`).
- The admin panel (`/admin/`, `/api/admin/*`) requires a session (password and/or Google sign-in with an allow-list).
  Passwords are stored as scrypt hashes; the session cookie is `HttpOnly` + `SameSite=Lax` and mutating routes require
  JSON (CSRF guard). There is no default password: a fresh install runs a first-run setup wizard that creates it
  (≥ 10 characters, common passwords refused). The setup endpoints work only until a password exists, only one
  request can complete them, and they accept requests from LAN clients only — unless the one-time token printed in
  the server log (or `SETUP_TOKEN`, which then is always required) is given. The token is always required with
  `SETUP_REQUIRE_TOKEN=1` (the Docker image's default) and for an install that was configured before but lost its
  `secrets.json`; an unreadable `secrets.json` stops the server instead of silently reopening setup. Wrong tokens are
  counted on every setup endpoint (10 per IPv4 address / IPv6 /64 → 10-minute lockout). An `ADMIN_PASSWORD` that
  breaks the same rules (headless installs) is only accepted from LAN clients and the panel forces a change.
- Webhooks (`/api/hooks/*`) only accept `Authorization: Bearer <token>`; tokens are stored as SHA-256 hashes and
  rate-limited (30 requests/minute per token).
- Secrets (`data/secrets.json`, `.env`, exports that include secrets, `data/backups/`) must be kept private.
- **Outbound requests (SSRF)**: calendar (iCal), RSS and Home Assistant URLs entered in the admin, and the admin's
  *Test* buttons, are fetched **from the server**, including LAN and loopback addresses (that is how Nextcloud or
  Home Assistant on your network work), redirects included. Anyone with an admin session can therefore make the
  server request internal URLs; treat admin access accordingly. The only unauthenticated fetch, the setup wizard's
  iCal test (`/api/setup/test-ics`), refuses loopback, link-local / cloud-metadata, multicast and unspecified
  destinations on every redirect hop and returns only generic errors.

If you need remote access, put an HTTPS reverse proxy in front and expose only the admin, login and setup routes (see
`deploy/Caddyfile.example`), use a strong password, set `PUBLIC_URL` to your domain, and set `TRUST_PROXY` whenever
the proxy does not connect from loopback (another host, or Docker).
