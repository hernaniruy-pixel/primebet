# Bot PrimeBet (WhatsApp + transcrição) — roda 24/7 num container.
# Node 22 (tem WebSocket nativo, exigido pelo @supabase/realtime-js).
FROM node:22-bookworm-slim

# Chromium do sistema + bibliotecas que o WhatsApp Web (puppeteer) precisa.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates fonts-liberation \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libatspi2.0-0 \
    libgtk-3-0 libx11-6 libx11-xcb1 libxcb1 libxext6 libxi6 libxrender1 \
    libxtst6 libxcursor1 libxss1 libdbus-1-3 libexpat1 libfontconfig1 \
    libglib2.0-0 libvulkan1 libgl1 \
  && rm -rf /var/lib/apt/lists/*

# Deixa o puppeteer baixar o Chrome CASADO com a versão dele (evita descasamento
# com o chromium do sistema, que quebra o launch — "Failed to launch ... Code: null").
# As libs do apt acima suprem as dependências desse Chrome.
ENV NODE_ENV=production

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# A sessão do WhatsApp fica em /app/.wwebjs_auth — monte um VOLUME aqui
# na plataforma para não pedir QR a cada deploy.
CMD ["node", "src/index.js"]
