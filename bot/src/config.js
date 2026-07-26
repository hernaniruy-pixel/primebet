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
  // Modelo de transcrição FIXADO numa versão (evita mudança silenciosa do modelo em
  // produção, que causaria "hoje lê bem, amanhã não"). Haiku 4.5 = mais barato/rápido;
  // claude-sonnet-5 = leitura de imagem bem mais assertiva (decisão medida no banco de
  // teste: node tests/comparar-modelos.js). Trocável por env sem mexer no código.
  MODELO: process.env.MODELO_TRANSCRICAO || 'claude-sonnet-5',
  EMOJI_REGRAS,
  EMOJIS_ATIVOS: Object.keys(EMOJI_REGRAS),
  regraPorEmoji,
  norm,
  // Lista de números autorizados a reagir (só dígitos, ex.: 5511999999999). Vazio = aceita qualquer reação no grupo.
  OPERADORES: (process.env.OPERADORES || '').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean),
  // Grupo de ALERTAS da integração (link do convite). O bot entra e usa como canal de status.
  GRUPO_AVISOS_LINK: process.env.GRUPO_AVISOS_LINK || '',
  AUTH_PATH: path.join(__dirname, '..', '.wwebjs_auth'),
};
