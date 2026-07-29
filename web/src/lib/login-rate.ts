import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Trava de tentativas de login (anti-força-bruta), guardada no banco (tabela
 * login_rate) para valer entre as várias instâncias serverless da Vercel — em
 * memória não persistiria. Chave = nome de usuário em minúsculas.
 *
 * Regra: até LIMITE falhas seguidas; ao estourar, bloqueia por BLOQUEIO_MIN
 * minutos. Um acerto zera o contador. O bloqueio é TEMPORÁRIO de propósito
 * (não trava a conta pra sempre — senão daria pra alguém travar você de fora).
 */
const LIMITE = 8;          // falhas seguidas antes de bloquear
const BLOQUEIO_MIN = 10;   // minutos de espera após estourar

const chaveDe = (usuario: string) => String(usuario || '').trim().toLowerCase().slice(0, 80);

/** Se estiver bloqueado, devolve os segundos que faltam; senão 0. */
export async function segundosBloqueado(usuario: string): Promise<number> {
  const chave = chaveDe(usuario);
  if (!chave) return 0;
  const db = createAdminClient();
  const { data, error } = await db.from('login_rate').select('ate').eq('chave', chave).maybeSingle();
  if (error || !data?.ate) return 0; // tabela ausente (migração pendente) = não bloqueia
  const falta = Math.ceil((new Date(data.ate).getTime() - Date.now()) / 1000);
  return falta > 0 ? falta : 0;
}

/** Registra UMA falha. Ao atingir o limite, agenda o bloqueio. Best-effort. */
export async function registrarFalha(usuario: string): Promise<void> {
  const chave = chaveDe(usuario);
  if (!chave) return;
  const db = createAdminClient();
  const { data } = await db.from('login_rate').select('falhas').eq('chave', chave).maybeSingle();
  const falhas = (data?.falhas ?? 0) + 1;
  const ate = falhas >= LIMITE ? new Date(Date.now() + BLOQUEIO_MIN * 60_000).toISOString() : null;
  await db.from('login_rate').upsert(
    { chave, falhas, ate, atualizado_em: new Date().toISOString() },
    { onConflict: 'chave' },
  ).then(({ error }) => { if (error) console.warn('login_rate (migração 027 pendente?):', error.message); });
}

/** Login deu certo: zera o contador daquela chave. */
export async function limparFalhas(usuario: string): Promise<void> {
  const chave = chaveDe(usuario);
  if (!chave) return;
  const db = createAdminClient();
  await db.from('login_rate').delete().eq('chave', chave).then(() => {}, () => {});
}
