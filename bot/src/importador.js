const { sb, bancaPadrao } = require('./ingest');

// Converte "2026-06-21 22:07:00" (hora BR) -> ISO com offset -03:00.
function dataBR(s) {
  if (!s) return new Date().toISOString();
  if (String(s).includes('T')) return s;
  return String(s).trim().replace(' ', 'T') + '-03:00';
}

/**
 * Importa uma lista de apostas (formato da API /api/controle do JM) para a banca PrimeBet.
 * Mapeia pelo NOME do cliente. Os saldos são recalculados pelo trigger (regras da PrimeBet).
 */
async function importarApostas(lista) {
  if (!Array.isArray(lista)) throw new Error('lista inválida');
  const banca_id = await bancaPadrao();
  const { data: cls } = await sb.from('clientes').select('id,nome');
  const map = {};
  (cls || []).forEach((c) => { map[String(c.nome).toUpperCase()] = c.id; });

  let semCliente = 0;
  const rows = [];
  for (const b of lista) {
    const nome = String(b.Nome || b.nome || '').toUpperCase();
    const cid = map[nome];
    if (!cid) { semCliente++; continue; }
    rows.push({
      banca_id, cliente_id: cid,
      data: dataBR(b.data),
      jogo: b.Jogo || b.jogo || '',
      odd: parseFloat(b.odd) || 0,
      valor: parseFloat(b.entradas) || 0,
      status: b.status || 'EM ABERTO',
      casa: b.Descarrego || b.descarrego || '',
      baixa_liquidez: !!Number(b.baixa_liquidez),
      advertido: !!Number(b.advertido),
      irregular: !!Number(b.irregular),
      advertencia: b.obs || null,
      origem: 'manual',
    });
  }

  let ok = 0, erros = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from('apostas').insert(chunk);
    if (error) { erros += chunk.length; console.error('   import lote:', error.message); }
    else ok += chunk.length;
  }
  console.log(`📥 import JM: recebidos ${lista.length}, importados ${ok}, sem cliente ${semCliente}, erros ${erros}`);
  return { recebidos: lista.length, importados: ok, semCliente, erros };
}

module.exports = { importarApostas };
