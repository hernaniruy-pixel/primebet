'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setClienteCookie } from '@/lib/cliente-session';

export type LoginState = { erro?: string };

/**
 * Login ÚNICO para todos:
 *  - tem "@" (e-mail)  -> equipe/admin (Supabase Auth)        -> /admin
 *  - sem "@" (nome)    -> cliente/jogador (tabela clientes)   -> /cliente
 */
export async function entrar(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get('usuario') || '').trim();
  const senha = String(formData.get('senha') || '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  if (usuario.includes('@')) {
    // Equipe (e-mail + senha)
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: usuario, password: senha });
    if (error) return { erro: 'Usuário ou senha incorretos.' };
    redirect('/admin');
  } else {
    // Cliente (nome + senha)
    const db = createAdminClient();
    const { data, error } = await db.rpc('cliente_login', { p_nome: usuario, p_senha: senha });
    if (error || !data) return { erro: 'Usuário ou senha incorretos.' };
    const c = data as { id: number; nome: string };
    await setClienteCookie(c.id, c.nome);
    redirect('/cliente');
  }
}
