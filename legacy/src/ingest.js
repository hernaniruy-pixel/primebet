const store = require('./store');

let seq = 0;
function novoId() {
  // id numérico único e crescente (compatível com o painel)
  return Date.now() * 1000 + (seq++ % 1000);
}

// Carimbo "YYYY-MM-DD HH:MM" — mesmo formato que o painel usa nos filtros/ordenação.
function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Constrói o registro no formato que o painel PrimeBet consome e salva no store.
 * `final` = { jogo, odd, valor, casa }  (null em odd/valor => "em aberto")
 * `meta`  = { emoji, grupo, cliente }
 *
 * No painel, odd/val = 0 significa EM ABERTO (linha fica com contorno vermelho).
 */
function registrarBilhete(final, meta = {}) {
  const odd = final.odd == null ? 0 : Number(final.odd);
  const val = final.valor == null ? 0 : Number(final.valor);
  const rec = {
    id: novoId(),
    recebidoEm: new Date().toISOString(),
    dt: nowStamp(),
    grupo: meta.grupo || null,
    cliente: meta.cliente || null, // NOME do cliente no painel
    emoji: meta.emoji || null,
    jogo: final.jogo || '',
    odd,
    val,
    dc: final.casa || '',
    st: 'EM ABERTO',
    emAberto: { odd: final.odd == null, valor: final.valor == null },
  };
  store.adicionar(rec);
  return rec;
}

module.exports = { registrarBilhete };
