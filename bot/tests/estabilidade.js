// Roda cada modelo N vezes no conjunto (modelo de visão é NÃO-determinístico, então
// 1 rodada engana). Reporta média + quais bilhetes são instáveis. Decisão honesta.
//   node tests/estabilidade.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { transcreverImagem, PROMPT } = require('../src/transcrever');

const N = 3;
const PRECO = { 'claude-haiku-4-5-20251001': { in: 1, out: 5, nome: 'Haiku 4.5' }, 'claude-sonnet-5': { in: 2, out: 10, nome: 'Sonnet 5' } };
const MODELOS = Object.keys(PRECO);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const casos = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos-grande.json'), 'utf8'));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const perto = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.02;
const passa = (c, d) => {
  if ('odd' in c && !(c.odd === null ? d.odd == null : perto(d.odd, c.odd))) return false;
  if ('valor' in c && !perto(d.valor, c.valor)) return false;
  for (const s of (c.contem || [])) if (!norm(d.jogo).includes(norm(s))) return false;
  return true;
};

(async () => {
  const imgs = {};
  for (const c of casos) {
    const { data: row } = await sb.from('imagens_recebidas').select('thumb_path').eq('id', c.img).single();
    const { data: blob } = await sb.storage.from('conferencia').download(row.thumb_path);
    imgs[c.img] = Buffer.from(await blob.arrayBuffer()).toString('base64');
  }

  for (const modelo of MODELOS) {
    const acertoPorRodada = [];
    const passesPorCaso = {}; casos.forEach((c) => (passesPorCaso[c.img] = 0));
    let tin = 0, tout = 0;
    for (let r = 0; r < N; r++) {
      let ok = 0;
      for (const c of casos) {
        const { dados, usage } = await transcreverImagem(imgs[c.img], 'image/jpeg', PROMPT, modelo);
        tin += usage.input_tokens; tout += usage.output_tokens;
        if (passa(c, dados)) { ok++; passesPorCaso[c.img]++; }
      }
      acertoPorRodada.push(ok);
    }
    const media = (acertoPorRodada.reduce((a, b) => a + b, 0) / N).toFixed(1);
    const usd = (tin / 1e6) * PRECO[modelo].in + (tout / 1e6) * PRECO[modelo].out;
    const instaveis = casos.filter((c) => passesPorCaso[c.img] > 0 && passesPorCaso[c.img] < N).map((c) => '#' + c.img);
    const sempreErra = casos.filter((c) => passesPorCaso[c.img] === 0).map((c) => '#' + c.img);
    console.log(`\n═══ ${PRECO[modelo].nome} — ${N} rodadas ═══`);
    console.log(`  acerto por rodada: ${acertoPorRodada.join(', ')} de ${casos.length}  → média ${media}/${casos.length}`);
    console.log(`  instáveis (às vezes erra): ${instaveis.join(', ') || 'nenhum'}`);
    console.log(`  sempre erra: ${sempreErra.join(', ') || 'nenhum'}`);
    console.log(`  custo/bilhete: $${(usd / (casos.length * N)).toFixed(5)} → proj 3000/mês: R$${(usd / (casos.length * N) * 3000 * 5.5).toFixed(2)}`);
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
