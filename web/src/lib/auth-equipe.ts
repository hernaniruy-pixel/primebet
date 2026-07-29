import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getEquipeSessao } from '@/lib/equipe-session';

/**
 * Quem está agindo agora. Hierarquia de poder:
 *   operador < gestor < admin < master
 *
 *  • master  = dono da REDE (você). Login 'admin' no Supabase Auth, um por site.
 *              Único que cria/remove outros admins e mexe em plano/cota.
 *  • admin   = dono do CLIENTE (ex.: os 2 donos da PrimeBet). Na tabela equipe.
 *              Vê tudo + gerencia gestor/operador. NÃO mexe em admins nem cota.
 *  • gestor / operador = equipe, como antes.
 */
export type Ator = { tipo: 'master' | 'admin' | 'gestor' | 'operador'; nome: string };

/**
 * Devolve o ator logado, checando primeiro o master (Supabase Auth) e depois o
 * cookie assinado da equipe. null = ninguém autenticado.
 */
export async function atorAtual(): Promise<Ator | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) return { tipo: 'master', nome: 'admin' };

  const s = await getEquipeSessao();
  if (s) return { tipo: s.papel, nome: s.nome };

  return null;
}

/** Papéis com acesso ao financeiro/gestão (tudo menos o operador). */
export function podeFinanceiro(ator: Ator | null): boolean {
  return ator?.tipo === 'master' || ator?.tipo === 'admin' || ator?.tipo === 'gestor';
}

/** Pode gerenciar a equipe (criar gestor/operador, resetar senha, ativar/desativar). */
export function ehAdmin(ator: Ator | null): boolean {
  return ator?.tipo === 'master' || ator?.tipo === 'admin';
}

/** Só o master (dono da rede): cria/remove OUTROS admins e edita plano/cota. */
export function ehMaster(ator: Ator | null): boolean {
  return ator?.tipo === 'master';
}
