#!/usr/bin/env node
/**
 * Testa a transcrição SEM precisar do WhatsApp.
 * Uso:
 *   npm run testar -- "C:\\caminho\\bilhete.jpg" ⚪
 *   npm run testar -- ./bilhete.png ⚠️
 *
 * Emojis: ⚪ completo | ⚫ odd em aberto | 🔵 valor em aberto | ⚠️ odd e valor em aberto
 */
const fs = require('fs');
const { transcreverBilhete } = require('../src/transcrever');
const { regraPorEmoji, MODELO } = require('../src/config');

// Preço por 1M tokens (USD) para estimar custo por bilhete.
const PRECO = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 5, out: 25 },
};

(async () => {
  const file = process.argv[2];
  // Aceita emoji OU palavra-chave (mais fácil de digitar no Windows).
  const ALIAS = { completo: '⚪', branco: '⚪', odd: '⚫', preto: '⚫', valor: '🔵', azul: '🔵', ambos: '⚠️', aviso: '⚠️' };
  const arg = process.argv[3] || 'completo';
  const emoji = ALIAS[arg.toLowerCase()] || arg;
  if (!file) { console.error('Uso: npm run testar -- <caminho-da-imagem> <completo|odd|valor|ambos>'); process.exit(1); }
  if (!fs.existsSync(file)) { console.error('Arquivo não encontrado:', file); process.exit(1); }
  const regra = regraPorEmoji(emoji);
  if (!regra) { console.error('Emoji inválido. Use: ⚪ ⚫ 🔵 ⚠️'); process.exit(1); }

  const base64 = fs.readFileSync(file).toString('base64');
  const lower = file.toLowerCase();
  const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

  console.log(`\nModelo: ${MODELO}`);
  console.log(`Transcrevendo "${file}" com ${regra.emoji} (${regra.label})...\n`);
  try {
    const t0 = Date.now();
    const { bruto, final, usage, modelo } = await transcreverBilhete(base64, emoji, mime);
    const ms = Date.now() - t0;
    console.log('— Transcrição bruta (o que a imagem mostra):');
    console.log(JSON.stringify(bruto, null, 2));
    console.log('\n— Após a regra do emoji (null = entra EM ABERTO no painel):');
    console.log(JSON.stringify(final, null, 2));
    if (usage) {
      const p = PRECO[modelo] || PRECO[MODELO];
      const custo = p ? (usage.input_tokens * p.in + usage.output_tokens * p.out) / 1e6 : null;
      console.log(`\n— Tokens: entrada ${usage.input_tokens} | saída ${usage.output_tokens} | tempo ${ms}ms`);
      if (custo != null) console.log(`— Custo deste bilhete: ~US$ ${custo.toFixed(5)}  (≈ US$ ${(custo * 5000).toFixed(2)}/mês a 5.000 imagens)`);
    }
  } catch (e) {
    console.error('\n❌ Erro:', e.message);
    process.exit(1);
  }
})();
