import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getEquipeSessao } from '@/lib/equipe-session';

/** Quem está agindo agora: o dono (admin, Supabase Auth) ou um membro da equipe. */
export type Ator = { tipo: 'admin' | 'gestor' | 'operador'; nome: string };

/**
 * Devolve o ator logado, checando primeiro o admin (Supabase Auth) e depois o
 * cookie assinado da equipe. null = ninguém autenticado.
 */
export async function atorAtual(): Promise<Ator | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) return { tipo: 'admin', nome: 'admin' };

  const s = await getEquipeSessao();
  if (s) return { tipo: s.papel, nome: s.nome };

  return null;
}

/** Papéis com acesso ao financeiro/gestão (tudo menos o operador). */
export function podeFinanceiro(ator: Ator | null): boolean {
  return ator?.tipo === 'admin' || ator?.tipo === 'gestor';
}

/** Só o dono (admin) — usado p/ gerenciar usuários e trocar senha de gestor/admin. */
export function ehAdmin(ator: Ator | null): boolean {
  return ator?.tipo === 'admin';
}
