import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import type { Papel } from '@/lib/equipe-session';

/**
 * Cookie TEMPORÁRIO (5 min) entre a etapa da SENHA e a do CÓDIGO 2FA. Enquanto o
 * código não é confirmado NÃO existe sessão de verdade — o usuário não está
 * autenticado. Por isso este cookie carrega o que falta para concluir o login.
 *
 * Como pode conter a senha do master (necessária para criar a sessão do Supabase
 * só depois do 2FA), o conteúdo é CRIPTOGRAFADO (AES-256-GCM) além de httpOnly.
 */
const COOKIE = 'pb_2fa_pend';
const MAX_AGE = 60 * 5; // 5 minutos

export type Pendente =
  | { tipo: 'master'; nome: string; senha: string; sujeito: string; exp: number }
  | { tipo: 'admin' | 'gestor' | 'operador'; nome: string; eid: number; papel: Papel; sujeito: string; exp: number };

// Omit distributivo: preserva as chaves específicas de cada variante da união.
type SemExp<T> = T extends unknown ? Omit<T, 'exp'> : never;

function chave(): Buffer {
  const s = process.env.PRIMEBET_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Cookie 2FA sem segredo: defina PRIMEBET_SESSION_SECRET ou SUPABASE_SERVICE_ROLE_KEY.');
  return crypto.createHash('sha256').update(s).digest(); // 32 bytes
}

function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decifrar(blob: string): string | null {
  try {
    const [iv, tag, enc] = blob.split('.');
    if (!iv || !tag || !enc) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function setPendente(p: SemExp<Pendente>): Promise<void> {
  const payload = { ...p, exp: Math.floor(Date.now() / 1000) + MAX_AGE } as Pendente;
  const c = await cookies();
  c.set(COOKIE, cifrar(JSON.stringify(payload)), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
}

export async function getPendente(): Promise<Pendente | null> {
  const c = await cookies();
  const blob = c.get(COOKIE)?.value;
  if (!blob) return null;
  const txt = decifrar(blob);
  if (!txt) return null;
  try {
    const p = JSON.parse(txt) as Pendente;
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

export async function limparPendente(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}
