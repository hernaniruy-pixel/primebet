'use client';

import { useActionState } from 'react';
import { entrar, type LoginState } from './actions';

const inicial: LoginState = {};

export default function LoginPage() {
  const [estado, formAction, pendente] = useActionState(entrar, inicial);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0d1508] via-[#1a2210] to-[#0d1508] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-[#3a5015] bg-[#1e2a0e] p-7">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#DAA520] text-3xl font-bold text-[#1a1a00]">
            PB
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold tracking-wide text-[#DAA520]">PrimeBet</div>
            <div className="text-xs text-[#7a8c5a]">Painel de Gerenciamento</div>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold tracking-wide text-[#9aaa7a]">
              USUÁRIO
            </label>
            <input
              name="usuario"
              type="text"
              autoComplete="username"
              placeholder="seu e-mail de acesso"
              className="w-full rounded-lg border border-[#3a5015] bg-[#111a08] px-3.5 py-3 text-[15px] text-slate-200 outline-none focus:border-[#B8860B]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold tracking-wide text-[#9aaa7a]">
              SENHA
            </label>
            <input
              name="senha"
              type="password"
              autoComplete="current-password"
              placeholder="••••••"
              className="w-full rounded-lg border border-[#3a5015] bg-[#111a08] px-3.5 py-3 text-[15px] text-slate-200 outline-none focus:border-[#B8860B]"
            />
          </div>

          {estado.erro && (
            <div className="text-sm text-red-400">{estado.erro}</div>
          )}

          <button
            type="submit"
            disabled={pendente}
            className="mt-2 w-full rounded-lg bg-gradient-to-br from-[#B8860B] to-[#DAA520] py-3 text-[15px] font-bold tracking-wide text-[#1a1a00] disabled:opacity-60"
          >
            {pendente ? 'Entrando…' : 'Entrar no painel →'}
          </button>
        </form>

        <div className="mt-5 text-center text-[11px] text-[#2d4010]">
          © 2026 PrimeBet Fechamentos
        </div>
      </div>
    </main>
  );
}
