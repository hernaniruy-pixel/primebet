'use client';

import { useActionState, useState } from 'react';
import Image from 'next/image';
import { entrar, type LoginState } from './actions';

const inicial: LoginState = {};

export default function LoginPage() {
  const [estado, formAction, pendente] = useActionState(entrar, inicial);
  const [verSenha, setVerSenha] = useState(false);

  return (
    <>
      <style>{`
        .pb-login{min-height:100vh;background:linear-gradient(135deg,#0d1508 0%,#1a2210 50%,#0d1508 100%);display:flex;align-items:center;justify-content:center;padding:24px}
        .lg-box{width:100%;max-width:360px;background:#1e2a0e;border:1px solid #3a5015;border-radius:16px;padding:28px 24px}
        .lg-inp{width:100%;background:#111a08;border:1px solid #3a5015;border-radius:8px;padding:12px 14px;color:#e2e8f0;font-size:15px;outline:none;display:block;margin-bottom:12px;box-sizing:border-box;font-family:inherit}
        .lg-inp:focus{border-color:#B8860B}
        .lg-lbl{color:#9aaa7a;font-size:11px;font-weight:700;display:block;margin-bottom:5px;letter-spacing:.05em}
        .lg-btn{width:100%;background:linear-gradient(135deg,#B8860B,#DAA520);color:#1a1a00;border:none;border-radius:8px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.03em;font-family:inherit}
        .lg-btn:disabled{opacity:.6;cursor:default}
      `}</style>

      <main className="pb-login">
        <div className="lg-box">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <Image
              src="/logo.jpg"
              alt="PrimeBet"
              width={100}
              height={100}
              priority
              style={{ borderRadius: 22, objectFit: 'cover' }}
            />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#DAA520', fontSize: 22, fontWeight: 700, letterSpacing: '.02em' }}>PrimeBet</div>
              <div style={{ color: '#7a8c5a', fontSize: 12 }}>Acesso ao sistema</div>
            </div>
          </div>

          <form action={formAction}>
            <label className="lg-lbl">USUÁRIO</label>
            <input
              name="usuario"
              className="lg-inp"
              type="text"
              autoComplete="username"
              placeholder="e-mail (equipe) ou usuário (cliente)"
            />

            <label className="lg-lbl">SENHA</label>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <input
                name="senha"
                className="lg-inp"
                type={verSenha ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••"
                style={{ marginBottom: 0, paddingRight: 44 }}
              />
              <span
                onClick={() => setVerSenha((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 13,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#7a8c5a',
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                {verSenha ? '🙈' : '👁️'}
              </span>
            </div>

            {estado.erro && (
              <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{estado.erro}</div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 6,
                marginBottom: 18,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: '#9aaa7a', fontSize: 12 }}>
                <input type="checkbox" defaultChecked style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#B8860B' }} />
                Lembrar acesso
              </label>
              <span
                onClick={() => alert('Fale com o administrador para redefinir sua senha.')}
                style={{ color: '#DAA520', fontSize: 12, cursor: 'pointer' }}
              >
                Esqueci minha senha
              </span>
            </div>

            <button type="submit" className="lg-btn" disabled={pendente}>
              {pendente ? 'Entrando…' : 'Entrar no painel →'}
            </button>
          </form>

          <div style={{ color: '#2d4010', fontSize: 11, textAlign: 'center', marginTop: 20 }}>
            © 2026 PrimeBet Fechamentos
          </div>
        </div>
      </main>
    </>
  );
}
