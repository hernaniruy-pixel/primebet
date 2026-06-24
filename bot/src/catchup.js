// Rede de segurança: o WhatsApp-web NÃO reentrega mensagens recebidas enquanto
// a conexão esteve caída. Este módulo relê as mensagens recentes dos grupos
// conhecidos (despesas + bilhetes) quando o bot (re)conecta e periodicamente,
// reprocessando o que se perdeu. É IDEMPOTENTE (msg_id único + checagem prévia),
// então reprocessar o que já está no banco não duplica nada.
const { sb } = require('./ingest');

const grupos = new Map(); // grupoId -> 'despesa' | 'bilhete'

/** Aprende um grupo ao vivo (chamado pelos handlers de mensagem). */
function lembrarGrupo(id, kind) { if (id && kind) grupos.set(id, kind); }

/** Aprende os grupos a partir do banco: clientes com grupo_id (bilhetes) e despesas (grupo de despesa). */
async function bootstrapGrupos() {
  try {
    const { data: cli } = await sb.from('clientes').select('grupo_id').not('grupo_id', 'is', null);
    for (const c of cli || []) if (c.grupo_id) grupos.set(c.grupo_id, 'bilhete');
  } catch (e) { console.error('   catchup bootstrap clientes:', e.message); }
  try {
    const { data: dsp } = await sb.from('despesas').select('grupo_id').not('grupo_id', 'is', null).limit(500);
    for (const d of dsp || []) if (d.grupo_id) grupos.set(d.grupo_id, 'despesa');
  } catch (e) { console.error('   catchup bootstrap despesas:', e.message); }
  console.log(`🛟 catch-up: ${grupos.size} grupo(s) conhecido(s).`);
}

let rodando = false;
/**
 * Relê as últimas `limite` mensagens de cada grupo conhecido (dentro de `janelaHoras`)
 * e reprocessa via os callbacks recebidos. Os callbacks devem ser idempotentes e
 * retornar true só quando criaram algo novo (para a contagem do log).
 */
async function rodarCatchup(client, { processarDespesa, processarImagem, janelaHoras = 6, limite = 25 } = {}) {
  if (rodando) return;                 // evita sobreposição (ready + intervalo)
  if (!grupos.size) return;
  rodando = true;
  const corte = Date.now() / 1000 - janelaHoras * 3600;
  let despN = 0, imgN = 0;
  try {
    for (const [id, kind] of grupos) {
      let chat;
      try {
        chat = await Promise.race([
          client.getChatById(id),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
        ]);
      } catch { continue; }            // grupo inacessível agora — tenta no próximo ciclo
      let msgs;
      try { msgs = await chat.fetchMessages({ limit: limite }); } catch { continue; }
      const nome = chat.name || '';
      for (const msg of msgs || []) {
        if ((msg.timestamp || 0) < corte) continue; // só o período recente
        try {
          if (kind === 'despesa') { if (msg.body && await processarDespesa(msg, chat, nome)) despN++; }
          else if (await processarImagem(msg, chat, nome)) imgN++;
        } catch { /* item problemático: ignora e segue */ }
      }
    }
  } finally { rodando = false; }
  if (despN || imgN) console.log(`🛟 catch-up recuperou: ${despN} despesa(s), ${imgN} imagem(ns).`);
}

module.exports = { lembrarGrupo, bootstrapGrupos, rodarCatchup };
