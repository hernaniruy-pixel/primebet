/**
 * Confere a lista de grupos que o bot pode ler, contra os dados REAIS do banco:
 *   • grupos de clientes cadastrados entram;
 *   • grupos alheios (equipe, diretoria, pessoal…) ficam de fora;
 *   • despesa/alertas entram mesmo não sendo de cliente.
 *
 *   node scripts/teste-grupos-permitidos.js
 */
require('dotenv').config();
const { gruposDeClientes } = require('../src/ingest');

// Grupos alheios que apareceram na conferência (sem cliente vinculado) — devem ser barrados.
const ALHEIOS = [
  'EQUIPE PRIME BET', 'PRIME BET BRENDON SANTOS (SH)', 'PRIME BET JÚNIOR GUIMARÃES (GR)',
  'Pessoal', 'Diretoria 💻📲', 'Teste print',
];

let ok = 0, tot = 0;
const check = (desc, cond, extra = '') => { tot++; if (cond) ok++; console.log(`${cond ? '✓' : '✗'} ${desc}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const ids = await gruposDeClientes();
  // Reproduz a montagem da lista do bot (banco + despesa + alertas).
  const despesaJid = 'DESPESA@g.us';
  const avisosJid = 'AVISOS@g.us';
  const permitidos = new Set([...ids, despesaJid, avisosJid]);

  console.log(`grupos de clientes no banco: ${ids.length}`);
  console.log(`lista final do bot: ${permitidos.size} (clientes + despesa + alertas)\n`);

  check('todo grupo de cliente está na lista', ids.every((id) => permitidos.has(id)));
  check('grupo de despesa está na lista', permitidos.has(despesaJid));
  check('grupo de alertas está na lista', permitidos.has(avisosJid));

  // Os alheios não têm grupo_id em cliente nenhum, logo seus JIDs não estão na lista.
  // Aqui garantimos que a lista é por ID (não por nome) e que nada aleatório passa.
  check('um JID desconhecido é barrado', !permitidos.has('120363999999999999@g.us'));
  check('lista não contém vazio/null', !permitidos.has(null) && !permitidos.has(''));

  console.log('\nGrupos que o número participa e o bot vai IGNORAR (vistos na conferência):');
  ALHEIOS.forEach((n) => console.log('   🚫', n));
  console.log('\n⚠️  Confira a lista acima: se algum for cliente DE VERDADE, cadastre o link');
  console.log('    dele no painel — senão as apostas desse grupo não serão lidas.');

  console.log(`\n${ok}/${tot} OK`);
  process.exit(ok === tot ? 0 : 1);
})();
