#!/usr/bin/env bash
set -euo pipefail

UNIT='broadcast-info-display-output.service'
if ! systemctl --user cat "$UNIT" >/dev/null 2>&1; then
  printf 'Output dedicado ainda não configurado. Rode scripts/configurar-output-autostart.sh enable.\n' >&2
  exit 1
fi

systemctl --user start "$UNIT"
printf 'Serviço do Output iniciado. Ele abre no Chromium dedicado e restaura tela cheia no monitor configurado.\n'
