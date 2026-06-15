# PrimeBet — Integração WhatsApp → Transcrição de Bilhetes

Backend que recebe a **reação em uma imagem** dentro de um grupo de cliente, **transcreve o bilhete**
(visão computacional) e grava a aposta como **EM ABERTO** no formato que o painel PrimeBet consome.

## Como funciona o fluxo

```
Grupo do cliente (com o número da banca)
        │  alguém reage à imagem do bilhete
        ▼
  ⚪  →  transcreve TUDO (aposta + valor + odd)
  ⚫  →  transcreve, mas a ODD fica em aberto (houve alteração)
  🔵  →  transcreve, mas o VALOR fica em aberto
  ⚠️  →  transcreve, mas ODD e VALOR ficam em aberto
        │
        ▼
  WhatsApp (whatsapp-web.js) baixa a imagem
        ▼
  Transcrição (Claude visão) → { jogo, odd, valor, casa }
        ▼
  Regra do emoji zera os campos "em aberto" (null)
        ▼
  Grava o bilhete (data/bilhetes.json) e expõe em /api/bilhetes
        ▼
  Painel PrimeBet recebe via bridge.js → aposta EM ABERTO
  (odd/valor zerados = linha com CONTORNO VERMELHO p/ preencher)
```

## Requisitos

- Node.js 18 ou superior
- Uma chave da API Anthropic (https://console.anthropic.com)
- Um número de WhatsApp **dedicado** (ver aviso no fim)

## Instalação

```bash
npm install
cp .env.example .env      # no Windows: copy .env.example .env
```

Edite o `.env` e preencha `ANTHROPIC_API_KEY`.

## 1) Testar SÓ a transcrição (sem WhatsApp) — comece por aqui

Tenha uma imagem de um bilhete (print) à mão e rode:

```bash
npm run transcrever -- ./bilhete.jpg ⚪
npm run transcrever -- ./bilhete.jpg ⚫     # odd em aberto
npm run transcrever -- ./bilhete.jpg 🔵     # valor em aberto
npm run transcrever -- ./bilhete.jpg ⚠️     # odd e valor em aberto
```

Ele mostra a transcrição bruta e o resultado depois da regra do emoji.
É aqui que você valida a **qualidade da leitura** antes de plugar o WhatsApp.
Para melhorar a precisão, troque o modelo no `.env` (`MODELO_TRANSCRICAO=claude-opus-4-8`).

## 2) Ligar o WhatsApp

```bash
npm start
```

- Escaneie o QR code com o WhatsApp **do número da banca** (Aparelhos conectados → Conectar um aparelho).
- Reaja a uma imagem em um grupo. No console vai aparecer o **ID do grupo** (`...@g.us`).
- Cole esse ID em `src/config.js` → `GRUPOS`, associando ao **nome do cliente** do painel:

```js
const GRUPOS = {
  '120363000000000000@g.us': { cliente: 'CRISTIAN' },
};
```

- Reinicie (`npm start`) e reaja aos bilhetes com ⚪ / ⚫ / 🔵 / ⚠️.
- Os resultados ficam em `data/bilhetes.json` e em `GET http://localhost:3000/api/bilhetes`.

## 3) Conectar ao painel (já vem pronto)

O painel já está em `public/index.html` com o `bridge.js` ligado. Com o servidor no ar
(`npm start`), abra **http://localhost:3000** — os bilhetes transcritos aparecem
automaticamente na fila do dashboard (polling a cada 5s).

> Para usar a versão mais recente do seu painel, basta substituir `public/index.html`
> e garantir que ele tenha `<script src="bridge.js"></script>` antes de `</body>`.

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/bilhetes` | Lista bilhetes (use `?desde=ISO` para só os novos) |
| POST | `/api/bilhetes` | Ingestão manual: `{ jogo, odd, valor, casa, cliente, emoji }` |
| GET | `/api/regras` | Lista as regras de emoji |
| GET | `/healthz` | Status |

## Estrutura

```
src/
  config.js       regras de emoji, mapa grupo→cliente, modelo, caminhos
  transcrever.js  transcrição por visão + aplicação da regra do emoji
  ingest.js       monta o registro no formato do painel e salva
  store.js        persistência (data/bilhetes.json)
  api.js          rotas REST + serve o painel
  whatsapp.js     adaptador WhatsApp (reações em imagem)
  index.js        sobe API + WhatsApp
scripts/
  test-transcricao.js   teste de transcrição via linha de comando
public/
  bridge.js       liga o painel à API (polling)
```

## ⚠️ Avisos importantes

- **Termos do WhatsApp:** ler reações/mensagens de grupos usa automação não-oficial do
  WhatsApp Web (whatsapp-web.js). Isso **contraria os Termos do WhatsApp** e pode causar
  **banimento do número**. Use um número dedicado e descartável.
- **Custo:** cada transcrição é uma chamada paga à API Anthropic. Comece com `claude-sonnet-4-6`.
- **Segurança:** nunca versione o `.env` nem a pasta `.wwebjs_auth/` (já estão no `.gitignore`).
- **Dados:** este projeto usa um arquivo JSON local. Para múltiplos operadores/jogadores em
  tempo real, troque o `store.js` por um banco de dados (PostgreSQL, MySQL, etc.).
