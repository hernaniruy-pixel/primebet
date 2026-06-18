'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setClienteCookie } from '@/lib/cliente-session';

export type LoginState = { erro?: string };

// O usuário "admin" é a equipe (Supabase Auth, e-mail interno). Qualquer outro
// usuário é tratado como CLIENTE: login = nome do cliente, senha = campo "Senha"
// do cadastro (editável no painel). Não expõe o e-mail interno do admin na tela.
const ADMIN_USER = 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@primebet.app';

export async function entrar(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get('usuario') || '').trim();
  const senha = String(formData.get('senha') || '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  // 1) Equipe/admin
  if (usuario.toLowerCase() === ADMIN_USER) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: senha });
    if (error) return { erro: 'Usuário ou senha incorretos.' };
    redirect('/admin');
  }

  // 2) Cliente (nome + senha do cadastro). Só clientes ativos com senha definida.
  const db = createAdminClient();
  const { data: cli } = await db.rpc('cliente_login', { p_nome: usuario, p_senha: senha });
  if (cli) {
    const c = cli as { id: number; nome: string };
    await setClienteCookie(c.id, c.nome);
    redirect('/cliente');
  }

  return { erro: 'Usuário ou senha incorretos.' };
}
