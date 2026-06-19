# Bot PrimeBet (WhatsApp + transcrição) — roda 24/7 num container.
FROM node:20-bookworm-slim

# Chromium do sistema + bibliotecas que o WhatsApp Web (puppeteer) precisa.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates fonts-liberation \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 libatspi2.0-0 \
  && rm -rf /var/lib/apt/lists/*

# Usa o Chromium do sistema (não baixa o do puppeteer).
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# A sessão do WhatsApp fica em /app/.wwebjs_auth — monte um VOLUME aqui
# na plataforma para não pedir QR a cada deploy.
CMD ["node", "src/index.js"]
