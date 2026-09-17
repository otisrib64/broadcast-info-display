# Broadcast Info Display — Setup Guide (Docker)

## O que é

Servidor de informações operacionais para broadcast, empacotado em Docker para rodar num PC
comum (ex.: Dell Optiplex com Linux Mint). Operadores editam a tabela pelo browser na rede local,
e o estado é transmitido em tempo real via WebSocket para todos os clientes conectados.

Esta é a variante **sem tela de output e sem kiosk** (branch `feat/docker-headless-server`).
A versão appliance Raspberry Pi com saída HDMI continua na `main`.

### Rotas

| Rota | Quem usa | Descrição |
|------|----------|-----------|
| `/control`         | Operador (browser)  | Painel de controle, edição completa |
| `/api/files`       | Painel (Mini Cloud) | Upload, listagem, download e exclusão de arquivos |
| `ws://<ip>:8080`   | Painel e consumidores externos | Estado + telemetria em tempo real |
| `/`                | —                   | Redireciona para `/control` |

---

## Instalar Docker no Linux Mint

Use o repositório oficial da Docker para Ubuntu. O Mint é baseado em Ubuntu, mas o
`VERSION_CODENAME` dele é o nome do Mint (ex.: `wilma`), que não existe no repo da Docker.
Por isso o comando abaixo usa o **`UBUNTU_CODENAME`** do `/etc/os-release`.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$UBUNTU_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin

# Rodar docker sem sudo (vale depois de sair e entrar de novo na sessão)
sudo usermod -aG docker $USER
```

Conferir: `docker run --rm hello-world`.

> **LMDE** (Linux Mint Debian Edition) não é baseado em Ubuntu: nesse caso use o repo
> `https://download.docker.com/linux/debian` com o codinome Debian (`DEBIAN_CODENAME`).

---

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

| Ação | Comando |
|------|---------|
| Parar | `docker stop broadcast-info-display` |
| Subir de novo | `docker start broadcast-info-display` |
| Ver logs | `docker logs -f broadcast-info-display` |
| Status | `docker ps -a --filter name=broadcast-info-display` |

A subida é **manual**: o container não inicia sozinho no boot. O `docker stop` manda SIGTERM
e o servidor grava a última edição pendente do `state.json` antes de sair.

### Atualizar

```bash
git pull
docker build -t broadcast-info-display .
docker rm -f broadcast-info-display
docker run -d --name broadcast-info-display -p 8080:8080 \
  -v "$(pwd)/data:/app/data" --user "$(id -u):$(id -g)" \
  broadcast-info-display
```

### Persistência de dados

Tudo que precisa sobreviver fica em `data/` no host, montado em `/app/data` no container:

- `data/state.json`: tabela, colunas, memo, overlay, relógio
- `data/files/`: arquivos da Mini Cloud

Recriar o container ou a imagem não apaga nada. Para zerar o estado, pare o container e apague `data/`.

- **`mkdir -p data` antes do primeiro `docker run`**: se a pasta não existir, o Docker cria como
  `root` e o servidor não consegue gravar.
- **`--user "$(id -u):$(id -g)"`**: o processo roda com o seu usuário, então os arquivos criados
  em `data/` ficam com o seu dono e você edita ou apaga sem `sudo`.

### Trocar porta ou localização

A porta de dentro do container fica em 8080. Para usar outra no host, troque só o lado esquerdo
do `-p`, por exemplo `-p 9000:8080`.

| Variável   | Padrão | Descrição |
|------------|--------|-----------|
| `BID_LAT`  | —      | Latitude fixa (override da geolocalização por IP) |
| `BID_LON`  | —      | Longitude fixa (idem) |
| `BID_CITY` | —      | Nome da cidade exibido na faixa de telemetria |

As três variáveis `BID_*` devem ser definidas juntas para o override valer. Passe com `-e` no `docker run`:

```bash
docker run -d --name broadcast-info-display -p 8080:8080 \
  -v "$(pwd)/data:/app/data" --user "$(id -u):$(id -g)" \
  -e BID_LAT=-23.55 -e BID_LON=-46.63 -e BID_CITY="São Paulo" \
  broadcast-info-display
```

---

## Consumindo o estado via WebSocket

Qualquer cliente pode abrir `ws://<ip-da-maquina>:8080` e receber o mesmo fluxo que o painel.
Na conexão chegam um `state` e um `telemetry`, e depois uma mensagem a cada mudança:

| Mensagem | Quando |
|----------|--------|
| `{ "type": "state", "state": { ... } }` | Na conexão e a cada edição de qualquer cliente |
| `{ "type": "telemetry", "telemetry": { ... } }` | Na conexão e a cada atualização de clima/localização/internet |
| `{ "type": "filesChanged" }` | Upload ou exclusão na Mini Cloud |

Os schemas completos (`State`, `Row`, `Telemetry`) estão em `src/shared/types.ts`. Um consumidor
só de leitura pode ignorar tudo que não seja `state`.

---

## Funcionalidades

### Tabela de câmeras
- Até **20 linhas**, adicionadas pelo botão `+ Linha`
- 5 status: **OK** · **STANDBY** · **ATENÇÃO** · **OFF** · **MANUTENÇÃO**
- Nomes de colunas editáveis (clica no cabeçalho)
- Autocomplete nas colunas Modelo (FS1/FS2/FS4/FA/Teranex) e Fonte (SDI/HDMI/Fiber)

### Imagem overlay
- Aba **Imagem** no painel de controle
- Upload de imagem (PNG/JPG, limite 3 MB) posicionável via drag ou sliders
- Sincroniza em tempo real com todos os clientes WebSocket

### Notas / Memo
- Aba **Notas**: texto livre exibido como banner

### Mini Cloud
- Aba **Mini Cloud**: servidor de arquivos local via HTTP (não usa WebSocket)
- Limites: 75 MB por arquivo · 250 MB total · 15 arquivos máx
- Upload por drag-and-drop ou seleção · Download · Exclusão

### Relógio grande
- Aba **Relógio**: relógio ou cronômetro sobreposto à tabela
- Escala configurável (100%–500%), posicionável por drag

### Telemetria (faixa superior)
- **Localização**: cidade/região detectada por IP (sem chave de API)
- **Clima**: temperatura + condição via Open-Meteo (sem chave)
- **Previsão**: chuva nas próximas horas
- **Internet**: status online/offline com tempo desde a última queda
- Atualiza automaticamente e mantém o último valor se ficar offline

---

## Modelo de segurança

O servidor assume **LAN de confiança**: qualquer máquina na rede que alcance a porta 8080
pode editar a tabela e trocar a imagem. Não há autenticação: é uma decisão de design
(operação de broadcast em rede fechada), não um esquecimento.

Defesas em profundidade que existem mesmo assim:

- Toda mensagem WS é validada por schema Zod (shape, enums, limites de tamanho por campo);
  chaves desconhecidas são descartadas. `setState` substitui o estado inteiro por design.
- Frames WS limitados a 5 MB; clientes lentos são pulados no broadcast (sem OOM).
- Uploads: máx. 2 simultâneos, 75 MB/arquivo, 250 MB total, 15 arquivos; download força
  `application/octet-stream` (nada renderiza no browser); IDs com guard de path traversal.
- O painel só aceita `data:image/` como overlay — URL remota é ignorada.
- O container roda como usuário não-root e sem acesso à rede do host (bridge padrão).

**Não exponha a porta 8080 à internet.** Atenção: a porta publicada pelo Docker **passa por fora
do `ufw`**, então uma regra de firewall do Mint não bloqueia ela. Para limitar a escuta a uma
interface específica, publique com o IP dela: `-p 192.168.x.x:8080:8080`. Se a rede não for
confiável, acesse o painel por VPN ou túnel SSH.

---

## Troubleshooting

### Painel não abre de outra máquina

1. Container de pé: `docker ps --filter name=broadcast-info-display`
2. Porta publicada: a coluna `PORTS` deve mostrar `0.0.0.0:8080->8080/tcp`
3. Na própria máquina: `curl -I http://localhost:8080/control` → `200`
4. Logs: `docker logs -f broadcast-info-display` → procurar `ws.connect` ao abrir o painel

### Container sai logo depois de subir (EACCES em data/)

A pasta `data/` foi criada pelo Docker como `root`. Corrija o dono e suba de novo:

```bash
sudo chown -R "$(id -u):$(id -g)" data
docker start broadcast-info-display
```

### Telemetria vazia (sem cidade/clima)

O container precisa de saída para a internet (`api.open-meteo.com`, `ipapi.co`, `ipinfo.io`).
Se a rede bloqueia, defina `BID_LAT`/`BID_LON`/`BID_CITY` para pelo menos fixar a localização.

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
  web/
    shared/
      base.css             # Design system comum (tokens, layout, status)
      ws-client.js         # WebSocket com reconnect/backoff
      render.js            # Critical strip, memo banner, legenda, badges
      clock.js             # Relógio/cronômetro, drag
    control/               # Painel de controle (/control)
data/
  state.json               # Estado persistido (não versionado)
  files/                   # Arquivos da Mini Cloud (não versionados)
Dockerfile                 # Build multi-stage (node:22-slim), roda como usuário node
.dockerignore
docs/
  SETUP.md                 # Este arquivo
```
