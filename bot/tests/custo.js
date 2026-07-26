// Mede o CUSTO REAL por transcrição: baixa os bilhetes de casos-grande.json, roda no
// modelo de produção e soma tokens (input, output incl. thinking) de cada resposta.
// Depois projeta o custo para 1k..5k transcrições/mês nos dois cenários de preço do
// Sonnet 5 (intro até 31/08/2026 e cheio). Uso: node tests/custo.js
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { transcreverImagem } = require('../src/transcrever');
const { MODELO } = require('../src/config');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const casos = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos-grande.json'), 'utf8'));

// US$/1M tokens
const PRECOS = {
  intro:  { in: 2, out: 10 },   // Sonnet 5 promo até 31/08/2026
  cheio:  { in: 3, out: 15 },   // Sonnet 5 padrão
};
const USD_BRL = 5.60;

async function baixar(imgId) {
  const { data: row } = await sb.from('imagens_recebidas').select('thumb_path').eq('id', imgId).single();
  if (!row || !row.thumb_path) throw new Error('img ' + imgId + ' sem thumb');
  const { data: blob, error } = await sb.storage.from('conferencia').download(row.thumb_path);
  if (error) throw error;
  return Buffer.from(await blob.arrayBuffer()).toString('base64');
}

(async () => {
  console.log(`Modelo: ${MODELO} | medindo ${casos.length} bilhetes reais...\n`);
  let sIn = 0, sOut = 0, n = 0;
  for (const c of casos) {
    try {
      const b64 = await baixar(c.img);
      const { usage } = await transcreverImagem(b64, 'image/jpeg');
      const inT = usage.input_tokens; const outT = usage.output_tokens;
      sIn += inT; sOut += outT; n++;
      console.log(`#${c.img}  in=${inT}  out=${outT}`);
    } catch (e) { console.log(`#${c.img}  ERRO ${e.message}`); }
  }
  const mIn = sIn / n, mOut = sOut / n;
  console.log(`\n── MÉDIA POR BILHETE (${n} amostras) ──`);
  console.log(`  input  : ${mIn.toFixed(0)} tokens`);
  console.log(`  output : ${mOut.toFixed(0)} tokens (inclui raciocínio)`);

  for (const [nome, p] of Object.entries(PRECOS)) {
    const custoUSD = (mIn * p.in + mOut * p.out) / 1e6;
    console.log(`\n══ PREÇO ${nome.toUpperCase()} (in $${p.in} / out $${p.out} por 1M) ══`);
    console.log(`  por bilhete : US$ ${custoUSD.toFixed(5)}  ≈ R$ ${(custoUSD*USD_BRL).toFixed(4)}`);
    for (const q of [1000, 2000, 3000, 4000, 5000]) {
      const usd = custoUSD * q;
      console.log(`  ${String(q).padStart(4)} bilhetes/mês : US$ ${usd.toFixed(2).padStart(7)}  ≈ R$ ${(usd*USD_BRL).toFixed(2).padStart(8)}`);
    }
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
