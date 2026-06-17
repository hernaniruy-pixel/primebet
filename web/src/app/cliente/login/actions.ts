'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { setClienteCookie } from '@/lib/cliente-session';

export type LoginClienteState = { erro?: string };

/**
 * Login do JOGADOR: usuário = nome do cliente (o mesmo usado na transcrição),
 * senha = a definida no painel admin. Valida pela função cliente_login.
 */
export async function entrarCliente(_prev: LoginClienteState, formData: FormData): Promise<LoginClienteState> {
  const usuario = String(formData.get('usuario') || '').trim();
  const senha = String(formData.get('senha') || '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  const db = createAdminClient();
  const { data, error } = await db.rpc('cliente_login', { p_nome: usuario, p_senha: senha });
  if (error || !data) return { erro: 'Usuário ou senha incorretos.' };

  const c = data as { id: number; nome: string; ativo: boolean };
  await setClienteCookie(c.id, c.nome);
  redirect('/cliente');
}
