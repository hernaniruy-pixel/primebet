const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { AUTH_PATH, regraPorEmoji, OPERADORES } = require('./config');
const { transcreverBilhete } = require('./transcrever');
const { parseValor } = require('./valor');
const { registrarBilhete, acharCliente, vinculosPendentes, salvarGrupoId } = require('./ingest');
const { registrarImagemRecebida, marcarReagida, listarPedidosPendentes, marcarPedido, baixarThumbBase64 } = require('./conferencia');
const { registrarDespesa } = require('./despesas');

/** Grupo "despesa": mensagem "descrição: valor" -> grava despesa com a data da mensagem. */
async function tratarDespesa(msg, chat, nomeGrupo) {
  const body = (msg.body || '').trim();
  console.log(`💬 grupo despesa "${nomeGrupo}" | msg: "${body}"`);
  const idx = body.lastIndexOf(':');
  if (idx < 1) { console.log('   ↳ ignorada: sem ":" (use "descrição: valor")'); return; }
  const descricao = body.slice(0, idx).trim();
  const valor = parseValor(body.slice(idx + 1));
  if (!descricao || valor == null) { console.log('   ↳ ignorada: descrição/valor inválido'); return; }
  await registrarDespesa({
    grupoId: chat.id._serialized, grupoNome: nomeGrupo,
    descricao, valor,
    data: new Date((msg.timestamp || Date.now() / 1000) * 1000).toISOString(),
    msgId: msg.id._serialized,
  });
  console.log(`💸 despesa registrada | "${descricao}" R$ ${valor} | grupo "${nomeGrupo}"`);
}

// Odd digitada (dashboard) -> número, ou null se vazia/ inválida.
function parseOdd(t) {
  if (t == null || String(t).trim() === '') return null;
  const n = parseFloat(String(t).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/**
 * Caminho ÚNICO de lançamento (reação no WhatsApp OU "Lançar" no dashboard).
 * Transcreve a imagem completa; os campos que o emoji deixa "em aberto" recebem o
 * valor MANUAL digitado (dashboard) ou ficam null (operador preenche depois).
 * Assim a reação e o dashboard se comportam IGUAL para o mesmo emoji.
 */
async function lancarAposta({ base64, mime, emoji, legenda = '', oddManual = null, valorManual = null, clienteId, grupoId, grupoNome, msgId, msgParaReagir = null }) {
  const regra = regraPorEmoji(emoji) || { emoji, mascara: [] };
  const { bruto, final } = await transcreverBilhete(base64, '⚪', mime, legenda); // lê tudo; valor da legenda aplicado
  if (regra.mascara.includes('odd')) final.odd = parseOdd(oddManual);            // em aberto: manual ou null
  if (regra.mascara.includes('valor')) final.valor = parseValor(valorManual);    // em aberto: manual ou null
  const aposta = await registrarBilhete(final, { clienteId, grupoId });
  await marcarReagida(msgId, { apostaId: aposta.id, emoji: regra.emoji, grupoId, grupoNome, clienteId });
  if (msgParaReagir) { try { await msgParaReagir.react(regra.emoji); } catch (e) { console.log('   (não consegui reagir na imagem do grupo:', e.message, ')'); } }
  return { bruto, aposta };
}

/**
 * Conecta como "aparelho conectado" (WhatsApp Web) de UMA conta que é membro dos grupos.
 * Fluxo: operador reage à imagem com ⚪/⚫/🔵/⚠️ -> bot baixa a imagem + lê a legenda ->
 *        transcreve -> acha o cliente pelo NOME DO GRUPO -> grava EM ABERTO no Supabase.
 *
 * ATENÇÃO: automação não-oficial do WhatsApp contraria os Termos e pode banir a conta.
 * O bot praticamente só LÊ; a única escrita é uma REAÇÃO (emoji) quando se lança pelo
 * dashboard — risco baixo (não envia mensagens). Prefira um número dedicado.
 */
function iniciarWhatsApp() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  client.on('qr', (qr) => {
    console.log('\n📱 Escaneie o QR no WhatsApp do número do BOT (Configurações → Aparelhos conectados → Conectar um aparelho):\n');
    qrcode.generate(qr, { small: true });
    // Salva também como PNG na Área de Trabalho — fácil de abrir e enviar pro sócio.
    try {
      const QRImage = require('qrcode');
      const out = require('path').join(require('os').homedir(), 'Desktop', 'primebet-qr.png');
      QRImage.toFile(out, qr, { width: 480, margin: 2 }, (err) => {
        if (err) console.log('   (não consegui salvar o PNG do QR:', err.message, ')');
        else console.log('   🖼  QR salvo em:', out, '\n      Abra e mande pro sócio escanear. Expira em ~30s; quando renovar, esse arquivo é atualizado.');
      });
    } catch (e) { /* sem o pacote qrcode, segue só com o ASCII acima */ }
  });
  client.on('authenticated', () => console.log('🔐 Autenticado.'));
  client.on('ready', () => { console.log('✅ Bot conectado e ouvindo reações nos grupos.'); iniciarPollerPedidos(client); });
  client.on('disconnected', (r) => console.log('⚠️  Desconectado:', r));

  // Mensagens enviadas pelo PRÓPRIO número do bot (o evento 'message' não as cobre).
  // Cobre o caso de lançar despesa pelo número que está conectado.
  client.on('message_create', async (msg) => {
    try {
      if (!msg.fromMe) return; // de terceiros já é tratado em 'message'
      const chat = await msg.getChat();
      if (!chat.isGroup) return;
      const nomeGrupo = chat.name || '';
      if (/despesa/i.test(nomeGrupo)) await tratarDespesa(msg, chat, nomeGrupo);
    } catch (e) {
      console.error('❌ Erro (message_create despesa):', e.message);
    }
  });

  // Mensagens de grupo: DESPESAS (texto "descrição: valor" no grupo "despesa")
  // e CONFERÊNCIA (toda imagem recebida nos demais grupos).
  client.on('message', async (msg) => {
    try {
      const chat = await msg.getChat();
      if (!chat.isGroup) return;
      const nomeGrupo = chat.name || '';

      // Grupo de DESPESAS: captura texto "descrição: valor" (lança automático).
      if (/despesa/i.test(nomeGrupo)) { await tratarDespesa(msg, chat, nomeGrupo); return; }

      // Demais grupos: só imagens, para a conferência.
      if (!msg.hasMedia || msg.type !== 'image') return;
      const media = await msg.downloadMedia();
      if (!media || !String(media.mimetype).startsWith('image/')) return;

      const cli = await acharCliente(chat.id._serialized, nomeGrupo);
      const contato = await msg.getContact().catch(() => null);
      const remetente = (contato && (contato.pushname || contato.number)) || msg.author || '';

      await registrarImagemRecebida({
        grupoId: chat.id._serialized,
        grupoNome: nomeGrupo,
        clienteId: cli ? cli.id : null,
        msgId: msg.id._serialized,
        remetente,
        enviadoEm: new Date((msg.timestamp || Date.now() / 1000) * 1000).toISOString(),
        base64: media.data,
      });
      console.log(`🗂  imagem registrada p/ conferência | grupo "${nomeGrupo}"${cli ? '' : ' (⚠️ SEM cliente)'}`);
    } catch (e) {
      console.error('❌ Erro ao registrar imagem (conferência):', e.message);
    }
  });

  client.on('message_reaction', async (reaction) => {
    try {
      const emojiRecebido = reaction.reaction || '(reação removida)';
      const chatId = reaction.id && reaction.id.remote;
      // DIAGNÓSTICO: registra TODA reação que chega (ajuda a depurar gatilhos que "não funcionam").
      console.log(`👀 reação "${emojiRecebido}" | chat ${chatId} | de ${reaction.senderId || '?'}`);

      const regra = regraPorEmoji(reaction.reaction); // '' quando a reação é removida
      if (!regra) { console.log(`   ↳ ignorada: "${emojiRecebido}" não é gatilho (use ⚪ ⚫ 🔵 ⚠️)`); return; }

      if (!chatId || !chatId.endsWith('@g.us')) { console.log('   ↳ ignorada: não é grupo'); return; } // só grupos

      // Filtro de operadores (se OPERADORES estiver configurado)
      const reactor = String(reaction.senderId || '').replace(/\D/g, '');
      if (OPERADORES.length && reactor && !OPERADORES.includes(reactor)) {
        console.log('ℹ️  Reação ignorada (não é operador autorizado):', reactor);
        return;
      }

      const msg = await client.getMessageById(reaction.msgId._serialized);
      if (!msg || !msg.hasMedia) { console.log('ℹ️  Mensagem reagida sem imagem. Ignorado.'); return; }
      const media = await msg.downloadMedia();
      if (!media || !String(media.mimetype).startsWith('image/')) { console.log('ℹ️  Mídia reagida não é imagem. Ignorado.'); return; }

      const chat = await msg.getChat();
      const nomeGrupo = chat.name || '';
      const cli = await acharCliente(chatId, nomeGrupo);
      if (!cli) {
        console.log(`⚠️  Grupo "${nomeGrupo}" (${chatId}) não casou com nenhum cliente cadastrado — pulei. (Cadastre o cliente com esse nome no painel.)`);
        return;
      }

      const legenda = msg.body || ''; // caso 2: valor pode vir na legenda
      console.log(`\n📩 ${regra.emoji} ${regra.label} | grupo "${nomeGrupo}" → cliente ${cli.nome}`);
      const { bruto, aposta } = await lancarAposta({
        base64: media.data, mime: media.mimetype, emoji: reaction.reaction, legenda,
        clienteId: cli.id, grupoId: chatId, grupoNome: nomeGrupo, msgId: reaction.msgId._serialized,
      });
      console.log('   ↳ lido:', JSON.stringify(bruto));
      console.log(`   ✅ aposta #${aposta.id} gravada (odd ${aposta.odd}, valor ${aposta.valor}, casa "${aposta.casa}", EM ABERTO)`);
    } catch (e) {
      console.error('❌ Erro ao processar reação:', e.message);
    }
  });

  client.initialize();
  return client;
}

// ─────────── Lançar do dashboard: processa pedidos enfileirados pelo painel ───────────
let pollAtivo = false;
function iniciarPollerPedidos(client) {
  setInterval(async () => {
    if (pollAtivo) return;
    pollAtivo = true;
    try {
      const pendentes = await listarPedidosPendentes();
      for (const p of pendentes) await processarPedido(client, p);
      await resolverVinculos(client); // resolve links de grupo recém-colados
    } catch (e) {
      console.error('poller pedidos:', e.message);
    } finally {
      pollAtivo = false;
    }
  }, 5000);
}

async function processarPedido(client, p) {
  try {
    if (!p.cliente_id) { await marcarPedido(p.id, 'erro', 'Grupo sem cliente cadastrado.'); return; }
    // 1) tenta a imagem ORIGINAL (alta qualidade) pela mensagem; 2) fallback: miniatura do Storage.
    let base64 = null, mime = 'image/jpeg', msgRef = null;
    try {
      msgRef = await client.getMessageById(p.msg_id);
      if (msgRef && msgRef.hasMedia) {
        const m = await msgRef.downloadMedia();
        if (m && String(m.mimetype).startsWith('image/')) { base64 = m.data; mime = m.mimetype; }
      }
    } catch { /* msg antiga/indisponível -> usa miniatura */ }
    if (!base64) base64 = await baixarThumbBase64(p.thumb_path);
    if (!base64) { await marcarPedido(p.id, 'erro', 'Imagem indisponível para transcrever.'); return; }

    const emoji = p.pedido_emoji || '⚪';
    console.log(`\n🖱  lançar do dashboard | grupo "${p.grupo_nome}" | ${emoji}`);
    // Mesmo caminho da reação: emoji define o que fica "em aberto"; odd/valor digitados preenchem.
    const { aposta } = await lancarAposta({
      base64, mime, emoji, oddManual: p.pedido_odd, valorManual: p.pedido_valor,
      clienteId: p.cliente_id, grupoId: p.grupo_id, grupoNome: p.grupo_nome,
      msgId: p.msg_id, msgParaReagir: msgRef,
    });
    await marcarPedido(p.id, 'feito');
    console.log(`   ✅ aposta #${aposta.id} lançada do dashboard (odd ${aposta.odd}, valor ${aposta.valor})${msgRef ? ' + reagiu no grupo' : ''}`);
  } catch (e) {
    await marcarPedido(p.id, 'erro', String(e.message || e).slice(0, 200));
    console.error('   ❌ erro no pedido:', e.message);
  }
}

// Resolve o LINK do grupo (colado no cadastro) para o ID interno (...@g.us).
async function resolverVinculos(client) {
  const pend = await vinculosPendentes();
  for (const c of pend) {
    try {
      const code = String(c.grupo_link).trim().replace(/\?.*$/, '').split('/').filter(Boolean).pop();
      if (!code) continue;
      const info = await client.getInviteInfo(code);
      const gid = info && info.id && (info.id._serialized || info.id);
      if (gid) {
        await salvarGrupoId(c.id, String(gid));
        console.log(`🔗 grupo vinculado | cliente #${c.id} -> ${gid}`);
      }
    } catch (e) {
      console.log(`   (não resolvi o link do grupo do cliente #${c.id}:`, e.message, ')');
    }
  }
}

module.exports = { iniciarWhatsApp };
