const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { AUTH_PATH, regraPorEmoji, OPERADORES } = require('./config');
const { transcreverBilhete } = require('./transcrever');
const { registrarBilhete, acharClientePorGrupo } = require('./ingest');
const { registrarImagemRecebida, marcarReagida } = require('./conferencia');

/**
 * Conecta como "aparelho conectado" (WhatsApp Web) de UMA conta que é membro dos grupos.
 * Fluxo: operador reage à imagem com ⚪/⚫/🔵/⚠️ -> bot baixa a imagem + lê a legenda ->
 *        transcreve -> acha o cliente pelo NOME DO GRUPO -> grava EM ABERTO no Supabase.
 *
 * ATENÇÃO: automação não-oficial do WhatsApp contraria os Termos e pode banir a conta.
 * O bot só LÊ (não envia mensagens), o que reduz o risco. Prefira um número dedicado.
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
  client.on('ready', () => console.log('✅ Bot conectado e ouvindo reações nos grupos.'));
  client.on('disconnected', (r) => console.log('⚠️  Desconectado:', r));

  // CONFERÊNCIA: registra TODA imagem recebida em grupo (mesmo sem reação),
  // para auditar depois o que foi (ou não) transcrito.
  client.on('message', async (msg) => {
    try {
      if (!msg.hasMedia || msg.type !== 'image') return;
      const chat = await msg.getChat();
      if (!chat.isGroup) return;
      const media = await msg.downloadMedia();
      if (!media || !String(media.mimetype).startsWith('image/')) return;

      const nomeGrupo = chat.name || '';
      const cli = await acharClientePorGrupo(nomeGrupo);
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
      const cli = await acharClientePorGrupo(nomeGrupo);
      if (!cli) {
        console.log(`⚠️  Grupo "${nomeGrupo}" (${chatId}) não casou com nenhum cliente cadastrado — pulei. (Cadastre o cliente com esse nome no painel.)`);
        return;
      }

      const legenda = msg.body || ''; // caso 2: valor pode vir aqui
      console.log(`\n📩 ${regra.emoji} ${regra.label} | grupo "${nomeGrupo}" → cliente ${cli.nome}`);
      const { bruto, final } = await transcreverBilhete(media.data, reaction.reaction, media.mimetype, legenda);
      console.log('   ↳ lido:', JSON.stringify(bruto));
      const aposta = await registrarBilhete(final, { clienteId: cli.id, grupoId: chatId });
      console.log(`   ✅ aposta #${aposta.id} gravada (odd ${aposta.odd}, valor ${aposta.valor}, casa "${aposta.casa}", EM ABERTO)`);
      // Conferência: marca a imagem reagida desta mensagem como transcrita/lançada.
      await marcarReagida(reaction.msgId._serialized, {
        apostaId: aposta.id, emoji: reaction.reaction,
        grupoId: chatId, grupoNome: nomeGrupo, clienteId: cli.id,
      });
    } catch (e) {
      console.error('❌ Erro ao processar reação:', e.message);
    }
  });

  client.initialize();
  return client;
}

module.exports = { iniciarWhatsApp };
