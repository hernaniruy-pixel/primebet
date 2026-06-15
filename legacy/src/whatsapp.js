const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GRUPOS, AUTH_PATH, regraPorEmoji } = require('./config');
const { transcreverBilhete } = require('./transcrever');
const { registrarBilhete } = require('./ingest');

/**
 * Sobe o cliente WhatsApp usando o número da banca (o que está nos grupos).
 * Fluxo: reação em imagem com ⚪/⚫/🔵/⚠️ -> baixa a imagem -> transcreve -> grava o bilhete.
 *
 * ATENÇÃO: ler reações/mensagens de grupos usa automação não-oficial do WhatsApp Web,
 * o que contraria os Termos do WhatsApp e pode levar ao banimento do número.
 * Use um número dedicado, exclusivo para isso.
 */
function iniciarWhatsApp() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  client.on('qr', (qr) => {
    console.log('\n📱 Escaneie o QR code abaixo no WhatsApp do NÚMERO DA BANCA');
    console.log('   (Aparelhos conectados -> Conectar um aparelho):\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('🔐 Autenticado.'));
  client.on('ready', () => console.log('✅ WhatsApp conectado e ouvindo reações.'));
  client.on('disconnected', (r) => console.log('⚠️  WhatsApp desconectado:', r));

  client.on('message_reaction', async (reaction) => {
    try {
      const emoji = reaction.reaction; // '' quando a reação é removida
      const regra = regraPorEmoji(emoji);
      if (!regra) return; // não é um dos gatilhos -> ignora

      const chatId = reaction.id && reaction.id.remote; // JID do grupo
      const grupo = GRUPOS[chatId];
      if (!grupo) {
        console.log(`ℹ️  Reação ${emoji} em grupo não mapeado: ${chatId} (adicione em src/config.js -> GRUPOS)`);
        return;
      }

      const msg = await client.getMessageById(reaction.msgId._serialized);
      if (!msg || !msg.hasMedia) {
        console.log('ℹ️  A mensagem reagida não contém imagem. Ignorado.');
        return;
      }
      const media = await msg.downloadMedia();
      if (!media || !String(media.mimetype).startsWith('image/')) {
        console.log('ℹ️  Mídia reagida não é imagem. Ignorado.');
        return;
      }

      console.log(`\n📩 Bilhete | cliente=${grupo.cliente} | emoji=${regra.emoji} (${regra.label})`);
      const { bruto, final } = await transcreverBilhete(media.data, emoji, media.mimetype);
      const rec = registrarBilhete(final, { emoji: regra.emoji, grupo: chatId, cliente: grupo.cliente });
      console.log('   ↳ bruto:', JSON.stringify(bruto));
      console.log('   ✅ gravado:', JSON.stringify({ id: rec.id, cliente: rec.cliente, odd: rec.odd, val: rec.val, emAberto: rec.emAberto }));
    } catch (e) {
      console.error('❌ Erro ao processar reação:', e.message);
    }
  });

  client.initialize();
  return client;
}

module.exports = { iniciarWhatsApp };
