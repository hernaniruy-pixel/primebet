# Bot PrimeBet (WhatsApp + transcrição) — roda 24/7 num container.
# Node 22 (tem WebSocket nativo, exigido pelo @supabase/realtime-js).
FROM node:22-bookworm-slim

# A Baileys fala o protocolo do WhatsApp por WebSocket: NÃO precisa de Chromium
# nem das dezenas de libs gráficas que a versão antiga (puppeteer) exigia.
# Imagem muito menor, boot mais rápido e sem cache de navegador enchendo o volume.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app
COPY package*.json ./
# --legacy-peer-deps: a Baileys pede jimp@^1.6 como peer OPCIONAL, mas usamos o
# jimp@0.22 direto para gerar as miniaturas da conferência. Conflito inofensivo.
RUN npm install --omit=dev --legacy-peer-deps
COPY . .

# A sessão do WhatsApp fica em /app/.wwebjs_auth (agora são poucos KB de credenciais,
# não mais um perfil de navegador). Mantido o mesmo caminho do volume já existente.
CMD ["node", "src/index.js"]
