'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { ExtratoResp, SemanaExtrato } from './types';
import { contestarAposta, sairCliente } from './actions';
import { renderJogoLinhas } from './render';
import type { Reg } from '../admin/types';
import { partesTs } from '../admin/types';

// Mesmas cores de status do painel admin — o cliente e o operador têm que estar
// olhando para a mesma coisa quando falam ao telefone.
const STPILL: Record<string, string> = {
  'EM ABERTO': 'bg-violet-200 text-violet-900',
  'GREEN': 'bg-green-600 text-white',
  'MEIO GREEN': 'bg-green-300 text-green-900',
  'MEIO RED': 'bg-red-300 text-red-900',
  'RED': 'bg-red-600 text-white',
  'REEMBOLSO': 'bg-yellow-400 text-yellow-900',
};

// Selo do card: fundo e contorno na mesma família (igual ao painel).
const CARD_COR: Record<string, string> = {
  slate: 'border-slate-300 bg-slate-100 text-slate-600',
  blue: 'border-blue-300 bg-blue-100 text-blue-600',
  violet: 'border-violet-300 bg-violet-100 text-violet-600',
  destaque: 'border-amber-400 bg-amber-200/60 text-amber-700',
};

// Campos iguais aos do painel (o foco âmbar é a identidade da casa).
const inp = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const lbl = 'mb-1 block text-[11px] font-medium text-slate-400';

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clr = (n: number) => (n > 0 ? 'text-emerald-600' : n < 0 ? 'text-rose-600' : 'text-slate-900');

// Status que o cliente pode apontar como correto ao contestar (sem "EM ABERTO").
const STATUS_OPCOES = ['GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO'];
const STBTN: Record<string, string> = {
  'GREEN': 'border-green-300 text-green-700',
  'MEIO GREEN': 'border-green-200 text-green-600',
  'MEIO RED': 'border-red-200 text-red-600',
  'RED': 'border-red-300 text-red-700',
  'REEMBOLSO': 'border-yellow-300 text-yellow-700',
};

export default function Extrato({ dados }: { dados: ExtratoResp }) {
  const [aba, setAba] = useState<'atual' | 'passada'>('atual');
  const sem: SemanaExtrato = aba === 'atual' ? dados.atual : dados.passada;
  // A odd que vale para o cliente já é a do bilhete MENOS o desconto do cadastro dele —
  // é sobre ela que o saldo é calculado. Mostrar a odd cheia aqui só geraria dúvida.
  const oddDoCliente = (odd: number) => Math.max(odd - (dados.cliente.desc || 0), 0);
  // ── Filtros. As linhas da semana já vieram inteiras do servidor, então filtrar
  // é só recortar em memória: a tela responde na hora, sem nova consulta.
  const [busca, setBusca] = useState('');
  const [fSt, setFSt] = useState('');
  const [fData, setFData] = useState('');
  const filtrando = !!(busca.trim() || fSt || fData);
  const limpar = () => { setBusca(''); setFSt(''); setFData(''); };

  const rows = useMemo(() => sem.rows.filter((r) => {
    if (fSt && r.st !== fSt) return false;
    // r.dt é 'HH:mm DD/MM/AA'; o <input type=date> dá 'AAAA-MM-DD'.
    if (fData) {
      const [ano, mes, dia] = fData.split('-');
      if (partesTs(r.dt).data !== `${dia}/${mes}/${ano.slice(-2)}`) return false;
    }
    if (busca.trim() && !r.jogo.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  }), [sem.rows, busca, fSt, fData]);

  // Os cards descrevem o que está na tela. Mostrar o total da semana com a lista
  // filtrada faria o cliente conferir pelo número errado.
  const tot = useMemo(() => ({
    entradas: rows.reduce((s, r) => s + r.val, 0),
    saldo: rows.reduce((s, r) => s + r.sl, 0),
    abertas: rows.filter((r) => r.st === 'EM ABERTO').length,
  }), [rows]);

  const router = useRouter();
  const [pend, startTransition] = useTransition();
  const [contestando, setContestando] = useState<Reg | null>(null);
  const [motivo, setMotivo] = useState('');
  const [stSugerido, setStSugerido] = useState('');
  const [msg, setMsg] = useState('');

  function abrirContestacao(r: Reg) { setContestando(r); setMotivo(''); setStSugerido(''); setMsg(''); }

  function enviarContestacao() {
    if (!contestando) return;
    startTransition(async () => {
      const r = await contestarAposta(contestando.id, motivo, stSugerido || undefined);
      if (r.ok) { setContestando(null); router.refresh(); }
      else setMsg(r.erro || 'Erro.');
    });
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Topo */}
      <header className="bg-gradient-to-r from-[#13200a] to-[#1e2f10] text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="PrimeBet" width={40} height={40} style={{ borderRadius: 10 }} />
            <div>
              <div className="text-sm font-semibold text-[#DAA520]">PrimeBet</div>
              <div className="text-xs text-slate-300">Olá, {dados.cliente.nome}</div>
            </div>
          </div>
          <button onClick={() => startTransition(() => sairCliente())} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">
            Sair
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-5">
        {/* Resumo — mesmas cores do painel: azul = entrada, roxo = em aberto,
            dourado = o número que o cliente abre a tela para ver. */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card icone="💰" cor="slate" titulo="Calção" valor={brl(dados.cliente.cal)} valorCls="text-slate-900" />
          <Card icone="⇄" cor="blue" titulo={filtrando ? 'Entradas (filtro)' : 'Entradas (semana)'} valor={brl(tot.entradas)} valorCls={tot.entradas ? 'text-blue-600' : 'text-slate-900'} />
          <Card icone="🕐" cor="violet" titulo="Em aberto" valor={String(tot.abertas)} valorCls={tot.abertas ? 'text-violet-700' : 'text-slate-900'} />
          <Card icone="★" cor="destaque" destaque titulo={filtrando ? 'Saldo (filtro)' : 'Saldo da semana'} valor={brl(tot.saldo)} valorCls={clr(tot.saldo)} />
        </div>

        {/* Abas semana. No celular o período ia na mesma linha dos dois botões e
            empurrava a largura da página; agora ele quebra para baixo. */}
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {(['atual', 'passada'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
                  aba === k ? 'bg-[#13200a] text-[#DAA520]' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {k === 'atual' ? 'Semana atual' : 'Semana passada'}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            {fmtDia(sem.d1)} a {fmtDia(sem.d2)}
          </span>
        </div>

        {/* FILTROS — o cliente não tinha nenhum: para achar um bilhete precisava
            varrer a semana inteira com o olho. */}
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-2">
              <span className={lbl}>Buscar jogo / time</span>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex: Argentina" className={inp} />
            </div>
            <div>
              <span className={lbl}>Status</span>
              <select value={fSt} onChange={(e) => setFSt(e.target.value)} className={inp}>
                <option value="">Todos</option>
                {['EM ABERTO', ...STATUS_OPCOES].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <span className={lbl}>Dia</span>
              <input type="date" value={fData} onChange={(e) => setFData(e.target.value)} min={sem.d1} max={sem.d2} className={inp} />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {filtrando ? `${rows.length} de ${sem.rows.length} aposta(s)` : `${sem.rows.length} aposta(s) na semana`}
            </span>
            {filtrando && (
              <button onClick={limpar} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                🗑️ Limpar
              </button>
            )}
          </div>
        </div>

        {/* MOBILE: um card por bilhete. A tabela tem 7 colunas e min-w 640px —
            num celular de 375px ela virava uma gaveta horizontal onde o cliente
            só via "Data" e precisava arrastar para achar o próprio saldo. */}
        <div className="space-y-2 sm:hidden">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs leading-tight text-slate-500">
                  {(() => { const p = partesTs(r.dt); return (<>
                    <span className="font-medium text-slate-700">{p.hora}</span>
                    <span className="ml-1.5 text-[11px] text-slate-400">{p.data}</span>
                  </>); })()}
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STPILL[r.st] ?? 'bg-slate-100 text-slate-600'}`}>{r.st}</span>
              </div>

              {r.ct && <span className="mb-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">⚠️ Contestada</span>}
              <div className="break-words font-mono text-[11px] leading-snug">{renderJogoLinhas(r.jogo)}</div>

              <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Odd</div>
                  <div className="tabular-nums text-slate-800">{r.odd ? brl(oddDoCliente(r.odd)) : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Valor</div>
                  <div className="tabular-nums text-slate-800">{r.val ? brl(r.val) : <span className="text-slate-400">aberto</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Saldo</div>
                  <div className={`font-semibold tabular-nums ${clr(r.sl)}`}>{brl(r.sl)}</div>
                </div>
              </div>

              {r.st !== 'EM ABERTO' && !r.ct && (
                <button onClick={() => abrirContestacao(r)} className="mt-2.5 w-full rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 active:bg-slate-50">
                  Contestar
                </button>
              )}
              {r.ct && <div className="mt-2 text-center text-[11px] text-rose-500">em análise</div>}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-10 text-center text-slate-400">Nenhuma aposta nesta semana.</div>
          )}
        </div>

        {/* DESKTOP: a tabela de sempre */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
          <table className="w-full min-w-[640px] text-sm text-slate-800">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Jogo</th>
                <th className="px-3 py-2 text-right">Odd</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b-2 border-slate-200 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs leading-tight text-slate-500">
                    {(() => { const p = partesTs(r.dt); return (<>
                      <div className="font-medium text-slate-700">{p.hora}</div>
                      <div className="text-[11px] text-slate-400">{p.data}</div>
                    </>); })()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-[340px] font-mono text-[11px] leading-snug">
                      {r.ct && <span className="mr-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">⚠️ Contestada</span>}
                      {renderJogoLinhas(r.jogo)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.odd ? brl(oddDoCliente(r.odd)) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.val ? brl(r.val) : <span className="text-slate-300">aberto</span>}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STPILL[r.st] ?? 'bg-slate-100 text-slate-600'}`}>{r.st}</span>
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${clr(r.sl)}`}>{brl(r.sl)}</td>
                  <td className="px-3 py-2 text-center">
                    {r.st !== 'EM ABERTO' && !r.ct && (
                      <button onClick={() => abrirContestacao(r)} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-rose-400 hover:text-rose-600">
                        Contestar
                      </button>
                    )}
                    {r.ct && <span className="text-[11px] text-rose-500">em análise</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Nenhuma aposta nesta semana.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-center text-[11px] text-slate-400">
          Para contestar, descreva o motivo. A aposta volta para conferência da banca.
        </p>
      </div>

      {/* Modal de contestação */}
      {contestando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setContestando(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-base font-semibold text-slate-800">Contestar aposta #{contestando.id}</h3>
            <p className="mb-3 text-xs text-slate-500">{renderJogoLinhas(contestando.jogo)}</p>

            <div className="mb-3 rounded-lg bg-slate-50 p-3">
              <div className="mb-1 text-xs text-slate-500">
                Status lançado: <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STPILL[contestando.st] ?? 'bg-slate-100 text-slate-600'}`}>{contestando.st}</span>
              </div>
              <div className="mb-1.5 text-xs font-medium text-slate-600">Qual seria o status correto?</div>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPCOES.filter((s) => s !== contestando.st).map((s) => {
                  const on = stSugerido === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStSugerido(on ? '' : s)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        on ? `${STBTN[s]} bg-white ring-2 ring-amber-400` : `${STBTN[s]} bg-white hover:bg-slate-50`
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo (opcional)…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-500"
            />
            {msg && <div className="mt-2 text-xs text-rose-600">{msg}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setContestando(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={enviarContestacao} disabled={pend || (!stSugerido && !motivo.trim())} className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                {pend ? 'Enviando…' : 'Enviar contestação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({ icone, cor, titulo, valor, valorCls, destaque }: {
  icone: string; cor: keyof typeof CARD_COR; titulo: string; valor: string; valorCls: string; destaque?: boolean;
}) {
  const selo = CARD_COR[cor] ?? CARD_COR.slate;
  return (
    <div className={`rounded-xl border border-amber-400 bg-white p-3 ${destaque ? 'ring-1 ring-amber-400/30' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${selo}`}>{titulo}</div>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[11px] ${selo}`}>{icone}</span>
      </div>
      <div className={`mt-1 tabular-nums ${destaque ? 'text-xl font-bold' : 'text-lg font-semibold'} ${valorCls}`}>{valor}</div>
    </div>
  );
}

function fmtDia(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
