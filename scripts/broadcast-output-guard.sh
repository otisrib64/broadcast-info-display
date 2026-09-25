#!/usr/bin/env bash
set -Eeuo pipefail

URL='http://localhost:8080/output'
MONITOR_OUTPUT="${BID_OUTPUT_MONITOR:-HDMI-2}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/broadcast-info-display"
PROFILE="$APP_DIR/chromium-output"
CHROMIUM="$(command -v chromium || command -v chromium-browser || true)"
mkdir -p "$PROFILE"

fail() { printf 'Broadcast Output Guard: %s\n' "$*" >&2; exit 1; }
[[ -n "$CHROMIUM" ]] || fail 'Chromium não instalado; instale o pacote chromium do Linux Mint.'
for tool in curl xrandr wmctrl xprop python3; do
  command -v "$tool" >/dev/null || fail "Falta o comando $tool."
done
python3 -c 'import ctypes; ctypes.CDLL("libX11.so.6"); ctypes.CDLL("libXtst.so.6")' ||
  fail 'Faltam as bibliotecas X11/XTest.'

monitor_geometry() {
  xrandr --query 2>/dev/null | awk -v monitor="$MONITOR_OUTPUT" '
    $1 == monitor && $2 == "connected" {
      for (i=3; i<=NF; i++) if ($i ~ /^[0-9]+x[0-9]+[+-][0-9]+[+-][0-9]+$/) print $i
    }'
}

read_geometry() {
  local geometry="$1"
  [[ "$geometry" =~ ^([0-9]+)x([0-9]+)([+-][0-9]+)([+-][0-9]+)$ ]] || return 1
  WIDTH=${BASH_REMATCH[1]}; HEIGHT=${BASH_REMATCH[2]}
  X=${BASH_REMATCH[3]}; Y=${BASH_REMATCH[4]}
}

window_on_target_monitor() {
  wmctrl -lG | awk -v id="$WINDOW_ID" -v x="$X" -v y="$Y" -v w="$WIDTH" -v h="$HEIGHT" '
    $1 == id {
      cx = $3 + $5 / 2; cy = $4 + $6 / 2
      if (cx >= x && cx < x+w && cy >= y && cy < y+h && $5+0 == w+0 && $6+0 == h+0) found=1
    }
    END {exit !found}'
}

send_f11() {
  python3 - <<'PY'
import ctypes
import time
x11 = ctypes.CDLL('libX11.so.6')
xtst = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
display = x11.XOpenDisplay(None)
if not display:
    raise SystemExit('Não foi possível conectar à sessão gráfica X11.')
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_ubyte
keycode = x11.XKeysymToKeycode(display, 0xffc8)  # XK_F11
if not keycode:
    raise SystemExit('A tecla F11 não foi encontrada no mapa do teclado.')
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeKeyEvent(display, keycode, 1, 0)
xtst.XTestFakeKeyEvent(display, keycode, 0, 0)
x11.XFlush(display)
time.sleep(1)
x11.XCloseDisplay(display)
PY
}

place_fullscreen() {
  wmctrl -i -r "$WINDOW_ID" -b remove,hidden,shaded,maximized_vert,maximized_horz,fullscreen || true
  sleep 0.3
  wmctrl -i -r "$WINDOW_ID" -e "0,$X,$Y,$((WIDTH-100)),$((HEIGHT-100))"
  sleep 0.3
  wmctrl -i -a "$WINDOW_ID"
  send_f11
}

while true; do
  GEOMETRY=''
  while [[ -z "$GEOMETRY" ]] || ! read_geometry "$GEOMETRY"; do
    GEOMETRY="$(monitor_geometry || true)"
    [[ -n "$GEOMETRY" ]] || sleep 3
  done

  until curl -fsS --max-time 2 "$URL" >/dev/null 2>&1; do sleep 2; done

  "$CHROMIUM" \
    --user-data-dir="$PROFILE" \
    --password-store=basic \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --app="$URL" &
  BROWSER_PID=$!

  WINDOW_ID=''
  for ((attempt=0; attempt<90; attempt++)); do
    WINDOW_ID="$(wmctrl -lp | awk -v pid="$BROWSER_PID" '$3 == pid && /Output/ {print $1; exit}')"
    [[ -n "$WINDOW_ID" ]] && break
    kill -0 "$BROWSER_PID" 2>/dev/null || break
    sleep 1
  done

  if [[ -z "$WINDOW_ID" ]]; then
    wait "$BROWSER_PID" || true
    sleep 3
    continue
  fi

  place_fullscreen
  printf 'Output Chromium iniciado: monitor=%s geometria=%s janela=%s pid=%s\n' \
    "$MONITOR_OUTPUT" "$GEOMETRY" "$WINDOW_ID" "$BROWSER_PID"

  while kill -0 "$BROWSER_PID" 2>/dev/null; do
    if ! wmctrl -lp | awk -v id="$WINDOW_ID" '$1 == id {found=1} END {exit !found}'; then
      # Janela fechada: encerra o processo para o loop recriá-la de forma limpa.
      kill "$BROWSER_PID" 2>/dev/null || true
      break
    fi

    GEOMETRY="$(monitor_geometry || true)"
    if [[ -n "$GEOMETRY" ]] && read_geometry "$GEOMETRY"; then
      STATES="$(xprop -id "$WINDOW_ID" _NET_WM_STATE 2>/dev/null || true)"
      if grep -q _NET_WM_STATE_HIDDEN <<<"$STATES" ||
         ! grep -q _NET_WM_STATE_FULLSCREEN <<<"$STATES" ||
         ! window_on_target_monitor; then
        place_fullscreen
        printf 'Output restaurado em tela cheia no %s.\n' "$MONITOR_OUTPUT"
      fi
    fi
    sleep 2
  done

  wait "$BROWSER_PID" 2>/dev/null || true
  sleep 3
done
