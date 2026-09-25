# Decisões

## 2026-10-31 — Separar a variante Docker em repositório próprio
- **Pergunta/contexto:** a branch `feat/docker-headless-server` já tinha divergido da `main` (Raspberry Pi) a ponto de ser outro produto.
- **Escolhido:** a variante Docker foi para o repositório privado `otisrib64/broadcast-info-display-docker`, com o histórico; este repositório continua sendo a versão Raspberry Pi e a branch foi apagada daqui.
- **Alternativas descartadas:** manter como branch longa; monorepo com núcleo comum e duas pastas de deploy; Fork do GitHub (não permite fork do próprio repositório na mesma conta).
- **Justificativa:** implantações diferentes; correções em comum passam a ser trazidas manualmente quando valer a pena.

## 2026-10-31 — Trazer as correções de segurança da variante Docker
- **Pergunta/contexto:** o commit `09a4df5` (bloquear alterações de outra origem e endurecer exclusões da Mini Cloud) foi feito na variante Docker, mas o mesmo risco existe no Pi, inclusive na API de rede.
- **Escolhido:** cherry-pick na branch `fix/seguranca-da-variante-docker`; a checagem de origem fica antes também da `/api/network`. Merge na `main` só depois de testar no Raspberry Pi.
- **Alternativas descartadas:** trazer também a identidade visual e o histórico de estado (misturados com scripts do Docker/Firefox no mesmo commit; ficam para outra rodada, se quiser).
- **Justificativa:** correção de segurança pequena e isolada, com testes; o resto muda a aparência e exige validação no aparelho.
