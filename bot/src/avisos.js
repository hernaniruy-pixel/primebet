// Avisos operacionais para um grupo "AVISOS" no WhatsApp (online/offline/heartbeat).
const horaBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());

let grupoAvisosId = null;
// Cacheia o ID do grupo de alertas a partir de uma mensagem recebida nele
// (rápido e direto — evita o getChats() que TRAVA quando há muitos grupos).
const setGrupoAvisos = (id) => { if (id) grupoAvisosId = id; };

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

/**
 * Anuncia "ONLINE" assim que o grupo AVISOS/ALERTA aparecer. Logo após o
 * 'ready' o client.getChats() costuma vir vazio/incompleto, então tentamos
 * por alguns minutos em vez de uma única vez.
 */
async function anunciarOnline(client) {
  for (let i = 0; i < 18; i++) {              // ~3 min de tentativas
    if (await acharGrupo(client)) { await avisar(client, `✅ PrimeBet bot ONLINE — ${horaBR()}`); return true; }
    await new Promise((r) => setTimeout(r, 10000));
  }
  console.log('   (grupo AVISOS/ALERTA não apareceu após ~3min — o bot está nesse grupo? o nome contém "avisos" ou "alerta"?)');
  return false;
}

let hbStarted = false;
/** Batimento periódico ("estou vivo") — a ausência dele indica que o bot caiu. */
function iniciarHeartbeat(client) {
  if (hbStarted) return;
  hbStarted = true;
  const horas = Number(process.env.HEARTBEAT_HORAS || 12);
  setInterval(() => avisar(client, `🟢 PrimeBet bot ativo — ${horaBR()}`), Math.max(1, horas) * 3600 * 1000);
}

module.exports = { avisar, anunciarOnline, iniciarHeartbeat, horaBR, setGrupoAvisos };
