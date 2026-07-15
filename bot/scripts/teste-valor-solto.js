/**
 * Testa a captura do valor escrito solto no grupo, nas DUAS ordens que o cliente usa:
 *   A) print primeiro, valor depois   -> gruda no print já registrado (via banco)
 *   B) valor primeiro, print depois   -> fica aguardando e entra na próxima imagem
 * Também garante que texto que NÃO é valor não encosta em nada.
 *
 * Roda contra o banco real, em um grupo de teste, e limpa tudo no fim:
 *   node scripts/teste-valor-solto.js
 */
require('dotenv').config();
const { _teste } = require('../src/whatsapp');
const { registrarImagemRecebida, legendaPorMsg } = require('../src/conferencia');
const { sb } = require('../src/ingest');
const { parseValor } = require('../src/valor');

const GID = 'TESTE_VALOR_SOLTO@g.us';
const NOME = 'Grupo de teste';
const msgTexto = (t) => ({ key: { id: 'T' + Date.now() + Math.random(), remoteJid: GID }, message: { conversation: t } });

let ok = 0, tot = 0;
const check = (desc, cond, extra = '') => { tot++; if (cond) ok++; console.log(`${cond ? '✓' : '✗'} ${desc}${extra ? ' — ' + extra : ''}`); };

/**
 * Simula a chegada de um print, passando pela MESMA decisão de legenda que o bot usa
 * (escolherLegendaDaImagem), sem precisar de socket nem download de mídia.
 */
async function novaImagem(msgId, legendaColadaNaImagem = '') {
  const { legenda } = _teste.escolherLegendaDaImagem(GID, legendaColadaNaImagem);
  await registrarImagemRecebida({
    grupoId: GID, grupoNome: NOME, clienteId: null, msgId,
    remetente: 'teste', enviadoEm: new Date().toISOString(), base64: null, legenda,
  });
}

(async () => {
  await sb.from('imagens_recebidas').delete().eq('grupo_id', GID);

  // ── A) print primeiro, valor depois ──
  console.log('\n— A) cliente manda o PRINT e escreve o valor EMBAIXO —');
  const A = 'A_' + Date.now();
  await novaImagem(A);
  await _teste.tratarValorSolto(msgTexto('1300'), GID, NOME);
  const legA = await legendaPorMsg(A);
  check('valor grudou no print anterior', legA === '1300', `legenda="${legA}"`);
  check('vira R$ 1300 na aposta', parseValor(legA) === 1300);

  // ── B) valor primeiro, print depois (o caso que apareceu em produção) ──
  console.log('\n— B) cliente escreve o VALOR e manda o print DEPOIS —');
  const B = 'B_' + Date.now();
  await _teste.tratarValorSolto(msgTexto('250'), GID, NOME); // sem print ainda -> anota
  await novaImagem(B, ''); // print chega sem legenda -> deve pegar o valor anotado
  const legB = await legendaPorMsg(B);
  check('valor anotado entrou no print seguinte', legB === '250', `legenda="${legB}"`);
  check('vira R$ 250 na aposta', parseValor(legB) === 250);

  // ── C) valor anotado não pode vazar para um print que já tem legenda ──
  console.log('\n— C) print com legenda própria tem prioridade —');
  const C = 'C_' + Date.now();
  await _teste.tratarValorSolto(msgTexto('999'), GID, NOME);
  await novaImagem(C, '500'); // legenda própria
  const legC = await legendaPorMsg(C);
  check('legenda da imagem prevalece', legC === '500', `legenda="${legC}"`);
  check('o 999 continua guardado p/ o próximo print', _teste.consumirValorAguardando(GID) === '999');

  // ── D) conversa normal não pode virar valor ──
  console.log('\n— D) texto que não é valor é ignorado —');
  const D = 'D_' + Date.now();
  await novaImagem(D);
  for (const t of ['vai dar green no 2 jogo', 'bom dia', 'odd 1.83']) {
    const pegou = await _teste.tratarValorSolto(msgTexto(t), GID, NOME);
    check(`"${t}" ignorado`, pegou === false);
  }
  const legD = await legendaPorMsg(D);
  check('print continuou sem legenda', !legD, `legenda=${JSON.stringify(legD)}`);

  // ── E) print ANTIGO não pode roubar o valor do print novo (lançaria na aposta errada) ──
  console.log('\n— E) print antigo (fora da janela) não recebe o valor —');
  await sb.from('imagens_recebidas').delete().eq('grupo_id', GID);
  const E = 'E_' + Date.now();
  const horaAntiga = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min atrás
  await registrarImagemRecebida({
    grupoId: GID, grupoNome: NOME, clienteId: null, msgId: E,
    remetente: 'teste', enviadoEm: horaAntiga, base64: null, legenda: '',
  });
  await _teste.tratarValorSolto(msgTexto('7000'), GID, NOME);
  const legE = await legendaPorMsg(E);
  check('print de 20min atrás NÃO recebeu o valor', !legE, `legenda=${JSON.stringify(legE)}`);
  check('valor ficou aguardando o próximo print', _teste.consumirValorAguardando(GID) === '7000');

  await sb.from('imagens_recebidas').delete().eq('grupo_id', GID);
  console.log(`\n${ok}/${tot} OK`);
  process.exit(ok === tot ? 0 : 1);
})();
