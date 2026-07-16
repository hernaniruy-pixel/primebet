const Jimp = require('jimp');
const { sb, bancaPadrao } = require('./ingest');

const BUCKET = 'conferencia';
const safe = (s) => String(s || '').replace(/[^\w.-]/g, '_');

/**
 * Miniatura JPEG para a tela de Conferência e para o último recurso da transcrição.
 * Era 720px/q72: bom para o olho humano, RUIM para a IA — em 15/07/2026 ela leu
 * "odd 120 / valor 1" e "valor 18,5" de bilhetes borrados. 1100px/q85 mantém a letra
 * miúda (odd, valor) legível, e ainda é uma fração do peso do print original.
 */
async function fazerThumb(base64) {
  const img = await Jimp.read(Buffer.from(base64, 'base64'));
  img.scaleToFit(1100, 1100).quality(85);
  return img.getBufferAsync(Jimp.MIME_JPEG);
}

/**
 * Registra TODA imagem recebida num grupo (para a tela de Conferência).
 * Faz upload da miniatura no Storage e insere a linha (ignora duplicado por msg_id).
 */
async function registrarImagemRecebida({ grupoId, grupoNome, clienteId, msgId, remetente, enviadoEm, base64, legenda = '', msgJson = null }) {
  // 1) grava a linha JÁ (rápido) — não bloqueia o processamento de eventos do WhatsApp.
  const linha = {
    banca_id: await bancaPadrao(),
    grupo_id: grupoId, grupo_nome: grupoNome, cliente_id: clienteId ?? null,
    msg_id: msgId, remetente: remetente || '', enviado_em: enviadoEm, thumb_path: null,
    legenda: legenda || null,
    msg_json: msgJson, // permite rebaixar a imagem ORIGINAL depois de um restart
  };
  let { error } = await sb.from('imagens_recebidas').upsert(linha, { onConflict: 'msg_id', ignoreDuplicates: true });
  // Se a migração 017 ainda não rodou, a coluna msg_json não existe. NÃO é motivo para
  // perder o print: grava sem ela e segue (a reação cai na miniatura até a migração).
  if (error && /msg_json/.test(error.message)) {
    console.warn('   ⚠️  coluna msg_json ausente (rode a migração 017) — registrando sem ela');
    delete linha.msg_json;
    ({ error } = await sb.from('imagens_recebidas').upsert(linha, { onConflict: 'msg_id', ignoreDuplicates: true }));
  }
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
  const cols = 'id,msg_id,grupo_id,grupo_nome,cliente_id,pedido_emoji,pedido_odd,pedido_valor,thumb_path,legenda,enviado_em';
  let { data, error } = await sb.from('imagens_recebidas')
    .select(`${cols},msg_json`).eq('pedido_status', 'pendente').limit(limite);
  if (error && /msg_json/.test(error.message)) { // migração 017 pendente
    ({ data, error } = await sb.from('imagens_recebidas').select(cols).eq('pedido_status', 'pendente').limit(limite));
  }
  if (error) { console.error('   pedidos:', error.message); return []; }
  return data || [];
}

async function marcarPedido(id, status, erro = null) {
  await sb.from('imagens_recebidas').update({ pedido_status: status, pedido_erro: erro }).eq('id', id);
}

/**
 * Mensagem original da Baileys guardada no banco. É o que permite rebaixar a imagem
 * em ALTA depois de um restart, em vez de cair na miniatura (que a IA lê errado).
 */
async function msgJsonPorMsg(msgId) {
  if (!msgId) return null;
  const { data, error } = await sb.from('imagens_recebidas').select('msg_json').eq('msg_id', msgId).maybeSingle();
  if (error) return null; // coluna ainda não existe (migração 017 pendente)
  return (data && data.msg_json) || null;
}

/** Legenda guardada para uma imagem (usada quando a reação chega depois de um restart). */
async function legendaPorMsg(msgId) {
  if (!msgId) return '';
  const { data } = await sb.from('imagens_recebidas').select('legenda').eq('msg_id', msgId).maybeSingle();
  return (data && data.legenda) || '';
}

/** Quando o cliente MANDOU o print. É a data que a aposta deve levar — não a da reação. */
async function enviadoEmPorMsg(msgId) {
  if (!msgId) return null;
  const { data } = await sb.from('imagens_recebidas').select('enviado_em').eq('msg_id', msgId).maybeSingle();
  return (data && data.enviado_em) || null;
}

/**
 * O cliente manda o print e escreve o VALOR na mensagem de baixo. Aqui grudamos esse
 * texto na última imagem daquele grupo, para que a reação encontre o valor depois.
 *
 * Só encosta em imagem que:
 *   • é do mesmo grupo;
 *   • chegou há no máximo `janelaMin` minutos (senão o texto é de outro assunto);
 *   • ainda NÃO foi reagida/lançada (aposta já gravada não muda sozinha);
 *   • ainda não tem legenda (a legenda colada na própria imagem tem prioridade).
 * Devolve a linha alterada ou null.
 *
 * A janela é CURTA de propósito: o valor vem segundos depois do print. Se fosse larga,
 * um print antigo ainda sem valor roubaria o valor destinado ao print novo — e isso
 * lançaria dinheiro na aposta errada.
 */
async function anexarTextoAUltimaImagem(grupoId, texto, janelaMin = 5) {
  if (!grupoId || !texto) return null;
  const desde = new Date(Date.now() - janelaMin * 60 * 1000).toISOString();
  const { data, error } = await sb.from('imagens_recebidas')
    .select('id,msg_id,enviado_em,legenda')
    .eq('grupo_id', grupoId).eq('reagida', false)
    .is('legenda', null)
    .gte('enviado_em', desde)
    .order('enviado_em', { ascending: false }).limit(1);
  if (error) { console.error('   legenda p/ imagem:', error.message); return null; }
  const alvo = data && data[0];
  if (!alvo) return null;
  await sb.from('imagens_recebidas').update({ legenda: texto }).eq('id', alvo.id);
  return alvo;
}

/** Já existe linha para esta mensagem? (usado pelo catch-up p/ não rebaixar imagem já registrada.) */
async function imagemJaRegistrada(msgId) {
  if (!msgId) return false;
  const { data } = await sb.from('imagens_recebidas').select('id').eq('msg_id', msgId).maybeSingle();
  return !!data;
}

/** Caminho da miniatura de uma mensagem já registrada (fallback da reação quando o
 *  bot reiniciou e a imagem original não está mais na memória). */
async function thumbPathPorMsg(msgId) {
  if (!msgId) return null;
  const { data } = await sb.from('imagens_recebidas').select('thumb_path').eq('msg_id', msgId).maybeSingle();
  return (data && data.thumb_path) || null;
}

/** Baixa a miniatura do Storage como base64 (fallback quando a msg original não está mais acessível). */
async function baixarThumbBase64(thumbPath) {
  if (!thumbPath) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(thumbPath);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString('base64');
}

// Início (em UTC real) da SEGUNDA-FEIRA da SEMANA PASSADA, no fuso BR (UTC-3).
// Tudo antes disso é "mais de 2 semanas" (mantém: semana atual + semana anterior).
function corteDuasSemanas() {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // campos UTC = hora de parede BR
  const dow = d.getUTCDay();                          // 0=dom..6=sab
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7) - 7); // segunda da semana passada
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString(); // volta p/ instante UTC real
}

/**
 * Apaga as imagens da Conferência com mais de 2 semanas (banco + miniatura no Storage).
 * Mantém só a semana atual + a anterior — alivia o banco/Storage de dados desnecessários.
 */
async function limparImagensAntigas() {
  const corte = corteDuasSemanas();
  const { data, error } = await sb.from('imagens_recebidas').select('id,thumb_path').lt('enviado_em', corte).limit(5000);
  if (error) { console.error('   limpeza conferência:', error.message); return 0; }
  if (!data || !data.length) return 0;
  const paths = data.map((r) => r.thumb_path).filter(Boolean);
  if (paths.length) { try { await sb.storage.from(BUCKET).remove(paths); } catch (e) { console.error('   limpeza storage:', e.message); } }
  await sb.from('imagens_recebidas').delete().in('id', data.map((r) => r.id));
  console.log(`🧹 Conferência: ${data.length} imagens com +2 semanas removidas (corte ${corte.slice(0, 10)})`);
  return data.length;
}

module.exports = {
  registrarImagemRecebida, marcarReagida,
  listarPedidosPendentes, marcarPedido, baixarThumbBase64, thumbPathPorMsg,
  legendaPorMsg, anexarTextoAUltimaImagem, msgJsonPorMsg, enviadoEmPorMsg,
  limparImagensAntigas, imagemJaRegistrada,
};
