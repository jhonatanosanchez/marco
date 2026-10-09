#!/usr/bin/env bash
# Turns the HDMI display on or off (for cron: off at night, on in the morning).
#
#   screen-schedule.sh off     -> display off
#   screen-schedule.sh on      -> display on
#   screen-schedule.sh status  -> show which method would be used
#
# Where it is:
#   kiosk-only install (--mode kiosk):  ~/.local/bin/marco-schedule
#   all-in-one install:                 ~/marco/current/deploy/screen-schedule.sh (/opt/marco/... when installed as root)
#   git checkout:                       <checkout>/deploy/screen-schedule.sh
#
# Example crontab for the desktop user (crontab -e) on a kiosk-only device (replace "pi" with your user name):
#   # Off at 23:30 and on at 07:00 every day
#   30 23 * * *  /home/pi/.local/bin/marco-schedule off >/dev/null 2>&1
#   0  7  * * *  /home/pi/.local/bin/marco-schedule on  >/dev/null 2>&1
#   # Later on weekends (Saturday and Sunday at 09:00)
#   # 0 9 * * 6,0 /home/pi/.local/bin/marco-schedule on >/dev/null 2>&1
# On an all-in-one install use /home/pi/marco/current/deploy/screen-schedule.sh instead.
#
# Optional variables: SCREEN_OUTPUT (e.g. HDMI-A-1), WAYLAND_DISPLAY, DISPLAY.
set -euo pipefail

ACTION="${1:-status}"
UID_NUM="$(id -u)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$UID_NUM}"

# Desde cron no hay variables de sesion grafica: las deducimos.
if [ -z "${WAYLAND_DISPLAY:-}" ]; then
  for sock in "$XDG_RUNTIME_DIR"/wayland-*; do
    case "$sock" in *.lock) continue ;; esac
    if [ -S "$sock" ]; then WAYLAND_DISPLAY="$(basename "$sock")"; export WAYLAND_DISPLAY; break; fi
  done
fi
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -z "${DISPLAY:-}" ] && [ -S /tmp/.X11-unix/X0 ]; then
  export DISPLAY=":0"
fi

method=""
if [ -n "${WAYLAND_DISPLAY:-}" ] && command -v wlr-randr >/dev/null 2>&1; then
  method="wlr-randr"
elif [ -n "${DISPLAY:-}" ] && command -v xset >/dev/null 2>&1; then
  method="xset"
elif command -v vcgencmd >/dev/null 2>&1; then
  method="vcgencmd"   # Only works with the legacy (non-KMS) video driver
fi

if [ -z "$method" ]; then
  echo "No way to control the display found (install wlr-randr on Wayland)." >&2
  exit 1
fi

output_name() {
  if [ -n "${SCREEN_OUTPUT:-}" ]; then echo "$SCREEN_OUTPUT"; return; fi
  # First output listed by wlr-randr (lines that do not start with a space)
  wlr-randr 2>/dev/null | awk '/^[^ ]/ {print $1; exit}'
}

case "$ACTION" in
  off)
    case "$method" in
      wlr-randr) wlr-randr --output "$(output_name)" --off ;;
      xset)      xset dpms force off ;;
      vcgencmd)  vcgencmd display_power 0 >/dev/null ;;
    esac
    echo "Display off ($method)."
    ;;
  on)
    case "$method" in
      wlr-randr) wlr-randr --output "$(output_name)" --on ;;
      xset)      xset dpms force on; xset s reset || true; xset -dpms || true ;;
      vcgencmd)  vcgencmd display_power 1 >/dev/null ;;
    esac
    echo "Display on ($method)."
    ;;
  status)
    echo "Method: $method"
    if [ "$method" = "wlr-randr" ]; then echo "Output: $(output_name) (WAYLAND_DISPLAY=$WAYLAND_DISPLAY)"; fi
    if [ "$method" = "xset" ]; then echo "DISPLAY=$DISPLAY"; fi
    ;;
  *)
    echo "Usage: $0 on|off|status" >&2
    exit 2
    ;;
esac
