// Boot do bot PrimeBet (Baileys): conecta o WhatsApp e fica ouvindo as reações.
//
// Nota: a versão antiga (whatsapp-web.js) precisava de um Chromium, e por isso
// tinha limpeza de locks, teto de cache e um watchdog que matava o processo quando
// a sincronização travava. Nada disso existe aqui — a Baileys fala o protocolo por
// WebSocket e reconecta sozinha.
const { iniciarWhatsApp } = require('./whatsapp');
const { iniciarWebQR } = require('./webqr');
const { limparImagensAntigas } = require('./conferencia');

console.log('🤖 PrimeBet bot — iniciando... (Baileys / sem navegador)');

iniciarWebQR(); // página web do QR (escanear no servidor)
iniciarWhatsApp().catch((e) => {
  console.error('❌ Falha ao iniciar o WhatsApp:', e && e.message);
  process.exit(1); // Railway (restartPolicy=ALWAYS) sobe de novo
});

// Retenção da Conferência: mantém só 2 semanas (atual + anterior). Roda ao subir e a cada 24h.
setTimeout(() => limparImagensAntigas().catch((e) => console.error('limpeza:', e.message)), 90 * 1000);
setInterval(() => limparImagensAntigas().catch((e) => console.error('limpeza:', e.message)), 24 * 3600 * 1000);

// Mantém o processo vivo e loga erros não tratados (em vez de derrubar tudo).
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e && e.message ? e.message : e));
