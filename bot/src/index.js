// Boot do bot PrimeBet: conecta o WhatsApp e fica ouvindo as reações.
const fs = require('fs');
const path = require('path');
const { iniciarWhatsApp } = require('./whatsapp');
const { iniciarWebQR, estaPronto, temQrPendente } = require('./webqr');
const { limparImagensAntigas } = require('./conferencia');
const { AUTH_PATH } = require('./config');

const BOOT = Date.now();
const WATCHDOG_MIN = Number(process.env.WATCHDOG_MIN || 6);

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

/**
 * Pastas de CACHE do Chromium: são descartáveis (o navegador recria) e crescem sem
 * limite dentro do volume da sessão (500 MB). Quando o volume lota, o WhatsApp Web
 * não termina de carregar -> o bot autentica mas nunca fica "pronto" -> o watchdog
 * mata o processo -> loop de reinício. Limpamos no boot, com o Chromium fechado.
 *
 * NÃO inclui IndexedDB / Local Storage / Session Storage: é onde mora o login.
 */
const CACHE_DIRS = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
  'GrShaderCache', 'ShaderCache', 'GraphiteDawnCache', 'component_crx_cache',
  'blob_storage', 'CacheStorage', 'ScriptCache', 'Crashpad',
]);
function limparCacheChromium(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  let n = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (CACHE_DIRS.has(e.name)) {
      try { fs.rmSync(p, { recursive: true, force: true }); n++; } catch {}
    } else {
      n += limparCacheChromium(p);
    }
  }
  return n;
}

console.log('🤖 PrimeBet bot — iniciando... (build com /status + lock-fix + cache-fix)');
limparLocksChromium(AUTH_PATH);  // limpa travas antes de abrir o Chromium
const cachesLimpos = limparCacheChromium(AUTH_PATH);
if (cachesLimpos) console.log(`🧹 ${cachesLimpos} pasta(s) de cache do Chromium removida(s) — libera espaço no volume.`);
iniciarWebQR();                  // página web do QR (escanear no servidor)
iniciarWhatsApp();

// Retenção da Conferência: mantém só 2 semanas (atual + anterior). Roda ao subir e a cada 24h.
setTimeout(() => limparImagensAntigas().catch((e) => console.error('limpeza:', e.message)), 90 * 1000);
setInterval(() => limparImagensAntigas().catch((e) => console.error('limpeza:', e.message)), 24 * 3600 * 1000);

/**
 * Watchdog: o servidor /health responde mesmo com o WhatsApp travado, então o
 * Railway não percebe o engasgo. Se passar WATCHDOG_MIN sem conectar E sem QR
 * pendente (ou seja: travou, não é espera de scan), forçamos a saída — o Railway
 * (restartPolicy=ALWAYS) sobe um container novo, com o Chromium limpo.
 */
setInterval(() => {
  const upMin = (Date.now() - BOOT) / 60000;
  if (upMin >= WATCHDOG_MIN && !estaPronto() && !temQrPendente()) {
    console.error(`⛔ watchdog: ${upMin.toFixed(1)}min sem conectar e sem QR pendente — reiniciando o processo para destravar.`);
    process.exit(1);
  }
}, 60 * 1000);

// Mantém o processo vivo e loga erros não tratados (em vez de derrubar tudo).
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e && e.message ? e.message : e));
