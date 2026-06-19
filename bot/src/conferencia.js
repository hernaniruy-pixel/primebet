const Jimp = require('jimp');
const { sb, bancaPadrao } = require('./ingest');

const BUCKET = 'conferencia';
const safe = (s) => String(s || '').replace(/[^\w.-]/g, '_');

/** Gera uma miniatura JPEG (~720px, qualidade 72) — leve, mas legível (dá pra ler odds/valores). */
async function fazerThumb(base64) {
  const img = await Jimp.read(Buffer.from(base64, 'base64'));
  img.scaleToFit(720, 720).quality(72);
  return img.getBufferAsync(Jimp.MIME_JPEG);
}

/**
 * Registra TODA imagem recebida num grupo (para a tela de Conferência).
 * Faz upload da miniatura no Storage e insere a linha (ignora duplicado por msg_id).
 */
async function registrarImagemRecebida({ grupoId, grupoNome, clienteId, msgId, remetente, enviadoEm, base64 }) {
  // 1) grava a linha JÁ (rápido) — não bloqueia o processamento de eventos do WhatsApp.
  const { error } = await sb.from('imagens_recebidas').upsert({
    banca_id: await bancaPadrao(),
    grupo_id: grupoId, grupo_nome: grupoNome, cliente_id: clienteId ?? null,
    msg_id: msgId, remetente: remetente || '', enviado_em: enviadoEm, thumb_path: null,
  }, { onConflict: 'msg_id', ignoreDuplicates: true });
  if (error) { console.error('   conferencia insert:', error.message); return; }

  // 2) miniatura em SEGUNDO PLANO (jimp é pesado; não segura a fila de reações/pedidos).
  if (base64) gerarEAnexarThumb(grupoId, msgId, base64).catch((e) => console.error('   thumb bg:', e.message));
}

async function gerarEAnexarThumb(grupoId, msgId, base64) {
  const thumb = await fazerThumb(base64);
  const thumb_path = `${safe(grupoId)}/${safe(msgId)}.jpg`;
  const up = await sb.storage.from(BUCKET).upload(thumb_path, thumb, { contentType: 'image/jpeg', upsert: true });
  if (up.error) { console.error('   thumb upload:', up.error.message); return; }
  await sb.from('imagens_recebidas').update({ thumb_path }).eq('msg_id', msgId);
}

/** Marca a imagem como reagida/lançada quando a reação dispara a transcrição. */
async function marcarReagida(msgId, { apostaId = null, emoji = '', grupoId, grupoNome, clienteId } = {}) {
  const { data } = await sb.from('imagens_recebidas').select('id').eq('msg_id', msgId).maybeSingle();
  const patch = { reagida: true, lancada: !!apostaId, aposta_id: apostaId, emoji };
  if (data) {
    await sb.from('imagens_recebidas').update(patch).eq('msg_id', msgId);
  } else {
    // Reação chegou mas a imagem não tinha sido capturada (bot estava off). Cria a linha mesmo assim.
    await sb.from('imagens_recebidas').upsert({
      banca_id: await bancaPadrao(),
      msg_id: msgId, grupo_id: grupoId || '', grupo_nome: grupoNome || '', cliente_id: clienteId ?? null,
      enviado_em: new Date().toISOString(), ...patch,
    }, { onConflict: 'msg_id' });
  }
}

/** Pedidos de "lançar do dashboard" ainda pendentes (o operador clicou Lançar no painel). */
async function listarPedidosPendentes(limite = 5) {
  const { data, error } = await sb.from('imagens_recebidas')
    .select('id,msg_id,grupo_id,grupo_nome,cliente_id,pedido_emoji,pedido_odd,pedido_valor,thumb_path')
    .eq('pedido_status', 'pendente').limit(limite);
  if (error) { console.error('   pedidos:', error.message); return []; }
  return data || [];
}

async function marcarPedido(id, status, erro = null) {
  await sb.from('imagens_recebidas').update({ pedido_status: status, pedido_erro: erro }).eq('id', id);
}

/** Baixa a miniatura do Storage como base64 (fallback quando a msg original não está mais acessível). */
async function baixarThumbBase64(thumbPath) {
  if (!thumbPath) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(thumbPath);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString('base64');
}

module.exports = {
  registrarImagemRecebida, marcarReagida,
  listarPedidosPendentes, marcarPedido, baixarThumbBase64,
};
