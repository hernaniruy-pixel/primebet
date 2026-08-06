'use server';

import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/server';
import { getEquipeSessao } from '@/lib/equipe-session';
import {
  SUJEITO_MASTER, sujeitoEquipe,
  estado2fa, iniciar2fa, confirmar2fa, regenerarRecuperacao, desativar2fa,
} from '@/lib/login-2fa';
import { listarAcessos, type EventoAcesso } from '@/lib/login-audit';

type Quem = { sujeito: string; tipo: 'master' | 'admin'; nome: string };

/**
 * Só MASTER e ADMIN (dono) mexem no 2FA / veem a auditoria. Gestor e operador
 * não têm 2FA (decisão de escopo) — retorna null e a página os manda embora.
 */
async function quem(): Promise<Quem | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) return { sujeito: SUJEITO_MASTER, tipo: 'master', nome: 'admin' };
  const s = await getEquipeSessao();
  if (s && s.papel === 'admin') return { sujeito: sujeitoEquipe(s.eid), tipo: 'admin', nome: s.nome };
  return null;
}

async function exigirQuem(): Promise<Quem> {
  const q = await quem();
  if (!q) throw new Error('Não autenticado');
  return q;
}

export type EstadoSeguranca = {
  tipo: 'master' | 'admin';
  nome: string;
  ativo: boolean;
  confirmadoEm: string | null;
  restamRecuperacao: number;
  obrigatorio: boolean; // master sem 2FA = precisa ativar antes de usar o painel
};

export async function carregarSeguranca(): Promise<EstadoSeguranca> {
  const q = await exigirQuem();
  const e = await estado2fa(q.sujeito);
  return {
    tipo: q.tipo,
    nome: q.nome,
    ativo: e.ativo,
    confirmadoEm: e.confirmadoEm,
    restamRecuperacao: e.restamRecuperacao,
    obrigatorio: q.tipo === 'master' && !e.ativo,
  };
}

/** Começa o cadastro: devolve segredo + QR (data URL) para o app autenticador. */
export async function iniciarCadastro2fa(): Promise<
  { ok: true; segredo: string; uri: string; qr: string } | { ok: false; erro: string }
> {
  const q = await exigirQuem();
  const r = await iniciar2fa(q.sujeito, q.nome);
  if ('jaAtivo' in r) return { ok: false, erro: 'O 2FA já está ativo.' };
  const qr = await QRCode.toDataURL(r.uri, { margin: 1, width: 232 });
  return { ok: true, segredo: r.segredo, uri: r.uri, qr };
}

export async function confirmarCadastro2fa(codigo: string):
  Promise<{ ok: true; recuperacao: string[] } | { ok: false; erro: string }> {
  const q = await exigirQuem();
  return confirmar2fa(q.sujeito, String(codigo || ''));
}

export async function regenerarRecuperacao2fa(): Promise<{ ok: boolean; recuperacao?: string[] }> {
  const q = await exigirQuem();
  const codigos = await regenerarRecuperacao(q.sujeito);
  return codigos ? { ok: true, recuperacao: codigos } : { ok: false };
}

/** Desativa o 2FA. Bloqueado para o master (obrigatório) — só admin pode. */
export async function desativar2faAtual(): Promise<{ ok: boolean; erro?: string }> {
  const q = await exigirQuem();
  if (q.tipo === 'master') return { ok: false, erro: 'O 2FA do master é obrigatório e não pode ser desativado.' };
  await desativar2fa(q.sujeito);
  return { ok: true };
}

export async function listarAcessosSeguranca(): Promise<EventoAcesso[]> {
  await exigirQuem();
  return listarAcessos(60);
}
