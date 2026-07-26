// BANCO DE TESTE da transcrição — roda TODOS os bilhetes de casos.json contra uma (ou
// as duas) versões do prompt e dá uma NOTA. Assim toda mudança de prompt é medida no
// conjunto inteiro antes de subir — acaba o "consertou um, quebrou outros".
//
// Uso:
//   node tests/rodar.js            -> compara prompt ATUAL vs ENXUTO
//   node tests/rodar.js atual      -> só o prompt atual (produção)
//   node tests/rodar.js enxuto     -> só o enxuto (baseline bom de antes)
//
// Cada caso em casos.json:
//   { "img": <id imagens_recebidas>, "nota": "...",
//     "odd": <n|null>, "valor": <n opcional>, "contem": [strings], "naoContem": [strings] }
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { transcreverImagem, PROMPT } = require('../src/transcrever');
const { PROMPT_ENXUTO } = require('./prompt-enxuto');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const casos = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos.json'), 'utf8'));

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const perto = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.02;

async function baixar(imgId) {
  const { data: row } = await sb.from('imagens_recebidas').select('thumb_path,legenda').eq('id', imgId).single();
  if (!row || !row.thumb_path) throw new Error('img ' + imgId + ' sem thumb');
  const { data: blob, error } = await sb.storage.from('conferencia').download(row.thumb_path);
  if (error) throw error;
  return { b64: Buffer.from(await blob.arrayBuffer()).toString('base64'), legenda: row.legenda || '' };
}

// Avalia um caso contra um resultado da IA. Retorna { ok, falhas:[...] }.
function avaliar(caso, dados) {
  const falhas = [];
  if ('odd' in caso) { if (!(caso.odd === null ? dados.odd == null : perto(dados.odd, caso.odd))) falhas.push(`odd=${dados.odd} (esperava ${caso.odd})`); }
  if ('valor' in caso) { if (!(caso.valor === null ? dados.valor == null : perto(dados.valor, caso.valor))) falhas.push(`valor=${dados.valor} (esperava ${caso.valor})`); }
  const j = norm(dados.jogo);
  for (const s of (caso.contem || [])) if (!j.includes(norm(s))) falhas.push(`faltou "${s}"`);
  for (const s of (caso.naoContem || [])) if (j.includes(norm(s))) falhas.push(`nao devia ter "${s}"`);
  return { ok: falhas.length === 0, falhas };
}

async function rodarPrompt(nome, prompt, imgs) {
  let acertos = 0;
  console.log(`\n════════ PROMPT ${nome.toUpperCase()} ════════`);
  for (const caso of casos) {
    const { b64 } = imgs[caso.img];
    let dados;
    try { ({ dados } = await transcreverImagem(b64, 'image/jpeg', prompt)); }
    catch (e) { console.log(`✗ #${caso.img} ${caso.nota}\n    ERRO: ${e.message}`); continue; }
    const r = avaliar(caso, dados);
    if (r.ok) { acertos++; console.log(`✓ #${caso.img} ${caso.nota}`); }
    else { console.log(`✗ #${caso.img} ${caso.nota}\n    ${r.falhas.join(' | ')}\n    leu: ${String(dados.jogo).replace(/\n/g, ' / ').slice(0, 90)} [odd=${dados.odd} val=${dados.valor}]`); }
  }
  console.log(`\n  NOTA ${nome}: ${acertos}/${casos.length}`);
  return acertos;
}

(async () => {
  const modo = process.argv[2] || 'ambos';
  console.log(`Baixando ${casos.length} bilhetes de teste...`);
  const imgs = {};
  for (const c of casos) imgs[c.img] = await baixar(c.img);

  const res = {};
  if (modo === 'atual' || modo === 'ambos') res.atual = await rodarPrompt('atual', PROMPT, imgs);
  if (modo === 'enxuto' || modo === 'ambos') res.enxuto = await rodarPrompt('enxuto', PROMPT_ENXUTO, imgs);

  if (modo === 'ambos') {
    console.log(`\n════════ PLACAR ════════`);
    console.log(`  atual : ${res.atual}/${casos.length}`);
    console.log(`  enxuto: ${res.enxuto}/${casos.length}`);
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
