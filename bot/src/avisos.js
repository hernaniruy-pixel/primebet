// Avisos operacionais para um grupo "AVISOS" no WhatsApp (online/offline/heartbeat).
const horaBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());

let grupoAvisosId = null;
async function acharGrupo(client) {
  if (grupoAvisosId) return grupoAvisosId;
  try {
    const chats = await client.getChats();
    const g = chats.find((c) => c.isGroup && /avisos|alerta/i.test(c.name || ''));
    grupoAvisosId = g ? g.id._serialized : null;
  } catch { grupoAvisosId = null; }
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

let hbStarted = false;
/** Batimento periódico ("estou vivo") — a ausência dele indica que o bot caiu. */
function iniciarHeartbeat(client) {
  if (hbStarted) return;
  hbStarted = true;
  const horas = Number(process.env.HEARTBEAT_HORAS || 12);
  setInterval(() => avisar(client, `🟢 PrimeBet bot ativo — ${horaBR()}`), Math.max(1, horas) * 3600 * 1000);
}

module.exports = { avisar, iniciarHeartbeat, horaBR };
