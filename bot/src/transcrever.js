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
- NUNCA inclua a data nem o horário da partida em "jogo" (ex.: "Qua 15 Jul 16:00", "15/07 21:30", "Hoje às 16:00"). A data da aposta vem do WhatsApp, não do bilhete. Transcreva só times e mercados.
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

// ── Data/hora da PARTIDA não entra na descrição do jogo ────────────────────────
// O bilhete impresso traz "Qua 15 Jul 16:00" embaixo dos times, e a IA copiava
// junto (#17888). A data da aposta é a do print no WhatsApp — essa linha só
// polui a coluna e ainda confunde quem lê, sugerindo uma data que não é a do
// lançamento. O prompt pede para omitir, mas modelo de visão não é determinístico:
// este filtro garante. Só apaga a linha quando ela é SOMENTE data/hora — se tiver
// qualquer palavra de time ou mercado junto, a linha fica intacta.
// Sem \b nas pontas: no JS o \b não enxerga letra acentuada como letra, então
// "\bamanhã\b" nunca casa e "\bàs\b" nunca casa. Usamos limite explícito.
const B0 = '(?<![\\p{L}])'; const B1 = '(?![\\p{L}])';
const DIA_SEMANA = '(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|seg|ter|qua|qui|sex|s[áa]b|dom|hoje|amanh[ãa]|ontem)';
const MES = '(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*';
const HORA = /\b\d{1,2}\s*[:h]\s*\d{2}\b/;
const DATA = /\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/;

function ehSoDataHora(linha) {
  const t = linha.replace(/^[•\-•·]\s*/, '').trim();
  if (!t) return false;
  // Sem nenhum sinal de data/hora, nem olha o resto.
  if (!(HORA.test(t) || DATA.test(t) || new RegExp(`${B0}${DIA_SEMANA}${B1}`, 'iu').test(t))) return false;
  const resto = t
    .replace(new RegExp(`${B0}${DIA_SEMANA}${B1}`, 'giu'), ' ')
    .replace(new RegExp(`${B0}${MES}${B1}`, 'giu'), ' ')
    .replace(new RegExp(HORA.source, 'g'), ' ')
    .replace(new RegExp(DATA.source, 'g'), ' ')
    .replace(new RegExp(`${B0}(?:[àa]s|de|hrs?|horas?)${B1}`, 'giu'), ' ')
    .replace(/\b\d{1,4}\b/g, ' ')
    .replace(/[,.\-–—|()]/g, ' ')
    .trim();
  return resto === '';
}

/** Tira da descrição as linhas que são só data/hora da partida. */
function limparJogo(jogo) {
  return String(jogo || '')
    .split('\n')
    .filter((l) => !ehSoDataHora(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const out = { jogo: limparJogo(dados.jogo), odd: dados.odd ?? null, valor: dados.valor ?? null, casa: dados.casa ?? null };

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

module.exports = { transcreverBilhete, transcreverImagem, aplicaRegra, limparJogo };
