# White-label — subir a estrutura para um cliente novo

A base (código) é **uma só**. Para um cliente novo você **não mexe em código**:
cria os dois deploys (web + bot), define as variáveis de ambiente da marca dele e
troca a logo. Sem essas variáveis, tudo cai no padrão **PrimeBet** — então o deploy
atual continua idêntico.

> A fonte única da marca é `web/src/lib/marca.ts` (web) e `bot/src/marca.js` (bot).
> Nenhum texto/cor de marca fica espalhado no código: tudo lê dessas configs.

---

## 1) Web (Vercel) — variáveis de ambiente

Todas são `NEXT_PUBLIC_*` (embutidas no build; cada cliente tem o próprio deploy).
Defina em **Vercel → Project → Settings → Environment Variables** e faça **Redeploy**.

| Variável | Para que serve | Exemplo |
|---|---|---|
| `NEXT_PUBLIC_MARCA_NOME` | Nome da banca (login, painel, extrato, PDFs) | `Fátima Bet` |
| `NEXT_PUBLIC_MARCA_SITE` | Domínio exibido | `www.fatimabet.com` |
| `NEXT_PUBLIC_MARCA_SITE_URL` | URL base (metadados/OpenGraph) | `https://fatimabet.com/` |
| `NEXT_PUBLIC_MARCA_EQUIPE` | Assinatura na legenda do WhatsApp | `Equipe Fátima Bet` |
| `NEXT_PUBLIC_MARCA_RODAPE` | Rodapé dos PDFs (assinatura do provedor) | `desenvolvido por www.trackertipster.site` |
| `NEXT_PUBLIC_BOT_URL` | Link "reconectar" (QR/health do bot do cliente) | `https://fatimabet-bot.up.railway.app/?t=SEGREDO` |
| `NEXT_PUBLIC_MARCA_COR` | Cor principal (hex) | `#1E5AA8` |
| `NEXT_PUBLIC_MARCA_COR_ESC` | Cor escura (botões/bordas/faixas) | `#144077` |
| `NEXT_PUBLIC_MARCA_COR_CLARO` | Cor clara (realces) | `#5A93D6` |

`NEXT_PUBLIC_MARCA_COR` é a mais importante: além de virar a variável `--marca`
(realces em login/extrato) e a faixa dos PDFs, ela também é a **base da rampa do painel**
(`--marca-base`) — o painel inteiro (fundos, bordas, textos, hover, claro/escuro) é gerado
dela via `color-mix`, então **uma cor repinta tudo**. As `_ESC` e `_CLARO` afinam só os
realces em hex. **Deixe em branco para manter o dourado PrimeBet.**

## 2) Bot (Railway) — variáveis de ambiente

| Variável | Para que serve | Exemplo |
|---|---|---|
| `MARCA_NOME` | Nome nos avisos do WhatsApp, status, QR e nome do aparelho | `Fátima Bet` |
| `MARCA_SITE` | (reservado) domínio nas mensagens | `www.fatimabet.com` |

> As demais variáveis do bot (Supabase, `BOT_HEALTH_URL`, operadores, links de grupo)
> são infra por cliente — ver `bot/DEPLOY.md`.

## 3) Assets (arquivos) — trocar pela identidade do cliente

Substitua estes arquivos (mesmos nomes) no repo/deploy web:

| Arquivo | O que é |
|---|---|
| `web/public/logo.jpg` | Logo (login, painel, extrato). Quadrada, ~256×256. |
| `web/src/app/icon.jpg` | Favicon / ícone da aba. |
| `web/src/app/opengraph-image.jpg` | Prévia ao compartilhar o link. |
| `web/public/galaxy.jpg` | Fundo do login *(opcional — o tema do login é do template)*. |

## 4) O que NÃO muda por cliente

- **Rodapé/assinatura do provedor** no login (Tracker Tipster) — é a sua marca de
  desenvolvedora, some da tela do cliente só se você quiser.
- **Tema visual do login** (fundo + composição) é do template; a troca por cliente é
  **logo + nome + cores da marca**. O painel segue as cores da marca via `--marca`.

---

### Checklist rápido (cliente novo)
1. Novo projeto Vercel (web) + novo serviço Railway (bot), a partir deste repo.
2. Setar as env da tabela 1 (web) e tabela 2 (bot).
3. Trocar `logo.jpg` (e ícone/OG se tiver).
4. Redeploy web. Parear o bot no `/`.
5. Cadastrar clientes/afiliados/plano no painel (dados individuais da banca).
