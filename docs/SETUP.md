# Broadcast Info Display — Setup Guide

## O que é

Appliance de display de informações para broadcast. Roda num **Raspberry Pi** conectado via HDMI
a um monitor/matriz de vídeo. Operadores editam a tabela de câmeras pela rede local; a tela HDMI
atualiza em tempo real via WebSocket.

### Rotas

| Rota | Quem usa | Descrição |
|------|----------|-----------|
| `/control` | Operador (PC/tablet) | Painel de controle — edição completa |
| `/output`  | Raspberry Pi (HDMI)  | Display limpo — somente leitura |
| `/`        | —                    | Redireciona para `/control` |

---

## Desenvolvimento local (Windows/Mac/Linux)

```bash
npm install
npm run build
node dist/server/index.js
```

- Controle: http://localhost:8080/control
- Output:   http://localhost:8080/output

---

## Instalação num Raspberry Pi novo

### 1. Gravar o cartão SD

Gravar **Raspberry Pi OS Lite (Bookworm)** via Raspberry Pi Imager.
No Imager já configure: hostname, usuário `pi`, SSH habilitado, Wi-Fi/rede.

> **Pinar a versão:** anotar a versão exata usada. Não atualizar o OS sem teste + OK explícito.

### 2. Primeiro boot — SSH e hostname

```bash
ssh pi@<ip-do-pi>
sudo hostnamectl set-hostname broadcast-display
```

Com avahi-daemon (já instalado no Pi OS), o painel fica disponível em:
`http://broadcast-display.local:8080/control`

### 3. Clonar o repositório

O repo é público — não precisa de autenticação:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/otisrib64/broadcast-info-display ~/broadcast-info-display
cd ~/broadcast-info-display
```

### 4. Provisionar

```bash
sudo bash provisioning/provision.sh
```

O script faz automaticamente:

1. Instala Node.js LTS via nodesource
2. Copia o app para `/opt/broadcast-info-display`
3. Instala dependências (`npm ci`), compila (`tsc`), remove devDeps (`npm prune`)
4. Instala e habilita o serviço systemd `broadcast-display` (inicia no boot, restart automático)
5. Garante permissão de escrita em `data/` para o usuário `pi`
6. Desabilita atualizações automáticas (`apt-daily`, `unattended-upgrades`)
7. Trava a versão do Chromium (`apt-mark hold`)
8. Desabilita blanking de tela / DPMS (Wayland idle + Xorg fallback)
9. Instala policy do Chromium para desativar barra de tradução

### 5. Instalar o kiosk (Wayland/labwc/Chromium fullscreen)

```bash
git clone https://github.com/TOLDOTECHNIK/Raspberry-Pi-Kiosk-Display-System /tmp/kiosk
cd /tmp/kiosk && sudo bash kiosk_setup.sh
```

Quando pedir a URL, digitar: **`http://localhost:8080/output`**

### 6. Reboot

```bash
sudo reboot
```

O Pi deve iniciar direto no `/output` fullscreen — sem cursor, sem barra de sistema.

---

## Notas para Raspberry Pi 3 (1 GB RAM)

O Pi 3 roda o projeto, mas com margem menor de memória (Node + Chromium somam ~500 MB).

**Recomendações obrigatórias:**

```bash
# Habilitar swap (evita OOM)
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile   # CONF_SWAPSIZE=512
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
```

**Build no Pi 3 é lento** (tsc no ARMv7 + SD card). Alternativa: buildar no PC e copiar o `dist/`:

```bash
# No PC:
npm run build
scp -r dist/ pi@<ip-do-pi>:/opt/broadcast-info-display/

# No Pi (não precisa do tsc):
cd /opt/broadcast-info-display
npm ci --omit=dev
sudo systemctl restart broadcast-display
```

---

## Atualizar um Pi já instalado

```bash
ssh pi@<ip-do-pi>
cd /opt/broadcast-info-display
sudo systemctl stop broadcast-display
git pull
npm run build
sudo systemctl start broadcast-display
```

`data/state.json` é ignorado pelo git — o `git pull` **não apaga** o estado atual da tabela.
Recarregue o kiosk (ou `sudo reboot`) para o Chromium pegar a nova UI.

---

## Funcionalidades (v0.3.0)

### Tabela de câmeras
- Até **20 linhas**, adicionadas pelo botão `+ Linha`
- 5 status: **OK** · **STANDBY** · **ATENÇÃO** · **OFF** · **MANUTENÇÃO**
- Nomes de colunas editáveis (clica no cabeçalho)
- Autocomplete nas colunas Modelo (FS1/FS2/FS4/FA/Teranex) e Fonte (SDI/HDMI/Fiber)

### Imagem overlay
- Aba **Imagem** no painel de controle
- Upload de imagem (PNG/JPG, limite 3 MB) posicionável via drag ou sliders
- Aparece sobre a tabela no output HDMI
- Sincroniza em tempo real via WebSocket

### Notas / Memo
- Aba **Notas** — texto livre exibido como banner em ambas as telas

### Mini Cloud
- Aba **Mini Cloud** — servidor de arquivos local via HTTP (não usa WebSocket)
- Limites: 75 MB por arquivo · 250 MB total · 15 arquivos máx
- Upload por drag-and-drop ou seleção · Download · Exclusão

### Relógio grande
- Aba **Relógio** — relógio ou cronômetro sobrepostos à tabela
- Escala configurável (100%–500%), posicionável por drag

### Telemetria (faixa superior)
- **Localização**: cidade/região detectada por IP (sem chave de API)
- **Clima**: temperatura + condição via Open-Meteo (sem chave)
- **Previsão**: chuva nas próximas horas
- **Internet**: status online/offline com tempo desde a última queda
- Atualiza automaticamente; degrada para "último valor" se offline

### Rede (aba Rede — apenas no controle)
- Lê IP/gateway/DNS atual do Pi
- Permite mudar para IP fixo ou DHCP via modal de confirmação

---

## Variáveis de ambiente

| Variável   | Padrão | Descrição |
|------------|--------|-----------|
| `PORT`     | `8080` | Porta do servidor HTTP/WS |
| `BID_LAT`  | —      | Latitude fixa (override da geolocalização por IP) |
| `BID_LON`  | —      | Longitude fixa (idem) |
| `BID_CITY` | —      | Nome da cidade exibido na faixa de telemetria |

A porta pode ser alterada no serviço systemd em `provisioning/broadcast-display.service`.
As três variáveis `BID_*` devem ser definidas juntas para o override valer.

---

## Modelo de segurança

O appliance assume **LAN de confiança**: qualquer máquina na rede que alcance a porta 8080
pode editar a tabela, trocar a imagem e reconfigurar o IP do Pi. Não há autenticação — é uma
decisão de design (operação de broadcast em rede fechada), não um esquecimento.

Defesas em profundidade que existem mesmo assim:

- Toda mensagem WS é validada por schema Zod (shape, enums, limites de tamanho por campo);
  chaves desconhecidas são descartadas. `setState` substitui o estado inteiro por design.
- Frames WS limitados a 5 MB; clientes lentos são pulados no broadcast (sem OOM).
- Uploads: máx. 2 simultâneos, 75 MB/arquivo, 250 MB total, 15 arquivos; download força
  `application/octet-stream` (nada renderiza no browser); IDs com guard de path traversal.
- O painel só aceita `data:image/` como overlay — URL remota é ignorada.

**Não exponha a porta 8080 à internet.** Se a rede não for confiável, feche a porta no
firewall e acesse o controle por VPN/túnel SSH.

---

## Porta e resolução HDMI

**Porta padrão: 8080** (evita conflito com Docker na 3000).

Resolução HDMI padrão: **1920×1080@60**. Para ajustar edite `/boot/firmware/config.txt`:

```
hdmi_group=1
hdmi_mode=16   # 1080p60
# hdmi_mode=31  # 1080p50
# hdmi_mode=5   # 1080i60 (broadcast interlaced)
```

---

## Troubleshooting

### Barra de tradução no HDMI

Resolvida automaticamente pelo `provision.sh` (policy do Chromium). Em Pi provisionado antes:

```bash
cd /opt/broadcast-info-display
sudo mkdir -p /etc/chromium/policies/managed /etc/chromium-browser/policies/managed
sudo cp provisioning/chromium-policy.json /etc/chromium/policies/managed/broadcast-kiosk.json
sudo cp provisioning/chromium-policy.json /etc/chromium-browser/policies/managed/broadcast-kiosk.json
sudo reboot
```

### Output mostra /control em vez de /output no HDMI

```bash
# Verificar e corrigir o autostart do kiosk:
cat ~/.config/labwc/autostart
# Deve ter: ...http://localhost:8080/output
# Se tiver só http://localhost:8080, corrigir:
sed -i 's|http://localhost:8080$|http://localhost:8080/output|' ~/.config/labwc/autostart
sudo reboot
```

### Edição no PC não reflete no Pi

1. Servidor escuta em `0.0.0.0`: `sudo ss -ltnp | grep 8080`
2. PC alcança o Pi: abrir `http://broadcast-display.local:8080/control`
3. Logs do serviço: `journalctl -u broadcast-display -f`
   → procurar `ws.connect` com `clients: 2`

### Serviço não inicia (EACCES em data/)

```bash
sudo chown -R pi:pi /opt/broadcast-info-display/data
sudo systemctl restart broadcast-display
```

---

## Fluxo de sinal

```
Raspberry Pi (HDMI) → conversor HDMI-SDI (opcional) → matriz de vídeo → monitores/câmeras
```

---

## Estrutura do projeto

```
src/
  shared/types.ts          # Schemas zod (State, Row, Status, FileMeta…)
  server/
    index.ts               # HTTP + WebSocket, roteamento
    state.ts               # Persistência em data/state.json (atomic write)
    protocol.ts            # Parse/apply/broadcast de mensagens WS
    static.ts              # Servidor de arquivos estáticos com guard traversal
    telemetry/             # Clima, localização, internet (Open-Meteo, ip-api)
    files/                 # Mini Cloud: store, api HTTP (busboy)
    network/               # Leitura e aplicação de config de rede (nmcli)
  web/
    shared/
      base.css             # Design system comum (tokens, layout, status)
      ws-client.js         # WebSocket com reconnect/backoff
      render.js            # Critical strip, memo banner, legenda, badges
      clock.js             # Relógio/cronômetro, drag
    control/               # Painel de controle (/control)
    output/                # Display HDMI (/output)
data/
  state.json               # Estado persistido (não versionado)
  files/                   # Arquivos da Mini Cloud (não versionados)
provisioning/
  provision.sh             # Script de instalação completa no Pi
  broadcast-display.service # Unit systemd
  chromium-policy.json     # Desativa tradução no Chromium
docs/
  SETUP.md                 # Este arquivo
```
