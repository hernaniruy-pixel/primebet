// Compara MODELOS de transcrição (Haiku vs Sonnet) no MESMO conjunto de bilhetes reais,
// com o prompt de produção. Decisão de qual modelo usar vira número, não achismo.
//
//   node tests/comparar-modelos.js
//
// Custo: roda cada bilhete 1x por modelo. Sonnet é ~3x o preço do Haiku por token, mas
// ainda centavos por bilhete — e a decisão é única.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { transcreverImagem, PROMPT } = require('../src/transcrever');

const MODELOS = ['claude-haiku-4-5-20251001', 'claude-sonnet-5'];
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const casos = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos.json'), 'utf8'));

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const perto = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.02;

function avaliar(caso, dados) {
  const falhas = [];
  if ('odd' in caso && !(caso.odd === null ? dados.odd == null : perto(dados.odd, caso.odd))) falhas.push(`odd=${dados.odd}≠${caso.odd}`);
  if ('valor' in caso && !(caso.valor === null ? dados.valor == null : perto(dados.valor, caso.valor))) falhas.push(`valor=${dados.valor}≠${caso.valor}`);
  const j = norm(dados.jogo);
  for (const s of (caso.contem || [])) if (!j.includes(norm(s))) falhas.push(`faltou "${s}"`);
  return { ok: falhas.length === 0, falhas };
}

async function baixar(imgId) {
  const { data: row } = await sb.from('imagens_recebidas').select('thumb_path').eq('id', imgId).single();
  const { data: blob, error } = await sb.storage.from('conferencia').download(row.thumb_path);
  if (error) throw error;
  return Buffer.from(await blob.arrayBuffer()).toString('base64');
}

(async () => {
  console.log(`Baixando ${casos.length} bilhetes...`);
  const imgs = {};
  for (const c of casos) imgs[c.img] = await baixar(c.img);

  const placar = {};
  for (const modelo of MODELOS) {
    let acertos = 0;
    console.log(`\n════════ ${modelo} ════════`);
    for (const caso of casos) {
      let dados;
      try { ({ dados } = await transcreverImagem(imgs[caso.img], 'image/jpeg', PROMPT, modelo)); }
      catch (e) { console.log(`✗ #${caso.img} ERRO: ${e.message}`); continue; }
      const r = avaliar(caso, dados);
      if (r.ok) { acertos++; console.log(`✓ #${caso.img} ${caso.nota}`); }
      else console.log(`✗ #${caso.img} ${caso.nota}\n    ${r.falhas.join(' | ')}`);
    }
    placar[modelo] = acertos;
    console.log(`  NOTA: ${acertos}/${casos.length}`);
  }

  console.log(`\n════════ PLACAR ════════`);
  for (const m of MODELOS) console.log(`  ${m.padEnd(28)} ${placar[m]}/${casos.length}`);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
