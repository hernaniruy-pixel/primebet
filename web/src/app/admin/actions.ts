'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  type Afiliado, type Cliente, type Reg,
  type AfiliadoRow, type ClienteRow, type ApostaRow,
  type ApostasPage, type FiltroApostas, type Totals, type FechCliResp, type FechAfResp,
  mapAfiliado, mapCliente, mapAposta, parseTs, fmtTs,
} from './types';
import type { ConfGrupo, ConfImagensResp, ConfFiltro } from './conferencia/types';
import type { DespesasResp, SemanaDespesas, Despesa } from './despesas/types';
import { semanasBR, janelaSemana } from '@/lib/semana';

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

// ═══════════════════ CONFERÊNCIA DE GRUPOS ═══════════════════
export async function listarConfGrupos(dt1?: string | null, dt2?: string | null): Promise<ConfGrupo[]> {
  await exigirSessao();
  const db = createAdminClient();
  const { data, error } = await db.rpc('conferencia_grupos', { p_dt1: dt1 || null, p_dt2: dt2 || null });
  if (error) throw error;
  return (data ?? []) as ConfGrupo[];
}

export async function listarConfImagens(f: ConfFiltro): Promise<ConfImagensResp> {
  await exigirSessao();
  const db = createAdminClient();
  const per = 48;
  const page = f.page || 1;
  let q = db.from('imagens_recebidas').select('*', { count: 'exact' }).order('enviado_em', { ascending: false });
  if (f.grupoId) q = q.eq('grupo_id', f.grupoId);
  if (f.pend) q = q.eq('reagida', false).eq('ignorada', false);
  if (f.dt1) q = q.gte('enviado_em', `${f.dt1}T00:00:00`);
  if (f.dt2) q = q.lte('enviado_em', `${f.dt2}T23:59:59.999`);
  q = q.range((page - 1) * per, (page - 1) * per + per - 1);
  const { data, error, count } = await q;
  if (error) throw error;

  // Assina TODAS as miniaturas em UMA chamada (em vez de 1 request por linha).
  const paths = (data ?? []).map((r) => r.thumb_path).filter((p): p is string => !!p);
  const urlPorPath: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await db.storage.from('conferencia').createSignedUrls(paths, 3600);
    (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) urlPorPath[s.path] = s.signedUrl; });
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id, grupoId: r.grupo_id, grupoNome: r.grupo_nome, clienteId: r.cliente_id,
    remetente: r.remetente ?? '', enviadoEm: fmtTs(r.enviado_em),
    thumbUrl: r.thumb_path ? (urlPorPath[r.thumb_path] ?? null) : null,
    reagida: r.reagida, lancada: r.lancada, ignorada: r.ignorada, emoji: r.emoji, apostaId: r.aposta_id,
    pedidoStatus: r.pedido_status ?? null, pedidoErro: r.pedido_erro ?? null,
  }));
  return { rows, total: count ?? 0 };
}

export async function ignorarImagem(id: number, ignorar = true): Promise<void> {
  await exigirSessao();
  const db = createAdminClient();
  const { error } = await db.from('imagens_recebidas').update({ ignorada: ignorar }).eq('id', id);
  if (error) throw error;
}

/** Enfileira um pedido de "lançar" (reagir) direto do painel. O bot processa e transcreve. */
export async function lancarImagem(id: number, emoji: string, odd?: string, valor?: string): Promise<{ ok: boolean; erro?: string }> {
  await exigirSessao();
  const db = createAdminClient();
  const { data: img } = await db.from('imagens_recebidas').select('cliente_id,reagida').eq('id', id).single();
  if (!img) return { ok: false, erro: 'Imagem não encontrada.' };
  if (!img.cliente_id) return { ok: false, erro: 'Grupo sem cliente cadastrado — cadastre o cliente com o nome do grupo.' };
  if (img.reagida) return { ok: false, erro: 'Esta imagem já foi transcrita.' };
  const { error } = await db.from('imagens_recebidas')
    .update({ pedido_status: 'pendente', pedido_emoji: emoji, pedido_odd: odd || null, pedido_valor: valor || null, pedido_erro: null })
    .eq('id', id);
  if (error) return { ok: false, erro: 'Não foi possível enfileirar. Tente de novo.' };
  return { ok: true };
}

// ═══════════════════ DESPESAS (documentação semanal) ═══════════════════
async function despesasDaSemana(db: ReturnType<typeof createAdminClient>, mon: Date, rotulo: string): Promise<SemanaDespesas> {
  const { d1, d2 } = janelaSemana(mon);
  const { data } = await db.from('despesas').select('id,descricao,valor,data,grupo_nome')
    .gte('data', `${d1}T00:00:00-03:00`)
    .lte('data', `${d2}T23:59:59.999-03:00`)
    .order('data', { ascending: false });
  const rows: Despesa[] = (data ?? []).map((r) => ({
    id: r.id, descricao: r.descricao, valor: Number(r.valor), data: fmtTs(r.data), grupoNome: r.grupo_nome,
  }));
  const total = rows.reduce((s, r) => s + r.valor, 0);
  return { rotulo, d1, d2, rows, total };
}

export async function listarDespesas(): Promise<DespesasResp> {
  await exigirSessao();
  const db = createAdminClient();
  const { atual, passada } = semanasBR();
  const [a, p] = await Promise.all([
    despesasDaSemana(db, atual, 'Semana atual'),
    despesasDaSemana(db, passada, 'Semana passada'),
  ]);
  return { atual: a, passada: p };
}

/** Despesas por período arbitrário (datas vazias = todo o histórico). */
export async function listarDespesasPeriodo(dt1?: string | null, dt2?: string | null): Promise<SemanaDespesas> {
  await exigirSessao();
  const db = createAdminClient();
  let q = db.from('despesas').select('id,descricao,valor,data,grupo_nome').order('data', { ascending: false });
  if (dt1) q = q.gte('data', `${dt1}T00:00:00-03:00`);
  if (dt2) q = q.lte('data', `${dt2}T23:59:59.999-03:00`);
  const { data } = await q;
  const rows: Despesa[] = (data ?? []).map((r) => ({
    id: r.id, descricao: r.descricao, valor: Number(r.valor), data: fmtTs(r.data), grupoNome: r.grupo_nome,
  }));
  const total = rows.reduce((s, r) => s + r.valor, 0);
  return { rotulo: 'Período', d1: dt1 || '', d2: dt2 || '', rows, total };
}

export async function excluirDespesa(id: number): Promise<void> {
  await exigirSessao();
  const db = createAdminClient();
  const { error } = await db.from('despesas').delete().eq('id', id);
  if (error) throw error;
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
    if (patch.st !== 'EM ABERTO') { upd.contestada = false; upd.contestada_em = null; upd.contestacao = null; }
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
