# Setup Guide

## Desenvolvimento local (Windows/Mac/Linux)

```bash
npm install
npm run build
node dist/server/index.js
```

Abrir (as três rotas servem a **mesma** página de tela única — Pi mostra no HDMI,
operadores editam pela LAN, tudo sincroniza por WebSocket):
- Output (tela do Pi):  http://localhost:8080/output
- Controle (qualquer PC): http://localhost:8080/control
- Raiz (atalho):         http://localhost:8080/

## Raspberry Pi (produção)

### 1. Gravar imagem

Gravar **Raspberry Pi OS Lite (Bookworm)** no cartão SD via Raspberry Pi Imager.

> **Versão usada (pinar):** anotar a versão exata no ato da gravação.
> Não atualizar o OS sem testar + OK explícito.

### 2. Configurar hostname (opcional mas recomendado)

```bash
sudo hostnamectl set-hostname broadcast-display
```

Com avahi-daemon (já instalado no Pi OS), o painel fica acessível em:
`http://broadcast-display.local:8080/control`

### 3. Rodar provision.sh

```bash
# No Pi, com o projeto copiado ou clonado:
sudo bash provisioning/provision.sh
```

O script:
1. Instala Node.js LTS
2. Copia o app para `/opt/broadcast-info-display`
3. Instala e habilita o serviço systemd
4. Desabilita atualizações automáticas (`apt-daily`, `unattended-upgrades`)
5. Faz `apt-mark hold chromium` (trava versão)
6. Desabilita blanking de tela / DPMS
7. Instrui a instalar o kiosk TOLDOTECHNIK

### 4. Instalar kiosk (Wayland/labwc/Chromium)

```bash
git clone https://github.com/TOLDOTECHNIK/Raspberry-Pi-Kiosk-Display-System /tmp/kiosk
cd /tmp/kiosk && sudo bash kiosk_setup.sh
```

Quando pedir a URL, usar: `http://localhost:8080/output`

### 5. Reboot

```bash
sudo reboot
```

O Pi deve ligar direto no output em fullscreen — sem cursor, sem barra de sistema.

---

## Atualizar o Pi (git pull seguro)

O serviço roda a partir de `/opt/broadcast-info-display`. Para aplicar uma nova
versão sem que o `state.json` em runtime atrapalhe o merge:

```bash
cd /opt/broadcast-info-display
sudo systemctl stop broadcast-display
sudo git fetch origin && sudo git reset --hard origin/main
sudo npm install && sudo npm run build
sudo systemctl start broadcast-display
```

`data/state.json` é ignorado pelo git, então o `reset --hard` **não apaga** o estado
atual da tabela. Recarregue o output (ou `sudo reboot`) para o kiosk pegar a UI nova
(servida com `Cache-Control: no-store`).

## Troubleshooting

### Barra de tradução (Portuguese | English) no HDMI

Resolvido de duas formas, ambas já no projeto:
1. `<meta name="google" content="notranslate">` na página — funciona em qualquer browser.
2. Policy gerenciada do Chromium (`TranslateEnabled: false`) instalada pelo `provision.sh`
   em `/etc/chromium/policies/managed/broadcast-kiosk.json`.

Se ainda aparecer num Pi já provisionado antes desta correção, aplique a policy à mão:

```bash
cd /opt/broadcast-info-display
sudo mkdir -p /etc/chromium/policies/managed /etc/chromium-browser/policies/managed
sudo cp provisioning/chromium-policy.json /etc/chromium/policies/managed/broadcast-kiosk.json
sudo cp provisioning/chromium-policy.json /etc/chromium-browser/policies/managed/broadcast-kiosk.json
sudo reboot
```

### Edição de outro PC não reflete no Pi

Confirme, nesta ordem:
- O servidor escuta em `0.0.0.0` (já é o padrão) — `sudo ss -ltnp | grep 8080`.
- O PC alcança o Pi: abra `http://broadcast-display.local:8080/control` (ou o IP).
- Os logs mostram os dois clientes conectados: `journalctl -u broadcast-display -f`
  → procure `ws.connect` com `clients: 2`.

## Fluxo de sinal

```
Raspberry Pi (HDMI) → conversor HDMI-SDI (opcional) → matriz de vídeo → monitores
```

## Porta padrão

**8080** (evita conflito com Docker na porta 3000).
Pode ser alterada via variável de ambiente: `PORT=9000 node dist/server/index.js`

## Resolução HDMI

Default: **1920×1080@60**. Para ajustar:

```
# /boot/firmware/config.txt
hdmi_group=1
hdmi_mode=16   # 1080p60
```

Para 1080p50: `hdmi_mode=31`. Para 1080i60 (broadcast): `hdmi_mode=5`.
