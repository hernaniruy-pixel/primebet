'use server';

import { redirect } from 'next/navigation';
import { createClient as createSupabaseJs } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setClienteCookie } from '@/lib/cliente-session';
import { setEquipeCookie } from '@/lib/equipe-session';
import { conferirSenha } from '@/lib/senha';
import { verificarClienteLogin } from '@/lib/cliente-auth';
import { segundosBloqueado, registrarFalha, limparFalhas } from '@/lib/login-rate';
import { precisa2fa, verificar2fa, SUJEITO_MASTER, sujeitoEquipe } from '@/lib/login-2fa';
import { setPendente, getPendente, limparPendente } from '@/lib/pendente-2fa';
import { registrarAcesso, dadosRequisicao } from '@/lib/login-audit';

export type LoginState = { erro?: string; etapa?: 'senha' | 'codigo' };

const ADMIN_USER = 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@primebet.app';

/** Confere a senha do master SEM criar sessão (cliente anon que não grava cookie). */
async function senhaMasterConfere(senha: string): Promise<boolean> {
  const sb = createSupabaseJs(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: senha });
  return !error;
}

/** Chave de IP para a trava anti-força-bruta (complementa a trava por usuário). */
const chaveIp = (ip: string) => (ip ? `ip:${ip}` : '');

// ════════════════════════════════════════════════════════════════
//  ETAPA 1 — usuário + senha
// ════════════════════════════════════════════════════════════════
export async function entrar(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get('usuario') || '').trim();
  const senha = String(formData.get('senha') || '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  const { ip, agente } = await dadosRequisicao();

  // Trava anti-força-bruta: por usuário E por IP.
  const bloqUser = await segundosBloqueado(usuario);
  const bloqIp = ip ? await segundosBloqueado(chaveIp(ip)) : 0;
  const bloq = Math.max(bloqUser, bloqIp);
  if (bloq > 0) {
    await registrarAcesso({ sujeitoNome: usuario, sucesso: false, motivo: 'bloqueado', ip, agente });
    return { erro: `Muitas tentativas. Tente de novo em ${Math.ceil(bloq / 60)} min.` };
  }

  const falhou = async (motivo: string) => {
    await registrarFalha(usuario);
    if (ip) await registrarFalha(chaveIp(ip));
    await registrarAcesso({ sujeitoNome: usuario, sucesso: false, motivo, ip, agente });
  };

  // 1) Master (login 'admin' → Supabase Auth)
  if (usuario.toLowerCase() === ADMIN_USER) {
    if (!(await senhaMasterConfere(senha))) {
      await falhou('senha_incorreta');
      return { erro: 'Usuário ou senha incorretos.' };
    }
    await limparFalhas(usuario);
    if (ip) await limparFalhas(chaveIp(ip));

    if (await precisa2fa(SUJEITO_MASTER)) {
      await setPendente({ tipo: 'master', nome: ADMIN_USER, senha, sujeito: SUJEITO_MASTER });
      await registrarAcesso({ sujeitoTipo: 'master', sujeitoNome: ADMIN_USER, sucesso: true, motivo: 'senha_ok', ip, agente });
      return { etapa: 'codigo' };
    }
    // Sem 2FA ainda: entra e o painel força o cadastro (master obrigatório).
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: senha });
    await registrarAcesso({ sujeitoTipo: 'master', sujeitoNome: ADMIN_USER, sucesso: true, motivo: 'senha_ok', ip, agente });
    redirect('/admin');
  }

  const db = createAdminClient();

  // 2) Equipe (admin/gestor/operador). Login = nome; senha por hash (scrypt).
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
    if (ip) await limparFalhas(chaveIp(ip));
    const papel = eq.papel as 'admin' | 'gestor' | 'operador';
    const suj = sujeitoEquipe(Number(eq.id));

    if (await precisa2fa(suj)) {
      await setPendente({ tipo: papel, nome: String(eq.nome), eid: Number(eq.id), papel, sujeito: suj });
      await registrarAcesso({ sujeitoTipo: papel, sujeitoNome: String(eq.nome), sucesso: true, motivo: 'senha_ok', ip, agente });
      return { etapa: 'codigo' };
    }
    await setEquipeCookie(Number(eq.id), String(eq.nome), papel);
    await registrarAcesso({ sujeitoTipo: papel, sujeitoNome: String(eq.nome), sucesso: true, motivo: 'senha_ok', ip, agente });
    redirect('/admin');
  }

  // 3) Cliente (nome + senha do cadastro). Sem 2FA.
  const cli = await verificarClienteLogin(usuario, senha);
  if (cli) {
    await limparFalhas(usuario);
    if (ip) await limparFalhas(chaveIp(ip));
    await setClienteCookie(cli.id, cli.nome);
    await registrarAcesso({ sujeitoTipo: 'cliente', sujeitoNome: cli.nome, sucesso: true, motivo: 'senha_ok', ip, agente });
    redirect('/cliente');
  }

  await falhou('senha_incorreta');
  return { erro: 'Usuário ou senha incorretos.' };
}

// ════════════════════════════════════════════════════════════════
//  ETAPA 2 — código do app autenticador (2FA)
// ════════════════════════════════════════════════════════════════
export async function verificarCodigo(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const codigo = String(formData.get('codigo') || '').trim();
  const pend = await getPendente();
  const { ip, agente } = await dadosRequisicao();

  if (!pend) {
    return { erro: 'Sessão expirada. Entre de novo.', etapa: 'senha' };
  }
  if (!codigo) return { erro: 'Digite o código do aplicativo.', etapa: 'codigo' };

  const ok = await verificar2fa(pend.sujeito, codigo);
  if (!ok) {
    await registrarFalha(pend.nome);
    if (ip) await registrarFalha(chaveIp(ip));
    await registrarAcesso({ sujeitoTipo: pend.tipo, sujeitoNome: pend.nome, sucesso: false, motivo: '2fa_incorreto', ip, agente });
    return { erro: 'Código incorreto ou expirado.', etapa: 'codigo' };
  }

  await limparPendente();
  await limparFalhas(pend.nome);
  if (ip) await limparFalhas(chaveIp(ip));
  await registrarAcesso({ sujeitoTipo: pend.tipo, sujeitoNome: pend.nome, sucesso: true, motivo: '2fa_ok', ip, agente });

  if (pend.tipo === 'master') {
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pend.senha });
    redirect('/admin');
  }
  await setEquipeCookie(pend.eid, pend.nome, pend.papel);
  redirect('/admin');
}
