// ═══════════ TIPOS DO PAINEL (forma compacta usada na UI) ═══════════
export interface Afiliado { id: number; nome: string; com: number }
export interface Cliente { id: number; nome: string; s: string; on: boolean; cal: number; desc: number; com: number; sup: string | null; af: number; link: string | null }
export interface Reg { id: number; dt: string; cId: number; jogo: string; odd: number; val: number; st: string; dc: string; sb: number; cm: number; caf: number; sl: number; bl: boolean; adv: boolean; irr: boolean; obs: string; ct: boolean; ctMotivo: string }

export interface PanelData { afiliados: Afiliado[]; clientes: Cliente[]; regs: Reg[] }

// ── paginação/agregação (server-side)
export interface Totals {
  entradas: number; em_aberto_total: number; em_aberto_qtd: number;
  saldo_bruto: number; comissao: number; comissao_afiliado: number; saldo_liquido: number;
}
export interface ApostasPage { rows: Reg[]; total: number; totals: Totals }
export interface FiltroApostas {
  id?: string; cId?: number | null; st?: string; jogo?: string; dc?: string;
  oddMin?: number | null; oddMax?: number | null; valMin?: number | null; valMax?: number | null;
  bl?: boolean | null; adv?: boolean | null; irr?: boolean | null;
  dt1?: string | null; dt2?: string | null; ord?: string; page?: number;
  pend?: boolean | null;  // true = só fila pendente (EM ABERTO ou contestada)
}
export interface FechCliRow { id: number; nome: string; cal: number; val: number; ab: number; sb: number; cm: number; caf: number; sl: number; saldoCal: number }
export interface FechCliResp { rows: FechCliRow[]; g: { cal: number; saldoCal: number; val: number; ab: number; sb: number; cm: number; caf: number; sl: number } }
export interface FechAfRow { sup: string; logins: number; val: number; ab: number; sb: number; cm: number; caf: number; sl: number }
export interface FechAfResp { rows: FechAfRow[]; g: { logins: number; val: number; ab: number; sb: number; cm: number; caf: number; sl: number } }

// semana atual (segunda → domingo) em 'YYYY-MM-DD'
export function weekRange(): { d1: string; d2: string } {
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const today = new Date();
  const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { d1: fmt(mon), d2: fmt(sun) };
}

// ═══════════ LINHAS CRUAS DO BANCO ═══════════
export interface AfiliadoRow { id: number; nome: string; comissao_pct: number | string }
export interface ClienteRow {
  id: number; nome: string; senha_hash: string | null; ativo: boolean;
  calcao: number | string; desconto: number | string; comissao_pct: number | string;
  afiliado_id: number | null; afiliado_comissao_pct: number | string; link: string | null;
}
export interface ApostaRow {
  id: number; cliente_id: number; data: string; jogo: string; odd: number | string; valor: number | string;
  status: string; casa: string | null; saldo_bruto: number | string; comissao: number | string;
  comissao_afiliado: number | string; saldo_liquido: number | string;
  baixa_liquidez: boolean; advertido: boolean; irregular: boolean; advertencia: string | null;
  contestada?: boolean; contestacao?: string | null;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0);

// timestamptz (ISO) → 'YYYY-MM-DD HH:mm' (hora local)
export function fmtTs(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 'YYYY-MM-DD HH:mm' (hora local) → ISO para gravar no banco
export function parseTs(s: string): string {
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ═══════════ MAPEADORES banco → painel ═══════════
export const mapAfiliado = (r: AfiliadoRow): Afiliado => ({ id: r.id, nome: r.nome, com: num(r.comissao_pct) });

export function mapCliente(r: ClienteRow, afNome: Record<number, string>): Cliente {
  return {
    id: r.id, nome: r.nome, s: r.senha_hash ?? '', on: r.ativo,
    cal: num(r.calcao), desc: num(r.desconto), com: num(r.comissao_pct),
    sup: r.afiliado_id != null ? (afNome[r.afiliado_id] ?? null) : null,
    af: num(r.afiliado_comissao_pct),
    link: r.link ?? null,
  };
}

export const mapAposta = (r: ApostaRow): Reg => ({
  id: r.id, dt: fmtTs(r.data), cId: r.cliente_id, jogo: r.jogo, odd: num(r.odd), val: num(r.valor),
  st: r.status, dc: r.casa ?? '', sb: num(r.saldo_bruto), cm: num(r.comissao), caf: num(r.comissao_afiliado),
  sl: num(r.saldo_liquido), bl: r.baixa_liquidez, adv: r.advertido, irr: r.irregular,
  obs: r.advertencia ?? '',
  ct: r.contestada ?? false, ctMotivo: r.contestacao ?? '',
});
