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

### Segredos server-only (NÃO usar prefixo `NEXT_PUBLIC_` — marcar como *Sensitive*)

| Variável | Para que serve | Observação |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Acesso ao banco do cliente (server) | infra base |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Middleware/Supabase Auth (login master) | infra base |
| `ADMIN_EMAIL` | E-mail do usuário **master** no Supabase Auth (login `admin`) | crie o usuário no Auth do cliente com esse e-mail + senha |
| `PRIMEBET_SESSION_SECRET` | Segredo das sessões (equipe/cliente, HMAC) | **valor aleatório longo por cliente**; sem ele cai no service-role key |

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

## 5) Banco de dados — migrações (SQL Editor do Supabase do cliente)

Rode **em ordem de número**, uma vez, no SQL Editor do projeto do cliente. Todas são
idempotentes (`if not exists` / `drop ... if exists`). Os arquivos estão em
`supabase/migrations/`. As essenciais do modelo atual:

| # | O que cria |
|---|---|
| 001–020 | Base (apostas, clientes, conferência, contas, plano/cota, etc.) |
| 021 | Equipe (cargos) + auditoria (histórico do bilhete) |
| 022 | Fila de envio de PDF pelo bot |
| 023 | Fuso Brasil no filtro de data (semana certa) |
| 025 | `imagens_recebidas.aposta_excluida` — fim do `#null`; aposta excluída rotula a imagem, **nada some** |
| 026 | Papel `admin` na equipe (multi-admin: master cria admins dos donos) |
| 027 | `login_rate` — trava anti-força-bruta no login |
| 028 | `acertos` — controle de pagamentos/recebimentos dos clientes |
| 029 | `envios_pdf` — tentativas de envio de PDF pelo bot |
| 030 | `equipe.permissoes` — permissões por operador (ex.: Contas) |
| 031 | `contas_movimentos.ator_*` — quem lançou cada movimento de conta |
| 032 | `login_2fa` + `login_eventos` — 2FA (TOTP) e auditoria de acessos |

> Depois das migrações, crie o usuário **master** no Supabase Auth do cliente (e-mail =
> `ADMIN_EMAIL`, com uma senha). Ele loga como `admin` e, no painel (👥 Usuários), cria os
> logins **Admin** dos donos do cliente.
>
> **2FA obrigatório do master:** no primeiro login o master é levado a `/admin/seguranca`
> para cadastrar a verificação em duas etapas (escaneia um QR num app autenticador e salva
> os códigos de recuperação) — só depois disso o painel libera. Os **Admins** (donos) podem
> ligar o 2FA se quiserem, na mesma tela (🔐 Segurança), que também mostra a **auditoria de
> acessos** (quem entrou, quando, IP, dispositivo).

## 6) Regras do modelo (herdadas, não reimplementar)

- **Nada é apagado automaticamente:** o sistema nunca exclui bilhete/dado por conta própria
  — só exclusão manual, auditada. Faxina automática só de miniatura de conferência >2 semanas.
- **Data do bilhete = hora do envio no grupo** (nunca a data impressa no print nem a da reação).
- **Senhas em scrypt** (equipe e cliente); todo papel troca a própria senha; login com rate-limit.
- **Acertos** ficam POR CIMA do fechamento, sem tocar em bilhete.

---

### Checklist rápido (cliente novo)
1. Novo projeto Vercel (web) + novo serviço Railway (bot), a partir deste repo.
2. Rodar as **migrações** (seção 5) no Supabase do cliente.
3. Setar as env: tabela 1 + segredos server-only (web), tabela 2 (bot).
4. Criar o usuário **master** no Supabase Auth (e-mail = `ADMIN_EMAIL`).
5. Trocar `logo.jpg` (e ícone/OG se tiver).
6. Redeploy web. Parear o bot no `/`.
7. Logar como master → criar os **Admins** dos donos (👥 Usuários).
8. Cadastrar clientes/afiliados/plano no painel (dados individuais da banca).
