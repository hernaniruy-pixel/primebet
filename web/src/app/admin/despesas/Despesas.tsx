'use client';

import { useState, useTransition } from 'react';
import { listarDespesas, listarDespesasPeriodo, excluirDespesa } from '../actions';
import type { DespesasResp, SemanaDespesas } from './types';

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDia = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

export default function Despesas({ dadosIni }: { dadosIni: DespesasResp }) {
  const [dados, setDados] = useState<DespesasResp>(dadosIni);
  const [aba, setAba] = useState<'atual' | 'passada' | 'periodo'>('atual');
  const [dt1, setDt1] = useState('');
  const [dt2, setDt2] = useState('');
  const [periodo, setPeriodo] = useState<SemanaDespesas | null>(null);
  const [carregando, startTransition] = useTransition();
  const sem: SemanaDespesas = aba === 'periodo' ? (periodo ?? { rotulo: 'Período', d1: '', d2: '', rows: [], total: 0 })
    : aba === 'atual' ? dados.atual : dados.passada;

  function buscarPeriodo() {
    startTransition(async () => { setPeriodo(await listarDespesasPeriodo(dt1 || null, dt2 || null)); });
  }
  function recarregar() {
    startTransition(async () => {
      setDados(await listarDespesas());
      if (aba === 'periodo') setPeriodo(await listarDespesasPeriodo(dt1 || null, dt2 || null));
    });
  }
  function excluir(id: number) {
    if (!confirm('Excluir esta despesa?')) return;
    startTransition(async () => {
      await excluirDespesa(id);
      setDados(await listarDespesas());
      if (aba === 'periodo') setPeriodo(await listarDespesasPeriodo(dt1 || null, dt2 || null));
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-gradient-to-r from-[#13200a] to-[#1e2f10] text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <a href="/admin" className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">← Painel</a>
            <div>
              <div className="text-sm font-semibold text-[#DAA520]">Despesas</div>
              <div className="text-[11px] text-slate-300">Lançadas pelo grupo &quot;despesa&quot; (descrição: valor)</div>
            </div>
          </div>
          <button onClick={recarregar} className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20">🔄 Atualizar</button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-5">
        {/* abas + total */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {([['atual', 'Semana atual'], ['passada', 'Semana passada'], ['periodo', 'Período / Histórico']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setAba(k); if (k === 'periodo' && periodo === null) buscarPeriodo(); }}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium ${aba === k ? 'bg-[#13200a] text-[#DAA520]' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label}
              </button>
            ))}
            {aba !== 'periodo' && <span className="ml-2 pr-2 text-[11px] text-slate-400">{fmtDia(sem.d1)} a {fmtDia(sem.d2)}</span>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Total {aba === 'periodo' ? 'do período' : 'da semana'}</span>
            <div className="text-xl font-semibold tabular-nums text-rose-600">R$ {brl(sem.total)}</div>
          </div>
        </div>

        {/* filtro de período (histórico completo) */}
        {aba === 'periodo' && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">De</label>
              <input type="date" value={dt1} onChange={(e) => setDt1(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Até</label>
              <input type="date" value={dt2} onChange={(e) => setDt2(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-amber-500" />
            </div>
            <button onClick={buscarPeriodo} className="rounded-lg bg-[#13200a] px-4 py-1.5 text-sm font-medium text-[#DAA520] hover:brightness-125">Buscar</button>
            <button onClick={() => { setDt1(''); setDt2(''); startTransition(async () => setPeriodo(await listarDespesasPeriodo(null, null))); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Todo o histórico</button>
          </div>
        )}

        {/* tabela */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {sem.rows.map((d) => (
                <tr key={d.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{d.data}</td>
                  <td className="px-3 py-2">{d.descricao}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">R$ {brl(d.valor)}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => excluir(d.id)} className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-rose-400 hover:text-rose-600">Excluir</button>
                  </td>
                </tr>
              ))}
              {sem.rows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-10 text-center text-slate-400">{aba === 'periodo' ? 'Nenhuma despesa no período.' : 'Nenhuma despesa nesta semana.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-center text-[11px] text-slate-400">
          {carregando ? 'carregando…' : 'Mande no grupo "despesa": Descrição: valor (ex.: Aluguel: 1500). A data da mensagem define a semana.'}
        </p>
      </div>
    </main>
  );
}
