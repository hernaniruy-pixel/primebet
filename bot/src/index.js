// Boot do bot PrimeBet: conecta o WhatsApp e fica ouvindo as reações.
const fs = require('fs');
const path = require('path');
const { iniciarWhatsApp } = require('./whatsapp');
const { iniciarWebQR, setImport } = require('./webqr');
const { limparImagensAntigas } = require('./conferencia');
const { importarApostas } = require('./importador');
const { AUTH_PATH } = require('./config');

/**
 * Remove travas do Chromium (Singleton*) deixadas por um encerramento abrupto
 * (ex.: redeploy). Sem isso, com a sessão num volume persistente, o Chromium
 * recusa abrir ("profile appears to be in use by another Chromium process").
 */
function limparLocksChromium(dir) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const nome of entries) {
    const p = path.join(dir, nome);
    let st;
    try { st = fs.lstatSync(p); } catch { continue; }
    if (st.isDirectory()) limparLocksChromium(p);
    else if (/^Singleton/.test(nome)) { try { fs.unlinkSync(p); console.log('🧹 lock do Chromium removido:', nome); } catch {} }
  }
}

console.log('🤖 PrimeBet bot — iniciando... (build com /status + lock-fix)');
limparLocksChromium(AUTH_PATH);  // limpa travas antes de abrir o Chromium
setImport(importarApostas);      // habilita o POST /importar (import temporário JM->PrimeBet)
iniciarWebQR();                  // página web do QR (escanear no servidor)
iniciarWhatsApp();

// Retenção da Conferência: mantém só 2 semanas (atual + anterior). Roda ao subir e a cada 24h.
setTimeout(() => limparImagensAntigas().catch((e) => console.error('limpeza:', e.message)), 90 * 1000);
setInterval(() => limparImagensAntigas().catch((e) => console.error('limpeza:', e.message)), 24 * 3600 * 1000);

// Mantém o processo vivo e loga erros não tratados (em vez de derrubar tudo).
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e && e.message ? e.message : e));
