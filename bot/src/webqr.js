const http = require('http');
const QR = require('qrcode');

// Estado atual do pareamento, alimentado pelos eventos do WhatsApp.
let estado = { qr: null, pronto: false };
const setQr = (qr) => { estado = { qr, pronto: false }; };
const setPronto = () => { estado = { qr: null, pronto: true }; };

// Função de teste de aviso (registrada pelo whatsapp.js) — acionável via /teste.
let testeFn = null;
const setTeste = (fn) => { testeFn = fn; };

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
    if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
    if (token && url.searchParams.get('t') !== token) { res.writeHead(401); return res.end('Acesso negado.'); }

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

module.exports = { iniciarWebQR, setQr, setPronto, setTeste };
