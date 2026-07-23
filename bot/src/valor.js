/**
 * Extrai o valor de aposta de um texto (legenda da mensagem), de forma DETERMINÍSTICA.
 * Formato brasileiro: "." = milhar, "," = decimal. "k"/"mil" = milhares.
 * Ex.: "600"->600 | "1k"->1000 | "2,5k"->2500 | "1.500"->1500 | "R$ 1.200,00"->1200 | "300"->300
 * Retorna number ou null (sem valor).
 */
function parseValor(texto) {
  if (texto == null) return null;
  const t = String(texto).toLowerCase().replace(/r\$/g, ' ');
  const m = t.match(/(\d[\d.,]*)\s*(k|mil)?/);
  if (!m) return null;
  const raw = m[1];
  const suf = m[2];
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let n;
  if (hasComma && hasDot) {
    n = parseFloat(raw.replace(/\./g, '').replace(',', '.')); // 1.200,00 -> 1200.00
  } else if (hasComma) {
    n = parseFloat(raw.replace(',', '.')); // 2,5 -> 2.5
  } else if (hasDot) {
    const after = raw.split('.').pop();
    if (!suf && after.length === 3) n = parseFloat(raw.replace(/\./g, '')); // 1.500 -> 1500 (milhar)
    else n = parseFloat(raw); // 1.5 (decimal, ex.: 1.5k)
  } else {
    n = parseInt(raw, 10);
  }
  if (isNaN(n)) return null;
  if (suf) n = n * 1000; // k / mil
  return Math.round(n * 100) / 100;
}

/**
 * Igual ao parseValor, mas para MENSAGENS DE TEXTO SOLTAS (o cliente manda o print e
 * escreve o valor na mensagem debaixo). Aqui NÃO dá para ser guloso: "vai dar green no
 * 2º jogo" não pode virar R$ 2. Só aceita quando a mensagem É um valor — nada além do
 * número, de um "R$"/"valor"/"entrada" na frente e de um "k"/"mil" no fim.
 * Ex.: "1300" | "R$ 1.300" | "valor: 2,5k" | "entrada 500" -> valor
 *      "green no 2 jogo" | "1x2" | "odd 1.83" -> null
 */
const RE_SO_VALOR = /^\s*(?:valor|entrada|apostado?|stake)?\s*:?\s*(?:r\$)?\s*(\d[\d.,]*)\s*(k|mil)?\s*$/i;

function parseValorMensagem(texto) {
  const t = String(texto == null ? '' : texto).trim();
  if (!t || !RE_SO_VALOR.test(t)) return null;
  return parseValor(t.replace(/^\s*(?:valor|entrada|apostado?|stake)\s*:?\s*/i, ''));
}

/**
 * Valor a partir da LEGENDA da imagem, com prioridade sobre a odd lida na foto.
 * A legenda de prints ENCAMINHADOS costuma ser o LINK de compartilhamento da casa
 * ("Adicionar ao Seu Cupom - https://www.bet365.bet.br/s/r/Ws7cf", ".../899A-EV59LV").
 * O parseValor guloso pegava "365" (de bet365) ou "899" (do código do link) como se
 * fosse o valor apostado — leituras completamente erradas (#bug 23/07). Aqui: primeiro
 * REMOVE urls/domínios; depois só aceita se o que sobrou for DE FATO um valor (regra
 * estrita), senão devolve null e o valor da IMAGEM prevalece.
 */
function valorDaLegenda(texto) {
  if (texto == null) return null;
  const semUrl = String(texto)
    .replace(/https?:\/\/\S+/gi, ' ')                       // urls completas
    .replace(/\b[\w-]+\.(?:com|br|net|org|bet|app|io)\S*/gi, ' ') // domínios soltos (bet365.bet.br/…)
    .replace(/\s+/g, ' ')
    .trim();
  if (!semUrl) return null;
  return parseValorMensagem(semUrl); // estrito: a sobra tem que SER um valor, nada de dígito no meio de texto
}

module.exports = { parseValor, parseValorMensagem, valorDaLegenda };

// Autoteste: node src/valor.js
if (require.main === module) {
  const estritos = [
    ['1300', 1300], ['R$ 1.300', 1300], ['1.300', 1300], ['valor: 2,5k', 2500],
    ['entrada 500', 500], ['  600  ', 600], ['2 mil', 2000], ['1k', 1000],
    // devem ser RECUSADOS (não são "só um valor"):
    ['vai dar green no 2 jogo', null], ['odd 1.83', null], ['bom dia', null],
    ['', null], ['1 x 2', null], ['500 no time A', null],
  ];
  let okE = 0;
  console.log('— parseValorMensagem (texto solto) —');
  for (const [inp, esp] of estritos) { const r = parseValorMensagem(inp); const pass = r === esp; if (pass) okE++; console.log(`${pass ? '✓' : '✗'} ${JSON.stringify(inp)} -> ${r}${pass ? '' : ' (esperava ' + esp + ')'}`); }
  console.log(`${okE}/${estritos.length} OK\n`);

  console.log('— parseValor (legenda da imagem) —');
  const casos = [['600', 600], ['1k', 1000], ['275', 275], ['1000', 1000], ['2,5k', 2500], ['1.500', 1500], ['R$ 1.000', 1000], ['300', 300], ['1.200,00', 1200], ['1.5k', 1500], ['2 mil', 2000], ['', null], ['sem valor', null], ['valor 350', 350], ['1k', 1000]];
  let ok = 0;
  for (const [inp, esp] of casos) { const r = parseValor(inp); const pass = r === esp; if (pass) ok++; console.log(`${pass ? '✓' : '✗'} ${JSON.stringify(inp)} -> ${r}${pass ? '' : ' (esperava ' + esp + ')'}`); }
  console.log(`\n${ok}/${casos.length} OK`);

  console.log('\n— valorDaLegenda (ignora links de compartilhamento) —');
  const legs = [
    ['Adicionar ao Seu Cupom de Apostas - https://www.bet365.bet.br/s/r/Ws7cf', null], // NÃO pode virar 365
    ['https://superbet.bet.br/bilhete-compartilhado/899A-EV59LV', null],               // NÃO pode virar 899
    ['1500', 1500], ['R$ 1.441,00', 1441], ['2,5k', 2500], ['valor 500', 500], ['bom dia', null], ['', null],
  ];
  let okL = 0;
  for (const [inp, esp] of legs) { const r = valorDaLegenda(inp); const pass = r === esp; if (pass) okL++; console.log(`${pass ? '✓' : '✗'} ${JSON.stringify(inp).slice(0, 55)} -> ${r}${pass ? '' : ' (esperava ' + esp + ')'}`); }
  console.log(`${okL}/${legs.length} OK`);
}
