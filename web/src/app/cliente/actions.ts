'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClienteSessao, limparClienteCookie } from '@/lib/cliente-session';
import { mapAposta, type ApostaRow } from '../admin/types';
import type { SemanaExtrato, ExtratoResp } from './types';

// Fuso do Brasil (UTC-3, sem horário de verão). Trabalhamos com Datas cujos
// campos UTC representam a "hora de parede" do Brasil, e fechamos a janela da
// consulta com o offset -03:00 para casar com a coluna timestamptz `data`.
const TZ_BR_MS = 3 * 60 * 60 * 1000;
const agoraBR = () => new Date(Date.now() - TZ_BR_MS);
const fmtD = (d: Date) => d.toISOString().split('T')[0];

// segunda-feira (00:00 BR) da semana que contém `base` (base em "BR sobre UTC")
function segunda(base: Date): Date {
  const d = new Date(base);
  const dow = d.getUTCDay(); // 0=dom ... 6=sab (campos UTC = hora BR)
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7)); // recua até segunda
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function semana(db: ReturnType<typeof createAdminClient>, cid: number, mon: Date, rotulo: string): Promise<SemanaExtrato> {
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  const d1 = fmtD(mon), d2 = fmtD(sun);
  const { data } = await db.from('apostas').select('*')
    .eq('cliente_id', cid)
    .gte('data', `${d1}T00:00:00-03:00`)
    .lte('data', `${d2}T23:59:59.999-03:00`)
    .order('data', { ascending: false });
  const rows = ((data ?? []) as ApostaRow[]).map(mapAposta);
  const entradas = rows.reduce((s, r) => s + r.val, 0);
  const saldo = rows.reduce((s, r) => s + r.sl, 0);
  const abertas = rows.filter((r) => r.st === 'EM ABERTO').length;
  return { rotulo, d1, d2, rows, entradas, saldo, abertas };
}

/** Carrega o extrato do cliente logado: semana atual + semana passada. */
export async function carregarExtrato(): Promise<ExtratoResp> {
  const ses = await getClienteSessao();
  if (!ses) redirect('/login');
  const db = createAdminClient();

  const { data: cli } = await db.from('clientes').select('id,nome,calcao').eq('id', ses.cid).single();
  const monAtual = segunda(agoraBR());
  const monPassada = new Date(monAtual); monPassada.setUTCDate(monAtual.getUTCDate() - 7);

  const [atual, passada] = await Promise.all([
    semana(db, ses.cid, monAtual, 'Semana atual'),
    semana(db, ses.cid, monPassada, 'Semana passada'),
  ]);

  return {
    cliente: { id: ses.cid, nome: cli?.nome ?? ses.nome, cal: Number(cli?.calcao ?? 0) },
    atual, passada,
  };
}

// Status que o cliente pode sugerir como correto (nunca "EM ABERTO": só contesta resolvida).
const STATUS_VALIDOS = ['GREEN', 'MEIO GREEN', 'MEIO RED', 'RED', 'REEMBOLSO'];

/** O cliente contesta uma aposta JÁ RESOLVIDA dele -> volta para a fila do admin.
 *  statusSugerido = qual status o cliente acha que seria o correto (opcional). */
export async function contestarAposta(id: number, motivo: string, statusSugerido?: string): Promise<{ ok: boolean; erro?: string }> {
  const ses = await getClienteSessao();
  if (!ses) return { ok: false, erro: 'Sessão expirada. Entre novamente.' };
  const db = createAdminClient();

  // Garante que a aposta é DESTE cliente e já foi resolvida.
  const { data: ap } = await db.from('apostas').select('id,cliente_id,status,contestada').eq('id', id).single();
  if (!ap || ap.cliente_id !== ses.cid) return { ok: false, erro: 'Aposta não encontrada.' };
  if (ap.status === 'EM ABERTO') return { ok: false, erro: 'Esta aposta ainda não foi resolvida.' };
  if (ap.contestada) return { ok: false, erro: 'Você já contestou esta aposta.' };

  const sug = statusSugerido && STATUS_VALIDOS.includes(statusSugerido) && statusSugerido !== ap.status
    ? statusSugerido : null;

  const { error } = await db.from('apostas')
    .update({
      contestada: true, contestada_em: new Date().toISOString(),
      contestacao: (motivo || '').slice(0, 500), contestacao_status: sug,
    })
    .eq('id', id);
  if (error) return { ok: false, erro: 'Não foi possível registrar. Tente de novo.' };
  return { ok: true };
}

export async function sairCliente(): Promise<void> {
  await limparClienteCookie();
  redirect('/login');
}
