#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$HOME/.local/bin/start-broadcast-output.sh"
GUARD="$HOME/.local/bin/broadcast-output-guard.sh"
AUTOSTART="$HOME/.config/autostart/broadcast-info-display-output.desktop"
UNIT="broadcast-info-display-output.service"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/$UNIT"

case "${1:-enable}" in
  enable)
    command -v chromium >/dev/null || command -v chromium-browser >/dev/null || {
      echo "Chromium não está instalado. Instale o pacote chromium e rode este comando novamente." >&2
      exit 1
    }
    for tool in curl xrandr wmctrl xprop python3 systemctl; do
      command -v "$tool" >/dev/null || { echo "Falta dependência: $tool" >&2; exit 1; }
    done
    python3 -c 'import ctypes; ctypes.CDLL("libX11.so.6"); ctypes.CDLL("libXtst.so.6")' ||
      { echo "Faltam as bibliotecas X11/XTest." >&2; exit 1; }
    install -D -m 755 "$PROJECT_DIR/scripts/start-output-display.sh" "$LAUNCHER"
    install -D -m 755 "$PROJECT_DIR/scripts/broadcast-output-guard.sh" "$GUARD"
    install -d -m 755 "$UNIT_DIR"
    sed "s|@HOME@|$HOME|g" "$PROJECT_DIR/scripts/broadcast-info-display-output.service.in" > "$UNIT_FILE"
    chmod 644 "$UNIT_FILE"
    temp_file="$(mktemp)"
    trap 'rm -f "$temp_file"' EXIT
    sed "s|@HOME@|$HOME|g" "$PROJECT_DIR/scripts/broadcast-info-display-output.desktop.in" > "$temp_file"
    install -D -m 644 "$temp_file" "$AUTOSTART"
    systemctl --user stop broadcast-info-display-browser.service 2>/dev/null || true
    systemctl --user daemon-reload
    systemctl --user enable --now "$UNIT"
    echo "Output dedicado configurado: Chromium separado, monitor HDMI-2, F11, restauração automática e reinício no boot."
    ;;
  disable)
    systemctl --user disable --now "$UNIT" 2>/dev/null || true
    systemctl --user stop broadcast-info-display-browser.service 2>/dev/null || true
    rm -f "$AUTOSTART" "$LAUNCHER" "$GUARD" "$UNIT_FILE"
    systemctl --user daemon-reload
    echo "Output automático desativado; perfis do navegador, Docker e dados do projeto foram mantidos."
    ;;
  *)
    echo "Uso: $0 [enable|disable]" >&2
    exit 2
    ;;
esac
