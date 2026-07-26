// RELATÓRIO PROFISSIONAL: Haiku vs Sonnet no conjunto grande (casos-grande.json),
// medindo ACERTO por tipo de bilhete E CUSTO real (tokens medidos na API).
//   node tests/relatorio-modelos.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { transcreverImagem, PROMPT } = require('../src/transcrever');

// Preços por 1M de tokens (skill oficial Anthropic). Sonnet: promo até 31/08/2026.
const PRECO = {
  'claude-haiku-4-5-20251001': { in: 1.00, out: 5.00, nome: 'Haiku 4.5' },
  'claude-sonnet-5':           { in: 2.00, out: 10.00, nome: 'Sonnet 5 (promo)' },
};
const MODELOS = Object.keys(PRECO);
const USD_BRL = 5.5; // aproximado p/ projeção em reais

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const casos = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos-grande.json'), 'utf8'));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const perto = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.02;

function avaliar(caso, d) {
  const f = [];
  if ('odd' in caso) { if (!(caso.odd === null ? d.odd == null : perto(d.odd, caso.odd))) f.push(`odd=${d.odd}≠${caso.odd}`); }
  if ('valor' in caso && !perto(d.valor, caso.valor)) f.push(`valor=${d.valor}≠${caso.valor}`);
  const j = norm(d.jogo);
  for (const s of (caso.contem || [])) if (!j.includes(norm(s))) f.push(`faltou "${s}"`);
  return { ok: f.length === 0, f };
}

async function baixar(id) {
  const { data: row } = await sb.from('imagens_recebidas').select('thumb_path').eq('id', id).single();
  const { data: blob } = await sb.storage.from('conferencia').download(row.thumb_path);
  return Buffer.from(await blob.arrayBuffer()).toString('base64');
}

(async () => {
  console.log(`Baixando ${casos.length} bilhetes...`);
  const imgs = {};
  for (const c of casos) imgs[c.img] = await baixar(c.img);

  const res = {};
  for (const modelo of MODELOS) {
    let acertos = 0, tokIn = 0, tokOut = 0;
    const erros = [];
    console.log(`\n════════ ${PRECO[modelo].nome} (${modelo}) ════════`);
    for (const caso of casos) {
      let dados, usage;
      try { ({ dados, usage } = await transcreverImagem(imgs[caso.img], 'image/jpeg', PROMPT, modelo)); }
      catch (e) { console.log(`✗ #${caso.img} ERRO: ${e.message}`); erros.push(caso); continue; }
      tokIn += usage.input_tokens; tokOut += usage.output_tokens;
      const r = avaliar(caso, dados);
      if (r.ok) { acertos++; console.log(`✓ #${caso.img} [${caso.tipo}]`); }
      else { erros.push({ ...caso, f: r.f }); console.log(`✗ #${caso.img} [${caso.tipo}] — ${r.f.join(' | ')}`); }
    }
    const custoUSD = (tokIn / 1e6) * PRECO[modelo].in + (tokOut / 1e6) * PRECO[modelo].out;
    res[modelo] = { acertos, tokIn, tokOut, custoUSD, erros };
    console.log(`  NOTA: ${acertos}/${casos.length}`);
  }

  console.log(`\n\n═════════════ RELATÓRIO ═════════════`);
  console.log('Modelo'.padEnd(20), 'Acerto'.padEnd(9), 'US$/bilhete'.padEnd(13), 'R$/1000 bilh'.padEnd(14), 'Proj. 3000/mês');
  for (const m of MODELOS) {
    const r = res[m];
    const porBilhete = r.custoUSD / casos.length;
    const brl1000 = porBilhete * 1000 * USD_BRL;
    const mes = porBilhete * 3000 * USD_BRL;
    console.log(
      PRECO[m].nome.padEnd(20),
      `${r.acertos}/${casos.length}`.padEnd(9),
      `$${porBilhete.toFixed(5)}`.padEnd(13),
      `R$${brl1000.toFixed(2)}`.padEnd(14),
      `R$${mes.toFixed(2)}/mês`
    );
  }
  console.log('\n(US$1 ≈ R$' + USD_BRL + '; média de tokens medida nos bilhetes reais)');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
