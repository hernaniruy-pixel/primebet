'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Afiliado, Cliente, Reg, Totals, ApostasPage, FiltroApostas, FechCliResp, FechAfResp, FechCliRow, FechAfRow, AcertosResp, AcertoCliente } from './types';
import { partesTs, statusContestacao } from './types';
import {
  criarAposta, atualizarAposta, excluirAposta, listarApostas, resolverContestacao, aceitarContestacao, sessaoAtiva,
  criarCliente, atualizarCliente, excluirCliente, criarAfiliado, atualizarAfiliado, excluirAfiliado,
  fechamentoClientes, fechamentoAfiliados, bilhetesCliente, listarDespesasPeriodo,
  statusBot, type BotStatus,
  lerPlano, type PlanoConfig, type UsoCota,
  sairEquipe,
  listarEquipe, criarEquipe, resetarSenhaEquipe, definirAtivoEquipe, atualizarPermissoesEquipe, alterarMinhaSenha, type EquipeUser,
  historicoAposta, type AuditoriaItem,
  enfileirarEnvioPdf, statusEnviosPdf,
  listarAcertos, registrarAcerto, excluirAcerto,
  restaurarDemo,
  alternarModeloDemo,
} from './actions';
import { gerarPdfFechamento } from './pdf-fechamento';
import { gerarPdfFechamentoGeral } from './pdf-fechamento-geral';
import { gerarPdfFechamentoAfiliado } from './pdf-fechamento-afiliados';
import { MARCA } from '@/lib/marca';
import { fmtOdd, fmtMoney, parseNumBR } from './num';

interface Draft { dt?: string; odd?: string; val?: string; jogo?: string; st?: string; _saved?: boolean }

const STS = ['EM ABERTO', 'GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO'];
const DCS = ['', 'BETANO', 'BET365', 'SPORTINGBET', 'SUPERBET', 'PIXBET'];
const PAGE_SIZE = 20;

// Cores sólidas do status (igual ao original): fundo saturado + texto branco/escuro.
const STPILL: Record<string, string> = {
  'EM ABERTO': 'bg-violet-200 text-violet-900',
  GREEN: 'bg-green-600 text-white',
  'MEIO GREEN': 'bg-green-300 text-green-900',
  'MEIO RED': 'bg-red-300 text-red-900',
  RED: 'bg-red-600 text-white',
  REEMBOLSO: 'bg-yellow-400 text-yellow-900',
};

// Mesmas cores em hex — para o <select>/<option> nativos (que ignoram classes Tailwind).
const STCOLOR: Record<string, { bg: string; fg: string }> = {
  'EM ABERTO': { bg: '#ddd6fe', fg: '#4c1d95' },
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
// Cada número na cor do próprio card (preto se 0), para o valor e o selo do título
// contarem a mesma história.
const entCls = (n: number) => (Number(n) === 0 ? ZEROCLS : 'text-blue-600 dark:text-blue-400'); // entrada: azul
const abertoCls = (n: number) => (Number(n) === 0 ? ZEROCLS : 'text-violet-700 dark:text-violet-400'); // em aberto: roxo escuro

// Nome do jogador destacado dentro da linha de mercado: "[Fulano]" ou "Fulano: 1+ ...".
// É o que o JM faz — o olho acha o jogador na hora, sem ler a linha inteira.
function destacarJogador(texto: string, k: number) {
  const m = texto.match(/^(.*?)(\[[^\]]+\])(.*)$/) || texto.match(/^([•\s]*)([^:•]+:)(.*)$/);
  if (!m) return <span key={k}>{texto}</span>;
  return <span key={k}>{m[1]}<span className="text-teal-700 dark:text-teal-400">{m[2]}</span>{m[3]}</span>;
}

// Renderiza o jogo no formato do JM: fonte monoespaçada (alinha tudo), linha do
// confronto em azul e negrito, jogador em destaque. Cobre "Time A - Time B",
// "Time A @ Time B" e "Time A v Time B".
function renderJogo(jogo: string) {
  return (jogo || '').split('\n').map((line, i) => {
    const t = line.trimStart();
    // Linha de jogo (times) = começa com "N)", OU contém "(Odd ...)", OU é um confronto
    // "Time A x Time B" (separador x / v / vs / ×). Nos bilhetes de um jogo só, a IA não
    // numera — então sem detectar o "x" o nome das equipes ficava sem o destaque laranja.
    // Linhas de mercado ("•") nunca são cabeçalho, mesmo que citem um "x".
    const isVersus = !t.startsWith('•') && /\s(?:x|v|vs|×)\s/i.test(t);
    const isGame = /^\d+\)/.test(t) || (/\(odd/i.test(line) && !t.startsWith('•')) || isVersus;
    if (isGame) {
      const pm = line.match(/^(\s*\d+\)\s*)?([\s\S]*)$/);
      const pref = pm?.[1] ?? '';
      const body = pm?.[2] ?? line;
      const om = body.match(/^(.*?)(\s*\(odd.*)$/i); // separa o "(Odd ...)" se existir
      const teams = (om ? om[1] : body).trim();
      const rest = om ? om[2].trim() : '';
      return (
        <div key={i} className="font-bold text-orange-600 dark:text-orange-400">
          <span className="font-normal text-slate-400">{pref}</span>{teams}{rest ? ` ${rest}` : ''}
        </div>
      );
    }
    return <div key={i} className="text-slate-700 dark:text-slate-300">{destacarJogador(line, i)}</div>;
  });
}
function periodDates(v: string): { d1: string; d2: string } {
  const today = new Date();
  // Dias desde a segunda-feira: Dom=6, Seg=0, ..., Sáb=5. Sem isto, no DOMINGO
  // (getDay()==0) "esta semana" pulava para a semana SEGUINTE e a fila esvaziava.
  const desdeSeg = (today.getDay() + 6) % 7;
  if (v === 'hoje') { const d = fmtDate(today); return { d1: d, d2: d }; }
  if (v === 'ontem') { const d = new Date(today); d.setDate(d.getDate() - 1); const s = fmtDate(d); return { d1: s, d2: s }; }
  if (v === 'semana') { const mon = new Date(today); mon.setDate(today.getDate() - desdeSeg); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { d1: fmtDate(mon), d2: fmtDate(sun) }; }
  if (v === 'semana_ant') { const mon = new Date(today); mon.setDate(today.getDate() - desdeSeg - 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { d1: fmtDate(mon), d2: fmtDate(sun) }; }
  return { d1: '', d2: '' };
}

const filtrosVazios = {
  id: '', nome: '', st: '', jogo: '', dc: '', oddMin: '', oddMax: '', valMin: '', valMax: '',
  bl: '', adv: '', irr: '', dt1: '', dt2: '', period: '', ord: 'data_desc',
  aba: 'pend',  // 'pend' = fila pendente (EM ABERTO + contestadas) | 'todas' = histórico completo
};

const inp = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20';
const lbl = 'mb-1 block text-[11px] font-medium text-slate-400 dark:text-slate-500';
const cinp = 'rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-marca-500';

// Rótulos das ações registradas no histórico (auditoria) do bilhete.
const ACAO_LABEL: Record<string, string> = {
  lancamento: 'Lançou o bilhete', status: 'Mudou o status', odd: 'Alterou a odd', valor: 'Alterou o valor',
  jogo: 'Editou o jogo', data: 'Alterou data/hora', descarrego: 'Mudou o descarrego', baixa_liq: 'Baixa liquidez',
  advertencia: 'Advertência', irregular: 'Marcou irregular', obs: 'Observação', cliente: 'Trocou o cliente',
  contestacao: 'Resolveu contestação', exclusao: 'Excluiu o bilhete',
};

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

// Alerta padrão quando um "Salvar" de aposta falha. Em produção o Next MASCARA a
// mensagem do erro (o "Não autenticado" vira um texto técnico genérico), então aqui
// checamos a sessão direto: se caiu, mostramos "recarregue e entre de novo" — a causa
// nº1 desse erro — em vez do texto assustador. Se ainda está logado, mostra o motivo.
async function alertaFalhaSalvar(id: number, msg: string, textoQuandoLogado: string) {
  const logado = await sessaoAtiva().catch(() => true); // se a checagem falhar, não afirma expiração
  if (!logado) {
    alert(`⚠️ A aposta #${id} NÃO foi salva.\n\nSua sessão expirou. Recarregue a página e entre de novo — a aposta continua na fila.`);
  } else {
    alert(`⚠️ A aposta #${id} NÃO foi salva.\n\nMotivo: ${msg}\n\n${textoQuandoLogado}`);
  }
}

export default function PainelModerno({ email, papel, demo = false, contasLiberado, clientesIni, afiliadosIni, apostasIni, semana }: {
  email: string; papel: 'master' | 'admin' | 'gestor' | 'operador'; demo?: boolean; contasLiberado: boolean; clientesIni: Cliente[]; afiliadosIni: Afiliado[]; apostasIni: ApostasPage; semana: { d1: string; d2: string };
}) {
  const router = useRouter();
  // Papéis: operador só vê bilhetes + conferência (nada financeiro); gestor/admin/master veem tudo.
  const podeFinanceiro = papel === 'master' || papel === 'admin' || papel === 'gestor';
  const ehAdmin = papel === 'master' || papel === 'admin';   // gerencia equipe (Usuários)
  const ehMaster = papel === 'master';                        // só o dono da rede cria admin / mexe em cota
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
  const [modal, setModal] = useState<null | 'cli' | 'af' | 'fech' | 'faf' | 'wpp' | 'plano' | 'usuarios' | 'minhaSenha' | 'acertos'>(null);
  const [minhaSenha, setMinhaSenha] = useState({ atual: '', nova: '', conf: '', erro: '', ok: false });
  // Acertos (pagamentos/recebimentos): período próprio (default semana passada),
  // resultado, inputs de lançamento por cliente e clientes com histórico aberto.
  const [acertoPer, setAcertoPer] = useState(() => { const p = periodDates('semana_ant'); return { dt1: p.d1, dt2: p.d2, period: 'semana_ant' }; });
  const [acertoRes, setAcertoRes] = useState<AcertosResp | null>(null);
  const [acertoBusy, setAcertoBusy] = useState(false);
  const [acertoLanc, setAcertoLanc] = useState<Record<number, { valor: string; obs: string }>>({});
  const [acertoHist, setAcertoHist] = useState<Set<number>>(new Set());
  // Plano/cota de transcrições — SOMENTE LEITURA neste painel (é do dono da banca).
  // A configuração (cota, preço, renovação, zerar) fica no admin MASTER do Tracker.
  const [plano, setPlano] = useState<{ config: PlanoConfig; uso: UsoCota } | null>(null);
  const [wpp, setWpp] = useState({ cId: '', jogo: '', odd: '', val: '', dc: '' });
  const [novoCli, setNovoCli] = useState({ open: false, nome: '', senha: '', cal: '', desc: '0.01', com: '6', af: '0', sup: '', bl: false, grupoLink: ''});
  const [novoAf, setNovoAf] = useState({ open: false, nome: '', com: '0' });
  const [obsModal, setObsModal] = useState<{ id: number; text: string } | null>(null);
  // Editor do TEXTO do bilhete (jogo) — abre pelo lápis no canto da aposta.
  const [jogoModal, setJogoModal] = useState<{ id: number; text: string } | null>(null);
  // Editor de DATA/HORA da aposta — abre pelo lápis na coluna de data.
  const [dtModal, setDtModal] = useState<{ id: number; date: string; time: string } | null>(null);
  const [fech, setFech] = useState(() => { const p = periodDates('semana_ant'); return { dt1: p.d1, dt2: p.d2, period: 'semana_ant' }; }); // fechamento é sempre da semana passada
  const [faf, setFaf] = useState({ dt1: semana.d1, dt2: semana.d2, period: 'semana' });
  const [fechRes, setFechRes] = useState<FechCliResp | null>(null);
  const [fafRes, setFafRes] = useState<FechAfResp | null>(null);
  const [pdfBusy, setPdfBusy] = useState<number | null>(null); // id do cliente cujo PDF está sendo gerado
  const [pdfAfBusy, setPdfAfBusy] = useState<string | null>(null); // nome do afiliado cujo PDF está sendo gerado
  // Filtro inicial SEM data: tem que bater com o que o servidor renderizou
  // (listarApostas({ pend:true }) — fila pendente inteira). Antes forçava "esta semana"
  // aqui, então ao hidratar o cliente rebuscava só a semana e os bilhetes do backlog
  // SUMIAM da tela segundos após o login. O período segue disponível no filtro.
  // Ao ENTRAR, o painel já vem filtrado na SEMANA ATUAL + fila PENDENTE (a visão de
  // trabalho do dia). Tem que bater EXATO com o que o SSR renderizou (page.tsx usa
  // pend:true + a mesma semana), senão os bilhetes "piscavam" e sumiam na hidratação.
  const filtrosIniciais = { ...filtrosVazios, period: 'semana', dt1: semana.d1, dt2: semana.d2 };
  const [filtros, setFiltros] = useState({ ...filtrosIniciais });
  const [debFiltros, setDebFiltros] = useState(filtros);
  // Quanto esperar antes de disparar a busca: campos de TEXTO (jogo, id…) esperam
  // 400ms pra não buscar a cada tecla; SELECTS (cliente, status, período…) aplicam
  // na hora (0ms) — não há o que "terminar de digitar", então o delay só atrapalha.
  const debMs = useRef(400);
  const [page, setPage] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const [flashId, setFlashId] = useState<number | null>(null); // linha recém-atualizada (flash verde)
  const [novo, setNovo] = useState({ open: false, cId: '', jogo: '', odd: '', val: '', st: 'EM ABERTO', dc: '' });
  const [bot, setBot] = useState<BotStatus | null>(null);
  // Usuários da equipe (modal). novoUser = form de criação (só admin); resetUser = redefinir senha.
  const [equipe, setEquipe] = useState<EquipeUser[]>([]);
  const [novoUser, setNovoUser] = useState<{ nome: string; senha: string; papel: 'operador' | 'gestor' | 'admin' }>({ nome: '', senha: '', papel: 'operador' });
  const [userErro, setUserErro] = useState('');
  const [resetUser, setResetUser] = useState<{ id: number; nome: string; senha: string } | null>(null);
  // Edição de perfil (permissões) de um operador — hoje: acesso às Contas.
  const [permUser, setPermUser] = useState<{ id: number; nome: string; contas: boolean } | null>(null);
  // Histórico (auditoria) de um bilhete — só gestor/admin abrem.
  const [histModal, setHistModal] = useState<{ id: number; itens: AuditoriaItem[]; carregando: boolean } | null>(null);

  // Status do bot (health da Railway): checa ao abrir e a cada 60s.
  useEffect(() => {
    let vivo = true;
    const checar = () => statusBot().then((s) => { if (vivo) setBot(s); }).catch(() => {});
    checar();
    const t = setInterval(checar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const cliSorted = useMemo(() => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome)), [clientes]);
  // Desconto por cliente — usado para mostrar a odd efetiva (odd − desconto) na tabela.
  const cliDesc = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c.desc])) as Record<number, number>, [clientes]);

  function toast(m: string) { setToastMsg(m); window.clearTimeout((toast as unknown as { _h?: number })._h); (toast as unknown as { _h?: number })._h = window.setTimeout(() => setToastMsg(''), 2600); }
  // `instant` = aplica sem o debounce de 400ms (use nos SELECTS: cliente, status…).
  function setF<K extends keyof typeof filtros>(k: K, v: (typeof filtros)[K], instant = false) { debMs.current = instant ? 0 : 400; setFiltros((f) => ({ ...f, [k]: v })); setPage(1); }
  // Escolher um período (esta semana, hoje, semana passada) mostra a semana INTEIRA:
  // troca pra aba "Todas" (todos os status), senão ficava só nos EM ABERTO da aba
  // Pendentes e parecia que os bilhetes resolvidos tinham sumido. Limpar o período
  // (v vazio) não mexe na aba.
  function applyPeriod(v: string) { debMs.current = 0; const p = periodDates(v); setFiltros((f) => ({ ...f, period: v, dt1: p.d1, dt2: p.d2, ...(v ? { aba: 'todas' as const } : {}) })); setPage(1); }
  function limpar() { debMs.current = 0; setFiltros({ ...filtrosVazios }); setPage(1); }

  useEffect(() => { const t = setTimeout(() => setDebFiltros(filtros), debMs.current); return () => clearTimeout(t); }, [filtros]);

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
    // Ao entrar, mostra a fila pendente INTEIRA (igual ao SSR) — sem filtro de data
    // forçado, pra os bilhetes não sumirem após a hidratação. O período é opcional,
    // aplicado só quando o operador escolhe no filtro.
    listarApostas(params)
      .then((r) => { if (alive) { setRegs(r.rows); setTotal(r.total); setTotals(r.totals); } })
      .catch(() => { if (alive) toast('Erro ao carregar apostas.'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debFiltros, page, reloadKey]);

  // Despesas do MESMO período do filtro — entram na conta do lucro lá em cima.
  // Vêm da aba Despesas (grupo "despesa" do WhatsApp), filtradas por data.
  const [despPeriodo, setDespPeriodo] = useState(0);
  useEffect(() => {
    if (!podeFinanceiro) return;  // operador não vê despesas (fica em 0, o valor inicial)
    let alive = true;
    listarDespesasPeriodo(debFiltros.dt1 || null, debFiltros.dt2 || null)
      .then((d) => { if (alive) setDespPeriodo(d.total); })
      .catch(() => { if (alive) setDespPeriodo(0); });
    return () => { alive = false; };
  }, [debFiltros.dt1, debFiltros.dt2, reloadKey, podeFinanceiro]);

  // Fechamento do período — só usado no Modelo B para o P&L de banca (o cashback é
  // semanal e não está nos totais por bilhete). Traz o `modo` e os totais líquidos.
  // No Modelo A a tela não muda (o bloco de KPIs continua na lógica de comissão).
  const [fechPeriodo, setFechPeriodo] = useState<FechCliResp['g'] | null>(null);
  useEffect(() => {
    if (!podeFinanceiro) return;
    let alive = true;
    fechamentoClientes(debFiltros.dt1 || null, debFiltros.dt2 || null)
      .then((r) => { if (alive) setFechPeriodo(r.g); })
      .catch(() => { if (alive) setFechPeriodo(null); });
    return () => { alive = false; };
  }, [debFiltros.dt1, debFiltros.dt2, reloadKey, podeFinanceiro]);

  // Atualizar/recarregar DESCARTA rascunhos não salvos (status pendente volta ao real).
  const reload = () => { setDrafts({}); setReloadKey((k) => k + 1); };
  const navBtn = 'shrink-0 whitespace-nowrap rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-white/15';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const start = (pageSafe - 1) * PAGE_SIZE;

  const dV = (r: Reg, f: 'dt' | 'odd' | 'val' | 'jogo' | 'st') => {
    const d = drafts[r.id];
    if (d && d[f] !== undefined) return d[f]!;
    // Odd/valor zerados = campo VAZIO (não "0"), pra digitar direto sem ter que apagar o zero.
    if ((f === 'odd' || f === 'val') && Number(r[f]) === 0) return '';
    return String(r[f]);
  };
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
      // Sessão expirada é a causa nº1 (o Next mascara o "Não autenticado"): avisa claro.
      const logado = await sessaoAtiva().catch(() => true);
      if (!logado) alert('⚠️ Sua sessão expirou. Recarregue a página e entre de novo — a alteração foi desfeita, nada foi salvo.');
      else toast('Erro ao salvar — alteração desfeita.');
    }
  }
  function resolverCt(id: number) {
    // RECUSAR a contestação: encerra MANTENDO o status atual (cliente estava errado).
    // OTIMISTA: some da fila na hora; resolve no servidor em segundo plano. Fora da fila,
    // marca como "contestada — recusada" (o registro fica no bilhete).
    if (filtros.aba === 'pend') setRegs((rs) => rs.filter((r) => r.id !== id));
    else setRegs((rs) => rs.map((r) => (r.id === id ? { ...r, ct: false, ctResolvidaEm: r.ctResolvidaEm || 'agora', ctDesfecho: 'recusada' } : r)));
    setTotals((t) => ({ ...t, contestadas_qtd: Math.max(0, (t.contestadas_qtd ?? 1) - 1) }));
    toast('Contestação recusada (status mantido).');
    resolverContestacao(id).catch(() => toast('Erro ao resolver — clique em Atualizar.'));
  }
  // ACEITAR a contestação: aplica o status que o cliente sugeriu. aceitarContestacao muda
  // o status E encerra a contestação (mantendo o registro), e o trigger recalcula o saldo.
  async function aceitarCt(id: number, novoStatus: string) {
    const regsAntes = regs;
    // OTIMISTA: some da fila; grava o status no servidor em seguida.
    if (filtros.aba === 'pend') setRegs((rs) => rs.filter((r) => r.id !== id));
    setTotals((t) => ({ ...t, contestadas_qtd: Math.max(0, (t.contestadas_qtd ?? 1) - 1) }));
    toast(`Contestação aceita — status alterado para ${novoStatus}.`);
    try {
      const rr = await aceitarContestacao(id, novoStatus);
      if (filtros.aba !== 'pend') setRegs((rs) => rs.map((r) => (r.id === id ? rr : r)));
    } catch {
      // DESFAZ: a linha volta para a fila para o operador tentar de novo.
      setRegs(regsAntes);
      setTotals((t) => ({ ...t, contestadas_qtd: (t.contestadas_qtd ?? 0) + 1 }));
      toast('Erro ao aceitar a contestação — clique em Atualizar.');
    }
  }
  // "Salvar" = concluir a aposta: grava o status escolhido + edições, encerra a
  // contestação e tira a aposta da fila do dashboard.
  //
  // A tela é OTIMISTA (a linha some na hora), mas se o servidor recusar a gravação a
  // linha VOLTA e o erro aparece na cara. Antes, a linha sumia mesmo com a gravação
  // falhando e o aviso era um toast discreto: o operador achava que tinha salvo, e a
  // aposta seguia EM ABERTO para o cliente. Dinheiro não pode sumir em silêncio.
  async function saveReg(id: number) {
    const d = drafts[id] || {};
    const reg = regs.find((r) => r.id === id);
    // Status efetivo = rascunho (se o operador selecionou) ou o status atual do banco.
    const statusEfetivo = d.st ?? reg?.st;
    const patch = {
      ...(d.dt !== undefined ? { dt: d.dt } : {}),
      ...(d.odd !== undefined ? { odd: parseNumBR(d.odd) } : {}),
      ...(d.val !== undefined ? { val: parseNumBR(d.val) } : {}),
      ...(d.jogo !== undefined ? { jogo: d.jogo } : {}),
      ...(d.st !== undefined ? { st: d.st } : {}),
    };
    const temEdicao = Object.keys(patch).length > 0;
    const resolvida = !!statusEfetivo && statusEfetivo !== 'EM ABERTO';

    if (filtros.aba === 'pend' && !resolvida) {
      // Ainda EM ABERTO. NÃO conclui (segue na fila), mas se o operador ajustou
      // odd/valor/jogo, isso PRECISA ser salvo — antes o Salvar voltava sem gravar
      // e a edição se perdia ("travava"). Persiste mantendo EM ABERTO e na fila.
      const editouConteudo = d.dt !== undefined || d.odd !== undefined || d.val !== undefined || d.jogo !== undefined;
      if (!editouConteudo) {
        toast('Selecione um status (GREEN, RED…) para concluir — ou ajuste odd/valor e salve.');
        return;
      }
      const draftAntesEd = drafts[id];
      setDrafts((dr) => { const c = { ...dr }; delete c[id]; return c; });
      try {
        const rr = await atualizarAposta(id, patch);
        setRegs((rs) => rs.map((r) => (r.id === id ? rr : r))); // atualiza a linha, sem tirar da fila
        toast(`Aposta #${id} atualizada (segue EM ABERTO).`);
      } catch (e) {
        if (draftAntesEd) setDrafts((dr) => ({ ...dr, [id]: draftAntesEd }));
        const msg = e instanceof Error ? e.message : String(e);
        console.error('saveReg (EM ABERTO) falhou:', e);
        await alertaFalhaSalvar(id, msg, 'A edição foi mantida. Tente de novo.');
      }
      return;
    }

    // Concluir exige odd E entrada. Sem isso a aposta vira lixo: GREEN com valor 0 dá
    // saldo 0 e comissão 0 — foi o que aconteceu com o lote de 15/07. EM ABERTO pode
    // ficar sem preencher (é o estado de espera), mas concluída, não.
    const oddFinal = d.odd !== undefined ? parseNumBR(d.odd) : Number(reg?.odd ?? 0);
    const valFinal = d.val !== undefined ? parseNumBR(d.val) : Number(reg?.val ?? 0);
    if (resolvida && (!(oddFinal > 0) || !(valFinal > 0))) {
      const falta = [!(oddFinal > 0) && 'odd', !(valFinal > 0) && 'entrada'].filter(Boolean).join(' e ');
      toast(`Preencha ${falta} para concluir a aposta #${id} como ${statusEfetivo}.`);
      return; // mantém o rascunho na tela para o operador completar
    }

    // Fotografia do estado, para desfazer se o servidor recusar.
    const regsAntes = regs;
    const draftAntes = drafts[id];

    // OTIMISTA: dá baixa na fila na hora; persiste em seguida.
    if (filtros.aba === 'pend') setRegs((rs) => rs.filter((r) => r.id !== id));
    else setRegs((rs) => rs.map((r) => (r.id === id ? { ...r, ct: false, ctStatus: '', ctMotivo: '' } : r)));
    if (reg?.ct) setTotals((t) => ({ ...t, contestadas_qtd: Math.max(0, (t.contestadas_qtd ?? 1) - 1) }));
    setDrafts((dr) => { const c = { ...dr }; delete c[id]; return c; });

    try {
      if (temEdicao) {
        const rr = await atualizarAposta(id, patch);
        if (filtros.aba !== 'pend') setRegs((rs) => rs.map((r) => (r.id === id ? rr : r)));
      }
      if (reg?.ct) await resolverContestacao(id);
      // Só agora podemos dizer que salvou — o banco confirmou.
      toast(`Aposta #${id} salva ✓${patch.st ? ` (${patch.st})` : ''}`);
    } catch (e) {
      // DESFAZ: a linha volta para a fila com o rascunho intacto, para o operador tentar de novo.
      setRegs(regsAntes);
      if (draftAntes) setDrafts((dr) => ({ ...dr, [id]: draftAntes }));
      if (reg?.ct) setTotals((t) => ({ ...t, contestadas_qtd: (t.contestadas_qtd ?? 0) + 1 }));
      const msg = e instanceof Error ? e.message : String(e);
      console.error('saveReg falhou:', e);
      // alert (e não toast): o operador PRECISA ver que a aposta continua em aberto.
      // O helper checa a sessão (o Next mascara o "Não autenticado" em produção).
      await alertaFalhaSalvar(id, msg, 'A aposta voltou para a fila. Tente salvar novamente.');
    }
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
  async function sair() {
    // Admin sai do Supabase Auth; gestor/operador limpam o cookie da equipe. Faz os dois
    // (quem não tiver um deles, o outro é no-op) e volta pro login.
    try { await createClient().auth.signOut(); } catch { /* admin pode não ter sessão supabase */ }
    try { await sairEquipe(); } catch { /* sem cookie de equipe, tudo bem */ }
    router.replace('/login');
  }
  async function salvarObs() { if (!obsModal) return; const t = obsModal.text.trim(); await patchReg(obsModal.id, { obs: t, adv: t.length > 0 }); setObsModal(null); toast(t ? 'Advertência salva.' : 'Advertência removida.'); }
  async function resolverObs() { if (!obsModal) return; await patchReg(obsModal.id, { adv: false }); setObsModal(null); toast('Advertência resolvida.'); }
  async function salvarJogo() { if (!jogoModal) return; await patchReg(jogoModal.id, { jogo: jogoModal.text }); setJogoModal(null); toast(`Bilhete #${jogoModal.id} atualizado.`); }
  // Abre o editor de data/hora a partir do 'HH:mm DD/MM/AA' exibido (partesTs).
  function abrirDt(r: Reg) {
    const p = partesTs(r.dt); const [dd, mm, aa] = (p.data || '').split('/');
    const date = dd && mm && aa ? `20${aa}-${mm}-${dd}` : '';
    setDtModal({ id: r.id, date, time: p.hora || '' });
  }
  async function salvarDt() {
    if (!dtModal || !dtModal.date || !dtModal.time) { toast('Preencha data e hora.'); return; }
    const [y, m, d] = dtModal.date.split('-');
    const dt = `${dtModal.time} ${d}/${m}/${y.slice(2)}`; // volta ao formato 'HH:mm DD/MM/AA' que o parseTs entende
    await patchReg(dtModal.id, { dt });
    setDtModal(null); toast(`Data/hora da aposta #${dtModal.id} atualizada.`);
  }

  // clientes
  function updCli(id: number, patch: Partial<Cliente>) { setClientes((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))); }
  async function saveCli(id: number) {
    const c = clientes.find((x) => x.id === id); if (!c) return;
    try {
      const res = await atualizarCliente(id, { nome: c.nome, s: c.s, on: c.on, cal: c.cal, desc: c.desc, com: c.com, sup: c.sup, af: c.af, bl: c.bl, link: c.link, grupoLink: c.grupoLink });
      setClientes((cs) => cs.map((x) => (x.id === id ? res.cliente : x))); reload(); toast('Cliente salvo!');
    } catch { toast('Erro ao salvar cliente.'); }
  }
  async function delCli(id: number) {
    const c = clientes.find((x) => x.id === id); if (!c) return;
    if (!confirm(`Excluir o cliente ${c.nome}?\n\nSó é possível excluir clientes SEM apostas no sistema. Se ele tiver histórico, desative-o em vez de excluir.`)) return;
    try {
      const r = await excluirCliente(id);
      if (!r.ok) { alert(r.erro || 'Não foi possível excluir.'); return; }
      setClientes((cs) => cs.filter((x) => x.id !== id));
      toast('Cliente excluído.');
    } catch { toast('Erro ao excluir cliente.'); }
  }
  function novoCliente() { setNovoCli({ open: true, nome: '', senha: '', cal: '', desc: '0.01', com: '6', af: '0', sup: '', bl: false, grupoLink: '' }); }
  async function salvarNovoCliente() {
    if (!novoCli.nome.trim()) { alert('Informe o nome.'); return; }
    try {
      const c = await criarCliente({ nome: novoCli.nome, senha: novoCli.senha, calcao: Number(novoCli.cal) || 0, desconto: Number(novoCli.desc) || 0, comissao: Number(novoCli.com) || 0, comissaoSup: Number(novoCli.af) || 0, sup: novoCli.sup || null, baixaLiquidez: novoCli.bl, grupoLink: novoCli.grupoLink || null });
      setClientes((cs) => [...cs, c].sort((a, b) => a.nome.localeCompare(b.nome))); setNovoCli((s) => ({ ...s, open: false })); toast('Cliente criado!');
    } catch { toast('Erro ao criar cliente.'); }
  }
  // afiliados
  function updAf(id: number, patch: Partial<Afiliado>) { setAfiliados((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a))); }
  async function saveAf(id: number) { const a = afiliados.find((x) => x.id === id); if (!a) return; try { const res = await atualizarAfiliado(id, { nome: a.nome, com: a.com }); setAfiliados((as) => as.map((x) => (x.id === id ? res : x))); toast('Afiliado salvo!'); } catch { toast('Erro ao salvar afiliado.'); } }
  async function delAf(id: number) {
    const a = afiliados.find((x) => x.id === id); if (!a) return;
    if (!confirm(`Excluir o supervisor ${a.nome}?\n\nSó é possível excluir supervisor SEM clientes vinculados.`)) return;
    try {
      const r = await excluirAfiliado(id);
      if (!r.ok) { alert(r.erro || 'Não foi possível excluir.'); return; }
      setAfiliados((as) => as.filter((x) => x.id !== id));
      toast('Supervisor excluído.');
    } catch { toast('Erro ao excluir supervisor.'); }
  }
  function novoAfiliado() { setNovoAf({ open: true, nome: '', com: '0' }); }
  async function salvarNovoAfiliado() { if (!novoAf.nome.trim()) { alert('Informe o nome.'); return; } try { const a = await criarAfiliado(novoAf.nome, Number(novoAf.com) || 0); setAfiliados((as) => [...as, a].sort((x, y) => x.nome.localeCompare(y.nome))); setNovoAf((s) => ({ ...s, open: false })); toast('Afiliado criado!'); } catch { toast('Erro ao criar afiliado.'); } }
  // acertos (pagamentos/recebimentos)
  async function loadAcertos(d1: string, d2: string) {
    setAcertoBusy(true);
    try { setAcertoRes(await listarAcertos(d1, d2)); }
    catch { toast('Erro ao carregar acertos.'); }
    finally { setAcertoBusy(false); }
  }
  async function lancarAcerto(row: AcertoCliente) {
    const draft = acertoLanc[row.clienteId] || { valor: '', obs: '' };
    const v = Number(String(draft.valor).replace(',', '.'));
    if (!v || v <= 0) { toast('Informe um valor maior que zero.'); return; }
    const r = await registrarAcerto(row.clienteId, acertoPer.dt1, acertoPer.dt2, v, draft.obs);
    if (r.ok) {
      setAcertoLanc((s) => ({ ...s, [row.clienteId]: { valor: '', obs: '' } }));
      await loadAcertos(acertoPer.dt1, acertoPer.dt2);
      toast(row.direcao === 'pagar' ? 'Pagamento registrado.' : 'Recebimento registrado.');
    } else toast(r.erro || 'Erro ao registrar.');
  }
  async function removerAcerto(id: number) {
    const r = await excluirAcerto(id);
    if (r.ok) { await loadAcertos(acertoPer.dt1, acertoPer.dt2); toast('Lançamento removido.'); }
    else toast(r.erro || 'Erro ao remover.');
  }
  // fechamento
  function loadFech(d1: string, d2: string) { fechamentoClientes(d1 || null, d2 || null).then(setFechRes).catch(() => toast('Erro no fechamento.')); }
  async function baixarPdfCliente(row: FechCliRow) {
    if (pdfBusy != null) return;
    setPdfBusy(row.id);
    try {
      const bilhetes = await bilhetesCliente(row.id, fech.dt1 || null, fech.dt2 || null);
      gerarPdfFechamento({ banca: MARCA.nome, resumo: row, bilhetes, dt1: fech.dt1, dt2: fech.dt2, desc: cliDesc[row.id] ?? 0, modo: fechData.g.modo });
    } catch { toast('Erro ao gerar o PDF.'); }
    finally { setPdfBusy(null); }
  }
  // PDF de UM afiliado (o admin baixa e envia pra ELE): resumo do afiliado + os
  // clientes dele no mesmo período. Os clientes vêm do fechamento por cliente,
  // filtrados por supervisor (o vínculo cliente→supervisor está no cadastro).
  async function baixarPdfAfiliado(row: FechAfRow) {
    if (pdfAfBusy != null) return;
    setPdfAfBusy(row.sup);
    try {
      const fc = await fechamentoClientes(faf.dt1 || null, faf.dt2 || null);
      const ids = new Set(clientes.filter((c) => c.sup === row.sup).map((c) => c.id));
      const clientesDoAf = fc.rows.filter((r) => ids.has(r.id));
      gerarPdfFechamentoAfiliado({ banca: MARCA.nome, afiliado: row, clientes: clientesDoAf, dt1: faf.dt1, dt2: faf.dt2 });
    } catch { toast('Erro ao gerar o PDF.'); }
    finally { setPdfAfBusy(null); }
  }
  // PDF do fechamento GERAL (o que os sócios imprimem). As despesas vêm do MESMO
  // período do fechamento — se o período mudar, o lucro muda junto.
  const [pdfGeralBusy, setPdfGeralBusy] = useState(false);
  async function baixarPdfGeral() {
    setPdfGeralBusy(true);
    try {
      const desp = await listarDespesasPeriodo(fech.dt1 || null, fech.dt2 || null);
      gerarPdfFechamentoGeral({ banca: MARCA.nome, g: fechData.g, rows: fechData.rows, despesas: desp.total, dt1: fech.dt1, dt2: fech.dt2 });
    } catch { toast('Erro ao gerar o PDF.'); }
    finally { setPdfGeralBusy(false); }
  }
  // ── Envio do PDF de fechamento no grupo do cliente (o bot é quem manda). Só admin. ──
  const [legendaEnvio, setLegendaEnvio] = useState(
`Olá, tudo bem?

Segue o seu relatório de fechamento semanal. 📊

Nota: Se precisar de alguma correção ou ajuste nos dados, pedimos a gentileza de solicitar a alteração através do nosso app ou site. 📱💻

Agradecemos desde já pela confiança em nosso trabalho. 🙏

Atenciosamente,
${MARCA.equipe}`);
  const [envRow, setEnvRow] = useState<number | null>(null);
  const [enviandoTodos, setEnviandoTodos] = useState(false);
  // Acompanhamento da ENTREGA por cliente: id do pedido na fila + status que o bot
  // atualiza (pendente → enviado/erro). O painel faz poll enquanto houver pendente.
  const [envioSt, setEnvioSt] = useState<Record<number, { id: number; status: 'pendente' | 'enviado' | 'erro'; erro?: string }>>({});
  function periodoTexto() {
    const br = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${m[3]}/${m[2]}` : d; };
    return fech.dt1 && fech.dt2 ? `${br(fech.dt1)} a ${br(fech.dt2)}` : 'período selecionado';
  }
  function blobParaBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = () => reject(new Error('leitura do PDF falhou'));
      fr.readAsDataURL(blob);
    });
  }
  async function montarEnvio(row: FechCliRow): Promise<{ ok: boolean; erro?: string; id?: number }> {
    const cli = clientes.find((c) => c.id === row.id);
    const grupoId = cli?.grupoId || '';
    if (!grupoId) return { ok: false, erro: `${row.nome}: sem grupo vinculado.` };
    const bilhetes = await bilhetesCliente(row.id, fech.dt1 || null, fech.dt2 || null);
    const { blob } = gerarPdfFechamento({ banca: MARCA.nome, resumo: row, bilhetes, dt1: fech.dt1, dt2: fech.dt2, desc: cliDesc[row.id] ?? 0, modo: fechData.g.modo }, false);
    const pdfBase64 = await blobParaBase64(blob);
    const legenda = legendaEnvio.replace('{período}', periodoTexto());
    return enfileirarEnvioPdf({ grupoId, clienteNome: row.nome, pdfBase64, legenda });
  }
  async function enviarPdfUm(row: FechCliRow) {
    if (envRow != null || enviandoTodos) return;
    setEnvRow(row.id);
    try {
      const r = await montarEnvio(row);
      if (r.ok && r.id) { setEnvioSt((s) => ({ ...s, [row.id]: { id: r.id!, status: 'pendente' } })); toast(`📤 ${row.nome}: na fila do bot.`); }
      else toast(r.erro || 'Erro ao enviar.');
    } catch { toast('Erro ao enviar.'); }
    finally { setEnvRow(null); }
  }
  async function enviarPdfTodos() {
    if (enviandoTodos || envRow != null) return;
    if (!confirm(`Enviar o PDF do fechamento para TODOS os clientes com grupo? O bot manda espaçado — cerca de 30 segundos entre um cliente e o próximo.`)) return;
    setEnviandoTodos(true);
    let ok = 0; let semGrupo = 0; let erros = 0;
    for (const row of fechData.rows) {
      const cli = clientes.find((c) => c.id === row.id);
      if (!cli?.grupoId) { semGrupo++; continue; }
      try {
        const r = await montarEnvio(row);
        if (r.ok && r.id) { ok++; setEnvioSt((s) => ({ ...s, [row.id]: { id: r.id!, status: 'pendente' } })); }
        else erros++;
      } catch { erros++; }
      await new Promise((res) => setTimeout(res, 400));
    }
    setEnviandoTodos(false);
    toast(`📤 Enfileirados ${ok}. Sem grupo: ${semGrupo}. Erros: ${erros}. O bot envia 1 a cada ~30s — acompanhe o status na linha de cada cliente.`);
  }
  // Poll da entrega: enquanto houver algum envio pendente, pergunta ao servidor o
  // status e atualiza o selo (pendente → enviado/erro). Para sozinho quando resolve.
  useEffect(() => {
    const pendentes = Object.values(envioSt).filter((e) => e.status === 'pendente').map((e) => e.id);
    if (!pendentes.length) return;
    const t = setInterval(async () => {
      try {
        const res = await statusEnviosPdf(pendentes);
        if (!res.length) return;
        setEnvioSt((s) => {
          const n = { ...s };
          for (const r of res) {
            const cliId = Object.keys(n).find((k) => n[Number(k)].id === r.id);
            if (cliId != null) n[Number(cliId)] = { id: r.id, status: r.status, erro: r.erro || undefined };
          }
          return n;
        });
      } catch { /* silencioso — tenta de novo no próximo tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [envioSt]);
  function loadFaf(d1: string, d2: string) { fechamentoAfiliados(d1 || null, d2 || null).then(setFafRes).catch(() => toast('Erro no fechamento.')); }
  function loadPlano() { lerPlano().then(setPlano).catch(() => toast('Erro ao carregar o plano.')); }
  function carregarEquipe() { listarEquipe().then(setEquipe).catch(() => toast('Erro ao carregar usuários.')); }
  useEffect(() => {
    if (modal === 'fech') loadFech(fech.dt1, fech.dt2);
    if (modal === 'faf') loadFaf(faf.dt1, faf.dt2);
    if (modal === 'plano') loadPlano();
    if (modal === 'acertos') loadAcertos(acertoPer.dt1, acertoPer.dt2);
    if (modal === 'usuarios') carregarEquipe();  // reset do form fica no onClick do botão (evita setState no effect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  // ── Usuários da equipe ──
  async function criarUsuario() {
    const r = await criarEquipe(novoUser.nome.trim(), novoUser.senha, novoUser.papel);
    if (r.ok) { setNovoUser({ nome: '', senha: '', papel: 'operador' }); setUserErro(''); carregarEquipe(); toast('Usuário criado.'); }
    else setUserErro(r.erro || 'Erro ao criar.');
  }
  async function salvarResetSenha() {
    if (!resetUser) return;
    const r = await resetarSenhaEquipe(resetUser.id, resetUser.senha);
    if (r.ok) { setResetUser(null); toast(`Senha de ${resetUser.nome} redefinida.`); }
    else toast(r.erro || 'Erro ao redefinir.');
  }
  async function salvarMinhaSenha() {
    const { atual, nova, conf } = minhaSenha;
    if (nova !== conf) { setMinhaSenha((s) => ({ ...s, erro: 'A confirmação não bate com a nova senha.' })); return; }
    const r = await alterarMinhaSenha(atual, nova);
    if (r.ok) { setMinhaSenha({ atual: '', nova: '', conf: '', erro: '', ok: true }); toast('Senha alterada!'); setTimeout(() => setModal(null), 900); }
    else setMinhaSenha((s) => ({ ...s, erro: r.erro || 'Erro ao trocar a senha.', ok: false }));
  }
  async function alternarAtivoUsuario(u: EquipeUser) {
    setEquipe((es) => es.map((x) => (x.id === u.id ? { ...x, ativo: !u.ativo } : x))); // otimista
    try { await definirAtivoEquipe(u.id, !u.ativo); } catch { carregarEquipe(); toast('Erro ao atualizar.'); }
  }
  async function salvarPermissoes() {
    if (!permUser) return;
    const alvo = permUser;
    setEquipe((es) => es.map((x) => (x.id === alvo.id ? { ...x, permissoes: { ...x.permissoes, contas: alvo.contas } } : x))); // otimista
    setPermUser(null);
    const r = await atualizarPermissoesEquipe(alvo.id, { contas: alvo.contas });
    if (r.ok) toast(`Perfil de ${alvo.nome} atualizado.`);
    else { carregarEquipe(); toast(r.erro || 'Erro ao salvar o perfil.'); }
  }
  function abrirHistorico(id: number) {
    setHistModal({ id, itens: [], carregando: true });
    historicoAposta(id)
      .then((itens) => setHistModal({ id, itens, carregando: false }))
      .catch(() => { setHistModal(null); toast('Erro ao carregar o histórico.'); });
  }
  const fechData = fechRes ?? { rows: [], g: { cal: 0, saldoCal: 0, val: 0, ab: 0, sb: 0, cm: 0, caf: 0, sl: 0 } };
  const fafData = fafRes ?? { rows: [], g: { logins: 0, val: 0, ab: 0, sb: 0, cm: 0, caf: 0, sl: 0 } };

  return (
    <div className={dark ? 'dark' : ''}>
      <style>{`@keyframes pbAlertPulse{0%,100%{border-color:#ef4444}50%{border-color:#fecaca}} tr.pb-alert>td{border-width:2px;animation:pbAlertPulse 1.1s ease-in-out infinite} @keyframes pbFlash{0%{background-color:rgba(34,197,94,.45)}100%{background-color:transparent}} tr.pb-flash>td{animation:pbFlash 1.6s ease-out}

/* A lista aberta de um <select> nativo é desenhada pelo sistema, e ele pinta o item
   selecionado com o azul do navegador POR CIMA da cor do status — foi por isso que
   mexer no background da <option> não adiantou. appearance:base-select traz a lista
   para o DOM, e aí o CSS manda. Navegador sem suporte ignora a regra e cai no select
   nativo de sempre (o pior caso é voltar a ver o azul, nada quebra). */
.pb-st, .pb-st::picker(select){appearance:base-select}
.pb-st::picker(select){border:1px solid #e2e8f0;border-radius:12px;padding:4px;background:#fff;box-shadow:0 12px 34px rgba(0,0,0,.18)}
.dark .pb-st::picker(select){background:#0f172a;border-color:#334155}
.pb-st option{border-radius:999px;margin:2px;padding:4px 10px;font-size:12px;font-weight:600}
.pb-st option:checked{font-weight:800}
`}</style>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {/* TOPBAR */}
        {/* min-w-0 + nav rolável: no celular os 9 itens não cabem numa linha. Sem isto
            eles esticavam a página, criavam rolagem lateral e apareciam as bordas pretas. */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b-2 border-marca-500 bg-slate-900 px-3 sm:px-4">
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-marca-500/20 text-marca-400">★</div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-marca-400">{MARCA.nome}</div>
              <div className="text-[11px] text-slate-400">Controle</div>
            </div>
            {(() => {
              if (!bot) return <span className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300">🤖 verificando…</span>;
              if (bot.ok && bot.pronto) return <span title="Bot conectado ao WhatsApp" className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-300">🟢 Bot online</span>;
              const label = bot.ok ? '🟡 Bot sem WhatsApp' : '🔴 Bot offline';
              const cls = bot.ok ? 'border-marca-400/50 bg-marca-500/15 text-marca-200' : 'border-rose-500/50 bg-rose-500/20 text-rose-200';
              const tip = bot.ok ? 'WhatsApp desconectado — clique para abrir o QR e reparear o bot' : 'Bot fora do ar — clique para abrir a página de QR/health';
              return <a href={MARCA.botUrl} target="_blank" rel="noopener noreferrer" title={tip} className={`animate-pulse rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${cls}`}>{label} — reconectar →</a>;
            })()}
          </div>
          {/* SEM justify-end e SEM flex-1: com eles, o que transborda vai para a ESQUERDA
              e o navegador nem trata como rolável (scrollWidth = clientWidth) — a barra
              trava e os botões do começo somem. O justify-between do header já joga este
              bloco para a direita. */}
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {podeFinanceiro && (
              <>
                <button onClick={() => setModal('cli')} className={navBtn}>👤 Clientes</button>
                <button onClick={() => setModal('af')} className={navBtn}>🤝 Afiliados</button>
                <button onClick={() => setModal('fech')} className={navBtn}>📊 Fechamento</button>
                {ehAdmin && <button onClick={() => setModal('acertos')} className={navBtn} title="Controle de pagamentos e recebimentos dos clientes">💰 Acertos</button>}
                <button onClick={() => setModal('faf')} className={navBtn}>📈 Fech. afiliado</button>
                <button onClick={() => setModal('plano')} className={navBtn} title="Plano e cota de transcrições da banca">📦 Plano</button>
              </>
            )}
            {/* Contas: financeiro sempre; operador só se o admin ligou a permissão no perfil dele. */}
            {contasLiberado && (
              <a href="/admin/contas" className={navBtn} title="Contas usadas para replicar as apostas">💳 Contas</a>
            )}
            {/* Conferência: todos (inclusive operador) — é o que ele usa p/ organizar os grupos. */}
            <a href="/admin/conferencia" className={navBtn} title="Conferência de grupos (imagens recebidas × transcritas)">🗂 Conferência</a>
            {podeFinanceiro && (
              <a href="/admin/despesas" className={navBtn} title="Despesas (lançadas pelo grupo despesa)">💸 Despesas</a>
            )}
            {podeFinanceiro && (
              <button onClick={() => { setNovoUser({ nome: '', senha: '', papel: 'operador' }); setUserErro(''); setResetUser(null); setModal('usuarios'); }} className={navBtn} title="Usuários da equipe (operador/gestor)">👥 Usuários</button>
            )}
            {ehAdmin && (
              <a href="/admin/seguranca" className={navBtn} title="2FA e histórico de acessos">🔐 Segurança</a>
            )}
            {demo && ehAdmin && (
              <button
                onClick={async () => {
                  if (!confirm('Restaurar a demo aos dados de exemplo? Isso apaga o estado atual e recarrega os bilhetes/clientes de amostra.')) return;
                  const r = await restaurarDemo();
                  if (r.ok) { toast('Demo restaurada.'); setTimeout(() => location.reload(), 400); }
                  else toast(r.erro || 'Não foi possível restaurar.');
                }}
                className={navBtn}
                title="Zera e recarrega os dados de exemplo da demonstração"
              >♻ Restaurar demo</button>
            )}
            {demo && ehAdmin && (
              <button
                onClick={async () => {
                  const r = await alternarModeloDemo();
                  if (r.ok) {
                    toast(r.modo === 'cashback_perda' ? 'Modelo B — cashback sobre a perda da semana' : 'Modelo A — comissão sobre o ganho');
                    setTimeout(() => location.reload(), 500);
                  } else toast(r.erro || 'Não foi possível alternar o modelo.');
                }}
                className={navBtn}
                title="Alterna a casa entre Modelo A (comissão sobre ganho) e Modelo B (cashback sobre perda) — só na demo"
              >⇄ Modelo A/B</button>
            )}
            <button onClick={toggleTheme} title="Tema" className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 transition hover:bg-white/15">{dark ? '☀' : '🌙'}</button>
            {/* O e-mail saiu do corpo da tela (ocupava espaço e o topo já diz onde você
                está). Fica aqui no título: passe o mouse para ver a conta logada. */}
            <button onClick={() => { setMinhaSenha({ atual: '', nova: '', conf: '', erro: '', ok: false }); setModal('minhaSenha'); }} title="Trocar a minha senha" className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 transition hover:bg-white/15">🔑 Minha senha</button>
            <button onClick={sair} title={`Sair — logado como ${email}${papel !== 'master' ? ` · ${papel}` : ''}`} className="shrink-0 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30">Sair</button>
          </div>
        </header>

        <main className="w-full px-4 py-5 sm:px-6">

          {/* RESUMO DO PERÍODO — o lucro é o número que importa, então ele manda na tela.
              O resto é o caminho até ele: o que entrou, o que a banca ganhou, o que saiu. */}
          {(() => {
            // Os cartões descrevem EXATAMENTE o que está filtrado na tela.
            // As DESPESAS são da banca inteira — não pertencem a um cliente nem a um
            // recorte de apostas. Subtrair elas de um filtro produzia número sem
            // sentido (KAUAN gerou R$ 134 de comissão e o "lucro" aparecia −R$ 10 mil).
            // Então: com filtro estreito, despesa sai da conta e o cartão diz isso.
            const f = debFiltros;
            const cliFiltrado = f.nome ? clientes.find((c) => c.id === Number(f.nome)) : null;
            const recorte = !!(f.id || f.nome || f.st || f.jogo || f.dc || f.oddMin || f.oddMax
              || f.valMin || f.valMax || f.bl || f.adv || f.irr || f.aba === 'pend');
            // Modelo B (cashback sobre perda): a casa banca. Resultado de banca = o que
            // fica dos jogadores (= − saldo líquido deles, já com o cashback). Vem do
            // fechamento do período (o cashback é semanal, não está nos totais por bilhete).
            const cbMode = fechPeriodo?.modo === 'cashback_perda';
            const gsl = Number(fechPeriodo?.sl ?? 0);       // resultado líquido dos jogadores (c/ cashback)
            const gcb = Number(fechPeriodo?.cm ?? 0);       // cashback devolvido no período
            const resultadoBanca = -gsl;                    // o que fica pra casa
            const lucro = cbMode
              ? resultadoBanca - (recorte ? 0 : despPeriodo)
              : totals.comissao - totals.comissao_afiliado - (recorte ? 0 : despPeriodo);
            const rotuloLucro = cliFiltrado ? `lucro gerado por ${cliFiltrado.nome}`
              : recorte ? 'lucro do filtro (sem despesas)'
                : 'lucro do período';
            return (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Kpi icone="⇄" cor="blue" titulo="Entrada" valor={tot(totals.entradas)} valorCls={entCls(totals.entradas)} sub={`${total} linhas`} />
                <Kpi icone="🕐" cor="violet" titulo="Em aberto" valor={tot(totals.em_aberto_total)} valorCls={abertoCls(totals.em_aberto_total)} sub={`${totals.em_aberto_qtd} linhas`} />
                {/* Financeiro da banca — só gestor/admin. Operador vê só Entrada e Em aberto. */}
                {podeFinanceiro && !cbMode && (
                  <>
                    <Kpi icone="📈" cor="slate" titulo="Saldo bruto" valor={tot(totals.saldo_bruto)} valorCls={clrCls(totals.saldo_bruto)} sub="ganho/perda dos bilhetes" />
                    <Kpi icone="✓" cor="emerald" titulo="Saldo líquido" valor={tot(totals.saldo_liquido)} valorCls={clrCls(totals.saldo_liquido)} sub="resultado dos clientes"
                         dica="Quanto os clientes ficaram no período, depois da comissão. Positivo = os clientes ganharam. É o dinheiro deles, não o lucro da banca." />
                    <Kpi icone="%" cor="rose" titulo="Comissão" valor={tot(totals.comissao)} valorCls={comCls(totals.comissao)} sub="receita da banca" />
                    <Kpi icone="🤝" cor="rose" titulo="Com. afiliados" valor={tot(totals.comissao_afiliado)} valorCls={comCls(totals.comissao_afiliado)} sub="custo da banca" />
                    <Kpi icone="💸" cor="rose" titulo="Despesas" href="/admin/despesas"
                         valor={recorte ? '—' : tot(despPeriodo)} valorCls={recorte ? 'text-slate-300 dark:text-slate-600' : comCls(despPeriodo)}
                         sub={recorte ? 'não se aplica ao filtro 🔗' : 'do período 🔗'}
                         dica={recorte ? 'As despesas são da banca inteira — não pertencem a um cliente nem a um filtro de apostas. Limpe os filtros e use a aba "Todas" para ver o lucro do período.' : 'Despesas do período (vêm do grupo de despesa no WhatsApp). Clique para ver a lista.'} />
                    <Kpi icone="★" cor="destaque" titulo="Resumo total" valor={tot(lucro)} valorCls={clrCls(lucro)} sub={rotuloLucro}
                         dica={recorte
                           ? 'Comissão ganha − Comissão dos afiliados, apenas do que está filtrado. As despesas são da banca inteira e por isso ficam de fora aqui.'
                           : 'Lucro = Comissão ganha − Comissão dos afiliados − Despesas do período. A banca só ganha comissão em bilhete GREEN.'} />
                  </>
                )}
                {/* Modelo B: a casa BANCA — o P&L é de banca, e é um conceito de PERÍODO
                    (o cashback é semanal). Por isso os cartões de banca degradam p/ "—"
                    quando há filtro estreito (recorte), igual as despesas. */}
                {podeFinanceiro && cbMode && (
                  <>
                    <Kpi icone="📈" cor="slate" titulo="Saldo bruto" valor={tot(totals.saldo_bruto)} valorCls={clrCls(totals.saldo_bruto)} sub="ganho/perda dos bilhetes" />
                    <Kpi icone="✓" cor="emerald" titulo="Resultado dos jogadores" valor={recorte ? '—' : tot(gsl)} valorCls={recorte ? 'text-slate-300 dark:text-slate-600' : clrCls(gsl)} sub={recorte ? 'período (limpe o filtro)' : 'já com o cashback'}
                         dica="Quanto os jogadores ficaram no período, já com o cashback devolvido. Positivo = os jogadores ganharam. É o dinheiro deles, não o lucro da casa." />
                    <Kpi icone="🏦" cor="rose" titulo="Resultado de banca" valor={recorte ? '—' : tot(resultadoBanca)} valorCls={recorte ? 'text-slate-300 dark:text-slate-600' : clrCls(resultadoBanca)} sub={recorte ? 'não se aplica ao filtro' : 'o que fica dos jogadores'}
                         dica="A casa banca o jogo: ganha o que os jogadores perdem e paga o que ganham. Já líquido do cashback devolvido." />
                    <Kpi icone="↩" cor="rose" titulo="Cashback devolvido" valor={recorte ? '—' : tot(gcb)} valorCls={recorte ? 'text-slate-300 dark:text-slate-600' : comCls(gcb)} sub={recorte ? 'período' : 'custo (já no resultado)'} />
                    <Kpi icone="💸" cor="rose" titulo="Despesas" href="/admin/despesas"
                         valor={recorte ? '—' : tot(despPeriodo)} valorCls={recorte ? 'text-slate-300 dark:text-slate-600' : comCls(despPeriodo)}
                         sub={recorte ? 'não se aplica ao filtro 🔗' : 'do período 🔗'}
                         dica={recorte ? 'As despesas são da banca inteira — não pertencem a um filtro de apostas. Limpe os filtros para ver o lucro do período.' : 'Despesas do período (vêm do grupo de despesa no WhatsApp). Clique para ver a lista.'} />
                    <Kpi icone="★" cor="destaque" titulo="Resumo total" valor={recorte ? '—' : tot(lucro)} valorCls={recorte ? 'text-slate-300 dark:text-slate-600' : clrCls(lucro)} sub={recorte ? 'lucro do período (limpe o filtro)' : 'lucro do período'}
                         dica="Lucro = Resultado de banca − Despesas do período. A casa lucra com quem perde (menos o cashback) e paga quem ganha." />
                  </>
                )}
              </div>
            );
          })()}

          {/* ABAS: fila pendente x histórico completo */}
          <div className="mb-3 flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            {([['pend', 'Pendentes'], ['todas', 'Todas']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setF('aba', k, true)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  filtros.aba === k
                    ? 'bg-marca-500 text-white shadow-sm'
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
              {filtros.aba === 'pend' ? 'contestadas no topo · EM ABERTO + contestadas do período (limpe as datas para ver todas)' : 'histórico do período'}
            </span>
          </div>

          {/* FILTROS */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div><span className={lbl}>Cliente</span>
                <select className={inp} value={filtros.nome} onChange={(e) => setF('nome', e.target.value, true)}>
                  <option value="">Todos</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div><span className={lbl}>Status</span>
                <select className={inp} value={filtros.st} onChange={(e) => setF('st', e.target.value, true)}>
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
                <select className={inp} value={filtros.ord} onChange={(e) => setF('ord', e.target.value, true)}>
                  <option value="data_desc">data ↓</option><option value="data_asc">data ↑</option><option value="val_desc">entradas ↓</option><option value="val_asc">entradas ↑</option>
                </select>
              </div>
              <div><span className={lbl}>ID</span><input className={inp} value={filtros.id} onChange={(e) => setF('id', e.target.value)} placeholder="ex: 10" /></div>
              <div><span className={lbl}>Odd mín</span><input type="number" step="0.01" className={inp} value={filtros.oddMin} onChange={(e) => setF('oddMin', e.target.value)} /></div>
              <div><span className={lbl}>Odd máx</span><input type="number" step="0.01" className={inp} value={filtros.oddMax} onChange={(e) => setF('oddMax', e.target.value)} /></div>
              <div><span className={lbl}>Entradas mín</span><input type="number" className={inp} value={filtros.valMin} onChange={(e) => setF('valMin', e.target.value)} /></div>
              <div><span className={lbl}>Entradas máx</span><input type="number" className={inp} value={filtros.valMax} onChange={(e) => setF('valMax', e.target.value)} /></div>
              <div><span className={lbl}>Baixa liquidez</span><select className={inp} value={filtros.bl} onChange={(e) => setF('bl', e.target.value, true)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
              <div><span className={lbl}>Advertido</span><select className={inp} value={filtros.adv} onChange={(e) => setF('adv', e.target.value, true)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
              <div><span className={lbl}>Irregular</span><select className={inp} value={filtros.irr} onChange={(e) => setF('irr', e.target.value, true)}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button onClick={limpar} title="Limpar todos os filtros" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">🗑️ Limpar</button>
              <button onClick={() => { reload(); toast('Lista atualizada.'); }} title="Recarregar a lista (descarta rascunhos não salvos)" className="inline-flex items-center gap-1.5 rounded-lg border border-marca-300 bg-marca-50 px-3 py-1.5 text-sm font-medium text-marca-700 transition hover:border-marca-400 hover:bg-marca-100 dark:border-marca-500/40 dark:bg-marca-500/10 dark:text-marca-300 dark:hover:bg-marca-500/20">🔄 Atualizar</button>
            </div>
          </div>

          {/* Paginação TOPO (espelha a de baixo) — evita rolar até o fim da tabela só pra virar a página. */}
          <div className="mb-2 mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">{total} aposta(s) · página {pageSafe}/{totalPages} · exibindo {total ? start + 1 : 0}–{start + regs.length}</span>
            <div className="flex gap-2">
              <button disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:enabled:hover:bg-slate-800">Anterior</button>
              <button disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm transition enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:enabled:hover:bg-slate-800">Próxima</button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-slate-200 [&_th]:border [&_th]:border-slate-200 dark:[&_td]:border-slate-700 dark:[&_th]:border-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-2 py-2 font-medium">id</th><th className="px-2 py-2 font-medium">data</th>
                    <th className="px-2 py-2 font-medium">nome</th><th className="px-2 py-2 font-medium">jogo</th>
                    <th className="px-2 py-2 text-center font-medium">odd</th><th className="px-2 py-2 text-center font-medium">entradas</th>
                    <th className="px-2 py-2 text-center font-medium">status</th>
                    {podeFinanceiro && (<><th className="px-2 py-2 text-center font-medium">s. bruto</th><th className="px-2 py-2 text-center font-medium">comissão</th></>)}
                    <th className="px-2 py-2 text-center font-medium">baixa liq.</th>
                    {podeFinanceiro && (<th className="px-2 py-2 text-center font-medium">saldo líq.</th>)}
                    <th className="px-2 py-2 text-center font-medium">ações</th>
                  </tr>
                </thead>
                <tbody>
                  {regs.map((r) => {
                    const inc = !(Number(r.odd) > 0) || !(Number(r.val) > 0);
                    return (
                      <tr key={r.id} className={`border-b border-slate-100 align-middle transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40 ${inc ? 'pb-alert bg-rose-50/60 dark:bg-rose-500/5' : ''} ${flashId === r.id ? 'pb-flash' : ''}`}>
                        <td className="px-2 py-1.5 font-medium text-slate-500">
                          <div>{r.id}</div>
                          {podeFinanceiro && (
                            <button onClick={() => abrirHistorico(r.id)} title="Histórico de alterações (quem mexeu no bilhete)" className="mt-0.5 rounded px-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">🕘</button>
                          )}
                        </td>
                        {/* Hora em cima, data embaixo: a hora é o que identifica o
                            print no grupo, e empilhado a coluna deixa de esticar. */}
                        <td className="whitespace-nowrap px-2 py-1.5 text-xs leading-tight text-slate-500">
                          <div className="group/dt relative pr-5">
                            {(() => { const p = partesTs(r.dt); return (<>
                              <div className="font-medium text-slate-700 dark:text-slate-300">{p.hora}</div>
                              <div className="text-[11px] text-slate-400">{p.data}</div>
                            </>); })()}
                            {/* Lápis: corrige data/hora (ex.: print reenviado noutro dia). */}
                            <button onClick={() => abrirDt(r)} title="Editar data e hora" className="absolute right-0 top-0 rounded p-1 text-slate-300 transition hover:bg-marca-50 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-marca-500/10 dark:hover:text-marca-400">✏️</button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={String(r.cId)} onChange={(e) => patchReg(r.id, { cId: Number(e.target.value) })} className={`${cinp} w-36 font-mono text-[11px] font-medium`}>{cliSorted.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                          {inc && <span className="ml-1 inline-block rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">preencher</span>}
                        </td>
                        {/* Fonte monoespaçada (como no JM): alinha as linhas do bilhete e
                            deixa números/odds na mesma largura — muito mais fácil de conferir. */}
                        <td className="px-2 py-1.5"><div className="relative max-w-[340px] pr-6 font-mono text-[11px] leading-snug">
                          {/* Lápis: edita o texto do bilhete (corrige time/handicap que a IA não pegou). */}
                          <button onClick={() => setJogoModal({ id: r.id, text: r.jogo })} title="Editar o texto do bilhete" className="absolute right-0 top-0 rounded p-1 text-slate-300 transition hover:bg-marca-50 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-marca-500/10 dark:hover:text-marca-400">✏️</button>
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
                          {/* Registro PERMANENTE: já foi contestada e resolvida (selo fica no bilhete). */}
                          {(() => { const c = statusContestacao(r); return c.resolvida && (
                            <span
                              title={`Contestação ${c.desfecho}${c.quando && c.quando !== 'agora' ? ` em ${c.quando}` : ''}${r.ctStatus ? ` · cliente sugeriu ${r.ctStatus}` : ''}${r.ctMotivo ? ` · motivo: ${r.ctMotivo}` : ''}`}
                              className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.desfecho === 'aceita' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                            >
                              🏷️ contestada · {c.desfecho}
                            </span>
                          ); })()}
                          {renderJogo(r.jogo)}
                        </div></td>
                        <td className="px-2 py-1.5 text-center">
                          <NumInput kind="odd" desc={cliDesc[r.cId] ?? 0} value={dV(r, 'odd')} onChange={(v) => updDraft(r.id, 'odd', v)} cls={`${cinp} w-16 text-center ${edited(r, 'odd') ? 'border-marca-400' : ''}`} />
                        </td>
                        <td className="px-2 py-1.5 text-center"><NumInput kind="money" value={dV(r, 'val')} onChange={(v) => updDraft(r.id, 'val', v)} cls={`${cinp} w-20 text-center font-medium ${edited(r, 'val') ? 'border-marca-400' : ''}`} /></td>
                        <td className="px-2 py-1.5 text-center">
                          {(() => { const stv = dV(r, 'st'); const pend = edited(r, 'st'); return (
                            <select value={stv} onChange={(e) => updDraft(r.id, 'st', e.target.value)} title={pend ? 'Status não salvo — clique em Salvar para confirmar' : undefined} style={{ backgroundColor: stStyle(stv).bg, color: stStyle(stv).fg, boxShadow: pend ? '0 0 0 2px #f59e0b' : undefined }} className="pb-st rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none cursor-pointer">{STS.map((s) => <option key={s} value={s} style={{ backgroundColor: stStyle(s).bg, color: stStyle(s).fg }}>{s}</option>)}</select>
                          ); })()}
                        </td>
                        {podeFinanceiro && (<>
                        <td className={`px-2 py-1.5 text-center tabular-nums ${clrCls(r.sb)}`}>{fmt(r.sb)}</td>
                        <td className={`px-2 py-1.5 text-center tabular-nums ${comCls(r.cm)}`}>{fmt(r.cm)}</td>
                        </>)}
                        <td className="px-2 py-1.5 text-center"><select value={r.bl ? 'Sim' : 'Não'} onChange={(e) => patchReg(r.id, { bl: e.target.value === 'Sim' })} className={`${cinp} w-16`}><option>Não</option><option>Sim</option></select></td>
                        {podeFinanceiro && (<td className={`px-2 py-1.5 text-center font-semibold tabular-nums ${clrCls(r.sl)}`}>{fmt(r.sl)}</td>)}
                        <td className="px-2 py-1.5">
                          <div className="flex justify-center gap-1.5">
                            {r.ct ? (
                              // Bilhete em contestação: só o necessário — Aceitar (aplica o status
                              // sugerido) e Recusar (mantém o status). Nada de Salvar/Excluir aqui.
                              <>
                                {r.ctStatus && r.ctStatus !== r.st && (
                                  <button onClick={() => aceitarCt(r.id, r.ctStatus)} title={`Aceitar: mudar o status para ${r.ctStatus} e recalcular o saldo`} className="rounded-md border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25">✓ Aceitar {r.ctStatus}</button>
                                )}
                                <button onClick={() => resolverCt(r.id)} title="Recusar a contestação: encerrar mantendo o status atual" className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">Recusar</button>
                              </>
                            ) : (
                              // Bilhete normal: fluxo de sempre.
                              <>
                                {r.adv && <button onClick={() => setObsModal({ id: r.id, text: r.obs })} title={`Advertência: ${r.obs}`} className="rounded-lg bg-rose-600 px-2 py-1 text-xs text-white transition hover:bg-rose-700">⚠</button>}
                                {/* Botões como no JM: fundo colorido CLARO + borda e texto escuros na mesma cor. */}
                                <button onClick={() => saveReg(r.id)} className={`rounded-md border px-3 py-1 text-xs font-semibold transition ${drafts[r.id]?._saved ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-blue-300 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-200 dark:hover:bg-blue-500/25'}`}>{drafts[r.id]?._saved ? '✓' : 'Salvar'}</button>
                                <button onClick={() => delReg(r.id)} className="rounded-md border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-200 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25">Excluir</button>
                              </>
                            )}
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
            {(() => {
              // "Cadastrado" não é "funcionando": sem grupo vinculado os bilhetes não entram.
              // Cliente INATIVO sem grupo é esperado — não conta como problema.
              const ativos = clientes.filter((c) => c.on);
              const lendo = ativos.filter((c) => c.grupoId).length;
              const vinculando = ativos.filter((c) => !c.grupoId && c.grupoLink).length;
              const fora = ativos.filter((c) => !c.grupoId && !c.grupoLink).length;
              const inativos = clientes.length - ativos.length;
              return (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 font-semibold text-[#DAA520]">{ativos.length} clientes ativos</span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">🟢 {lendo} sendo lidos</span>
                  {vinculando > 0 && <span className="rounded-full bg-marca-100 px-2.5 py-1 font-semibold text-marca-700 dark:bg-marca-500/15 dark:text-marca-300">⏳ {vinculando} vinculando</span>}
                  {fora > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">🔴 {fora} ativo(s) sem grupo — o bot não lê</span>}
                  {inativos > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">⚠️ {inativos} inativo(s)</span>}
                </div>
              );
            })()}

            {/* Legenda: quem opera precisa saber o que cada sinal da coluna "#" significa. */}
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Legenda:</span>
              <span>🟢 <b className="text-slate-700 dark:text-slate-200">Lendo</b> — o bot está lendo o grupo deste cliente</span>
              <span>⏳ <b className="text-slate-700 dark:text-slate-200">Vinculando</b> — link colado, aguarde ~1 min</span>
              <span>🔴 <b className="text-slate-700 dark:text-slate-200">Sem grupo</b> — cliente ativo sem link: <b>o bot não lê nada dele</b></span>
              <span>⚠️ <b className="text-slate-700 dark:text-slate-200">Inativo</b> — o bot não lê, e está certo assim</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-400">
                  <th className="px-2 py-2 font-medium" title="Nº sequencial por ordem alfabética. Passe o mouse para ver o ID interno.">#</th><th className="px-2 py-2 font-medium">Nome</th><th className="px-2 py-2 font-medium">Senha</th><th className="px-2 py-2 font-medium">Ativo</th><th className="px-2 py-2 font-medium">Calção</th><th className="px-2 py-2 font-medium">Desc.</th><th className="px-2 py-2 font-medium">Com.%</th><th className="px-2 py-2 font-medium">Supervisor</th><th className="px-2 py-2 font-medium">C.Afil.%</th><th className="px-2 py-2 font-medium text-center" title="Baixa liquidez: quando ligada, a casa desconta a taxa de baixa liquidez dos bilhetes deste cliente. Padrão: desligada.">BL</th><th className="px-2 py-2 font-medium">Grupo (link)</th><th className="px-2 py-2 font-medium sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">Ações</th>
                </tr></thead>
                <tbody>{cliSorted.map((c, i) => (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1.5 text-slate-500">
                      {/* Nº sequencial (1,2,3…) por ordem alfabética — o ID do banco é aleatório
                          e só atrapalha quem opera. O ID real fica no title, para suporte. */}
                      <div className="flex items-center gap-1.5 whitespace-nowrap" title={`ID interno: ${c.id}`}>
                        <PontoGrupo ativo={c.on} link={c.grupoLink} grupoId={c.grupoId} />
                        <span className="font-medium tabular-nums">{i + 1}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5"><input className={`${cinp} w-36 font-medium`} value={c.nome} onChange={(e) => updCli(c.id, { nome: e.target.value.toUpperCase() })} /></td>
                    <td className="px-2 py-1.5"><input className={`${cinp} w-24`} value={c.s} placeholder="nova senha" title="Senha guardada com hash — não é exibida. Digite uma nova para trocar; em branco mantém a atual." onChange={(e) => updCli(c.id, { s: e.target.value })} /></td>
                    <td className="px-2 py-1.5"><select className={cinp} value={c.on ? 'Sim' : 'Não'} onChange={(e) => updCli(c.id, { on: e.target.value === 'Sim' })}><option>Sim</option><option>Não</option></select></td>
                    <td className="px-2 py-1.5"><input type="number" className={`${cinp} w-20 text-right`} value={c.cal} onChange={(e) => updCli(c.id, { cal: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cinp} w-16 text-right`} value={c.desc} onChange={(e) => updCli(c.id, { desc: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cinp} w-14`} value={c.com} onChange={(e) => updCli(c.id, { com: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5"><select className={`${cinp} w-32`} value={c.sup ?? '—'} onChange={(e) => updCli(c.id, { sup: e.target.value === '—' ? null : e.target.value })}><option>—</option>{afiliados.map((a) => <option key={a.id} value={a.nome}>{a.nome}</option>)}</select></td>
                    <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cinp} w-14`} value={c.af} onChange={(e) => updCli(c.id, { af: Number(e.target.value) })} /></td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" className="h-4 w-4 accent-marca-600" checked={c.bl} onChange={(e) => updCli(c.id, { bl: e.target.checked })} title="Baixa liquidez deste cliente" /></td>
                    <td className="px-2 py-1.5"><div className="flex items-center gap-1.5"><input className={`${cinp} w-44`} placeholder={c.grupoId && !c.grupoLink ? '🔒 vinculado (link removido)' : 'link do grupo'} value={c.grupoLink ?? ''} onChange={(e) => updCli(c.id, { grupoLink: e.target.value })} /><StatusGrupo ativo={c.on} link={c.grupoLink} grupoId={c.grupoId} /></div></td>
                    <td className="px-2 py-1.5 sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800">
                      <div className="flex gap-1.5">
                        <button onClick={() => saveCli(c.id)} className="rounded-lg bg-marca-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-marca-700">Salvar</button>
                        <button onClick={() => delCli(c.id)} title="Excluir cliente (só sem apostas no sistema)" className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10">Excluir</button>
                      </div>
                    </td>
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
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1.5">
                      <button onClick={() => saveAf(a.id)} className="rounded-lg bg-marca-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-marca-700">Salvar</button>
                      <button onClick={() => delAf(a.id)} title="Excluir supervisor (só sem clientes vinculados)" className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10">Excluir</button>
                    </div>
                  </td>
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
              <button onClick={baixarPdfGeral} disabled={pdfGeralBusy} title="PDF do fechamento geral do período (para os sócios imprimirem)" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-[#DAA520] hover:brightness-125 disabled:opacity-50">
                {pdfGeralBusy ? 'Gerando…' : '📄 PDF fechamento geral'}
              </button>
            </div>
            {ehAdmin && (
              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
                <div className="min-w-[280px] flex-1">
                  <span className={lbl}>Mensagem enviada junto com o PDF (editável · vale para envio individual e em massa)</span>
                  <textarea className={`${inp} min-h-[180px]`} value={legendaEnvio} onChange={(e) => setLegendaEnvio(e.target.value)} />
                </div>
                <button onClick={enviarPdfTodos} disabled={enviandoTodos || envRow != null} title="Envia o PDF de cada cliente no grupo dele — o bot manda espaçado" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
                  {enviandoTodos ? 'Enfileirando…' : '📤 Enviar a todos'}
                </button>
                <p className="w-full text-[11px] text-slate-500 dark:text-slate-400">⏱️ No envio em massa, o bot manda para <b>um cliente a cada ~30 segundos</b> (evita bloqueio do WhatsApp). O botão 📤 na linha de cada cliente envia na hora.</p>
              </div>
            )}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['Calção', fechData.g.cal], ['Saldo calção', fechData.g.saldoCal], ['Total apostado', fechData.g.val], ['Em aberto', fechData.g.ab], ['Saldo bruto', fechData.g.sb], [fechData.g.modo === 'cashback_perda' ? 'Cashback devolvido' : 'Comissão', fechData.g.cm], ['Com. afiliado', fechData.g.caf], ['Saldo líquido', fechData.g.sl]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50"><div className="text-[11px] text-slate-400">{l}</div><div className="text-sm font-semibold tabular-nums">R$ {fmt(v)}</div></div>
              ))}
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="text-left text-slate-400"><th className="px-2 py-2 font-medium">Cliente</th><th className="px-2 py-2 text-right font-medium">Calção</th><th className="px-2 py-2 text-right font-medium">Saldo calção</th><th className="px-2 py-2 text-right font-medium">Apostado</th><th className="px-2 py-2 text-right font-medium">Em aberto</th><th className="px-2 py-2 text-right font-medium">S. bruto</th><th className="px-2 py-2 text-right font-medium">{fechData.g.modo === 'cashback_perda' ? 'Cashback' : 'Comissão'}</th><th className="px-2 py-2 text-right font-medium">C. afil.</th><th className="px-2 py-2 text-right font-medium">S. líquido</th><th className="px-2 py-2 text-center font-medium sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">PDF</th></tr></thead>
              <tbody>{fechData.rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5 font-medium">{r.nome}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.cal)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${clrCls(r.saldoCal)}`}>{fmt(r.saldoCal)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${entCls(r.val)}`}>{fmt(r.val)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${entCls(r.ab)}`}>{fmt(r.ab)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${clrCls(r.sb)}`}>{fmt(r.sb)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.cm)}`}>{fmt(r.cm)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.caf)}`}>{fmt(r.caf)}</td><td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${clrCls(r.sl)}`}>{fmt(r.sl)}</td>
                  <td className="px-2 py-1.5 text-center sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => baixarPdfCliente(r)} disabled={pdfBusy != null} title="Baixar PDF do fechamento" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">
                        {pdfBusy === r.id
                          ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60"/></svg>
                          : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                      </button>
                      {ehAdmin && (
                        <button onClick={() => enviarPdfUm(r)} disabled={envRow != null || enviandoTodos} title="Enviar este PDF no grupo do cliente (agora)" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-800 dark:hover:bg-emerald-900/30">
                          {envRow === r.id
                            ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60"/></svg>
                            : <span className="text-sm leading-none">📤</span>}
                        </button>
                      )}
                      {envioSt[r.id] && (
                        envioSt[r.id].status === 'enviado'
                          ? <span className="whitespace-nowrap rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-500/20 dark:text-green-300" title="Entregue no grupo do cliente">✅ enviado</span>
                          : envioSt[r.id].status === 'erro'
                            ? <span className="whitespace-nowrap rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300" title={envioSt[r.id].erro || 'Falha no envio'}>⚠ erro</span>
                            : <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" title="Na fila do bot — envia 1 a cada ~30s. Atualiza sozinho.">
                                <svg className="h-2.5 w-2.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60"/></svg>na fila…
                              </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {fechData.rows.length === 0 && <tr><td colSpan={10} className="px-2 py-8 text-center text-slate-400">Sem movimento no período.</td></tr>}
              </tbody>
            </table></div>
          </Modal>
        )}

        {/* ACERTOS — pagamentos e recebimentos dos clientes */}
        {modal === 'acertos' && (
          <Modal onClose={() => setModal(null)} max="max-w-6xl" title="💰 Acertos — pagamentos e recebimentos">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div><span className={lbl}>Data início</span><input type="date" className={inp} value={acertoPer.dt1} onChange={(e) => setAcertoPer((f) => ({ ...f, dt1: e.target.value, period: '' }))} /></div>
              <div><span className={lbl}>Data fim</span><input type="date" className={inp} value={acertoPer.dt2} onChange={(e) => setAcertoPer((f) => ({ ...f, dt2: e.target.value, period: '' }))} /></div>
              <div><span className={lbl}>Período</span><select className={inp} value={acertoPer.period} onChange={(e) => { const p = periodDates(e.target.value); setAcertoPer({ period: e.target.value, dt1: p.d1, dt2: p.d2 }); loadAcertos(p.d1, p.d2); }}><option value="">—</option><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Esta semana</option><option value="semana_ant">Semana passada</option></select></div>
              <button onClick={() => loadAcertos(acertoPer.dt1, acertoPer.dt2)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Buscar</button>
              {acertoBusy && <span className="text-xs text-slate-400">carregando…</span>}
            </div>

            {/* Cards de visão */}
            {acertoRes && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {([
                  ['A pagar', acertoRes.tot.aPagar, 'text-emerald-600 dark:text-emerald-400'],
                  ['Pago', acertoRes.tot.pago, 'text-emerald-600 dark:text-emerald-400'],
                  ['Falta pagar', acertoRes.tot.faltaPagar, 'text-amber-600 dark:text-amber-400'],
                  ['A receber', acertoRes.tot.aReceber, 'text-rose-600 dark:text-rose-400'],
                  ['Recebido', acertoRes.tot.recebido, 'text-rose-600 dark:text-rose-400'],
                  ['Falta receber', acertoRes.tot.faltaReceber, 'text-amber-600 dark:text-amber-400'],
                ] as [string, number, string][]).map(([l, v, cls]) => (
                  <div key={l} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                    <div className="text-[11px] text-slate-400">{l}</div>
                    <div className={`text-sm font-semibold tabular-nums ${cls}`}>R$ {fmt(v)}</div>
                  </div>
                ))}
              </div>
            )}

            <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
              O saldo vem do fechamento ao vivo. <b className="text-emerald-600 dark:text-emerald-400">Pagar</b> = o cliente ganhou; <b className="text-rose-600 dark:text-rose-400">Receber</b> = o cliente perdeu. Lançar não altera bilhete algum — só registra o dinheiro acertado.
            </p>

            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="text-left text-slate-400">
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Situação</th>
                <th className="px-2 py-2 text-right font-medium">A acertar</th>
                <th className="px-2 py-2 text-right font-medium">Já acertado</th>
                <th className="px-2 py-2 text-right font-medium">Pendente</th>
                <th className="px-2 py-2 font-medium">Lançar</th>
                <th className="px-2 py-2 text-center font-medium">Hist.</th>
              </tr></thead>
              <tbody>{(acertoRes?.rows ?? []).map((r) => {
                const draft = acertoLanc[r.clienteId] || { valor: '', obs: '' };
                const aberto = acertoHist.has(r.clienteId);
                return (
                  <Fragment key={r.clienteId}>
                    <tr className="border-t border-slate-100 dark:border-slate-800 align-middle">
                      <td className="px-2 py-1.5 font-medium">{r.nome}</td>
                      <td className="px-2 py-1.5">
                        {r.direcao === 'pagar'
                          ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Ganhou · pagar</span>
                          : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">Perdeu · receber</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">R$ {fmt(r.devido)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">R$ {fmt(r.liquidado)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                        {r.pendente > 0.005
                          ? <span className="text-amber-600 dark:text-amber-400">R$ {fmt(r.pendente)}</span>
                          : r.pendente < -0.005
                            ? <span className="text-rose-600 dark:text-rose-400" title="Acertado a mais que o devido">sobra R$ {fmt(-r.pendente)}</span>
                            : <span className="text-emerald-600 dark:text-emerald-400">Quitado ✓</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <input inputMode="decimal" placeholder="R$" value={draft.valor} onChange={(e) => setAcertoLanc((s) => ({ ...s, [r.clienteId]: { ...draft, valor: e.target.value } }))} className={`${cinp} w-20`} />
                          <input placeholder="obs (opcional)" value={draft.obs} onChange={(e) => setAcertoLanc((s) => ({ ...s, [r.clienteId]: { ...draft, obs: e.target.value } }))} className={`${cinp} w-28`} />
                          <button onClick={() => lancarAcerto(r)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium text-white ${r.direcao === 'pagar' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>{r.direcao === 'pagar' ? 'Pagar' : 'Receber'}</button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => setAcertoHist((s) => { const n = new Set(s); n.has(r.clienteId) ? n.delete(r.clienteId) : n.add(r.clienteId); return n; })} title="Histórico de lançamentos" className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                          🕘 {r.movimentos.length}
                        </button>
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                        <td colSpan={7} className="px-4 py-2">
                          {r.movimentos.length === 0
                            ? <div className="text-[11px] text-slate-400">Nenhum lançamento ainda para este cliente no período.</div>
                            : <div className="flex flex-col gap-1">
                                {r.movimentos.map((m) => (
                                  <div key={m.id} className="flex items-center gap-2 text-[11px]">
                                    <span className="tabular-nums text-slate-400">{m.quando}</span>
                                    <span className={`rounded px-1.5 py-0.5 font-semibold ${m.tipo === 'pago' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'}`}>{m.tipo === 'pago' ? 'pago' : 'recebido'}</span>
                                    <span className="font-semibold tabular-nums">R$ {fmt(m.valor)}</span>
                                    <span className="text-slate-500 dark:text-slate-400">por {m.ator}</span>
                                    {m.obs && <span className="truncate text-slate-400">· {m.obs}</span>}
                                    <button onClick={() => removerAcerto(m.id)} title="Remover este lançamento" className="ml-auto rounded border border-rose-200 px-1.5 py-0.5 text-[10px] text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20">✕ remover</button>
                                  </div>
                                ))}
                              </div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {acertoRes && acertoRes.rows.length === 0 && <tr><td colSpan={7} className="px-2 py-8 text-center text-slate-400">Nenhum cliente com saldo a acertar no período.</td></tr>}
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
              <thead><tr className="text-left text-slate-400"><th className="px-2 py-2 font-medium">Supervisor</th><th className="px-2 py-2 text-center font-medium">Logins</th><th className="px-2 py-2 text-right font-medium">Entrada</th><th className="px-2 py-2 text-right font-medium">Em aberto</th><th className="px-2 py-2 text-right font-medium">S. bruto</th><th className="px-2 py-2 text-right font-medium">Comissão</th><th className="px-2 py-2 text-right font-medium">C. afil.</th><th className="px-2 py-2 text-right font-medium">S. líquido</th><th className="px-2 py-2 text-center font-medium">PDF</th></tr></thead>
              <tbody>{fafData.rows.map((r) => (
                <tr key={r.sup} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5 font-medium">{r.sup}</td><td className="px-2 py-1.5 text-center tabular-nums">{r.logins}</td><td className={`px-2 py-1.5 text-right tabular-nums ${entCls(r.val)}`}>{fmt(r.val)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${entCls(r.ab)}`}>{fmt(r.ab)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${clrCls(r.sb)}`}>{fmt(r.sb)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.cm)}`}>{fmt(r.cm)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${comCls(r.caf)}`}>{fmt(r.caf)}</td><td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${clrCls(r.sl)}`}>{fmt(r.sl)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => baixarPdfAfiliado(r)} disabled={pdfAfBusy != null} title={`Baixar PDF do ${r.sup} para enviar a ele`} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">
                      {pdfAfBusy === r.sup
                        ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 60"/></svg>
                        : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                    </button>
                  </td>
                </tr>
              ))}
              {fafData.rows.length === 0 && <tr><td colSpan={9} className="px-2 py-8 text-center text-slate-400">Nenhum supervisor com movimento.</td></tr>}
              </tbody>
            </table></div>
          </Modal>
        )}

        {/* PLANO / COTA DE TRANSCRIÇÕES */}
        {modal === 'plano' && (
          <Modal onClose={() => setModal(null)} max="max-w-xl" title="📦 Plano e cota de transcrições">
            {!plano ? (
              <div className="px-2 py-10 text-center text-slate-400">Carregando…</div>
            ) : (() => {
              const u = plano.uso;
              const pctFill = Math.min(u.pct, 100);
              const nivel = u.pct >= 100 ? 'cheio' : u.pct >= 80 ? 'alerta' : 'ok';
              const barColor = nivel === 'cheio' ? 'bg-rose-500' : nivel === 'alerta' ? 'bg-marca-500' : 'bg-emerald-500';
              const cicloIni = u.cicloInicio ? new Date(u.cicloInicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
              return (
                <div className="flex flex-col gap-5">
                  {/* MEDIDOR */}
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-sm font-medium">Bilhetes transcritos no ciclo</span>
                      <span className="font-mono text-lg font-bold tabular-nums">{u.usados.toLocaleString('pt-BR')}<span className="text-slate-400"> / {u.cota.toLocaleString('pt-BR')}</span></span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pctFill}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[12px] text-slate-400">
                      <span>Ciclo desde {cicloIni} · renova todo dia {plano.config.renovaDia}</span>
                      <span className="font-mono tabular-nums">{u.pct.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%</span>
                    </div>
                    {nivel === 'alerta' && <div className="mt-3 rounded-lg bg-marca-50 px-3 py-2 text-[12px] text-marca-700 dark:bg-marca-500/10 dark:text-marca-400">⚠️ Chegando no limite da cota ({u.pct.toFixed(0)}%). Fique de olho — ao passar de 100% começa a contar excedente.</div>}
                    {nivel === 'cheio' && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">🔴 Cota atingida. Não travou nada — segue transcrevendo. O excedente abaixo entra na próxima mensalidade.</div>}
                  </div>

                  {/* EXCEDENTE */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                      <div className="text-[11px] text-slate-400">Excedente</div>
                      <div className="font-mono text-lg font-bold tabular-nums">{u.excedente.toLocaleString('pt-BR')} <span className="text-[12px] font-normal text-slate-400">bilhetes</span></div>
                    </div>
                    <div className={`rounded-xl p-3 ${u.valorExcedente > 0 ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                      <div className="text-[11px] text-slate-400">A cobrar (excedente × R$ {u.precoExcedente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</div>
                      <div className={`font-mono text-lg font-bold tabular-nums ${u.valorExcedente > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>R$ {fmt(u.valorExcedente)}</div>
                    </div>
                  </div>

                  {/* PLANO (somente leitura — configuração fica no admin master) */}
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Seu plano</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                      <div><div className="text-[11px] text-slate-400">Plano</div><div className="font-semibold">{plano.config.nome}</div></div>
                      <div><div className="text-[11px] text-slate-400">Cota mensal</div><div className="font-semibold tabular-nums">{plano.config.cota.toLocaleString('pt-BR')}</div></div>
                      <div><div className="text-[11px] text-slate-400">Excedente</div><div className="font-semibold tabular-nums">R$ {plano.config.precoExcedente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<span className="text-[11px] font-normal text-slate-400">/bilhete</span></div></div>
                      <div><div className="text-[11px] text-slate-400">Renovação</div><div className="font-semibold">todo dia {plano.config.renovaDia}</div></div>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    A contagem é <b>ao vivo</b>: conta os bilhetes transcritos do ciclo. Correção do mesmo bilhete não conta 2×, e bilhete excluído sai da conta. Grupo de despesa e grupos <b>&ldquo;Teste print…&rdquo;</b> não entram na cota.
                  </p>
                </div>
              );
            })()}
          </Modal>
        )}

        {/* USUÁRIOS DA EQUIPE */}
        {modal === 'usuarios' && (
          <Modal onClose={() => { setModal(null); setResetUser(null); }} max="max-w-lg" title="👥 Usuários da equipe">
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ehAdmin
                  ? 'Operador vê só bilhetes + conferência. Use "⚙ Perfil" para liberar acessos extras a um operador (ex.: 💳 Contas). Gestor tem o acesso operacional completo. O admin (dono) não aparece na lista.'
                  : 'Você pode redefinir a senha dos operadores. Criar usuários é só com o admin.'}
              </p>

              {ehAdmin && (
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Novo usuário</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div><span className={lbl}>Nome de login</span><input className={inp} value={novoUser.nome} onChange={(e) => setNovoUser((s) => ({ ...s, nome: e.target.value }))} placeholder="ex.: joao" /></div>
                    <div><span className={lbl}>Senha</span><input className={inp} type="text" value={novoUser.senha} onChange={(e) => setNovoUser((s) => ({ ...s, senha: e.target.value }))} placeholder="mín. 4 caracteres" /></div>
                    <div><span className={lbl}>Cargo</span>
                      <select className={inp} value={novoUser.papel} onChange={(e) => setNovoUser((s) => ({ ...s, papel: e.target.value as 'operador' | 'gestor' | 'admin' }))}>
                        <option value="operador">Operador (só bilhetes + conferência)</option>
                        <option value="gestor">Gestor (operacional completo)</option>
                        {ehMaster && <option value="admin">Admin (dono — vê tudo + gerencia equipe)</option>}
                      </select>
                    </div>
                    <div className="flex items-end"><button onClick={criarUsuario} className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">+ Criar usuário</button></div>
                  </div>
                  {userErro && <div className="mt-2 text-xs text-rose-600">{userErro}</div>}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                {equipe.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400 dark:border-slate-700">Nenhum usuário ainda.</div>}
                {equipe.map((u) => (
                  <div key={u.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{u.nome}</div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${u.papel === 'admin' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : u.papel === 'gestor' ? 'bg-marca-100 text-marca-700 dark:bg-marca-500/20 dark:text-marca-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'}`}>{u.papel}</span>
                          {!u.ativo && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700">inativo</span>}
                          {u.permissoes?.contas && <span title="Este operador tem acesso às Contas" className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">💳 contas</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button onClick={() => setResetUser({ id: u.id, nome: u.nome, senha: '' })} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">🔑 Senha</button>
                        {ehAdmin && u.papel === 'operador' && <button onClick={() => { setResetUser(null); setPermUser({ id: u.id, nome: u.nome, contas: !!u.permissoes?.contas }); }} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">⚙ Perfil</button>}
                        {ehAdmin && <button onClick={() => alternarAtivoUsuario(u)} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">{u.ativo ? 'Desativar' : 'Ativar'}</button>}
                      </div>
                    </div>
                    {resetUser?.id === u.id && (
                      <div className="mt-2 flex items-center gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                        <input className={inp} type="text" autoFocus value={resetUser.senha} onChange={(e) => setResetUser((r) => (r ? { ...r, senha: e.target.value } : r))} placeholder="nova senha (mín. 4)" />
                        <button onClick={salvarResetSenha} className="shrink-0 rounded-lg bg-marca-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-700">Salvar</button>
                        <button onClick={() => setResetUser(null)} className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
                      </div>
                    )}
                    {permUser?.id === u.id && (
                      <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                        <div className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">Permissões do perfil</div>
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input type="checkbox" checked={permUser.contas} onChange={(e) => setPermUser((p) => (p ? { ...p, contas: e.target.checked } : p))} />
                          <span>💳 Contas <span className="text-xs text-slate-400">— acesso à página de contas de aposta</span></span>
                        </label>
                        <div className="mt-2 flex items-center gap-2">
                          <button onClick={salvarPermissoes} className="shrink-0 rounded-lg bg-marca-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-700">Salvar perfil</button>
                          <button onClick={() => setPermUser(null)} className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Modal>
        )}

        {/* MINHA SENHA (qualquer papel troca a própria) */}
        {modal === 'minhaSenha' && (
          <Modal onClose={() => setModal(null)} max="max-w-sm" title="🔑 Trocar a minha senha">
            <div className="flex flex-col gap-3">
              <div><span className={lbl}>Senha atual</span><input className={inp} type="password" autoComplete="current-password" value={minhaSenha.atual} onChange={(e) => setMinhaSenha((s) => ({ ...s, atual: e.target.value, erro: '' }))} /></div>
              <div><span className={lbl}>Nova senha</span><input className={inp} type="password" autoComplete="new-password" placeholder="mín. 4 caracteres" value={minhaSenha.nova} onChange={(e) => setMinhaSenha((s) => ({ ...s, nova: e.target.value, erro: '' }))} /></div>
              <div><span className={lbl}>Confirmar nova senha</span><input className={inp} type="password" autoComplete="new-password" value={minhaSenha.conf} onChange={(e) => setMinhaSenha((s) => ({ ...s, conf: e.target.value, erro: '' }))} /></div>
              {minhaSenha.erro && <div className="text-xs text-rose-600">{minhaSenha.erro}</div>}
              {minhaSenha.ok && <div className="text-xs font-medium text-emerald-600">Senha alterada!</div>}
              <button onClick={salvarMinhaSenha} disabled={!minhaSenha.atual || !minhaSenha.nova} className="mt-1 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50">Trocar senha</button>
            </div>
          </Modal>
        )}

        {/* HISTÓRICO DO BILHETE (auditoria) */}
        {histModal && (
          <Modal onClose={() => setHistModal(null)} max="max-w-lg" title={`🕘 Histórico — bilhete #${histModal.id}`}>
            {histModal.carregando ? (
              <div className="py-8 text-center text-sm text-slate-400">Carregando…</div>
            ) : histModal.itens.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">Nenhuma alteração registrada para este bilhete ainda.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {histModal.itens.map((it) => (
                  <div key={it.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{ACAO_LABEL[it.acao] ?? it.acao}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{it.quando}</span>
                    </div>
                    {(it.de || it.para) && (
                      <div className="mt-0.5 text-xs">
                        {it.de ? <span className="text-rose-500 line-through">{it.de}</span> : null}
                        {it.de && it.para ? <span className="text-slate-400"> → </span> : null}
                        {it.para ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{it.para}</span> : null}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-slate-400">
                      por <b className="text-slate-600 dark:text-slate-300">{it.ator}</b> <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{it.papel}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              <label className="flex items-center gap-2 py-1"><input type="checkbox" className="h-4 w-4 accent-marca-600" checked={novoCli.bl} onChange={(e) => setNovoCli((s) => ({ ...s, bl: e.target.checked }))} /><span className="text-sm text-slate-600 dark:text-slate-300">Baixa liquidez <span className="text-slate-400">(padrão: desligada — ligue só se a casa cobrar)</span></span></label>
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
                <button onClick={salvarObs} className="rounded-lg bg-marca-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-700">Salvar</button>
              </div>
            </div>
          </Modal>
        )}

        {/* EDITAR TEXTO DO BILHETE */}
        {jogoModal && (
          <Modal onClose={() => setJogoModal(null)} max="max-w-lg" title={`Editar bilhete — aposta #${jogoModal.id}`}>
            <div className="flex flex-col gap-3">
              <div><span className={lbl}>Texto do bilhete (times, mercados, handicap…)</span>
                <textarea rows={8} className={`${inp} font-mono text-[12px] leading-snug`} value={jogoModal.text} onChange={(e) => setJogoModal((m) => (m ? { ...m, text: e.target.value } : m))} autoFocus />
              </div>
              <p className="text-[11px] text-slate-400">Use para corrigir o que a transcrição não pegou (nome do time, handicap, seleções). Uma linha por seleção.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setJogoModal(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">Cancelar</button>
                <button onClick={salvarJogo} className="rounded-lg bg-marca-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-700">Salvar</button>
              </div>
            </div>
          </Modal>
        )}

        {/* EDITAR DATA/HORA */}
        {dtModal && (
          <Modal onClose={() => setDtModal(null)} max="max-w-sm" title={`Editar data e hora — aposta #${dtModal.id}`}>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><span className={lbl}>Data</span>
                  <input type="date" className={inp} value={dtModal.date} onChange={(e) => setDtModal((m) => (m ? { ...m, date: e.target.value } : m))} autoFocus />
                </div>
                <div><span className={lbl}>Hora</span>
                  <input type="time" className={inp} value={dtModal.time} onChange={(e) => setDtModal((m) => (m ? { ...m, time: e.target.value } : m))} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">A data da aposta é a do momento em que o cliente mandou o print. Corrija aqui se o horário ficou errado.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDtModal(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">Cancelar</button>
                <button onClick={salvarDt} className="rounded-lg bg-marca-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-700">Salvar</button>
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

// Selo de ícone de cada cartão. A cor é só do selo — o número segue a regra de cor
// do painel (verde/vermelho/preto), senão a moldura brigaria com o dado.
// Fundo + contorno na mesma família de cor: o tom -50 sozinho sumia no branco do
// cartão e o selo ficava boiando. O -100 com borda -300 desenha o selo de verdade.
const KPI_COR: Record<string, string> = {
  blue: 'border-blue-300 bg-blue-100 text-blue-600 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-300',
  amber: 'border-marca-300 bg-marca-100 text-marca-600 dark:border-marca-400/40 dark:bg-marca-500/15 dark:text-marca-300',
  violet: 'border-violet-300 bg-violet-100 text-violet-600 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-300',
  emerald: 'border-emerald-300 bg-emerald-100 text-emerald-600 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-300',
  rose: 'border-rose-300 bg-rose-100 text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-300',
  teal: 'border-teal-300 bg-teal-100 text-teal-600 dark:border-teal-400/40 dark:bg-teal-500/15 dark:text-teal-300',
  slate: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-500/50 dark:bg-slate-700 dark:text-slate-300',
  destaque: 'border-marca-400 bg-marca-200/60 text-marca-700 dark:border-marca-400/50 dark:bg-marca-400/20 dark:text-marca-300',
};

/**
 * Cartão do resumo. Todos com a mesma caixa e o mesmo peso; o "Resumo total"
 * (cor="destaque") ganha borda âmbar e número maior por ser o dado que decide.
 */
function Kpi({ icone, cor, titulo, valor, valorCls, sub, dica, href }: {
  icone: string; cor: keyof typeof KPI_COR | string; titulo: string;
  valor: string; valorCls: string; sub: string; dica?: string; href?: string;
}) {
  const destaque = cor === 'destaque';
  // Borda dourada em todos os cartões (era só no Resumo total). O destaque continua
  // se separando pelo anel âmbar e pelo número maior, não pela cor da borda.
  const cls = `group relative overflow-hidden rounded-xl border border-marca-400 bg-white p-3 transition dark:border-marca-500/50 dark:bg-slate-900 ${
    destaque ? 'ring-1 ring-marca-400/30' : 'hover:shadow-sm hover:ring-1 hover:ring-marca-400/20'}`;
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        {/* O título vira selo contornado, na mesma cor do ícone: em slate-400 solto
            ele ficava apagado no branco e não dizia a que card pertencia. */}
        <div className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KPI_COR[cor] ?? KPI_COR.slate}`}>{titulo}</div>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[11px] ${KPI_COR[cor] ?? KPI_COR.slate}`}>{icone}</span>
      </div>
      <div className={`mt-1 tabular-nums ${destaque ? 'text-xl font-bold' : 'text-lg font-semibold'} ${valorCls}`}>{valor}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </>
  );
  return href
    ? <a href={href} title={dica} className={`${cls} block hover:border-marca-400`}>{conteudo}</a>
    : <div title={dica} className={cls}>{conteudo}</div>;
}

/**
 * Diz, sem rodeio, se o bot está lendo o grupo deste cliente.
 * O bot só lê grupos que têm vínculo resolvido (grupo_id) — sem isso, os bilhetes
 * do cliente simplesmente não entram. É a diferença entre "cadastrado" e "funcionando",
 * e ela precisa estar na cara de quem cadastra.
 */
/** Sinal ao lado do nº. A legenda no topo da aba explica cada um. */
function PontoGrupo({ ativo, link, grupoId }: { ativo: boolean; link: string | null; grupoId: string | null }) {
  if (!ativo) return <span title="Cliente inativo — o bot não lê, e está certo assim.">⚠️</span>;
  if (grupoId) return <span title="O bot está lendo o grupo deste cliente.">🟢</span>;
  if (link) return <span title="Link colado; o bot ainda está vinculando (~1 min).">⏳</span>;
  return <span title="Cliente ATIVO sem grupo: o bot não lê nada dele. Cole o link do grupo.">🔴</span>;
}

function StatusGrupo({ ativo, link, grupoId }: { ativo: boolean; link: string | null; grupoId: string | null }) {
  if (grupoId) {
    return <span title={`O bot está lendo este grupo (${grupoId})`} className="shrink-0 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Lendo</span>;
  }
  if (!ativo) {
    return <span title="Cliente inativo — o bot não lê, e está certo assim." className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Inativo</span>;
  }
  if (link) {
    return <span title="Link colado, mas o bot ainda não vinculou. Costuma levar até 1 minuto. Se ficar assim, o link está inválido ou expirado — gere um novo no WhatsApp e cole aqui." className="shrink-0 whitespace-nowrap rounded-full bg-marca-100 px-2 py-0.5 text-[10px] font-semibold text-marca-700 dark:bg-marca-500/15 dark:text-marca-300">Vinculando…</span>;
  }
  return <span title="Cliente ATIVO sem link do grupo: o bot NÃO lê este cliente. Nenhum bilhete dele entra no sistema." className="shrink-0 whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">Sem grupo</span>;
}

/**
 * Campo numérico no padrão brasileiro (odd "1,80" / entradas "1.300").
 * Enquanto está em foco mostra o texto cru — para não brigar com quem digita —
 * e formata assim que sai. O rascunho guarda o que foi digitado; quem converte
 * para número é o parseNumBR na hora de salvar.
 *
 * `desc` (só na odd) = desconto do cliente. A odd aparece JÁ DESCONTADA, que é a que
 * vale para o cliente. O que se GRAVA continua sendo a odd do bilhete: o desconto é
 * aplicado pelo trigger calc_aposta no banco — gravar já descontado aplicaria duas
 * vezes. Por isso, ao clicar para editar, o campo volta a mostrar a odd do bilhete.
 */
function NumInput({ value, onChange, kind, cls, desc = 0 }: { value: string; onChange: (v: string) => void; kind: 'odd' | 'money'; cls: string; desc?: number }) {
  const [foco, setFoco] = useState(false);
  const n = parseNumBR(value);
  const exibido = kind === 'odd'
    ? fmtOdd(n && desc ? Math.max(n - desc, 0) : n)
    : fmtMoney(n);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={cls}
      title={kind === 'odd' && desc && n ? `Odd do cliente (já com o desconto de ${fmtOdd(desc)}). No bilhete: ${fmtOdd(n)} — é esse valor que fica gravado.` : undefined}
      value={foco ? value : exibido}
      onFocus={() => setFoco(true)}
      onBlur={() => setFoco(false)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
