import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashSenha, conferirSenha } from '@/lib/senha';

/**
 * Verifica o login do CLIENTE (jogador). Substitui a antiga RPC cliente_login,
 * que comparava senha em TEXTO PURO. Agora:
 *   • senha guardada em scrypt  -> confere com conferirSenha;
 *   • senha legada em texto puro -> compara e, se bater, RE-HASHEIA na hora
 *     (upgrade no 1º acesso) — ninguém é deslogado pela migração.
 * Devolve { id, nome } no acerto, ou null.
 */
export async function verificarClienteLogin(usuario: string, senha: string): Promise<{ id: number; nome: string } | null> {
  const nome = String(usuario || '').trim();
  if (!nome || !senha) return null;
  const db = createAdminClient();
  const { data } = await db
    .from('clientes')
    .select('id,nome,senha_hash,ativo')
    .ilike('nome', nome)
    .maybeSingle();
  if (!data || !data.ativo || !data.senha_hash) return null;
  if (String(data.nome).toLowerCase() !== nome.toLowerCase()) return null;

  const armazenado = String(data.senha_hash);
  if (armazenado.startsWith('scrypt$')) {
    return conferirSenha(senha, armazenado) ? { id: data.id, nome: data.nome } : null;
  }
  // Legado em texto puro: compara e migra pra scrypt no acerto.
  if (armazenado === senha) {
    try { await db.from('clientes').update({ senha_hash: hashSenha(senha) }).eq('id', data.id); } catch { /* best-effort */ }
    return { id: data.id, nome: data.nome };
  }
  return null;
}
