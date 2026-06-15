const _SDK = require('@anthropic-ai/sdk');
const Anthropic = _SDK.Anthropic || _SDK.default || _SDK;
const { ANTHROPIC_API_KEY, MODELO, regraPorEmoji } = require('./config');

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const PROMPT = `Você transcreve BILHETES DE APOSTAS ESPORTIVAS a partir da imagem enviada.
Leia a imagem e devolva SOMENTE um JSON válido (sem markdown, sem comentários, sem texto fora do JSON) no formato:

{
  "jogo": "string",      // descrição da aposta preservando as linhas, ex: "1) Time A x Time B\\n• Mercado / seleção"
  "odd": number | null,  // odd TOTAL do bilhete (se combinada, a odd final). Use ponto decimal. null se não aparecer.
  "valor": number | null,// valor apostado em R$ (somente o número). null se não aparecer.
  "casa": string | null  // casa de aposta / descarrego, ex: "BET365", "BETANO". null se não identificar.
}

Regras de leitura:
- Converta vírgula decimal para ponto (ex.: "1,89" -> 1.89).
- Em valores monetários, remova "R$" e separadores de milhar (ex.: "R$ 1.200,00" -> 1200).
- Para combinadas (múltiplas seleções), numere cada jogo ("1) ...", "2) ...") e use "• " antes de cada mercado, separando por \\n.
- Não invente dados: se a odd, o valor ou a casa não estiverem visíveis, use null.
- Responda APENAS com o JSON.`;

/** Chama o modelo de visão e devolve o JSON bruto transcrito. */
async function transcreverImagem(base64, mediaType = 'image/jpeg') {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada (.env).');
  const resp = await client.messages.create({
    model: MODELO,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: PROMPT },
      ],
    }],
  });
  const txt = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const limpo = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(limpo);
  } catch (e) {
    throw new Error('Não consegui interpretar a resposta como JSON. Resposta do modelo:\n' + txt);
  }
}

/** Aplica a regra do emoji: zera (deixa null = "em aberto") os campos correspondentes. */
function aplicaRegra(dados, emoji) {
  const regra = regraPorEmoji(emoji);
  const out = { jogo: dados.jogo || '', odd: dados.odd ?? null, valor: dados.valor ?? null, casa: dados.casa ?? null };
  if (regra && regra.mascara.includes('odd')) out.odd = null;
  if (regra && regra.mascara.includes('valor')) out.valor = null;
  return out;
}

/**
 * Transcreve a imagem e já aplica a regra do emoji.
 * Retorna { bruto, final, emoji, regra }.
 */
async function transcreverBilhete(base64, emoji, mediaType = 'image/jpeg') {
  const regra = regraPorEmoji(emoji);
  if (!regra) throw new Error('Emoji de gatilho inválido: ' + emoji);
  const bruto = await transcreverImagem(base64, mediaType);
  const final = aplicaRegra(bruto, emoji);
  return { bruto, final, emoji: regra.emoji, regra };
}

module.exports = { transcreverBilhete, transcreverImagem, aplicaRegra };
