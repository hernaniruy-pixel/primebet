const { startApi } = require('./api');
const { HABILITAR_WHATSAPP } = require('./config');

startApi();

if (HABILITAR_WHATSAPP) {
  // carregado só quando habilitado (evita iniciar o navegador em testes de transcrição)
  const { iniciarWhatsApp } = require('./whatsapp');
  iniciarWhatsApp();
} else {
  console.log('ℹ️  WhatsApp desabilitado (HABILITAR_WHATSAPP=false). Rodando só a API.');
}
