'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ComboBox from './ComboBox';
import type { Afiliado, Cliente, Reg, Totals, ApostasPage, FechCliResp, FechAfResp, FiltroApostas } from './types';
import {
  criarAposta, atualizarAposta, excluirAposta,
  criarCliente, atualizarCliente,
  criarAfiliado, atualizarAfiliado,
  listarApostas, fechamentoClientes, fechamentoAfiliados,
} from './actions';

interface Draft { dt?: string; odd?: string; val?: string; _saved?: boolean }

const STS =['EM ABERTO', 'GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO'];
const DCS = ['', 'BETANO', 'BET365', 'SPORTINGBET', 'SUPERBET', 'PIXBET'];
const SC: Record<string, { bg: string; t: string }> = {
  'EM ABERTO': { bg: '#2563eb', t: '#fff' },
  GREEN: { bg: '#16a34a', t: '#fff' },
  'MEIO GREEN': { bg: '#86efac', t: '#14532d' },
  'MEIO RED': { bg: '#fca5a5', t: '#7f1d1d' },
  RED: { bg: '#dc2626', t: '#fff' },
  REEMBOLSO: { bg: '#7c3aed', t: '#fff' },
};
const PAGE_SIZE = 20;

// ═══════════ HELPERS ═══════════
const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clr = (n: number) => { void n; return 'var(--num)'; };
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

export default function PainelAdmin({ email, clientesIni, afiliadosIni, apostasIni, semana }: {
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
  const [total, setTotal] = useState<number>(apostasIni.total);
  const [totals, setTotals] = useState<Totals>(apostasIni.totals);
  const [reloadKey, setReloadKey] = useState(0);
  const [clientes, setClientes] = useState<Cliente[]>(clientesIni);
  const [afiliados, setAfiliados] = useState<Afiliado[]>(afiliadosIni);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [filtros, setFiltros] = useState({ ...filtrosVazios, dt1: semana.d1, dt2: semana.d2, period: 'semana' });
  const [page, setPage] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [mobMenu, setMobMenu] = useState(false);
  const [modal, setModal] = useState<null | 'cli' | 'af' | 'fech' | 'faf' | 'wpp'>(null);
  const [fech, setFech] = useState({ dt1: semana.d1, dt2: semana.d2, period: 'semana' });
  const [faf, setFaf] = useState({ dt1: semana.d1, dt2: semana.d2, period: 'semana' });
  const [fechRes, setFechRes] = useState<FechCliResp | null>(null);
  const [fafRes, setFafRes] = useState<FechAfResp | null>(null);
  const [wpp, setWpp] = useState({ cId: '', jogo: '', odd: '', val: '', dc: '' });
  const [novo, setNovo] = useState<{ open: boolean; cId: string; jogo: string; odd: string; val: string; st: string; dc: string }>(
    { open: false, cId: '', jogo: '', odd: '', val: '', st: 'EM ABERTO', dc: '' },
  );
  const [obsModal, setObsModal] = useState<{ id: number; text: string } | null>(null);
  const [novoCli, setNovoCli] = useState({ open: false, nome: '', senha: '', cal: '', desc: '0.01', com: '6', af: '0', sup: '' });
  const [novoAf, setNovoAf] = useState({ open: false, nome: '', com: '0' });

  async function salvarObs() {
    if (!obsModal) return;
    const txt = obsModal.text.trim();
    await patchReg(obsModal.id, { obs: txt, adv: txt.length > 0 });
    setObsModal(null);
    toast(txt ? 'Advertência salva.' : 'Advertência removida.');
  }
  async function resolverObs() {
    if (!obsModal) return;
    await patchReg(obsModal.id, { adv: false });
    setObsModal(null);
    toast('Advertência marcada como resolvida.');
  }

  const cMap = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])) as Record<number, Cliente>, [clientes]);
  const cliOpts = useMemo(() => [{ value: '', label: '— Selecione um cliente —' }, ...clientes.map((c) => ({ value: String(c.id), label: c.nome }))], [clientes]);
  const cliOptsId = useMemo(() => clientes.map((c) => ({ value: String(c.id), label: c.nome })), [clientes]);
  const stOpts = useMemo(() => [{ value: '', label: '— Selecione um status —' }, ...STS.map((s) => ({ value: s, label: s }))], []);

  function toast(msg: string) {
    setToastMsg(msg);
    window.clearTimeout((toast as unknown as { _h?: number })._h);
    (toast as unknown as { _h?: number })._h = window.setTimeout(() => setToastMsg(''), 2800);
  }

  function setF<K extends keyof typeof filtros>(k: K, v: (typeof filtros)[K]) {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPage(1);
  }

  function applyPeriod(v: string) {
    const today = new Date();
    let d1 = '', d2 = '';
    if (v === 'hoje') { d1 = d2 = fmtDate(today); }
    else if (v === 'ontem') { const d = new Date(today); d.setDate(d.getDate() - 1); d1 = d2 = fmtDate(d); }
    else if (v === 'semana') { const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); d1 = fmtDate(mon); d2 = fmtDate(sun); }
    else if (v === 'semana_ant') { const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() - 6); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); d1 = fmtDate(mon); d2 = fmtDate(sun); }
    setFiltros((f) => ({ ...f, period: v, dt1: d1, dt2: d2 }));
    setPage(1);
  }

  function limparFiltros() { setFiltros({ ...filtrosVazios }); setPage(1); }

  // ── busca paginada no servidor (semana atual por padrão)
  useEffect(() => {
    let alive = true;
    const f = filtros;
    const params: FiltroApostas = {
      id: f.id || undefined,
      cId: f.nome ? Number(f.nome) : null,
      st: f.st || undefined,
      jogo: f.jogo || undefined,
      dc: f.dc || undefined,
      oddMin: f.oddMin ? Number(f.oddMin) : null,
      oddMax: f.oddMax ? Number(f.oddMax) : null,
      valMin: f.valMin ? Number(f.valMin) : null,
      valMax: f.valMax ? Number(f.valMax) : null,
      bl: f.bl === '' ? null : f.bl === 'sim',
      adv: f.adv === '' ? null : f.adv === 'sim',
      irr: f.irr === '' ? null : f.irr === 'sim',
      dt1: f.dt1 || null, dt2: f.dt2 || null, ord: f.ord, page,
    };
    listarApostas(params)
      .then((r) => { if (alive) { setRegs(r.rows); setTotal(r.total); setTotals(r.totals); } })
      .catch(() => { if (alive) toast('Erro ao carregar apostas.'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, page, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  // ── métricas (calculadas no servidor sobre TODO o conjunto filtrado)
  const tot = useMemo(() => ({
    v: totals.entradas, ab: totals.em_aberto_total, sb: totals.saldo_bruto,
    cm: totals.comissao, caf: totals.comissao_afiliado, sl: totals.saldo_liquido,
    n: total, nab: totals.em_aberto_qtd,
  }), [totals, total]);

  // ── paginação (server-side)
  const pageRows = regs;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const start = (pageSafe - 1) * PAGE_SIZE;
  const shownTo = start + regs.length;
  const filaLbl = filtros.st ? `com status "${filtros.st}"` : 'no período';

  // ── fechamento (agregação no servidor)
  function loadFech(dt1: string, dt2: string) { fechamentoClientes(dt1 || null, dt2 || null).then(setFechRes).catch(() => toast('Erro no fechamento.')); }
  function loadFaf(dt1: string, dt2: string) { fechamentoAfiliados(dt1 || null, dt2 || null).then(setFafRes).catch(() => toast('Erro no fechamento.')); }
  useEffect(() => {
    if (modal === 'fech') loadFech(fech.dt1, fech.dt2);
    if (modal === 'faf') loadFaf(faf.dt1, faf.dt2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  const fechData = fechRes ?? { rows: [], g: { cal: 0, saldoCal: 0, val: 0, ab: 0, sb: 0, cm: 0, caf: 0, sl: 0 } };
  const fafData = fafRes ?? { rows: [], g: { logins: 0, val: 0, ab: 0, sb: 0, cm: 0, caf: 0, sl: 0 } };

  // ── clientes
  function updCli(id: number, patch: Partial<Cliente>) { setClientes((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))); }
  async function saveCli(id: number) {
    const c = clientes.find((x) => x.id === id); if (!c) return;
    try {
      const res = await atualizarCliente(id, { nome: c.nome, s: c.s, on: c.on, cal: c.cal, desc: c.desc, com: c.com, sup: c.sup, af: c.af, link: c.link });
      setClientes((cs) => cs.map((x) => (x.id === id ? res.cliente : x)));
      const byId = Object.fromEntries(res.regs.map((r) => [r.id, r]));
      setRegs((rs) => rs.map((r) => byId[r.id] ?? r));
      reload();
      toast('Cliente salvo!');
    } catch { toast('Erro ao salvar cliente.'); }
  }
  function copiarLink(link: string | null) {
    if (!link) { toast('Cliente sem link cadastrado.'); return; }
    const url = window.location.origin + link;
    navigator.clipboard?.writeText(url).then(() => toast('Link copiado!'), () => toast(url));
  }
  function novoCliente() { setNovoCli({ open: true, nome: '', senha: '', cal: '', desc: '0.01', com: '6', af: '0', sup: '' }); }
  async function salvarNovoCliente() {
    if (!novoCli.nome.trim()) { alert('Informe o nome do cliente.'); return; }
    try {
      const c = await criarCliente({
        nome: novoCli.nome, senha: novoCli.senha,
        calcao: Number(novoCli.cal) || 0, desconto: Number(novoCli.desc) || 0,
        comissao: Number(novoCli.com) || 0, comissaoSup: Number(novoCli.af) || 0,
        sup: novoCli.sup || null,
      });
      setClientes((cs) => [...cs, c].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoCli((s) => ({ ...s, open: false }));
      toast('Cliente criado!');
    } catch { toast('Erro ao criar cliente.'); }
  }

  // ── afiliados
  function updAf(id: number, patch: Partial<Afiliado>) { setAfiliados((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a))); }
  async function saveAf(id: number) {
    const a = afiliados.find((x) => x.id === id); if (!a) return;
    try { const res = await atualizarAfiliado(id, { nome: a.nome, com: a.com }); setAfiliados((as) => as.map((x) => (x.id === id ? res : x))); toast('Afiliado salvo!'); }
    catch { toast('Erro ao salvar afiliado.'); }
  }
  function novoAfiliado() { setNovoAf({ open: true, nome: '', com: '0' }); }
  async function salvarNovoAfiliado() {
    if (!novoAf.nome.trim()) { alert('Informe o nome do afiliado.'); return; }
    try {
      const a = await criarAfiliado(novoAf.nome, Number(novoAf.com) || 0);
      setAfiliados((as) => [...as, a].sort((x, y) => x.nome.localeCompare(y.nome)));
      setNovoAf((s) => ({ ...s, open: false }));
      toast('Afiliado criado!');
    } catch { toast('Erro ao criar afiliado.'); }
  }

  // ── receber bilhete (WhatsApp)
  async function receberBilhete() {
    if (!wpp.cId || !wpp.jogo.trim()) { alert('Selecione o cliente e cole o bilhete transcrito.'); return; }
    const cId = Number(wpp.cId); const odd = Number(wpp.odd) || 0; const val = Number(wpp.val) || 0;
    try {
      const reg = await criarAposta({ cId, jogo: wpp.jogo, odd, val, st: 'EM ABERTO', dc: wpp.dc });
      const incompleto = !(odd > 0) || !(val > 0);
      toast(`Bilhete recebido (#${reg.id}). ${incompleto ? 'Preencha odd/valor — linha em vermelho.' : 'Pronto na fila.'}`);
      setWpp({ cId: '', jogo: '', odd: '', val: '', dc: '' }); setModal(null); reload();
    } catch { toast('Erro ao receber bilhete.'); }
  }

  // ── edição
  const dV = (r: Reg, f: 'dt' | 'odd' | 'val') => { const d = drafts[r.id]; return d && d[f] !== undefined ? d[f]! : String(r[f]); };
  const dW = (r: Reg, f: 'dt' | 'odd' | 'val') => (drafts[r.id]?.[f] !== undefined ? ' inp-w' : '');
  function updDraft(id: number, f: 'dt' | 'odd' | 'val', v: string) { setDrafts((d) => ({ ...d, [id]: { ...d[id], [f]: v } })); }

  async function patchReg(id: number, patch: { dt?: string; odd?: number; val?: number; st?: string; dc?: string; bl?: boolean; adv?: boolean; irr?: boolean; obs?: string; cId?: number }) {
    try {
      const reg = await atualizarAposta(id, patch);
      setRegs((rs) => rs.map((r) => (r.id === id ? reg : r)));
      reload();
      return reg;
    } catch { toast('Erro ao salvar aposta.'); return null; }
  }

  async function updRegSt(id: number, v: string) {
    const prev = regs.find((r) => r.id === id);
    const wasOpen = prev && prev.st === 'EM ABERTO';
    const nome = (cMap[prev?.cId ?? -1] || {}).nome || '';
    await patchReg(id, { st: v });
    if (wasOpen && v !== 'EM ABERTO') toast(`Aposta #${id} (${nome}) → ${v}. Atualizada no painel do jogador.`);
  }

  async function saveReg(id: number) {
    const d = drafts[id] || {};
    await patchReg(id, {
      ...(d.dt !== undefined ? { dt: d.dt } : {}),
      ...(d.odd !== undefined ? { odd: Number(d.odd) } : {}),
      ...(d.val !== undefined ? { val: Number(d.val) } : {}),
    });
    setDrafts((dr) => ({ ...dr, [id]: { _saved: true } }));
    setTimeout(() => setDrafts((dr) => { const c = { ...dr }; delete c[id]; return c; }), 1800);
  }

  async function delReg(id: number) {
    if (!confirm('Excluir este registro?')) return;
    try { await excluirAposta(id); setRegs((rs) => rs.filter((r) => r.id !== id)); reload(); }
    catch { toast('Erro ao excluir.'); }
  }

  async function salvarNovo() {
    if (!novo.cId || !novo.jogo || !novo.odd || !novo.val) { alert('Preencha todos os campos obrigatórios.'); return; }
    try {
      await criarAposta({ cId: Number(novo.cId), jogo: novo.jogo, odd: Number(novo.odd), val: Number(novo.val), st: novo.st, dc: novo.dc });
      setNovo({ open: false, cId: '', jogo: '', odd: '', val: '', st: 'EM ABERTO', dc: '' });
      reload();
      toast('Registro adicionado.');
    } catch { toast('Erro ao adicionar registro.'); }
  }

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const stStyle = (s: string) => { const c = SC[s] || { bg: 'var(--line)', t: 'var(--inp-text)' }; return { background: c.bg, color: c.t }; };
  const stOptEls = () => STS.map((s) => { const c = SC[s] || { bg: '#fff', t: '#111' }; return <option key={s} value={s} style={{ background: c.bg, color: c.t }}>{s}</option>; });
  const pdfBreve = () => toast('Geração de PDF entra na próxima etapa.');

  return (
    <div className={`pb-panel${dark ? ' dark' : ''}`}>
      <style>{CSS}</style>

      {/* TOPBAR */}
      <div className="tb">
        <div className="tb-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <span style={{ color: '#DAA520', fontWeight: 700 }}>PrimeBet</span> <small>Painel de Controle</small>
        </div>
        <div className="tb-nav">
          <button className="tb-btn" onClick={() => setModal('cli')}>👥 Clientes</button>
          <button className="tb-btn" onClick={() => setModal('af')}>🤝 Afiliados</button>
          <button className="tb-btn" onClick={() => setModal('fech')}>📊 Fechamento</button>
          <button className="tb-btn" onClick={() => setModal('faf')}>📋 Fechamento Afiliado</button>
          <button className="tb-btn" onClick={toggleTheme} title="Alternar tema">{dark ? '☀️' : '🌙'}</button>
          <button className="tb-sair" onClick={sair}>↪ Sair</button>
        </div>
        <button className="tb-menu-btn mob-only" onClick={() => setMobMenu(true)}>☰</button>
      </div>

      {/* MENU MOBILE */}
      {mobMenu && (
        <div className="mob-bg" onClick={() => setMobMenu(false)}>
          <div className="mob-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ color: '#7a8c5a', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', marginBottom: 4 }}>MENU</div>
            <button className="mob-item" onClick={() => { setModal('cli'); setMobMenu(false); }}>👥 Clientes</button>
            <button className="mob-item" onClick={() => { setModal('af'); setMobMenu(false); }}>🤝 Afiliados</button>
            <button className="mob-item" onClick={() => { setModal('fech'); setMobMenu(false); }}>📊 Fechamento</button>
            <button className="mob-item" onClick={() => { setModal('faf'); setMobMenu(false); }}>📋 Fech. Afiliado</button>
            <button className="mob-item" onClick={() => { setNovo((n) => ({ ...n, open: true })); setMobMenu(false); }}>➕ Novo Registro</button>
            <button className="mob-item" onClick={() => { setModal('wpp'); setMobMenu(false); }}>📥 Receber bilhete</button>
            <button className="mob-item" onClick={toggleTheme}>{dark ? '☀️ Tema claro' : '🌙 Tema escuro'}</button>
            <button className="mob-sair" onClick={sair}>🚪 Sair</button>
          </div>
        </div>
      )}

      <div className="painel-body">
        <div className="page-title">Primebet – Controle (Semana Atual)</div>
        <div className="page-sub">Registros — {email}</div>

        {/* FILTROS */}
        <div className="filter-box">
          <div className="filter-label">Filtros</div>
          <div className="filter-grid">
            <div><div className="f-lbl">ID</div><input className="f-inp" value={filtros.id} onChange={(e) => setF('id', e.target.value)} placeholder="ex: 10" /></div>
            <div><div className="f-lbl">Data início</div><input type="date" className="f-inp" value={filtros.dt1} onChange={(e) => setF('dt1', e.target.value)} /></div>
            <div><div className="f-lbl">Data fim</div><input type="date" className="f-inp" value={filtros.dt2} onChange={(e) => setF('dt2', e.target.value)} /></div>
            <div><div className="f-lbl">Período Rápido</div>
              <select className="f-inp" value={filtros.period} onChange={(e) => applyPeriod(e.target.value)}>
                <option value="">—</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Esta Semana</option><option value="semana_ant">Semana Passada</option>
              </select>
            </div>
          </div>
          <div className="filter-grid2">
            <div><div className="f-lbl">Nome</div>
              <ComboBox options={cliOpts} value={filtros.nome} onChange={(v) => setF('nome', v)} placeholder="— Selecione um cliente —" />
            </div>
            <div><div className="f-lbl">Jogo contém</div><input className="f-inp" value={filtros.jogo} onChange={(e) => setF('jogo', e.target.value)} placeholder="Jogo contém" /></div>
            <div><div className="f-lbl">Descarrego contém</div><input className="f-inp" value={filtros.dc} onChange={(e) => setF('dc', e.target.value)} placeholder="Descarrego contém" /></div>
            <div><div className="f-lbl">Odd mín</div><input type="number" step="0.01" className="f-inp" value={filtros.oddMin} onChange={(e) => setF('oddMin', e.target.value)} placeholder="odd mín" /></div>
            <div><div className="f-lbl">Odd máx</div><input type="number" step="0.01" className="f-inp" value={filtros.oddMax} onChange={(e) => setF('oddMax', e.target.value)} placeholder="odd máx" /></div>
            <div><div className="f-lbl">Entradas mín</div><input type="number" className="f-inp" value={filtros.valMin} onChange={(e) => setF('valMin', e.target.value)} placeholder="entradas mín" /></div>
            <div><div className="f-lbl">Entradas máx</div><input type="number" className="f-inp" value={filtros.valMax} onChange={(e) => setF('valMax', e.target.value)} placeholder="entradas máx" /></div>
          </div>
          <div className="filter-grid3">
            <div><div className="f-lbl">Status</div>
              <ComboBox options={stOpts} value={filtros.st} onChange={(v) => setF('st', v)} placeholder="— Selecione um status —" />
            </div>
            <div><div className="f-lbl">Baixa Liquidez</div>
              <select className="f-inp" value={filtros.bl} onChange={(e) => setF('bl', e.target.value)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select>
            </div>
            <div><div className="f-lbl">Advertido</div>
              <select className="f-inp" value={filtros.adv} onChange={(e) => setF('adv', e.target.value)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select>
            </div>
            <div><div className="f-lbl">Irregular</div>
              <select className="f-inp" value={filtros.irr} onChange={(e) => setF('irr', e.target.value)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select>
            </div>
            <div><div className="f-lbl">Ordenação</div>
              <select className="f-inp" value={filtros.ord} onChange={(e) => setF('ord', e.target.value)}>
                <option value="data_desc">data ↓</option><option value="data_asc">data ↑</option><option value="val_desc">entradas ↓</option><option value="val_asc">entradas ↑</option>
              </select>
            </div>
          </div>
          <div className="filter-hint">Dica: sem datas preenchidas, traz todos os registros. Use o Período Rápido para filtrar por semana (seg → dom).</div>
          <div className="filter-actions">
            <button className="btn btn-gray" onClick={limparFiltros}>Limpar</button>
            <button className="btn" onClick={() => setModal('wpp')} style={{ background: '#25D366', color: '#fff' }}>📥 Receber bilhete</button>
            <button className="btn btn-green" onClick={() => setNovo((n) => ({ ...n, open: true }))}>+ Novo registro</button>
          </div>
        </div>

        {/* MÉTRICAS */}
        <div className="metrics-row">
          <Metric ico="💰" icoBg="#16a34a22" lbl="ENTRADA" val={`R$ ${fmt(tot.v)}`} valColor="var(--num)" sub={`${tot.n} linhas`} />
          <Metric ico="⏳" icoBg="#B8860B22" lbl="EM ABERTO" val={`R$ ${fmt(tot.ab)}`} valColor="var(--num)" sub={`${tot.nab} linhas`} />
          <Metric ico="📊" icoBg="#8b5cf622" lbl="SALDO BRUTO" val={`R$ ${fmt(tot.sb)}`} valColor={clr(tot.sb)} />
          <Metric ico="%" icoBg="#dc262622" lbl="COMISSÃO" val={`R$ ${fmt(tot.cm)}`} valColor="var(--num)" />
          <Metric ico="✅" icoBg="#16a34a22" lbl="SALDO LÍQUIDO" val={`R$ ${fmt(tot.sl)}`} valColor={clr(tot.sl)} />
        </div>
        <div className="metrics-row2">
          <Metric ico="✕" icoBg="#dc262622" lbl="COMISSÃO AFILIADOS" val={`R$ ${fmt(tot.caf)}`} valColor="var(--num)" />
          <Metric ico="+" icoBg="#16a34a22" lbl="TOTAL FECHAMENTO" val={`R$ ${fmt(tot.sl - tot.caf)}`} valColor={clr(tot.sl - tot.caf)} />
        </div>

        <div id="reg-info" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          {`${total} aposta(s) ${filaLbl} | Página ${pageSafe}/${totalPages} — exibindo ${total ? start + 1 : 0}–${shownTo} de ${total}`}
        </div>

        {/* TABELA DESKTOP */}
        <div className="tbl-wrap desk-only">
          <div className="tbl-scroll">
            <table>
              <thead><tr>
                <th>id</th><th>data</th><th>Nome</th><th>Jogo</th><th>odd</th><th>entradas</th><th>status</th><th>Descarrego</th>
                <th className="th-r">Saldo Bruto</th><th className="th-r">Comissão</th><th className="th-c">Baixa Liquidez</th><th className="th-r">Saldo Líquido</th>
                <th className="th-sticky th-c">Ações</th>
              </tr></thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const d = drafts[r.id] || {};
                  const editing = Object.keys(d).filter((k) => k !== '_saved').length > 0;
                  const incompleto = !(Number(r.odd) > 0) || !(Number(r.val) > 0);
                  const bg = d._saved ? 'var(--saved-bg)' : editing ? 'var(--edit-bg)' : i % 2 === 0 ? 'var(--card)' : 'var(--row-alt)';
                  const rowBg = incompleto ? 'var(--alert-bg)' : bg;
                  const btnBg = d._saved ? '#2d6a0a' : editing ? '#d97706' : '#B8860B';
                  return (
                    <tr key={r.id} className={incompleto ? 'row-alert' : ''} style={{ background: rowBg, transition: 'background .3s' }}>
                      <td style={{ fontWeight: 700, color: 'var(--inp-text)' }}>{r.id}</td>
                      <td><input className={`inp${dW(r, 'dt')}`} value={dV(r, 'dt')} onChange={(e) => updDraft(r.id, 'dt', e.target.value)} style={{ width: 130, fontSize: 11 }} /></td>
                      <td style={{ minWidth: 150 }}><ComboBox options={cliOptsId} value={String(r.cId)} onChange={(v) => { if (v) patchReg(r.id, { cId: Number(v) }); }} minWidth={140} />{incompleto && <span className="alert-tag">PREENCHER</span>}</td>
                      <td style={{ maxWidth: 200 }}>{r.jogo.split('\n').map((l, ii) => <div key={ii} style={{ fontSize: ii === 0 ? 11 : 10, color: ii === 0 ? '#111' : 'var(--muted)' }}>{l}</div>)}</td>
                      <td><input type="number" step="0.01" className={`inp${dW(r, 'odd')}`} value={dV(r, 'odd')} onChange={(e) => updDraft(r.id, 'odd', e.target.value)} placeholder="—" style={{ width: 58, fontSize: 11, ...(incompleto && !(Number(r.odd) > 0) ? { borderColor: '#dc2626' } : {}) }} /></td>
                      <td><input type="number" step="0.01" className={`inp${dW(r, 'val')}`} value={dV(r, 'val')} onChange={(e) => updDraft(r.id, 'val', e.target.value)} placeholder="—" style={{ width: 76, fontSize: 11, color: 'var(--num)', fontWeight: 700, ...(incompleto && !(Number(r.val) > 0) ? { borderColor: '#dc2626' } : {}) }} /></td>
                      <td><select className="st-sel" style={stStyle(r.st)} value={r.st} onChange={(e) => updRegSt(r.id, e.target.value)}>{stOptEls()}</select></td>
                      <td><select className="inp" value={r.dc} onChange={(e) => patchReg(r.id, { dc: e.target.value })} style={{ fontSize: 11, minWidth: 100 }}>{DCS.map((dd) => <option key={dd} value={dd}>{dd || '—'}</option>)}</select></td>
                      <td className="td-r" style={{ fontWeight: 600, color: clr(r.sb) }}>{fmt(r.sb)}</td>
                      <td className="td-r" style={{ fontWeight: 600, color: clr(r.cm) }}>{fmt(r.cm)}</td>
                      <td className="td-c"><select className="inp" value={r.bl ? 'Sim' : 'Não'} onChange={(e) => patchReg(r.id, { bl: e.target.value === 'Sim' })} style={{ fontSize: 11 }}><option>Não</option><option>Sim</option></select></td>
                      <td className="td-r" style={{ fontWeight: 700, color: clr(r.sl) }}>{fmt(r.sl)}</td>
                      <td className="td-sticky td-c" style={{ background: rowBg }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button className="btn btn-sm" onClick={() => setObsModal({ id: r.id, text: r.obs })} title={r.adv ? `Advertência: ${r.obs}` : 'Adicionar advertência'} style={{ background: r.adv ? '#dc2626' : 'var(--line)', color: r.adv ? '#fff' : 'var(--muted2)', minWidth: 32, padding: '5px 6px' }}>⚠</button>
                          <button className="btn btn-sm" onClick={() => saveReg(r.id)} style={{ background: btnBg, color: '#fff', minWidth: 58 }}>{d._saved ? '✓ Salvo' : 'Salvar'}</button>
                          <button className="btn btn-sm btn-red-o" onClick={() => delReg(r.id)} style={{ minWidth: 58 }}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="tbl-footer">
            <span className="pg-info">{total} no período</span>
            <div className="pagination">
              <button className="btn btn-gray btn-sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
              <button className="btn btn-gray btn-sm" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
            </div>
          </div>
        </div>

        {/* CARDS MOBILE */}
        <div className="mob-only">
          {pageRows.map((r) => {
            const c = cMap[r.cId] || ({} as Cliente);
            const d = drafts[r.id] || {};
            const editing = Object.keys(d).filter((k) => k !== '_saved').length > 0;
            const incompleto = !(Number(r.odd) > 0) || !(Number(r.val) > 0);
            const bg = d._saved ? 'var(--saved-bg)' : editing ? 'var(--edit-bg)' : 'var(--card)';
            const btnBg = d._saved ? '#2d6a0a' : editing ? '#d97706' : '#B8860B';
            const sc = SC[r.st] || { bg: 'var(--line)', t: 'var(--inp-text)' };
            return (
              <div key={r.id} className={`rc ${incompleto ? 'row-alert' : ''}`} style={{ background: incompleto ? 'var(--alert-bg)' : bg }}>
                <div className="rc-h">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: 'var(--inp-text)', fontSize: 12 }}>#{r.id}</span>
                    <span style={{ fontWeight: 700, color: 'var(--num)', fontSize: 14 }}>{c.nome || r.cId}</span>
                    {incompleto && <span className="alert-tag">PREENCHER</span>}
                  </div>
                  <span className="badge" style={{ background: sc.bg, color: sc.t }}>{r.st}</span>
                </div>
                <div className="rc-r"><span className="rc-l">Data/Hora</span><input className={`inp${dW(r, 'dt')}`} value={dV(r, 'dt')} onChange={(e) => updDraft(r.id, 'dt', e.target.value)} style={{ width: 154, textAlign: 'right', fontSize: 12 }} /></div>
                <div className="rc-r"><span className="rc-l">Jogo</span><span style={{ fontSize: 11, textAlign: 'right', flex: 1, marginLeft: 8 }}>{r.jogo.split('\n').map((l, ii) => <div key={ii} style={{ color: ii === 0 ? '#111' : 'var(--muted)' }}>{l}</div>)}</span></div>
                <div className="rc-r"><span className="rc-l">Odd</span><input type="number" step="0.01" className={`inp${dW(r, 'odd')}`} value={dV(r, 'odd')} onChange={(e) => updDraft(r.id, 'odd', e.target.value)} style={{ width: 90, textAlign: 'right', fontWeight: 700 }} /></div>
                <div className="rc-r"><span className="rc-l">Entradas</span><input type="number" step="0.01" className={`inp${dW(r, 'val')}`} value={dV(r, 'val')} onChange={(e) => updDraft(r.id, 'val', e.target.value)} style={{ width: 110, textAlign: 'right', fontWeight: 700, color: 'var(--num)' }} /></div>
                <div className="rc-r"><span className="rc-l">Status</span><div style={{ flex: 1, marginLeft: 8 }}><select className="st-sel inp-full" style={stStyle(r.st)} value={r.st} onChange={(e) => updRegSt(r.id, e.target.value)}>{stOptEls()}</select></div></div>
                <div className="rc-r"><span className="rc-l">Descarrego</span><div style={{ flex: 1, marginLeft: 8 }}><select className="inp inp-full" value={r.dc} onChange={(e) => patchReg(r.id, { dc: e.target.value })}>{DCS.map((dd) => <option key={dd} value={dd}>{dd || '—'}</option>)}</select></div></div>
                <div className="rc-r"><span className="rc-l">S.Bruto</span><span style={{ fontWeight: 600, color: clr(r.sb) }}>R$ {fmt(r.sb)}</span></div>
                <div className="rc-r"><span className="rc-l">Comissão</span><span style={{ fontWeight: 600, color: clr(r.cm) }}>R$ {fmt(r.cm)}</span></div>
                <div className="rc-r"><span className="rc-l">S.Líquido</span><span style={{ fontWeight: 700, color: clr(r.sl) }}>R$ {fmt(r.sl)}</span></div>
                <div className="rc-btns">
                  <button className="btn" onClick={() => setObsModal({ id: r.id, text: r.obs })} style={{ background: r.adv ? '#dc2626' : 'var(--line)', color: r.adv ? '#fff' : 'var(--muted)' }}>⚠</button>
                  <button className="btn" onClick={() => saveReg(r.id)} style={{ background: btnBg, color: '#fff', flex: 1 }}>{d._saved ? '✓ Salvo' : 'Salvar'}</button>
                  <button className="btn btn-red-o" onClick={() => delReg(r.id)}>Excluir</button>
                </div>
              </div>
            );
          })}
          <div className="pagination" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-gray btn-sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
            <span className="pg-info">{pageSafe}/{totalPages}</span>
            <button className="btn btn-gray btn-sm" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
          </div>
        </div>
      </div>

      {/* MODAL NOVO REGISTRO */}
      {novo.open && (
        <div className="modal-bg" onClick={() => setNovo((n) => ({ ...n, open: false }))}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-hdr-left"><span style={{ fontWeight: 700 }}>➕ Novo registro</span></div>
              <button className="modal-close" onClick={() => setNovo((n) => ({ ...n, open: false }))}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><div className="f-lbl">Cliente</div>
                <ComboBox options={cliOpts} value={novo.cId} onChange={(v) => setNovo((n) => ({ ...n, cId: v }))} placeholder="— Selecione —" />
              </div>
              <div><div className="f-lbl">Jogo</div><textarea className="f-inp" rows={3} value={novo.jogo} onChange={(e) => setNovo((n) => ({ ...n, jogo: e.target.value }))} placeholder={'1) Time A x Time B\n• Mercado / seleção'} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div className="f-lbl">Odd</div><input type="number" step="0.01" className="f-inp" value={novo.odd} onChange={(e) => setNovo((n) => ({ ...n, odd: e.target.value }))} /></div>
                <div><div className="f-lbl">Entradas (R$)</div><input type="number" className="f-inp" value={novo.val} onChange={(e) => setNovo((n) => ({ ...n, val: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div className="f-lbl">Status</div><select className="f-inp" value={novo.st} onChange={(e) => setNovo((n) => ({ ...n, st: e.target.value }))}>{stOptEls()}</select></div>
                <div><div className="f-lbl">Descarrego</div><select className="f-inp" value={novo.dc} onChange={(e) => setNovo((n) => ({ ...n, dc: e.target.value }))}>{DCS.map((dd) => <option key={dd} value={dd}>{dd || '—'}</option>)}</select></div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button className="btn btn-gray" onClick={() => setNovo((n) => ({ ...n, open: false }))}>Cancelar</button>
                <button className="btn btn-green" onClick={salvarNovo}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CLIENTES */}
      {modal === 'cli' && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-hdr-left"><span style={{ fontWeight: 700, fontSize: 15 }}>Clientes</span><button className="btn btn-green btn-sm" onClick={novoCliente}>+ Novo Cliente</button></div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>Edite os campos e clique em <b>Salvar</b>. A senha será usada para o cliente acessar o painel.</div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div className="tbl-scroll"><table>
                <thead><tr><th>ID</th><th>Nome</th><th>Senha</th><th>Ativo</th><th className="th-r">Calção</th><th className="th-r">Desconto</th><th>Comissão</th><th>Supervisor</th><th>Comissão Afiliado</th><th>Link do jogador</th><th className="th-sticky th-c">Ações</th></tr></thead>
                <tbody>{clientes.map((c, i) => { const bg = i % 2 === 0 ? 'var(--card)' : 'var(--row-alt)'; return (
                  <tr key={c.id} style={{ background: bg }}>
                    <td style={{ fontWeight: 600, color: 'var(--inp-text)' }}>{c.id}</td>
                    <td><input className="inp" value={c.nome} onChange={(e) => updCli(c.id, { nome: e.target.value.toUpperCase() })} style={{ width: 150, fontWeight: 700 }} /></td>
                    <td><input className="inp" value={c.s} placeholder="Senha" onChange={(e) => updCli(c.id, { s: e.target.value })} style={{ width: 110 }} /></td>
                    <td><select className="inp" value={c.on ? 'Sim' : 'Não'} onChange={(e) => updCli(c.id, { on: e.target.value === 'Sim' })}><option>Sim</option><option>Não</option></select></td>
                    <td className="td-r"><input type="number" className="inp" value={c.cal} onChange={(e) => updCli(c.id, { cal: Number(e.target.value) })} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td className="td-r"><input type="number" step="0.01" className="inp" value={c.desc} onChange={(e) => updCli(c.id, { desc: Number(e.target.value) })} style={{ width: 72, textAlign: 'right' }} /></td>
                    <td><input type="number" step="0.01" className="inp" value={c.com} onChange={(e) => updCli(c.id, { com: Number(e.target.value) })} style={{ width: 64 }} /></td>
                    <td><select className="inp" value={c.sup ?? '—'} onChange={(e) => updCli(c.id, { sup: e.target.value === '—' ? null : e.target.value })} style={{ minWidth: 120 }}><option>—</option>{afiliados.map((a) => <option key={a.id} value={a.nome}>{a.nome}</option>)}</select></td>
                    <td><input type="number" step="0.01" className="inp" value={c.af} onChange={(e) => updCli(c.id, { af: Number(e.target.value) })} style={{ width: 64 }} /></td>
                    <td><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input className="inp" value={c.link ?? ''} placeholder="/slug/NOME" onChange={(e) => updCli(c.id, { link: e.target.value })} style={{ width: 150, fontSize: 11 }} /><button className="btn-icon" title="Copiar link completo" onClick={() => copiarLink(c.link)}>📋</button></div></td>
                    <td className="td-sticky td-c" style={{ background: bg }}><button className="btn btn-blue btn-sm" onClick={() => saveCli(c.id)}>Salvar</button></td>
                  </tr>); })}</tbody>
              </table></div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AFILIADOS */}
      {modal === 'af' && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-hdr-left"><span style={{ fontWeight: 700, fontSize: 15 }}>Afiliados</span><button className="btn btn-green btn-sm" onClick={novoAfiliado}>+ Novo Afiliado</button></div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>Edite os campos e clique em <b>Salvar</b>. A comissão será usada no cadastro dos clientes vinculados ao afiliado.</div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div className="tbl-scroll"><table>
                <thead><tr><th>ID</th><th>Nome</th><th>Comissão</th><th className="th-sticky th-c">Ações</th></tr></thead>
                <tbody>{afiliados.map((a, i) => { const bg = i % 2 === 0 ? 'var(--card)' : 'var(--row-alt)'; return (
                  <tr key={a.id} style={{ background: bg }}>
                    <td style={{ fontWeight: 600, color: 'var(--inp-text)' }}>{a.id}</td>
                    <td><input className="inp inp-full" value={a.nome} onChange={(e) => updAf(a.id, { nome: e.target.value })} /></td>
                    <td><input type="number" step="0.01" className="inp" value={a.com} onChange={(e) => updAf(a.id, { com: Number(e.target.value) })} style={{ width: 80 }} /></td>
                    <td className="td-sticky td-c" style={{ background: bg }}><button className="btn btn-blue btn-sm" onClick={() => saveAf(a.id)}>Salvar</button></td>
                  </tr>); })}</tbody>
              </table></div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FECHAMENTO */}
      {modal === 'fech' && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr"><span style={{ fontWeight: 700, fontSize: 15 }}>Fechamento</span><button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <div><div className="f-lbl">Data início</div><input type="date" className="f-inp" style={{ width: 'auto' }} value={fech.dt1} onChange={(e) => setFech((f) => ({ ...f, dt1: e.target.value, period: '' }))} /></div>
                <div><div className="f-lbl">Data fim</div><input type="date" className="f-inp" style={{ width: 'auto' }} value={fech.dt2} onChange={(e) => setFech((f) => ({ ...f, dt2: e.target.value, period: '' }))} /></div>
                <div><div className="f-lbl">Período Rápido</div><select className="f-inp" style={{ width: 160 }} value={fech.period} onChange={(e) => { const p = periodDates(e.target.value); setFech({ period: e.target.value, dt1: p.d1, dt2: p.d2 }); loadFech(p.d1, p.d2); }}><option value="">—</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Esta Semana</option><option value="semana_ant">Semana Passada</option></select></div>
                <div><button className="btn btn-green" onClick={() => loadFech(fech.dt1, fech.dt2)}>Buscar</button></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <MiniMc lbl="CALÇÃO" val={`R$ ${fmt(fechData.g.cal)}`} color="var(--num)" />
                <MiniMc lbl="SALDO CALÇÃO" val={`R$ ${fmt(fechData.g.saldoCal)}`} color={clr(fechData.g.saldoCal)} />
                <MiniMc lbl="TOTAL APOSTADO" val={`R$ ${fmt(fechData.g.val)}`} color="#16a34a" />
                <MiniMc lbl="EM ABERTO" val={`R$ ${fmt(fechData.g.ab)}`} color="#B8860B" />
                <MiniMc lbl="SALDO BRUTO" val={`R$ ${fmt(fechData.g.sb)}`} color={clr(fechData.g.sb)} />
                <MiniMc lbl="COMISSÃO" val={`R$ ${fmt(fechData.g.cm)}`} color="#dc2626" />
                <MiniMc lbl="COMISSÃO AFILIADO" val={`R$ ${fmt(fechData.g.caf)}`} color="#dc2626" />
                <MiniMc lbl="SALDO LÍQUIDO" val={`R$ ${fmt(fechData.g.sl)}`} color={clr(fechData.g.sl)} />
              </div>
              <div className="tbl-scroll"><table>
                <thead><tr><th>Cliente</th><th className="th-r">Calção</th><th className="th-r">Saldo Calção</th><th className="th-r">Total Apostado</th><th className="th-r">Em Aberto</th><th className="th-r">Saldo Bruto</th><th className="th-r">Comissão</th><th className="th-r">Comissão Afiliado</th><th className="th-r">Saldo Líquido</th><th className="th-sticky th-c">Ações</th></tr></thead>
                <tbody>{fechData.rows.map((r, i) => { const bg = i % 2 === 0 ? 'var(--card)' : 'var(--row-alt)'; return (
                  <tr key={r.id} style={{ background: bg }}>
                    <td style={{ fontWeight: 700 }}>{r.nome}</td>
                    <td className="td-r">{fmt(r.cal)}</td>
                    <td className="td-r" style={{ color: clr(r.saldoCal), fontWeight: 600 }}>{fmt(r.saldoCal)}</td>
                    <td className="td-r" style={{ color: 'var(--num)', fontWeight: 600 }}>{fmt(r.val)}</td>
                    <td className="td-r" style={{ color: 'var(--num)' }}>{fmt(r.ab)}</td>
                    <td className="td-r" style={{ color: clr(r.sb), fontWeight: 600 }}>{fmt(r.sb)}</td>
                    <td className="td-r" style={{ color: 'var(--num)', fontWeight: 600 }}>{fmt(r.cm)}</td>
                    <td className="td-r" style={{ color: 'var(--num)' }}>{fmt(r.caf)}</td>
                    <td className="td-r" style={{ color: clr(r.sl), fontWeight: 700 }}>{fmt(r.sl)}</td>
                    <td className="td-sticky td-c" style={{ background: bg }}><button className="btn-icon" title="Baixar PDF" onClick={pdfBreve}>⬇</button></td>
                  </tr>); })}
                  {fechData.rows.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted2)', padding: 18 }}>Sem movimento no período.</td></tr>}
                </tbody>
              </table></div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FECHAMENTO AFILIADO */}
      {modal === 'faf' && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr"><span style={{ fontWeight: 700, fontSize: 15 }}>Fechamento Afiliado</span><button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <div><div className="f-lbl">Data inicial</div><input type="date" className="f-inp" style={{ width: 'auto' }} value={faf.dt1} onChange={(e) => setFaf((f) => ({ ...f, dt1: e.target.value, period: '' }))} /></div>
                <div><div className="f-lbl">Data final</div><input type="date" className="f-inp" style={{ width: 'auto' }} value={faf.dt2} onChange={(e) => setFaf((f) => ({ ...f, dt2: e.target.value, period: '' }))} /></div>
                <div><div className="f-lbl">Período Rápido</div><select className="f-inp" style={{ width: 160 }} value={faf.period} onChange={(e) => { const p = periodDates(e.target.value); setFaf({ period: e.target.value, dt1: p.d1, dt2: p.d2 }); loadFaf(p.d1, p.d2); }}><option value="">—</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Esta Semana</option><option value="semana_ant">Semana Passada</option></select></div>
                <div><button className="btn btn-green" onClick={() => loadFaf(faf.dt1, faf.dt2)}>Buscar</button></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <MiniMc lbl="LOGINS" val={String(fafData.g.logins)} color="#B8860B" />
                <MiniMc lbl="ENTRADA" val={`R$ ${fmt(fafData.g.val)}`} color="#16a34a" />
                <MiniMc lbl="SALDO BRUTO" val={`R$ ${fmt(fafData.g.sb)}`} color={clr(fafData.g.sb)} />
                <MiniMc lbl="COMISSÃO" val={`R$ ${fmt(fafData.g.cm)}`} color="#dc2626" />
                <MiniMc lbl="COMISSÃO AFILIADO" val={`R$ ${fmt(fafData.g.caf)}`} color="#dc2626" />
                <MiniMc lbl="SALDO LÍQUIDO" val={`R$ ${fmt(fafData.g.sl)}`} color={clr(fafData.g.sl)} />
              </div>
              <div className="tbl-scroll"><table>
                <thead><tr><th>Supervisor</th><th className="th-c">Logins</th><th className="th-r">Entrada</th><th className="th-r">Em Aberto</th><th className="th-r">Saldo Bruto</th><th className="th-r">Comissão</th><th className="th-r">Comissão Afiliado</th><th className="th-r">Saldo Líquido</th><th className="th-sticky th-c">Ações</th></tr></thead>
                <tbody>{fafData.rows.map((r, i) => { const bg = i % 2 === 0 ? 'var(--card)' : 'var(--row-alt)'; return (
                  <tr key={r.sup} style={{ background: bg }}>
                    <td style={{ fontWeight: 700 }}>{r.sup}</td>
                    <td className="td-c" style={{ color: 'var(--num)', fontWeight: 600 }}>{r.logins}</td>
                    <td className="td-r" style={{ color: 'var(--num)', fontWeight: 600 }}>{fmt(r.val)}</td>
                    <td className="td-r" style={{ color: 'var(--num)' }}>{fmt(r.ab)}</td>
                    <td className="td-r" style={{ color: clr(r.sb), fontWeight: 600 }}>{fmt(r.sb)}</td>
                    <td className="td-r" style={{ color: 'var(--num)', fontWeight: 600 }}>{fmt(r.cm)}</td>
                    <td className="td-r" style={{ color: 'var(--num)' }}>{fmt(r.caf)}</td>
                    <td className="td-r" style={{ color: clr(r.sl), fontWeight: 700 }}>{fmt(r.sl)}</td>
                    <td className="td-sticky td-c" style={{ background: bg }}><button className="btn-icon" title="Baixar PDF" onClick={pdfBreve}>⬇</button></td>
                  </tr>); })}
                  {fafData.rows.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted2)', padding: 18 }}>Nenhum supervisor com movimento.</td></tr>}
                </tbody>
              </table></div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RECEBER BILHETE */}
      {modal === 'wpp' && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr"><span style={{ fontWeight: 700, fontSize: 15 }}>📥 Receber bilhete (WhatsApp)</span><button className="modal-close" onClick={() => setModal(null)}>✕</button></div>
            <div className="modal-body" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--row-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 11px', marginBottom: 14, lineHeight: 1.5 }}>
                Simula a chegada de um bilhete. Na operação real, o backend recebe a <b>reação na imagem</b> do grupo, transcreve o bilhete (visão computacional) e o coloca na fila como <b>EM ABERTO</b>; odd/valor em branco ficam com <b>contorno vermelho</b> para você preencher.
              </div>
              <div style={{ marginBottom: 12 }}><div className="f-lbl">Cliente / grupo *</div><ComboBox options={cliOpts} value={wpp.cId} onChange={(v) => setWpp((w) => ({ ...w, cId: v }))} placeholder="— Selecione —" /></div>
              <div style={{ marginBottom: 12 }}><div className="f-lbl">Bilhete transcrito *</div><textarea className="f-inp" rows={4} style={{ resize: 'vertical' }} value={wpp.jogo} onChange={(e) => setWpp((w) => ({ ...w, jogo: e.target.value }))} placeholder={'Ex:\n1) Arsenal x Burnley\n• Menos de 6.5 gols'} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div><div className="f-lbl">Odd (opcional)</div><input type="number" step="0.01" className="f-inp" placeholder="vazio = em aberto" value={wpp.odd} onChange={(e) => setWpp((w) => ({ ...w, odd: e.target.value }))} /></div>
                <div><div className="f-lbl">Valor R$ (opcional)</div><input type="number" className="f-inp" placeholder="vazio = em aberto" value={wpp.val} onChange={(e) => setWpp((w) => ({ ...w, val: e.target.value }))} /></div>
              </div>
              <div style={{ marginBottom: 12 }}><div className="f-lbl">Descarrego</div><select className="f-inp" value={wpp.dc} onChange={(e) => setWpp((w) => ({ ...w, dc: e.target.value }))}>{DCS.map((dd) => <option key={dd} value={dd}>{dd || '—'}</option>)}</select></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-gray" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancelar</button>
                <button className="btn btn-green" style={{ flex: 1 }} onClick={receberBilhete}>Receber no sistema</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO CLIENTE */}
      {novoCli.open && (
        <div className="modal-bg" onClick={() => setNovoCli((s) => ({ ...s, open: false }))}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr"><span style={{ fontWeight: 700 }}>+ Novo Cliente</span><button className="modal-close" onClick={() => setNovoCli((s) => ({ ...s, open: false }))}>✕</button></div>
            <div className="modal-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><div className="f-lbl">Nome *</div><input className="f-inp" value={novoCli.nome} onChange={(e) => setNovoCli((s) => ({ ...s, nome: e.target.value.toUpperCase() }))} placeholder="NOME DO CLIENTE" /></div>
              <div><div className="f-lbl">Senha de acesso</div><input className="f-inp" value={novoCli.senha} onChange={(e) => setNovoCli((s) => ({ ...s, senha: e.target.value }))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div className="f-lbl">Calção</div><input type="number" className="f-inp" value={novoCli.cal} onChange={(e) => setNovoCli((s) => ({ ...s, cal: e.target.value }))} placeholder="0,00" /></div>
                <div><div className="f-lbl">Desconto</div><input type="number" step="0.01" className="f-inp" value={novoCli.desc} onChange={(e) => setNovoCli((s) => ({ ...s, desc: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div className="f-lbl">Comissão %</div><input type="number" step="0.01" className="f-inp" value={novoCli.com} onChange={(e) => setNovoCli((s) => ({ ...s, com: e.target.value }))} /></div>
                <div><div className="f-lbl">Comissão Afiliado %</div><input type="number" step="0.01" className="f-inp" value={novoCli.af} onChange={(e) => setNovoCli((s) => ({ ...s, af: e.target.value }))} /></div>
              </div>
              <div><div className="f-lbl">Supervisor</div><select className="f-inp" value={novoCli.sup} onChange={(e) => setNovoCli((s) => ({ ...s, sup: e.target.value }))}><option value="">—</option>{afiliados.map((a) => <option key={a.id} value={a.nome}>{a.nome}</option>)}</select></div>
              <div style={{ fontSize: 11, color: 'var(--muted2)' }}>O link de acesso do jogador é gerado automaticamente.</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button className="btn btn-gray" onClick={() => setNovoCli((s) => ({ ...s, open: false }))}>Cancelar</button>
                <button className="btn btn-green" onClick={salvarNovoCliente}>Cadastrar Cliente</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO AFILIADO */}
      {novoAf.open && (
        <div className="modal-bg" onClick={() => setNovoAf((s) => ({ ...s, open: false }))}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr"><span style={{ fontWeight: 700 }}>+ Novo Afiliado</span><button className="modal-close" onClick={() => setNovoAf((s) => ({ ...s, open: false }))}>✕</button></div>
            <div className="modal-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><div className="f-lbl">Nome *</div><input className="f-inp" value={novoAf.nome} onChange={(e) => setNovoAf((s) => ({ ...s, nome: e.target.value }))} placeholder="Nome do afiliado" /></div>
              <div><div className="f-lbl">Comissão %</div><input type="number" step="0.01" className="f-inp" value={novoAf.com} onChange={(e) => setNovoAf((s) => ({ ...s, com: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button className="btn btn-gray" onClick={() => setNovoAf((s) => ({ ...s, open: false }))}>Cancelar</button>
                <button className="btn btn-green" onClick={salvarNovoAfiliado}>Cadastrar Afiliado</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADVERTÊNCIA / OBSERVAÇÃO */}
      {obsModal && (
        <div className="modal-bg" onClick={() => setObsModal(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <span style={{ fontWeight: 700 }}>⚠ Advertência — Aposta #{obsModal.id}</span>
              <button className="modal-close" onClick={() => setObsModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 16 }}>
              <div className="f-lbl">Observação / motivo</div>
              <textarea className="f-inp" rows={4} style={{ resize: 'vertical' }} value={obsModal.text} onChange={(e) => setObsModal((m) => (m ? { ...m, text: e.target.value } : m))} placeholder="Descreva a advertência (ex: odd suspeita, valor acima do limite)…" />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="btn btn-gray" onClick={() => setObsModal(null)}>Cancelar</button>
                <button className="btn" onClick={resolverObs} style={{ background: '#16a34a', color: '#fff' }}>Resolvido</button>
                <button className="btn btn-green" onClick={salvarObs}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="pb-toast">{toastMsg}</div>}
    </div>
  );
}

function MiniMc({ lbl, val, color }: { lbl: string; val: string; color?: string }) {
  return (
    <div className="mc">
      <div className="mc-lbl">{lbl}</div>
      <div className="mc-val" style={{ color }}>{val}</div>
    </div>
  );
}

function Metric({ ico, icoBg, lbl, val, valColor, sub }: { ico: string; icoBg: string; lbl: string; val: string; valColor?: string; sub?: string }) {
  return (
    <div className="mc">
      <div className="mc-ico" style={{ background: icoBg }}>{ico}</div>
      <div className="mc-lbl">{lbl}</div>
      <div className="mc-val" style={{ color: valColor }}>{val}</div>
      {sub && <div className="mc-sub">{sub}</div>}
    </div>
  );
}

// ═══════════ CSS (portado do index original, escopado em .pb-panel) ═══════════
const CSS = `
.pb-panel{--bg:#f1f5f9;--card:#ffffff;--row-alt:#f8fafc;--text:#0f172a;--num:#111827;--muted:#6b7280;--muted2:#9ca3af;--line:#e5e7eb;--inp-text:#374151;--hover:#fff7e6;--sel-bg:#FDF8E8;--saved-bg:#f0fdf4;--edit-bg:#fffbeb;--alert-bg:#fff5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);font-size:14px;min-height:100vh;display:flex;flex-direction:column;color:var(--text)}
.pb-panel.dark{--bg:#0b1220;--card:#141d2e;--row-alt:#0f1726;--text:#e8edf3;--num:#e8edf3;--muted:#9aa6b6;--muted2:#7e8a9b;--line:#2a3a50;--inp-text:#d6dde7;--hover:#1d2940;--sel-bg:#2a2512;--saved-bg:#0f2418;--edit-bg:#2a2410;--alert-bg:#2c1616}
.pb-panel input,.pb-panel select,.pb-panel textarea,.pb-panel button{font-family:inherit;font-size:14px}
.pb-panel .tb{background:#0d1508;border-bottom:2px solid #B8860B;height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;position:sticky;top:0;z-index:50;flex-shrink:0}
.pb-panel .tb-logo{color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;min-width:140px}
.pb-panel .tb-logo small{color:#7a8c5a;font-weight:400;font-size:11px}
.pb-panel .tb-nav{display:flex;gap:4px;align-items:center}
.pb-panel .tb-btn{background:var(--card);border:1px solid #ddd;color:#1a2210;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:4px}
.pb-panel .tb-btn:hover{background:#f5f5f5;border-color:#B8860B}
.pb-panel .tb-sair{background:var(--card);border:1px solid #ddd;color:#dc2626;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:600}
.pb-panel .tb-sair:hover{background:#fee2e2;border-color:#ef4444}
.pb-panel .tb-menu-btn{background:transparent;border:1px solid #2d4010;color:#e2e8f0;padding:7px 11px;border-radius:6px;cursor:pointer;font-size:17px;line-height:1}
.pb-panel .painel-body{padding:16px 20px;flex:1}
.pb-panel .page-title{font-size:17px;font-weight:700;color:var(--text);margin-bottom:2px}
.pb-panel .page-sub{font-size:12px;color:#7a8c5a;margin-bottom:14px}
.pb-panel .filter-box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:14px}
.pb-panel .filter-label{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}
.pb-panel .filter-grid{display:grid;grid-template-columns:120px 1fr 1fr 1fr;gap:8px;margin-bottom:8px}
.pb-panel .filter-grid2{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:8px}
.pb-panel .filter-grid3{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.pb-panel .f-lbl{font-size:10px;color:var(--muted2);font-weight:600;margin-bottom:3px}
.pb-panel .f-inp{width:100%;border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:12px;outline:none;color:var(--inp-text);background:var(--card);-webkit-appearance:none;appearance:none;box-sizing:border-box}
.pb-panel .f-inp:focus{border-color:#DAA520}
.pb-panel .filter-hint{font-size:11px;color:var(--muted2);font-style:italic;margin-bottom:8px}
.pb-panel .filter-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.pb-panel .metrics-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px}
.pb-panel .metrics-row2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;max-width:500px}
.pb-panel .mc{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;position:relative;overflow:hidden}
.pb-panel .mc-ico{position:absolute;right:10px;top:10px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px}
.pb-panel .mc-lbl{font-size:9px;font-weight:700;color:var(--muted2);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
.pb-panel .mc-val{font-size:20px;font-weight:700}
.pb-panel .mc-sub{font-size:11px;color:var(--muted2);margin-top:2px}
.pb-panel .tbl-wrap{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.pb-panel .tbl-scroll{overflow-x:auto}
.pb-panel table{width:100%;border-collapse:collapse;font-size:12px;border:1px solid var(--line)}
.pb-panel thead tr{background:#1e3a0a}
.pb-panel thead th{color:#fff;font-weight:600;padding:10px 8px;text-align:left;white-space:nowrap;font-size:11px;border-right:1px solid rgba(255,255,255,0.15)}
.pb-panel thead th.th-r{text-align:right}
.pb-panel thead th.th-c{text-align:center}
.pb-panel tbody tr{border-bottom:1px solid var(--line)}
.pb-panel tbody td{padding:8px;vertical-align:middle;border-right:1px solid var(--line)}
.pb-panel tbody td.td-r{text-align:right}
.pb-panel tbody td.td-c{text-align:center}
.pb-panel .th-sticky{position:sticky;right:0;background:#1e3a0a;box-shadow:-3px 0 6px rgba(0,0,0,.15)}
.pb-panel .td-sticky{position:sticky;right:0;box-shadow:-3px 0 6px rgba(0,0,0,.06);z-index:1}
.pb-panel .tbl-footer{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line)}
.pb-panel .inp{border:1px solid var(--line);border-radius:5px;padding:5px 7px;font-size:12px;background:var(--card);outline:none}
.pb-panel .inp:focus{border-color:#DAA520}
.pb-panel .inp-w{border-color:#f59e0b !important;background:var(--edit-bg) !important}
.pb-panel .inp-full{width:100%}
.pb-panel .st-sel{border:none;border-radius:5px;padding:4px 7px;font-size:11px;font-weight:700;cursor:pointer;outline:none;min-width:100px}
.pb-panel .badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap;display:inline-block}
.pb-panel .btn{border:none;padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap}
.pb-panel .btn:disabled{opacity:.5;cursor:default}
.pb-panel .btn-green{background:#2d6a0a;color:#fff}
.pb-panel .btn-blue{background:#B8860B;color:#fff}
.pb-panel .btn-icon{background:var(--sel-bg);color:#B8860B;border:1px solid #F0D060;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:13px}
.pb-panel .btn-gray{background:var(--line);color:var(--inp-text);border:1px solid var(--line)}
.pb-panel .btn-red-o{background:var(--card);color:#ef4444;border:1px solid #fca5a5}
.pb-panel .btn-sm{padding:5px 10px;font-size:11px}
.pb-panel .pagination{display:flex;gap:6px;align-items:center}
.pb-panel .pg-info{font-size:11px;color:var(--muted)}
.pb-panel .desk-only{display:block}
.pb-panel .mob-only{display:none}
.pb-panel tr.row-alert td{border-top:2px solid #dc2626;border-bottom:2px solid #dc2626}
.pb-panel tr.row-alert td:first-child{border-left:2px solid #dc2626}
.pb-panel tr.row-alert td:last-child{border-right:2px solid #dc2626}
.pb-panel .rc.row-alert{border:2px solid #dc2626;box-shadow:0 0 0 3px #fee2e2}
.pb-panel .alert-tag{display:inline-block;font-size:9px;font-weight:700;color:#dc2626;background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:1px 7px;margin-left:6px}
.pb-panel .rc{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px}
.pb-panel .rc-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.pb-panel .rc-r{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--row-alt);font-size:12px;gap:6px}
.pb-panel .rc-l{color:var(--muted2);font-weight:600;font-size:11px;white-space:nowrap;min-width:80px}
.pb-panel .rc-btns{display:flex;gap:8px;margin-top:10px}
.pb-panel .mob-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200}
.pb-panel .mob-panel{position:absolute;right:0;top:0;bottom:0;width:220px;background:#1a2210;padding:20px 14px;display:flex;flex-direction:column;gap:8px}
.pb-panel .mob-item{background:transparent;border:1px solid #2d4010;color:#e2e8f0;padding:11px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:500;text-align:left;width:100%}
.pb-panel .mob-sair{background:#ef4444;border:none;color:#fff;padding:11px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-top:8px;text-align:left;width:100%}
.pb-panel .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:100;padding:12px}
.pb-panel .modal{background:var(--card);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;width:100%}
.pb-panel .modal-sm{max-width:480px;max-height:90vh}
.pb-panel .modal-md{max-width:700px;max-height:90vh}
.pb-panel .modal-lg{max-width:1100px;max-height:90vh}
.pb-panel .modal-hdr{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.pb-panel .modal-hdr-left{display:flex;align-items:center;gap:10px}
.pb-panel .modal-body{overflow-y:auto;flex:1}
.pb-panel .modal-close{background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);line-height:1;padding:2px 6px}
.pb-panel .pb-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e3a0a;color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:300;max-width:90vw;text-align:center}
.pb-panel .combo{position:relative;width:100%}
.pb-panel .combo-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:6px;border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:12px;background:var(--card);color:var(--inp-text);cursor:pointer;text-align:left}
.pb-panel .combo-btn:hover{border-color:#DAA520}
.pb-panel .combo-ph{color:var(--muted2)}
.pb-panel .combo-arrow{color:var(--muted2);font-size:10px;flex-shrink:0}
.pb-panel .combo-pop{position:absolute;z-index:120;top:calc(100% + 4px);left:0;right:0;background:var(--card);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.16);overflow:hidden}
.pb-panel .combo-search{width:100%;border:none;border-bottom:1px solid var(--line);padding:8px 10px;font-size:12px;outline:none}
.pb-panel .combo-list{max-height:230px;overflow-y:auto}
.pb-panel .combo-item{padding:7px 10px;font-size:12px;cursor:pointer;color:var(--inp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb-panel .combo-item:hover{background:var(--hover)}
.pb-panel .combo-item.sel{background:var(--sel-bg);font-weight:700;color:#B8860B}
.pb-panel .combo-empty{padding:9px 10px;font-size:12px;color:var(--muted2)}
@media(max-width:768px){
  .pb-panel .desk-only{display:none !important}
  .pb-panel .mob-only{display:block !important}
  .pb-panel .tb-nav{display:none}
  .pb-panel .painel-body{padding:10px 12px}
  .pb-panel .metrics-row{grid-template-columns:1fr 1fr}
  .pb-panel .metrics-row2{grid-template-columns:1fr 1fr;max-width:100%}
  .pb-panel .filter-grid,.pb-panel .filter-grid2,.pb-panel .filter-grid3{grid-template-columns:1fr 1fr}
}
@media(min-width:769px){
  .pb-panel .tb-menu-btn{display:none !important}
}
`;
