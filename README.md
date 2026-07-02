# Broadcast Info Display

> **v0.3.1 — versão Fable 5**
> Revisão feita com o Claude **Fable 5**: 17 correções de bugs, robustez e hardening
> sobre a v0.3.0 (janela de chuva, crash no download, backpressure no WebSocket,
> limites de payload, escritas coalescidas) + redesign das telas de output e controle
> (densidade automática, tally bars por status, fontes self-hosted). Validada no
> Raspberry Pi 4 e mergeada na `main` em 2026-07-02.

Appliance de display de informações para broadcast ao vivo. Roda num **Raspberry Pi** com saída HDMI para monitor ou matriz de vídeo. Operadores editam pela rede local; a tela atualiza em tempo real.

```
Operador (PC/tablet)          Raspberry Pi (HDMI)
  /control  ──── WebSocket ────  /output
  edição                         display limpo
```

## Funcionalidades

- **Tabela de câmeras** — até 20 linhas, nomes de colunas editáveis, 5 status (OK / STANDBY / ATENÇÃO / OFF / MANUTENÇÃO)
- **Imagem overlay** — logo ou watermark posicionável por drag, sincroniza em tempo real
- **Memo / banner** — nota de texto exibida em ambas as telas
- **Mini Cloud** — servidor de arquivos local via HTTP (250 MB / 75 MB por arquivo / 15 arquivos)
- **Relógio grande** — relógio ou cronômetro sobrepostos, escala 100–500%, arrastrável
- **Telemetria** — faixa com localização, clima (Open-Meteo, sem chave), previsão de chuva e status de internet
- **Aba Rede** — lê e aplica IP fixo / DHCP do Pi via interface web

## Stack

Node.js + TypeScript · WebSocket (`ws`) · Zod · `busboy` · JS puro no browser (sem bundler) · systemd · Chromium kiosk (Wayland/labwc)

## Instalação rápida (Pi novo)

```bash
# No Pi (Raspberry Pi OS Lite Bookworm):
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/otisrib64/broadcast-info-display ~/broadcast-info-display
cd ~/broadcast-info-display
sudo bash provisioning/provision.sh

# Kiosk Wayland/Chromium:
git clone https://github.com/TOLDOTECHNIK/Raspberry-Pi-Kiosk-Display-System /tmp/kiosk
cd /tmp/kiosk && sudo bash kiosk_setup.sh
# URL: http://localhost:8080/output

sudo reboot
```

Após o reboot o Pi sobe direto na tela de output em fullscreen.
Painel de controle disponível em `http://<ip-do-pi>:8080/control` (ou `http://broadcast-display.local:8080/control`).

> **Pi 3 (1 GB):** habilite swap antes de provisionar — veja [docs/SETUP.md](docs/SETUP.md#notas-para-raspberry-pi-3-1-gb-ram).

## Desenvolvimento local

```bash
npm install
npm run build
node dist/server/index.js
# http://localhost:8080/control
# http://localhost:8080/output
```

## Atualizar um Pi instalado

```bash
ssh pi@<ip-do-pi>
cd /opt/broadcast-info-display
sudo systemctl stop broadcast-display
git pull && npm run build
sudo systemctl start broadcast-display
```

`data/state.json` não é versionado — o `git pull` não apaga o estado atual da tabela.

## Documentação completa

[docs/SETUP.md](docs/SETUP.md) — instalação detalhada, Pi 3, troubleshooting, resolução HDMI, estrutura do projeto.
