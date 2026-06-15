'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { erro?: string };

/**
 * Login de equipe (admin/operador) via Supabase Auth (e-mail + senha).
 * O login de jogador (nome + senha da tabela clientes) entra numa etapa seguinte.
 */
export async function entrar(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get('usuario') || '').trim();
  const senha = String(formData.get('senha') || '');

  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usuario,
    password: senha,
  });

  if (error) return { erro: 'Usuário ou senha incorretos.' };

  redirect('/admin');
}
