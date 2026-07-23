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
 * `meta`  = { clienteId, grupoId, enviadoEm }
 * O trigger calc_aposta no banco já calcula saldo bruto/comissão/líquido.
 *
 * `enviadoEm` = quando o CLIENTE mandou o print no grupo. Sem ele o banco usava o
 * now() do INSERT, ou seja, a hora em que o operador reagiu — e a aposta ficava com
 * a hora errada (vimos 76 min de diferença). A aposta pertence ao momento do bilhete.
 */
async function registrarBilhete(final, { clienteId, grupoId = null, enviadoEm = null }) {
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
    // Tabela de odds marcada à mão: sinaliza p/ o operador conferir a seleção/odd no
    // print (a leitura de círculo torto não é confiável) em vez de deixar passar errado.
    ...(final.revisar ? { advertido: true, advertencia: '⚠️ Tabela de odds marcada à mão — confira a SELEÇÃO e a ODD no print antes de concluir.' } : {}),
    ...(enviadoEm ? { data: enviadoEm } : {}),
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

/**
 * Acha o cliente do grupo: primeiro pelo ID do grupo (vínculo explícito, assertivo),
 * depois cai no match por NOME (reserva).
 */
async function acharCliente(grupoId, nomeGrupo) {
  if (grupoId) {
    // limit(2) de propósito: se DOIS clientes apontam para o mesmo grupo, o banco
    // devolve um deles sem critério — as apostas cairiam na conta errada em silêncio.
    // Melhor gritar no log do que escolher no escuro.
    const { data } = await sb.from('clientes').select('id,nome').eq('grupo_id', grupoId).order('id').limit(2);
    if (data && data.length > 1) {
      console.log(`⚠️  CADASTRO DUPLICADO: o grupo ${grupoId} está em ${data.length} clientes (${data.map((c) => '#' + c.id + ' ' + c.nome).join(', ')}). Usando ${data[0].nome} — corrija no painel, as apostas do outro NÃO estão sendo lançadas.`);
    }
    if (data && data[0]) return data[0];
  }
  return acharClientePorGrupo(nomeGrupo);
}

/** IDs dos grupos vinculados a clientes — a lista do que o bot PODE ler. */
async function gruposDeClientes() {
  const { data, error } = await sb.from('clientes').select('grupo_id').not('grupo_id', 'is', null).limit(2000);
  if (error) { console.error('   grupos de clientes:', error.message); return []; }
  return (data || []).map((c) => c.grupo_id).filter(Boolean);
}

/** Clientes com link de grupo colado mas ainda NÃO resolvido (grupo_id nulo). */
async function vinculosPendentes() {
  const { data } = await sb.from('clientes').select('id,grupo_link').not('grupo_link', 'is', null).is('grupo_id', null).limit(20);
  return data || [];
}

async function salvarGrupoId(clienteId, grupoId) {
  await sb.from('clientes').update({ grupo_id: grupoId }).eq('id', clienteId);
}

module.exports = {
  sb, bancaPadrao, buscarClientePorNome, listarClientes, registrarBilhete,
  acharClientePorGrupo, acharCliente, vinculosPendentes, salvarGrupoId, gruposDeClientes,
};
