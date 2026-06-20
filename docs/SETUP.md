# Setup Guide

## Desenvolvimento local (Windows/Mac/Linux)

```bash
npm install
npm run build
node dist/server/index.js
```

Abrir:
- Output (tela do Pi):  http://localhost:8080/output
- Controle (qualquer PC): http://localhost:8080/control

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
