# Broadcast Info Display — resumo para continuidade

**Atualizado em:** 25/09/2026

**Branch:** `feat/docker-headless-server`

**Repositório:** `otisrib64/broadcast-info-display`

Este documento registra como o projeto foi preparado neste computador, o que foi alterado, como validar/reverter e o que falta para publicar a branch. Não contém senhas nem chaves privadas.

## Estado atual

- Projeto clonado em `~/Documentos/broadcast-info-display/file/github/broadcast-info-display`.
- Docker Engine e Docker Compose v2 instalados. O serviço Docker está habilitado no boot.
- Container `broadcast-info-display` usa a imagem local, publica `8080:8080` e está configurado com `restart: unless-stopped`.
- Endereços neste computador: Controle `http://localhost:8080/control`; Output `http://localhost:8080/output`. Outros computadores da rede usam o IP local deste PC e a mesma porta `8080`.
- O diretório bind-mounted `data/` fica fora da imagem e é ignorado pelo Git. Na última verificação, `data/state.json` continha 12 linhas. A tabela aceita até 20.
- O Output usa Chromium dedicado em perfil próprio, com serviço systemd de usuário, guard de monitor/tela cheia, F11 e reinício se a janela fechar. Monitor configurado: `HDMI-2`.
- No último teste, o prompt da imagem era do chaveiro de sessão. O guard do Chromium recebeu `--password-store=basic` para não depender do chaveiro. **Não guardar senhas nesse perfil Chromium**: o armazenamento básico não as criptografa. O Firefox usado no Controle e o chaveiro geral do Cinnamon não tiveram essa opção alterada.
- LightDM já fazia login automático. O bloqueio do protetor de tela do Cinnamon foi desligado para evitar a solicitação de senha nessa tela; a senha da conta continua válida para operações administrativas.

## Alterações de software preparadas

1. Autostart do Output com Chromium isolado do navegador usado no Controle; unidade de usuário `broadcast-info-display-output.service` e script guard que posiciona a janela no `HDMI-2`, aplica F11, restaura tela cheia e reabre a janela quando necessário.
2. Tabela com limite único de 20 linhas, células de 42 px e texto maior. A faixa de contagem foi removida para liberar área. O logo Otis do rodapé do Output foi restaurado.
3. Proteção contra um painel desatualizado apagar linhas: o Controle espera receber o estado persistido antes de enviar edições; o servidor rejeita atualizações completas com menos linhas. O botão de exclusão usa a mensagem explícita `removeRow`.
4. Snapshots locais antes de reduções, checkpoints periódicos e ferramenta de restauração. O script de restauração salva o estado atual antes de aplicar uma cópia.
5. README e guia de instalação atualizados para Chromium, acesso pela rede, autostart, persistência, backup e reversão.

## Dados e recuperação

- Estado principal: `data/state.json`.
- Arquivos Mini Cloud: `data/files/`.
- Histórico: `data/history/`.
- Listar cópias: `./scripts/restaurar-state-backup.sh --list`.
- Restaurar uma cópia listada: `./scripts/restaurar-state-backup.sh <nome-do-arquivo>`.
- O `data/` não deve entrar no GitHub. O pacote de backup do pendrive mantém uma cópia separada e privada destes dados.

Para atualizar sem apagar dados: `docker compose up -d --build --remove-orphans`. Para parar o aplicativo e manter dados: `docker compose down`. **Não apagar `data/`** se quiser manter a tabela e os arquivos.

Para desativar somente a abertura gráfica automática: `./scripts/configurar-output-autostart.sh disable`. Isso mantém Docker e `data/`.

## Validação executada

- Build TypeScript via estágio `build` do Docker passou.
- Testes Jest: 62/62 passaram.
- `bash -n scripts/*.sh`, `git diff --check` e `docker compose config -q` passaram.
- `/control`, `/output` e recursos estáticos retornaram HTTP 200 depois das atualizações.
- Container iniciou e carregou as linhas persistidas; Output abriu no HDMI-2 em tela cheia.
- A correção do chaveiro foi instalada no guard local e testada reiniciando o serviço; a janela do Output ficou ativa sem a janela de autenticação observada na captura.

## GitHub e pendências

- Branch de trabalho: `feat/docker-headless-server`.
- Há commits locais à frente de `origin/feat/docker-headless-server`. A última tentativa de push não concluiu: HTTPS não tinha credenciais disponíveis e o agente SSH recusou assinar a chave. Os commits continuam locais; autenticar a conta GitHub é o passo restante para enviar a branch.
- A chave privada SSH nunca deve ser copiada para o pendrive. O bundle Git e o código versionado são suficientes para continuar o trabalho e tentar o push em uma sessão autenticada.
- Fazer um último reboot de validação do chaveiro/Output e conferir as 12 linhas atuais antes de qualquer operação de restauração.

## Pendrive

O dispositivo detectado é um Kingston DataTraveler de 57,7 GiB, com rótulo `LINUX MINT` e arquivos de mídia de instalação Linux Mint. Ele tem espaço livre, mas foi montado somente para leitura nesta sessão. A cópia para o USB só pode ser considerada concluída depois de confirmar que o destino foi gravado e relido sem erro. O pacote deve conter:

- `broadcast-info-display.bundle`: commits/refs Git locais, pronto para clonar e trocar o remote para o GitHub;
- arquivo compactado do código versionado, sem `data/`;
- `backup-dados-locais/data/`, em pasta separada, para a planilha e arquivos locais;
- este resumo.
