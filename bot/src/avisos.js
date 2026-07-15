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

/** Envia um aviso ao grupo AVISOS/ALERTA (melhor esforço). Retorna {ok, motivo}. */
async function avisar(client, texto) {
  try {
    const id = await acharGrupo(client);
    if (!id) { console.log('   (grupo AVISOS/ALERTA não encontrado — o bot está nesse grupo?)'); return { ok: false, motivo: 'grupo nao encontrado (o bot esta no grupo ALERTA/AVISOS?)' }; }
    await client.sendMessage(id, texto);
    console.log('   📣 aviso enviado:', texto);
    return { ok: true };
  } catch (e) {
    console.log('   (falha ao enviar aviso:', e.message, ')');
    return { ok: false, motivo: e.message };
  }
}

// O grupo só recebe aviso quando algo acontece de fato: o bot CAIU ou VOLTOU
// de uma queda real. Reinício/redeploy/reconexão normal NÃO gera mensagem.
let caiu = false; // houve uma desconexão desde a última conexão?

/**
 * Chamado no 'ready'. Aquece o cache do grupo AVISOS/ALERTA em silêncio
 * (logo após o ready o getChats vem vazio, por isso tentamos por ~3 min) e
 * só anuncia se estivermos nos RECUPERANDO de uma queda — nunca no boot.
 */
async function aoConectar(client, avisosLink) {
  // 1) define o grupo de alertas pelo link (entra nele) — método assertivo.
  if (avisosLink) await resolverAvisosPorLink(client, avisosLink);
  // 2) fallback: acha por nome (avisos/alerta) se o link não veio/resolveu.
  for (let i = 0; i < 18 && !grupoAvisosId; i++) {   // ~3 min tentando achar/cachear
    if (await acharGrupo(client)) break;
    await new Promise((r) => setTimeout(r, 10000));
  }
  // 3) avisa SEMPRE que conecta (online) — e sinaliza se foi recuperação de queda.
  const msg = caiu
    ? `✅ *PrimeBet — integração RECUPERADA*\nO bot voltou ONLINE após uma queda.\n🕒 ${horaBR()}`
    : `✅ *PrimeBet — integração ONLINE*\nBot conectado, ouvindo os grupos (reações + despesas).\n🕒 ${horaBR()}`;
  caiu = false;
  await avisar(client, msg);
}

/** Chamado no 'disconnected'. Marca a queda e alerta o grupo (melhor esforço). */
async function aoDesconectar(client, motivo) {
  caiu = true;
  await avisar(client, `⚠️ *PrimeBet — integração CAIU*\nMotivo: ${motivo}\nPode ser necessário reescanear o QR. Verifiquem.\n🕒 ${horaBR()}`);
}

/** Alerta de autenticação (útil pra saber que está subindo). */
async function aoAutenticar(client) {
  await avisar(client, `🔐 *PrimeBet — autenticado*\nConexão estabelecida, finalizando sincronização…\n🕒 ${horaBR()}`);
}

module.exports = { avisar, aoConectar, aoDesconectar, aoAutenticar, resolverAvisosPorLink, horaBR, setGrupoAvisos, getGrupoAvisos };
