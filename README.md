# Broadcast Info Display — servidor Docker

> **Variante Docker / x86 (branch `feat/docker-headless-server`)**
> Fork permanente da v0.3.1 para rodar num PC comum (ex.: Dell Optiplex com Linux Mint)
> dentro de um container. Sem tela de output e sem kiosk: só o servidor e o painel
> `/control` acessado pelo browser. Esta branch **não faz merge na `main`**, que continua
> sendo a versão appliance Raspberry Pi com saída HDMI.

Servidor de informações operacionais para broadcast ao vivo. Operadores editam pelo browser
na rede local, e o estado é transmitido em tempo real via WebSocket para qualquer cliente
conectado: o próprio painel e consumidores externos.

```
Operador (browser)                    Servidor (Docker)                 Consumidor externo
  /control  ──── WebSocket ────  estado + telemetria  ──── WebSocket ────  ws://<ip>:8080
```

## Funcionalidades

- **Tabela de câmeras**: até 20 linhas, nomes de colunas editáveis, 5 status (OK / STANDBY / ATENÇÃO / OFF / MANUTENÇÃO)
- **Imagem overlay**: logo ou watermark posicionável por drag, sincroniza em tempo real
- **Memo / banner**: nota de texto sincronizada entre os clientes
- **Mini Cloud**: servidor de arquivos local via HTTP (250 MB / 75 MB por arquivo / 15 arquivos)
- **Relógio grande**: relógio ou cronômetro sobreposto, escala 100–500%, arrastável
- **Telemetria**: faixa com localização, clima (Open-Meteo, sem chave), previsão de chuva e status de internet

## Stack

Node.js 22 + TypeScript · WebSocket (`ws`) · Zod · `busboy` · JS puro no browser (sem bundler) · Docker

## Rodando com Docker

```bash
git clone -b feat/docker-headless-server https://github.com/otisrib64/broadcast-info-display
cd broadcast-info-display

docker build -t broadcast-info-display .
mkdir -p data
docker run -d --name broadcast-info-display -p 8080:8080 \
  -v "$(pwd)/data:/app/data" --user "$(id -u):$(id -g)" \
  broadcast-info-display
```

Painel: `http://<ip-da-maquina>:8080/control`

Parar: `docker stop broadcast-info-display`. Subir de novo: `docker start broadcast-info-display`.
O container não sobe sozinho no boot, a subida é manual.

Instalação do Docker no Linux Mint, persistência e troubleshooting: [docs/SETUP.md](docs/SETUP.md).

## Atualizar

```bash
git pull
docker build -t broadcast-info-display .
docker rm -f broadcast-info-display
docker run -d --name broadcast-info-display -p 8080:8080 \
  -v "$(pwd)/data:/app/data" --user "$(id -u):$(id -g)" \
  broadcast-info-display
```

`data/` fica fora da imagem (bind mount). Recriar o container não apaga a tabela nem os arquivos da Mini Cloud.

## Desenvolvimento local (sem Docker)

```bash
npm install
npm run build
node dist/server/index.js
# http://localhost:8080/control
```
