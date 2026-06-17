#!/usr/bin/env node
// Cria (ou reaproveita) um cliente pelo nome e confirma o vínculo com um nome de grupo.
// Uso: node scripts/criar-cliente.js "Teste" "Teste print"
const { sb, buscarClientePorNome, acharClientePorGrupo } = require('../src/ingest');

(async () => {
  const nome = process.argv[2];
  const grupo = process.argv[3];
  if (!nome) { console.error('Uso: node scripts/criar-cliente.js "<nome>" ["<nome do grupo>"]'); process.exit(1); }

  let cli = await buscarClientePorNome(nome);
  if (cli) {
    console.log(`ℹ️  Cliente já existe: ${cli.nome} (id ${cli.id})`);
  } else {
    const { data, error } = await sb.from('clientes').insert({ nome }).select().single();
    if (error) { console.error('❌ Erro criando cliente:', error.message); process.exit(1); }
    cli = data;
    console.log(`✅ Cliente criado: ${cli.nome} (id ${cli.id})`);
  }

  if (grupo) {
    const casado = await acharClientePorGrupo(grupo);
    console.log(`🔗 grupo "${grupo}"  ->  ${casado ? `cliente ${casado.nome} (id ${casado.id})` : '❌ nenhum cliente casou'}`);
  }
})();
