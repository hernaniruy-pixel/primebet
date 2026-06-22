// Boot do bot PrimeBet: conecta o WhatsApp e fica ouvindo as reações.
const fs = require('fs');
const path = require('path');
const { iniciarWhatsApp } = require('./whatsapp');
const { iniciarWebQR } = require('./webqr');
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
iniciarWebQR();                  // página web do QR (escanear no servidor)
iniciarWhatsApp();

// Mantém o processo vivo e loga erros não tratados (em vez de derrubar tudo).
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e && e.message ? e.message : e));
