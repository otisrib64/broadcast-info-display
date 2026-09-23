#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

echo "[1/4] Atualizando índices do sistema..."
"${SUDO[@]}" apt-get update

echo "[2/4] Instalando Docker Engine e Docker Compose..."
"${SUDO[@]}" apt-get install -y docker.io docker-compose-v2

echo "[3/4] Habilitando o serviço Docker..."
"${SUDO[@]}" systemctl enable --now docker

echo "[4/4] Adicionando ${USER} ao grupo docker..."
"${SUDO[@]}" usermod -aG docker "${USER}"

echo
echo "Instalação concluída. Saia e entre novamente na sessão para usar docker sem sudo."
echo "Depois valide com: docker run --rm hello-world"
