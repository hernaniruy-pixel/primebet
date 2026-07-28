// Avisos operacionais para um grupo "AVISOS" no WhatsApp (online/offline/heartbeat).
const horaBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());

let grupoAvisosId = null;
// Cacheia o ID do grupo de alertas a partir de uma mensagem recebida nele
// (rápido e direto — evita o getChats() que TRAVA quando há muitos grupos).
const setGrupoAvisos = (id) => { if (id) grupoAvisosId = id; };
/** ID do grupo de alertas já resolvido (usado pela lista de grupos permitidos). */
const getGrupoAvisos = () => grupoAvisosId;

/** Resolve o grupo de ALERTAS pelo LINK do convite (e ENTRA nele se ainda não for membro). */
async function resolverAvisosPorLink(client, link) {
  if (!link) return null;
  const code = String(link).trim().replace(/\?.*$/, '').split('/').filter(Boolean).pop();
  if (!code) return null;
  let gid = null;
  try {
    gid = await client.acceptInvite(code); // entra no grupo e devolve o id (...@g.us)
  } catch {
    try { const info = await client.getInviteInfo(code); gid = info && info.id && (info.id._serialized || info.id); }
    catch (e) { console.log('   (não resolvi o grupo de alertas pelo link:', e.message, ')'); }
  }
  if (gid) { grupoAvisosId = String(gid); console.log('   📣 grupo de alertas definido pelo link →', grupoAvisosId); }
  return grupoAvisosId;
}

async function acharGrupo(client) {
  if (grupoAvisosId) return grupoAvisosId;
  try {
    // getChats() pode travar em contas com muitos grupos -> timeout de 12s.
    const chats = await Promise.race([
      client.getChats(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('getChats timeout')), 12000)),
    ]);
    const g = chats.find((c) => c.isGroup && /avisos|alerta/i.test(c.name || ''));
    if (g) grupoAvisosId = g.id._serialized;
  } catch (e) { console.log('   (acharGrupo:', e.message, '— mande uma msg no grupo de alertas p/ cachear)'); }
  return grupoAvisosId;
}

// Anti-flood: mesmo aviso repetido em sequência (ex.: "sem crédito" a cada reação)
// enche o grupo e ensina todo mundo a ignorar. Guardamos o horário do último envio
// de cada texto e só reenviamos o mesmo depois da janela.
const ultimoAviso = new Map(); // texto -> ts
const JANELA_AVISO_MS = 10 * 60 * 1000;

/** Envia um aviso ao grupo AVISOS/ALERTA (melhor esforço). Retorna {ok, motivo}.
 *  Avisos idênticos são silenciados por 10min (a menos que forçado). */
async function avisar(client, texto, { forcar = false } = {}) {
  const agora = Date.now();
  if (!forcar) {
    const anterior = ultimoAviso.get(texto);
    if (anterior && agora - anterior < JANELA_AVISO_MS) {
      console.log('   (aviso repetido silenciado — mesma mensagem há <10min)');
      return { ok: true, silenciado: true };
    }
  }
  try {
    const id = await acharGrupo(client);
    if (!id) { console.log('   (grupo AVISOS/ALERTA não encontrado — o bot está nesse grupo?)'); return { ok: false, motivo: 'grupo nao encontrado (o bot esta no grupo ALERTA/AVISOS?)' }; }
    await client.sendMessage(id, texto);
    ultimoAviso.set(texto, agora);
    // Limpa entradas velhas para o Map não crescer sem fim.
    if (ultimoAviso.size > 200) for (const [k, t] of ultimoAviso) if (agora - t > JANELA_AVISO_MS) ultimoAviso.delete(k);
    console.log('   📣 aviso enviado:', texto);
    return { ok: true };
  } catch (e) {
    console.log('   (falha ao enviar aviso:', e.message, ')');
    return { ok: false, motivo: e.message };
  }
}

// ─────────── quando avisar (e quando ficar calado) ───────────
// A conexão da Baileys cai e volta sozinha o tempo todo — medido em 16/07/2026:
// 7 "quedas" em 14h, TODAS de 0 a 4 segundos, sem o bot parar um instante. Avisar
// cada uma enche o grupo de "RECUPERADA" e ensina todo mundo a ignorar o alerta —
// aí, no dia da queda real, ninguém olha. Só falamos de queda SUSTENTADA.
const QUEDA_MIN_MS = 3 * 60 * 1000; // 3 min desconectado = queda de verdade
let timerQueda = null;   // aguardando confirmar que a queda é real
let avisouQueda = false; // já mandamos o "CAIU"? só então faz sentido dizer "RECUPERADA"
let anunciouBoot = false; // "ONLINE" sai uma vez por processo, não a cada reconexão

/**
 * Chamado quando conecta. Aquece o cache do grupo AVISOS/ALERTA e decide se fala:
 *   • voltou de uma queda que ANUNCIAMOS  -> "RECUPERADA";
 *   • primeira conexão do processo        -> "ONLINE" (confirma que o deploy subiu);
 *   • reconexão de rotina (o caso comum)  -> silêncio.
 */
async function aoConectar(client, avisosLink) {
  // Reconectou: a queda não era real. Cancela o aviso que estava por sair.
  if (timerQueda) { clearTimeout(timerQueda); timerQueda = null; }

  // 1) define o grupo de alertas pelo link (entra nele) — método assertivo.
  if (avisosLink) await resolverAvisosPorLink(client, avisosLink);
  // 2) fallback: acha por nome (avisos/alerta) se o link não veio/resolveu.
  for (let i = 0; i < 18 && !grupoAvisosId; i++) {   // ~3 min tentando achar/cachear
    if (await acharGrupo(client)) break;
    await new Promise((r) => setTimeout(r, 10000));
  }

  if (avisouQueda) {
    avisouQueda = false;
    anunciouBoot = true;
    await avisar(client, `✅ *PrimeBet — integração RECUPERADA*\nO bot voltou ONLINE após uma queda.\n🕒 ${horaBR()}`);
    return;
  }
  if (!anunciouBoot) {
    anunciouBoot = true;
    await avisar(client, `✅ *PrimeBet — integração ONLINE*\nBot conectado, ouvindo os grupos (reações + despesas).\n🕒 ${horaBR()}`);
    return;
  }
  console.log('   (reconexão de rotina — sem aviso no grupo)');
}

/**
 * Chamado quando a conexão cai. NÃO avisa na hora: espera QUEDA_MIN_MS para ver se
 * volta sozinha (quase sempre volta, em segundos). Só avisa se continuar fora.
 */
async function aoDesconectar(client, motivo) {
  if (timerQueda || avisouQueda) return; // já tem aviso pendente/enviado p/ esta queda
  timerQueda = setTimeout(async () => {
    timerQueda = null;
    avisouQueda = true;
    await avisar(client, `⚠️ *PrimeBet — integração CAIU*\nMotivo: ${motivo}\nFora do ar há mais de ${QUEDA_MIN_MS / 60000} min. Pode ser necessário reescanear o QR.\n🕒 ${horaBR()}`);
  }, QUEDA_MIN_MS);
  console.log(`   (desconectou: ${motivo} — aguardando ${QUEDA_MIN_MS / 60000}min antes de avisar; reconexão rápida não gera alerta)`);
}

/** Alerta de autenticação (útil pra saber que está subindo). */
async function aoAutenticar(client) {
  await avisar(client, `🔐 *PrimeBet — autenticado*\nConexão estabelecida, finalizando sincronização…\n🕒 ${horaBR()}`);
}

module.exports = { avisar, aoConectar, aoDesconectar, aoAutenticar, resolverAvisosPorLink, horaBR, setGrupoAvisos, getGrupoAvisos };
