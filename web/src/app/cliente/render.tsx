import type { ReactNode } from 'react';

/** Renderiza o campo "jogo" deixando os nomes dos times em negrito (igual ao painel admin). */
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
      return <div key={i}>{pref}<b className="font-bold">{teams}</b>{rest ? ` ${rest}` : ''}</div>;
    }
    return <div key={i}>{line}</div>;
  });
}
