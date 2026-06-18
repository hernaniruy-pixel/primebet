import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

/**
 * Sessão do CLIENTE (jogador) — separada da sessão de equipe (Supabase Auth).
 * Guardamos um cookie httpOnly assinado por HMAC. Segredo = SUPABASE_SERVICE_ROLE_KEY
 * (já presente em todos os ambientes, server-only) — evita configurar env novo.
 */
const COOKIE = 'pb_cliente';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export type ClienteSessao = { cid: number; nome: string; exp: number };

function secret(): string {
  const s = process.env.PRIMEBET_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Sessão do cliente sem segredo: defina SUPABASE_SERVICE_ROLE_KEY (ou PRIMEBET_SESSION_SECRET).');
  return s;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

function gerarToken(cid: number, nome: string): string {
  const payload: ClienteSessao = { cid, nome, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function verificarToken(token: string): ClienteSessao | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const esperado = sign(body);
  // comparação em tempo constante
  if (mac.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(esperado))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as ClienteSessao;
    // Falha fechada se o formato não for o esperado (cid numérico, nome string, exp válido).
    if (typeof p.cid !== 'number' || !Number.isFinite(p.cid) || typeof p.nome !== 'string') return null;
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

export async function getClienteSessao(): Promise<ClienteSessao | null> {
  const c = await cookies();
  const t = c.get(COOKIE)?.value;
  return t ? verificarToken(t) : null;
}

export async function setClienteCookie(cid: number, nome: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, gerarToken(cid, nome), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
}

export async function limparClienteCookie(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}
