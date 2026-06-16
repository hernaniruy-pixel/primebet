require('dotenv').config();
const path = require('path');

/**
 * Regras de cada emoji de reação.
 * "mascara" = quais campos ficam EM ABERTO (null) após a transcrição.
 *   ⚪  -> nada em aberto (aposta + valor + odd completos)
 *   ⚫  -> odd em aberto (houve alteração)
 *   🔵 -> valor em aberto
 *   ⚠️ -> odd e valor em aberto
 */
const EMOJI_REGRAS = {
  '⚪':  { mascara: [],               label: 'Completo (aposta + valor + odd)' },
  '⚫':  { mascara: ['odd'],          label: 'Odd em aberto (houve alteração)' },
  '🔵': { mascara: ['valor'],        label: 'Valor em aberto' },
  '⚠️': { mascara: ['odd', 'valor'], label: 'Odd e valor em aberto' },
};

// Remove seletor de variação (U+FE0F) e espaços para comparar emojis de forma robusta.
const norm = (s) => (s || '').replace(/️/g, '').trim();

function regraPorEmoji(emoji) {
  const alvo = norm(emoji);
  for (const [k, v] of Object.entries(EMOJI_REGRAS)) {
    if (norm(k) === alvo) return { emoji: k, ...v };
  }
  return null;
}

module.exports = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  // Começamos no Haiku (mais barato). Troque por claude-sonnet-4-6 / claude-opus-4-8 se precisar de mais precisão.
  MODELO: process.env.MODELO_TRANSCRICAO || 'claude-haiku-4-5',
  EMOJI_REGRAS,
  EMOJIS_ATIVOS: Object.keys(EMOJI_REGRAS),
  regraPorEmoji,
  norm,
  AUTH_PATH: path.join(__dirname, '..', '.wwebjs_auth'),
};
