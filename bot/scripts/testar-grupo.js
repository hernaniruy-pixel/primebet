#!/usr/bin/env node
// Testa o vínculo automático: dado um NOME DE GRUPO, acha o cliente no banco.
// Uso: node scripts/testar-grupo.js "🎯 CRISTIAN apostas"
const { acharClientePorGrupo } = require('../src/ingest');

(async () => {
  const nomes = process.argv.slice(2);
  if (!nomes.length) { console.error('Uso: node scripts/testar-grupo.js "<nome do grupo>" ["<outro>" ...]'); process.exit(1); }
  for (const nome of nomes) {
    const cli = await acharClientePorGrupo(nome);
    console.log(`grupo "${nome}"  ->  ${cli ? `cliente ${cli.nome} (id ${cli.id})` : '❌ nenhum cliente casou'}`);
  }
})();
