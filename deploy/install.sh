#!/usr/bin/env bash
# Marco installer for Raspberry Pi OS (Bookworm or newer; X11 or Wayland/labwc) and other Debian systems.
# Idempotent: run it again after every `git pull`.
#
# Usage:
#   ./deploy/install.sh                          # server + kiosk on this machine (all-in-one Pi)
#   ./deploy/install.sh --no-kiosk               # server only (home server / NAS / any Debian box)
#   ./deploy/install.sh --kiosk-only --url http://<server-ip>:3000/   # kiosk only: this Pi just shows a remote server
#   ./deploy/install.sh --url "http://localhost:3000/?screen=kitchen"  # all-in-one, but show another screen profile
#   ./deploy/install.sh --user pi                # user that runs the service and the desktop session
#   ./deploy/install.sh --skip-apt               # do not install system packages
#
# Runs as a normal user (uses sudo) or as root (with --user, or via sudo).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="marco"
MARKER="# marco-kiosk"

KIOSK=1
SERVER=1
SKIP_APT=0
RUN_USER=""
KIOSK_URL_ARG=""

info()  { echo -e "\033[1;36m==>\033[0m $*"; }
ok()    { echo -e "\033[1;32m ✓\033[0m $*"; }
warn()  { echo -e "\033[1;33m !\033[0m $*" >&2; }
fail()  { echo -e "\033[1;31m ✗ $*\033[0m" >&2; exit 1; }

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --no-kiosk) KIOSK=0 ;;
    --kiosk-only) SERVER=0 ;;
    --skip-apt) SKIP_APT=1 ;;
    --url) shift; KIOSK_URL_ARG="${1:-}"; [ -n "$KIOSK_URL_ARG" ] || fail "--url needs a value, e.g. http://192.168.1.50:3000/" ;;
    --url=*) KIOSK_URL_ARG="${1#--url=}" ;;
    --user) shift; RUN_USER="${1:-}"; [ -n "$RUN_USER" ] || fail "--user needs a user name" ;;
    --user=*) RUN_USER="${1#--user=}" ;;
    -h|--help) usage ;;
    *) fail "Unknown option: $1 (see --help)" ;;
  esac
  shift
done

[ "$SERVER" = 1 ] || [ "$KIOSK" = 1 ] || fail "--kiosk-only and --no-kiosk cannot be combined."
if [ "$SERVER" = 0 ] && [ -z "$KIOSK_URL_ARG" ]; then
  fail "--kiosk-only needs --url http://<server-ip>:3000/ (the address of the machine running Marco)."
fi
case "$KIOSK_URL_ARG" in
  ""|http://*|https://*) ;;
  *) fail "--url must start with http:// or https:// (got: $KIOSK_URL_ARG)" ;;
esac

# --- Read-only overlay file system (Raspberry Pi OS "overlayroot") -----------------
# With the overlay enabled every change is lost on reboot: disable it, install, then enable it again.
if grep -qE '^overlayroot / ' /proc/mounts 2>/dev/null || \
   { command -v raspi-config >/dev/null 2>&1 && grep -qE '^\S+ / overlay ' /proc/mounts 2>/dev/null; }; then
  fail "The root file system is a read-only overlay: changes would be lost on reboot.
   Disable it first:  sudo raspi-config nonint disable_overlayfs && sudo reboot
   Run this installer again, then re-enable it:  sudo raspi-config nonint enable_overlayfs && sudo reboot"
fi

# --- User and sudo -------------------------------------------------------------------
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
  RUN_USER="${RUN_USER:-${SUDO_USER:-pi}}"
else
  command -v sudo >/dev/null 2>&1 || fail "sudo is required to install system packages and the service."
  SUDO="sudo"
  RUN_USER="${RUN_USER:-$(id -un)}"
fi
id "$RUN_USER" >/dev/null 2>&1 || fail "User '$RUN_USER' does not exist (use --user <name>)."
[ "$RUN_USER" != "root" ] || warn "The service would run as root; a normal user is recommended (--user pi)."
RUN_GROUP="$(id -gn "$RUN_USER")"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"

# Run a command as the service user
as_user() {
  if [ "$(id -un)" = "$RUN_USER" ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$RUN_USER" -H "$@"
  else
    runuser -u "$RUN_USER" -- env HOME="$RUN_HOME" "$@"
  fi
}

MODE="server + kiosk"
[ "$KIOSK" = 0 ] && MODE="server only"
[ "$SERVER" = 0 ] && MODE="kiosk only"
info "Marco — installer"
echo "    Folder:  $APP_DIR"
echo "    User:    $RUN_USER ($RUN_HOME)"
echo "    Mode:    $MODE"
[ -n "$KIOSK_URL_ARG" ] && echo "    URL:     $KIOSK_URL_ARG"

[ -f "$APP_DIR/package.json" ] || fail "package.json not found in $APP_DIR"

# --- Project folder ownership ----------------------------------------------------------
if [ "$SERVER" = 1 ] && [ "$(stat -c %U "$APP_DIR")" != "$RUN_USER" ]; then
  info "Giving $RUN_USER ownership of the project folder..."
  $SUDO chown -R "$RUN_USER:$RUN_GROUP" "$APP_DIR"
fi

# --- System packages -------------------------------------------------------------------
apt_install() {
  # Installs the packages that exist in this release; skips unknown ones.
  local pkgs=() p
  for p in "$@"; do
    if dpkg -s "$p" >/dev/null 2>&1; then continue; fi
    if apt-cache show "$p" >/dev/null 2>&1; then pkgs+=("$p"); else warn "Package not available: $p (skipped)"; fi
  done
  if [ "${#pkgs[@]}" -gt 0 ]; then
    info "Installing packages: ${pkgs[*]}"
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${pkgs[@]}"
  fi
}

if [ "$SKIP_APT" = 0 ] && command -v apt-get >/dev/null 2>&1; then
  info "Updating the package index..."
  $SUDO apt-get update -qq || warn "apt-get update failed; continuing."
  apt_install ca-certificates curl gnupg openssl
  if [ "$KIOSK" = 1 ]; then
    # Chromium is "chromium-browser" on older Raspberry Pi OS and "chromium" on Debian / newer releases.
    if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
      if apt-cache show chromium >/dev/null 2>&1; then apt_install chromium; else apt_install chromium-browser; fi
    fi
    apt_install unclutter x11-xserver-utils wlr-randr wlrctl
    # Emoji (birthdays, guests, weather…) must render without Internet access
    apt_install fonts-noto-color-emoji || warn "fonts-noto-color-emoji not available"
  fi
fi

PORT=3000
if [ "$SERVER" = 1 ]; then
  # --- Node.js -------------------------------------------------------------------------
  node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0; }
  if ! command -v node >/dev/null 2>&1 || [ "$(node_major)" -lt 20 ]; then
    info "Installing Node.js 22 LTS from NodeSource..."
    command -v curl >/dev/null 2>&1 || fail "curl is required to install Node.js"
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
  fi
  NODE_BIN="$(command -v node)"
  ok "Node $(node -v) at $NODE_BIN"

  # --- Dependencies and build ----------------------------------------------------------
  info "Installing dependencies (npm ci)..."
  (cd "$APP_DIR" && as_user npm ci --no-audit --no-fund)
  info "Building the web UI (npm run build)..."
  (cd "$APP_DIR" && as_user npm run build)
  as_user mkdir -p "$APP_DIR/data/photos" "$APP_DIR/data/cache"
  ok "Build ready in $APP_DIR/dist"

  # --- .env ----------------------------------------------------------------------------
  gen_secret() {
    if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
    else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
  }
  ENV_FILE="$APP_DIR/.env"
  if [ ! -f "$ENV_FILE" ]; then
    info "Creating .env from .env.example..."
    as_user cp "$APP_DIR/.env.example" "$ENV_FILE"
  fi
  if grep -qE '^SESSION_SECRET=(change-me)?$' "$ENV_FILE" || ! grep -q '^SESSION_SECRET=' "$ENV_FILE"; then
    SECRET="$(gen_secret 32)"
    if grep -q '^SESSION_SECRET=' "$ENV_FILE"; then
      as_user sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" "$ENV_FILE"
    else
      echo "SESSION_SECRET=${SECRET}" | as_user tee -a "$ENV_FILE" >/dev/null
    fi
    ok "Random SESSION_SECRET generated"
  fi
  chmod 600 "$ENV_FILE" 2>/dev/null || $SUDO chmod 600 "$ENV_FILE"
  PORT="$(grep -E '^PORT=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
  PORT="${PORT:-3000}"

  # --- systemd service -----------------------------------------------------------------
  info "Installing the systemd service ($SERVICE_NAME)..."
  TMP_UNIT="$(mktemp)"
  sed -e "s|@USER@|$RUN_USER|g" -e "s|@GROUP@|$RUN_GROUP|g" \
      -e "s|@APP_DIR@|$APP_DIR|g" -e "s|@NODE@|$NODE_BIN|g" \
      "$SCRIPT_DIR/marco.service" > "$TMP_UNIT"
  $SUDO install -m 644 "$TMP_UNIT" "/etc/systemd/system/$SERVICE_NAME.service"
  rm -f "$TMP_UNIT"
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
  $SUDO systemctl restart "$SERVICE_NAME"
  ok "Service enabled and (re)started"

  info "Checking http://localhost:$PORT/api/health ..."
  healthy=0
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "http://localhost:$PORT/api/health" >/dev/null 2>&1; then healthy=1; break; fi
    sleep 1
  done
  if [ "$healthy" = 1 ]; then ok "The server is up"
  else warn "The server is not answering yet. Check: journalctl -u $SERVICE_NAME -n 50 --no-pager"; fi
fi

# --- Kiosk --------------------------------------------------------------------------------
add_line_once() { # file line
  local file="$1" line="$2"
  as_user mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || as_user touch "$file"
  if ! grep -qF "$MARKER" "$file"; then
    printf '%s\n%s\n' "$MARKER" "$line" | as_user tee -a "$file" >/dev/null
    ok "Autostart added to $file"
  else
    ok "Autostart already present in $file"
  fi
}

if [ "$KIOSK" = 1 ]; then
  info "Setting up the kiosk autostart..."
  KIOSK_ENV="$RUN_HOME/.config/marco/kiosk.env"
  as_user mkdir -p "$(dirname "$KIOSK_ENV")"
  if [ -n "$KIOSK_URL_ARG" ]; then
    as_user touch "$KIOSK_ENV"
    if grep -q '^KIOSK_URL=' "$KIOSK_ENV"; then
      as_user sed -i "s|^KIOSK_URL=.*|KIOSK_URL=\"${KIOSK_URL_ARG}\"|" "$KIOSK_ENV"
    else
      echo "KIOSK_URL=\"${KIOSK_URL_ARG}\"" | as_user tee -a "$KIOSK_ENV" >/dev/null
    fi
    ok "KIOSK_URL saved in $KIOSK_ENV"
  fi

  if [ "$SERVER" = 1 ]; then
    chmod +x "$SCRIPT_DIR/kiosk.sh" "$SCRIPT_DIR/screen-schedule.sh" 2>/dev/null || true
    KIOSK_CMD="$SCRIPT_DIR/kiosk.sh"
  else
    # Kiosk-only: copy the scripts out of the repository so the checkout is not needed afterwards.
    BIN_DIR="$RUN_HOME/.local/bin"
    as_user mkdir -p "$BIN_DIR"
    as_user install -m 755 "$SCRIPT_DIR/kiosk.sh" "$BIN_DIR/marco-kiosk"
    as_user install -m 755 "$SCRIPT_DIR/screen-schedule.sh" "$BIN_DIR/marco-schedule"
    KIOSK_CMD="$BIN_DIR/marco-kiosk"
    ok "Kiosk script installed to $KIOSK_CMD"
  fi

  # labwc (Raspberry Pi OS Bookworm since late 2024, Wayland)
  add_line_once "$RUN_HOME/.config/labwc/autostart" "$KIOSK_CMD >/tmp/marco-kiosk.log 2>&1 &"

  # LXDE-pi (X11). The user file replaces the system one: copy the global one first if missing.
  LXDE_FILE="$RUN_HOME/.config/lxsession/LXDE-pi/autostart"
  if [ ! -f "$LXDE_FILE" ] && [ -f /etc/xdg/lxsession/LXDE-pi/autostart ]; then
    as_user mkdir -p "$(dirname "$LXDE_FILE")"
    as_user cp /etc/xdg/lxsession/LXDE-pi/autostart "$LXDE_FILE"
  fi
  add_line_once "$LXDE_FILE" "@$KIOSK_CMD"

  # wayfire (Raspberry Pi OS Bookworm 2023-2024): only if its config already exists
  WAYFIRE_INI="$RUN_HOME/.config/wayfire.ini"
  if [ -f "$WAYFIRE_INI" ] && ! grep -q 'marco_kiosk' "$WAYFIRE_INI"; then
    if grep -q '^\[autostart\]' "$WAYFIRE_INI"; then
      as_user sed -i "/^\[autostart\]/a marco_kiosk = $KIOSK_CMD" "$WAYFIRE_INI"
    else
      printf '\n[autostart]\nmarco_kiosk = %s\n' "$KIOSK_CMD" | as_user tee -a "$WAYFIRE_INI" >/dev/null
    fi
    ok "Autostart added to $WAYFIRE_INI"
  fi

  if command -v raspi-config >/dev/null 2>&1; then
    info "Disabling screen blanking and enabling desktop auto-login (raspi-config)..."
    $SUDO raspi-config nonint do_blanking 1 || warn "Could not disable screen blanking"
    $SUDO raspi-config nonint do_boot_behaviour B4 || warn "Could not enable desktop auto-login"
  else
    warn "raspi-config not available: enable desktop auto-login and disable screen blanking yourself."
  fi
fi

# --- Summary ------------------------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
ok "Installation complete"
if [ "$SERVER" = 1 ]; then
  echo "    Display:   http://${IP:-localhost}:$PORT/"
  echo "    Admin:     http://${IP:-localhost}:$PORT/admin/"
  if curl -fsS --max-time 2 "http://localhost:$PORT/api/setup/status" 2>/dev/null | grep -q '"needsSetup":true'; then
    echo
    echo "    First run: open the admin URL above in a browser on your network and follow the setup wizard"
    echo "    (it creates the admin password). From other networks use the setup URL in the log:"
    echo "    journalctl -u $SERVICE_NAME | grep setup"
  fi
  echo
  echo "    Logs:      journalctl -u $SERVICE_NAME -f"
  echo "    Restart:   sudo systemctl restart $SERVICE_NAME"
else
  echo "    This Pi will show: $KIOSK_URL_ARG"
fi
if [ "$KIOSK" = 1 ]; then
  echo "    Kiosk:     starts with the desktop session (sudo reboot)"
  echo "    Kiosk log: /tmp/marco-kiosk.log · settings: ~/.config/marco/kiosk.env"
  echo "    Optional:  turn the screen off at night, see the header of deploy/screen-schedule.sh"
fi
