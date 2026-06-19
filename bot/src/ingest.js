require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  // Não derruba o require; só avisa. Quem usar registrarBilhete vai receber erro claro.
  console.warn('⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env');
}
const sb = createClient(URL || '', KEY || '', { auth: { persistSession: false } });

// Banca padrão (enquanto é mono-banca: PrimeBet). Depois vira por sessão.
let _bancaId = null;
async function bancaPadrao() {
  if (_bancaId) return _bancaId;
  const { data } = await sb.from('bancas').select('id').eq('slug', 'primebet').single();
  _bancaId = (data && data.id) || 1;
  return _bancaId;
}

/** Busca um cliente pelo NOME (case-insensitive). Retorna {id, nome} ou null. */
async function buscarClientePorNome(nome) {
  const { data, error } = await sb.from('clientes').select('id,nome').ilike('nome', String(nome)).limit(1);
  if (error) throw new Error('Erro buscando cliente: ' + error.message);
  return data && data[0] ? data[0] : null;
}

/** Lista clientes (para mapeamento/teste). */
async function listarClientes(limit = 20) {
  const { data, error } = await sb.from('clientes').select('id,nome').order('nome').limit(limit);
  if (error) throw new Error('Erro listando clientes: ' + error.message);
  return data || [];
}

/**
 * Grava o bilhete transcrito na fila do painel (tabela apostas, EM ABERTO).
 * `final` = { jogo, odd, valor, casa }  (null em odd/valor => entra como 0 = "em aberto")
 * `meta`  = { clienteId, grupoId }
 * O trigger calc_aposta no banco já calcula saldo bruto/comissão/líquido.
 */
async function registrarBilhete(final, { clienteId, grupoId = null }) {
  if (!clienteId) throw new Error('registrarBilhete: clienteId é obrigatório');
  const row = {
    banca_id: await bancaPadrao(),
    cliente_id: clienteId,
    jogo: final.jogo || '',
    odd: final.odd == null ? 0 : Number(final.odd),
    valor: final.valor == null ? 0 : Number(final.valor),
    status: 'EM ABERTO',
    casa: final.casa || '',
    origem: 'whatsapp',
    grupo_id: grupoId,
  };
  const { data, error } = await sb.from('apostas').insert(row).select().single();
  if (error) throw new Error('Erro gravando aposta: ' + error.message);
  return data;
}

// Normaliza nome para comparação (maiúsculas, sem acento, só letras/números).
const normNome = (s) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

/**
 * Acha o cliente correspondente ao NOME DO GRUPO (vínculo automático).
 * Ex.: grupo "🎯 CRISTIAN apostas" -> cliente "CRISTIAN".
 * Retorna {id, nome} do melhor casamento, ou null.
 */
async function acharClientePorGrupo(nomeGrupo) {
  const alvo = normNome(nomeGrupo);
  if (!alvo) return null;
  const cls = await listarClientes(2000);
  let best = null;
  for (const c of cls) {
    const n = normNome(c.nome);
    if (n && alvo.includes(n)) {
      if (!best || n.length > normNome(best.nome).length) best = c; // prefere o nome mais específico
    }
  }
  return best;
}

module.exports = { sb, bancaPadrao, buscarClientePorNome, listarClientes, registrarBilhete, acharClientePorGrupo };
