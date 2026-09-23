#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p data
docker compose up -d --build --remove-orphans
docker compose ps
