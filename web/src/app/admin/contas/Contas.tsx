'use client';

import { useMemo, useState } from 'react';
import { listarContas, criarConta, atualizarConta, excluirConta } from '../actions';
import type { Conta } from './types';

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// parser simples e previsível: aceita "1234.56" ou "1234,56"
const toNum = (s: string | number | undefined) => { const v = Number(String(s ?? '').trim().replace(',', '.')); return isNaN(v) ? 0 : v; };

const fmtData = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso));
const fmtHora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

const CASAS = ['BET365', 'SUPERBET', 'BETANO'];
const ORDEM = CASAS;
const CASA_COR: Record<string, string> = {
  BET365: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  SUPERBET: 'bg-pink-100 text-pink-800 border-pink-300',
  BETANO: 'bg-amber-100 text-amber-800 border-amber-300',
};
const corCasa = (c: string) => CASA_COR[c.toUpperCase()] ?? 'bg-slate-100 text-slate-700 border-slate-300';
// cor padrão para números: escuro normal, vermelho só quando negativo
const corNum = (n: number) => (n < 0 ? 'text-rose-600' : 'text-slate-800');
// cor por sinal (para totais/saldos): verde positivo, vermelho negativo
const corSaldo = (n: number) => (n > 0 ? 'text-emerald-600' : n < 0 ? 'text-rose-600' : 'text-slate-700');

type Campo = 'login' | 'nome' | 'cpf' | 'saldo' | 'emAberto' | 'deposito' | 'retirada';
type Draft = Partial<Record<Campo, string>>;

export default function Contas({ contasIni }: { contasIni: Conta[] }) {
  const [contas, setContas] = useState<Conta[]>(contasIni);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [editIds, setEditIds] = useState<Set<number>>(new Set());
  const [novo, setNovo] = useState({ open: false, casa: 'BET365', novaCasa: false, login: '', nome: '', cpf: '', saldo: '', emAberto: '', deposito: '', retirada: '' });
  const [msg, setMsg] = useState('');

  function toast(m: string) { setMsg(m); window.setTimeout(() => setMsg(''), 2500); }

  const isEdit = (id: number) => editIds.has(id);
  function startEdit(id: number) { setEditIds((s) => new Set(s).add(id)); }
  function cancelEdit(id: number) {
    setEditIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setDrafts((dr) => { const n = { ...dr }; delete n[id]; return n; });
  }

  // Casas disponíveis no seletor = padrão + as que já existem em contas (casa nova fica salva).
  const casasDisponiveis = useMemo(() => {
    const set = new Set(CASAS);
    contas.forEach((c) => { if (c.casa) set.add(c.casa.toUpperCase()); });
    return [...set];
  }, [contas]);

  // valores efetivos (considerando rascunho em edição) — Total/Resultado atualizam ao digitar
  const ef = (c: Conta) => {
    const d = drafts[c.id] || {};
    return {
      login: d.login ?? c.login, nome: d.nome ?? c.nome, cpf: d.cpf ?? c.cpf,
      saldo: d.saldo !== undefined ? toNum(d.saldo) : c.saldo,
      emAberto: d.emAberto !== undefined ? toNum(d.emAberto) : c.emAberto,
      deposito: d.deposito !== undefined ? toNum(d.deposito) : c.deposito,
      retirada: d.retirada !== undefined ? toNum(d.retirada) : c.retirada,
    };
  };
  // Resumo (balanço da conta) = saldo + em aberto + depósitos − saques.
  const resumoDe = (e: { saldo: number; emAberto: number; deposito: number; retirada: number }) => e.saldo + e.emAberto + e.deposito - e.retirada;

  // agrupa por casa, na ordem preferida e depois alfabética
  const grupos = useMemo(() => {
    const map = new Map<string, Conta[]>();
    for (const c of contas) { const k = c.casa || '—'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(c); }
    const chaves = [...map.keys()].sort((a, b) => {
      const ia = ORDEM.indexOf(a.toUpperCase()), ib = ORDEM.indexOf(b.toUpperCase());
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
    return chaves.map((casa) => {
      const rows = map.get(casa)!;
      const g = rows.reduce((acc, c) => { const e = ef(c); acc.resumo += resumoDe(e); acc.deposito += e.deposito; acc.retirada += e.retirada; return acc; }, { resumo: 0, deposito: 0, retirada: 0 });
      return { casa, rows, ...g };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas, drafts]);

  const totalDeposito = grupos.reduce((s, g) => s + g.deposito, 0);
  const totalSaque = grupos.reduce((s, g) => s + g.retirada, 0);
  const totalEmAberto = contas.reduce((s, c) => s + ef(c).emAberto, 0);
  const saldoAtual = contas.reduce((s, c) => s + ef(c).saldo, 0);
  // Balanço geral = (depósitos − saques) + em aberto + saldo
  const balancoGeral = totalDeposito - totalSaque + totalEmAberto + saldoAtual;

  function upd(id: number, campo: Campo, v: string) { setDrafts((d) => ({ ...d, [id]: { ...d[id], [campo]: v } })); }
  const dv = (c: Conta, campo: Campo) => { const d = drafts[c.id]?.[campo]; if (d !== undefined) return d; const raw = c[campo]; return typeof raw === 'number' ? String(raw) : raw; };

  async function salvar(c: Conta) {
    const d = drafts[c.id] || {};
    const patch = {
      ...(d.login !== undefined ? { login: d.login } : {}),
      ...(d.nome !== undefined ? { nome: d.nome } : {}),
      ...(d.cpf !== undefined ? { cpf: d.cpf } : {}),
      ...(d.saldo !== undefined ? { saldo: toNum(d.saldo) } : {}),
      ...(d.emAberto !== undefined ? { emAberto: toNum(d.emAberto) } : {}),
      ...(d.deposito !== undefined ? { deposito: toNum(d.deposito) } : {}),
      ...(d.retirada !== undefined ? { retirada: toNum(d.retirada) } : {}),
    };
    // OTIMISTA: aplica na hora (com data/hora de agora) e persiste em background.
    const agora = new Date().toISOString();
    setContas((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...patch, atualizadoEm: agora } : x)));
    setDrafts((dr) => { const n = { ...dr }; delete n[c.id]; return n; });
    setEditIds((s) => { const n = new Set(s); n.delete(c.id); return n; }); // trava a linha de novo
    toast('Conta atualizada ✓');
    try { const r = await atualizarConta(c.id, patch); setContas((cs) => cs.map((x) => (x.id === c.id ? r : x))); }
    catch { toast('Erro ao salvar — clique em Atualizar.'); }
  }

  async function adicionar() {
    if (!novo.casa.trim()) { toast('Informe a casa.'); return; }
    setBusy(true);
    try {
      const r = await criarConta({
        casa: novo.casa.trim().toUpperCase(), login: novo.login.trim(), nome: novo.nome.trim(), cpf: novo.cpf.trim(),
        saldo: toNum(novo.saldo), emAberto: toNum(novo.emAberto), deposito: toNum(novo.deposito), retirada: toNum(novo.retirada),
      });
      setContas((cs) => [...cs, r]);
      setNovo({ open: true, casa: 'BET365', novaCasa: false, login: '', nome: '', cpf: '', saldo: '', emAberto: '', deposito: '', retirada: '' });
      toast('Conta adicionada ✓');
    } catch { toast('Erro ao adicionar conta.'); }
    setBusy(false);
  }

  async function excluir(c: Conta) {
    if (!confirm(`Excluir a conta ${c.login || c.nome || '#' + c.id} (${c.casa})?`)) return;
    setContas((cs) => cs.filter((x) => x.id !== c.id));
    try { await excluirConta(c.id); } catch { toast('Erro ao excluir — clique em Atualizar.'); }
  }

  async function recarregar() { setBusy(true); try { setContas(await listarContas()); setDrafts({}); } catch { toast('Erro ao atualizar.'); } setBusy(false); }

  const inp = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 outline-none focus:border-amber-500';
  const numInp = 'w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums text-slate-800 outline-none focus:border-amber-500';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-gradient-to-r from-[#13200a] to-[#1e2f10] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <a href="/admin" className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">← Painel</a>
            <div>
              <div className="text-sm font-semibold text-[#DAA520]">Contas</div>
              <div className="text-[11px] text-slate-300">Controle das contas usadas para replicar as apostas</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setNovo((n) => ({ ...n, open: !n.open }))} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">+ Nova conta</button>
            <button onClick={recarregar} className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20">🔄 Atualizar</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {/* Resumo geral */}
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {([
            { l: 'Total depósitos', v: totalDeposito, icon: '💰', from: 'from-emerald-50', ring: 'border-emerald-100', chip: 'bg-emerald-100', num: 'text-emerald-700' },
            { l: 'Total saques', v: totalSaque, icon: '💸', from: 'from-rose-50', ring: 'border-rose-100', chip: 'bg-rose-100', num: 'text-rose-700' },
            { l: 'Total em aberto', v: totalEmAberto, icon: '⏳', from: 'from-indigo-50', ring: 'border-indigo-100', chip: 'bg-indigo-100', num: 'text-indigo-700' },
            { l: 'Total saldo', v: saldoAtual, icon: '🏦', from: 'from-sky-50', ring: 'border-sky-100', chip: 'bg-sky-100', num: corSaldo(saldoAtual) },
          ] as const).map((m) => (
            <div key={m.l} className={`rounded-2xl border ${m.ring} bg-gradient-to-br ${m.from} to-white p-4 shadow-sm`}>
              <div className="flex items-center gap-2">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${m.chip} text-lg`}>{m.icon}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{m.l}</span>
              </div>
              <div className={`mt-2 text-2xl font-extrabold tabular-nums ${m.num}`}>R$ {brl(m.v)}</div>
            </div>
          ))}
          <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-[#13200a] via-[#1a2b0f] to-[#241f0a] p-4 shadow-md">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/20 text-lg">⚖️</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">Balanço geral</span>
            </div>
            <div className={`mt-2 text-2xl font-extrabold tabular-nums ${balancoGeral < 0 ? 'text-rose-400' : 'text-[#DAA520]'}`}>R$ {brl(balancoGeral)}</div>
            <div className="mt-0.5 text-[10px] text-amber-100/50">depósitos − saques + em aberto + saldo</div>
          </div>
        </div>
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Resumo por casa</div>
          <div className="flex flex-wrap gap-2">
            {grupos.length === 0 && <span className="text-xs text-slate-400">Nenhuma conta ainda.</span>}
            {grupos.map((g) => (
              <span key={g.casa} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${corCasa(g.casa)}`}>
                {g.casa}: R$ {brl(g.resumo)}
              </span>
            ))}
          </div>
        </div>

        {/* Formulário nova conta */}
        {novo.open && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-700">Nova conta</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">CASA</label>
                {novo.novaCasa ? (
                  <div className="flex gap-1">
                    <input autoFocus placeholder="Nome da casa" value={novo.casa} onChange={(e) => setNovo((n) => ({ ...n, casa: e.target.value.toUpperCase() }))} className={inp} />
                    <button type="button" onClick={() => setNovo((n) => ({ ...n, novaCasa: false, casa: 'BET365' }))} title="Voltar à lista" className="shrink-0 rounded-md border border-slate-300 px-2 text-slate-500 hover:bg-slate-100">↩</button>
                  </div>
                ) : (
                  <select value={novo.casa} onChange={(e) => { if (e.target.value === '__NOVA__') setNovo((n) => ({ ...n, novaCasa: true, casa: '' })); else setNovo((n) => ({ ...n, casa: e.target.value })); }} className={inp}>
                    {casasDisponiveis.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value="__NOVA__">➕ Adicionar nova casa</option>
                  </select>
                )}
              </div>
              <div><label className="mb-1 block text-[10px] font-medium text-slate-500">LOGIN</label><input value={novo.login} onChange={(e) => setNovo((n) => ({ ...n, login: e.target.value }))} className={inp} /></div>
              <div><label className="mb-1 block text-[10px] font-medium text-slate-500">NOME</label><input value={novo.nome} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} className={inp} /></div>
              <div><label className="mb-1 block text-[10px] font-medium text-slate-500">CPF</label><input value={novo.cpf} onChange={(e) => setNovo((n) => ({ ...n, cpf: e.target.value }))} className={inp} /></div>
              <div><label className="mb-1 block text-[10px] font-medium text-slate-500">SALDO</label><input value={novo.saldo} onChange={(e) => setNovo((n) => ({ ...n, saldo: e.target.value }))} className={inp} inputMode="decimal" /></div>
              <div><label className="mb-1 block text-[10px] font-medium text-slate-500">EM ABERTO</label><input value={novo.emAberto} onChange={(e) => setNovo((n) => ({ ...n, emAberto: e.target.value }))} className={inp} inputMode="decimal" /></div>
              <div><label className="mb-1 block text-[10px] font-medium text-slate-500">DEPÓSITO</label><input value={novo.deposito} onChange={(e) => setNovo((n) => ({ ...n, deposito: e.target.value }))} className={inp} inputMode="decimal" /></div>
              <div><label className="mb-1 block text-[10px] font-medium text-slate-500">RETIRADA</label><input value={novo.retirada} onChange={(e) => setNovo((n) => ({ ...n, retirada: e.target.value }))} className={inp} inputMode="decimal" /></div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setNovo((n) => ({ ...n, open: false }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={adicionar} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Adicionar</button>
            </div>
          </div>
        )}

        {/* Tabelas por casa */}
        {grupos.map((g) => (
          <div key={g.casa} className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className={`border-b px-4 py-2 text-center text-sm font-bold ${corCasa(g.casa)}`}>Contas {g.casa}</div>
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-2">Data</th><th className="px-2 py-2">Hora</th>
                  <th className="px-2 py-2">Login</th><th className="px-2 py-2">Nome</th><th className="px-2 py-2">CPF</th>
                  <th className="px-2 py-2 text-right">Saldo</th><th className="px-2 py-2 text-right">Em aberto</th>
                  <th className="px-2 py-2 text-right">Depósito</th><th className="px-2 py-2 text-right">Retirada</th>
                  <th className="px-2 py-2 text-right">Resumo</th>
                  <th className="px-2 py-2 text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((c) => {
                  const e = ef(c); const resumo = resumoDe(e);
                  const emEdicao = isEdit(c.id);
                  return (
                    <tr key={c.id} className={`border-b border-slate-100 align-middle ${emEdicao ? 'bg-amber-50/60' : ''}`}>
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-500">{fmtData(c.atualizadoEm)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-500">{fmtHora(c.atualizadoEm)}</td>
                      {emEdicao ? (
                        <>
                          <td className="px-2 py-1.5"><input value={dv(c, 'login')} onChange={(ev) => upd(c.id, 'login', ev.target.value)} className={`${inp} w-28`} /></td>
                          <td className="px-2 py-1.5"><input value={dv(c, 'nome')} onChange={(ev) => upd(c.id, 'nome', ev.target.value)} className={`${inp} w-28`} /></td>
                          <td className="px-2 py-1.5"><input value={dv(c, 'cpf')} onChange={(ev) => upd(c.id, 'cpf', ev.target.value)} className={`${inp} w-28`} /></td>
                          <td className="px-2 py-1.5"><input value={dv(c, 'saldo')} onChange={(ev) => upd(c.id, 'saldo', ev.target.value)} className={numInp} inputMode="decimal" /></td>
                          <td className="px-2 py-1.5"><input value={dv(c, 'emAberto')} onChange={(ev) => upd(c.id, 'emAberto', ev.target.value)} className={numInp} inputMode="decimal" /></td>
                          <td className="px-2 py-1.5"><input value={dv(c, 'deposito')} onChange={(ev) => upd(c.id, 'deposito', ev.target.value)} className={numInp} inputMode="decimal" /></td>
                          <td className="px-2 py-1.5"><input value={dv(c, 'retirada')} onChange={(ev) => upd(c.id, 'retirada', ev.target.value)} className={numInp} inputMode="decimal" /></td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1.5 font-medium">{c.login || '—'}</td>
                          <td className="px-2 py-1.5">{c.nome || '—'}</td>
                          <td className="px-2 py-1.5 text-slate-500">{c.cpf || '—'}</td>
                          <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${corSaldo(e.saldo)}`}>{brl(e.saldo)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${corNum(e.emAberto)}`}>{brl(e.emAberto)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${corNum(e.deposito)}`}>{brl(e.deposito)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${corNum(e.retirada)}`}>{brl(e.retirada)}</td>
                        </>
                      )}
                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${corSaldo(resumo)}`}>{brl(resumo)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex justify-center gap-1.5">
                          {emEdicao ? (
                            <>
                              <button onClick={() => salvar(c)} className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700">Salvar</button>
                              <button onClick={() => cancelEdit(c.id)} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Cancelar</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(c.id)} className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600">Editar</button>
                              <button onClick={() => excluir(c)} className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-500 hover:bg-rose-50">Excluir</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 text-[13px] font-semibold">
                  <td colSpan={7} className="px-2 py-2 text-right text-slate-500">Total {g.casa}</td>
                  <td className={`px-2 py-2 text-right font-bold tabular-nums ${corNum(g.deposito)}`}>{brl(g.deposito)}</td>
                  <td className={`px-2 py-2 text-right font-bold tabular-nums ${corNum(g.retirada)}`}>{brl(g.retirada)}</td>
                  <td className={`px-2 py-2 text-right font-bold tabular-nums ${corSaldo(g.resumo)}`}>{brl(g.resumo)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}

        {grupos.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-slate-400">
            Nenhuma conta cadastrada. Clique em <b>+ Nova conta</b> para começar.
          </div>
        )}

        <p className="mt-2 text-center text-[11px] text-slate-400">
          {busy ? 'carregando…' : 'Resumo (balanço) = saldo + em aberto + depósitos − saques. Vermelho só quando negativo. A data/hora é atualizada a cada "Salvar".'}
        </p>
      </div>

      {msg && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{msg}</div>}
    </main>
  );
}
