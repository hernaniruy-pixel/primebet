// ═══════════ TIPOS DO PAINEL (forma compacta usada na UI) ═══════════
export interface Afiliado { id: number; nome: string; com: number }
export interface Cliente { id: number; nome: string; s: string; on: boolean; cal: number; desc: number; com: number; sup: string | null; af: number; link: string | null }
export interface Reg { id: number; dt: string; cId: number; jogo: string; odd: number; val: number; st: string; dc: string; sb: number; cm: number; caf: number; sl: number; bl: boolean; adv: boolean; irr: boolean }

export interface PanelData { afiliados: Afiliado[]; clientes: Cliente[]; regs: Reg[] }

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
  baixa_liquidez: boolean; advertido: boolean; irregular: boolean;
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
});
