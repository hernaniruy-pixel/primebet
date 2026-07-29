'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setClienteCookie } from '@/lib/cliente-session';
import { setEquipeCookie } from '@/lib/equipe-session';
import { conferirSenha } from '@/lib/senha';
import { verificarClienteLogin } from '@/lib/cliente-auth';
import { segundosBloqueado, registrarFalha, limparFalhas } from '@/lib/login-rate';

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

  // Trava anti-força-bruta: bloqueado? nem tenta conferir a senha.
  const bloq = await segundosBloqueado(usuario);
  if (bloq > 0) return { erro: `Muitas tentativas. Tente de novo em ${Math.ceil(bloq / 60)} min.` };

  // 1) Master (login 'admin' → Supabase Auth)
  if (usuario.toLowerCase() === ADMIN_USER) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: senha });
    if (error) { await registrarFalha(usuario); return { erro: 'Usuário ou senha incorretos.' }; }
    await limparFalhas(usuario);
    redirect('/admin');
  }

  const db = createAdminClient();

  // 2) Equipe (admin/gestor/operador). Login = nome; senha conferida por hash (scrypt).
  //    O 'admin' (master) já foi tratado acima e não pode ser cadastrado como equipe.
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
    await limparFalhas(usuario);
    await setEquipeCookie(Number(eq.id), String(eq.nome), eq.papel as 'admin' | 'gestor' | 'operador');
    redirect('/admin');
  }

  // 3) Cliente (nome + senha do cadastro). Hash scrypt; senha legada migra no acesso.
  const cli = await verificarClienteLogin(usuario, senha);
  if (cli) {
    await limparFalhas(usuario);
    await setClienteCookie(cli.id, cli.nome);
    redirect('/cliente');
  }

  await registrarFalha(usuario);
  return { erro: 'Usuário ou senha incorretos.' };
}
