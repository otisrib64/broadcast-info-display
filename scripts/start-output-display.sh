#!/usr/bin/env bash
set -euo pipefail

URL='http://localhost:8080/output'
MONITOR_OUTPUT="${BID_OUTPUT_MONITOR:-HDMI-2}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/broadcast-info-display"
PROFILE="$APP_DIR/firefox-output"
mkdir -p "$PROFILE"
exec 9>"$APP_DIR/launch.lock"
flock -n 9 || exit 0
fail() { printf 'Broadcast Output: %s\n' "$*" >&2; exit 1; }
for tool in firefox curl xrandr wmctrl xprop python3 systemd-run systemctl; do
  command -v "$tool" >/dev/null || fail "Falta o comando $tool."
done

# Espera a sessão gráfica e o conector, preservando o monitor principal.
GEOMETRY=''
for ((attempt=0; attempt<60; attempt++)); do
  GEOMETRY=$(xrandr --query 2>/dev/null | awk -v monitor="$MONITOR_OUTPUT" '
    $1 == monitor && $2 == "connected" {
      for (i=3; i<=NF; i++) if ($i ~ /^[0-9]+x[0-9]+[+-][0-9]+[+-][0-9]+$/) print $i
    }') || true
  [[ -n "$GEOMETRY" ]] && break
  sleep 1
done
[[ "$GEOMETRY" =~ ^([0-9]+)x([0-9]+)([+-][0-9]+)([+-][0-9]+)$ ]] || fail "Monitor $MONITOR_OUTPUT indisponível."
WIDTH=${BASH_REMATCH[1]}
HEIGHT=${BASH_REMATCH[2]}
X=${BASH_REMATCH[3]}
Y=${BASH_REMATCH[4]}

READY=false
for ((attempt=0; attempt<90; attempt++)); do
  if curl -fsS --max-time 2 "$URL" >/dev/null 2>&1; then READY=true; break; fi
  sleep 1
done
$READY || fail "O servidor não respondeu em $URL."

# Perfil/processo exclusivos: nunca seleciona a janela do controle.
UNIT='broadcast-info-display-browser.service'
if ! systemctl --user is-active --quiet "$UNIT"; then
  systemd-run --user --unit="$UNIT" --collect --property=Type=exec \
    --setenv="DISPLAY=${DISPLAY:-:0}" \
    --setenv="XAUTHORITY=${XAUTHORITY:-$HOME/.Xauthority}" \
    --setenv=MOZ_ENABLE_WAYLAND=0 \
    /usr/bin/firefox --no-remote --profile "$PROFILE" --new-window "$URL"
fi
BROWSER_PID=$(systemctl --user show "$UNIT" --property=MainPID --value)

WINDOW_ID=''
for ((attempt=0; attempt<60; attempt++)); do
  WINDOW_ID=$(wmctrl -lp | awk -v pid="$BROWSER_PID" '$3 == pid && /Broadcast Info Display.*Output/ { print $1; exit }')
  [[ -n "$WINDOW_ID" ]] && break
  sleep 1
done
[[ -n "$WINDOW_ID" ]] || fail "Janela Output não encontrada; consulte journalctl --user -u $UNIT."

window_on_target_monitor() {
  wmctrl -lG | awk -v id="$WINDOW_ID" -v x="$X" -v y="$Y" -v w="$WIDTH" -v h="$HEIGHT" '
    $1 == id {
      cx = $3 + $5 / 2; cy = $4 + $6 / 2
      if (cx >= x && cx < x+w && cy >= y && cy < y+h && $5+0 == w+0 && $6+0 == h+0) found=1
    }
    END {exit !found}'
}
IS_FULLSCREEN=false
if xprop -id "$WINDOW_ID" _NET_WM_STATE 2>/dev/null | grep -q _NET_WM_STATE_FULLSCREEN; then
  IS_FULLSCREEN=true
fi
if [[ "$IS_FULLSCREEN" != true ]] || ! window_on_target_monitor; then
  if [[ "$IS_FULLSCREEN" == true ]]; then
    wmctrl -i -r "$WINDOW_ID" -b remove,fullscreen
    sleep 0.5
  fi
  wmctrl -i -r "$WINDOW_ID" -b remove,maximized_vert,maximized_horz
  sleep 0.5
  wmctrl -i -r "$WINDOW_ID" -e "0,$X,$Y,$((WIDTH-100)),$((HEIGHT-100))"
  sleep 0.5
  # Ativa a janela no monitor escolhido e envia F11 real via XTest.
  wmctrl -i -a "$WINDOW_ID"
  python3 - <<'PY'
import ctypes
import time
x11 = ctypes.CDLL('libX11.so.6')
xtst = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
display = x11.XOpenDisplay(None)
if not display:
    raise SystemExit('Não foi possível conectar à sessão X11.')
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
fi

xprop -id "$WINDOW_ID" _NET_WM_STATE | grep -q _NET_WM_STATE_FULLSCREEN || fail 'O Firefox não ativou tela cheia com F11.'
window_on_target_monitor || fail "A janela não está em $MONITOR_OUTPUT ($GEOMETRY)."
printf 'Output em tela cheia via F11: %s (%s), janela %s.\n' "$MONITOR_OUTPUT" "$GEOMETRY" "$WINDOW_ID"
