import 'server-only';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashSenha, conferirSenha } from '@/lib/senha';
import { verificarTotp, gerarSegredoBase32, otpauthUri } from '@/lib/totp';
import { MARCA } from '@/lib/marca';

/**
 * Estado do 2FA por SUJEITO. O sujeito é uma string estável:
 *   • master     → 'master'   (login 'admin', obrigatório ter 2FA)
 *   • equipe(id) → 'equipe:<id>' (admin do cliente, opcional)
 * Guarda o segredo TOTP e os códigos de recuperação (hash scrypt) na tabela
 * login_2fa (mig. 032).
 */

export const SUJEITO_MASTER = 'master';
export const sujeitoEquipe = (id: number | string) => `equipe:${id}`;

type Row2fa = {
  sujeito: string;
  segredo: string;
  ativo: boolean;
  recuperacao: string[];
  criado_em: string;
  confirmado_em: string | null;
};

async function buscar(sujeito: string): Promise<Row2fa | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('login_2fa')
    .select('sujeito,segredo,ativo,recuperacao,criado_em,confirmado_em')
    .eq('sujeito', sujeito)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, recuperacao: Array.isArray(data.recuperacao) ? data.recuperacao : [] } as Row2fa;
}

/** true se o sujeito EXIGE 2FA no login (cadastrou e confirmou). */
export async function precisa2fa(sujeito: string): Promise<boolean> {
  const r = await buscar(sujeito);
  return !!r?.ativo;
}

/** Situação para a tela de Segurança. */
export async function estado2fa(sujeito: string): Promise<{ ativo: boolean; confirmadoEm: string | null; restamRecuperacao: number }> {
  const r = await buscar(sujeito);
  return {
    ativo: !!r?.ativo,
    confirmadoEm: r?.confirmado_em ?? null,
    restamRecuperacao: r?.recuperacao?.length ?? 0,
  };
}

/**
 * Começa o cadastro: gera um segredo novo (ainda NÃO ativo) e devolve o que a
 * tela precisa para mostrar o QR. Se já estiver ativo, mantém como está e não
 * gera outro (evita quebrar o app já pareado por engano) — desative antes.
 */
export async function iniciar2fa(
  sujeito: string,
  contaLabel: string,
): Promise<{ segredo: string; uri: string } | { jaAtivo: true }> {
  const atual = await buscar(sujeito);
  if (atual?.ativo) return { jaAtivo: true };

  const segredo = gerarSegredoBase32();
  const db = createAdminClient();
  await db.from('login_2fa').upsert(
    { sujeito, segredo, ativo: false, recuperacao: [], criado_em: new Date().toISOString(), confirmado_em: null },
    { onConflict: 'sujeito' },
  );
  return { segredo, uri: otpauthUri(segredo, contaLabel, MARCA.nome) };
}

function novoCodigoRecuperacao(): string {
  const s = crypto.randomBytes(5).toString('hex'); // 10 chars hex
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

const normalizarRec = (c: string) => String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Confirma o cadastro: confere o 1º código do app. Se bater, ativa o 2FA e gera
 * os códigos de recuperação (retornados UMA vez, em texto, para o usuário salvar).
 */
export async function confirmar2fa(
  sujeito: string,
  codigo: string,
): Promise<{ ok: true; recuperacao: string[] } | { ok: false; erro: string }> {
  const r = await buscar(sujeito);
  if (!r) return { ok: false, erro: 'Comece o cadastro do 2FA primeiro.' };
  if (r.ativo) return { ok: false, erro: 'O 2FA já está ativo.' };
  if (!verificarTotp(r.segredo, codigo)) return { ok: false, erro: 'Código incorreto. Confira o horário do celular e tente de novo.' };

  const codigos = Array.from({ length: 8 }, novoCodigoRecuperacao);
  const hashes = codigos.map((c) => hashSenha(normalizarRec(c)));
  const db = createAdminClient();
  await db.from('login_2fa').update({ ativo: true, recuperacao: hashes, confirmado_em: new Date().toISOString() }).eq('sujeito', sujeito);
  return { ok: true, recuperacao: codigos };
}

/**
 * Verifica um código no LOGIN: aceita o TOTP do app OU um código de recuperação
 * (que é consumido). Retorna true se liberou.
 */
export async function verificar2fa(sujeito: string, codigo: string): Promise<boolean> {
  const r = await buscar(sujeito);
  if (!r || !r.ativo) return false;
  if (verificarTotp(r.segredo, codigo)) return true;

  // Código de recuperação (uso único).
  const norm = normalizarRec(codigo);
  if (norm.length < 8) return false;
  const idx = r.recuperacao.findIndex((h) => conferirSenha(norm, h));
  if (idx === -1) return false;
  const restante = r.recuperacao.filter((_, i) => i !== idx);
  const db = createAdminClient();
  await db.from('login_2fa').update({ recuperacao: restante }).eq('sujeito', sujeito);
  return true;
}

/** Gera novos códigos de recuperação (invalida os antigos). Só se já ativo. */
export async function regenerarRecuperacao(sujeito: string): Promise<string[] | null> {
  const r = await buscar(sujeito);
  if (!r?.ativo) return null;
  const codigos = Array.from({ length: 8 }, novoCodigoRecuperacao);
  const hashes = codigos.map((c) => hashSenha(normalizarRec(c)));
  const db = createAdminClient();
  await db.from('login_2fa').update({ recuperacao: hashes }).eq('sujeito', sujeito);
  return codigos;
}

/** Desativa o 2FA do sujeito (remove o segredo). Use com o gate de permissão na action. */
export async function desativar2fa(sujeito: string): Promise<void> {
  const db = createAdminClient();
  await db.from('login_2fa').delete().eq('sujeito', sujeito);
}
