'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { ExtratoResp, SemanaExtrato } from './types';
import { contestarAposta, sairCliente } from './actions';
import { renderJogoLinhas } from './render';
import type { Reg } from '../admin/types';

const STPILL: Record<string, string> = {
  'EM ABERTO': 'bg-blue-100 text-blue-700',
  'GREEN': 'bg-green-100 text-green-700',
  'MEIO GREEN': 'bg-green-50 text-green-600',
  'MEIO RED': 'bg-red-50 text-red-600',
  'RED': 'bg-red-100 text-red-700',
  'REEMBOLSO': 'bg-yellow-100 text-yellow-700',
};

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clr = (n: number) => (n > 0 ? 'text-green-600' : n < 0 ? 'text-red-600' : 'text-slate-500');

export default function Extrato({ dados }: { dados: ExtratoResp }) {
  const [aba, setAba] = useState<'atual' | 'passada'>('atual');
  const sem: SemanaExtrato = aba === 'atual' ? dados.atual : dados.passada;
  const router = useRouter();
  const [pend, startTransition] = useTransition();
  const [contestando, setContestando] = useState<Reg | null>(null);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState('');

  function abrirContestacao(r: Reg) { setContestando(r); setMotivo(''); setMsg(''); }

  function enviarContestacao() {
    if (!contestando) return;
    startTransition(async () => {
      const r = await contestarAposta(contestando.id, motivo);
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
        {/* Resumo */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card titulo="Calção" valor={brl(dados.cliente.cal)} cor="text-slate-700" />
          <Card titulo="Entradas (semana)" valor={brl(sem.entradas)} cor="text-slate-700" />
          <Card titulo="Em aberto" valor={String(sem.abertas)} cor="text-blue-600" />
          <Card titulo="Saldo da semana" valor={brl(sem.saldo)} cor={clr(sem.saldo)} />
        </div>

        {/* Abas semana */}
        <div className="mb-3 flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {(['atual', 'passada'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                aba === k ? 'bg-[#13200a] text-[#DAA520]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {k === 'atual' ? 'Semana atual' : 'Semana passada'}
            </button>
          ))}
          <span className="ml-2 pr-2 text-[11px] text-slate-400">
            {fmtDia(sem.d1)} a {fmtDia(sem.d2)}
          </span>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
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
              {sem.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{r.dt}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-[300px] text-xs leading-snug">
                      {r.ct && <span className="mr-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">⚠️ Contestada</span>}
                      {renderJogoLinhas(r.jogo)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.odd ? brl(r.odd) : <span className="text-slate-300">—</span>}</td>
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
              {sem.rows.length === 0 && (
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
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo da contestação (ex.: valor errado, resultado incorreto)…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
            />
            {msg && <div className="mt-2 text-xs text-rose-600">{msg}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setContestando(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={enviarContestacao} disabled={pend || !motivo.trim()} className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                {pend ? 'Enviando…' : 'Enviar contestação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{titulo}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${cor}`}>{valor}</div>
    </div>
  );
}

function fmtDia(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
