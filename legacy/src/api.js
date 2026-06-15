const express = require('express');
const path = require('path');
const store = require('./store');
const { registrarBilhete } = require('./ingest');
const { PORT, EMOJI_REGRAS } = require('./config');

function startApi() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Painel estático (coloque primebet.html em /public para abrir em http://localhost:PORT)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // Lista os bilhetes recebidos. ?desde=ISO retorna só os mais novos (para o painel fazer polling).
  app.get('/api/bilhetes', (req, res) => {
    let arr = store.listar();
    if (req.query.desde) {
      const t = new Date(req.query.desde).getTime();
      arr = arr.filter((b) => new Date(b.recebidoEm).getTime() > t);
    }
    res.json(arr);
  });

  // Ingestão manual (para testes sem WhatsApp). Já recebe os campos finais.
  // body: { jogo, odd|null, valor|null, casa, cliente, emoji }
  app.post('/api/bilhetes', (req, res) => {
    const { jogo, odd = null, valor = null, casa = null, cliente = null, emoji = null } = req.body || {};
    if (!jogo) return res.status(400).json({ erro: 'campo "jogo" é obrigatório' });
    const rec = registrarBilhete({ jogo, odd, valor, casa }, { emoji, cliente });
    res.status(201).json(rec);
  });

  // Lista as regras de emoji (útil para conferência).
  app.get('/api/regras', (req, res) => {
    res.json(Object.entries(EMOJI_REGRAS).map(([emoji, r]) => ({ emoji, ...r })));
  });

  app.listen(PORT, () => console.log(`🌐 API/painel em http://localhost:${PORT}`));
  return app;
}

module.exports = { startApi };
