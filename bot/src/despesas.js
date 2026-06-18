const { sb } = require('./ingest');

// Banca padrão (enquanto é mono-banca). Depois vira por sessão/banca.
let bancaIdCache = null;
async function bancaPadrao() {
  if (bancaIdCache) return bancaIdCache;
  const { data } = await sb.from('bancas').select('id').eq('slug', 'primebet').single();
  bancaIdCache = (data && data.id) || 1;
  return bancaIdCache;
}

/** Registra uma despesa (mensagem "descrição: valor" no grupo de despesas). */
async function registrarDespesa({ grupoId, grupoNome, descricao, valor, data, msgId }) {
  const banca_id = await bancaPadrao();
  const { error } = await sb.from('despesas').upsert({
    banca_id, grupo_id: grupoId, grupo_nome: grupoNome,
    descricao, valor, data, msg_id: msgId,
  }, { onConflict: 'msg_id', ignoreDuplicates: true });
  if (error) console.error('   despesa insert:', error.message);
}

module.exports = { registrarDespesa };
