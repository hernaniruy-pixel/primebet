'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setClienteCookie } from '@/lib/cliente-session';
import { setEquipeCookie } from '@/lib/equipe-session';
import { conferirSenha } from '@/lib/senha';

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

  const db = createAdminClient();

  // 2) Equipe (gestor/operador). Login = nome; senha conferida por hash (scrypt).
  //    O 'admin' já foi tratado acima e não pode ser cadastrado como equipe.
  const { data: eq } = await db
    .from('equipe')
    .select('id,nome,senha_hash,papel,ativo')
    .ilike('nome', usuario)
    .maybeSingle();
  if (
    eq && eq.ativo &&
    String(eq.nome).toLowerCase() === usuario.toLowerCase() &&
    conferirSenha(senha, String(eq.senha_hash))
  ) {
    await setEquipeCookie(Number(eq.id), String(eq.nome), eq.papel as 'gestor' | 'operador');
    redirect('/admin');
  }

  // 3) Cliente (nome + senha do cadastro). Só clientes ativos com senha definida.
  const { data: cli } = await db.rpc('cliente_login', { p_nome: usuario, p_senha: senha });
  if (cli) {
    const c = cli as { id: number; nome: string };
    await setClienteCookie(c.id, c.nome);
    redirect('/cliente');
  }

  return { erro: 'Usuário ou senha incorretos.' };
}
