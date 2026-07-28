// ════════════════════════════════════════════════════════════════
//  MARCA — identidade white-label do BOT (nome que aparece no WhatsApp).
//
//  Cliente novo NÃO mexe em código: define MARCA_NOME (e opcionalmente
//  MARCA_SITE) nas variáveis do serviço do bot (Railway). Sem env, cai no
//  padrão PrimeBet — o deploy atual continua idêntico.
// ════════════════════════════════════════════════════════════════
const env = (k, padrao) => {
  const v = process.env[k];
  return v && String(v).trim() ? String(v).trim() : padrao;
};

const MARCA = {
  nome: env('MARCA_NOME', 'PrimeBet'),
  site: env('MARCA_SITE', 'www.trackertipster.site'),
};

module.exports = { MARCA };
