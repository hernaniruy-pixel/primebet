import 'server-only';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Auditoria de acessos (tabela login_eventos, mig. 032): registra cada tentativa
 * de login — sucesso ou falha — com IP e dispositivo, para o master enxergar quem
 * entrou. Best-effort: se a migração ainda não rodou, apenas avisa no log.
 */

export type EventoAcesso = {
  id: number;
  quando: string;
  sujeito_tipo: string | null;
  sujeito_nome: string | null;
  sucesso: boolean;
  motivo: string | null;
  ip: string | null;
  agente: string | null;
};

/** IP + user-agent da requisição atual (por trás do proxy da Vercel). */
export async function dadosRequisicao(): Promise<{ ip: string; agente: string }> {
  const h = await headers();
  const xff = h.get('x-forwarded-for') || '';
  const ip = (xff.split(',')[0] || '').trim() || h.get('x-real-ip') || '';
  const agente = h.get('user-agent') || '';
  return { ip, agente };
}

export async function registrarAcesso(e: {
  sujeitoTipo?: string;
  sujeitoNome?: string;
  sucesso: boolean;
  motivo?: string;
  ip?: string;
  agente?: string;
}): Promise<void> {
  const db = createAdminClient();
  await db
    .from('login_eventos')
    .insert({
      sujeito_tipo: e.sujeitoTipo ?? null,
      sujeito_nome: (e.sujeitoNome ?? '').slice(0, 120) || null,
      sucesso: e.sucesso,
      motivo: e.motivo ?? null,
      ip: (e.ip ?? '').slice(0, 60) || null,
      agente: (e.agente ?? '').slice(0, 300) || null,
    })
    .then(({ error }) => {
      if (error) console.warn('login_eventos (migração 032 pendente?):', error.message);
    });
}

export async function listarAcessos(limite = 60): Promise<EventoAcesso[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('login_eventos')
    .select('id,quando,sujeito_tipo,sujeito_nome,sucesso,motivo,ip,agente')
    .order('quando', { ascending: false })
    .limit(Math.min(Math.max(limite, 1), 200));
  if (error) return [];
  return (data ?? []) as EventoAcesso[];
}
