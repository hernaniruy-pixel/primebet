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
const norm = (s) => (s || '').replace(/\uFE0F/g, '').trim();

/** Retorna a regra para um emoji, tolerando variações de codificação. */
function regraPorEmoji(emoji) {
  const alvo = norm(emoji);
  for (const [k, v] of Object.entries(EMOJI_REGRAS)) {
    if (norm(k) === alvo) return { emoji: k, ...v };
  }
  return null;
}

/**
 * Mapeia o ID do grupo do WhatsApp -> cliente do painel.
 * Como descobrir o ID: rode `npm start`, reaja a uma imagem no grupo e veja
 * no console a linha "Reação em grupo não mapeado: XXXX@g.us". Cole esse ID aqui.
 * O "cliente" deve bater com o NOME do cliente cadastrado no painel (em maiúsculas).
 */
const GRUPOS = {
  // '120363000000000000@g.us': { cliente: 'CRISTIAN' },
  // '120363111111111111@g.us': { cliente: 'AHLEFELD' },
};

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  MODELO: process.env.MODELO_TRANSCRICAO || 'claude-sonnet-4-6',
  HABILITAR_WHATSAPP: process.env.HABILITAR_WHATSAPP !== 'false',
  EMOJI_REGRAS,
  EMOJIS_ATIVOS: Object.keys(EMOJI_REGRAS),
  GRUPOS,
  regraPorEmoji,
  norm,
  DB_PATH: path.join(__dirname, '..', 'data', 'bilhetes.json'),
  AUTH_PATH: path.join(__dirname, '..', '.wwebjs_auth'),
};
