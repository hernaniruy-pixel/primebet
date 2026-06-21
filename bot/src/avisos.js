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

/** Envia um aviso ao grupo AVISOS (melhor esforço). */
async function avisar(client, texto) {
  try {
    const id = await acharGrupo(client);
    if (!id) { console.log('   (grupo AVISOS não encontrado — crie um grupo com "AVISOS" no nome e adicione o bot)'); return; }
    await client.sendMessage(id, texto);
    console.log('   📣 aviso enviado:', texto);
  } catch (e) {
    console.log('   (falha ao enviar aviso:', e.message, ')');
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
