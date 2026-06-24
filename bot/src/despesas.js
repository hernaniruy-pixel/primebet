const { sb } = require('./ingest');

// Banca padrão (enquanto é mono-banca). Depois vira por sessão/banca.
let bancaIdCache = null;
async function bancaPadrao() {
  if (bancaIdCache) return bancaIdCache;
  const { data } = await sb.from('bancas').select('id').eq('slug', 'primebet').single();
  bancaIdCache = (data && data.id) || 1;
  return bancaIdCache;
}

/** Registra uma despesa (mensagem "descrição: valor" no grupo de despesas). Retorna true se inseriu (false se já existia). */
async function registrarDespesa({ grupoId, grupoNome, descricao, valor, data, msgId }) {
  const banca_id = await bancaPadrao();
  const { data: ins, error } = await sb.from('despesas').upsert({
    banca_id, grupo_id: grupoId, grupo_nome: grupoNome,
    descricao, valor, data, msg_id: msgId,
  }, { onConflict: 'msg_id', ignoreDuplicates: true }).select('id');
  if (error) { console.error('   despesa insert:', error.message); return false; }
  return !!(ins && ins.length); // vazio = já existia (duplicado ignorado)
}

module.exports = { registrarDespesa };
