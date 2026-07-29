'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  type Afiliado, type Cliente, type Reg,
  type AfiliadoRow, type ClienteRow, type ApostaRow,
  type ApostasPage, type FiltroApostas, type Totals, type FechCliResp, type FechAfResp,
  type AcertosResp, type AcertoCliente, type AcertoMov,
  mapAfiliado, mapCliente, mapAposta, parseTs, fmtTs, pisoDuasSemanas,
} from './types';
import type { ConfGrupo, ConfImagensResp, ConfFiltro } from './conferencia/types';
import type { DespesasResp, SemanaDespesas, Despesa } from './despesas/types';
import type { Conta, NovaConta, PatchConta, MovimentoConta } from './contas/types';
import { semanasBR, janelaSemana } from '@/lib/semana';
import { atorAtual, type Ator } from '@/lib/auth-equipe';
import { limparEquipeCookie } from '@/lib/equipe-session';
import { hashSenha, conferirSenha } from '@/lib/senha';
import { createClient } from '@/lib/supabase/server';

// ═══════════════════ LISTAGEM / FECHAMENTO (paginação no servidor) ═══════════════════
export async function listarApostas(f: FiltroApostas): Promise<ApostasPage> {
  const ator = await exigir('operador');
  const db = createAdminClient();
  // Operador: piso de data = segunda-feira da semana passada (só vê semana atual + anterior).
  // Força no servidor — se o filtro pedir algo mais antigo, é elevado ao piso.
  let dt1 = f.dt1 || null;
  if (ator.tipo === 'operador') {
    const piso = pisoDuasSemanas();
    dt1 = (!dt1 || dt1 < piso) ? piso : dt1;
  }
  const { data, error } = await db.rpc('controle_listar', {
    p_dt1: dt1, p_dt2: f.dt2 || null,
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
  const rows = (j.rows ?? []).map(mapAposta);
  if (ator.tipo === 'operador') {
    // Zera o financeiro da banca no bilhete (comissão + saldos). A UI também esconde as colunas.
    for (const r of rows) { r.sb = 0; r.cm = 0; r.caf = 0; r.sl = 0; }
    return { rows, total: j.total ?? 0, totals: totaisSemFinanceiro(j.totals) };
  }
  return { rows, total: j.total ?? 0, totals: j.totals };
}

export async function fechamentoClientes(dt1?: string | null, dt2?: string | null): Promise<FechCliResp> {
  await exigir('gestor');
  const db = createAdminClient();
  const { data, error } = await db.rpc('fechamento_clientes', { p_dt1: dt1 || null, p_dt2: dt2 || null });
  if (error) throw error;
  return data as FechCliResp;
}

export async function fechamentoAfiliados(dt1?: string | null, dt2?: string | null): Promise<FechAfResp> {
  await exigir('gestor');
  const db = createAdminClient();
  const { data, error } = await db.rpc('fechamento_afiliados', { p_dt1: dt1 || null, p_dt2: dt2 || null });
  if (error) throw error;
  return data as FechAfResp;
}

// Todos os bilhetes de um cliente no período (para o PDF de fechamento). Sem paginar.
export async function bilhetesCliente(clienteId: number, dt1?: string | null, dt2?: string | null): Promise<Reg[]> {
  await exigir('gestor');
  const db = createAdminClient();
  const { data, error } = await db.rpc('controle_listar', {
    p_dt1: dt1 || null, p_dt2: dt2 || null,
    p_id: null, p_cliente: clienteId,
    p_status: null, p_jogo: null, p_descarrego: null,
    p_odd_min: null, p_odd_max: null, p_val_min: null, p_val_max: null,
    p_bl: null, p_adv: null, p_irr: null,
    p_sort: 'data_asc', p_page: 1, p_per: 5000, p_pendentes: null,
  });
  if (error) throw error;
  const j = data as { rows: ApostaRow[] };
  return (j.rows ?? []).map(mapAposta);
}

// ═══════════════════ ACERTOS (pagamentos/recebimentos) ═══════════════════
// Camada de acompanhamento por cima do fechamento. NÃO toca em aposta: só lê o
// saldo líquido ao vivo (fechamento_clientes) e cruza com os movimentos de
// dinheiro dados baixa na tabela `acertos`. Migração 028.

const EPS = 0.005; // tolerância de centavo para considerar "sem saldo"

/** Saldo líquido por cliente no período, direto do fechamento (ao vivo). */
async function saldosPeriodo(db: ReturnType<typeof createAdminClient>, dt1: string, dt2: string): Promise<Map<number, { nome: string; sl: number }>> {
  const { data, error } = await db.rpc('fechamento_clientes', { p_dt1: dt1 || null, p_dt2: dt2 || null });
  if (error) throw error;
  const j = data as FechCliResp;
  const m = new Map<number, { nome: string; sl: number }>();
  for (const r of j.rows ?? []) m.set(r.id, { nome: r.nome, sl: Number(r.sl) || 0 });
  return m;
}

/** Lista os acertos do período: por cliente com saldo, pago/recebido, pendente e histórico + totais. */
export async function listarAcertos(dt1: string, dt2: string): Promise<AcertosResp> {
  await exigir('admin');  // controle de dinheiro dos donos
  const db = createAdminClient();
  const saldos = await saldosPeriodo(db, dt1, dt2);

  const { data: movs, error } = await db.from('acertos')
    .select('id,cliente_id,tipo,valor,obs,ator_nome,criado_em')
    .eq('dt1', dt1).eq('dt2', dt2)
    .order('criado_em', { ascending: true });
  if (error) throw error;

  const porCliente = new Map<number, AcertoMov[]>();
  for (const m of movs ?? []) {
    const arr = porCliente.get(m.cliente_id) ?? [];
    arr.push({ id: m.id, tipo: m.tipo, valor: Number(m.valor) || 0, obs: m.obs ?? '', ator: m.ator_nome ?? '—', quando: fmtTs(m.criado_em) });
    porCliente.set(m.cliente_id, arr);
  }

  // Todos os clientes que TÊM saldo no período OU já têm algum movimento lançado.
  const ids = new Set<number>([...saldos.keys(), ...porCliente.keys()]);
  const rows: AcertoCliente[] = [];
  const tot = { aPagar: 0, pago: 0, faltaPagar: 0, aReceber: 0, recebido: 0, faltaReceber: 0 };

  for (const id of ids) {
    const s = saldos.get(id);
    const movimentos = porCliente.get(id) ?? [];
    // nome: do fechamento; se o cliente só tem movimento (saldo mudou p/ 0), busca na tabela.
    let nome = s?.nome ?? '';
    const sl = s?.sl ?? 0;
    if (!nome) { const { data: c } = await db.from('clientes').select('nome').eq('id', id).maybeSingle(); nome = c?.nome ?? `#${id}`; }
    if (Math.abs(sl) < EPS && movimentos.length === 0) continue;

    const direcao: 'pagar' | 'receber' = sl >= 0 ? 'pagar' : 'receber';
    const devido = Math.abs(sl);
    const liquidado = movimentos.reduce((a, m) => a + m.valor, 0);
    const pendente = devido - liquidado;
    rows.push({ clienteId: id, nome, sl, direcao, devido, liquidado, pendente, movimentos });

    if (direcao === 'pagar') { tot.aPagar += devido; tot.pago += liquidado; }
    else { tot.aReceber += devido; tot.recebido += liquidado; }
  }

  tot.faltaPagar = tot.aPagar - tot.pago;
  tot.faltaReceber = tot.aReceber - tot.recebido;
  // Ordena: maior pendência primeiro (o que falta acertar aparece no topo).
  rows.sort((a, b) => b.pendente - a.pendente);
  return { rows, tot };
}

/** Lança um pagamento/recebimento contra o saldo do cliente no período. O tipo é
 *  DEDUZIDO do saldo (ganhou->pago, perdeu->recebido) para não depender do cliente. */
export async function registrarAcerto(clienteId: number, dt1: string, dt2: string, valor: number, obs?: string): Promise<{ ok: boolean; erro?: string; mov?: AcertoMov }> {
  const ator = await exigir('admin');
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return { ok: false, erro: 'Informe um valor maior que zero.' };
  const db = createAdminClient();
  const saldos = await saldosPeriodo(db, dt1, dt2);
  const s = saldos.get(clienteId);
  if (!s || Math.abs(s.sl) < EPS) return { ok: false, erro: 'Este cliente não tem saldo a acertar no período.' };
  const tipo: 'pago' | 'recebido' = s.sl >= 0 ? 'pago' : 'recebido';

  const { data, error } = await db.from('acertos').insert({
    banca_id: await bancaId(db), cliente_id: clienteId, dt1, dt2, tipo, valor: v,
    obs: (obs || '').slice(0, 200) || null, ator_tipo: ator.tipo, ator_nome: ator.nome,
  }).select('id,tipo,valor,obs,ator_nome,criado_em').single();
  if (error) return { ok: false, erro: 'Não foi possível registrar o acerto.' };
  return { ok: true, mov: { id: data.id, tipo: data.tipo, valor: Number(data.valor), obs: data.obs ?? '', ator: data.ator_nome ?? '—', quando: fmtTs(data.criado_em) } };
}

/** Remove um lançamento de acerto (correção de erro). Manual, por admin. */
export async function excluirAcerto(id: number): Promise<{ ok: boolean; erro?: string }> {
  await exigir('admin');
  const db = createAdminClient();
  const { error } = await db.from('acertos').delete().eq('id', id);
  if (error) return { ok: false, erro: 'Não foi possível remover o lançamento.' };
  return { ok: true };
}

// ═══════════════════ CONFERÊNCIA DE GRUPOS ═══════════════════
export async function listarConfGrupos(dt1?: string | null, dt2?: string | null): Promise<ConfGrupo[]> {
  await exigir('operador');
  const db = createAdminClient();
  const { data, error } = await db.rpc('conferencia_grupos', { p_dt1: dt1 || null, p_dt2: dt2 || null });
  if (error) throw error;
  return (data ?? []) as ConfGrupo[];
}

export async function listarConfImagens(f: ConfFiltro): Promise<ConfImagensResp> {
  await exigir('operador');
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
    remetente: r.remetente ?? '', enviadoEm: fmtTs(r.enviado_em), legenda: r.legenda ?? '',
    thumbUrl: r.thumb_path ? (urlPorPath[r.thumb_path] ?? null) : null,
    reagida: r.reagida, lancada: r.lancada, ignorada: r.ignorada, emoji: r.emoji, apostaId: r.aposta_id,
    apostaExcluida: !!r.aposta_excluida,
    pedidoStatus: r.pedido_status ?? null, pedidoErro: r.pedido_erro ?? null,
  }));
  return { rows, total: count ?? 0 };
}

export async function ignorarImagem(id: number, ignorar = true): Promise<void> {
  await exigir('operador');
  const db = createAdminClient();
  const { error } = await db.from('imagens_recebidas').update({ ignorada: ignorar }).eq('id', id);
  if (error) throw error;
}

/** Enfileira um pedido de "lançar" (reagir) direto do painel. O bot processa e transcreve. */
export async function lancarImagem(id: number, emoji: string, odd?: string, valor?: string): Promise<{ ok: boolean; erro?: string }> {
  await exigir('operador');
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
  await exigir('gestor');
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
  await exigir('gestor');
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
  await exigir('gestor');
  const db = createAdminClient();
  const { error } = await db.from('despesas').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════ CONTAS (controle dos donos) ═══════════════════
interface ContaRow {
  id: number; casa: string | null; login: string | null; nome: string | null; cpf: string | null;
  saldo: number | string; em_aberto: number | string; deposito: number | string; retirada: number | string;
  atualizado_em: string;
}
function mapConta(r: ContaRow): Conta {
  return {
    id: r.id, casa: r.casa ?? '', login: r.login ?? '', nome: r.nome ?? '', cpf: r.cpf ?? '',
    saldo: Number(r.saldo ?? 0), emAberto: Number(r.em_aberto ?? 0),
    deposito: Number(r.deposito ?? 0), retirada: Number(r.retirada ?? 0),
    atualizadoEm: r.atualizado_em,
  };
}

export async function listarContas(): Promise<Conta[]> {
  await exigir('gestor');
  const db = createAdminClient();
  const { data, error } = await db.from('contas').select('*').order('casa', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ContaRow[]).map(mapConta);
}

/**
 * Grava os movimentos da conta comparando os totais ANTES x DEPOIS.
 * Ex.: total depositado foi de 1.000 para 3.000 -> depósito de 2.000, com data/hora.
 * Falha aqui não derruba o salvamento da conta: o histórico é registro, não o dado.
 */
async function registrarMovimentos(
  db: ReturnType<typeof createAdminClient>,
  contaId: number,
  antes: ContaRow,
  depois: ContaRow,
) {
  const campos: [MovimentoConta['tipo'], keyof ContaRow][] = [
    ['deposito', 'deposito'], ['retirada', 'retirada'], ['saldo', 'saldo'], ['em_aberto', 'em_aberto'],
  ];
  const linhas = campos.flatMap(([tipo, col]) => {
    const de = Number(antes[col] ?? 0);
    const para = Number(depois[col] ?? 0);
    const valor = Number((para - de).toFixed(2));
    return valor === 0 ? [] : [{ conta_id: contaId, tipo, valor, de, para }];
  });
  if (!linhas.length) return;
  const { error } = await db.from('contas_movimentos').insert(linhas);
  // O histórico é registro, não o dado: se a tabela ainda não existe (migração 018
  // pendente) ou o insert falha, a conta JÁ foi salva e não pode ser perdida por isso.
  if (error) console.error('histórico da conta:', error.message);
}

export async function criarConta(input: NovaConta): Promise<Conta> {
  await exigir('gestor');
  const db = createAdminClient();
  const { data, error } = await db.from('contas').insert({
    banca_id: await bancaId(db),
    casa: input.casa, login: input.login, nome: input.nome, cpf: input.cpf,
    saldo: input.saldo, em_aberto: input.emAberto, deposito: input.deposito, retirada: input.retirada,
    atualizado_em: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  const row = data as ContaRow;
  // Conta que já nasce com depósito/saldo: isso também é movimento e vai para o histórico.
  const zerada = { deposito: 0, retirada: 0, saldo: 0, em_aberto: 0 } as unknown as ContaRow;
  await registrarMovimentos(db, row.id, zerada, row);
  return mapConta(row);
}

export async function atualizarConta(id: number, patch: PatchConta): Promise<Conta> {
  await exigir('gestor');
  const db = createAdminClient();
  // Estado atual, para saber o que mudou e registrar no histórico.
  const { data: antes } = await db.from('contas').select('*').eq('id', id).maybeSingle();

  // Toda atualização carimba a data/hora (é o "atualizei o saldo hoje").
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (patch.casa !== undefined) upd.casa = patch.casa;
  if (patch.login !== undefined) upd.login = patch.login;
  if (patch.nome !== undefined) upd.nome = patch.nome;
  if (patch.cpf !== undefined) upd.cpf = patch.cpf;
  if (patch.saldo !== undefined) upd.saldo = patch.saldo;
  if (patch.emAberto !== undefined) upd.em_aberto = patch.emAberto;
  if (patch.deposito !== undefined) upd.deposito = patch.deposito;
  if (patch.retirada !== undefined) upd.retirada = patch.retirada;
  const { data, error } = await db.from('contas').update(upd).eq('id', id).select('*').single();
  if (error) throw error;
  if (antes) await registrarMovimentos(db, id, antes as ContaRow, data as ContaRow);
  return mapConta(data as ContaRow);
}

/**
 * Lança um NOVO movimento na conta (o caminho normal do dia a dia).
 * O operador informa só o valor do lançamento — quem soma ao total acumulado é o
 * sistema. Antes era preciso abrir "Editar", ver o total, somar de cabeça e digitar
 * o resultado: conta de cabeça em cima de dinheiro é erro esperando para acontecer.
 *
 * `ajustarSaldo` = o dinheiro entrou/saiu da casa agora, então o saldo acompanha
 * (depósito soma, retirada subtrai). Desmarque se o saldo digitado já considera isso.
 */
export async function lancarMovimentoConta(
  contaId: number,
  tipo: 'deposito' | 'retirada',
  valor: number,
  ajustarSaldo = true,
): Promise<Conta> {
  await exigir('gestor');
  if (!(valor > 0)) throw new Error('Informe um valor maior que zero.');
  const db = createAdminClient();
  const { data: antes, error: e1 } = await db.from('contas').select('*').eq('id', contaId).maybeSingle();
  if (e1) throw e1;
  if (!antes) throw new Error('Conta não encontrada.');
  const a = antes as ContaRow;

  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (tipo === 'deposito') {
    upd.deposito = Number((Number(a.deposito ?? 0) + valor).toFixed(2));
    if (ajustarSaldo) upd.saldo = Number((Number(a.saldo ?? 0) + valor).toFixed(2));
  } else {
    upd.retirada = Number((Number(a.retirada ?? 0) + valor).toFixed(2));
    if (ajustarSaldo) upd.saldo = Number((Number(a.saldo ?? 0) - valor).toFixed(2));
  }

  const { data, error } = await db.from('contas').update(upd).eq('id', contaId).select('*').single();
  if (error) throw error;
  await registrarMovimentos(db, contaId, a, data as ContaRow);
  return mapConta(data as ContaRow);
}

/** Histórico de movimentação de uma conta (mais recente primeiro). */
export async function listarMovimentosConta(contaId: number): Promise<MovimentoConta[]> {
  await exigir('gestor');
  const db = createAdminClient();
  const { data, error } = await db.from('contas_movimentos')
    .select('id,conta_id,tipo,valor,de,para,criado_em')
    .eq('conta_id', contaId).order('criado_em', { ascending: false }).limit(500);
  // Migração 018 pendente: mostra o histórico vazio em vez de estourar a tela.
  if (error && /contas_movimentos/.test(error.message)) return [];
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, contaId: r.conta_id, tipo: r.tipo as MovimentoConta['tipo'],
    valor: Number(r.valor), de: Number(r.de ?? 0), para: Number(r.para ?? 0),
    criadoEm: fmtTs(r.criado_em),
  }));
}

export async function excluirConta(id: number): Promise<void> {
  await exigir('gestor');
  const db = createAdminClient();
  const { error } = await db.from('contas').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════ STATUS DO BOT (health da Railway) ═══════════════════
export type BotStatus = { ok: boolean; pronto: boolean; upS: number };
export async function statusBot(): Promise<BotStatus> {
  await exigir('operador');
  const urlBot = process.env.BOT_HEALTH_URL || 'https://primebet-production.up.railway.app/health';
  try {
    const r = await fetch(urlBot, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, pronto: false, upS: 0 };
    const t = await r.text(); // ex.: "ok up=160614s pronto=false"
    return { ok: true, pronto: /pronto=true/.test(t), upS: Number(t.match(/up=(\d+)/)?.[1] || 0) };
  } catch {
    return { ok: false, pronto: false, upS: 0 };
  }
}

// ═══════════════════ PLANO / COTA DE TRANSCRIÇÕES ═══════════════════
export interface PlanoConfig {
  nome: string; cota: number; precoExcedente: number; renovaDia: number;
}
export interface UsoCota {
  cicloInicio: string; usados: number; cota: number; excedente: number;
  valorExcedente: number; precoExcedente: number; pct: number;
}

/** Config do plano + uso ao vivo (consulta na função uso_cota). */
export async function lerPlano(): Promise<{ config: PlanoConfig; uso: UsoCota }> {
  await exigir('gestor');
  const db = createAdminClient();
  const id = await bancaId(db);
  const { data: b } = await db.from('bancas')
    .select('plano_nome,cota_mensal,preco_excedente,renova_dia').eq('id', id).single();
  const { data: u, error } = await db.rpc('uso_cota', { p_banca_id: id });
  if (error) throw error;
  const r = (Array.isArray(u) ? u[0] : u) ?? {};
  return {
    config: {
      nome: b?.plano_nome ?? 'Pro',
      cota: Number(b?.cota_mensal ?? 0),
      precoExcedente: Number(b?.preco_excedente ?? 1),
      renovaDia: Number(b?.renova_dia ?? 1),
    },
    uso: {
      cicloInicio: r.ciclo_inicio ?? '',
      usados: Number(r.usados ?? 0),
      cota: Number(r.cota ?? 0),
      excedente: Number(r.excedente ?? 0),
      valorExcedente: Number(r.valor_excedente ?? 0),
      precoExcedente: Number(r.preco_excedente ?? 1),
      pct: Number(r.pct ?? 0),
    },
  };
}

/** Edita a config do plano. Devolve o uso recalculado. */
export async function atualizarPlano(patch: Partial<PlanoConfig>): Promise<{ config: PlanoConfig; uso: UsoCota }> {
  await exigir('master');  // plano/cota é cobrança da rede — só o master (você) edita
  const db = createAdminClient();
  const id = await bancaId(db);
  const up: Record<string, unknown> = {};
  if (patch.nome !== undefined) up.plano_nome = patch.nome;
  if (patch.cota !== undefined) up.cota_mensal = Math.max(0, Math.round(patch.cota));
  if (patch.precoExcedente !== undefined) up.preco_excedente = Math.max(0, patch.precoExcedente);
  if (patch.renovaDia !== undefined) up.renova_dia = Math.min(28, Math.max(1, Math.round(patch.renovaDia)));
  if (Object.keys(up).length) {
    const { error } = await db.from('bancas').update(up).eq('id', id);
    if (error) throw error;
  }
  return lerPlano();
}

/** Zera o contador: passa a contar só o que vier a partir de agora (reset manual). */
export async function zerarContadorCota(): Promise<{ config: PlanoConfig; uso: UsoCota }> {
  await exigir('master');  // zerar contador afeta a cobrança — só o master
  const db = createAdminClient();
  const id = await bancaId(db);
  const { error } = await db.from('bancas').update({ contador_zerado_em: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  return lerPlano();
}

// ─────────── Auth: admin (dono), gestor ou operador logado ───────────
// Devolve QUEM está agindo — a Fase 3 usa isto para gatear por papel e p/ a auditoria.
async function exigirSessao(): Promise<Ator> {
  const ator = await atorAtual();
  if (!ator) throw new Error('Não autenticado.');
  return ator;
}

// Mínimo de papel por ação. admin(3) > gestor(2) > operador(1). A trava é AQUI (servidor):
// esconder no front não basta — o operador não pode nem CONSEGUIR chamar o que é financeiro.
const NIVEL: Record<Ator['tipo'], number> = { operador: 1, gestor: 2, admin: 3, master: 4 };
async function exigir(min: Ator['tipo']): Promise<Ator> {
  const ator = await exigirSessao();
  if (NIVEL[ator.tipo] < NIVEL[min]) throw new Error('Sem permissão para esta ação.');
  return ator;
}

// Operador não vê o financeiro da banca: zera comissão/saldos nos totais (a UI também esconde).
function totaisSemFinanceiro(t: Totals): Totals {
  return { ...t, saldo_bruto: 0, comissao: 0, comissao_afiliado: 0, saldo_liquido: 0 };
}

// ── Auditoria (histórico do bilhete): registra QUEM alterou o quê ──
type AuditItem = { acao: string; campo?: string | null; de?: string | null; para?: string | null };
async function auditar(db: ReturnType<typeof createAdminClient>, apostaId: number, ator: Ator, itens: AuditItem[]): Promise<void> {
  if (!itens.length) return;
  const { error } = await db.from('auditoria').insert(itens.map((i) => ({
    aposta_id: apostaId, ator_tipo: ator.tipo, ator_nome: ator.nome,
    acao: i.acao, campo: i.campo ?? null, de: i.de ?? null, para: i.para ?? null,
  })));
  // Best-effort: o histórico NUNCA pode derrubar a operação principal (só loga a falha).
  if (error) console.error('auditoria:', error.message);
}

/** Logout da equipe (gestor/operador): limpa o cookie assinado. */
export async function sairEquipe(): Promise<void> {
  await limparEquipeCookie();
}

/**
 * Troca a PRÓPRIA senha (qualquer papel logado no painel). Confere a senha ATUAL
 * antes de trocar. Master (Supabase Auth) muda no Auth; equipe (admin/gestor/
 * operador) grava novo hash scrypt na tabela equipe.
 */
export async function alterarMinhaSenha(atual: string, nova: string): Promise<{ ok: boolean; erro?: string }> {
  const ator = await atorAtual();
  if (!ator) return { ok: false, erro: 'Não autenticado.' };
  if (String(nova || '').length < 4) return { ok: false, erro: 'A nova senha precisa ter pelo menos 4 caracteres.' };

  if (ator.tipo === 'master') {
    const supabase = await createClient();
    const email = process.env.ADMIN_EMAIL || 'admin@primebet.app';
    // Confere a senha atual re-autenticando; depois troca no Supabase Auth.
    const { error: eLogin } = await supabase.auth.signInWithPassword({ email, password: String(atual || '') });
    if (eLogin) return { ok: false, erro: 'Senha atual incorreta.' };
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) return { ok: false, erro: 'Não foi possível trocar a senha.' };
    return { ok: true };
  }

  // Equipe: confere o hash atual e grava o novo.
  const db = createAdminClient();
  const { data: eq } = await db.from('equipe').select('id,senha_hash').ilike('nome', ator.nome).maybeSingle();
  if (!eq) return { ok: false, erro: 'Usuário não encontrado.' };
  if (!conferirSenha(String(atual || ''), String(eq.senha_hash))) return { ok: false, erro: 'Senha atual incorreta.' };
  const { error } = await db.from('equipe').update({ senha_hash: hashSenha(nova), atualizado_em: new Date().toISOString() }).eq('id', eq.id);
  if (error) return { ok: false, erro: 'Não foi possível trocar a senha.' };
  return { ok: true };
}

// ─────────── Usuários da equipe (admin/gestor/operador) ───────────
export type EquipeUser = { id: number; nome: string; papel: 'admin' | 'gestor' | 'operador'; ativo: boolean };

/**
 * Lista a equipe conforme o poder de quem pede:
 *  • master : todos (inclusive os admins dos donos);
 *  • admin  : gestor + operador (não gerencia outros admins);
 *  • gestor : só operador.
 */
export async function listarEquipe(): Promise<EquipeUser[]> {
  const ator = await exigir('gestor');
  const db = createAdminClient();
  let q = db.from('equipe').select('id,nome,papel,ativo').order('papel', { ascending: true }).order('nome', { ascending: true });
  if (ator.tipo === 'gestor') q = q.eq('papel', 'operador');
  else if (ator.tipo === 'admin') q = q.in('papel', ['gestor', 'operador']);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EquipeUser[];
}

/** Cria admin/gestor/operador. Senha com hash (scrypt), nunca texto puro.
 *  Criar ADMIN é privilégio do MASTER; gestor/operador o admin também cria. */
export async function criarEquipe(nome: string, senha: string, papel: 'admin' | 'gestor' | 'operador'): Promise<{ ok: boolean; erro?: string }> {
  const ator = await exigir('admin');
  if (papel === 'admin' && ator.tipo !== 'master') return { ok: false, erro: 'Só o dono da rede (master) pode criar outro admin.' };
  const login = String(nome || '').trim();
  if (!login || String(senha || '').length < 4) return { ok: false, erro: 'Informe o nome e uma senha de pelo menos 4 caracteres.' };
  if (papel !== 'admin' && papel !== 'gestor' && papel !== 'operador') return { ok: false, erro: 'Papel inválido.' };
  if (login.toLowerCase() === 'admin') return { ok: false, erro: 'O nome "admin" é reservado.' };
  if (!/^[A-Za-z0-9 ._-]{2,40}$/.test(login)) return { ok: false, erro: 'Nome inválido (use letras, números, espaço, . _ -).' };
  const db = createAdminClient();
  // Não pode colidir com nome de cliente — senão o /login ficaria ambíguo.
  const { data: cli } = await db.from('clientes').select('id').ilike('nome', login).limit(1);
  if (cli && cli.length) return { ok: false, erro: 'Já existe um cliente com esse nome. Escolha outro.' };
  const { error } = await db.from('equipe').insert({ nome: login, senha_hash: hashSenha(senha), papel, ativo: true });
  if (error) return { ok: false, erro: /duplicate|unique/i.test(error.message) ? 'Já existe um usuário com esse nome.' : 'Não foi possível criar o usuário.' };
  return { ok: true };
}

/** Redefine a senha de um membro. Admin: qualquer um. Gestor: só operador. */
export async function resetarSenhaEquipe(id: number, novaSenha: string): Promise<{ ok: boolean; erro?: string }> {
  const ator = await exigir('gestor');
  if (String(novaSenha || '').length < 4) return { ok: false, erro: 'Senha muito curta (mín. 4).' };
  const db = createAdminClient();
  const { data: alvo } = await db.from('equipe').select('id,papel').eq('id', id).maybeSingle();
  if (!alvo) return { ok: false, erro: 'Usuário não encontrado.' };
  if (ator.tipo === 'gestor' && alvo.papel !== 'operador') return { ok: false, erro: 'Sem permissão para redefinir a senha deste usuário.' };
  // Admin não mexe em outro admin — só o master.
  if (alvo.papel === 'admin' && ator.tipo !== 'master') return { ok: false, erro: 'Só o dono da rede (master) pode redefinir a senha de um admin.' };
  const { error } = await db.from('equipe').update({ senha_hash: hashSenha(novaSenha), atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, erro: 'Não foi possível redefinir a senha.' };
  return { ok: true };
}

/** Ativa/desativa um membro (desativado não loga). Admin: gestor/operador. Admin só o master. */
export async function definirAtivoEquipe(id: number, ativo: boolean): Promise<void> {
  const ator = await exigir('admin');
  const db = createAdminClient();
  const { data: alvo } = await db.from('equipe').select('papel').eq('id', id).maybeSingle();
  if (alvo?.papel === 'admin' && ator.tipo !== 'master') throw new Error('Só o dono da rede (master) pode ativar/desativar um admin.');
  await db.from('equipe').update({ ativo, atualizado_em: new Date().toISOString() }).eq('id', id);
}

// id da banca padrão (mono-banca PrimeBet) — obrigatório em clientes/afiliados/apostas.
async function bancaId(db: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await db.from('bancas').select('id').eq('slug', 'primebet').maybeSingle();
  return (data?.id as number) ?? 1;
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
  const ator = await exigir('operador');
  const db = createAdminClient();
  const { data: cli } = await db.from('clientes').select('banca_id').eq('id', input.cId).single();
  const { data, error } = await db.from('apostas').insert({
    banca_id: cli?.banca_id,
    cliente_id: input.cId, jogo: input.jogo, odd: input.odd, valor: input.val,
    status: input.st, casa: input.dc || '', origem: 'manual',
  }).select('*').single();
  if (error) throw error;
  const nova = data as ApostaRow;
  await auditar(db, nova.id, ator, [{ acao: 'lancamento', para: `manual · odd ${Number(input.odd)} · R$ ${Number(input.val)} · ${input.st}` }]);
  return mapAposta(nova);
}

export interface PatchAposta {
  dt?: string; odd?: number; val?: number; st?: string; dc?: string;
  bl?: boolean; adv?: boolean; irr?: boolean; obs?: string; cId?: number; jogo?: string;
}

export async function atualizarAposta(id: number, patch: PatchAposta): Promise<Reg> {
  const ator = await exigir('operador');
  const db = createAdminClient();
  // Estado ANTES (para o histórico registrar de→para em cada campo alterado).
  const { data: antesRaw } = await db.from('apostas').select('*').eq('id', id).maybeSingle();
  if (!antesRaw) throw new Error(`Aposta #${id} não encontrada.`);
  const antes = antesRaw as ApostaRow;
  const upd: Record<string, unknown> = {};
  if (patch.dt !== undefined) upd.data = parseTs(patch.dt);
  if (patch.odd !== undefined) upd.odd = patch.odd;
  if (patch.val !== undefined) upd.valor = patch.val;
  if (patch.st !== undefined) {
    upd.status = patch.st;
    // Ao resolver (sair de EM ABERTO), encerra eventual contestação -> sai da fila do admin.
    if (patch.st !== 'EM ABERTO') { upd.contestada = false; upd.contestada_em = null; upd.contestacao = null; upd.contestacao_status = null; }
  }
  if (patch.dc !== undefined) upd.casa = patch.dc;
  if (patch.bl !== undefined) upd.baixa_liquidez = patch.bl;
  if (patch.adv !== undefined) upd.advertido = patch.adv;
  if (patch.irr !== undefined) upd.irregular = patch.irr;
  if (patch.obs !== undefined) upd.advertencia = patch.obs || null;
  if (patch.cId !== undefined) upd.cliente_id = patch.cId;
  if (patch.jogo !== undefined) upd.jogo = patch.jogo;

  // Nada mudou (ex.: clicou "Salvar" sem editar nada). Um UPDATE vazio no PostgREST
  // afeta 0 linhas e quebraria o .single(); então só devolvemos a aposta atual.
  if (Object.keys(upd).length === 0) return mapAposta(antes);

  const { data, error } = await db.from('apostas').update(upd).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Aposta #${id} não encontrada para atualizar.`);
  const depois = data as ApostaRow;

  // Histórico: um item por campo que REALMENTE mudou (antes → depois).
  const S = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const N = (v: unknown) => S(Number(v));
  const B = (v: unknown) => (v ? 'sim' : 'não');
  const itens: AuditItem[] = [];
  if (S(antes.status) !== S(depois.status)) itens.push({ acao: 'status', campo: 'status', de: S(antes.status), para: S(depois.status) });
  if (N(antes.odd) !== N(depois.odd)) itens.push({ acao: 'odd', campo: 'odd', de: N(antes.odd), para: N(depois.odd) });
  if (N(antes.valor) !== N(depois.valor)) itens.push({ acao: 'valor', campo: 'valor', de: N(antes.valor), para: N(depois.valor) });
  if (S(antes.jogo) !== S(depois.jogo)) itens.push({ acao: 'jogo', campo: 'jogo', de: S(antes.jogo).slice(0, 80), para: S(depois.jogo).slice(0, 80) });
  if (S(antes.data) !== S(depois.data)) itens.push({ acao: 'data', campo: 'data', de: fmtTs(S(antes.data)), para: fmtTs(S(depois.data)) });
  if (S(antes.casa) !== S(depois.casa)) itens.push({ acao: 'descarrego', campo: 'casa', de: S(antes.casa), para: S(depois.casa) });
  if (B(antes.baixa_liquidez) !== B(depois.baixa_liquidez)) itens.push({ acao: 'baixa_liq', campo: 'baixa_liquidez', de: B(antes.baixa_liquidez), para: B(depois.baixa_liquidez) });
  if (B(antes.advertido) !== B(depois.advertido)) itens.push({ acao: 'advertencia', campo: 'advertido', de: B(antes.advertido), para: B(depois.advertido) });
  if (B(antes.irregular) !== B(depois.irregular)) itens.push({ acao: 'irregular', campo: 'irregular', de: B(antes.irregular), para: B(depois.irregular) });
  if (S(antes.advertencia) !== S(depois.advertencia)) itens.push({ acao: 'obs', campo: 'advertencia', de: S(antes.advertencia).slice(0, 80), para: S(depois.advertencia).slice(0, 80) });
  if (S(antes.cliente_id) !== S(depois.cliente_id)) itens.push({ acao: 'cliente', campo: 'cliente_id', de: S(antes.cliente_id), para: S(depois.cliente_id) });
  await auditar(db, id, ator, itens);

  return mapAposta(depois);
}

export async function excluirAposta(id: number): Promise<void> {
  const ator = await exigir('gestor');
  const db = createAdminClient();
  const { data: antes } = await db.from('apostas').select('jogo,odd,valor,status').eq('id', id).maybeSingle();
  // Marca a imagem da Conferência como "aposta excluída" ANTES do delete: a FK
  // (on delete set null) vai zerar o aposta_id, então rotulamos agora para não
  // virar "#null". A imagem NÃO some — fica visível com o rótulo e o rastro.
  // Best-effort: se a coluna (migração 025) ainda não existe, a exclusão segue
  // normal (a imagem cai no fallback "lancada && aposta_id null" na exibição).
  await db.from('imagens_recebidas').update({ aposta_excluida: true }).eq('aposta_id', id)
    .then(({ error }) => { if (error) console.warn('aposta_excluida (migração 025 pendente?):', error.message); });
  const { error } = await db.from('apostas').delete().eq('id', id);
  if (error) throw error;
  const a = antes as { jogo?: string; odd?: number | string; valor?: number | string; status?: string } | null;
  const resumo = a ? `${String(a.jogo || '').slice(0, 60)} · odd ${Number(a.odd)} · R$ ${Number(a.valor)} · ${a.status}` : `#${id}`;
  await auditar(db, id, ator, [{ acao: 'exclusao', para: resumo }]);
}

// Grava a resolução de uma contestação preservando o histórico (motivo + status
// sugerido continuam gravados) e registrando o desfecho. O que tira da fila é a
// flag `contestada`. As colunas de registro (migração 019) são best-effort: se
// ainda não existirem, a resolução acontece do mesmo jeito, só sem o marcador.
async function gravarResolucaoCt(
  db: ReturnType<typeof createAdminClient>,
  id: number,
  patchBase: Record<string, unknown>,
  desfecho: 'aceita' | 'recusada',
): Promise<Reg> {
  const marcador = { contestacao_resolvida_em: new Date().toISOString(), contestacao_desfecho: desfecho };
  let r = await db.from('apostas').update({ ...patchBase, ...marcador }).eq('id', id).select('*').maybeSingle();
  if (r.error && /contestacao_resolvida_em|contestacao_desfecho|column|schema cache/i.test(r.error.message)) {
    // Migração 019 ainda não aplicada: grava sem o marcador (o comportamento essencial não pode falhar).
    r = await db.from('apostas').update(patchBase).eq('id', id).select('*').maybeSingle();
  }
  if (r.error) throw r.error;
  if (!r.data) throw new Error(`Aposta #${id} não encontrada.`);
  return mapAposta(r.data as ApostaRow);
}

/** RECUSA a contestação: encerra SEM mudar o status (cliente estava errado). Tira da
 *  fila mantendo o registro de que a aposta foi contestada. */
export async function resolverContestacao(id: number): Promise<Reg> {
  const ator = await exigir('operador');
  const db = createAdminClient();
  const reg = await gravarResolucaoCt(db, id, { contestada: false, contestada_em: null }, 'recusada');
  await auditar(db, id, ator, [{ acao: 'contestacao', para: 'recusada (status mantido)' }]);
  return reg;
}

/** ACEITA a contestação: aplica o status que o cliente sugeriu. O trigger recalcula
 *  o saldo. Encerra a contestação mantendo o registro (motivo/status/desfecho). */
export async function aceitarContestacao(id: number, novoStatus: string): Promise<Reg> {
  const ator = await exigir('operador');
  const db = createAdminClient();
  const reg = await gravarResolucaoCt(db, id, { status: novoStatus, contestada: false, contestada_em: null }, 'aceita');
  await auditar(db, id, ator, [{ acao: 'contestacao', campo: 'status', para: `aceita → ${novoStatus}` }]);
  return reg;
}

// ── Histórico do bilhete (para os donos auditarem quem fez o quê) ──
export type AuditoriaItem = { id: number; ator: string; papel: string; acao: string; campo: string | null; de: string | null; para: string | null; quando: string };

export async function historicoAposta(apostaId: number): Promise<AuditoriaItem[]> {
  await exigir('gestor'); // o histórico é para os donos (gestor/admin) conferirem
  const db = createAdminClient();
  const { data, error } = await db.from('auditoria')
    .select('id,ator_tipo,ator_nome,acao,campo,de,para,criado_em')
    .eq('aposta_id', apostaId).order('criado_em', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as number, ator: r.ator_nome as string, papel: r.ator_tipo as string,
    acao: r.acao as string, campo: (r.campo ?? null) as string | null,
    de: (r.de ?? null) as string | null, para: (r.para ?? null) as string | null,
    quando: fmtTs(r.criado_em as string),
  }));
}

// ── Envio do PDF de fechamento no grupo do cliente (o BOT é quem manda no WhatsApp) ──
// O painel gera o PDF, manda o base64 pra cá; subimos no Storage e criamos o pedido.
export async function enfileirarEnvioPdf(input: { grupoId: string; clienteNome: string; pdfBase64: string; legenda: string }): Promise<{ ok: boolean; erro?: string; id?: number }> {
  await exigir('admin');
  const grupoId = String(input.grupoId || '').trim();
  if (!grupoId) return { ok: false, erro: 'Cliente sem grupo vinculado — não dá para enviar.' };
  if (!input.pdfBase64) return { ok: false, erro: 'PDF vazio.' };
  const db = createAdminClient();
  const safe = (String(input.clienteNome || 'cliente').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)) || 'CLIENTE';
  const path = `${safe}_${Date.now()}.pdf`;
  const buf = Buffer.from(input.pdfBase64, 'base64');
  const up = await db.storage.from('fechamentos').upload(path, buf, { contentType: 'application/pdf', upsert: true });
  if (up.error) return { ok: false, erro: 'Falha ao subir o PDF. Tente de novo.' };
  const { data, error } = await db.from('envios_pdf').insert({
    grupo_id: grupoId, cliente_nome: input.clienteNome || null, storage_path: path,
    legenda: input.legenda || null, status: 'pendente',
  }).select('id').single();
  if (error) return { ok: false, erro: 'Falha ao enfileirar o envio.' };
  return { ok: true, id: data.id };
}

/** Status atual de vários envios (para o painel acompanhar a entrega em tempo real). */
export type EnvioStatus = { id: number; status: 'pendente' | 'enviado' | 'erro'; erro: string | null; tentativas: number };
export async function statusEnviosPdf(ids: number[]): Promise<EnvioStatus[]> {
  await exigir('gestor');
  const lista = (ids || []).filter((n) => Number.isFinite(n));
  if (!lista.length) return [];
  const db = createAdminClient();
  const { data, error } = await db.from('envios_pdf').select('id,status,erro,tentativas').in('id', lista);
  if (error) {
    // tentativas pode não existir (migração 029 pendente) — tenta sem ela.
    const r = await db.from('envios_pdf').select('id,status,erro').in('id', lista);
    return (r.data ?? []).map((e) => ({ id: e.id, status: e.status, erro: e.erro ?? null, tentativas: 0 }));
  }
  return (data ?? []).map((e) => ({ id: e.id, status: e.status, erro: e.erro ?? null, tentativas: e.tentativas ?? 0 }));
}

// ═══════════════════ CLIENTES ═══════════════════
export interface NovoClienteInput {
  nome: string; senha?: string; calcao?: number; desconto?: number;
  comissao?: number; comissaoSup?: number; sup?: string | null; grupoLink?: string | null;
}
const gerarSlug = () => Math.random().toString(36).slice(2, 8);

export async function criarCliente(input: NovoClienteInput): Promise<Cliente> {
  await exigir('admin');
  const db = createAdminClient();
  const nome = input.nome.toUpperCase().trim();

  let afiliadoId: number | null = null;
  if (input.sup) {
    const { data: af } = await db.from('afiliados').select('id').eq('nome', input.sup).maybeSingle();
    afiliadoId = af?.id ?? null;
  }

  const { data, error } = await db.from('clientes').insert({
    banca_id: await bancaId(db),
    nome, senha_hash: input.senha ? hashSenha(input.senha) : null,
    calcao: input.calcao ?? 0, desconto: input.desconto ?? 0,
    comissao_pct: input.comissao ?? 0, afiliado_id: afiliadoId,
    afiliado_comissao_pct: input.comissaoSup ?? 0,
    link: `/${gerarSlug()}/${nome}`,
    grupo_link: input.grupoLink || null,
  }).select('*').single();
  if (error) throw error;
  const m = await afNomeMap(db);
  return mapCliente(data as ClienteRow, m);
}

export interface PatchCliente {
  nome?: string; s?: string; on?: boolean; cal?: number; desc?: number; com?: number; sup?: string | null; af?: number; link?: string | null; grupoLink?: string | null;
}

/**
 * Atualiza o cliente e, se comissão/afiliado mudaram, refaz o cálculo das apostas
 * dele (toca atualizado_em para disparar o trigger). Devolve cliente + apostas afetadas.
 */
export async function atualizarCliente(id: number, patch: PatchCliente): Promise<{ cliente: Cliente; regs: Reg[] }> {
  await exigir('gestor');
  const db = createAdminClient();

  const upd: Record<string, unknown> = {};
  if (patch.nome !== undefined) upd.nome = patch.nome;
  // Senha do cliente guardada com hash (scrypt). O painel manda `s` VAZIO para
  // "manter" (não expõe mais a senha atual) — só re-hasheia quando digitam uma nova.
  if (patch.s) upd.senha_hash = hashSenha(patch.s);
  if (patch.on !== undefined) upd.ativo = patch.on;
  if (patch.cal !== undefined) upd.calcao = patch.cal;
  if (patch.desc !== undefined) upd.desconto = patch.desc;
  if (patch.com !== undefined) upd.comissao_pct = patch.com;
  if (patch.af !== undefined) upd.afiliado_comissao_pct = patch.af;
  if (patch.link !== undefined) upd.link = patch.link || null;
  // Link do grupo mudou -> grava e zera o grupo_id para o bot re-resolver.
  if (patch.grupoLink !== undefined) { upd.grupo_link = patch.grupoLink || null; upd.grupo_id = null; }
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

/**
 * Exclui um cliente. TRAVA: se ele tiver apostas, recusa — apagar levaria junto o
 * histórico/fechamento dele. Nesse caso o certo é desativar (campo "Ativo").
 */
export async function excluirCliente(id: number): Promise<{ ok: boolean; erro?: string }> {
  await exigir('gestor');
  const db = createAdminClient();
  const { count } = await db.from('apostas').select('id', { count: 'exact', head: true }).eq('cliente_id', id);
  if ((count ?? 0) > 0) {
    return { ok: false, erro: `Este cliente tem ${count} aposta(s) no sistema. Desative-o (coluna "Ativo") em vez de excluir — apagar apagaria o histórico dele.` };
  }
  const { error } = await db.from('clientes').delete().eq('id', id);
  if (error) return { ok: false, erro: 'Não foi possível excluir o cliente.' };
  return { ok: true };
}

// ═══════════════════ AFILIADOS ═══════════════════
export async function criarAfiliado(nome: string, com = 0): Promise<Afiliado> {
  await exigir('gestor');
  const db = createAdminClient();
  const { data, error } = await db.from('afiliados').insert({ banca_id: await bancaId(db), nome, comissao_pct: com }).select('*').single();
  if (error) throw error;
  return mapAfiliado(data as AfiliadoRow);
}

/**
 * Exclui um afiliado/supervisor. TRAVA: se houver clientes vinculados a ele, recusa —
 * apagar deixaria esses clientes órfãos e bagunçaria o fechamento de afiliado.
 */
export async function excluirAfiliado(id: number): Promise<{ ok: boolean; erro?: string }> {
  await exigir('gestor');
  const db = createAdminClient();
  const { count } = await db.from('clientes').select('id', { count: 'exact', head: true }).eq('afiliado_id', id);
  if ((count ?? 0) > 0) {
    return { ok: false, erro: `Este supervisor tem ${count} cliente(s) vinculado(s). Troque o supervisor desses clientes antes de excluir.` };
  }
  const { error } = await db.from('afiliados').delete().eq('id', id);
  if (error) return { ok: false, erro: 'Não foi possível excluir o supervisor.' };
  return { ok: true };
}

export async function atualizarAfiliado(id: number, patch: { nome?: string; com?: number }): Promise<Afiliado> {
  await exigir('gestor');
  const db = createAdminClient();
  const upd: Record<string, unknown> = {};
  if (patch.nome !== undefined) upd.nome = patch.nome;
  if (patch.com !== undefined) upd.comissao_pct = patch.com;
  const { data, error } = await db.from('afiliados').update(upd).eq('id', id).select('*').single();
  if (error) throw error;
  return mapAfiliado(data as AfiliadoRow);
}
