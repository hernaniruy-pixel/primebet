'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setClienteCookie } from '@/lib/cliente-session';

export type LoginState = { erro?: string };

/**
 * Login ÚNICO para todos. Tenta primeiro como CLIENTE (nome na tabela clientes);
 * se não casar, tenta como EQUIPE (e-mail no Supabase Auth). Não depende de "@",
 * então nomes de cliente com "@" (ex.: grupos) também funcionam.
 */
export async function entrar(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get('usuario') || '').trim();
  const senha = String(formData.get('senha') || '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  // 1) Cliente (nome + senha)
  const db = createAdminClient();
  const { data: cli } = await db.rpc('cliente_login', { p_nome: usuario, p_senha: senha });
  if (cli) {
    const c = cli as { id: number; nome: string };
    await setClienteCookie(c.id, c.nome);
    redirect('/cliente');
  }

  // 2) Equipe (e-mail + senha)
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: usuario, password: senha });
  if (error) return { erro: 'Usuário ou senha incorretos.' };
  redirect('/admin');
}
