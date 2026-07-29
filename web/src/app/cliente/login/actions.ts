'use server';

import { redirect } from 'next/navigation';
import { setClienteCookie } from '@/lib/cliente-session';
import { verificarClienteLogin } from '@/lib/cliente-auth';

export type LoginClienteState = { erro?: string };

/**
 * Login do JOGADOR: usuário = nome do cliente (o mesmo usado na transcrição),
 * senha = a definida no painel admin. Senha guardada com hash (scrypt); senha
 * legada em texto puro migra sozinha no 1º acesso (verificarClienteLogin).
 */
export async function entrarCliente(_prev: LoginClienteState, formData: FormData): Promise<LoginClienteState> {
  const usuario = String(formData.get('usuario') || '').trim();
  const senha = String(formData.get('senha') || '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  const c = await verificarClienteLogin(usuario, senha);
  if (!c) return { erro: 'Usuário ou senha incorretos.' };

  await setClienteCookie(c.id, c.nome);
  redirect('/cliente');
}
