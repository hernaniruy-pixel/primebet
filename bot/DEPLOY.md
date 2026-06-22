# Deploy do bot PrimeBet no Railway (24/7)

O bot conecta no WhatsApp (via `whatsapp-web.js` + Chromium), ouve as reações
nos bilhetes e grava na fila do painel. Ele precisa rodar **sempre ligado** e
**guardar a sessão do WhatsApp num disco persistente** — senão pede QR a cada
deploy.

Já está tudo preparado: `Dockerfile`, `railway.json`, página web do QR e
`/health`. Só falta apontar no Railway. Leva ~10 min.

> ⚠️ Para 24/7 sem dormir, use um plano **pago** do Railway (o Trial/Hobby tem
> limite de horas e pode pausar). O bot usa Chromium, então reserve **pelo menos
> ~1 GB de RAM** no serviço.

---

## 1) Criar o serviço a partir do GitHub

1. Acesse [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → escolha `hernaniruy-pixel/primebet`.
2. Abra o serviço criado → **Settings**:
   - **Root Directory**: `bot`  ← (essencial: o bot fica nessa subpasta)
   - O Railway vai detectar o `Dockerfile` automaticamente (o `railway.json` já força isso).

## 2) Variáveis de ambiente

Em **Variables**, adicione (valores reais, veja `bot/.env.example`):

| Variável | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | sua chave `sk-ant-...` (com créditos) |
| `MODELO_TRANSCRICAO` | `claude-haiku-4-5` |
| `SUPABASE_URL` | `https://rpmswwkpbqzvtwqeuwso.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | a service_role do Supabase (secreta) |
| `QR_TOKEN` | invente um token (ex.: `primebet123`) — protege a página do QR |
| `OPERADORES` | (opcional) números que podem reagir, ex.: `5511999999999,5511888888888` |

> Não precisa definir `PORT` — o Railway injeta sozinho, e a página do QR usa ele.

## 3) Disco persistente (a parte que evita re-escanear o QR)

1. No serviço → **Settings → Volumes** (ou **+ Create → Volume**).
2. Crie um volume e monte em: **`/app/.wwebjs_auth`**
   - É onde a sessão do WhatsApp fica salva. Com isso, redeploys **não** pedem QR de novo.
   - Tamanho: 1 GB já sobra.

## 4) Domínio público (pra ver o QR)

1. **Settings → Networking → Generate Domain** (porta detectada automaticamente; é a do `PORT`).
2. Guarde a URL gerada, ex.: `https://primebet-bot-production.up.railway.app`.

## 5) Parear o WhatsApp (escanear o QR)

1. Abra a URL com o token: `https://SUA-URL/?t=SEU_QR_TOKEN`
2. Vai aparecer o **QR**. No celular do bot: **WhatsApp → Aparelhos conectados → Conectar um aparelho** → escaneie.
3. Quando aparecer **“✅ Bot conectado”**, está pronto. O código renova sozinho enquanto espera.

## 6) Validar

- **Health**: `https://SUA-URL/health` deve responder `ok`.
- **Teste de aviso**: `https://SUA-URL/teste?t=SEU_QR_TOKEN` dispara uma mensagem no grupo **AVISOS/ALERTA** (confirma que o canal funciona).
- Reaja num bilhete de um grupo de cliente com ⚪/⚫/🔵/⚠️ e veja a aposta cair na fila do painel.

---

## Manutenção / dúvidas comuns

- **Redeploy não pede QR?** Correto — a sessão está no volume. Só pede QR de novo se o volume for apagado ou o WhatsApp deslogar o aparelho.
- **“profile appears to be in use”** no boot: o `index.js` já limpa os locks do Chromium (`Singleton*`) automaticamente a cada start.
- **Caiu / desconectou?** O `restartPolicyType: ALWAYS` reinicia sozinho. O bot também avisa no grupo AVISOS (online/desconectou/heartbeat 12h).
- **Trocar precisão da transcrição:** mude `MODELO_TRANSCRICAO` para `claude-sonnet-4-6` (mais caro/preciso) e redeploy.
- **Logs:** aba **Deployments → View Logs** no Railway.

## Atalho via CLI (opcional)

```bash
npm i -g @railway/cli
railway login
railway link        # escolha o projeto
railway up           # build & deploy a partir de bot/ (rode dentro da pasta bot)
```
> Mesmo pela CLI, o **volume** em `/app/.wwebjs_auth` e as **variáveis** se
> configuram no dashboard.
