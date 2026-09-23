# Instalação e operação

Este guia cobre o servidor Docker, o acesso por LAN e a abertura opcional da tela Output em um segundo monitor Linux. O container só fornece HTTP/WebSocket; não controla o monitor nem inicia o navegador. Essa parte roda na sessão gráfica do computador.

## Requisitos

- Linux Mint baseado em Ubuntu ou Ubuntu x86-64.
- Rede local entre o servidor e os computadores clientes.
- Acesso administrativo para instalar o Docker.
- Para autostart do Output: Cinnamon/X11, Firefox, segundo monitor ativo e ferramentas X11.

LMDE usa base Debian; consulte a documentação de instalação Docker apropriada para Debian em vez de assumir codinome Ubuntu.

## Instalar e reverter o Docker

No checkout da branch Docker:

```bash
./scripts/instalar-docker.sh
```

O script usa os pacotes do repositório Ubuntu habilitado no Mint: `docker.io` e `docker-compose-v2`. Ele atualiza os índices, instala os pacotes, habilita o serviço `docker` no boot e adiciona o usuário atual ao grupo `docker`. O último passo só vale após sair e entrar na sessão.

Valide:

```bash
docker run --rm hello-world
docker compose version
systemctl is-enabled docker
```

Para reverter o funcionamento do projeto sem remover dados:

```bash
docker compose down
```

Para parar também o daemon Docker até ser iniciado manualmente:

```bash
sudo systemctl disable --now docker
```

Não é necessário desinstalar os pacotes Docker para reverter este projeto. Outros containers e imagens existentes pertencem ao host e não devem ser removidos como parte da reversão.

## Iniciar e validar

```bash
./scripts/iniciar.sh
docker compose ps
curl -I http://localhost:8080/control
curl -I http://localhost:8080/output
```

As duas rotas devem retornar `HTTP 200`. O Compose usa o nome fixo `broadcast-info-display`, constrói a imagem local, publica `8080:8080`, monta `./data:/app/data`, executa como `node` e aplica `restart: unless-stopped`. `--remove-orphans` remove containers órfãos do mesmo projeto Compose ao subir.

O serviço Docker inicia no boot do sistema. O container reinicia automaticamente após boot ou falha, exceto quando foi parado intencionalmente com `docker compose stop/down`.

## Acesso local e pela rede

No host:

- Controle: `http://localhost:8080/control`
- Output: `http://localhost:8080/output`

Em outro computador, use o endereço IPv4 do host Docker, nunca `localhost`:

```bash
ip -brief -4 address
```

Escolha o IPv4 da interface física conectada à LAN, ignorando `docker0` e `br-...`. Por exemplo, se o IP na rede compartilhada for `192.168.10.63`:

- `http://192.168.10.63:8080/control`
- `http://192.168.10.63:8080/output`

Todos os navegadores conectam o WebSocket usando o host da URL, então a sincronização segue o mesmo endereço e porta. Se o IP responder no próprio host mas não num cliente, confirme que ambos estão na mesma sub-rede/VLAN, que o Wi-Fi não usa isolamento de clientes e que o roteador permite comunicação entre eles.

O Compose publica em todas as interfaces (`0.0.0.0:8080` e IPv6). Use uma rede confiável. O servidor não tem autenticação, e publicação de portas Docker pode não obedecer às regras habituais do UFW. Não exponha a porta diretamente à internet.

## Output em segundo monitor

O Output é uma página web somente leitura em `/output`; não é uma tela ligada ao container. No Mint/Cinnamon, o script do host abre um Firefox dedicado, espera o servidor ficar disponível, posiciona a janela no HDMI configurado e envia F11 via XTest. O perfil separado mantém configurações e janela do Output independentes do Firefox usado para o controle.

Instale os utilitários do host, se faltarem:

```bash
sudo apt-get install -y x11-xserver-utils wmctrl libxtst6
```

Ative o autostart do usuário:

```bash
./scripts/configurar-output-autostart.sh enable
~/.local/bin/start-broadcast-output.sh
```

Por padrão, o monitor alvo é `HDMI-2`. Para escolher outro conector nesta máquina, execute com o nome mostrado por `xrandr --query`:

```bash
BID_OUTPUT_MONITOR=HDMI-1 ~/.local/bin/start-broadcast-output.sh
```

O valor pode ser colocado na variável `BID_OUTPUT_MONITOR` dentro do script instalado se o autostart precisar de outro conector.

Desative somente essa parte:

```bash
./scripts/configurar-output-autostart.sh disable
```

Esse comando para `broadcast-info-display-browser.service` do usuário e remove os arquivos de autostart e launcher instalados pelo script. Não para Docker nem apaga `data/`.

## Persistência, atualização e backup

`data/state.json` guarda a tabela, colunas, memo, overlay e relógio. `data/files/` guarda os arquivos da Mini Cloud. O bind mount em `./data` mantém tudo quando o container ou a imagem são reconstruídos. Todo o diretório `data/` é excluído do Git e do build Docker.

Atualize e recrie com:

```bash
git pull --ff-only
docker compose up -d --build --remove-orphans
```

Faça cópia de segurança de `data/` em outro local. Para restaurar, pare o serviço, restaure a pasta e inicie novamente. Não inclua `data/` em commits.

## Comandos úteis

```bash
docker compose ps
docker compose logs -f
docker compose restart
docker compose stop
docker compose start
docker compose down
docker compose down --rmi local
```

`down` remove container e rede do projeto, mas mantém a pasta bind mount `data/`. `down --rmi local` também remove a imagem criada localmente. Para voltar, execute `./scripts/iniciar.sh`.

## Localização da telemetria

As variáveis `BID_LAT`, `BID_LON` e `BID_CITY` precisam ser informadas juntas para substituir a localização detectada pelo IP. Configure-as em `compose.yaml` sob `environment`, depois recrie o container. A consulta de clima usa Open-Meteo; a detecção da localização requer saída de rede.

## Diagnóstico

### Serviço não responde

```bash
docker compose ps
docker compose logs --tail=100
curl -I http://localhost:8080/control
```

Confirme que a coluna PORTS contém `0.0.0.0:8080->8080/tcp`. Se a porta estiver ocupada, altere o lado esquerdo do mapeamento, por exemplo `9000:8080`.

### Outro computador não conecta

Use o IPv4 do host em vez de `localhost`; confirme sub-rede, VLAN e isolamento de clientes no Wi-Fi. Teste primeiro a página e depois veja os logs: uma conexão bem-sucedida aparece como `ws.connect`.

### Erro de escrita em data

O container usa UID 1000 (usuário `node`). Em hosts onde o usuário local não seja UID 1000, ajuste a propriedade da pasta ao UID usado pelo container ou configure o serviço para usar o UID/GID local:

```bash
sudo chown -R 1000:1000 data
```

### Output não abre no segundo monitor

Confirme que o servidor responde em `/output`, o monitor está conectado e o nome do conector coincide com `xrandr --query`. Verifique a execução do Firefox em `journalctl --user -u broadcast-info-display-browser.service`. A unidade de usuário e o autostart gráfico só existem depois do login Cinnamon.

### Telemetria sem cidade ou clima

Confirme que o container tem saída para internet. Se a política de rede bloquear a geolocalização, fixe `BID_LAT`, `BID_LON` e `BID_CITY`.
