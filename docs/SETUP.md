# Instalação e operação

Este guia cobre o servidor Docker, o acesso por LAN e a abertura opcional da tela Output em um segundo monitor Linux. O container só fornece HTTP/WebSocket; não controla o monitor nem inicia o navegador. Essa parte roda na sessão gráfica do computador.

## Requisitos

- Linux Mint baseado em Ubuntu ou Ubuntu x86-64.
- Rede local entre o servidor e os computadores clientes.
- Acesso administrativo para instalar o Docker.
- Para autostart do Output: Cinnamon/X11, Chromium, segundo monitor ativo e ferramentas X11.

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

## Densidade e quantidade de linhas

Controle e Output usam uma única densidade de tabela, dimensionada para até 20 linhas em uma tela 1080p, com fonte maior e células de 42 px. O Output preserva o logo completo no rodapé; a faixa de contagem acima da tabela foi removida para abrir espaço vertical.

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

O Output é uma página web somente leitura em `/output`; não é uma tela ligada ao container. No Mint/Cinnamon, Chromium abre a página em app-window sem abas nem barra de endereço, com perfil separado do Firefox usado no controle. Esse perfil dedicado usa o armazenamento básico de senhas do Chromium para não depender do chaveiro da sessão; não salve credenciais nesse perfil. Um serviço systemd de usuário posiciona a janela no HDMI configurado e envia F11 via XTest. Um guard verifica a janela a cada dois segundos, restaura tela cheia e o monitor HDMI-2 se ela for minimizada ou movida, e reabre o Output se a janela fechar. O serviço reinicia junto com a sessão do usuário.

Instale os utilitários do host, se faltarem:

```bash
sudo apt-get install -y chromium x11-xserver-utils wmctrl libxtst6
```

Ative o autostart do usuário:

```bash
./scripts/configurar-output-autostart.sh enable
~/.local/bin/start-broadcast-output.sh
```

Por padrão, o monitor alvo é `HDMI-2`. Para escolher outro conector, defina `BID_OUTPUT_MONITOR` no ambiente da sessão gráfica antes de ativar o serviço. Use um nome mostrado por `xrandr --query`.

O atalho `~/.local/bin/start-broadcast-output.sh` inicia o serviço existente sem criar outra janela ou perfil.

Desative somente essa parte:

```bash
./scripts/configurar-output-autostart.sh disable
```

Esse comando desativa `broadcast-info-display-output.service` e remove o guard, os arquivos de autostart e o launcher. Não apaga perfis do navegador, não para Docker e não apaga `data/`.

## Persistência, atualização e backup

`data/state.json` guarda a tabela, colunas, memo, overlay e relógio. `data/files/` guarda os arquivos da Mini Cloud. O bind mount em `./data` mantém tudo quando o container ou a imagem são reconstruídos. Todo o diretório `data/` é excluído do Git e do build Docker; a planilha operacional não está no GitHub.

O servidor cria snapshots locais em `data/history/` antes de qualquer redução no número de linhas e checkpoints a cada cinco minutos enquanto há edições. Mantém até 288 arquivos e limita o histórico a 100 MB, removendo os mais antigos quando necessário.

Liste as cópias disponíveis:

```bash
./scripts/restaurar-state-backup.sh --list
```

Para restaurar, informe o nome de uma cópia mostrado pela lista. O script para o container, guarda o estado atual como `state-before-restore-...json`, restaura a cópia selecionada e inicia o container novamente:

```bash
./scripts/restaurar-state-backup.sh state-2026-09-25T12-00-00-000Z.json
```

Antes de uma atualização importante, copie `data/` para outro disco ou pendrive também. O histórico no próprio computador protege contra sobrescritas acidentais, mas não substitui uma cópia externa.

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

Confirme que o servidor responde em `/output`, Chromium está instalado, o monitor está conectado e o nome do conector coincide com `xrandr --query`. Veja o serviço com `systemctl --user status broadcast-info-display-output.service` e os logs com `journalctl --user -u broadcast-info-display-output.service -f`. A unidade de usuário funciona depois do login Cinnamon.

### Telemetria sem cidade ou clima

Confirme que o container tem saída para internet. Se a política de rede bloquear a geolocalização, fixe `BID_LAT`, `BID_LON` e `BID_CITY`.
