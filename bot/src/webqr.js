const http = require('http');
const QR = require('qrcode');

const BOOT = Date.now(); // para medir uptime via /health (diagnóstico de reinícios)
// Commit em produção — a Railway injeta RAILWAY_GIT_COMMIT_SHA no deploy. Expor no
// /health tira a adivinhação de "o deploy novo já subiu?": basta comparar o SHA.
const COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'dev').slice(0, 7);

// Estado atual do pareamento, alimentado pelos eventos do WhatsApp.
let estado = { qr: null, pronto: false };
const setQr = (qr) => { estado = { qr, pronto: false }; };
const setPronto = () => { estado = { qr: null, pronto: true }; };

// Função de teste de aviso (registrada pelo whatsapp.js) — acionável via /teste.
let testeFn = null;
const setTeste = (fn) => { testeFn = fn; };

// Falha FALSA no /ready, para testar o alarme do monitor externo sem derrubar o bot.
// Um alarme nunca testado não é um alarme — é uma suposição. Ligado/desligado por
// /simular-queda?t=TOKEN&on=1|0 (protegido pelo QR_TOKEN). Volta ao normal sozinho
// em 15 min, caso alguém esqueça ligado.
let falhaSimulada = false;
let falhaTimer = null;


/**
 * Sobe um mini site que mostra o QR como IMAGEM (escaneável) e o status.
 * No Railway/Render o serviço ganha uma URL pública; abra-a para parear.
 * Protegido por token opcional (QR_TOKEN): acesse com ?t=SEU_TOKEN.
 */
function iniciarWebQR() {
  const port = process.env.PORT || 8080;
  const token = process.env.QR_TOKEN || '';

  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    if (url.pathname === '/health') {
      // SEMPRE 200: é a sonda da Railway. Se devolvesse erro com o WhatsApp caído,
      // a Railway acharia o container quebrado e entraria em laço de reinício.
      const up = Math.floor((Date.now() - BOOT) / 1000);
      res.writeHead(200, { 'Content-Type': 'text/plain', ...cors });
      return res.end(`ok up=${up}s pronto=${estado.pronto} commit=${COMMIT}`);
    }

    // /ready: para monitor externo (UptimeRobot e afins). 200 = WhatsApp conectado,
    // 503 = caiu. É o que faz o alerta disparar sozinho, sem depender do WhatsApp
    // do bot — que é justamente o canal que morre quando o problema acontece.
    if (url.pathname === '/ready') {
      const up = Math.floor((Date.now() - BOOT) / 1000);
      if (falhaSimulada) {
        res.writeHead(503, { 'Content-Type': 'text/plain', ...cors });
        return res.end(`FALHA SIMULADA (teste do alarme) up=${up}s`);
      }
      const ok = estado.pronto;
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'text/plain', ...cors });
      return res.end(ok
        ? `ok whatsapp=conectado up=${up}s`
        : `FALHA whatsapp=desconectado up=${up}s${estado.qr ? ' (aguardando leitura do QR)' : ''}`);
    }
    if (token && url.searchParams.get('t') !== token) { res.writeHead(401, cors); return res.end('Acesso negado.'); }


    // Liga/desliga a falha falsa do /ready (só afeta o monitor; o bot segue intacto).
    if (url.pathname === '/simular-queda') {
      falhaSimulada = url.searchParams.get('on') === '1';
      if (falhaTimer) { clearTimeout(falhaTimer); falhaTimer = null; }
      if (falhaSimulada) falhaTimer = setTimeout(() => { falhaSimulada = false; console.log('🔕 falha simulada expirou sozinha — /ready normalizado'); }, 15 * 60 * 1000);
      console.log(falhaSimulada ? '🔔 falha SIMULADA ligada — /ready vai responder 503 (bot continua normal)' : '🔕 falha simulada desligada — /ready normalizado');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...cors });
      return res.end(falhaSimulada ? 'falha simulada LIGADA (expira em 15min)' : 'falha simulada DESLIGADA');
    }

    // Dispara um aviso de teste no grupo ALERTA/AVISOS (pra validar o canal).
    if (url.pathname === '/teste') {
      if (!testeFn) { res.writeHead(503); return res.end('bot ainda nao pronto'); }
      const r = await testeFn();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(r && r.ok ? 'OK: aviso enviado ao grupo' : 'FALHOU: ' + ((r && r.motivo) || '?'));
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const head = '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;text-align:center;background:#13200a;color:#eee;padding:30px}img{background:#fff;padding:12px;border-radius:12px}</style>';
    if (estado.pronto) return res.end(`${head}<meta http-equiv="refresh" content="15"><h2>✅ Bot conectado</h2><p>Tudo certo. Pode fechar.</p>`);
    if (!estado.qr) return res.end(`${head}<meta http-equiv="refresh" content="4"><h2>Aguardando QR…</h2>`);
    const dataUrl = await QR.toDataURL(estado.qr, { width: 320, margin: 2 });
    res.end(`${head}<meta http-equiv="refresh" content="20"><h2>PrimeBet — parear o bot</h2><img src="${dataUrl}" alt="QR"><p>WhatsApp do bot → Aparelhos conectados → Conectar um aparelho</p><small>O código renova sozinho.</small>`);
  }).listen(port, () => console.log(`🌐 Página do QR ativa na porta ${port}`));
}

// Consultas de estado para o watchdog (index.js): conectado? tem QR esperando scan?
const estaPronto = () => estado.pronto;
const temQrPendente = () => !!estado.qr;

module.exports = { iniciarWebQR, setQr, setPronto, setTeste, estaPronto, temQrPendente };
