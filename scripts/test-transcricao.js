#!/usr/bin/env node
/**
 * Testa a transcrição SEM precisar do WhatsApp.
 * Uso:
 *   npm run transcrever -- ./bilhete.jpg ⚪
 *   npm run transcrever -- ./bilhete.png ⚠️
 *
 * Emojis: ⚪ completo | ⚫ odd em aberto | 🔵 valor em aberto | ⚠️ odd e valor em aberto
 */
const fs = require('fs');
const { transcreverBilhete } = require('../src/transcrever');
const { regraPorEmoji } = require('../src/config');

(async () => {
  const file = process.argv[2];
  const emoji = process.argv[3] || '⚪';

  if (!file) {
    console.error('Uso: npm run transcrever -- <caminho-da-imagem> <emoji ⚪|⚫|🔵|⚠️>');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error('Arquivo não encontrado:', file);
    process.exit(1);
  }
  const regra = regraPorEmoji(emoji);
  if (!regra) {
    console.error('Emoji inválido. Use um destes: ⚪ ⚫ 🔵 ⚠️');
    process.exit(1);
  }

  const base64 = fs.readFileSync(file).toString('base64');
  const mime = file.toLowerCase().endsWith('.png') ? 'image/png'
    : file.toLowerCase().endsWith('.webp') ? 'image/webp'
    : 'image/jpeg';

  console.log(`\nTranscrevendo "${file}" com ${regra.emoji} (${regra.label})...\n`);
  try {
    const { bruto, final } = await transcreverBilhete(base64, emoji, mime);
    console.log('— Transcrição bruta (o que a imagem mostra):');
    console.log(JSON.stringify(bruto, null, 2));
    console.log('\n— Após a regra do emoji (null = entra EM ABERTO no painel):');
    console.log(JSON.stringify(final, null, 2));
  } catch (e) {
    console.error('\n❌ Erro:', e.message);
    process.exit(1);
  }
})();
