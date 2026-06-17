'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  type Afiliado, type Cliente, type Reg,
  type AfiliadoRow, type ClienteRow, type ApostaRow,
  type ApostasPage, type FiltroApostas, type Totals, type FechCliResp, type FechAfResp,
  mapAfiliado, mapCliente, mapAposta, parseTs,
} from './types';

// ═══════════════════ LISTAGEM / FECHAMENTO (paginação no servidor) ═══════════════════
export async function listarApostas(f: FiltroApostas): Promise<ApostasPage> {
  await exigirSessao();
  const db = createAdminClient();
  const { data, error } = await db.rpc('controle_listar', {
    p_dt1: f.dt1 || null, p_dt2: f.dt2 || null,
    p_id: f.id || null, p_cliente: f.cId ?? null,
    p_status: f.st || null, p_jogo: f.jogo || null, p_descarrego: f.dc || null,
    p_odd_min: f.oddMin ?? null, p_odd_max: f.oddMax ?? null,
    p_val_min: f.valMin ?? null, p_val_max: f.valMax ?? null,
    p_bl: f.bl ?? null, p_adv: f.adv ?? null, p_irr: f.irr ?? null,
    p_sort: f.ord || 'data_desc', p_page: f.page || 1, p_per: 20,
    p_pendentes: f.pend ?? null,
  });
  if (error) throw error;
  const j = data as { rows: ApostaRow[]; total: number; totals: Totals };
  return { rows: (j.rows ?? []).map(mapAposta), total: j.total ?? 0, totals: j.totals };
}

export async function fechamentoClientes(dt1?: string | null, dt2?: string | null): Promise<FechCliResp> {
  await exigirSessao();
  const db = createAdminClient();
  const { data, error } = await db.rpc('fechamento_clientes', { p_dt1: dt1 || null, p_dt2: dt2 || null });
  if (error) throw error;
  return data as FechCliResp;
}

export async function fechamentoAfiliados(dt1?: string | null, dt2?: string | null): Promise<FechAfResp> {
  await exigirSessao();
  const db = createAdminClient();
  const { data, error } = await db.rpc('fechamento_afiliados', { p_dt1: dt1 || null, p_dt2: dt2 || null });
  if (error) throw error;
  return data as FechAfResp;
}

// ─────────── Auth: só equipe logada pode mutar ───────────
async function exigirSessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Não autenticado.');
}

// mapa id→nome dos afiliados (para devolver clientes na forma do painel)
async function afNomeMap(db: ReturnType<typeof createAdminClient>): Promise<Record<number, string>> {
  const { data } = await db.from('afiliados').select('id,nome');
  const m: Record<number, string> = {};
  (data ?? []).forEach((a: { id: number; nome: string }) => { m[a.id] = a.nome; });
  return m;
}

// ═══════════════════ APOSTAS ═══════════════════
export interface NovaAposta { cId: number; jogo: string; odd: number; val: number; st: string; dc: string }

export async function criarAposta(input: NovaAposta): Promise<Reg> {
  await exigirSessao();
  const db = createAdminClient();
  const { data, error } = await db.from('apostas').insert({
    cliente_id: input.cId, jogo: input.jogo, odd: input.odd, valor: input.val,
    status: input.st, casa: input.dc || '', origem: 'manual',
  }).select('*').single();
  if (error) throw error;
  return mapAposta(data as ApostaRow);
}

export interface PatchAposta {
  dt?: string; odd?: number; val?: number; st?: string; dc?: string;
  bl?: boolean; adv?: boolean; irr?: boolean; obs?: string; cId?: number; jogo?: string;
}

export async function atualizarAposta(id: number, patch: PatchAposta): Promise<Reg> {
  await exigirSessao();
  const db = createAdminClient();
  const upd: Record<string, unknown> = {};
  if (patch.dt !== undefined) upd.data = parseTs(patch.dt);
  if (patch.odd !== undefined) upd.odd = patch.odd;
  if (patch.val !== undefined) upd.valor = patch.val;
  if (patch.st !== undefined) {
    upd.status = patch.st;
    // Ao resolver (sair de EM ABERTO), encerra eventual contestação -> sai da fila do admin.
    if (patch.st !== 'EM ABERTO') { upd.contestada = false; upd.contestada_em = null; }
  }
  if (patch.dc !== undefined) upd.casa = patch.dc;
  if (patch.bl !== undefined) upd.baixa_liquidez = patch.bl;
  if (patch.adv !== undefined) upd.advertido = patch.adv;
  if (patch.irr !== undefined) upd.irregular = patch.irr;
  if (patch.obs !== undefined) upd.advertencia = patch.obs || null;
  if (patch.cId !== undefined) upd.cliente_id = patch.cId;
  if (patch.jogo !== undefined) upd.jogo = patch.jogo;
  const { data, error } = await db.from('apostas').update(upd).eq('id', id).select('*').single();
  if (error) throw error;
  return mapAposta(data as ApostaRow);
}

export async function excluirAposta(id: number): Promise<void> {
  await exigirSessao();
  const db = createAdminClient();
  const { error } = await db.from('apostas').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════ CLIENTES ═══════════════════
export interface NovoClienteInput {
  nome: string; senha?: string; calcao?: number; desconto?: number;
  comissao?: number; comissaoSup?: number; sup?: string | null;
}
const gerarSlug = () => Math.random().toString(36).slice(2, 8);

export async function criarCliente(input: NovoClienteInput): Promise<Cliente> {
  await exigirSessao();
  const db = createAdminClient();
  const nome = input.nome.toUpperCase().trim();

  let afiliadoId: number | null = null;
  if (input.sup) {
    const { data: af } = await db.from('afiliados').select('id').eq('nome', input.sup).maybeSingle();
    afiliadoId = af?.id ?? null;
  }

  const { data, error } = await db.from('clientes').insert({
    nome, senha_hash: input.senha || null,
    calcao: input.calcao ?? 0, desconto: input.desconto ?? 0,
    comissao_pct: input.comissao ?? 0, afiliado_id: afiliadoId,
    afiliado_comissao_pct: input.comissaoSup ?? 0,
    link: `/${gerarSlug()}/${nome}`,
  }).select('*').single();
  if (error) throw error;
  const m = await afNomeMap(db);
  return mapCliente(data as ClienteRow, m);
}

export interface PatchCliente {
  nome?: string; s?: string; on?: boolean; cal?: number; desc?: number; com?: number; sup?: string | null; af?: number; link?: string | null;
}

/**
 * Atualiza o cliente e, se comissão/afiliado mudaram, refaz o cálculo das apostas
 * dele (toca atualizado_em para disparar o trigger). Devolve cliente + apostas afetadas.
 */
export async function atualizarCliente(id: number, patch: PatchCliente): Promise<{ cliente: Cliente; regs: Reg[] }> {
  await exigirSessao();
  const db = createAdminClient();

  const upd: Record<string, unknown> = {};
  if (patch.nome !== undefined) upd.nome = patch.nome;
  if (patch.s !== undefined) upd.senha_hash = patch.s || null;
  if (patch.on !== undefined) upd.ativo = patch.on;
  if (patch.cal !== undefined) upd.calcao = patch.cal;
  if (patch.desc !== undefined) upd.desconto = patch.desc;
  if (patch.com !== undefined) upd.comissao_pct = patch.com;
  if (patch.af !== undefined) upd.afiliado_comissao_pct = patch.af;
  if (patch.link !== undefined) upd.link = patch.link || null;
  if (patch.sup !== undefined) {
    if (patch.sup == null) upd.afiliado_id = null;
    else {
      const { data: af } = await db.from('afiliados').select('id').eq('nome', patch.sup).maybeSingle();
      upd.afiliado_id = af?.id ?? null;
    }
  }

  const { data, error } = await db.from('clientes').update(upd).eq('id', id).select('*').single();
  if (error) throw error;

  // recalcula apostas do cliente (comissão pode ter mudado)
  await db.from('apostas').update({ atualizado_em: new Date().toISOString() }).eq('cliente_id', id);
  const { data: aps } = await db.from('apostas').select('*').eq('cliente_id', id);

  const m = await afNomeMap(db);
  return {
    cliente: mapCliente(data as ClienteRow, m),
    regs: ((aps ?? []) as ApostaRow[]).map(mapAposta),
  };
}

// ═══════════════════ AFILIADOS ═══════════════════
export async function criarAfiliado(nome: string, com = 0): Promise<Afiliado> {
  await exigirSessao();
  const db = createAdminClient();
  const { data, error } = await db.from('afiliados').insert({ nome, comissao_pct: com }).select('*').single();
  if (error) throw error;
  return mapAfiliado(data as AfiliadoRow);
}

export async function atualizarAfiliado(id: number, patch: { nome?: string; com?: number }): Promise<Afiliado> {
  await exigirSessao();
  const db = createAdminClient();
  const upd: Record<string, unknown> = {};
  if (patch.nome !== undefined) upd.nome = patch.nome;
  if (patch.com !== undefined) upd.comissao_pct = patch.com;
  const { data, error } = await db.from('afiliados').update(upd).eq('id', id).select('*').single();
  if (error) throw error;
  return mapAfiliado(data as AfiliadoRow);
}
