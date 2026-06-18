'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { erro?: string };

// LOCKDOWN: por enquanto SÓ o admin entra. O usuário "admin" é mapeado para o
// e-mail interno do Supabase Auth. Login de cliente/banca fica desativado até
// reativarmos (multi-banca). Não exponha o e-mail interno na tela.
const ADMIN_USER = 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@primebet.app';

export async function entrar(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get('usuario') || '').trim();
  const senha = String(formData.get('senha') || '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  if (usuario.toLowerCase() !== ADMIN_USER) return { erro: 'Usuário ou senha incorretos.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: senha });
  if (error) return { erro: 'Usuário ou senha incorretos.' };
  redirect('/admin');
}
