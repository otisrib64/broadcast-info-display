#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$PROJECT_DIR/data/state.json"
HISTORY="$PROJECT_DIR/data/history"

if [[ "${1:-}" == "--list" ]]; then
  if [[ -d "$HISTORY" ]]; then
    find "$HISTORY" -maxdepth 1 -type f -name 'state-*.json' -printf '%TY-%Tm-%Td %TH:%TM  %f\n' | sort -r
  else
    echo "Ainda não há cópias automáticas em $HISTORY."
  fi
  exit 0
fi

[[ $# -eq 1 ]] || { echo "Uso: $0 --list | <nome-do-arquivo-em-data/history>" >&2; exit 2; }
[[ "$1" != */* && "$1" == state-*.json ]] || { echo "Informe apenas o nome state-*.json listado por --list." >&2; exit 2; }
BACKUP="$HISTORY/$1"
[[ -f "$BACKUP" ]] || { echo "Cópia não encontrada: $BACKUP" >&2; exit 1; }

python3 - "$BACKUP" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    state = json.load(f)
if not isinstance(state, dict) or not isinstance(state.get("rows"), list):
    raise SystemExit("Cópia inválida: formato de estado não reconhecido.")
print(f"Cópia selecionada: {len(state['rows'])} linhas")
PY

mkdir -p "$HISTORY"
STAMP="$(date +%Y%m%d-%H%M%S)"
docker compose -f "$PROJECT_DIR/compose.yaml" stop
cp -a "$STATE" "$HISTORY/state-before-restore-$STAMP.json"
cp -a "$BACKUP" "$STATE"
docker compose -f "$PROJECT_DIR/compose.yaml" start
echo "Estado restaurado. O estado que estava ativo foi guardado em data/history/state-before-restore-$STAMP.json."
