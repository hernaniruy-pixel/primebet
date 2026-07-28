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
const { parseValor, parseValorMensagem } = require('./valor');
const { registrarBilhete, acharCliente, vinculosPendentes, salvarGrupoId, gruposDeClientes, aprenderGrupoPorMensagem } = require('./ingest');
const {
  registrarImagemRecebida, marcarReagida, listarPedidosPendentes, marcarPedido,
  baixarThumbBase64, thumbPathPorMsg, legendaPorMsg, anexarTextoAUltimaImagem, msgJsonPorMsg, enviadoEmPorMsg,
  apostaExistentePorMsg,
  listarEnviosPendentes, baixarPdfEnvio, marcarEnvio,
} = require('./conferencia');
const { registrarDespesa } = require('./despesas');
const { setQr, setPronto, setTeste } = require('./webqr');
const { avisar, aoConectar, aoDesconectar, horaBR, setGrupoAvisos, getGrupoAvisos } = require('./avisos');

const BOOT = Date.now();
const log = pino({ level: 'silent' }); // a Baileys é verbosa; nossos logs são os console.log

// ─────────── helpers de mensagem (Baileys) ───────────
const ehGrupo = (jid) => String(jid || '').endsWith('@g.us');

/**
 * Muitos bilhetes chegam EMBRULHADOS: mensagem efêmera, visualização única, documento
 * com legenda… O conteúdo útil fica um nível (ou dois) para dentro. Este helper
 * desembrulha até achar o miolo — sem ele, o card parecia "não ser foto" e era ignorado.
 */
function conteudoInterno(m) {
  let msg = (m && m.message) || {};
  for (let i = 0; i < 4; i++) {
    if (msg.ephemeralMessage) { msg = msg.ephemeralMessage.message || {}; continue; }
    if (msg.viewOnceMessage) { msg = msg.viewOnceMessage.message || {}; continue; }
    if (msg.viewOnceMessageV2) { msg = msg.viewOnceMessageV2.message || {}; continue; }
    if (msg.viewOnceMessageV2Extension) { msg = msg.viewOnceMessageV2Extension.message || {}; continue; }
    if (msg.documentWithCaptionMessage) { msg = msg.documentWithCaptionMessage.message || {}; continue; }
    break;
  }
  return msg;
}

/** Texto da mensagem, seja conversa simples, texto estendido ou legenda de imagem/documento. */
function textoDaMsg(m) {
  const msg = conteudoInterno(m);
  return (
    msg.conversation ||
    (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
    (msg.imageMessage && msg.imageMessage.caption) ||
    (msg.documentMessage && msg.documentMessage.caption) ||
    ''
  );
}

/**
 * Nó de imagem da mensagem, MESMO quando aninhado. Cobre: foto normal, CARD de app de
 * aposta (mensagem interativa/template com imagem no cabeçalho — ex.: cupom com botão
 * "CASH OUT") e documento image/*. Devolve { tipo:'image'|'document', node } ou null.
 * Caso real: bilhete do cliente compartilhado direto do app da casa chegava como card,
 * o bot dizia "não é foto" e o operador ficava sem o lançamento.
 */
function noDeImagem(m) {
  const msg = conteudoInterno(m);
  if (msg.imageMessage) return { tipo: 'image', node: msg.imageMessage };
  const inter = msg.interactiveMessage;
  if (inter && inter.header && inter.header.imageMessage) return { tipo: 'image', node: inter.header.imageMessage };
  const tpl = msg.templateMessage && (msg.templateMessage.hydratedTemplate || msg.templateMessage.hydratedFourRowTemplate);
  if (tpl && tpl.imageMessage) return { tipo: 'image', node: tpl.imageMessage };
  if (msg.buttonsMessage && msg.buttonsMessage.imageMessage) return { tipo: 'image', node: msg.buttonsMessage.imageMessage };
  const doc = msg.documentMessage;
  if (doc && /^image\//i.test(doc.mimetype || '')) return { tipo: 'document', node: doc };
  return null;
}

/** Miniatura EMBUTIDA na própria mensagem (preview de link/card) — último recurso
 *  quando não há mídia baixável. Vem inline, não precisa de download. */
function thumbEmbutida(m) {
  const msg = conteudoInterno(m);
  const th = (msg.extendedTextMessage && msg.extendedTextMessage.jpegThumbnail)
    || (msg.interactiveMessage && msg.interactiveMessage.header && msg.interactiveMessage.header.jpegThumbnail)
    || (msg.templateMessage && msg.templateMessage.hydratedTemplate && msg.templateMessage.hydratedTemplate.jpegThumbnail);
  if (!th) return null;
  if (typeof th === 'string') return th; // já veio base64
  // Buffer revivido de JSON (msg_json do banco): { type:'Buffer', data:[...] }
  if (th.type === 'Buffer' && Array.isArray(th.data)) return th.data.length ? Buffer.from(th.data).toString('base64') : null;
  return th.length ? Buffer.from(th).toString('base64') : null;
}

const ehImagem = (m) => !!noDeImagem(m);
/** messageTimestamp vem em segundos (às vezes como Long) -> ISO. */
function tsIso(m) {
  const t = m && m.messageTimestamp;
  const seg = typeof t === 'object' && t !== null && t.toNumber ? t.toNumber() : Number(t);
  return new Date((seg || Date.now() / 1000) * 1000).toISOString();
}

// 'DD/MM HH:mm' no fuso de Brasília — usado nos avisos para apontar o bilhete com problema.
function dataHoraBR(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
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

/**
 * Carrega o nome de TODOS os grupos numa ÚNICA chamada, no boot.
 * Sem isto, cada grupo novo custava um groupMetadata — dezenas de chamadas à API do
 * WhatsApp, que é justamente o que aumenta o risco de banimento do número.
 */
async function carregarNomesDeGrupos(sock) {
  try {
    const gs = await sock.groupFetchAllParticipating();
    for (const [jid, g] of Object.entries(gs || {})) nomeCache.set(jid, (g && g.subject) || '');
    console.log(`📇 ${nomeCache.size} grupos catalogados (1 chamada só)`);
  } catch (e) {
    console.log('   (não consegui catalogar os grupos:', e.message, ')');
  }
}

// ─────────── LISTA DE GRUPOS QUE O BOT PODE LER ───────────
// O número participa de dezenas de grupos (equipe, diretoria, pessoal…). O bot só
// pode encostar nos grupos DOS CLIENTES + despesa + alertas. Todo o resto é ignorado
// ANTES de qualquer chamada à API ou download de mídia: menos exposição (ban), menos
// tráfego e nada de lixo no banco/Storage.
let permitidos = new Set();
let permitidosEm = 0;
const PERMITIDOS_TTL = 2 * 60 * 1000; // recarrega do banco a cada 2 min (cliente novo entra sozinho)
let despesaJid = null;

/** Acha os grupos especiais (despesa/alertas) pelo nome, usando o catálogo já em memória. */
function acharGruposEspeciais() {
  for (const [jid, nome] of nomeCache) {
    if (/despesa/i.test(nome)) despesaJid = jid;
    if (/avisos|alerta/i.test(nome)) setGrupoAvisos(jid);
  }
  console.log(`   grupo de despesas: ${despesaJid ? `"${nomeCache.get(despesaJid)}"` : '⚠️ não encontrado'}`);
}

async function gruposPermitidos(forcar = false) {
  if (!forcar && Date.now() - permitidosEm < PERMITIDOS_TTL) return permitidos;
  const s = new Set(await gruposDeClientes()); // consulta ao BANCO, não ao WhatsApp
  if (despesaJid) s.add(despesaJid);
  const av = getGrupoAvisos();
  if (av) s.add(av);
  permitidos = s;
  permitidosEm = Date.now();
  return permitidos;
}

// Grupos fora da lista que mandaram mensagem. Não vão para o banco, mas NÃO somem em
// silêncio: aparecem no log (1x cada) e no /status — se um cliente de verdade estiver
// sem cadastro, isso precisa ser visível, senão a aposta dele evapora sem ninguém ver.
const ignorados = new Map(); // jid -> { nome, msgs }
function registrarIgnorado(jid, nome) {
  const e = ignorados.get(jid);
  if (e) { e.msgs++; return; }
  ignorados.set(jid, { nome: nome || jid, msgs: 1 });
  console.log(`🚫 grupo fora da lista, ignorado: "${nome || jid}" (cadastre o link no cliente para ativar)`);
}

// Grupos já checados p/ auto-vínculo e que NÃO casaram com nenhum cliente vinculando:
// evita reconsultar o banco a cada mensagem dos MUITOS grupos que não são de cliente.
const semVinculo = new Map(); // jid -> ts da última checagem
const SEMVINCULO_TTL = 20 * 60 * 1000;

/**
 * Grupo fora da lista mandou mensagem: tenta APRENDER o grupo_id pelo nome (contorna o
 * groupGetInviteInfo que quebrou). Usa o nome já em cache (sem chamar a API do WhatsApp).
 * Devolve o cliente recém-vinculado (e já refresca a lista de permitidos) ou null.
 */
async function tentarAprenderGrupo(jid) {
  const agora = Date.now();
  const visto = semVinculo.get(jid);
  if (visto && agora - visto < SEMVINCULO_TTL) return null; // já checado há pouco, não casou
  const nome = nomeCache.get(jid) || '';
  const cli = nome ? await aprenderGrupoPorMensagem(jid, nome) : null;
  if (cli) {
    await gruposPermitidos(true);       // passa a ler o grupo AGORA
    semVinculo.delete(jid);
    ignorados.delete(jid);
    console.log(`🔗 grupo aprendido pela mensagem | cliente #${cli.id} ${cli.nome} -> ${jid}`);
    return cli;
  }
  semVinculo.set(jid, agora);
  return null;
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

/**
 * Baixa a mídia de uma mensagem Baileys -> base64.
 * O servidor de mídia do WhatsApp às vezes nega a URL (403/410) mesmo em print recente.
 * Nesse caso pedimos ao WhatsApp para REENVIAR a mídia e tentamos de novo — sem isso,
 * um 403 isolado fazia o bilhete inteiro se perder.
 */
async function baixarBase64(sock, m) {
  const baixar = async (msg) => {
    const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger: log, reuploadRequest: sock.updateMediaMessage });
    return Buffer.isBuffer(buf) ? buf.toString('base64') : null;
  };
  // Imagem ANINHADA (card de app/template/documento-imagem): a downloadMediaMessage não
  // enxerga o cabeçalho do card — baixamos um "clone" com o nó de mídia no lugar padrão.
  let alvo = m;
  if (!(m.message && m.message.imageMessage)) {
    const info = noDeImagem(m);
    if (info) alvo = { key: m.key, message: info.tipo === 'document' ? { documentMessage: info.node } : { imageMessage: info.node } };
  }
  try {
    return await baixar(alvo);
  } catch (e) {
    const st = (e && (e.output && e.output.statusCode)) || (e && e.message) || '';
    console.log(`   (download falhou: ${e.message} — pedindo reenvio da mídia ao WhatsApp…)`);
    try {
      const atualizada = await sock.updateMediaMessage(alvo === m ? m : alvo);
      return await baixar(atualizada || alvo);
    } catch (e2) {
      console.log(`   (reenvio também falhou: ${e2.message}${st ? ` | 1ª: ${st}` : ''})`);
      throw e;
    }
  }
}

/**
 * Obtém a imagem em ALTA para transcrever, na melhor fonte disponível:
 *   1) memória do processo (rápido);
 *   2) mensagem guardada no banco -> rebaixa a ORIGINAL do WhatsApp (sobrevive a restart);
 *   3) miniatura da Conferência (720px) — ÚLTIMO recurso.
 *
 * A ordem importa e é o motivo desta função existir: com o bot reiniciando, o passo 3
 * virava o caminho normal e a IA lia numeros errados no bilhete borrado (odd 120,
 * valor 18,5). A miniatura serve para CONFERIR com o olho, não para a IA transcrever.
 */
async function imagemParaTranscrever(sock, jid, msgId) {
  // mime do nó de imagem, mesmo quando aninhado (card de app/documento-imagem)
  const mimeDe = (m) => { const i = noDeImagem(m); return (i && i.node && i.node.mimetype) || 'image/jpeg'; };

  const orig = acharImagem(jid, msgId);
  if (orig) {
    const base64 = await baixarBase64(sock, orig).catch((e) => { console.log('   (falha ao baixar da memória:', e.message, ')'); return null; });
    if (base64) return { base64, mime: mimeDe(orig), fonte: 'original (memória)', orig };
    const emb = thumbEmbutida(orig);
    if (emb) return { base64: emb, mime: 'image/jpeg', fonte: 'miniatura embutida do card (memória)', orig };
  }

  const salva = await msgJsonPorMsg(msgId);
  if (salva) {
    const base64 = await baixarBase64(sock, salva).catch((e) => { console.log('   (falha ao rebaixar a original:', e.message, ')'); return null; });
    if (base64) return { base64, mime: mimeDe(salva), fonte: 'original (rebaixada do WhatsApp)', orig: salva };
    const emb = thumbEmbutida(salva);
    if (emb) return { base64: emb, mime: 'image/jpeg', fonte: 'miniatura embutida do card (banco)', orig: salva };
  }

  const base64 = await baixarThumbBase64(await thumbPathPorMsg(msgId));
  if (base64) return { base64, mime: 'image/jpeg', fonte: '⚠️ MINIATURA (baixa qualidade — valores podem sair errados)', orig: null };
  return { base64: null, mime: 'image/jpeg', fonte: 'nenhuma', orig: null };
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
  const perm = await gruposPermitidos();
  const linhas = [
    '🤖 *PrimeBet bot — status*',
    `• conexão: ${conectado ? '✅ CONNECTED' : '⚠️ conectando…'} (Baileys)`,
    `• no ar há: ${h}h ${m}min`,
    `• pedidos na fila (dashboard): ${pend}`,
    `• grupos lidos: ${perm.size} de ${nomeCache.size} (só clientes + despesa + alertas)`,
    `• grupo de alertas reconhecido: ${ehAlertas ? '✅ sim (avisos/ONLINE saem aqui)' : '⚠️ NÃO — renomeie o grupo p/ conter "avisos" ou "alerta"'}`,
  ];
  // Grupo sem cadastro que está mandando print = aposta que ninguém está vendo.
  if (ignorados.size) {
    const top = [...ignorados.values()].sort((a, b) => b.msgs - a.msgs).slice(0, 5);
    linhas.push(`• ⚠️ ${ignorados.size} grupo(s) SEM cadastro sendo ignorados:`);
    top.forEach((g) => linhas.push(`    – ${g.nome} (${g.msgs} msg)`));
    linhas.push('    Cadastre o link do grupo no cliente para o bot passar a ler.');
  }
  linhas.push(`• hora: ${horaBR()}`);
  return linhas.join('\n');
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

// ─────────── valor escrito solto (antes OU depois do print) ───────────
// Na prática o cliente faz das duas formas: manda o print e escreve o valor embaixo,
// ou escreve o valor e manda o print em seguida. O caso "texto depois" resolve no banco
// (gruda na última imagem). O caso "texto antes" fica aqui, esperando o print chegar.
const valorAguardando = new Map(); // jid -> { texto, ts }
const ESPERA_VALOR_MS = 10 * 60 * 1000;

function guardarValorParaProximoPrint(jid, texto) {
  valorAguardando.set(jid, { texto, ts: Date.now() });
}
/** Consome o valor que estava esperando um print neste grupo (se ainda válido). */
function consumirValorAguardando(jid) {
  const e = valorAguardando.get(jid);
  if (!e) return '';
  valorAguardando.delete(jid);
  return Date.now() - e.ts > ESPERA_VALOR_MS ? '' : e.texto;
}

/**
 * Decide a legenda de uma imagem que acabou de chegar: a legenda colada nela manda;
 * sem ela, aproveita um valor que o cliente escreveu logo ANTES do print.
 * Devolve { legenda, veioDeAntes }.
 */
function escolherLegendaDaImagem(jid, legendaPropria) {
  if (legendaPropria) return { legenda: legendaPropria, veioDeAntes: false };
  const anterior = consumirValorAguardando(jid);
  return { legenda: anterior, veioDeAntes: !!anterior };
}

// ─────────── conferência (imagens) ───────────
async function registrarImagemDeMsg(sock, m, jid, nomeGrupo) {
  // Vale registrar: foto/card com imagem baixável OU card com miniatura embutida
  // (preview). Card de bilhete compartilhado do app entra por aqui — antes era
  // descartado como "não-imagem" e a reação não tinha o que ler.
  const soThumb = !ehImagem(m) ? thumbEmbutida(m) : null;
  if (!ehImagem(m) && !soThumb) {
    // Diagnóstico: card interativo sem imagem nem miniatura — loga a estrutura p/
    // sabermos QUAL formato a casa usa e cobrirmos (aparece no log da Railway).
    const miolo = conteudoInterno(m);
    if (miolo.interactiveMessage || miolo.templateMessage || miolo.buttonsMessage || miolo.productMessage) {
      console.log(`🧩 card não-suportado no grupo "${nomeGrupo}" | tipos: ${Object.keys(miolo).join(',')}`);
    }
    return false;
  }
  guardarImagem(jid, m.key.id, m); // para a reação achar a original depois
  const cli = await acharCliente(jid, nomeGrupo);
  const { legenda, veioDeAntes } = escolherLegendaDaImagem(jid, textoDaMsg(m) || '');

  // O download PODE falhar (o WhatsApp às vezes nega a mídia com 403). Isso não pode
  // custar o bilhete: gravamos a linha de qualquer jeito, com a mensagem guardada.
  // Assim o print aparece na Conferência e a reação tenta baixar de novo depois.
  // Card sem mídia baixável usa a miniatura embutida da própria mensagem.
  const base64 = (await baixarBase64(sock, m).catch(() => null)) || soThumb || thumbEmbutida(m);

  await registrarImagemRecebida({
    grupoId: jid, grupoNome: nomeGrupo,
    clienteId: cli ? cli.id : null, msgId: m.key.id,
    remetente: m.pushName || (m.key.participant || '').split('@')[0] || '',
    enviadoEm: tsIso(m),
    base64, // null = sem miniatura; a linha entra do mesmo jeito
    legenda,
    // Guarda a mensagem: sem isto, um restart obriga a reação a usar a miniatura,
    // e a IA lê valor errado no bilhete borrado.
    msgJson: JSON.parse(JSON.stringify(m)),
  });
  console.log(`🗂  imagem registrada p/ conferência | grupo "${nomeGrupo}"${cli ? '' : ' (⚠️ SEM cliente)'}${base64 ? '' : ' (⚠️ SEM a imagem — download negado; a reação tentará de novo)'}`);
  if (veioDeAntes) console.log(`   🔗 valor "${legenda}" (escrito antes do print) aplicado a esta imagem`);
  return true;
}

/**
 * Texto solto num grupo de cliente: se a mensagem for SÓ um valor, ela é o valor de um
 * print. Tenta grudar no print que veio ANTES; se ainda não veio print, guarda o valor
 * para o PRÓXIMO print do grupo (o cliente escreve o valor primeiro com frequência).
 */
async function tratarValorSolto(m, jid, nomeGrupo) {
  if (ehImagem(m)) return false;
  const texto = (textoDaMsg(m) || '').trim();
  const valor = parseValorMensagem(texto);
  if (valor == null) return false;
  const alvo = await anexarTextoAUltimaImagem(jid, texto);
  if (alvo) {
    console.log(`🔗 valor R$ ${valor} grudado no print de ${alvo.enviado_em} | grupo "${nomeGrupo}"`);
    return true;
  }
  guardarValorParaProximoPrint(jid, texto);
  console.log(`💬 valor R$ ${valor} anotado | grupo "${nomeGrupo}" — aguardando o print (até 10min)`);
  return true;
}

// ─────────── lançamento (reação e dashboard usam o MESMO caminho) ───────────
function parseOdd(t) {
  if (t == null || String(t).trim() === '') return null;
  const n = parseFloat(String(t).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// Grupo de TESTE do cliente: "Teste print NOMECLIENTE". O bilhete é transcrito
// (custa API, como qualquer print), mas marcado teste=true para NÃO entrar na cota
// do cliente. Detecção pelo início do nome, tolerando acentos/espaços extras.
const ehGrupoTeste = (nome) => /^\s*teste\s+print\b/i.test(String(nome || ''));

async function lancarAposta({ sock, base64, mime, emoji, legenda = '', oddManual = null, valorManual = null, clienteId, grupoId, grupoNome, msgId, keyParaReagir = null, enviadoEm = null }) {
  const regra = regraPorEmoji(emoji) || { emoji, mascara: [] };
  const { bruto, final } = await transcreverBilhete(base64, '⚪', mime, legenda);
  if (regra.mascara.includes('odd')) final.odd = parseOdd(oddManual);
  if (regra.mascara.includes('valor')) final.valor = parseValor(valorManual);
  // A aposta é do momento em que o cliente mandou o print — não de quando o operador reagiu.
  const aposta = await registrarBilhete(final, { clienteId, grupoId, enviadoEm, teste: ehGrupoTeste(grupoNome) });
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
      // Catálogo de grupos (1 chamada) -> nomes p/ achar despesa/alertas e p/ os logs,
      // sem precisar de um groupMetadata por grupo.
      await carregarNomesDeGrupos(sock);
      acharGruposEspeciais();
      const perm = await gruposPermitidos(true);
      console.log(`🔒 lendo apenas ${perm.size} grupos (clientes + despesa + alertas) de ${nomeCache.size} em que o número está`);
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

        // PORTEIRO: fora da lista, tenta APRENDER o grupo pelo nome (contorna a API de
        // convite que quebrou). Se aprendeu, segue o fluxo e já processa esta mensagem;
        // se não, ignora (sem API, sem download, sem banco).
        if (!(await gruposPermitidos()).has(jid)) {
          const aprendido = await tentarAprenderGrupo(jid);
          if (!aprendido) { registrarIgnorado(jid, nomeCache.get(jid)); continue; }
        }

        const nomeGrupo = await nomeDoGrupo(sock, jid);

        // /status responde nos grupos da lista (inclusive enviado pelo próprio nº do bot)
        if (ehComandoStatus(textoDaMsg(m))) {
          console.log(`🔧 /status no grupo "${nomeGrupo}"`);
          await sock.sendMessage(jid, { text: await montarStatus(true, nomeGrupo) });
          continue;
        }
        if (jid === getGrupoAvisos()) continue; // grupo de alerta não entra na conferência

        if (jid === despesaJid) { await tratarDespesa(m, jid, nomeGrupo); continue; }

        if (await registrarImagemDeMsg(sock, m, jid, nomeGrupo)) continue;
        // Não é imagem: pode ser o valor escrito embaixo do print que acabou de chegar.
        await tratarValorSolto(m, jid, nomeGrupo);
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
        if (!(await gruposPermitidos()).has(jid)) {
          // Grupo ainda sem grupo_id: tenta aprender pelo nome antes de descartar a reação.
          const aprendido = await tentarAprenderGrupo(jid);
          if (!aprendido) { console.log('   ↳ ignorada: grupo fora da lista'); continue; }
        }

        // O WhatsApp migrou os participantes de grupo para @lid (id interno, DIFERENTE
        // do telefone). Quando o reator vem como @lid não há como comparar com
        // OPERADORES (que são telefones): NÃO bloqueia — o porteiro acima já garante
        // que é grupo de cliente. Só bloqueia quando o reator é um telefone real e de
        // fato não está na lista. Sem isto, a migração p/ @lid fazia TODA reação ser
        // ignorada em silêncio (o operador reagia e nada acontecia).
        const ehLid = /@lid$/i.test(String(quem));
        const reactor = String(quem).replace(/\D/g, '');
        if (OPERADORES.length && !ehLid && reactor && !OPERADORES.includes(reactor)) {
          console.log('ℹ️  Reação ignorada (não é operador autorizado):', reactor);
          continue;
        }
        if (OPERADORES.length && ehLid) console.log('   (reator veio como @lid — não dá p/ checar OPERADORES; liberado pelo grupo permitido)');

        const nomeGrupo = await nomeDoGrupo(sock, jid);
        const cli = await acharCliente(jid, nomeGrupo);
        if (!cli) {
          console.log(`⚠️  Grupo "${nomeGrupo}" (${jid}) não casou com nenhum cliente cadastrado — pulei.`);
          const tsNaoVinc = await enviadoEmPorMsg(msgId);
          const quandoNV = tsNaoVinc ? ` (bilhete de ${dataHoraBR(tsNaoVinc)})` : '';
          await avisar(cliente, `⚠️ Reagi um bilhete em "${nomeGrupo}"${quandoNV}, mas o grupo não está vinculado a nenhum cliente. Cadastre o link do grupo no cliente e reaja de novo.`);
          continue;
        }

        // ── TRAVA ANTI-DUPLICATA: reagir de novo num bilhete JÁ lançado não cria outra
        // aposta (reagir 2× duplicava o dinheiro: #18987-89 renasceram como #19177-79).
        // Se a aposta foi EXCLUÍDA no painel, a trava libera — excluir + reagir de novo
        // é o fluxo legítimo de relançar um bilhete que saiu errado.
        const jaLancada = await apostaExistentePorMsg(msgId);
        if (jaLancada) {
          console.log(`ℹ️  Reação repetida — bilhete já lançado como aposta #${jaLancada}. Ignorado.`);
          const tsJa = await enviadoEmPorMsg(msgId);
          const qJa = tsJa ? `, bilhete de ${dataHoraBR(tsJa)}` : '';
          await avisar(cliente, `ℹ️ Reação repetida ignorada: esse bilhete já está lançado como aposta #${jaLancada} (${cli.nome}${qJa}). Para corrigir, edite ou EXCLUA a aposta no painel e reaja de novo.`);
          continue;
        }

        const { base64, mime, fonte, orig } = await imagemParaTranscrever(sock, jid, msgId);
        if (!base64) {
          // Causa nº 1 (comum): reagiram num CARD/LINK de bookingcode (Betano etc.), que
          // NÃO é foto — o bot não lê card. Causa nº 2: era foto, mas o WhatsApp negou a
          // mídia. A mensagem cobre as duas e diz o que fazer (mandar o PRINT como foto).
          console.log('ℹ️  Sem imagem para transcrever (card/link ou mídia negada). Ignorado.');
          const tsPrint = (orig && tsIso(orig)) || (await enviadoEmPorMsg(msgId));
          const quando = tsPrint ? ` (bilhete de ${dataHoraBR(tsPrint)})` : '';
          await avisar(cliente, `⚠️ Reação em "${nomeGrupo}" (${cli.nome})${quando}: não consegui ler o bilhete. Se você reagiu num CARD/LINK (ex.: bookingcode da Betano), isso não funciona — peça o PRINT do bilhete e mande como FOTO. Se já era foto, reenvie e reaja de novo.`);
          continue;
        }
        console.log('   imagem:', fonte);

        // Legenda: vem do banco — lá está OU a legenda colada na imagem, OU o valor que o
        // cliente escreveu na mensagem debaixo do print. Cai na memória se a linha sumiu.
        const legenda = (await legendaPorMsg(msgId)) || (orig ? textoDaMsg(orig) || '' : '');
        if (legenda) console.log(`   legenda/valor: "${legenda}"`);

        console.log(`\n📩 ${regra.emoji} ${regra.label} | grupo "${nomeGrupo}" → cliente ${cli.nome}`);
        // A hora do PRINT: da memória (mensagem original) ou da linha da Conferência.
        const enviadoEm = (orig && tsIso(orig)) || (await enviadoEmPorMsg(msgId));
        const { bruto, aposta } = await lancarAposta({
          sock, base64, mime, emoji, legenda, enviadoEm,
          clienteId: cli.id, grupoId: jid, grupoNome: nomeGrupo, msgId,
        });
        console.log('   ↳ lido:', JSON.stringify(bruto));
        console.log(`   ✅ aposta #${aposta.id} gravada (odd ${aposta.odd}, valor ${aposta.valor}, casa "${aposta.casa}", EM ABERTO)`);
      } catch (e) {
        const msg = String((e && e.message) || e);
        console.error('❌ Erro ao processar reação:', msg);
        // Nunca falhar em silêncio: o operador reagiu esperando a transcrição.
        // Sem crédito é uma falha SISTÊMICA (afeta todos) — mensagem clara e acionável,
        // em vez do JSON cru; o anti-flood do avisar evita repetir a cada reação.
        const semCredito = /credit balance is too low|Plans & Billing/i.test(msg);
        const aviso = semCredito
          ? '⛔ Transcrições PARADAS: a conta da Anthropic está SEM CRÉDITO. Recarregue em console.anthropic.com (Plans & Billing). Nenhum bilhete reagido será lido até lá.'
          : `⚠️ Não consegui transcrever um bilhete reagido: ${msg.slice(0, 150)}. Reaja de novo ou lance pelo painel.`;
        try { await avisar(cliente, aviso); } catch { /* silencioso */ }
      }
    }
  });

  return sock;
}

// ─────────── dashboard: pedidos enfileirados pelo painel ───────────
let pollAtivo = false;
let ultimoVinculo = 0;
const VINCULO_INTERVALO = 60 * 1000; // 1x por minuto — não precisa ser a cada 5s
let ultimoEnvio = 0;
const ENVIO_INTERVALO = 30 * 1000; // PDF de fechamento: 30s entre um cliente e o próximo (ban-safe)

function iniciarPollerPedidos(sock) {
  setInterval(async () => {
    if (pollAtivo) return;
    pollAtivo = true;
    try {
      // A fila do dashboard é local (banco) — pode ser rápida, não fala com o WhatsApp.
      const pendentes = await listarPedidosPendentes();
      for (const p of pendentes) await processarPedido(sock, p);
      // Envio de PDF de fechamento: UM por vez, com 30s entre um cliente e o próximo —
      // espaçado p/ não parecer robô/spam e reduzir risco de ban. O admin enfileira no
      // painel, o bot manda aqui. (O 1º de uma leva sai na hora; os seguintes a cada 30s.)
      if (Date.now() - ultimoEnvio >= ENVIO_INTERVALO) {
        const envios = await listarEnviosPendentes(1);
        for (const e of envios) { await processarEnvioPdf(sock, e); ultimoEnvio = Date.now(); }
      }
      // Já o vínculo consulta a API do WhatsApp: vai devagar.
      if (Date.now() - ultimoVinculo >= VINCULO_INTERVALO) {
        ultimoVinculo = Date.now();
        await resolverVinculos(sock);
      }
    } catch (e) {
      console.error('poller pedidos:', e.message);
    } finally {
      pollAtivo = false;
    }
  }, 5000);
}

// Manda o PDF de fechamento (documento) no grupo do cliente, com a legenda do painel.
async function processarEnvioPdf(sock, e) {
  try {
    if (!e.grupo_id) { await marcarEnvio(e.id, 'erro', 'Pedido sem grupo.'); return; }
    const buf = await baixarPdfEnvio(e.storage_path);
    if (!buf) { await marcarEnvio(e.id, 'erro', 'PDF não encontrado no Storage.'); return; }
    const nome = `Fechamento ${e.cliente_nome || ''}`.trim().replace(/\s+/g, ' ') + '.pdf';
    await sock.sendMessage(e.grupo_id, { document: buf, mimetype: 'application/pdf', fileName: nome, caption: e.legenda || '' });
    await marcarEnvio(e.id, 'enviado');
    console.log(`📤 PDF de fechamento enviado no grupo ${e.grupo_id} (cliente ${e.cliente_nome || '?'})`);
  } catch (err) {
    await marcarEnvio(e.id, 'erro', String((err && err.message) || err).slice(0, 200));
    console.error('   ❌ erro ao enviar PDF:', (err && err.message) || err);
  }
}

async function processarPedido(sock, p) {
  try {
    if (!p.cliente_id) { await marcarPedido(p.id, 'erro', 'Grupo sem cliente cadastrado.'); return; }
    const { base64, mime, fonte, orig } = await imagemParaTranscrever(sock, p.grupo_id, p.msg_id);
    if (!base64) { await marcarPedido(p.id, 'erro', 'Imagem indisponível para transcrever.'); return; }
    const keyRef = orig && orig.key ? orig.key : null;

    const emoji = p.pedido_emoji || '⚪';
    console.log(`\n🖱  lançar do dashboard | grupo "${p.grupo_nome}" | ${emoji} | imagem: ${fonte}`);
    const { aposta } = await lancarAposta({
      sock, base64, mime, emoji, legenda: p.legenda || '',
      oddManual: p.pedido_odd, valorManual: p.pedido_valor,
      clienteId: p.cliente_id, grupoId: p.grupo_id, grupoNome: p.grupo_nome,
      msgId: p.msg_id, keyParaReagir: keyRef,
      enviadoEm: p.enviado_em || null, // hora do print, não do clique em Lançar
    });
    await marcarPedido(p.id, 'feito');
    console.log(`   ✅ aposta #${aposta.id} lançada do dashboard (odd ${aposta.odd}, valor ${aposta.valor})${keyRef ? ' + reagiu no grupo' : ''}`);
  } catch (e) {
    await marcarPedido(p.id, 'erro', String(e.message || e).slice(0, 200));
    console.error('   ❌ erro no pedido:', e.message);
  }
}

// Tentativas por cliente. Um link inválido/expirado NUNCA resolve: sem este teto, o
// laço reconsultava a API do WhatsApp a cada 5s, para sempre, em todos os pendentes
// (chegou a ~50 chamadas a cada 5s em 15/07). É o comportamento que mais aproxima o
// número de um banimento — e ele voltaria sozinho no próximo link ruim.
const tentativasVinculo = new Map(); // clienteId -> nº de falhas
const MAX_TENTATIVAS = 3;

/** Resolve o LINK do grupo (colado no cadastro) para o ID interno (...@g.us). */
async function resolverVinculos(sock) {
  const pend = await vinculosPendentes();
  for (const c of pend) {
    const falhas = tentativasVinculo.get(c.id) || 0;
    if (falhas >= MAX_TENTATIVAS) continue; // desistiu: não insiste na API
    try {
      const code = String(c.grupo_link).trim().replace(/\?.*$/, '').split('/').filter(Boolean).pop();
      if (!code) { tentativasVinculo.set(c.id, MAX_TENTATIVAS); continue; }
      const info = await sock.groupGetInviteInfo(code);
      const gid = info && info.id;
      if (gid) {
        await salvarGrupoId(c.id, String(gid));
        tentativasVinculo.delete(c.id);
        await gruposPermitidos(true); // cliente novo passa a ser lido na hora
        console.log(`🔗 grupo vinculado | cliente #${c.id} -> ${gid}`);
      } else {
        tentativasVinculo.set(c.id, falhas + 1);
      }
    } catch (e) {
      const n = falhas + 1;
      tentativasVinculo.set(c.id, n);
      console.log(`   (não resolvi o link do cliente #${c.id}: ${e.message} — tentativa ${n}/${MAX_TENTATIVAS})`);
      if (n >= MAX_TENTATIVAS) console.log(`   ⛔ desisti do link do cliente #${c.id}. Corrija o link no painel (o bot tenta de novo no próximo reinício).`);
    }
  }
}

module.exports = { iniciarWhatsApp };
// Exposto só para os testes (scripts/teste-valor-solto.js) — não usar em produção.
module.exports._teste = { tratarValorSolto, escolherLegendaDaImagem, consumirValorAguardando, guardarValorParaProximoPrint };
