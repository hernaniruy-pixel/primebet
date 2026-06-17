const _SDK = require('@anthropic-ai/sdk');
const Anthropic = _SDK.Anthropic || _SDK.default || _SDK;
const { ANTHROPIC_API_KEY, MODELO, regraPorEmoji } = require('./config');
const { parseValor } = require('./valor');

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const PROMPT = `Você transcreve BILHETES DE APOSTAS ESPORTIVAS a partir da imagem enviada.
Leia a imagem e devolva SOMENTE um JSON válido (sem markdown, sem comentários, sem texto fora do JSON) no formato:

{
  "jogo": "string",      // descrição da aposta preservando as linhas, ex: "1) Time A x Time B\\n• Mercado / seleção"
  "odd": number | null,  // odd TOTAL do bilhete (se combinada, a odd final). Use ponto decimal. null se não aparecer.
  "valor": number | null,// valor apostado em R$ (somente o número). null se não aparecer.
  "casa": string | null  // CASA DE APOSTA / descarrego. null se não identificar.
}

Regras de leitura:
- Converta vírgula decimal para ponto (ex.: "1,89" -> 1.89).
- Em valores monetários, remova "R$" e separadores de milhar (ex.: "R$ 1.200,00" -> 1200).
- Para combinadas (múltiplas seleções), numere cada jogo ("1) ...", "2) ...") e use "• " antes de cada mercado, separando por \\n.
- Preserve os nomes dos times exatamente como aparecem.
- "casa" é a CASA DE APOSTA (ex.: BET365, BETANO, SPORTINGBET, SUPERBET, PIXBET). NUNCA use nome de time, jogador, campeonato ou liga como casa. Se você não reconhecer uma casa de aposta conhecida na imagem, use null.
- VALOR: leia o valor apostado que aparece NA IMAGEM. Converta para número (remova "R$" e separadores de milhar). Se não houver valor visível na imagem, use null. (O valor final pode ser ajustado depois pelo texto da mensagem — você apenas transcreve o que vê na imagem.)
- Não invente dados: se a odd, o valor ou a casa não estiverem visíveis, use null.
- Responda APENAS com o JSON.`;

/** Chama o modelo de visão e devolve o JSON bruto transcrito a partir da IMAGEM apenas. */
async function transcreverImagem(base64, mediaType = 'image/jpeg') {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada (.env).');
  const content = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
    { type: 'text', text: PROMPT },
  ];

  const resp = await client.messages.create({
    model: MODELO,
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });
  const txt = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const limpo = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return { dados: JSON.parse(limpo), usage: resp.usage, modelo: resp.model };
  } catch {
    throw new Error('Não consegui interpretar a resposta como JSON. Resposta do modelo:\n' + txt);
  }
}

/**
 * Monta o resultado final a partir do que a IA leu na imagem (`dados`), da `legenda` da
 * mensagem e do `emoji` da reação. Regras de VALOR (dinheiro — nunca confiar na IA p/ isto):
 *   1) Se a legenda tiver um número, ELE vence (mesmo divergindo da imagem). parseValor no código.
 *   2) Senão, usa o valor que a IA leu na imagem.
 *   3) O emoji 🔵/⚠️ (mascara 'valor') zera tudo -> null (operador deixa em aberto de propósito).
 */
function aplicaRegra(dados, emoji, legenda = '') {
  const regra = regraPorEmoji(emoji);
  const out = { jogo: dados.jogo || '', odd: dados.odd ?? null, valor: dados.valor ?? null, casa: dados.casa ?? null };

  // Valor: legenda tem prioridade sobre a imagem.
  const valorLegenda = parseValor(legenda);
  if (valorLegenda != null) out.valor = valorLegenda;

  // Emoji: zera (em aberto) os campos correspondentes — vence tudo.
  if (regra && regra.mascara.includes('odd')) out.odd = null;
  if (regra && regra.mascara.includes('valor')) out.valor = null;
  return out;
}

/** Transcreve a imagem e aplica regra do emoji + valor da legenda (caso 2). */
async function transcreverBilhete(base64, emoji, mediaType = 'image/jpeg', legenda = '') {
  const regra = regraPorEmoji(emoji);
  if (!regra) throw new Error('Emoji de gatilho inválido: ' + emoji);
  const { dados, usage, modelo } = await transcreverImagem(base64, mediaType);
  const final = aplicaRegra(dados, emoji, legenda);
  return { bruto: dados, final, emoji: regra.emoji, regra, usage, modelo };
}

module.exports = { transcreverBilhete, transcreverImagem, aplicaRegra };
