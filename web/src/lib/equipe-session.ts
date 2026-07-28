import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

/**
 * Sessão da EQUIPE (gestor/operador) — cookie httpOnly assinado por HMAC, separado
 * da sessão do admin (Supabase Auth) e da do cliente ('pb_cliente'). Segredo =
 * SUPABASE_SERVICE_ROLE_KEY (já presente em todo ambiente, server-only).
 */
const COOKIE = 'pb_equipe';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export type Papel = 'gestor' | 'operador';
export type EquipeSessao = { eid: number; nome: string; papel: Papel; exp: number };

function secret(): string {
  const s = process.env.PRIMEBET_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Sessão da equipe sem segredo: defina SUPABASE_SERVICE_ROLE_KEY.');
  return s;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

function gerarToken(eid: number, nome: string, papel: Papel): string {
  const payload: EquipeSessao = { eid, nome, papel, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function verificarToken(token: string): EquipeSessao | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const esperado = sign(body);
  if (mac.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(esperado))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as EquipeSessao;
    // Falha fechada: formato inválido ou papel desconhecido não autentica.
    if (typeof p.eid !== 'number' || !Number.isFinite(p.eid) || typeof p.nome !== 'string') return null;
    if (p.papel !== 'gestor' && p.papel !== 'operador') return null;
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

export async function getEquipeSessao(): Promise<EquipeSessao | null> {
  const c = await cookies();
  const t = c.get(COOKIE)?.value;
  return t ? verificarToken(t) : null;
}

export async function setEquipeCookie(eid: number, nome: string, papel: Papel): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, gerarToken(eid, nome, papel), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
}

export async function limparEquipeCookie(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}
