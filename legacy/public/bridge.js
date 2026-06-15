/**
 * PONTE PAINEL <-> API DE INTEGRAÇÃO
 *
 * Como usar:
 * 1) Coloque o primebet.html dentro da pasta /public deste projeto.
 * 2) Antes de </body> no primebet.html, adicione:
 *        <script src="bridge.js"></script>
 * 3) Abra o painel por http://localhost:3000 (servido pela API), NÃO por file://.
 *
 * A cada 5s ele busca os bilhetes novos e os injeta no painel via window.receberBilhete().
 * Os bilhetes já vêm como EM ABERTO; odd/valor zerados aparecem com contorno vermelho.
 *
 * Anti-duplicação: o "último recebido" e os ids já importados ficam salvos no
 * localStorage. Assim, recarregar a página NÃO reimporta o histórico inteiro
 * (os bilhetes já estão no pb_data do painel).
 */
(function () {
  const API = ''; // mesma origem (servido pela própria API). Ex.: 'http://localhost:3000' se for separado.
  const LS_ULT = 'pb_bridge_ultimo';
  const LS_VIS = 'pb_bridge_vistos';

  let ultimo;
  try { ultimo = localStorage.getItem(LS_ULT) || new Date(0).toISOString(); }
  catch (e) { ultimo = new Date(0).toISOString(); }

  let vistos;
  try { vistos = new Set(JSON.parse(localStorage.getItem(LS_VIS) || '[]')); }
  catch (e) { vistos = new Set(); }

  function persistVistos() {
    try {
      // mantém só os últimos 500 ids para o storage não crescer sem limite
      const arr = Array.from(vistos).slice(-500);
      vistos = new Set(arr);
      localStorage.setItem(LS_VIS, JSON.stringify(arr));
    } catch (e) {}
  }

  async function puxar() {
    try {
      const r = await fetch(`${API}/api/bilhetes?desde=${encodeURIComponent(ultimo)}`);
      if (!r.ok) return;
      const lista = await r.json();
      let mudou = false;
      // a API retorna do mais novo para o mais antigo; injeta na ordem cronológica
      lista.slice().reverse().forEach((b) => {
        if (vistos.has(b.id)) return;
        vistos.add(b.id);
        mudou = true;
        if (typeof window.receberBilhete === 'function') {
          window.receberBilhete({
            cliente: b.cliente,   // NOME do cliente cadastrado no painel
            jogo: b.jogo,
            odd: b.odd,           // 0 = em aberto
            val: b.val,           // 0 = em aberto
            dc: b.dc,
          });
        }
        if (b.recebidoEm > ultimo) {
          ultimo = b.recebidoEm;
          try { localStorage.setItem(LS_ULT, ultimo); } catch (e) {}
        }
      });
      if (mudou) persistVistos();
    } catch (e) {
      // silencioso: API pode estar reiniciando
    }
  }

  setInterval(puxar, 5000);
  puxar();
  console.log('[bridge] integração PrimeBet ativa (polling a cada 5s).');
})();
