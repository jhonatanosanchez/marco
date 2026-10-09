#!/usr/bin/env bash
# Starts Chromium in kiosk mode showing Marco.
# Launched by the desktop session autostart (labwc / wayfire / LXDE-pi), see deploy/install.sh.
#
# Optional variables (put them in ~/.config/marco/kiosk.env):
#   KIOSK_URL        URL to show (default http://localhost:$PORT/). Another machine: http://192.168.1.50:3000/
#                    ?screen=<slug> picks a screen profile, ?lite=1 disables the WebGL effects (slow Pis).
#   KIOSK_CLIENT     Name of this display in the admin panel (default: hostname)
#   PORT             Local server port (default: read from ../.env, else 3000)
#   KIOSK_EXTRA_ARGS Extra Chromium flags, e.g. "--force-device-scale-factor=0.75" to fit more on a small screen
#   KIOSK_WAIT_SEC   Max seconds to wait for /api/health before opening anyway (default 120)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# shellcheck disable=SC1091
[ -f "$HOME/.config/marco/kiosk.env" ] && . "$HOME/.config/marco/kiosk.env"

if [ -z "${PORT:-}" ] && [ -f "$APP_DIR/.env" ]; then
  PORT="$(grep -E '^PORT=' "$APP_DIR/.env" | tail -n1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
fi
PORT="${PORT:-3000}"
KIOSK_URL="${KIOSK_URL:-http://localhost:${PORT}/}"
# Stable identity for the admin's "Connected displays" page: Chromium runs --incognito, so localStorage does not
# survive restarts; append client=<hostname> unless the URL already has one.
# (Another screen profile: KIOSK_URL="http://localhost:3000/?screen=kitchen")
KIOSK_CLIENT="${KIOSK_CLIENT:-$(hostname 2>/dev/null || echo kiosk)}"
KIOSK_CLIENT="$(printf '%s' "$KIOSK_CLIENT" | tr -c 'A-Za-z0-9_-' '-' | cut -c1-64)"
case "$KIOSK_URL" in
  *client=*) ;;
  *\?*) KIOSK_URL="${KIOSK_URL}&client=${KIOSK_CLIENT}" ;;
  *) KIOSK_URL="${KIOSK_URL}?client=${KIOSK_CLIENT}" ;;
esac
KIOSK_WAIT_SEC="${KIOSK_WAIT_SEC:-120}"
KIOSK_EXTRA_ARGS="${KIOSK_EXTRA_ARGS:-}"
# Health check against the server the URL points to (works for a remote server too).
ORIGIN="$(printf '%s' "$KIOSK_URL" | sed -E 's|^(https?://[^/?#]+).*|\1|')"
HEALTH_URL="${ORIGIN}/api/health"

log() { echo "[kiosk $(date '+%H:%M:%S')] $*"; }

# --- Single instance ------------------------------------------------------------
LOCK_DIR="${XDG_RUNTIME_DIR:-/tmp}"
exec 9>"$LOCK_DIR/marco-kiosk.lock"
if ! flock -n 9; then
  log "A kiosk is already running; exiting."
  exit 0
fi

# --- Browser --------------------------------------------------------------------
BROWSER=""
for b in chromium-browser chromium google-chrome; do
  if command -v "$b" >/dev/null 2>&1; then BROWSER="$b"; break; fi
done
if [ -z "$BROWSER" ]; then
  log "ERROR: Chromium not found. Install it with: sudo apt install chromium (or chromium-browser)"
  exit 1
fi

IS_WAYLAND=0
if [ -n "${WAYLAND_DISPLAY:-}" ]; then IS_WAYLAND=1; fi

# --- Keep the screen on and hide the cursor --------------------------------------
if [ "$IS_WAYLAND" = 1 ]; then
  # On labwc/wayfire screen blanking is done by swayidle (started by the system autostart).
  # Disable it permanently with: sudo raspi-config nonint do_blanking 1
  if pgrep -u "$(id -u)" -x swayidle >/dev/null 2>&1; then
    log "Stopped swayidle so the screen does not blank."
    pkill -u "$(id -u)" -x swayidle || true
  fi
  # Hide the cursor: move it to the bottom-right corner (the page also uses cursor: none).
  if command -v wlrctl >/dev/null 2>&1; then
    wlrctl pointer move 10000 10000 >/dev/null 2>&1 || true
  fi
else
  if command -v xset >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
    xset s off || true
    xset s noblank || true
    xset -dpms || true
  fi
  if command -v unclutter >/dev/null 2>&1 && ! pgrep -u "$(id -u)" -x unclutter >/dev/null 2>&1; then
    unclutter -idle 0.5 -root >/dev/null 2>&1 &
  fi
fi

# --- Wait for the server ---------------------------------------------------------
http_ok() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 3 "$1" >/dev/null 2>&1
  else
    wget -q -T 3 -O /dev/null "$1" >/dev/null 2>&1
  fi
}

log "Waiting for the server at $HEALTH_URL (max ${KIOSK_WAIT_SEC}s)..."
waited=0
until http_ok "$HEALTH_URL"; do
  if [ "$waited" -ge "$KIOSK_WAIT_SEC" ]; then
    log "Server not answering; opening anyway (the page retries by itself)."
    break
  fi
  sleep 2
  waited=$((waited + 2))
done

# --- Chromium flags ----------------------------------------------------------------
PROFILE_DIR="$HOME/.cache/marco-kiosk"
mkdir -p "$PROFILE_DIR"

FLAGS=(
  --kiosk
  --noerrdialogs
  --disable-infobars
  --incognito
  --no-first-run
  --check-for-update-interval=31536000
  --disable-features=Translate
  --overscroll-history-navigation=0
  --enable-gpu-rasterization
  --ignore-gpu-blocklist
  --disable-session-crashed-bubble
  --disable-pinch
  --password-store=basic
  --autoplay-policy=no-user-gesture-required
  --user-data-dir="$PROFILE_DIR"
)
if [ "$IS_WAYLAND" = 1 ]; then
  FLAGS+=(--ozone-platform=wayland)
fi
# shellcheck disable=SC2206
EXTRA=( $KIOSK_EXTRA_ARGS )

# --- Loop: relaunch Chromium if it exits or crashes ---------------------------------
trap 'log "Exiting"; pkill -P $$ || true; exit 0' INT TERM

fails=0
while true; do
  log "Launching $BROWSER -> $KIOSK_URL"
  start_ts=$(date +%s)
  "$BROWSER" "${FLAGS[@]}" "${EXTRA[@]}" "$KIOSK_URL" >/dev/null 2>&1 9>&- || true
  run_for=$(( $(date +%s) - start_ts ))
  if [ "$run_for" -lt 30 ]; then
    fails=$((fails + 1))
  else
    fails=0
  fi
  # Back off when it keeps failing (max 60 s)
  delay=$(( fails * 5 ))
  [ "$delay" -gt 60 ] && delay=60
  [ "$delay" -lt 3 ] && delay=3
  log "Chromium exited (ran ${run_for}s). Relaunching in ${delay}s..."
  sleep "$delay"
done
