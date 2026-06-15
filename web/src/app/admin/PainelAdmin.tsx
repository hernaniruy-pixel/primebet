'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ═══════════ TIPOS ═══════════
interface Afiliado { id: number; nome: string; com: number }
interface Cliente { id: number; nome: string; s: string; on: boolean; cal: number; desc: number; com: number; sup: string | null; af: number }
interface Reg { id: number; dt: string; cId: number; jogo: string; odd: number; val: number; st: string; dc: string; sb: number; cm: number; caf: number; sl: number; bl: boolean; adv: boolean; irr: boolean }
interface Draft { dt?: string; odd?: string; val?: string; _saved?: boolean }

// ═══════════ DADOS INICIAIS ═══════════
const AFILIADOS_INIT: Afiliado[] = [
  { id: 5, nome: 'Heitor Escossia', com: 0 },
  { id: 7, nome: 'Lucas Tiger', com: 10 },
  { id: 8, nome: 'Renan Cardoso', com: 10 },
  { id: 3, nome: 'Samuel Henriquer', com: 15 },
  { id: 4, nome: 'Samuel Henrique', com: 15 },
  { id: 6, nome: 'Yuri Honorio', com: 0 },
];

const CLIS_INIT: Cliente[] = [
  { id: 12, nome: 'AHLEFELD', s: '102030', on: true, cal: 0, desc: 0.01, com: 6, sup: null, af: 0 },
  { id: 28, nome: 'ALE_FALTAS', s: '', on: true, cal: 0, desc: 0.01, com: 6, sup: null, af: 15 },
  { id: 27, nome: 'ALE_NBA', s: '', on: true, cal: 0, desc: 0.01, com: 6, sup: null, af: 15 },
  { id: 26, nome: 'ALECORNERS', s: '', on: true, cal: 0, desc: 0.01, com: 6, sup: null, af: 15 },
  { id: 50, nome: 'BRUNOFIRMINO', s: '666666', on: true, cal: 0, desc: 0.01, com: 6, sup: 'Samuel Henrique', af: 15 },
  { id: 19, nome: 'BRUNOGIRAO', s: '', on: false, cal: 0, desc: 0.01, com: 6, sup: null, af: 0 },
  { id: 9, nome: 'BRUXO', s: '', on: false, cal: 0, desc: 0.01, com: 6, sup: null, af: 0 },
  { id: 20, nome: 'CARIOCA', s: '', on: false, cal: 0, desc: 0.01, com: 6, sup: null, af: 0 },
  { id: 51, nome: 'CAVALCANTE', s: '909090', on: true, cal: 3000, desc: 0.01, com: 6, sup: null, af: 0 },
  { id: 22, nome: 'CRISTIAN', s: '102030', on: true, cal: 2045, desc: 0.01, com: 6, sup: 'Heitor Escossia', af: 10 },
  { id: 16, nome: 'DAVID', s: '050505', on: true, cal: 1957, desc: 0.01, com: 6, sup: null, af: 0 },
  { id: 37, nome: 'DAVIDBDS', s: '', on: true, cal: 0, desc: 0.01, com: 6, sup: null, af: 0 },
  { id: 39, nome: 'DAVIDLOPES', s: '010101', on: true, cal: 0, desc: 0, com: 6, sup: 'Samuel Henrique', af: 15 },
  { id: 31, nome: 'DIEGOMORAIS', s: '858585', on: true, cal: 0, desc: 0.01, com: 6, sup: 'Samuel Henrique', af: 15 },
  { id: 41, nome: 'DRMURIELL', s: '131313', on: true, cal: 1500, desc: 0.01, com: 6, sup: 'Heitor Escossia', af: 10 },
];

const REGS_INIT: Reg[] = [
  { id: 7184, dt: '2026-05-18 21:54', cId: 22, jogo: '1) Cruzeiro (F) v Corinthians (F) (Odd 2,04)\n• Corinthians (F) – Resultado Final', odd: 1.89, val: 962, st: 'EM ABERTO', dc: '', sb: 0, cm: 0, caf: 0, sl: 0, bl: false, adv: false, irr: false },
  { id: 7311, dt: '2026-05-18 21:28', cId: 28, jogo: '1) Arsenal – Burnley (Odd 1,56)\n• Menos de 30.5 – Total de chutes\n• Menos de 6.5 – Total de Gols', odd: 1.56, val: 886, st: 'EM ABERTO', dc: 'BETANO', sb: 0, cm: 0, caf: 0, sl: 0, bl: false, adv: false, irr: false },
  { id: 7316, dt: '2026-05-18 11:39', cId: 12, jogo: '1) Cruzeiro (F) v Corinthians (F) (Odd 2,04)\n• Corinthians (F) – Resultado Final', odd: 2.09, val: 538, st: 'EM ABERTO', dc: 'BET365', sb: 0, cm: 0, caf: 0, sl: 0, bl: false, adv: false, irr: false },
  { id: 7100, dt: '2026-05-17 14:20', cId: 50, jogo: '1) Bayern v Dortmund\n• Bayern – Resultado Final', odd: 1.72, val: 1200, st: 'GREEN', dc: 'BETANO', sb: 864, cm: 51.84, caf: 7.78, sl: 804.38, bl: false, adv: false, irr: false },
  { id: 7090, dt: '2026-05-17 10:05', cId: 22, jogo: '1) PSG v Marseille\n• PSG – Resultado Final', odd: 1.84, val: 500, st: 'RED', dc: '', sb: -500, cm: 0, caf: 0, sl: -500, bl: false, adv: false, irr: false },
  { id: 7080, dt: '2026-05-16 20:00', cId: 16, jogo: '1) Liverpool v Arsenal\n• Menos de 2.5 gols', odd: 2.1, val: 750, st: 'GREEN', dc: 'BET365', sb: 825, cm: 49.5, caf: 0, sl: 775.5, bl: false, adv: false, irr: false },
];

const STS = ['EM ABERTO', 'GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO'];
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
const clr = (n: number) => (n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : '#B8860B');
const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmtDate = (d: Date) => d.toISOString().split('T')[0];

function computeReg(st: string, val: number, odd: number, cli?: Cliente) {
  val = Number(val) || 0; odd = Number(odd) || 0;
  let sb = 0;
  if (st === 'GREEN') sb = val * (odd - 1);
  else if (st === 'MEIO GREEN') sb = (val * (odd - 1)) / 2;
  else if (st === 'RED') sb = -val;
  else if (st === 'MEIO RED') sb = -val / 2;
  const com = cli ? Number(cli.com) || 0 : 0;
  const af = cli ? Number(cli.af) || 0 : 0;
  const cm = sb > 0 ? sb * (com / 100) : 0;
  const caf = cm * (af / 100);
  return { sb: round2(sb), cm: round2(cm), caf: round2(caf), sl: round2(sb - cm - caf) };
}

const filtrosVazios = {
  id: '', nome: '', st: '', jogo: '', oddMin: '', oddMax: '', valMin: '', valMax: '',
  bl: '', adv: '', irr: '', dt1: '', dt2: '', period: '', ord: 'data_desc',
};

export default function PainelAdmin({ email }: { email: string }) {
  const router = useRouter();
  const [regs, setRegs] = useState<Reg[]>(REGS_INIT);
  const [clientes] = useState<Cliente[]>(CLIS_INIT);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [filtros, setFiltros] = useState({ ...filtrosVazios });
  const [page, setPage] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [mobMenu, setMobMenu] = useState(false);
  const [novo, setNovo] = useState<{ open: boolean; cId: string; jogo: string; odd: string; val: string; st: string; dc: string }>(
    { open: false, cId: '', jogo: '', odd: '', val: '', st: 'EM ABERTO', dc: '' },
  );

  const cMap = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])) as Record<number, Cliente>, [clientes]);

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

  // ── filtragem + ordenação
  const filtrados = useMemo(() => {
    const f = filtros;
    const inRange = (dt: string) => {
      const d = (dt || '').slice(0, 10);
      if (f.dt1 && d < f.dt1) return false;
      if (f.dt2 && d > f.dt2) return false;
      return true;
    };
    const res = regs.filter((r) => {
      if (f.id && !String(r.id).includes(f.id)) return false;
      if (f.nome && r.cId !== Number(f.nome)) return false;
      if (f.st && r.st !== f.st) return false;
      if (f.jogo && !r.jogo.toLowerCase().includes(f.jogo.toLowerCase())) return false;
      if (f.oddMin && r.odd < Number(f.oddMin)) return false;
      if (f.oddMax && r.odd > Number(f.oddMax)) return false;
      if (f.valMin && r.val < Number(f.valMin)) return false;
      if (f.valMax && r.val > Number(f.valMax)) return false;
      if (f.bl === 'sim' && !r.bl) return false;
      if (f.bl === 'nao' && r.bl) return false;
      if (f.adv === 'sim' && !r.adv) return false;
      if (f.adv === 'nao' && r.adv) return false;
      if (f.irr === 'sim' && !r.irr) return false;
      if (f.irr === 'nao' && r.irr) return false;
      if (!inRange(r.dt)) return false;
      return true;
    });
    if (f.ord === 'data_asc') res.sort((a, b) => a.dt.localeCompare(b.dt));
    else if (f.ord === 'data_desc') res.sort((a, b) => b.dt.localeCompare(a.dt));
    else if (f.ord === 'val_desc') res.sort((a, b) => b.val - a.val);
    else if (f.ord === 'val_asc') res.sort((a, b) => a.val - b.val);
    return res;
  }, [regs, filtros]);

  // ── métricas
  const tot = useMemo(() => {
    const t = { v: 0, ab: 0, sb: 0, cm: 0, caf: 0, sl: 0, n: 0, nab: 0 };
    filtrados.forEach((r) => { t.v += r.val; if (r.st === 'EM ABERTO') { t.ab += r.val; t.nab++; } t.sb += r.sb; t.cm += r.cm; t.caf += r.caf; t.sl += r.sl; t.n++; });
    return t;
  }, [filtrados]);

  // ── fila (dashboard = EM ABERTO por padrão; ao filtrar status, mostra aquele)
  const queue = useMemo(() => (filtros.st ? filtrados : filtrados.filter((r) => r.st === 'EM ABERTO')), [filtrados, filtros.st]);
  const totalPages = Math.max(1, Math.ceil(queue.length / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const start = (pageSafe - 1) * PAGE_SIZE;
  const pageRows = queue.slice(start, start + PAGE_SIZE);
  const shownTo = Math.min(start + PAGE_SIZE, queue.length);
  const filaLbl = filtros.st ? `com status "${filtros.st}"` : 'em aberto (aguardando verificação)';

  // ── edição
  const dV = (r: Reg, f: 'dt' | 'odd' | 'val') => { const d = drafts[r.id]; return d && d[f] !== undefined ? d[f]! : String(r[f]); };
  const dW = (r: Reg, f: 'dt' | 'odd' | 'val') => (drafts[r.id]?.[f] !== undefined ? ' inp-w' : '');
  function updDraft(id: number, f: 'dt' | 'odd' | 'val', v: string) { setDrafts((d) => ({ ...d, [id]: { ...d[id], [f]: v } })); }

  function recalc(id: number, patch: Partial<Reg>) {
    setRegs((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const merged = { ...r, ...patch };
      return { ...merged, ...computeReg(merged.st, merged.val, merged.odd, cMap[merged.cId]) };
    }));
  }

  function updRegSt(id: number, v: string) {
    const prev = regs.find((r) => r.id === id);
    const wasOpen = prev && prev.st === 'EM ABERTO';
    const nome = (cMap[prev?.cId ?? -1] || {}).nome || '';
    recalc(id, { st: v });
    if (wasOpen && v !== 'EM ABERTO') toast(`Aposta #${id} (${nome}) → ${v}. Atualizada no painel do jogador.`);
  }

  function saveReg(id: number) {
    const d = drafts[id] || {};
    recalc(id, {
      ...(d.dt !== undefined ? { dt: d.dt } : {}),
      ...(d.odd !== undefined ? { odd: Number(d.odd) } : {}),
      ...(d.val !== undefined ? { val: Number(d.val) } : {}),
    });
    setDrafts((dr) => ({ ...dr, [id]: { _saved: true } }));
    setTimeout(() => setDrafts((dr) => { const c = { ...dr }; delete c[id]; return c; }), 1800);
  }

  function delReg(id: number) {
    if (confirm('Excluir este registro?')) setRegs((rs) => rs.filter((r) => r.id !== id));
  }

  function salvarNovo() {
    if (!novo.cId || !novo.jogo || !novo.odd || !novo.val) { alert('Preencha todos os campos obrigatórios.'); return; }
    const cId = Number(novo.cId);
    const calc = computeReg(novo.st, Number(novo.val), Number(novo.odd), cMap[cId]);
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
    const dt = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    setRegs((rs) => [{ id: Date.now(), dt, cId, jogo: novo.jogo, odd: Number(novo.odd), val: Number(novo.val), st: novo.st, dc: novo.dc, ...calc, bl: false, adv: false, irr: false }, ...rs]);
    setNovo({ open: false, cId: '', jogo: '', odd: '', val: '', st: 'EM ABERTO', dc: '' });
    toast('Registro adicionado.');
  }

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const stStyle = (s: string) => { const c = SC[s] || { bg: '#e5e7eb', t: '#374151' }; return { background: c.bg, color: c.t }; };
  const breve = () => toast('Esta tela entra na próxima etapa. 🚧');

  return (
    <div className="pb-panel">
      <style>{CSS}</style>

      {/* TOPBAR */}
      <div className="tb">
        <div className="tb-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <span style={{ color: '#DAA520', fontWeight: 700 }}>PrimeBet</span> <small>Painel de Controle</small>
        </div>
        <div className="tb-nav">
          <button className="tb-btn" onClick={breve}>👥 Clientes</button>
          <button className="tb-btn" onClick={breve}>🤝 Afiliados</button>
          <button className="tb-btn" onClick={breve}>📊 Fechamento</button>
          <button className="tb-btn" onClick={breve}>📋 Fechamento Afiliado</button>
          <button className="tb-sair" onClick={sair}>↪ Sair</button>
        </div>
        <button className="tb-menu-btn mob-only" onClick={() => setMobMenu(true)}>☰</button>
      </div>

      {/* MENU MOBILE */}
      {mobMenu && (
        <div className="mob-bg" onClick={() => setMobMenu(false)}>
          <div className="mob-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ color: '#7a8c5a', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', marginBottom: 4 }}>MENU</div>
            <button className="mob-item" onClick={() => { breve(); setMobMenu(false); }}>👥 Clientes</button>
            <button className="mob-item" onClick={() => { breve(); setMobMenu(false); }}>🤝 Afiliados</button>
            <button className="mob-item" onClick={() => { breve(); setMobMenu(false); }}>📊 Fechamento</button>
            <button className="mob-item" onClick={() => { breve(); setMobMenu(false); }}>📋 Fech. Afiliado</button>
            <button className="mob-item" onClick={() => { setNovo((n) => ({ ...n, open: true })); setMobMenu(false); }}>➕ Novo Registro</button>
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
              <select className="f-inp" value={filtros.nome} onChange={(e) => setF('nome', e.target.value)}>
                <option value="">— Selecione um cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div><div className="f-lbl">Jogo contém</div><input className="f-inp" value={filtros.jogo} onChange={(e) => setF('jogo', e.target.value)} placeholder="Jogo contém" /></div>
            <div><div className="f-lbl">Odd mín</div><input type="number" step="0.01" className="f-inp" value={filtros.oddMin} onChange={(e) => setF('oddMin', e.target.value)} placeholder="odd mín" /></div>
            <div><div className="f-lbl">Odd máx</div><input type="number" step="0.01" className="f-inp" value={filtros.oddMax} onChange={(e) => setF('oddMax', e.target.value)} placeholder="odd máx" /></div>
            <div><div className="f-lbl">Entradas mín</div><input type="number" className="f-inp" value={filtros.valMin} onChange={(e) => setF('valMin', e.target.value)} placeholder="entradas mín" /></div>
            <div><div className="f-lbl">Entradas máx</div><input type="number" className="f-inp" value={filtros.valMax} onChange={(e) => setF('valMax', e.target.value)} placeholder="entradas máx" /></div>
          </div>
          <div className="filter-grid3">
            <div><div className="f-lbl">Status</div>
              <select className="f-inp" value={filtros.st} onChange={(e) => setF('st', e.target.value)}>
                <option value="">— Selecione um status —</option>
                {STS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
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
            <button className="btn" onClick={breve} style={{ background: '#25D366', color: '#fff' }}>📥 Receber bilhete</button>
            <button className="btn btn-green" onClick={() => setNovo((n) => ({ ...n, open: true }))}>+ Novo registro</button>
          </div>
        </div>

        {/* MÉTRICAS */}
        <div className="metrics-row">
          <Metric ico="💰" icoBg="#16a34a22" lbl="ENTRADA" val={`R$ ${fmt(tot.v)}`} valColor="#16a34a" sub={`${tot.n} linhas`} />
          <Metric ico="⏳" icoBg="#B8860B22" lbl="EM ABERTO" val={`R$ ${fmt(tot.ab)}`} valColor="#B8860B" sub={`${tot.nab} linhas`} />
          <Metric ico="📊" icoBg="#8b5cf622" lbl="SALDO BRUTO" val={`R$ ${fmt(tot.sb)}`} valColor={clr(tot.sb)} />
          <Metric ico="%" icoBg="#dc262622" lbl="COMISSÃO" val={`R$ ${fmt(tot.cm)}`} valColor="#dc2626" />
          <Metric ico="✅" icoBg="#16a34a22" lbl="SALDO LÍQUIDO" val={`R$ ${fmt(tot.sl)}`} valColor={clr(tot.sl)} />
        </div>
        <div className="metrics-row2">
          <Metric ico="✕" icoBg="#dc262622" lbl="COMISSÃO AFILIADOS" val={`R$ ${fmt(tot.caf)}`} valColor="#dc2626" />
          <Metric ico="+" icoBg="#16a34a22" lbl="TOTAL FECHAMENTO" val={`R$ ${fmt(tot.sl - tot.caf)}`} valColor={clr(tot.sl - tot.caf)} />
        </div>

        <div id="reg-info" style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          {`Fila: ${queue.length} aposta(s) ${filaLbl} | Página ${pageSafe}/${totalPages} — exibindo ${queue.length ? start + 1 : 0}–${shownTo} de ${queue.length}`}
        </div>

        {/* TABELA DESKTOP */}
        <div className="tbl-wrap desk-only">
          <div className="tbl-scroll">
            <table>
              <thead><tr>
                <th>id</th><th>data</th><th>Nome</th><th>Jogo</th><th>odd</th><th>entradas</th><th>status</th>
                <th className="th-r">Saldo Bruto</th><th className="th-r">Comissão</th><th className="th-c">Baixa Liquidez</th><th className="th-r">Saldo Líquido</th>
                <th className="th-sticky th-c">Ações</th>
              </tr></thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const c = cMap[r.cId] || ({} as Cliente);
                  const d = drafts[r.id] || {};
                  const editing = Object.keys(d).filter((k) => k !== '_saved').length > 0;
                  const incompleto = !(Number(r.odd) > 0) || !(Number(r.val) > 0);
                  const bg = d._saved ? '#f0fdf4' : editing ? '#fffbeb' : i % 2 === 0 ? '#fff' : '#f8fafc';
                  const rowBg = incompleto ? '#fff5f5' : bg;
                  const btnBg = d._saved ? '#2d6a0a' : editing ? '#d97706' : '#B8860B';
                  return (
                    <tr key={r.id} className={incompleto ? 'row-alert' : ''} style={{ background: rowBg, transition: 'background .3s' }}>
                      <td style={{ fontWeight: 700, color: '#374151' }}>{r.id}</td>
                      <td><input className={`inp${dW(r, 'dt')}`} value={dV(r, 'dt')} onChange={(e) => updDraft(r.id, 'dt', e.target.value)} style={{ width: 130, fontSize: 11 }} /></td>
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{c.nome || r.cId}{incompleto && <span className="alert-tag">PREENCHER</span>}</td>
                      <td style={{ maxWidth: 200 }}>{r.jogo.split('\n').map((l, ii) => <div key={ii} style={{ fontSize: ii === 0 ? 11 : 10, color: ii === 0 ? '#111' : '#6b7280' }}>{l}</div>)}</td>
                      <td><input type="number" step="0.01" className={`inp${dW(r, 'odd')}`} value={dV(r, 'odd')} onChange={(e) => updDraft(r.id, 'odd', e.target.value)} placeholder="—" style={{ width: 58, fontSize: 11, ...(incompleto && !(Number(r.odd) > 0) ? { borderColor: '#dc2626' } : {}) }} /></td>
                      <td><input type="number" step="0.01" className={`inp${dW(r, 'val')}`} value={dV(r, 'val')} onChange={(e) => updDraft(r.id, 'val', e.target.value)} placeholder="—" style={{ width: 76, fontSize: 11, color: '#B8860B', fontWeight: 700, ...(incompleto && !(Number(r.val) > 0) ? { borderColor: '#dc2626' } : {}) }} /></td>
                      <td><select className="st-sel" style={stStyle(r.st)} value={r.st} onChange={(e) => updRegSt(r.id, e.target.value)}>{STS.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                      <td className="td-r" style={{ fontWeight: 600, color: clr(r.sb) }}>{fmt(r.sb)}</td>
                      <td className="td-r" style={{ fontWeight: 600, color: clr(r.cm) }}>{fmt(r.cm)}</td>
                      <td className="td-c"><select className="inp" value={r.bl ? 'Sim' : 'Não'} onChange={(e) => recalc(r.id, { bl: e.target.value === 'Sim' })} style={{ fontSize: 11 }}><option>Não</option><option>Sim</option></select></td>
                      <td className="td-r" style={{ fontWeight: 700, color: clr(r.sl) }}>{fmt(r.sl)}</td>
                      <td className="td-sticky td-c" style={{ background: rowBg }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
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
            <span className="pg-info">{queue.length} na fila</span>
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
            const bg = d._saved ? '#f0fdf4' : editing ? '#fffbeb' : '#fff';
            const btnBg = d._saved ? '#2d6a0a' : editing ? '#d97706' : '#B8860B';
            const sc = SC[r.st] || { bg: '#e5e7eb', t: '#374151' };
            return (
              <div key={r.id} className={`rc ${incompleto ? 'row-alert' : ''}`} style={{ background: incompleto ? '#fff5f5' : bg }}>
                <div className="rc-h">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#374151', fontSize: 12 }}>#{r.id}</span>
                    <span style={{ fontWeight: 700, color: '#111', fontSize: 14 }}>{c.nome || r.cId}</span>
                    {incompleto && <span className="alert-tag">PREENCHER</span>}
                  </div>
                  <span className="badge" style={{ background: sc.bg, color: sc.t }}>{r.st}</span>
                </div>
                <div className="rc-r"><span className="rc-l">Data/Hora</span><input className={`inp${dW(r, 'dt')}`} value={dV(r, 'dt')} onChange={(e) => updDraft(r.id, 'dt', e.target.value)} style={{ width: 154, textAlign: 'right', fontSize: 12 }} /></div>
                <div className="rc-r"><span className="rc-l">Jogo</span><span style={{ fontSize: 11, textAlign: 'right', flex: 1, marginLeft: 8 }}>{r.jogo.split('\n').map((l, ii) => <div key={ii} style={{ color: ii === 0 ? '#111' : '#6b7280' }}>{l}</div>)}</span></div>
                <div className="rc-r"><span className="rc-l">Odd</span><input type="number" step="0.01" className={`inp${dW(r, 'odd')}`} value={dV(r, 'odd')} onChange={(e) => updDraft(r.id, 'odd', e.target.value)} style={{ width: 90, textAlign: 'right', fontWeight: 700 }} /></div>
                <div className="rc-r"><span className="rc-l">Entradas</span><input type="number" step="0.01" className={`inp${dW(r, 'val')}`} value={dV(r, 'val')} onChange={(e) => updDraft(r.id, 'val', e.target.value)} style={{ width: 110, textAlign: 'right', fontWeight: 700, color: '#B8860B' }} /></div>
                <div className="rc-r"><span className="rc-l">Status</span><div style={{ flex: 1, marginLeft: 8 }}><select className="st-sel inp-full" style={stStyle(r.st)} value={r.st} onChange={(e) => updRegSt(r.id, e.target.value)}>{STS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div></div>
                <div className="rc-r"><span className="rc-l">S.Bruto</span><span style={{ fontWeight: 600, color: clr(r.sb) }}>R$ {fmt(r.sb)}</span></div>
                <div className="rc-r"><span className="rc-l">Comissão</span><span style={{ fontWeight: 600, color: clr(r.cm) }}>R$ {fmt(r.cm)}</span></div>
                <div className="rc-r"><span className="rc-l">S.Líquido</span><span style={{ fontWeight: 700, color: clr(r.sl) }}>R$ {fmt(r.sl)}</span></div>
                <div className="rc-btns">
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
                <select className="f-inp" value={novo.cId} onChange={(e) => setNovo((n) => ({ ...n, cId: e.target.value }))}>
                  <option value="">— Selecione —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div><div className="f-lbl">Jogo</div><textarea className="f-inp" rows={3} value={novo.jogo} onChange={(e) => setNovo((n) => ({ ...n, jogo: e.target.value }))} placeholder={'1) Time A x Time B\n• Mercado / seleção'} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div className="f-lbl">Odd</div><input type="number" step="0.01" className="f-inp" value={novo.odd} onChange={(e) => setNovo((n) => ({ ...n, odd: e.target.value }))} /></div>
                <div><div className="f-lbl">Entradas (R$)</div><input type="number" className="f-inp" value={novo.val} onChange={(e) => setNovo((n) => ({ ...n, val: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div className="f-lbl">Status</div><select className="f-inp" value={novo.st} onChange={(e) => setNovo((n) => ({ ...n, st: e.target.value }))}>{STS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
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

      {toastMsg && <div className="pb-toast">{toastMsg}</div>}
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
.pb-panel{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;font-size:14px;min-height:100vh;display:flex;flex-direction:column;color:#0f172a}
.pb-panel input,.pb-panel select,.pb-panel textarea,.pb-panel button{font-family:inherit;font-size:14px}
.pb-panel .tb{background:#0d1508;border-bottom:2px solid #B8860B;height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;position:sticky;top:0;z-index:50;flex-shrink:0}
.pb-panel .tb-logo{color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;min-width:140px}
.pb-panel .tb-logo small{color:#7a8c5a;font-weight:400;font-size:11px}
.pb-panel .tb-nav{display:flex;gap:4px;align-items:center}
.pb-panel .tb-btn{background:#fff;border:1px solid #ddd;color:#1a2210;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:4px}
.pb-panel .tb-btn:hover{background:#f5f5f5;border-color:#B8860B}
.pb-panel .tb-sair{background:#fff;border:1px solid #ddd;color:#dc2626;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:600}
.pb-panel .tb-sair:hover{background:#fee2e2;border-color:#ef4444}
.pb-panel .tb-menu-btn{background:transparent;border:1px solid #2d4010;color:#e2e8f0;padding:7px 11px;border-radius:6px;cursor:pointer;font-size:17px;line-height:1}
.pb-panel .painel-body{padding:16px 20px;flex:1}
.pb-panel .page-title{font-size:17px;font-weight:700;color:#0f172a;margin-bottom:2px}
.pb-panel .page-sub{font-size:12px;color:#7a8c5a;margin-bottom:14px}
.pb-panel .filter-box{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:14px}
.pb-panel .filter-label{font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}
.pb-panel .filter-grid{display:grid;grid-template-columns:120px 1fr 1fr 1fr;gap:8px;margin-bottom:8px}
.pb-panel .filter-grid2{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:8px}
.pb-panel .filter-grid3{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.pb-panel .f-lbl{font-size:10px;color:#9ca3af;font-weight:600;margin-bottom:3px}
.pb-panel .f-inp{width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:12px;outline:none;color:#374151;background:#fff;-webkit-appearance:none;appearance:none;box-sizing:border-box}
.pb-panel .f-inp:focus{border-color:#DAA520}
.pb-panel .filter-hint{font-size:11px;color:#9ca3af;font-style:italic;margin-bottom:8px}
.pb-panel .filter-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.pb-panel .metrics-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px}
.pb-panel .metrics-row2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;max-width:500px}
.pb-panel .mc{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;position:relative;overflow:hidden}
.pb-panel .mc-ico{position:absolute;right:10px;top:10px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px}
.pb-panel .mc-lbl{font-size:9px;font-weight:700;color:#9ca3af;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
.pb-panel .mc-val{font-size:20px;font-weight:700}
.pb-panel .mc-sub{font-size:11px;color:#9ca3af;margin-top:2px}
.pb-panel .tbl-wrap{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
.pb-panel .tbl-scroll{overflow-x:auto}
.pb-panel table{width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb}
.pb-panel thead tr{background:#1e3a0a}
.pb-panel thead th{color:#fff;font-weight:600;padding:10px 8px;text-align:left;white-space:nowrap;font-size:11px;border-right:1px solid rgba(255,255,255,0.15)}
.pb-panel thead th.th-r{text-align:right}
.pb-panel thead th.th-c{text-align:center}
.pb-panel tbody tr{border-bottom:1px solid #e5e7eb}
.pb-panel tbody td{padding:8px;vertical-align:middle;border-right:1px solid #e5e7eb}
.pb-panel tbody td.td-r{text-align:right}
.pb-panel tbody td.td-c{text-align:center}
.pb-panel .th-sticky{position:sticky;right:0;background:#1e3a0a;box-shadow:-3px 0 6px rgba(0,0,0,.15)}
.pb-panel .td-sticky{position:sticky;right:0;box-shadow:-3px 0 6px rgba(0,0,0,.06);z-index:1}
.pb-panel .tbl-footer{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f1f5f9}
.pb-panel .inp{border:1px solid #e5e7eb;border-radius:5px;padding:5px 7px;font-size:12px;background:#fff;outline:none}
.pb-panel .inp:focus{border-color:#DAA520}
.pb-panel .inp-w{border-color:#f59e0b !important;background:#fffbeb !important}
.pb-panel .inp-full{width:100%}
.pb-panel .st-sel{border:none;border-radius:5px;padding:4px 7px;font-size:11px;font-weight:700;cursor:pointer;outline:none;min-width:100px}
.pb-panel .badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap;display:inline-block}
.pb-panel .btn{border:none;padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap}
.pb-panel .btn:disabled{opacity:.5;cursor:default}
.pb-panel .btn-green{background:#2d6a0a;color:#fff}
.pb-panel .btn-gray{background:#f1f5f9;color:#374151;border:1px solid #e5e7eb}
.pb-panel .btn-red-o{background:#fff;color:#ef4444;border:1px solid #fca5a5}
.pb-panel .btn-sm{padding:5px 10px;font-size:11px}
.pb-panel .pagination{display:flex;gap:6px;align-items:center}
.pb-panel .pg-info{font-size:11px;color:#6b7280}
.pb-panel .desk-only{display:block}
.pb-panel .mob-only{display:none}
.pb-panel tr.row-alert td{border-top:2px solid #dc2626;border-bottom:2px solid #dc2626}
.pb-panel tr.row-alert td:first-child{border-left:2px solid #dc2626}
.pb-panel tr.row-alert td:last-child{border-right:2px solid #dc2626}
.pb-panel .rc.row-alert{border:2px solid #dc2626;box-shadow:0 0 0 3px #fee2e2}
.pb-panel .alert-tag{display:inline-block;font-size:9px;font-weight:700;color:#dc2626;background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:1px 7px;margin-left:6px}
.pb-panel .rc{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:10px}
.pb-panel .rc-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.pb-panel .rc-r{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f8fafc;font-size:12px;gap:6px}
.pb-panel .rc-l{color:#9ca3af;font-weight:600;font-size:11px;white-space:nowrap;min-width:80px}
.pb-panel .rc-btns{display:flex;gap:8px;margin-top:10px}
.pb-panel .mob-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200}
.pb-panel .mob-panel{position:absolute;right:0;top:0;bottom:0;width:220px;background:#1a2210;padding:20px 14px;display:flex;flex-direction:column;gap:8px}
.pb-panel .mob-item{background:transparent;border:1px solid #2d4010;color:#e2e8f0;padding:11px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:500;text-align:left;width:100%}
.pb-panel .mob-sair{background:#ef4444;border:none;color:#fff;padding:11px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-top:8px;text-align:left;width:100%}
.pb-panel .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:100;padding:12px}
.pb-panel .modal{background:#fff;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;width:100%}
.pb-panel .modal-sm{max-width:480px;max-height:90vh}
.pb-panel .modal-hdr{padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.pb-panel .modal-hdr-left{display:flex;align-items:center;gap:10px}
.pb-panel .modal-body{overflow-y:auto;flex:1}
.pb-panel .modal-close{background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;line-height:1;padding:2px 6px}
.pb-panel .pb-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e3a0a;color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:300;max-width:90vw;text-align:center}
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
