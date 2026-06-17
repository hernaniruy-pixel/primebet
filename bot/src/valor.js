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

module.exports = { parseValor };

// Autoteste: node src/valor.js
if (require.main === module) {
  const casos = [['600', 600], ['1k', 1000], ['275', 275], ['1000', 1000], ['2,5k', 2500], ['1.500', 1500], ['R$ 1.000', 1000], ['300', 300], ['1.200,00', 1200], ['1.5k', 1500], ['2 mil', 2000], ['', null], ['sem valor', null], ['valor 350', 350], ['1k', 1000]];
  let ok = 0;
  for (const [inp, esp] of casos) { const r = parseValor(inp); const pass = r === esp; if (pass) ok++; console.log(`${pass ? '✓' : '✗'} ${JSON.stringify(inp)} -> ${r}${pass ? '' : ' (esperava ' + esp + ')'}`); }
  console.log(`\n${ok}/${casos.length} OK`);
}
