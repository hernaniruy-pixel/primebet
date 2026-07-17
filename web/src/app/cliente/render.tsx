import type { ReactNode } from 'react';

/** Jogador em destaque ("Djed Spence:" / "[Jogador]"), igual ao painel. */
function destacarJogador(texto: string, k: number) {
  const m = texto.match(/^(.*?)(\[[^\]]+\])(.*)$/) || texto.match(/^([•\s]*)([^:•]+:)(.*)$/);
  if (!m) return <span key={k}>{texto}</span>;
  return <span key={k}>{m[1]}<span className="text-teal-700">{m[2]}</span>{m[3]}</span>;
}

/**
 * Renderiza o campo "jogo" na MESMA formatação do painel admin: confronto em
 * laranja e negrito, jogador destacado, mercados em cinza. Quem usa os dois lados
 * precisa reconhecer o bilhete na hora — não pode mudar de cara de uma tela p/ outra.
 * (A fonte monoespaçada vem de quem chama, na célula/card.)
 */
export function renderJogoLinhas(jogo: string): ReactNode {
  return (jogo || '').split('\n').map((line, i) => {
    const t = line.trimStart();
    const isGame = /^\d+\)/.test(t) || (/\(odd/i.test(line) && !t.startsWith('•'));
    if (isGame) {
      const pm = line.match(/^(\s*\d+\)\s*)?([\s\S]*)$/);
      const pref = pm?.[1] ?? '';
      const body = pm?.[2] ?? line;
      const om = body.match(/^(.*?)(\s*\(odd.*)$/i);
      const teams = (om ? om[1] : body).trim();
      const rest = om ? om[2].trim() : '';
      return (
        <div key={i} className="font-bold text-orange-600">
          <span className="font-normal text-slate-400">{pref}</span>{teams}{rest ? ` ${rest}` : ''}
        </div>
      );
    }
    return <div key={i} className="text-slate-700">{destacarJogador(line, i)}</div>;
  });
}
