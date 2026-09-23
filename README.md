# Broadcast Info Display

Servidor local de informações operacionais para produção de broadcast. O painel de controle permite editar os dados; a tela Output mostra uma versão somente leitura e acompanha as mudanças em tempo real.

Esta branch, `feat/docker-headless-server`, roda o servidor em Docker num PC Linux. A saída `/output` funciona em qualquer navegador da rede e também pode abrir automaticamente em tela cheia num segundo monitor Linux. O branch `main` continua sendo a variante appliance Raspberry Pi; mantenha os dois fluxos de implantação separados.

## Telas e recursos

- **Controle:** `/control`, edição da tabela de câmeras, colunas, status, imagem overlay, memo, relógio e arquivos.
- **Output:** `/output`, tabela somente leitura, status, telemetria, memo, relógio e overlay sincronizados por WebSocket.
- **Mini Cloud:** upload, download e exclusão via HTTP; até 15 arquivos, 75 MB por arquivo e 250 MB no total.
- **Telemetria:** localização por IP, clima e previsão pelo Open-Meteo e estado de conectividade.

## Início rápido (Linux Mint/Ubuntu)

Clone a branch e entre no projeto:

```bash
git clone --branch feat/docker-headless-server https://github.com/otisrib64/broadcast-info-display.git
cd broadcast-info-display
```

Se o Docker Engine e o Compose ainda não estiverem instalados:

```bash
./scripts/instalar-docker.sh
```

Saia e entre novamente na sessão após a instalação para atualizar o grupo `docker`. Em seguida:

```bash
docker run --rm hello-world
./scripts/iniciar.sh
```

O Compose constrói a imagem, publica a porta 8080, monta `./data` para persistência e aplica `restart: unless-stopped`. O Docker está configurado para iniciar no boot pelo instalador.

## Acesso

No PC que executa o servidor:

- Controle: [http://localhost:8080/control](http://localhost:8080/control)
- Output: [http://localhost:8080/output](http://localhost:8080/output)

Em outro computador na mesma rede, troque `localhost` pelo IPv4 do PC servidor, por exemplo `http://192.168.10.63:8080/control`. Descubra o endereço com `ip -brief -4 address`; escolha o IP da interface física conectada à rede, não os endereços das bridges Docker. Use o IP pertencente à mesma sub-rede do outro computador.

O cliente WebSocket usa automaticamente o mesmo host e a mesma porta da página. Não é preciso publicar outra porta.

## Segundo monitor e autoinicialização gráfica

No Linux Mint com Cinnamon/X11 e Firefox, o launcher abre `/output` num perfil separado, posiciona a janela no monitor configurado (padrão `HDMI-2`) e envia F11. O desktop control continua no perfil normal do Firefox.

```bash
./scripts/configurar-output-autostart.sh enable
```

Para testar sem reiniciar, execute:

```bash
~/.local/bin/start-broadcast-output.sh
```

O launcher depende de Firefox, `curl`, `xrandr`, `wmctrl`, `xprop`, Python 3, `systemd-run --user`, X11 e XTest (`libX11.so.6` e `libXtst.so.6`). Em instalações Mint onde faltem ferramentas, instale `x11-xserver-utils wmctrl libxtst6`.

Reverter somente o autostart gráfico:

```bash
./scripts/configurar-output-autostart.sh disable
```

Isso para o navegador dedicado e remove o launcher e o atalho de autostart. O servidor Docker e os dados continuam intactos.

## Operação e reversão

```bash
docker compose ps                 # estado e porta
docker compose logs -f            # logs
docker compose restart            # reiniciar o serviço
docker compose down               # parar/remover container e rede; preservar data/
docker compose up -d --build      # construir/atualizar e iniciar
docker compose down --rmi local   # também remover a imagem local
```

`./scripts/parar.sh` equivale a `docker compose down`. A política de reinício automático aplica-se ao reboot enquanto o container não tiver sido parado explicitamente com `docker compose down`.

## Persistência

- `data/state.json`: tabela, colunas, memo, imagem e relógio.
- `data/files/`: conteúdo e índice da Mini Cloud.

O bind mount mantém esses dados fora da imagem, e `/data/` é ignorado pelo Git e pelo contexto Docker. Para cópia de segurança, pare ou mantenha o serviço ativo e copie o diretório `data/` para armazenamento seguro. Remover esse diretório apaga o estado e arquivos do usuário.

## Configuração

O Compose padrão preserva a porta `8080`, executa como usuário não-root `node`, monta `./data:/app/data` e define `NODE_ENV=production`. Para mudar a porta do host, edite o lado esquerdo do mapeamento em `compose.yaml` (por exemplo `9000:8080`) e recrie com `docker compose up -d`.

As variáveis opcionais `BID_LAT`, `BID_LON` e `BID_CITY` fixam a localização da telemetria quando as três são informadas. Consulte [docs/SETUP.md](docs/SETUP.md) para instalação, rede, segurança e diagnóstico.

## Segurança

O servidor não tem autenticação: qualquer pessoa com acesso à porta pode editar a tabela e os arquivos. Use somente numa LAN confiável; não exponha a porta 8080 à internet. A publicação padrão escuta em todas as interfaces. A telemetria requer saída para a internet.

## Desenvolvimento

```bash
npm ci
npm run build
npm test
npm start
```

Versões indicadas: Node.js 22 e npm. Para uma instalação sem Node no host, o build de produção ocorre dentro do Docker.
