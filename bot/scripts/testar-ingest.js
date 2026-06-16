#!/usr/bin/env node
/**
 * Testa o caminho completo: transcreve a imagem -> grava na tabela apostas (Supabase).
 * Uso:
 *   node scripts/testar-ingest.js "<imagem>" <completo|odd|valor|ambos> [clienteNomeOuId] ["legenda/valor"]
 * Sem cliente informado, usa o primeiro cliente do banco (só para teste).
 */
const fs = require('fs');
const { transcreverBilhete } = require('../src/transcrever');
const { buscarClientePorNome, listarClientes, registrarBilhete } = require('../src/ingest');
const { regraPorEmoji } = require('../src/config');

const ALIAS = { completo: '⚪', branco: '⚪', odd: '⚫', preto: '⚫', valor: '🔵', azul: '🔵', ambos: '⚠️', aviso: '⚠️' };

(async () => {
  const file = process.argv[2];
  const emoji = ALIAS[(process.argv[3] || 'completo').toLowerCase()] || process.argv[3] || '⚪';
  const cliArg = process.argv[4] || '';
  const legenda = process.argv[5] || '';
  if (!file || !fs.existsSync(file)) { console.error('Imagem não encontrada:', file); process.exit(1); }
  if (!regraPorEmoji(emoji)) { console.error('Gatilho inválido. Use: completo|odd|valor|ambos'); process.exit(1); }

  // Resolve o cliente
  let cli = null;
  if (cliArg) cli = /^\d+$/.test(cliArg) ? { id: Number(cliArg), nome: '(id ' + cliArg + ')' } : await buscarClientePorNome(cliArg);
  if (!cli) { const lista = await listarClientes(5); cli = lista[0]; console.log('ℹ️  Cliente não informado — usando o primeiro do banco:', cli ? cli.nome : '(nenhum)'); }
  if (!cli) { console.error('❌ Nenhum cliente no banco. Cadastre um cliente primeiro.'); process.exit(1); }

  const base64 = fs.readFileSync(file).toString('base64');
  const lower = file.toLowerCase();
  const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

  console.log(`\nTranscrevendo + gravando para o cliente "${cli.nome}" (id ${cli.id})...`);
  const { final } = await transcreverBilhete(base64, emoji, mime, legenda);
  console.log('— Transcrição:', JSON.stringify(final));

  const aposta = await registrarBilhete(final, { clienteId: cli.id, grupoId: 'teste@g.us' });
  console.log('\n✅ Gravado na tabela apostas:');
  console.log(JSON.stringify({
    id: aposta.id, cliente_id: aposta.cliente_id, status: aposta.status,
    odd: aposta.odd, valor: aposta.valor, casa: aposta.casa, origem: aposta.origem,
    saldo_bruto: aposta.saldo_bruto, em_aberto_odd: aposta.em_aberto_odd, em_aberto_valor: aposta.em_aberto_valor,
  }, null, 2));
  console.log('\n➡️  Abra o painel (fila EM ABERTO) e veja a aposta #' + aposta.id);
})();
