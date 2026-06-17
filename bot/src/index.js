// Boot do bot PrimeBet: conecta o WhatsApp e fica ouvindo as reações.
const { iniciarWhatsApp } = require('./whatsapp');

console.log('🤖 PrimeBet bot — iniciando...');
iniciarWhatsApp();

// Mantém o processo vivo e loga erros não tratados (em vez de derrubar tudo).
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e && e.message ? e.message : e));
