'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { ExtratoResp, SemanaExtrato } from './types';
import { contestarAposta, sairCliente } from './actions';
import { renderJogoLinhas } from './render';
import type { Reg } from '../admin/types';
import { partesTs, statusContestacao } from '../admin/types';

// Mesmas cores de status do painel admin — o cliente e o operador têm que estar
// olhando para a mesma coisa quando falam ao telefone.
const STPILL: Record<string, string> = {
  'EM ABERTO': 'bg-violet-200 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200',
  'GREEN': 'bg-green-600 text-white',
  'MEIO GREEN': 'bg-green-300 text-green-900 dark:bg-green-500/25 dark:text-green-200',
  'MEIO RED': 'bg-red-300 text-red-900 dark:bg-red-500/25 dark:text-red-200',
  'RED': 'bg-red-600 text-white',
  'REEMBOLSO': 'bg-yellow-400 text-yellow-900 dark:bg-yellow-500/25 dark:text-yellow-200',
};

// Selo do card: fundo e contorno na mesma família (igual ao painel).
const CARD_COR: Record<string, string> = {
  slate: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  blue: 'border-blue-300 bg-blue-100 text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300',
  violet: 'border-violet-300 bg-violet-100 text-violet-600 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300',
  destaque: 'border-amber-400 bg-amber-200/60 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300',
};

// Campos iguais aos do painel (o foco âmbar é a identidade da casa).
const inp = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const lbl = 'mb-1 block text-[11px] font-medium text-slate-400 dark:text-slate-500';
const painel = 'rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clr = (n: number) => (n > 0 ? 'text-emerald-600 dark:text-emerald-400' : n < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100');

// Status que o cliente pode apontar como correto ao contestar (sem "EM ABERTO").
const STATUS_OPCOES = ['GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO'];
const STBTN: Record<string, string> = {
  'GREEN': 'border-green-300 text-green-700 dark:border-green-500/50 dark:text-green-300',
  'MEIO GREEN': 'border-green-200 text-green-600 dark:border-green-500/40 dark:text-green-300',
  'MEIO RED': 'border-red-200 text-red-600 dark:border-red-500/40 dark:text-red-300',
  'RED': 'border-red-300 text-red-700 dark:border-red-500/50 dark:text-red-300',
  'REEMBOLSO': 'border-yellow-300 text-yellow-700 dark:border-yellow-500/50 dark:text-yellow-300',
};

const WD = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// 'DD/MM/AA' → Date local (o ano vem em 2 dígitos no extrato).
function parseDataBR(d: string): Date {
  const [dd, mm, aa] = d.split('/');
  return new Date(2000 + Number(aa), Number(mm) - 1, Number(dd));
}
// 'DD/MM/AA' → 'Quarta 15/07' — o jogador pensa por dia da semana, não por data cheia.
function rotuloDia(d: string): string {
  return `${WD[parseDataBR(d).getDay()]} ${d.slice(0, 5)}`;
}

export default function Extrato({ dados }: { dados: ExtratoResp }) {
  // Tema: mesmo interruptor e mesma chave (pb-theme) do painel admin, para o
  // cliente reconhecer a casa esteja em qual tela estiver.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(typeof window !== 'undefined' && localStorage.getItem('pb-theme') === 'dark');
  }, []);
  const toggleTheme = () => setDark((d) => { const n = !d; try { localStorage.setItem('pb-theme', n ? 'dark' : 'light'); } catch { /* ignore */ } return n; });

  const [view, setView] = useState<'resumo' | 'bilhetes'>('resumo');
  const [aba, setAba] = useState<'atual' | 'passada'>('atual');
  const sem: SemanaExtrato = aba === 'atual' ? dados.atual : dados.passada;
  // A odd que vale para o cliente já é a do bilhete MENOS o desconto do cadastro dele —
  // é sobre ela que o saldo é calculado. Mostrar a odd cheia aqui só geraria dúvida.
  const oddDoCliente = (odd: number) => Math.max(odd - (dados.cliente.desc || 0), 0);

  // ── Seletor de dia da semana. Substitui a data solta: o extrato de aposta é lido
  // por dia ("como fui na quarta?"), então a filtragem principal é por dia.
  const [fDia, setFDia] = useState('');
  // Dias que existem na semana, em ordem, já rotulados com o nome do dia.
  const dias = useMemo(() => {
    const seen = new Set<string>();
    for (const r of sem.rows) seen.add(partesTs(r.dt).data);
    return [...seen].sort((a, b) => parseDataBR(a).getTime() - parseDataBR(b).getTime());
  }, [sem.rows]);
  // Ao trocar de semana, um dia que não existe mais na lista é ignorado (volta a
  // "todos") sem precisar de efeito para limpar o estado.
  const fDiaEff = fDia && dias.includes(fDia) ? fDia : '';

  // Recorte por dia: alimenta os cards, as estatísticas e o PDF (tudo do período visto).
  const rowsDia = useMemo(
    () => (fDiaEff ? sem.rows.filter((r) => partesTs(r.dt).data === fDiaEff) : sem.rows),
    [sem.rows, fDiaEff],
  );

  // ── Filtros da lista de bilhetes (busca + status), aplicados SOBRE o dia escolhido.
  const [busca, setBusca] = useState('');
  const [fSt, setFSt] = useState('');
  const filtrandoLista = !!(busca.trim() || fSt);
  const limparLista = () => { setBusca(''); setFSt(''); };
  const rows = useMemo(() => rowsDia.filter((r) => {
    if (fSt && r.st !== fSt) return false;
    if (busca.trim() && !r.jogo.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  }), [rowsDia, busca, fSt]);

  // Cards do topo: descrevem o período visto (semana ou dia), não a busca da lista.
  const tot = useMemo(() => ({
    entradas: rowsDia.reduce((s, r) => s + r.val, 0),
    saldo: rowsDia.reduce((s, r) => s + r.sl, 0),
    abertas: rowsDia.filter((r) => r.st === 'EM ABERTO').length,
  }), [rowsDia]);

  // ── Aproveitamento: greens (GREEN + MEIO GREEN) sobre as apostas resolvidas.
  // Os números por status saem do `porStatus`; aqui só o que a barra precisa.
  const stats = useMemo(() => {
    let gQ = 0, resolvidas = 0;
    for (const r of rowsDia) {
      if (r.st === 'EM ABERTO') continue;
      resolvidas++;
      if (r.st === 'GREEN' || r.st === 'MEIO GREEN') gQ++;
    }
    return { gQ, resolvidas, apv: resolvidas ? (gQ / resolvidas) * 100 : null };
  }, [rowsDia]);

  // Agregado por status para o PDF (mesma ordem visual do painel).
  const porStatus = useMemo(() => {
    const ordem = ['GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO', 'EM ABERTO'];
    const m = new Map<string, { qtd: number; val: number; sl: number }>();
    for (const r of rowsDia) {
      const e = m.get(r.st) ?? { qtd: 0, val: 0, sl: 0 };
      e.qtd++; e.val += r.val; e.sl += r.sl; m.set(r.st, e);
    }
    return ordem.filter((s) => m.has(s)).map((s) => ({ st: s, ...m.get(s)! }));
  }, [rowsDia]);

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

  // ── Exportar PDF. jspdf só é carregado quando o cliente clica (fica fora do
  // bundle inicial). No celular abre o menu de compartilhar; no PC, baixa.
  const [expPend, setExpPend] = useState(false);
  const [expMsg, setExpMsg] = useState('');
  async function exportarPdf() {
    setExpPend(true); setExpMsg('');
    try {
      const { gerarPdfExtrato, entregarPdf } = await import('./pdf-extrato');
      const base = aba === 'atual' ? 'Semana atual' : 'Semana passada';
      const periodo = fDiaEff
        ? `${rotuloDia(fDiaEff)}`
        : `${base} — ${fmtDia(sem.d1)} a ${fmtDia(sem.d2)}`;
      const { blob, nome } = gerarPdfExtrato({
        cliente: dados.cliente.nome,
        periodo,
        calcao: dados.cliente.cal,
        rows: rowsDia,
        entradas: tot.entradas,
        saldo: tot.saldo,
        abertas: tot.abertas,
        aproveitamento: stats.apv,
        porStatus,
        oddDoCliente,
      });
      const r = await entregarPdf(blob, nome, `Extrato ${dados.cliente.nome} — ${periodo}`);
      setExpMsg(r === 'compartilhado' ? 'PDF compartilhado.' : 'PDF baixado.');
    } catch {
      setExpMsg('Não consegui gerar o PDF.');
    } finally {
      setExpPend(false);
      setTimeout(() => setExpMsg(''), 3500);
    }
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {/* Topo */}
        <header className="bg-gradient-to-r from-[#13200a] to-[#1e2f10] text-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/logo.jpg" alt="PrimeBet" width={40} height={40} style={{ borderRadius: 10 }} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#DAA520]">PrimeBet</div>
                <div className="truncate text-xs text-slate-300">Olá, {dados.cliente.nome}</div>
              </div>
              <button onClick={toggleTheme} title="Tema claro/escuro" className="shrink-0 rounded-lg border border-white/20 px-2.5 py-1.5 text-xs hover:bg-white/10">
                {dark ? '☀' : '🌙'}
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={exportarPdf} disabled={expPend} title="Exportar extrato em PDF" className="rounded-lg border border-[#DAA520]/50 bg-[#DAA520]/15 px-3 py-1.5 text-xs font-medium text-[#f0d081] hover:bg-[#DAA520]/25 disabled:opacity-50">
                {expPend ? '…' : '📄 PDF'}
              </button>
              <button onClick={() => startTransition(() => sairCliente())} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">
                Sair
              </button>
            </div>
          </div>
          {expMsg && <div className="mx-auto max-w-4xl px-4 pb-2 text-[11px] text-[#f0d081]">{expMsg}</div>}
        </header>

        <div className="mx-auto max-w-4xl px-4 py-5">
          {/* Controles de período: semana + dia da semana */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              {(['atual', 'passada'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setAba(k)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
                    aba === k ? 'bg-[#13200a] text-[#DAA520]' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {k === 'atual' ? 'Semana atual' : 'Semana passada'}
                </button>
              ))}
            </div>
            <select value={fDiaEff} onChange={(e) => setFDia(e.target.value)} className={`${inp} w-auto`}>
              <option value="">Todos os dias</option>
              {dias.map((d) => <option key={d} value={d}>{rotuloDia(d)}</option>)}
            </select>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {fDiaEff ? rotuloDia(fDiaEff) : `${fmtDia(sem.d1)} a ${fmtDia(sem.d2)}`}
            </span>
          </div>

          {/* Resumo — mesmas cores do painel: azul = entrada, roxo = em aberto,
              dourado = o número que o cliente abre a tela para ver. */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card icone="💰" cor="slate" titulo="Calção" valor={brl(dados.cliente.cal)} valorCls="text-slate-900 dark:text-slate-100" />
            <Card icone="⇄" cor="blue" titulo="Entradas" valor={brl(tot.entradas)} valorCls={tot.entradas ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-slate-100'} />
            <Card icone="🕐" cor="violet" titulo="Em aberto" valor={String(tot.abertas)} valorCls={tot.abertas ? 'text-violet-700 dark:text-violet-400' : 'text-slate-900 dark:text-slate-100'} />
            <Card icone="★" cor="destaque" destaque titulo="Saldo" valor={brl(tot.saldo)} valorCls={clr(tot.saldo)} />
          </div>

          {/* Abas de tela: o resumo (estatísticas) e a lista de bilhetes agora são
              telas separadas — a principal deixa de ser uma tabela gigante. */}
          <div className="mb-4 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {([['resumo', '📊 Resumo'], ['bilhetes', '🎫 Bilhetes']] as const).map(([k, txt]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === k ? 'bg-[#13200a] text-[#DAA520]' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {txt}
              </button>
            ))}
          </div>

          {view === 'resumo' ? (
            <ResumoView stats={stats} tot={tot} porStatus={porStatus.filter((s) => s.st !== 'EM ABERTO')} rowsQtd={rowsDia.length} onVerBilhetes={() => setView('bilhetes')} />
          ) : (
            <>
              {/* FILTROS da lista — busca e status. O dia fica no controle de período. */}
              <div className={`mb-3 p-3 ${painel}`}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="col-span-2">
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
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {filtrandoLista ? `${rows.length} de ${rowsDia.length} aposta(s)` : `${rowsDia.length} aposta(s)`}
                  </span>
                  {filtrandoLista && (
                    <button onClick={limparLista} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                      🗑️ Limpar
                    </button>
                  )}
                </div>
              </div>

              {/* MOBILE: um card por bilhete. */}
              <div className="space-y-2 sm:hidden">
                {rows.map((r) => (
                  <div key={r.id} className={`p-3 ${painel}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-center leading-tight">
                        {(() => { const p = partesTs(r.dt); return (<>
                          <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{p.hora}</span>
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500">{p.data}</span>
                        </>); })()}
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STPILL[r.st] ?? 'bg-slate-100 text-slate-600'}`}>{r.st}</span>
                    </div>

                    {(() => { const c = statusContestacao(r); return r.ct
                      ? <span className="mb-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">⚠️ Contestada</span>
                      : c.resolvida ? <div className="mb-1"><SeloCt desfecho={c.desfecho} quando={c.quando} /></div> : null; })()}
                    <div className="break-words font-mono text-[11px] leading-snug">{renderJogoLinhas(r.jogo)}</div>

                    <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center dark:border-slate-800">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Odd</div>
                        <div className="tabular-nums text-slate-800 dark:text-slate-100">{r.odd ? brl(oddDoCliente(r.odd)) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Valor</div>
                        <div className="tabular-nums text-slate-800 dark:text-slate-100">{r.val ? brl(r.val) : <span className="text-slate-400 dark:text-slate-500">aberto</span>}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Saldo</div>
                        <div className={`font-semibold tabular-nums ${clr(r.sl)}`}>{brl(r.sl)}</div>
                      </div>
                    </div>

                    {r.st !== 'EM ABERTO' && !r.ct && !statusContestacao(r).resolvida && (
                      <button onClick={() => abrirContestacao(r)} className="mt-2.5 w-full rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 active:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:active:bg-slate-800">
                        Contestar
                      </button>
                    )}
                    {r.ct && <div className="mt-2 text-center text-[11px] text-rose-500">em análise</div>}
                  </div>
                ))}
                {rows.length === 0 && (
                  <div className={`px-3 py-10 text-center text-slate-400 dark:text-slate-500 ${painel}`}>Nenhuma aposta neste período.</div>
                )}
              </div>

              {/* DESKTOP: a tabela de sempre */}
              <div className={`hidden overflow-x-auto sm:block ${painel}`}>
                <table className="w-full min-w-[640px] text-sm text-slate-800 dark:text-slate-100">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-500">
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
                      <tr key={r.id} className="border-b-2 border-slate-200 align-top dark:border-slate-800">
                        <td className="whitespace-nowrap px-3 py-2 text-center text-xs leading-tight">
                          {(() => { const p = partesTs(r.dt); return (<>
                            <div className="font-medium text-slate-700 dark:text-slate-200">{p.hora}</div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">{p.data}</div>
                          </>); })()}
                        </td>
                        <td className="px-3 py-2">
                          <div className="max-w-[340px] font-mono text-[11px] leading-snug">
                            {r.ct && <span className="mr-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">⚠️ Contestada</span>}
                            {(() => { const c = statusContestacao(r); return !r.ct && c.resolvida && <span className="mr-1"><SeloCt desfecho={c.desfecho} quando={c.quando} /></span>; })()}
                            {renderJogoLinhas(r.jogo)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.odd ? brl(oddDoCliente(r.odd)) : <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.val ? brl(r.val) : <span className="text-slate-300 dark:text-slate-600">aberto</span>}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STPILL[r.st] ?? 'bg-slate-100 text-slate-600'}`}>{r.st}</span>
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${clr(r.sl)}`}>{brl(r.sl)}</td>
                        <td className="px-3 py-2 text-center">
                          {r.st !== 'EM ABERTO' && !r.ct && !statusContestacao(r).resolvida && (
                            <button onClick={() => abrirContestacao(r)} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-rose-400 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300">
                              Contestar
                            </button>
                          )}
                          {r.ct && <span className="text-[11px] text-rose-500">em análise</span>}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400 dark:text-slate-500">Nenhuma aposta neste período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
                Para contestar, descreva o motivo. A aposta volta para conferência da banca.
              </p>
            </>
          )}
        </div>

        {/* Modal de contestação */}
        {contestando && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setContestando(null)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-1 text-base font-semibold text-slate-800 dark:text-slate-100">Contestar aposta #{contestando.id}</h3>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{renderJogoLinhas(contestando.jogo)}</p>

              <div className="mb-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                  Status lançado: <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STPILL[contestando.st] ?? 'bg-slate-100 text-slate-600'}`}>{contestando.st}</span>
                </div>
                <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">Qual seria o status correto?</div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPCOES.filter((s) => s !== contestando.st).map((s) => {
                    const on = stSugerido === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStSugerido(on ? '' : s)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${STBTN[s]} bg-white dark:bg-slate-900 ${on ? 'ring-2 ring-amber-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              {msg && <div className="mt-2 text-xs text-rose-600">{msg}</div>}
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setContestando(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Cancelar</button>
                <button onClick={enviarContestacao} disabled={pend || (!stSugerido && !motivo.trim())} className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                  {pend ? 'Enviando…' : 'Enviar contestação'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Tela de resumo: estatísticas do período (dia ou semana). ──
// Os blocos de status NÃO são fixos: aparece um para cada status com que os
// bilhetes foram de fato resolvidos (se não houve nenhum MEIO RED, não há bloco
// de MEIO RED). Assim um "meio ruim" solto não some do resumo.
function ResumoView({ stats, tot, porStatus, rowsQtd, onVerBilhetes }: {
  stats: { gQ: number; resolvidas: number; apv: number | null };
  tot: { abertas: number };
  porStatus: { st: string; qtd: number; val: number; sl: number }[];
  rowsQtd: number;
  onVerBilhetes: () => void;
}) {
  if (rowsQtd === 0) {
    return <div className={`px-3 py-12 text-center text-slate-400 dark:text-slate-500 ${painel}`}>Nenhuma aposta neste período.</div>;
  }
  return (
    <div className="space-y-4">
      {porStatus.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {porStatus.map((s) => <StatBox key={s.st} st={s.st} qtd={s.qtd} sl={s.sl} />)}
        </div>
      ) : (
        <div className={`px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500 ${painel}`}>
          Nenhum bilhete resolvido ainda neste período.
        </div>
      )}

      <div className={`p-4 ${painel}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Aproveitamento</span>
          <span className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {stats.apv === null ? '—' : `${stats.apv.toFixed(1)}%`}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${stats.apv ?? 0}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          {stats.gQ} green(s) em {stats.resolvidas} aposta(s) resolvida(s)
          {tot.abertas > 0 && ` · ${tot.abertas} ainda em aberto`}
        </div>
      </div>

      <button onClick={onVerBilhetes} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
        🎫 Ver os {rowsQtd} bilhete(s) →
      </button>
    </div>
  );
}

// Um bloco por status resolvido: o selo usa a MESMA cor do status na lista/painel;
// o R$ é o saldo daquele status (verde se somou a favor, vermelho se contra).
function StatBox({ st, qtd, sl }: { st: string; qtd: number; sl: number }) {
  return (
    <div className={`p-4 ${painel}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${STPILL[st] ?? 'bg-slate-100 text-slate-600'}`}>{st}</span>
        <span className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{qtd}</span>
      </div>
      <div className={`mt-2 text-lg font-semibold tabular-nums ${clr(sl)}`}>R$ {brl(sl)}</div>
    </div>
  );
}

// Selo do desfecho de uma contestação já resolvida, na visão do cliente.
function SeloCt({ desfecho, quando }: { desfecho: string; quando: string }) {
  const aceita = desfecho === 'aceita';
  return (
    <span
      title={`Sua contestação foi ${aceita ? 'aceita' : 'recusada'}${quando && quando !== 'agora' ? ` em ${quando}` : ''}`}
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${aceita ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
    >
      {aceita ? '✓ contestação aceita' : 'contestação recusada'}
    </span>
  );
}

function Card({ icone, cor, titulo, valor, valorCls, destaque }: {
  icone: string; cor: keyof typeof CARD_COR; titulo: string; valor: string; valorCls: string; destaque?: boolean;
}) {
  const selo = CARD_COR[cor] ?? CARD_COR.slate;
  return (
    <div className={`rounded-xl border border-amber-400 bg-white p-3 dark:border-amber-500/40 dark:bg-slate-900 ${destaque ? 'ring-1 ring-amber-400/30' : ''}`}>
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
