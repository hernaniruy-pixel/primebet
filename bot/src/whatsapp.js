// ════════════════════════════════════════════════════════════════
//  Núcleo do bot — BAILEYS (WebSocket, sem navegador).
//
//  Substitui a whatsapp-web.js, que raspava a interface do WhatsApp Web com um
//  Chromium e quebrou quando a WhatsApp mudou o site (getChat() estourando erro
//  minificado "r"). Aqui falamos o protocolo direto: sem Chromium, sem volume de
//  400 MB, sem watchdog, sem sincronização de 6 minutos.
//
//  ATENÇÃO: automação não-oficial do WhatsApp contraria os Termos e pode banir a
//  conta. O bot praticamente só LÊ; a única escrita é uma REAÇÃO (emoji) e os
//  avisos no grupo de alertas. Prefira um número dedicado.
// ════════════════════════════════════════════════════════════════
const {
  default: makeWASocket, useMultiFileAuthState, downloadMediaMessage,
  fetchLatestBaileysVersion, DisconnectReason,
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { AUTH_PATH, regraPorEmoji, OPERADORES, GRUPO_AVISOS_LINK } = require('./config');
const { transcreverBilhete } = require('./transcrever');
const { parseValor } = require('./valor');
const { registrarBilhete, acharCliente, vinculosPendentes, salvarGrupoId } = require('./ingest');
const { registrarImagemRecebida, marcarReagida, listarPedidosPendentes, marcarPedido, baixarThumbBase64, thumbPathPorMsg } = require('./conferencia');
const { registrarDespesa } = require('./despesas');
const { setQr, setPronto, setTeste } = require('./webqr');
const { avisar, aoConectar, aoDesconectar, horaBR, setGrupoAvisos } = require('./avisos');

const BOOT = Date.now();
const log = pino({ level: 'silent' }); // a Baileys é verbosa; nossos logs são os console.log

// ─────────── helpers de mensagem (Baileys) ───────────
const ehGrupo = (jid) => String(jid || '').endsWith('@g.us');

/** Texto da mensagem, seja conversa simples, texto estendido ou legenda de imagem. */
function textoDaMsg(m) {
  const msg = (m && m.message) || {};
  return (
    msg.conversation ||
    (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
    (msg.imageMessage && msg.imageMessage.caption) ||
    ''
  );
}
const ehImagem = (m) => !!(m && m.message && m.message.imageMessage);
/** messageTimestamp vem em segundos (às vezes como Long) -> ISO. */
function tsIso(m) {
  const t = m && m.messageTimestamp;
  const seg = typeof t === 'object' && t !== null && t.toNumber ? t.toNumber() : Number(t);
  return new Date((seg || Date.now() / 1000) * 1000).toISOString();
}

// Cache do nome do grupo: groupMetadata tem limite de taxa, não dá p/ chamar a cada msg.
const nomeCache = new Map();
async function nomeDoGrupo(sock, jid) {
  if (nomeCache.has(jid)) return nomeCache.get(jid);
  try {
    const md = await sock.groupMetadata(jid);
    const nome = (md && md.subject) || '';
    nomeCache.set(jid, nome);
    return nome;
  } catch (e) {
    console.log(`   (não obtive o nome do grupo ${jid}: ${e.message})`);
    return '';
  }
}

// ─────────── store próprio de imagens ───────────
// A Baileys não guarda histórico nem tem getMessageById. Para a REAÇÃO funcionar
// (operador reage numa imagem -> precisamos da imagem original) guardamos em
// memória só as mensagens de IMAGEM recentes. Se o bot reiniciar e a mensagem não
// estiver aqui, caímos no fallback da miniatura salva no Storage.
const memImgs = new Map(); // 'jid|id' -> { m, ts }
const MEM_MAX = 4000;
const MEM_TTL = 48 * 3600 * 1000;
function guardarImagem(jid, id, m) {
  memImgs.set(`${jid}|${id}`, { m, ts: Date.now() });
  if (memImgs.size > MEM_MAX) {
    const corte = Date.now() - MEM_TTL;
    for (const [k, v] of memImgs) {
      if (v.ts < corte) memImgs.delete(k);
      if (memImgs.size <= MEM_MAX * 0.8) break;
    }
    while (memImgs.size > MEM_MAX) memImgs.delete(memImgs.keys().next().value);
  }
}
const acharImagem = (jid, id) => { const e = memImgs.get(`${jid}|${id}`); return e ? e.m : null; };

/** Baixa a mídia de uma mensagem Baileys -> base64. */
async function baixarBase64(sock, m) {
  const buf = await downloadMediaMessage(m, 'buffer', {}, { logger: log, reuploadRequest: sock.updateMediaMessage });
  return Buffer.isBuffer(buf) ? buf.toString('base64') : null;
}

// ─────────── /status ───────────
const ehComandoStatus = (body) => (body || '').trim().toLowerCase() === '/status';

async function montarStatus(conectado, nomeGrupo = '') {
  let pend = '?';
  try { pend = (await listarPedidosPendentes()).length; } catch { /* ignora */ }
  const s = Math.floor((Date.now() - BOOT) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ehAlertas = /avisos|alerta/i.test(nomeGrupo);
  return [
    '🤖 *PrimeBet bot — status*',
    `• conexão: ${conectado ? '✅ CONNECTED' : '⚠️ conectando…'} (Baileys)`,
    `• no ar há: ${h}h ${m}min`,
    `• pedidos na fila (dashboard): ${pend}`,
    `• grupo de alertas reconhecido: ${ehAlertas ? '✅ sim (avisos/ONLINE saem aqui)' : '⚠️ NÃO — renomeie o grupo p/ conter "avisos" ou "alerta"'}`,
    `• hora: ${horaBR()}`,
  ].join('\n');
}

// ─────────── despesa ───────────
async function tratarDespesa(m, jid, nomeGrupo) {
  const body = (textoDaMsg(m) || '').trim();
  const idx = body.lastIndexOf(':');
  if (idx < 1) { console.log(`💬 grupo despesa "${nomeGrupo}" | ignorada: sem ":" -> "${body}"`); return false; }
  const descricao = body.slice(0, idx).trim();
  const valor = parseValor(body.slice(idx + 1));
  if (!descricao || valor == null) { console.log(`💬 grupo despesa "${nomeGrupo}" | ignorada: descrição/valor inválido -> "${body}"`); return false; }
  const inseriu = await registrarDespesa({
    grupoId: jid, grupoNome: nomeGrupo, descricao, valor,
    data: tsIso(m), msgId: m.key.id,
  });
  if (inseriu) console.log(`💸 despesa registrada | "${descricao}" R$ ${valor} | grupo "${nomeGrupo}"`);
  return inseriu;
}

// ─────────── conferência (imagens) ───────────
async function registrarImagemDeMsg(sock, m, jid, nomeGrupo) {
  if (!ehImagem(m)) return false;
  guardarImagem(jid, m.key.id, m); // para a reação achar a original depois
  const base64 = await baixarBase64(sock, m);
  if (!base64) return false;
  const cli = await acharCliente(jid, nomeGrupo);
  await registrarImagemRecebida({
    grupoId: jid, grupoNome: nomeGrupo,
    clienteId: cli ? cli.id : null, msgId: m.key.id,
    remetente: m.pushName || (m.key.participant || '').split('@')[0] || '',
    enviadoEm: tsIso(m),
    base64,
  });
  console.log(`🗂  imagem registrada p/ conferência | grupo "${nomeGrupo}"${cli ? '' : ' (⚠️ SEM cliente)'}`);
  return true;
}

// ─────────── lançamento (reação e dashboard usam o MESMO caminho) ───────────
function parseOdd(t) {
  if (t == null || String(t).trim() === '') return null;
  const n = parseFloat(String(t).replace(',', '.'));
  return isNaN(n) ? null : n;
}

async function lancarAposta({ sock, base64, mime, emoji, legenda = '', oddManual = null, valorManual = null, clienteId, grupoId, grupoNome, msgId, keyParaReagir = null }) {
  const regra = regraPorEmoji(emoji) || { emoji, mascara: [] };
  const { bruto, final } = await transcreverBilhete(base64, '⚪', mime, legenda);
  if (regra.mascara.includes('odd')) final.odd = parseOdd(oddManual);
  if (regra.mascara.includes('valor')) final.valor = parseValor(valorManual);
  const aposta = await registrarBilhete(final, { clienteId, grupoId });
  await marcarReagida(msgId, { apostaId: aposta.id, emoji: regra.emoji, grupoId, grupoNome, clienteId });
  if (keyParaReagir && sock) {
    try { await sock.sendMessage(grupoId, { react: { text: regra.emoji, key: keyParaReagir } }); }
    catch (e) { console.log('   (não consegui reagir na imagem do grupo:', e.message, ')'); }
  }
  return { bruto, aposta };
}

// ─────────── adaptador p/ o avisos.js (mantém aquele arquivo intacto) ───────────
function adaptar(sock) {
  return {
    sendMessage: (id, texto) => sock.sendMessage(id, { text: texto }),
    acceptInvite: (code) => sock.groupAcceptInvite(code),
    getInviteInfo: async (code) => {
      const info = await sock.groupGetInviteInfo(code);
      return { id: { _serialized: info && info.id } };
    },
    getChats: async () => {
      const gs = await sock.groupFetchAllParticipating();
      return Object.values(gs || {}).map((g) => ({ isGroup: true, name: g.subject || '', id: { _serialized: g.id } }));
    },
  };
}

// ─────────── conexão ───────────
let pollerLigado = false;

async function iniciarWhatsApp() {
  // Subpasta própria dentro do volume já existente (/app/.wwebjs_auth): isola as
  // credenciais da Baileys do antigo perfil do Chromium, que continua lá intocado
  // (permite voltar atrás). São poucos KB, contra os ~400 MB do perfil antigo.
  const authDir = path.join(AUTH_PATH, 'baileys');
  fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  console.log('🔌 Baileys — versão do protocolo WhatsApp:', version.join('.'));

  const sock = makeWASocket({
    version,
    auth: state,
    logger: log,
    printQRInTerminal: false,
    markOnlineOnConnect: false, // não rouba as notificações do celular
    syncFullHistory: false,     // não baixa histórico (não precisamos)
    browser: ['PrimeBet', 'Chrome', '1.0.0'],
  });
  const cliente = adaptar(sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      console.log('\n📱 Escaneie o QR no WhatsApp do número do BOT (Configurações → Aparelhos conectados → Conectar um aparelho):\n');
      setQr(qr);
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('✅ Bot conectado (Baileys) e ouvindo reações nos grupos.');
      setPronto();
      setTeste(() => avisar(cliente, `🔔 Teste de alerta — ${horaBR()}`));
      if (!pollerLigado) { pollerLigado = true; iniciarPollerPedidos(sock); }
      aoConectar(cliente, GRUPO_AVISOS_LINK).catch((e) => console.log('   (aoConectar:', e.message, ')'));
    }
    if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      const deslogado = code === DisconnectReason.loggedOut;
      console.log('⚠️  Conexão fechada:', code, deslogado ? '(DESLOGADO — precisa reescanear o QR)' : '(reconectando…)');
      aoDesconectar(cliente, `código ${code}`).catch(() => {});
      // Deslogado: não adianta reconectar — espera o QR novo (a Baileys emite no boot).
      if (!deslogado) setTimeout(() => iniciarWhatsApp().catch((e) => console.error('reconexão:', e.message)), 3000);
    }
  });

  // ─────────── mensagens ───────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // 'append' = histórico; só queremos o que chega agora
    for (const m of messages) {
      try {
        const jid = m.key && m.key.remoteJid;
        if (!ehGrupo(jid)) continue;
        const nomeGrupo = await nomeDoGrupo(sock, jid);
        if (/avisos|alerta/i.test(nomeGrupo)) setGrupoAvisos(jid);

        // /status responde em QUALQUER grupo (inclusive enviado pelo próprio nº do bot)
        if (ehComandoStatus(textoDaMsg(m))) {
          console.log(`🔧 /status no grupo "${nomeGrupo}"`);
          await sock.sendMessage(jid, { text: await montarStatus(true, nomeGrupo) });
          continue;
        }
        if (/avisos|alerta/i.test(nomeGrupo)) continue; // grupo de alerta não entra na conferência

        if (/despesa/i.test(nomeGrupo)) { await tratarDespesa(m, jid, nomeGrupo); continue; }

        await registrarImagemDeMsg(sock, m, jid, nomeGrupo);
      } catch (e) {
        console.error('❌ Erro ao processar mensagem:', e && e.message);
      }
    }
  });

  // ─────────── reações (o gatilho principal) ───────────
  sock.ev.on('messages.reaction', async (reacoes) => {
    for (const r of reacoes) {
      try {
        const jid = r.key && r.key.remoteJid;   // chat da mensagem reagida
        const msgId = r.key && r.key.id;        // id da mensagem reagida
        const emoji = (r.reaction && r.reaction.text) || '';
        const quem = (r.reaction && r.reaction.key && r.reaction.key.participant) || '';
        console.log(`👀 reação "${emoji || '(removida)'}" | chat ${jid} | de ${quem || '?'}`);

        const regra = regraPorEmoji(emoji);
        if (!regra) { console.log(`   ↳ ignorada: "${emoji}" não é gatilho (use ⚪ ⚫ 🔵 ⚠️)`); continue; }
        if (!ehGrupo(jid)) { console.log('   ↳ ignorada: não é grupo'); continue; }

        const reactor = String(quem).replace(/\D/g, '');
        if (OPERADORES.length && reactor && !OPERADORES.includes(reactor)) {
          console.log('ℹ️  Reação ignorada (não é operador autorizado):', reactor);
          continue;
        }

        const nomeGrupo = await nomeDoGrupo(sock, jid);
        const cli = await acharCliente(jid, nomeGrupo);
        if (!cli) {
          console.log(`⚠️  Grupo "${nomeGrupo}" (${jid}) não casou com nenhum cliente cadastrado — pulei.`);
          continue;
        }

        // 1) imagem original (memória). 2) fallback: miniatura do Storage.
        const orig = acharImagem(jid, msgId);
        let base64 = null, mime = 'image/jpeg', legenda = '';
        if (orig) {
          base64 = await baixarBase64(sock, orig);
          mime = (orig.message.imageMessage && orig.message.imageMessage.mimetype) || 'image/jpeg';
          legenda = textoDaMsg(orig) || '';
        }
        if (!base64) {
          console.log('   (imagem não está na memória — usando a miniatura da conferência)');
          base64 = await baixarThumbBase64(await thumbPathPorMsg(msgId));
        }
        if (!base64) { console.log('ℹ️  Sem imagem para transcrever. Ignorado.'); continue; }

        console.log(`\n📩 ${regra.emoji} ${regra.label} | grupo "${nomeGrupo}" → cliente ${cli.nome}`);
        const { bruto, aposta } = await lancarAposta({
          sock, base64, mime, emoji, legenda,
          clienteId: cli.id, grupoId: jid, grupoNome: nomeGrupo, msgId,
        });
        console.log('   ↳ lido:', JSON.stringify(bruto));
        console.log(`   ✅ aposta #${aposta.id} gravada (odd ${aposta.odd}, valor ${aposta.valor}, casa "${aposta.casa}", EM ABERTO)`);
      } catch (e) {
        console.error('❌ Erro ao processar reação:', e && e.message);
      }
    }
  });

  return sock;
}

// ─────────── dashboard: pedidos enfileirados pelo painel ───────────
let pollAtivo = false;
function iniciarPollerPedidos(sock) {
  setInterval(async () => {
    if (pollAtivo) return;
    pollAtivo = true;
    try {
      const pendentes = await listarPedidosPendentes();
      for (const p of pendentes) await processarPedido(sock, p);
      await resolverVinculos(sock);
    } catch (e) {
      console.error('poller pedidos:', e.message);
    } finally {
      pollAtivo = false;
    }
  }, 5000);
}

async function processarPedido(sock, p) {
  try {
    if (!p.cliente_id) { await marcarPedido(p.id, 'erro', 'Grupo sem cliente cadastrado.'); return; }
    // 1) imagem original (memória) 2) fallback: miniatura do Storage
    let base64 = null, mime = 'image/jpeg', keyRef = null;
    const orig = acharImagem(p.grupo_id, p.msg_id);
    if (orig) {
      base64 = await baixarBase64(sock, orig).catch(() => null);
      mime = (orig.message.imageMessage && orig.message.imageMessage.mimetype) || 'image/jpeg';
      keyRef = orig.key;
    }
    if (!base64) base64 = await baixarThumbBase64(p.thumb_path);
    if (!base64) { await marcarPedido(p.id, 'erro', 'Imagem indisponível para transcrever.'); return; }

    const emoji = p.pedido_emoji || '⚪';
    console.log(`\n🖱  lançar do dashboard | grupo "${p.grupo_nome}" | ${emoji}`);
    const { aposta } = await lancarAposta({
      sock, base64, mime, emoji, oddManual: p.pedido_odd, valorManual: p.pedido_valor,
      clienteId: p.cliente_id, grupoId: p.grupo_id, grupoNome: p.grupo_nome,
      msgId: p.msg_id, keyParaReagir: keyRef,
    });
    await marcarPedido(p.id, 'feito');
    console.log(`   ✅ aposta #${aposta.id} lançada do dashboard (odd ${aposta.odd}, valor ${aposta.valor})${keyRef ? ' + reagiu no grupo' : ''}`);
  } catch (e) {
    await marcarPedido(p.id, 'erro', String(e.message || e).slice(0, 200));
    console.error('   ❌ erro no pedido:', e.message);
  }
}

/** Resolve o LINK do grupo (colado no cadastro) para o ID interno (...@g.us). */
async function resolverVinculos(sock) {
  const pend = await vinculosPendentes();
  for (const c of pend) {
    try {
      const code = String(c.grupo_link).trim().replace(/\?.*$/, '').split('/').filter(Boolean).pop();
      if (!code) continue;
      const info = await sock.groupGetInviteInfo(code);
      const gid = info && info.id;
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
