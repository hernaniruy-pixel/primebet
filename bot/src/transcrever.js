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
- CONFRONTO (times): TODO jogo tem os dois lados — quase sempre aparecem juntos no topo do card (ex.: "Aurora x Nemesis", "Lanús v Cianciano", "MIBR Academy - QUINTESSENCIA", "Sampaio Correa RJ"). SEMPRE inclua o confronto na linha do jogo com os DOIS times ("Time A x Time B"), mesmo que a seleção embaixo cite só um dos times. Se o print mostrar só um time e o adversário realmente não aparecer em lugar nenhum, use o(s) time(s) que você conseguir ler — nunca deixe a linha do jogo sem nome de time.
- MERCADO + SELEÇÃO (não descarte a linha de baixo): cada seleção costuma ter DUAS partes — a escolha em destaque/negrito (ex.: "Mais de 12.5 - Sim", "Menos de 4.5 Gols", "Vencedor") e, logo ABAIXO dela, em letra menor/mais clara, o NOME DO MERCADO que dá sentido à escolha (ex.: "Cada Equipe Mais de X Desarmes", "Partida - Gols", "Handicap Asiático", "Resultado Final"). Transcreva SEMPRE as DUAS juntas na mesma linha "• ", no formato "• <nome do mercado> — <seleção>" (ex.: "• Cada Equipe Mais de X Desarmes — Mais de 12.5 (Sim)"). NUNCA jogue fora a linha de baixo: sozinha, "Mais de 12.5 - Sim" não diz do que se trata.
- DUPLA CHANCE e seleções com "ou": muitas seleções têm DOIS lados ligados por "ou" — dupla chance ("Empate ou Cumbaya", "San Antonio FC ou Empate", "Casa ou Fora") ou "ambas as equipes". Transcreva a seleção INTEIRA, com os dois lados: NUNCA corte para só um lado (ex.: nunca reduza "Empate ou Cumbaya" a "Empate"). O nome do time depois do "ou" faz parte da aposta.
- MARCAÇÃO DO CLIENTE (círculo/seta/rabisco): quando a imagem for uma TABELA de mercados (várias linhas de odds) e o cliente tiver DESENHADO à mão um círculo, seta ou rabisco em volta de uma opção, transcreva SOMENTE a(s) opção(ões) marcada(s) — é a aposta escolhida. Leia o NOME DO MERCADO daquela opção (o título em destaque/negrito da seção, ex.: "Chance Dupla", "Resultado Final") e a seleção completa com a odd. Ignore as outras linhas não marcadas da tabela.
- HANDICAP / LINHA: quando a seleção tiver um número de handicap ou linha, ele faz PARTE da seleção e NUNCA pode ser omitido: "-0.25", "+1.5", "-0.5", "Menos de 4.5", "Mais de 3.5", "Handicap Asiático -0.25". Transcreva o número exatamente como aparece junto do mercado (ex.: "• Handicap Asiático -0.25 — Sampaio Correa RJ").
- VENCEDOR / RESULTADO FINAL: nesses mercados diga QUAL time foi selecionado — nunca escreva só "Vencedor" ou "Resultado Final" sozinho. Use o time destacado/selecionado (ex.: "• Vencedor: QUINTESSENCIA", "• Resultado Final: Lanús").
- SELEÇÕES OCULTAS: prints de bilhete combinado às vezes mostram só UMA seleção de cada jogo e trazem um aviso como "+ 4 mais seleções", "+ 5 mais seleções" ou "+ 1 mais seleção". Isso significa que aquele jogo tem MAIS seleções ativas que o print NÃO exibiu. NUNCA invente essas seleções (você não as vê); apenas registre o aviso como uma linha própria logo ABAIXO da seleção visível daquele jogo, no formato exato "• (+N seleções não exibidas no print)" (troque N pelo número lido). Se houver um "+ N mais seleções" solto no rodapé, sem jogo visível, transcreva-o também como "• (+N seleções não exibidas no print)".
- Preserve os nomes dos times exatamente como aparecem.
- NUNCA inclua a data nem o horário da partida em "jogo" (ex.: "Qua 15 Jul 16:00", "15/07 21:30", "Hoje às 16:00"). A data da aposta vem do WhatsApp, não do bilhete. Transcreva só times e mercados.
- "casa" é a CASA DE APOSTA (ex.: BET365, BETANO, SPORTINGBET, SUPERBET, PIXBET). NUNCA use nome de time, jogador, campeonato ou liga como casa. Se você não reconhecer uma casa de aposta conhecida na imagem, use null.
- ODD: devolva a odd TOTAL do bilhete. Em bilhetes COMBINADOS (várias seleções) essa odd total quase sempre ESTÁ impressa — procure-a perto do campo de valor/"Aposta", no topo do cupom ("Criar aposta", "Cupom de Apostas", "Reutilizar seleções") ou ao lado de rótulos como "Odds totais"/"Total"/"Cotação". USE-a; NÃO devolva null só porque há muitas seleções. A odd total é a que se refere ao cupom inteiro (ligada ao valor apostado), NÃO a odd de uma única seleção — não confunda as duas. NUNCA calcule, multiplique ou estime a odd por conta própria; se — e só se — não houver nenhuma odd total impressa em lugar algum, use null (o operador preenche).
- VALOR: leia o VALOR APOSTADO / ENTRADA / STAKE — o quanto foi apostado (rótulos como "Aposta", "Valor da aposta", "Stake", "Entrada"). NUNCA use o RETORNO / GANHO POTENCIAL / "possível retorno" / "prêmio" no lugar do valor apostado. NUNCA use o SALDO / "Saldo" da conta (costuma aparecer no topo do cupom, ex.: "Saldo R$7.624,77") como valor — isso é o dinheiro em conta, não a aposta. Se o campo de aposta estiver vazio ou só houver saldo/retorno, use null. Converta para número (remova "R$" e separadores de milhar).
- NÃO invente dados: se a odd, o valor ou a casa não estiverem visíveis com clareza, use null. Chutar um número errado é pior do que devolver null.
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
