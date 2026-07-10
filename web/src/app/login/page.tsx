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
            <div
              style={{
                width: 106,
                height: 106,
                borderRadius: 26,
                padding: 3,
                background: 'linear-gradient(145deg,#3a5015 0%,#DAA520 100%)',
                boxShadow: '0 14px 34px rgba(184,134,11,.30)',
              }}
            >
              <Image
                src="/logo.jpg"
                alt="PrimeBet"
                width={100}
                height={100}
                priority
                style={{ borderRadius: 23, objectFit: 'cover', display: 'block', width: '100%', height: '100%' }}
              />
            </div>
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
              placeholder="usuário"
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
              <button
                type="button"
                onClick={() => setVerSenha((v) => !v)}
                aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  padding: 4,
                  color: '#7a8c5a',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {verSenha ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
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

          <div style={{ fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 1.7 }}>
            <div style={{ color: '#5a7020' }}>© 2026 WorldNexus · desenvolvedora de softwares e automações</div>
            <a
              href="https://wa.me/5567991995885"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#9aaa7a', textDecoration: 'none' }}
            >
              Contato: (67) 99199-5885
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
