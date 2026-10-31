# Decisões

## 2026-10-31 — Separar a variante Docker em repositório próprio
- **Pergunta/contexto:** a branch `feat/docker-headless-server` já tinha divergido da `main` (Raspberry Pi) a ponto de ser outro produto.
- **Escolhido:** a variante Docker foi para o repositório privado `otisrib64/broadcast-info-display-docker`, com o histórico; este repositório continua sendo a versão Raspberry Pi e a branch foi apagada daqui.
- **Alternativas descartadas:** manter como branch longa; monorepo com núcleo comum e duas pastas de deploy; Fork do GitHub (não permite fork do próprio repositório na mesma conta).
- **Justificativa:** implantações diferentes; correções em comum passam a ser trazidas manualmente quando valer a pena.
