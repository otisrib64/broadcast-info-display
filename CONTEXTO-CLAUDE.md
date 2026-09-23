# Contexto de continuidade do Broadcast Info Display

## Repositório

- Branch: `feat/docker-headless-server`
- Remote: `https://github.com/otisrib64/broadcast-info-display.git`
- Projeto: servidor Node.js/TypeScript, painel editável `/control`, tela somente leitura `/output`, WebSocket, telemetria e Mini Cloud.
- A branch mantém o servidor headless; o Firefox e o segundo monitor são configurados no host Linux, fora do container.

## Ambiente instalado

Linux Mint 22.3, Ubuntu base Noble, x86-64. Docker Engine e Compose foram instalados por `scripts/instalar-docker.sh`; o serviço Docker inicia no boot e o usuário pertence ao grupo `docker`.

O projeto é iniciado com `./scripts/iniciar.sh`. Compose mantém um container `broadcast-info-display`, porta 8080, usuário de container `node`, bind mount `./data:/app/data`, `NODE_ENV=production` e política `unless-stopped`.

## Endereços já observados

- Na sessão verificada após reboot, a interface tinha `192.168.10.63/24` e `192.168.9.42/24`.
- Use `hostname -I` para descobrir os IPs atuais; endereços DHCP podem mudar.
- Controle remoto usa `http://IP-DO-SERVIDOR:8080/control`; output usa `http://IP-DO-SERVIDOR:8080/output`.
- O WebSocket segue automaticamente o host e a porta carregados na página.

## Output no monitor

`scripts/configurar-output-autostart.sh enable` instala o launcher host-side e o autostart do Cinnamon. O launcher usa Firefox em perfil dedicado e unidade transitória do usuário, mira `HDMI-2` por padrão e envia F11 por XTest. Dependências: Firefox, curl, xrandr, wmctrl, xprop, Python 3, libX11, libXtst e systemd user session. Para desativar somente o autostart e navegador dedicado: `scripts/configurar-output-autostart.sh disable`.

Foi validado na máquina do usuário: Output em `HDMI-2`, geometria `1920x1080+1920+0`, fullscreen ativo. O launcher usa coordenadas reais do host e não se deve voltar ao `--kiosk-monitor`, que levou a janela para fora da área visível nesta instalação.

## Dados e segurança

`data/state.json` contém a configuração operacional corrente e `data/files/` contém arquivos da Mini Cloud. O diretório inteiro está no .gitignore e no .dockerignore. Nunca adicionar os arquivos de `data/` ao commit ou à imagem.

O serviço não tem autenticação. Deve permanecer numa LAN confiável e não ser exposto diretamente à internet. A publicação Compose escuta em todas as interfaces.

## Operação

- Subir/buildar: `./scripts/iniciar.sh`
- Parar sem perder dados: `./scripts/parar.sh`
- Logs: `docker compose logs -f`
- Estado: `docker compose ps`
- Atualizar: `git pull --ff-only && docker compose up -d --build --remove-orphans`

## Validação realizada antes do push

As rotas `/control` e `/output` responderam HTTP 200. Após reboot, o container iniciou sozinho com `unless-stopped`, recuperou 12 linhas do estado persistido e respondeu nos dois IPs locais. A tela output foi confirmada em fullscreen no HDMI-2.
