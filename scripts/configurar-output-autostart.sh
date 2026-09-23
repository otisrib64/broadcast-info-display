#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$HOME/.local/bin/start-broadcast-output.sh"
AUTOSTART="$HOME/.config/autostart/broadcast-info-display-output.desktop"
UNIT="broadcast-info-display-browser.service"

case "${1:-enable}" in
  enable)
    command -v firefox >/dev/null || { echo "Firefox não está instalado." >&2; exit 1; }
    for tool in curl xrandr wmctrl xprop python3 systemd-run systemctl; do
      command -v "$tool" >/dev/null || { echo "Falta dependência: $tool" >&2; exit 1; }
    done
    python3 -c 'import ctypes; ctypes.CDLL("libX11.so.6"); ctypes.CDLL("libXtst.so.6")' ||
      { echo "Faltam as bibliotecas X11/XTest." >&2; exit 1; }
    install -D -m 755 "$PROJECT_DIR/scripts/start-output-display.sh" "$LAUNCHER"
    temp_file="$(mktemp)"
    trap 'rm -f "$temp_file"' EXIT
    sed "s|@HOME@|$HOME|g" "$PROJECT_DIR/scripts/broadcast-info-display-output.desktop.in" > "$temp_file"
    install -D -m 644 "$temp_file" "$AUTOSTART"
    echo "Autostart configurado. Para testar agora: $LAUNCHER"
    ;;
  disable)
    systemctl --user stop "$UNIT" 2>/dev/null || true
    rm -f "$AUTOSTART" "$LAUNCHER"
    echo "Autostart removido; Docker e dados do projeto foram mantidos."
    ;;
  *)
    echo "Uso: $0 [enable|disable]" >&2
    exit 2
    ;;
esac
