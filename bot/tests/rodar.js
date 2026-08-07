// BANCO DE TESTE da transcrição — roda os bilhetes de casos-fixtures.json e dá uma NOTA.
// Assim toda mudança de prompt é medida no conjunto inteiro antes de subir — acaba o
// "consertou um, quebrou outros".
//
// As imagens de teste ficam em tests/fixtures/*.jpg (VERSIONADAS no git) — antes o banco
// apontava p/ linhas de imagens_recebidas do Supabase, que a limpeza automática apaga
// (+2 semanas) → os casos sumiam. Fixture em arquivo nunca é purgada e roda offline
// (só precisa da ANTHROPIC_API_KEY do .env).
//
// Uso:
//   node tests/rodar.js            -> compara prompt ATUAL vs ENXUTO (só casos simples)
//   node tests/rodar.js atual      -> só o prompt atual (produção) — inclui multi-bilhete
//   node tests/rodar.js enxuto     -> só o enxuto (baseline; pula casos multi-bilhete)
//
// Cada caso em casos-fixtures.json:
//   { "arquivo": "x.jpg", "nota": "...", "odd": n|null, "valor": n?, "contem":[], "naoContem":[] }
//   Multi-bilhete (2+ apostas numa imagem):
//   { "arquivo": "x.jpg", "legenda": "500 125", "apostas": [ {odd,valor,contem,naoContem}, ... ] }
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { transcreverImagem, transcreverBilhetes, PROMPT } = require('../src/transcrever');
const { PROMPT_ENXUTO } = require('./prompt-enxuto');

const casos = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos-fixtures.json'), 'utf8'));
const FIX = path.join(__dirname, 'fixtures');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const perto = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.02;

// Carrega a imagem do caso: arquivo local (padrão) — base64.
function imagemDoCaso(caso) {
  if (!caso.arquivo) throw new Error(`caso "${caso.nota}" sem "arquivo"`);
  const p = path.join(FIX, caso.arquivo);
  if (!fs.existsSync(p)) throw new Error(`fixture não encontrada: ${caso.arquivo}`);
  return fs.readFileSync(p).toString('base64');
}

// Confere odd/valor/contem/naoContem de UM resultado (dados ou aposta) contra um gabarito.
function conferir(gab, d) {
  const f = [];
  if ('odd' in gab) if (!(gab.odd === null ? d.odd == null : perto(d.odd, gab.odd))) f.push(`odd=${d.odd} (esp ${gab.odd})`);
  if ('valor' in gab) if (!(gab.valor === null ? d.valor == null : perto(d.valor, gab.valor))) f.push(`valor=${d.valor} (esp ${gab.valor})`);
  const j = norm(d.jogo);
  for (const s of (gab.contem || [])) if (!j.includes(norm(s))) f.push(`faltou "${s}"`);
  for (const s of (gab.naoContem || [])) if (j.includes(norm(s))) f.push(`nao devia ter "${s}"`);
  return f;
}

// Caso multi-bilhete: usa transcreverBilhetes (prompt de PRODUÇÃO) + legenda, e confere
// a LISTA de apostas (contagem + cada uma na ordem). Só roda no prompt atual.
async function avaliarMulti(caso, b64) {
  const { finais } = await transcreverBilhetes(b64, '⚪', 'image/jpeg', caso.legenda || '');
  const falhas = [];
  if (finais.length !== caso.apostas.length) falhas.push(`nº de apostas=${finais.length} (esp ${caso.apostas.length})`);
  for (let i = 0; i < caso.apostas.length; i++) {
    const d = finais[i];
    if (!d) { falhas.push(`aposta ${i + 1} ausente`); continue; }
    conferir(caso.apostas[i], d).forEach((x) => falhas.push(`ap${i + 1}: ${x}`));
  }
  return { falhas, resumo: finais.map((d, i) => `#${i + 1}[odd=${d.odd} val=${d.valor}] ${String(d.jogo).replace(/\n/g, ' ').slice(0, 50)}`).join('  ||  ') };
}

async function rodarPrompt(nome, prompt, imgs) {
  let acertos = 0, rodados = 0;
  console.log(`\n════════ PROMPT ${nome.toUpperCase()} ════════`);
  for (const caso of casos) {
    const b64 = imgs[caso.arquivo];
    // Multi-bilhete só faz sentido no prompt de produção (a função usa o PROMPT interno).
    if (caso.apostas) {
      if (nome === 'enxuto') { console.log(`· #${caso.arquivo} ${caso.nota} (pulado no enxuto)`); continue; }
      rodados++;
      let r; try { r = await avaliarMulti(caso, b64); } catch (e) { console.log(`✗ ${caso.arquivo} — ERRO: ${e.message}`); continue; }
      if (!r.falhas.length) { acertos++; console.log(`✓ ${caso.arquivo} ${caso.nota}`); }
      else console.log(`✗ ${caso.arquivo} ${caso.nota}\n    ${r.falhas.join(' | ')}\n    leu: ${r.resumo}`);
      continue;
    }
    rodados++;
    let dados;
    try { ({ dados } = await transcreverImagem(b64, 'image/jpeg', prompt)); }
    catch (e) { console.log(`✗ ${caso.arquivo} ${caso.nota}\n    ERRO: ${e.message}`); continue; }
    const falhas = conferir(caso, dados);
    if (!falhas.length) { acertos++; console.log(`✓ ${caso.arquivo} ${caso.nota}`); }
    else console.log(`✗ ${caso.arquivo} ${caso.nota}\n    ${falhas.join(' | ')}\n    leu: ${String(dados.jogo).replace(/\n/g, ' / ').slice(0, 90)} [odd=${dados.odd} val=${dados.valor}]`);
  }
  console.log(`\n  NOTA ${nome}: ${acertos}/${rodados}`);
  return { acertos, rodados };
}

(async () => {
  const modo = process.argv[2] || 'ambos';
  console.log(`Carregando ${casos.length} bilhetes de tests/fixtures...`);
  const imgs = {};
  for (const c of casos) imgs[c.arquivo] = imagemDoCaso(c);

  const res = {};
  if (modo === 'atual' || modo === 'ambos') res.atual = await rodarPrompt('atual', PROMPT, imgs);
  if (modo === 'enxuto' || modo === 'ambos') res.enxuto = await rodarPrompt('enxuto', PROMPT_ENXUTO, imgs);

  if (modo === 'ambos') {
    console.log(`\n════════ PLACAR ════════`);
    console.log(`  atual : ${res.atual.acertos}/${res.atual.rodados}`);
    console.log(`  enxuto: ${res.enxuto.acertos}/${res.enxuto.rodados} (casos multi-bilhete pulados)`);
  }
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
