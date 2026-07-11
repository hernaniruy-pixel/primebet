'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Afiliado, Cliente, Reg, Totals, ApostasPage, FiltroApostas, FechCliResp, FechAfResp, FechCliRow } from './types';
import {
  criarAposta, atualizarAposta, excluirAposta, listarApostas, resolverContestacao,
  criarCliente, atualizarCliente, criarAfiliado, atualizarAfiliado,
  fechamentoClientes, fechamentoAfiliados, bilhetesCliente,
} from './actions';
import { gerarPdfFechamento } from './pdf-fechamento';

interface Draft { dt?: string; odd?: string; val?: string; jogo?: string; st?: string; _saved?: boolean }

const STS = ['EM ABERTO', 'GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO'];
const DCS = ['', 'BETANO', 'BET365', 'SPORTINGBET', 'SUPERBET', 'PIXBET'];
const PAGE_SIZE = 20;

// Cores sólidas do status (igual ao original): fundo saturado + texto branco/escuro.
const STPILL: Record<string, string> = {
  'EM ABERTO': 'bg-blue-600 text-white',
  GREEN: 'bg-green-600 text-white',
  'MEIO GREEN': 'bg-green-300 text-green-900',
  'MEIO RED': 'bg-red-300 text-red-900',
  RED: 'bg-red-600 text-white',
  REEMBOLSO: 'bg-yellow-400 text-yellow-900',
};

// Mesmas cores em hex — para o <select>/<option> nativos (que ignoram classes Tailwind).
const STCOLOR: Record<string, { bg: string; fg: string }> = {
  'EM ABERTO': { bg: '#2563eb', fg: '#ffffff' },
  GREEN: { bg: '#16a34a', fg: '#ffffff' },
  'MEIO GREEN': { bg: '#86efac', fg: '#14532d' },
  'MEIO RED': { bg: '#fca5a5', fg: '#7f1d1d' },
  RED: { bg: '#dc2626', fg: '#ffffff' },
  REEMBOLSO: { bg: '#facc15', fg: '#713f12' },
};
const stStyle = (s: string) => STCOLOR[s] ?? { bg: '#ffffff', fg: '#1e293b' };

const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toISOString().split('T')[0];

// Regra de cor dos números (igual ao jmprint): positivo verde, negativo vermelho, ZERO preto.
const ZEROCLS = 'text-slate-900 dark:text-slate-100';
const clrCls = (n: number) => { const v = Number(n) || 0; return v > 0 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-rose-600 dark:text-rose-400' : ZEROCLS; };
const comCls = (n: number) => (Number(n) === 0 ? ZEROCLS : 'text-rose-600 dark:text-rose-400'); // comissões: vermelho (preto se 0)
const entCls = (n: number) => (Number(n) === 0 ? ZEROCLS : 'text-blue-600 dark:text-blue-400'); // entradas/em aberto: azul (preto se 0)
const posCls = (n: number) => (Number(n) === 0 ? ZEROCLS : 'text-emerald-600 dark:text-emerald-400'); // entrada: verde (preto se 0)

// Renderiza o jogo deixando os TIMES em negrito (a linha que contém "(Odd ...)").
// Cobre os formatos "Time A - Time B", "Time A @ Time B" e "Time A v Time B".
function renderJogo(jogo: string) {
  return (jogo || '').split('\n').map((line, i) => {
    const t = line.trimStart();
    // Linha de jogo = começa com "N)" OU contém "(Odd ...)"; linhas de mercado ("•") ficam normais.
    const isGame = /^\d+\)/.test(t) || (/\(odd/i.test(line) && !t.startsWith('•'));
    if (isGame) {
      const pm = line.match(/^(\s*\d+\)\s*)?([\s\S]*)$/);
      const pref = pm?.[1] ?? '';
      const body = pm?.[2] ?? line;
      const om = body.match(/^(.*?)(\s*\(odd.*)$/i); // separa o "(Odd ...)" se existir
      const teams = (om ? om[1] : body).trim();
      const rest = om ? om[2].trim() : '';
      return <div key={i}>{pref}<b className="font-bold">{teams}</b>{rest ? ` ${rest}` : ''}</div>;
    }
    return <div key={i}>{line}</div>;
  });
}
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
  aba: 'pend',  // 'pend' = fila pendente (EM ABERTO + contestadas) | 'todas' = histórico completo
};

const inp = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
const lbl = 'mb-1 block text-[11px] font-medium text-slate-400 dark:text-slate-500';
const cinp = 'rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-amber-500';

function Modal({ title, onClose, max = 'max-w-3xl', children }: { title: ReactNode; onClose: () => void; max?: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className={`my-6 flex max-h-[88vh] w-full ${max} flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900`} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="text-base font-medium">{title}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export default function PainelModerno({ email, clientesIni, afiliadosIni, apostasIni, semana }: {
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
  const [clientes, setClientes] = useState<Cliente[]>(clientesIni);
  const [afiliados, setAfiliados] = useState<Afiliado[]>(afiliadosIni);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [modal, setModal] = useState<null | 'cli' | 'af' | 'fech' | 'faf' | 'wpp'>(null);
  const [wpp, setWpp] = useState({ cId: '', jogo: '', odd: '', val: '', dc: '' });
  const [novoCli, setNovoCli] = useState({ open: false, nome: '', senha: '', cal: '', desc: '0.01', com: '6', af: '0', sup: '', grupoLink: '' });
  const [novoAf, setNovoAf] = useState({ open: false, nome: '', com: '0' });
  const [obsModal, setObsModal] = useState<{ id: number; text: string } | null>(null);
  const [fech, setFech] = useState(() => { const p = periodDates('semana_ant'); return { dt1: p.d1, dt2: p.d2, period: 'semana_ant' }; }); // fechamento é sempre da semana passada
  const [faf, setFaf] = useState({ dt1: semana.d1, dt2: semana.d2, period: 'semana' });
  const [fechRes, setFechRes] = useState<FechCliResp | null>(null);
  const [fafRes, setFafRes] = useState<FechAfResp | null>(null);
  const [pdfBusy, setPdfBusy] = useState<number | null>(null); // id do cliente cujo PDF está sendo gerado
  const [filtros, setFiltros] = useState({ ...filtrosVazios, dt1: semana.d1, dt2: semana.d2, period: 'semana' });
  const [debFiltros, setDebFiltros] = useState(filtros);
  const [page, setPage] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [flashId, setFlashId] = useState<number | null>(null); // linha recém-atualizada (flash verde)
  const [novo, setNovo] = useState({ open: false, cId: '', jogo: '', odd: '', val: '', st: 'EM ABERTO', dc: '' });

  const cliSorted = useMemo(() => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome)), [clientes]);

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
      bl: f.bl === 'sim' ? true : f.bl === 'nao' ? false : null,
      adv: f.adv === 'sim' ? true : f.adv === 'nao' ? false : null,
      irr: f.irr === 'sim' ? true : f.irr === 'nao' ? false : null,
      dt1: f.dt1 || null, dt2: f.dt2 || null, ord: f.ord, page,
      pend: f.aba === 'pend' ? true : null,
    };
    // Na fila pendente, ignora o período (mostra TODA pendente, mesmo antiga).
    if (f.aba === 'pend') { params.dt1 = null; params.dt2 = null; }
    listarApostas(params)
      .then((r) => { if (alive) { setRegs(r.rows); setTotal(r.total); setTotals(r.totals); } })
      .catch(() => { if (alive) toast('Erro ao carregar apostas.'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debFiltros, page, reloadKey]);

  // Atualizar/recarregar DESCARTA rascunhos não salvos (status pendente volta ao real).
  const reload = () => { setDrafts({}); setReloadKey((k) => k + 1); };
  const navBtn = 'rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-white/15';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const start = (pageSafe - 1) * PAGE_SIZE;

  const dV = (r: Reg, f: 'dt' | 'odd' | 'val' | 'jogo' | 'st') => { const d = drafts[r.id]; return d && d[f] !== undefined ? d[f]! : String(r[f]); };
  const edited = (r: Reg, f: 'dt' | 'odd' | 'val' | 'jogo' | 'st') => drafts[r.id]?.[f] !== undefined;
  function updDraft(id: number, f: 'dt' | 'odd' | 'val' | 'jogo' | 'st', v: string) { setDrafts((d) => ({ ...d, [id]: { ...d[id], [f]: v } })); }

  // Converte um patch (campos do banco) para os campos da linha, p/ atualização otimista.
  function patchParaReg(patch: Parameters<typeof atualizarAposta>[1]): Partial<Reg> {
    const p: Partial<Reg> = {};
    if (patch.st !== undefined) p.st = patch.st;
    if (patch.bl !== undefined) p.bl = patch.bl;
    if (patch.adv !== undefined) p.adv = patch.adv;
    if (patch.irr !== undefined) p.irr = patch.irr;
    if (patch.cId !== undefined) p.cId = patch.cId;
    if (patch.obs !== undefined) p.obs = patch.obs;
    if (patch.odd !== undefined) p.odd = patch.odd;
    if (patch.val !== undefined) p.val = patch.val;
    if (patch.dc !== undefined) p.dc = patch.dc;
    if (patch.jogo !== undefined) p.jogo = patch.jogo;
    return p;
  }

  async function patchReg(id: number, patch: Parameters<typeof atualizarAposta>[1]) {
    const prev = regs.find((r) => r.id === id);
    // OTIMISTA: aplica na tela imediatamente (sem esperar o servidor) — sensação de fluidez.
    setRegs((rs) => rs.map((r) => (r.id === id ? { ...r, ...patchParaReg(patch) } : r)));
    setFlashId(null);
    requestAnimationFrame(() => setFlashId(id));
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600);
    if (patch.st !== undefined) {
      const nome = clientes.find((c) => c.id === (patch.cId ?? prev?.cId))?.nome ?? `#${id}`;
      toast(`Status de ${nome} → ${patch.st}.`);
    }
    // Salva em segundo plano; reconcilia saldos com a resposta ou reverte se falhar.
    try {
      const reg = await atualizarAposta(id, patch);
      setRegs((rs) => rs.map((r) => (r.id === id ? reg : r)));
    } catch {
      if (prev) setRegs((rs) => rs.map((r) => (r.id === id ? prev : r)));
      toast('Erro ao salvar — alteração desfeita.');
    }
  }
  function resolverCt(id: number) {
    // OTIMISTA: some da fila na hora; resolve no servidor em segundo plano.
    if (filtros.aba === 'pend') setRegs((rs) => rs.filter((r) => r.id !== id));
    else setRegs((rs) => rs.map((r) => (r.id === id ? { ...r, ct: false, ctStatus: '', ctMotivo: '' } : r)));
    setTotals((t) => ({ ...t, contestadas_qtd: Math.max(0, (t.contestadas_qtd ?? 1) - 1) }));
    toast('Contestação resolvida.');
    resolverContestacao(id).catch(() => toast('Erro ao resolver — clique em Atualizar.'));
  }
  // "Salvar" = concluir a aposta: grava as edições pendentes, encerra contestação e,
  // se a aposta já está resolvida (fora de EM ABERTO), tira ela da fila do dashboard.
  // O status em si já é gravado ao ser escolhido no seletor; aqui garantimos a baixa.
  async function saveReg(id: number) {
    const d = drafts[id] || {};
    const reg = regs.find((r) => r.id === id);
    // Status efetivo = rascunho (se o operador selecionou) ou o status atual do banco.
    const statusEfetivo = d.st ?? reg?.st;
    const patch = {
      ...(d.dt !== undefined ? { dt: d.dt } : {}),
      ...(d.odd !== undefined ? { odd: Number(d.odd) } : {}),
      ...(d.val !== undefined ? { val: Number(d.val) } : {}),
      ...(d.jogo !== undefined ? { jogo: d.jogo } : {}),
      ...(d.st !== undefined ? { st: d.st } : {}),
    };
    const temEdicao = Object.keys(patch).length > 0;
    const resolvida = !!statusEfetivo && statusEfetivo !== 'EM ABERTO';

    if (filtros.aba === 'pend' && !resolvida) {
      // Ainda EM ABERTO (nenhum status resolvedor escolhido): não há o que concluir.
      toast('Selecione um status (GREEN, RED…) e clique em Salvar para concluir a aposta.');
      return; // mantém eventuais rascunhos visíveis
    }

    // OTIMISTA: dá baixa na fila na hora; persiste (edição + encerrar contestação) em background.
    if (filtros.aba === 'pend') setRegs((rs) => rs.filter((r) => r.id !== id));
    else setRegs((rs) => rs.map((r) => (r.id === id ? { ...r, ct: false, ctStatus: '', ctMotivo: '' } : r)));
    if (reg?.ct) setTotals((t) => ({ ...t, contestadas_qtd: Math.max(0, (t.contestadas_qtd ?? 1) - 1) }));
    setDrafts((dr) => { const c = { ...dr }; delete c[id]; return c; });
    toast('Aposta salva e concluída ✓');
    (async () => {
      try {
        if (temEdicao) {
          const rr = await atualizarAposta(id, patch);
          if (filtros.aba !== 'pend') setRegs((rs) => rs.map((r) => (r.id === id ? rr : r)));
        }
        if (reg?.ct) await resolverContestacao(id);
      } catch { toast('Erro ao salvar no servidor — clique em Atualizar.'); }
    })();
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
  async function receberBilhete() {
    if (!wpp.cId || !wpp.jogo.trim()) { alert('Selecione o cliente e cole o bilhete transcrito.'); return; }
    try {
      await criarAposta({ cId: Number(wpp.cId), jogo: wpp.jogo, odd: Number(wpp.odd) || 0, val: Number(wpp.val) || 0, st: 'EM ABERTO', dc: wpp.dc });
      setWpp({ cId: '', jogo: '', odd: '', val: '', dc: '' }); setModal(null); reload();
      const inc = !(Number(wpp.odd) > 0) || !(Number(wpp.val) > 0);
      toast(inc ? 'Bilhete recebido (EM ABERTO) — preencha odd/valor.' : 'Bilhete recebido na fila.');
    } catch { toast('Erro ao receber bilhete.'); }
  }
  async function sair() { const s = createClient(); await s.auth.signOut(); router.replace('/login'); }
  async function salvarObs() { if (!obsModal) return; const t = obsModal.text.trim(); await patchReg(obsModal.id, { obs: t, adv: t.length > 0 }); setObsModal(null); toast(t ? 'Advertência salva.' : 'Advertência removida.'); }
  async function resolverObs() { if (!obsModal) return; await patchReg(obsModal.id, { adv: false }); setObsModal(null); toast('Advertência resolvida.'); }

  // clientes
  function updCli(id: number, patch: Partial<Cliente>) { setClientes((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))); }
  async function saveCli(id: number) {
    const c = clientes.find((x) => x.id === id); if (!c) return;
    try {
      const res = await atualizarCliente(id, { nome: c.nome, s: c.s, on: c.on, cal: c.cal, desc: c.desc, com: c.com, sup: c.sup, af: c.af, link: c.link, grupoLink: c.grupoLink });
      setClientes((cs) => cs.map((x) => (x.id === id ? res.cliente : x))); reload(); toast('Cliente salvo!');
    } catch { toast('Erro ao salvar cliente.'); }
  }
  function novoCliente() { setNovoCli({ open: true, nome: '', senha: '', cal: '', desc: '0.01', com: '6', af: '0', sup: '', grupoLink: '' }); }
  async function salvarNovoCliente() {
    if (!novoCli.nome.trim()) { alert('Informe o nome.'); return; }
    try {
      const c = await criarCliente({ nome: novoCli.nome, senha: novoCli.senha, calcao: Number(novoCli.cal) || 0, desconto: Number(novoCli.desc) || 0, comissao: Number(novoCli.com) || 0, comissaoSup: Number(novoCli.af) || 0, sup: novoCli.sup || null, grupoLink: novoCli.grupoLink || null });
      setClientes((cs) => [...cs, c].sort((a, b) => a.nome.localeCompare(b.nome))); setNovoCli((s) => ({ ...s, open: false })); toast('Cliente criado!');
    } catch { toast('Erro ao criar cliente.'); }
  }
  // afiliados
  function updAf(id: number, patch: Partial<Afiliado>) { setAfiliados((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a))); }
  async function saveAf(id: number) { const a = afiliados.find((x) => x.id === id); if (!a) return; try { const res = await atualizarAfiliado(id, { nome: a.nome, com: a.com }); setAfiliados((as) => as.map((x) => (x.id === id ? res : x))); toast('Afiliado salvo!'); } catch { toast('Erro ao salvar afiliado.'); } }
  function novoAfiliado() { setNovoAf({ open: true, nome: '', com: '0' }); }
  async function salvarNovoAfiliado() { if (!novoAf.nome.trim()) { alert('Informe o nome.'); return; } try { const a = await criarAfiliado(novoAf.nome, Number(novoAf.com) || 0); setAfiliados((as) => [...as, a].sort((x, y) => x.nome.localeCompare(y.nome))); setNovoAf((s) => ({ ...s, open: false })); toast('Afiliado criado!'); } catch { toast('Erro ao criar afiliado.'); } }
  // fechamento
  function loadFech(d1: string, d2: string) { fechamentoClientes(d1 || null, d2 || null).then(setFechRes).catch(() => toast('Erro no fechamento.')); }
  async function baixarPdfCliente(row: FechCliRow) {
    if (pdfBusy != null) return;
    setPdfBusy(row.id);
    try {
      const bilhetes = await bilhetesCliente(row.id, fech.dt1 || null, fech.dt2 || null);
      gerarPdfFechamento({ banca: 'PrimeBet', resumo: row, bilhetes, dt1: fech.dt1, dt2: fech.dt2 });
    } catch { toast('Erro ao gerar o PDF.'); }
    finally { setPdfBusy(null); }
  }
  function loadFaf(d1: string, d2: string) { fechamentoAfiliados(d1 || null, d2 || null).then(setFafRes).catch(() => toast('Erro no fechamento.')); }
  useEffect(() => {
    if (modal === 'fech') loadFech(fech.dt1, fech.dt2);
    if (modal === 'faf') loadFaf(faf.dt1, faf.dt2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);
  const fechData = fechRes ?? { rows: [], g: { cal: 0, saldoCal: 0, val: 0, ab: 0, sb: 0, cm: 0, caf: 0, sl: 0 } };
  const fafData = fafRes ?? { rows: [], g: { logins: 0, val: 0, ab: 0, sb: 0, cm: 0, caf: 0, sl: 0 } };

  return (
    <div className={dark ? 'dark' : ''}>
      <style>{`@keyframes pbAlertPulse{0%,100%{border-color:#ef4444}50%{border-color:#fecaca}} tr.pb-alert>td{border-width:2px;animation:pbAlertPulse 1.1s ease-in-out infinite} @keyframes pbFlash{0%{background-color:rgba(34,197,94,.45)}100%{background-color:transparent}} tr.pb-flash>td{animation:pbFlash 1.6s ease-out}`}</style>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {/* TOPBAR */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-2 border-amber-500 bg-slate-900 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">★</div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-amber-400">PrimeBet</div>
              <div className="text-[11px] text-slate-400">Controle</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setModal('cli')} className={navBtn}>Clientes</button>
            <button onClick={() => setModal('af')} className={navBtn}>Afiliados</button>
            <button onClick={() => setModal('fech')} className={navBtn}>Fechamento</button>
            <button onClick={() => setModal('faf')} className={navBtn}>Fech. afiliado</button>
            <a href="/admin/conferencia" className={navBtn} title="Conferência de grupos (imagens recebidas × transcritas)">🗂 Conferência</a>
            <a href="/admin/despesas" className={navBtn} title="Despesas (lançadas pelo grupo despesa)">Despesas</a>
            <button onClick={toggleTheme} title="Tema" className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 transition hover:bg-white/15">{dark ? '☀' : '🌙'}</button>
            <button onClick={sair} className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30">Sair</button>
          </div>
        </header>

        <main className="w-full px-4 py-5 sm:px-6">
          <div className="mb-1 text-lg font-medium">Primebet — Controle</div>
          <div className="mb-4 text-xs text-slate-400">Registros — {email}</div>

          {/* MÉTRICAS */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { l: 'Entrada', v: tot(totals.entradas), s: `${total} linhas`, c: posCls(totals.entradas) },
              { l: 'Em aberto', v: tot(totals.em_aberto_total), s: `${totals.em_aberto_qtd} linhas`, c: entCls(totals.em_aberto_total) },
              { l: 'Saldo bruto', v: tot(totals.saldo_bruto), c: clrCls(totals.saldo_bruto) },
              { l: 'Comissão', v: tot(totals.comissao), c: comCls(totals.comissao) },
              { l: 'Com. afiliados', v: tot(totals.comissao_afiliado), c: comCls(totals.comissao_afiliado) },
              { l: 'Saldo líquido', v: tot(totals.saldo_liquido), c: clrCls(totals.saldo_liquido) },
              { l: 'Total fechamento', v: tot(totals.saldo_liquido - totals.comissao_afiliado), c: clrCls(totals.saldo_liquido - totals.comissao_afiliado) },
            ].map((m) => (
              <div key={m.l} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{m.l}</div>
                <div className={`mt-1 text-lg font-semibold tabular-nums ${m.c}`}>{m.v}</div>
                {m.s && <div className="mt-0.5 text-[11px] text-slate-400">{m.s}</div>}
              </div>
            ))}
          </div>

          {/* ABAS: fila pendente x histórico completo */}
          <div className="mb-3 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900 w-fit">
            {([['pend', 'Pendentes'], ['todas', 'Todas']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setF('aba', k)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  filtros.aba === k
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {label}
                {k === 'pend' && (totals.contestadas_qtd ?? 0) > 0 && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white align-middle">
                    ⚠️ {totals.contestadas_qtd}
                  </span>
                )}
              </button>
            ))}
            <span className="ml-2 pr-2 text-[11px] text-slate-400">
              {filtros.aba === 'pend' ? 'contestadas no topo · EM ABERTO + contestadas (todas as datas)' : 'histórico completo'}
            </span>
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
              <div><span className={lbl}>ID</span><input className={inp} value={filtros.id} onChange={(e) => setF('id', e.target.value)} placeholder="ex: 10" /></div>
              <div><span className={lbl}>Odd mín</span><input type="number" step="0.01" className={inp} value={filtros.oddMin} onChange={(e) => setF('oddMin', e.target.value)} /></div>
              <div><span className={lbl}>Odd máx</span><input type="number" step="0.01" className={inp} value={filtros.oddMax} onChange={(e) => setF('oddMax', e.target.value)} /></div>
              <div><span className={lbl}>Entradas mín</span><input type="number" className={inp} value={filtros.valMin} onChange={(e) => setF('valMin', e.target.value)} /></div>
              <div><span className={lbl}>Entradas máx</span><input type="number" className={inp} value={filtros.valMax} onChange={(e) => setF('valMax', e.target.value)} /></div>
              <div><span className={lbl}>Baixa liquidez</span><select className={inp} value={filtros.bl} onChange={(e) => setF('bl', e.target.value)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
              <div><span className={lbl}>Advertido</span><select className={inp} value={filtros.adv} onChange={(e) => setF('adv', e.target.value)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
              <div><span className={lbl}>Irregular</span><select className={inp} value={filtros.irr} onChange={(e) => setF('irr', e.target.value)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button onClick={limpar} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Limpar</button>
              <button onClick={() => { reload(); toast('Lista atualizada.'); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20">🔄 Atualizar</button>
            </div>
          </div>

          <div className="mb-2 text-xs text-slate-400">{total} aposta(s) · página {pageSafe}/{totalPages} · exibindo {total ? start + 1 : 0}–{start + regs.length}</div>

          {/* TABELA */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-slate-200 [&_th]:border [&_th]:border-slate-200 dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-2 py-2 font-medium">id</th><th className="px-2 py-2 font-medium">data</th>
                    <th className="px-2 py-2 font-medium">nome</th><th className="px-2 py-2 font-medium">jogo</th>
                    <th className="px-2 py-2 text-right font-medium">odd</th><th className="px-2 py-2 text-right font-medium">entradas</th>
                    <th className="px-2 py-2 font-medium">status</th>
                    <th className="px-2 py-2 text-right font-medium">s. bruto</th><th className="px-2 py-2 text-right font-medium">comissão</th>
                    <th className="px-2 py-2 text-center font-medium">baixa liq.</th><th className="px-2 py-2 text-right font-medium">saldo líq.</th>
                    <th className="px-2 py-2 text-center font-medium">ações</th>
                  </tr>
                </thead>
                <tbody>
                  {regs.map((r) => {
                    const inc = !(Number(r.odd) > 0) || !(Number(r.val) > 0);
                    return (
                      <tr key={r.id} className={`border-b border-slate-100 align-middle transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40 ${inc ? 'pb-alert bg-rose-50/60 dark:bg-rose-500/5' : ''} ${flashId === r.id ? 'pb-flash' : ''}`}>
                        <td className="px-2 py-1.5 font-medium text-slate-500">{r.id}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-xs text-slate-500">{r.dt}</td>
                        <td className="px-2 py-1.5">
                          <select value={String(r.cId)} onChange={(e) => patchReg(r.id, { cId: Number(e.target.value) })} className={`${cinp} w-36 font-medium`}>{cliSorted.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                          {inc && <span className="ml-1 inline-block rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">preencher</span>}
                        </td>
                        <td className="px-2 py-1.5"><div className="max-w-[340px] text-xs leading-snug">
                          {r.ct && (
                            <span className="mb-1 flex flex-wrap items-center gap-1">
                              <span title={r.ctMotivo || 'Contestada pelo cliente'} className="inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">⚠️ Contestada</span>
                              {r.ctStatus && (
                                <span title="Status que o cliente sugere" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                  <span className="text-slate-500 dark:text-slate-400">cliente sugere:</span>
                                  <span className={`rounded-full px-2 py-0.5 ${STPILL[r.ctStatus] ?? 'bg-slate-200 text-slate-700'}`}>{r.ctStatus}</span>
                                </span>
                              )}
                              {r.ctMotivo && (
                                <span title={r.ctMotivo} className="inline-block max-w-[220px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">💬 {r.ctMotivo}</span>
                              )}
                            </span>
                          )}
                          {renderJogo(r.jogo)}
                        </div></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cinp} w-16 text-right ${edited(r, 'odd') ? 'border-amber-400' : ''}`} value={dV(r, 'odd')} onChange={(e) => updDraft(r.id, 'odd', e.target.value)} /></td>
                        <td className="px-2 py-1.5"><input type="number" className={`${cinp} w-20 text-right font-medium ${edited(r, 'val') ? 'border-amber-400' : ''}`} value={dV(r, 'val')} onChange={(e) => updDraft(r.id, 'val', e.target.value)} /></td>
                        <td className="px-2 py-1.5">
                          {(() => { const stv = dV(r, 'st'); const pend = edited(r, 'st'); return (
                            <select value={stv} onChange={(e) => updDraft(r.id, 'st', e.target.value)} title={pend ? 'Status não salvo — clique em Salvar para confirmar' : undefined} style={{ backgroundColor: stStyle(stv).bg, color: stStyle(stv).fg, boxShadow: pend ? '0 0 0 2px #f59e0b' : undefined }} className="rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none cursor-pointer">{STS.map((s) => <option key={s} value={s} style={{ backgroundColor: stStyle(s).bg, color: stStyle(s).fg }}>{s}</option>)}</select>
                          ); })()}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${clrCls(r.sb)}`}>{fmt(r.sb)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.cm)}`}>{fmt(r.cm)}</td>
                        <td className="px-2 py-1.5 text-center"><select value={r.bl ? 'Sim' : 'Não'} onChange={(e) => patchReg(r.id, { bl: e.target.value === 'Sim' })} className={`${cinp} w-16`}><option>Não</option><option>Sim</option></select></td>
                        <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${clrCls(r.sl)}`}>{fmt(r.sl)}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex justify-center gap-1.5">
                            {r.adv && <button onClick={() => setObsModal({ id: r.id, text: r.obs })} title={`Advertência: ${r.obs}`} className="rounded-lg bg-rose-600 px-2 py-1 text-xs text-white transition hover:bg-rose-700">⚠</button>}
                            {r.ct && <button onClick={() => resolverCt(r.id)} title="Encerrar contestação mantendo o status atual" className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700">✓ Resolver</button>}
                            <button onClick={() => saveReg(r.id)} className={`rounded-lg px-2.5 py-1 text-xs font-medium text-white transition ${drafts[r.id]?._saved ? 'bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{drafts[r.id]?._saved ? '✓' : 'Salvar'}</button>
                            <button onClick={() => delReg(r.id)} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10">Excluir</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {regs.length === 0 && <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-400">{filtros.aba === 'pend' ? '✅ Nenhuma aposta pendente. Fila limpa!' : 'Nenhuma aposta no período. Use o período rápido ou limpe as datas.'}</td></tr>}
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

        {/* CLIENTES */}
        {modal === 'cli' && (
          <Modal onClose={() => setModal(null)} max="max-w-6xl" title={<div className="flex items-center gap-3"><span>Clientes</span><button onClick={novoCliente} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700">+ Novo</button></div>}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-400">
                  <th className="px-2 py-2 font-medium">ID</th><th className="px-2 py-2 font-medium">Nome</th><th className="px-2 py-2 font-medium">Senha</th><th className="px-2 py-2 font-medium">Ativo</th><th className="px-2 py-2 font-medium">Calção</th><th className="px-2 py-2 font-medium">Desc.</th><th className="px-2 py-2 font-medium">Com.%</th><th className="px-2 py-2 font-medium">Supervisor</th><th className="px-2 py-2 font-medium">C.Afil.%</th><th className="px-2 py-2 font-medium">Grupo (link)</th><th className="px-2 py-2 font-medium sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">Ações</th>
                </tr></thead>
                <tbody>{clientes.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1.5 text-slate-500">{c.id}</td>
                    <td className="px-2 py-1.5"><input className={`${cinp} w-36 font-medium`} value={c.nome} onChange={(e) => updCli(c.id, { nome: e.target.value.toUpperCase() })} /></td>
                    <td className="px-2 py-1.5"><input className={`${cinp} w-24`} value={c.s} onChange={(e) => updCli(c.id, { s: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><select className={cinp} value={c.on ? 'Sim' : 'Não'} onChange={(e) => updCli(c.id, { on: e.target.value === 'Sim' })}><option>Sim</option><option>Não</option></select></td>
                    <td className="px-2 py-1.5"><input type="number" className={`${cinp} w-20 text-right`} value={c.cal} onChange={(e) => updCli(c.id, { cal: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cinp} w-16 text-right`} value={c.desc} onChange={(e) => updCli(c.id, { desc: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cinp} w-14`} value={c.com} onChange={(e) => updCli(c.id, { com: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5"><select className={`${cinp} w-32`} value={c.sup ?? '—'} onChange={(e) => updCli(c.id, { sup: e.target.value === '—' ? null : e.target.value })}><option>—</option>{afiliados.map((a) => <option key={a.id} value={a.nome}>{a.nome}</option>)}</select></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cinp} w-14`} value={c.af} onChange={(e) => updCli(c.id, { af: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5"><div className="flex items-center gap-1"><input className={`${cinp} w-44`} placeholder="link do grupo" value={c.grupoLink ?? ''} onChange={(e) => updCli(c.id, { grupoLink: e.target.value })} /><span title={c.grupoId ? 'Grupo vinculado: ' + c.grupoId : 'Aguardando o bot resolver o link'}>{c.grupoId ? '✅' : (c.grupoLink ? '⏳' : '')}</span></div></td>
                    <td className="px-2 py-1.5 sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800"><button onClick={() => saveCli(c.id)} className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700">Salvar</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Modal>
        )}

        {/* AFILIADOS */}
        {modal === 'af' && (
          <Modal onClose={() => setModal(null)} max="max-w-xl" title={<div className="flex items-center gap-3"><span>Afiliados</span><button onClick={novoAfiliado} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700">+ Novo</button></div>}>
            <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-slate-200 [&_th]:border [&_th]:border-slate-200 dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-700">
              <thead><tr className="text-left text-slate-400"><th className="px-2 py-2 font-medium">ID</th><th className="px-2 py-2 font-medium">Nome</th><th className="px-2 py-2 font-medium">Comissão %</th><th className="px-2 py-2 font-medium">Ações</th></tr></thead>
              <tbody>{afiliados.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5 text-slate-500">{a.id}</td>
                  <td className="px-2 py-1.5"><input className={`${cinp} w-full`} value={a.nome} onChange={(e) => updAf(a.id, { nome: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cinp} w-24`} value={a.com} onChange={(e) => updAf(a.id, { com: Number(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><button onClick={() => saveAf(a.id)} className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700">Salvar</button></td>
                </tr>
              ))}</tbody>
            </table>
          </Modal>
        )}

        {/* FECHAMENTO */}
        {modal === 'fech' && (
          <Modal onClose={() => setModal(null)} max="max-w-6xl" title="Fechamento">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div><span className={lbl}>Data início</span><input type="date" className={inp} value={fech.dt1} onChange={(e) => setFech((f) => ({ ...f, dt1: e.target.value, period: '' }))} /></div>
              <div><span className={lbl}>Data fim</span><input type="date" className={inp} value={fech.dt2} onChange={(e) => setFech((f) => ({ ...f, dt2: e.target.value, period: '' }))} /></div>
              <div><span className={lbl}>Período</span><select className={inp} value={fech.period} onChange={(e) => { const p = periodDates(e.target.value); setFech({ period: e.target.value, dt1: p.d1, dt2: p.d2 }); loadFech(p.d1, p.d2); }}><option value="">—</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Esta semana</option><option value="semana_ant">Semana passada</option></select></div>
              <button onClick={() => loadFech(fech.dt1, fech.dt2)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Buscar</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['Calção', fechData.g.cal], ['Saldo calção', fechData.g.saldoCal], ['Total apostado', fechData.g.val], ['Em aberto', fechData.g.ab], ['Saldo bruto', fechData.g.sb], ['Comissão', fechData.g.cm], ['Com. afiliado', fechData.g.caf], ['Saldo líquido', fechData.g.sl]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50"><div className="text-[11px] text-slate-400">{l}</div><div className="text-sm font-semibold tabular-nums">R$ {fmt(v)}</div></div>
              ))}
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="text-left text-slate-400"><th className="px-2 py-2 font-medium">Cliente</th><th className="px-2 py-2 text-right font-medium">Calção</th><th className="px-2 py-2 text-right font-medium">Saldo calção</th><th className="px-2 py-2 text-right font-medium">Apostado</th><th className="px-2 py-2 text-right font-medium">Em aberto</th><th className="px-2 py-2 text-right font-medium">S. bruto</th><th className="px-2 py-2 text-right font-medium">Comissão</th><th className="px-2 py-2 text-right font-medium">C. afil.</th><th className="px-2 py-2 text-right font-medium">S. líquido</th><th className="px-2 py-2 text-center font-medium sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">PDF</th></tr></thead>
              <tbody>{fechData.rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5 font-medium">{r.nome}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.cal)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${clrCls(r.saldoCal)}`}>{fmt(r.saldoCal)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${entCls(r.val)}`}>{fmt(r.val)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${entCls(r.ab)}`}>{fmt(r.ab)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${clrCls(r.sb)}`}>{fmt(r.sb)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.cm)}`}>{fmt(r.cm)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.caf)}`}>{fmt(r.caf)}</td><td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${clrCls(r.sl)}`}>{fmt(r.sl)}</td>
                  <td className="px-2 py-1.5 text-center sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800">
                    <button onClick={() => baixarPdfCliente(r)} disabled={pdfBusy != null} title="Baixar PDF do fechamento" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">
                      {pdfBusy === r.id
                        ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60"/></svg>
                        : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                    </button>
                  </td>
                </tr>
              ))}
              {fechData.rows.length === 0 && <tr><td colSpan={10} className="px-2 py-8 text-center text-slate-400">Sem movimento no período.</td></tr>}
              </tbody>
            </table></div>
          </Modal>
        )}

        {/* FECHAMENTO AFILIADO */}
        {modal === 'faf' && (
          <Modal onClose={() => setModal(null)} max="max-w-5xl" title="Fechamento afiliado">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div><span className={lbl}>Data início</span><input type="date" className={inp} value={faf.dt1} onChange={(e) => setFaf((f) => ({ ...f, dt1: e.target.value, period: '' }))} /></div>
              <div><span className={lbl}>Data fim</span><input type="date" className={inp} value={faf.dt2} onChange={(e) => setFaf((f) => ({ ...f, dt2: e.target.value, period: '' }))} /></div>
              <div><span className={lbl}>Período</span><select className={inp} value={faf.period} onChange={(e) => { const p = periodDates(e.target.value); setFaf({ period: e.target.value, dt1: p.d1, dt2: p.d2 }); loadFaf(p.d1, p.d2); }}><option value="">—</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Esta semana</option><option value="semana_ant">Semana passada</option></select></div>
              <button onClick={() => loadFaf(faf.dt1, faf.dt2)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Buscar</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {([['Logins', fafData.g.logins, false], ['Entrada', fafData.g.val, true], ['Em aberto', fafData.g.ab, true], ['Saldo bruto', fafData.g.sb, true], ['Comissão', fafData.g.cm, true], ['Saldo líquido', fafData.g.sl, true]] as [string, number, boolean][]).map(([l, v, money]) => (
                <div key={l} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50"><div className="text-[11px] text-slate-400">{l}</div><div className="text-sm font-semibold tabular-nums">{money ? `R$ ${fmt(v)}` : String(v)}</div></div>
              ))}
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="text-left text-slate-400"><th className="px-2 py-2 font-medium">Supervisor</th><th className="px-2 py-2 text-center font-medium">Logins</th><th className="px-2 py-2 text-right font-medium">Entrada</th><th className="px-2 py-2 text-right font-medium">Em aberto</th><th className="px-2 py-2 text-right font-medium">S. bruto</th><th className="px-2 py-2 text-right font-medium">Comissão</th><th className="px-2 py-2 text-right font-medium">C. afil.</th><th className="px-2 py-2 text-right font-medium">S. líquido</th></tr></thead>
              <tbody>{fafData.rows.map((r) => (
                <tr key={r.sup} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5 font-medium">{r.sup}</td><td className="px-2 py-1.5 text-center tabular-nums">{r.logins}</td><td className={`px-2 py-1.5 text-right tabular-nums ${entCls(r.val)}`}>{fmt(r.val)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${entCls(r.ab)}`}>{fmt(r.ab)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${clrCls(r.sb)}`}>{fmt(r.sb)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.cm)}`}>{fmt(r.cm)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.caf)}`}>{fmt(r.caf)}</td><td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${clrCls(r.sl)}`}>{fmt(r.sl)}</td>
                </tr>
              ))}
              {fafData.rows.length === 0 && <tr><td colSpan={8} className="px-2 py-8 text-center text-slate-400">Nenhum supervisor com movimento.</td></tr>}
              </tbody>
            </table></div>
          </Modal>
        )}

        {/* NOVO CLIENTE */}
        {novoCli.open && (
          <Modal onClose={() => setNovoCli((s) => ({ ...s, open: false }))} max="max-w-md" title="Novo cliente">
            <div className="flex flex-col gap-3">
              <div><span className={lbl}>Nome</span><input className={inp} value={novoCli.nome} onChange={(e) => setNovoCli((s) => ({ ...s, nome: e.target.value.toUpperCase() }))} /></div>
              <div><span className={lbl}>Senha de acesso</span><input className={inp} value={novoCli.senha} onChange={(e) => setNovoCli((s) => ({ ...s, senha: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={lbl}>Calção</span><input type="number" className={inp} value={novoCli.cal} onChange={(e) => setNovoCli((s) => ({ ...s, cal: e.target.value }))} /></div>
                <div><span className={lbl}>Desconto</span><input type="number" step="0.01" className={inp} value={novoCli.desc} onChange={(e) => setNovoCli((s) => ({ ...s, desc: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={lbl}>Comissão %</span><input type="number" step="0.01" className={inp} value={novoCli.com} onChange={(e) => setNovoCli((s) => ({ ...s, com: e.target.value }))} /></div>
                <div><span className={lbl}>Comissão afiliado %</span><input type="number" step="0.01" className={inp} value={novoCli.af} onChange={(e) => setNovoCli((s) => ({ ...s, af: e.target.value }))} /></div>
              </div>
              <div><span className={lbl}>Supervisor</span><select className={inp} value={novoCli.sup} onChange={(e) => setNovoCli((s) => ({ ...s, sup: e.target.value }))}><option value="">—</option>{afiliados.map((a) => <option key={a.id} value={a.nome}>{a.nome}</option>)}</select></div>
              <div><span className={lbl}>Link do grupo (WhatsApp)</span><input className={inp} placeholder="https://chat.whatsapp.com/..." value={novoCli.grupoLink} onChange={(e) => setNovoCli((s) => ({ ...s, grupoLink: e.target.value }))} /><div className="mt-1 text-[11px] text-slate-400">Cole o link do grupo deste cliente. O bot resolve e vincula os bilhetes a ele.</div></div>
              <div className="text-[11px] text-slate-400">O link de acesso é gerado automaticamente.</div>
              <div className="mt-1 flex justify-end gap-2"><button onClick={() => setNovoCli((s) => ({ ...s, open: false }))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">Cancelar</button><button onClick={salvarNovoCliente} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Cadastrar</button></div>
            </div>
          </Modal>
        )}

        {/* NOVO AFILIADO */}
        {novoAf.open && (
          <Modal onClose={() => setNovoAf((s) => ({ ...s, open: false }))} max="max-w-sm" title="Novo afiliado">
            <div className="flex flex-col gap-3">
              <div><span className={lbl}>Nome</span><input className={inp} value={novoAf.nome} onChange={(e) => setNovoAf((s) => ({ ...s, nome: e.target.value }))} /></div>
              <div><span className={lbl}>Comissão %</span><input type="number" step="0.01" className={inp} value={novoAf.com} onChange={(e) => setNovoAf((s) => ({ ...s, com: e.target.value }))} /></div>
              <div className="mt-1 flex justify-end gap-2"><button onClick={() => setNovoAf((s) => ({ ...s, open: false }))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">Cancelar</button><button onClick={salvarNovoAfiliado} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Cadastrar</button></div>
            </div>
          </Modal>
        )}

        {/* ADVERTÊNCIA */}
        {obsModal && (
          <Modal onClose={() => setObsModal(null)} max="max-w-md" title={`Advertência — aposta #${obsModal.id}`}>
            <div className="flex flex-col gap-3">
              <div><span className={lbl}>Observação / motivo</span><textarea rows={4} className={inp} value={obsModal.text} onChange={(e) => setObsModal((m) => (m ? { ...m, text: e.target.value } : m))} /></div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setObsModal(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">Cancelar</button>
                <button onClick={resolverObs} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Resolvido</button>
                <button onClick={salvarObs} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">Salvar</button>
              </div>
            </div>
          </Modal>
        )}

        {/* RECEBER BILHETE (WhatsApp) */}
        {modal === 'wpp' && (
          <Modal onClose={() => setModal(null)} max="max-w-md" title="📥 Receber bilhete (WhatsApp)">
            <div className="flex flex-col gap-3">
              <div className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50">Simula a chegada de um bilhete. Na operação real, o backend recebe a reação na imagem do grupo, transcreve e o coloca aqui como <b>EM ABERTO</b>; odd/valor em branco ficam para preencher.</div>
              <div><span className={lbl}>Cliente / grupo</span><select className={inp} value={wpp.cId} onChange={(e) => setWpp((w) => ({ ...w, cId: e.target.value }))}><option value="">— Selecione —</option>{cliSorted.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              <div><span className={lbl}>Bilhete transcrito</span><textarea rows={4} className={inp} value={wpp.jogo} onChange={(e) => setWpp((w) => ({ ...w, jogo: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={lbl}>Odd (opcional)</span><input type="number" step="0.01" className={inp} placeholder="vazio = em aberto" value={wpp.odd} onChange={(e) => setWpp((w) => ({ ...w, odd: e.target.value }))} /></div>
                <div><span className={lbl}>Valor (opcional)</span><input type="number" className={inp} placeholder="vazio = em aberto" value={wpp.val} onChange={(e) => setWpp((w) => ({ ...w, val: e.target.value }))} /></div>
              </div>
              <div><span className={lbl}>Descarrego</span><select className={inp} value={wpp.dc} onChange={(e) => setWpp((w) => ({ ...w, dc: e.target.value }))}>{DCS.map((d) => <option key={d} value={d}>{d || '—'}</option>)}</select></div>
              <div className="mt-1 flex justify-end gap-2">
                <button onClick={() => setModal(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">Cancelar</button>
                <button onClick={receberBilhete} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Receber no sistema</button>
              </div>
            </div>
          </Modal>
        )}

        {toastMsg && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-slate-700">{toastMsg}</div>}
      </div>
    </div>
  );
}

function tot(n: number) { return `R$ ${fmt(n)}`; }
