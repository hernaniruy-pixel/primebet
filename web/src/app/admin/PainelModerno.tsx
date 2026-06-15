'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Afiliado, Cliente, Reg, Totals, ApostasPage, FiltroApostas } from './types';
import { criarAposta, atualizarAposta, excluirAposta, listarApostas } from './actions';

interface Draft { dt?: string; odd?: string; val?: string; _saved?: boolean }

const STS = ['EM ABERTO', 'GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO'];
const DCS = ['', 'BETANO', 'BET365', 'SPORTINGBET', 'SUPERBET', 'PIXBET'];
const PAGE_SIZE = 20;

const STPILL: Record<string, string> = {
  'EM ABERTO': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  GREEN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'MEIO GREEN': 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  'MEIO RED': 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  RED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  REEMBOLSO: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
};

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toISOString().split('T')[0];
function periodDates(v: string): { d1: string; d2: string } {
  const today = new Date();
  if (v === 'hoje') { const d = fmtDate(today); return { d1: d, d2: d }; }
  if (v === 'ontem') { const d = new Date(today); d.setDate(d.getDate() - 1); const s = fmtDate(d); return { d1: s, d2: s }; }
  if (v === 'semana') { const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { d1: fmtDate(mon), d2: fmtDate(sun) }; }
  if (v === 'semana_ant') { const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() - 6); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { d1: fmtDate(mon), d2: fmtDate(sun) }; }
  return { d1: '', d2: '' };
}

const filtrosVazios = {
  id: '', nome: '', st: '', jogo: '', dc: '', oddMin: '', oddMax: '', valMin: '', valMax: '',
  bl: '', adv: '', irr: '', dt1: '', dt2: '', period: '', ord: 'data_desc',
};

const inp = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const lbl = 'mb-1 block text-[11px] font-medium text-slate-400 dark:text-slate-500';

export default function PainelModerno({ email, clientesIni, apostasIni, semana }: {
  email: string; clientesIni: Cliente[]; afiliadosIni: Afiliado[]; apostasIni: ApostasPage; semana: { d1: string; d2: string };
}) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(typeof window !== 'undefined' && localStorage.getItem('pb-theme') === 'dark');
  }, []);
  const toggleTheme = () => setDark((d) => { const n = !d; try { localStorage.setItem('pb-theme', n ? 'dark' : 'light'); } catch { /* ignore */ } return n; });

  const [regs, setRegs] = useState<Reg[]>(apostasIni.rows);
  const [total, setTotal] = useState(apostasIni.total);
  const [totals, setTotals] = useState<Totals>(apostasIni.totals);
  const [reloadKey, setReloadKey] = useState(0);
  const [clientes] = useState<Cliente[]>(clientesIni);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [filtros, setFiltros] = useState({ ...filtrosVazios, dt1: semana.d1, dt2: semana.d2, period: 'semana' });
  const [debFiltros, setDebFiltros] = useState(filtros);
  const [page, setPage] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [novo, setNovo] = useState({ open: false, cId: '', jogo: '', odd: '', val: '', st: 'EM ABERTO', dc: '' });

  const cMap = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])) as Record<number, Cliente>, [clientes]);

  function toast(m: string) { setToastMsg(m); window.clearTimeout((toast as unknown as { _h?: number })._h); (toast as unknown as { _h?: number })._h = window.setTimeout(() => setToastMsg(''), 2600); }
  function setF<K extends keyof typeof filtros>(k: K, v: (typeof filtros)[K]) { setFiltros((f) => ({ ...f, [k]: v })); setPage(1); }
  function applyPeriod(v: string) { const p = periodDates(v); setFiltros((f) => ({ ...f, period: v, dt1: p.d1, dt2: p.d2 })); setPage(1); }
  function limpar() { setFiltros({ ...filtrosVazios }); setPage(1); }

  useEffect(() => { const t = setTimeout(() => setDebFiltros(filtros), 400); return () => clearTimeout(t); }, [filtros]);

  useEffect(() => {
    let alive = true;
    const f = debFiltros;
    const params: FiltroApostas = {
      id: f.id || undefined, cId: f.nome ? Number(f.nome) : null, st: f.st || undefined,
      jogo: f.jogo || undefined, dc: f.dc || undefined,
      oddMin: f.oddMin ? Number(f.oddMin) : null, oddMax: f.oddMax ? Number(f.oddMax) : null,
      valMin: f.valMin ? Number(f.valMin) : null, valMax: f.valMax ? Number(f.valMax) : null,
      dt1: f.dt1 || null, dt2: f.dt2 || null, ord: f.ord, page,
    };
    listarApostas(params)
      .then((r) => { if (alive) { setRegs(r.rows); setTotal(r.total); setTotals(r.totals); } })
      .catch(() => { if (alive) toast('Erro ao carregar apostas.'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debFiltros, page, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const start = (pageSafe - 1) * PAGE_SIZE;

  const dV = (r: Reg, f: 'dt' | 'odd' | 'val') => { const d = drafts[r.id]; return d && d[f] !== undefined ? d[f]! : String(r[f]); };
  const edited = (r: Reg, f: 'dt' | 'odd' | 'val') => drafts[r.id]?.[f] !== undefined;
  function updDraft(id: number, f: 'dt' | 'odd' | 'val', v: string) { setDrafts((d) => ({ ...d, [id]: { ...d[id], [f]: v } })); }

  async function patchReg(id: number, patch: Parameters<typeof atualizarAposta>[1]) {
    try { const reg = await atualizarAposta(id, patch); setRegs((rs) => rs.map((r) => (r.id === id ? reg : r))); reload(); }
    catch { toast('Erro ao salvar aposta.'); }
  }
  async function saveReg(id: number) {
    const d = drafts[id] || {};
    await patchReg(id, {
      ...(d.dt !== undefined ? { dt: d.dt } : {}),
      ...(d.odd !== undefined ? { odd: Number(d.odd) } : {}),
      ...(d.val !== undefined ? { val: Number(d.val) } : {}),
    });
    setDrafts((dr) => ({ ...dr, [id]: { _saved: true } }));
    setTimeout(() => setDrafts((dr) => { const c = { ...dr }; delete c[id]; return c; }), 1500);
  }
  async function delReg(id: number) { if (!confirm('Excluir este registro?')) return; try { await excluirAposta(id); setRegs((rs) => rs.filter((r) => r.id !== id)); reload(); } catch { toast('Erro ao excluir.'); } }
  async function salvarNovo() {
    if (!novo.cId || !novo.jogo || !novo.odd || !novo.val) { alert('Preencha todos os campos.'); return; }
    try {
      await criarAposta({ cId: Number(novo.cId), jogo: novo.jogo, odd: Number(novo.odd), val: Number(novo.val), st: novo.st, dc: novo.dc });
      setNovo({ open: false, cId: '', jogo: '', odd: '', val: '', st: 'EM ABERTO', dc: '' });
      reload(); toast('Registro adicionado.');
    } catch { toast('Erro ao adicionar.'); }
  }
  async function sair() { const s = createClient(); await s.auth.signOut(); router.replace('/login'); }
  const emBreve = () => toast('Essa tela entra na próxima iteração do moderno.');

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {/* TOPBAR */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-2 border-amber-500 bg-slate-900 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">★</div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-amber-400">PrimeBet</div>
              <div className="text-[11px] text-slate-400">Controle — moderno</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {['Clientes', 'Afiliados', 'Fechamento'].map((t) => (
              <button key={t} onClick={emBreve} className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-white/15">{t}</button>
            ))}
            <button onClick={toggleTheme} title="Tema" className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 transition hover:bg-white/15">{dark ? '☀' : '🌙'}</button>
            <button onClick={sair} className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30">Sair</button>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
          <div className="mb-1 text-lg font-medium">Primebet — Controle</div>
          <div className="mb-4 text-xs text-slate-400">Registros — {email}</div>

          {/* MÉTRICAS */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { l: 'Entrada', v: tot(totals.entradas), s: `${total} linhas` },
              { l: 'Em aberto', v: tot(totals.em_aberto_total), s: `${totals.em_aberto_qtd} linhas` },
              { l: 'Saldo bruto', v: tot(totals.saldo_bruto) },
              { l: 'Comissão', v: tot(totals.comissao) },
              { l: 'Saldo líquido', v: tot(totals.saldo_liquido) },
            ].map((m) => (
              <div key={m.l} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{m.l}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{m.v}</div>
                {m.s && <div className="mt-0.5 text-[11px] text-slate-400">{m.s}</div>}
              </div>
            ))}
          </div>

          {/* FILTROS */}
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div><span className={lbl}>Cliente</span>
                <select className={inp} value={filtros.nome} onChange={(e) => setF('nome', e.target.value)}>
                  <option value="">Todos</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div><span className={lbl}>Status</span>
                <select className={inp} value={filtros.st} onChange={(e) => setF('st', e.target.value)}>
                  <option value="">Todos</option>
                  {STS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><span className={lbl}>Jogo contém</span><input className={inp} value={filtros.jogo} onChange={(e) => setF('jogo', e.target.value)} /></div>
              <div><span className={lbl}>Descarrego</span><input className={inp} value={filtros.dc} onChange={(e) => setF('dc', e.target.value)} /></div>
              <div><span className={lbl}>Data início</span><input type="date" className={inp} value={filtros.dt1} onChange={(e) => setFiltros((f) => ({ ...f, dt1: e.target.value, period: '' }))} /></div>
              <div><span className={lbl}>Data fim</span><input type="date" className={inp} value={filtros.dt2} onChange={(e) => setFiltros((f) => ({ ...f, dt2: e.target.value, period: '' }))} /></div>
              <div><span className={lbl}>Período rápido</span>
                <select className={inp} value={filtros.period} onChange={(e) => applyPeriod(e.target.value)}>
                  <option value="">—</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Esta semana</option><option value="semana_ant">Semana passada</option>
                </select>
              </div>
              <div><span className={lbl}>Ordenação</span>
                <select className={inp} value={filtros.ord} onChange={(e) => setF('ord', e.target.value)}>
                  <option value="data_desc">data ↓</option><option value="data_asc">data ↑</option><option value="val_desc">entradas ↓</option><option value="val_asc">entradas ↑</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button onClick={limpar} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Limpar</button>
              <button onClick={() => setNovo((n) => ({ ...n, open: true }))} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700">+ Novo registro</button>
            </div>
          </div>

          <div className="mb-2 text-xs text-slate-400">{total} aposta(s) · página {pageSafe}/{totalPages} · exibindo {total ? start + 1 : 0}–{start + regs.length}</div>

          {/* TABELA */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-3 py-2.5 font-medium">id</th><th className="px-3 py-2.5 font-medium">data</th>
                    <th className="px-3 py-2.5 font-medium">nome</th><th className="px-3 py-2.5 font-medium">jogo</th>
                    <th className="px-3 py-2.5 text-right font-medium">odd</th><th className="px-3 py-2.5 text-right font-medium">entradas</th>
                    <th className="px-3 py-2.5 font-medium">status</th><th className="px-3 py-2.5 font-medium">descarrego</th>
                    <th className="px-3 py-2.5 text-right font-medium">saldo líq.</th><th className="px-3 py-2.5 text-center font-medium">ações</th>
                  </tr>
                </thead>
                <tbody>
                  {regs.map((r) => {
                    const c = cMap[r.cId];
                    const inc = !(Number(r.odd) > 0) || !(Number(r.val) > 0);
                    return (
                      <tr key={r.id} className={`border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40 ${inc ? 'bg-rose-50/60 dark:bg-rose-500/5' : ''}`}>
                        <td className="px-3 py-2 font-medium text-slate-500">{r.id}</td>
                        <td className="px-3 py-2"><input className={`${inp} w-32 ${edited(r, 'dt') ? 'border-amber-400' : ''}`} value={dV(r, 'dt')} onChange={(e) => updDraft(r.id, 'dt', e.target.value)} /></td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{c?.nome ?? r.cId}{inc && <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">preencher</span>}</td>
                        <td className="max-w-[220px] px-3 py-2">{r.jogo.split('\n').map((l, i) => <div key={i} className={i === 0 ? 'text-[12px]' : 'text-[11px] text-slate-400'}>{l}</div>)}</td>
                        <td className="px-3 py-2"><input type="number" step="0.01" className={`${inp} w-16 text-right ${edited(r, 'odd') ? 'border-amber-400' : ''}`} value={dV(r, 'odd')} onChange={(e) => updDraft(r.id, 'odd', e.target.value)} /></td>
                        <td className="px-3 py-2"><input type="number" className={`${inp} w-20 text-right font-medium ${edited(r, 'val') ? 'border-amber-400' : ''}`} value={dV(r, 'val')} onChange={(e) => updDraft(r.id, 'val', e.target.value)} /></td>
                        <td className="px-3 py-2"><select value={r.st} onChange={(e) => patchReg(r.id, { st: e.target.value })} className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold outline-none ${STPILL[r.st] ?? ''}`}>{STS.map((s) => <option key={s} value={s} className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100">{s}</option>)}</select></td>
                        <td className="px-3 py-2"><select value={r.dc} onChange={(e) => patchReg(r.id, { dc: e.target.value })} className={`${inp} w-28`}>{DCS.map((d) => <option key={d} value={d}>{d || '—'}</option>)}</select></td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(r.sl)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center gap-1.5">
                            <button onClick={() => saveReg(r.id)} className={`rounded-lg px-2.5 py-1 text-xs font-medium text-white transition ${drafts[r.id]?._saved ? 'bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}>{drafts[r.id]?._saved ? '✓' : 'Salvar'}</button>
                            <button onClick={() => delReg(r.id)} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10">Excluir</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {regs.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">Nenhuma aposta no período. Use o período rápido ou limpe as datas.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <span className="text-xs text-slate-400">{total} no período</span>
              <div className="flex gap-2">
                <button disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:enabled:hover:bg-slate-800">Anterior</button>
                <button disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:enabled:hover:bg-slate-800">Próxima</button>
              </div>
            </div>
          </div>
        </main>

        {/* MODAL NOVO REGISTRO */}
        {novo.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={() => setNovo((n) => ({ ...n, open: false }))}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-medium">Novo registro</h3><button onClick={() => setNovo((n) => ({ ...n, open: false }))} className="text-slate-400 hover:text-slate-600">✕</button></div>
              <div className="flex flex-col gap-3">
                <div><span className={lbl}>Cliente</span><select className={inp} value={novo.cId} onChange={(e) => setNovo((n) => ({ ...n, cId: e.target.value }))}><option value="">— Selecione —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                <div><span className={lbl}>Jogo</span><textarea rows={3} className={inp} value={novo.jogo} onChange={(e) => setNovo((n) => ({ ...n, jogo: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className={lbl}>Odd</span><input type="number" step="0.01" className={inp} value={novo.odd} onChange={(e) => setNovo((n) => ({ ...n, odd: e.target.value }))} /></div>
                  <div><span className={lbl}>Entradas</span><input type="number" className={inp} value={novo.val} onChange={(e) => setNovo((n) => ({ ...n, val: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className={lbl}>Status</span><select className={inp} value={novo.st} onChange={(e) => setNovo((n) => ({ ...n, st: e.target.value }))}>{STS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div><span className={lbl}>Descarrego</span><select className={inp} value={novo.dc} onChange={(e) => setNovo((n) => ({ ...n, dc: e.target.value }))}>{DCS.map((d) => <option key={d} value={d}>{d || '—'}</option>)}</select></div>
                </div>
                <div className="mt-1 flex justify-end gap-2">
                  <button onClick={() => setNovo((n) => ({ ...n, open: false }))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">Cancelar</button>
                  <button onClick={salvarNovo} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Salvar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toastMsg && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-slate-700">{toastMsg}</div>}
      </div>
    </div>
  );
}

function tot(n: number) { return `R$ ${fmt(n)}`; }
