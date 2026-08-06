'use client';

import { useActionState, useState } from 'react';
import Image from 'next/image';
import { entrar, verificarCodigo, type LoginState } from './actions';
import { MARCA } from '@/lib/marca';
import FundoAnimado from '@/components/FundoAnimado';

const inicial: LoginState = {};

export default function LoginPage() {
  const [estado, formAction, pendente] = useActionState(entrar, inicial);
  const [estadoCod, codAction, pendCod] = useActionState(verificarCodigo, inicial);
  const [verSenha, setVerSenha] = useState(false);

  // Mostra a etapa do código (2FA) quando a senha foi aceita e pediu código,
  // e continua nela enquanto o código estiver errado. Volta pra senha se expirar.
  const mostrarCodigo = (estado.etapa === 'codigo' || estadoCod.etapa === 'codigo') && estadoCod.etapa !== 'senha';

  const temaVars = {
    ['--a' as string]: MARCA.cor,
    ['--ae' as string]: MARCA.corEsc,
    ['--ac' as string]: MARCA.corClaro,
    ['--a2' as string]: MARCA.cor2,
    ['--bg' as string]: MARCA.fundo,
  };

  return (
    <>
      <style>{`
        .pb-login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;background:var(--bg)}
        .pb-login::before{content:'';position:absolute;inset:0;z-index:0;
          background:var(--bg) url('/galaxy.jpg') center/cover no-repeat;filter:brightness(.42) saturate(.55) hue-rotate(65deg)}
        .pb-login::after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;
          background:radial-gradient(60% 48% at 50% 20%,color-mix(in srgb,var(--a) 22%,transparent),transparent 62%),radial-gradient(48% 42% at 80% 30%,color-mix(in srgb,var(--a2) 20%,transparent),transparent 62%),linear-gradient(color-mix(in srgb,var(--bg) 60%,transparent),color-mix(in srgb,var(--bg) 92%,#000 6%))}
        /* Fundo animado ligado: o glow/overlay (::after) desce p/ z0 e as partículas
           (canvas z1) ficam ACIMA dele — senão o overlay escuro tapava os pontos. */
        .pb-login.anim{background:transparent}
        .pb-login.anim::before{display:none}
        .pb-login.anim::after{z-index:0}
        .lg-box{position:relative;z-index:2;width:100%;max-width:360px;
          background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 82%,#fff 5%),color-mix(in srgb,var(--bg) 90%,#000 6%));
          border:1px solid color-mix(in srgb,var(--a) 30%,transparent);border-radius:18px;padding:30px 26px;
          backdrop-filter:blur(14px);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 55px color-mix(in srgb,var(--a) 18%,transparent)}
        .lg-inp{width:100%;background:color-mix(in srgb,var(--bg) 70%,#000 12%);border:1px solid color-mix(in srgb,var(--a) 26%,transparent);border-radius:10px;padding:12px 14px;color:#eaf0e6;font-size:15px;outline:none;display:block;margin-bottom:12px;box-sizing:border-box;font-family:inherit;transition:.15s}
        .lg-inp::placeholder{color:color-mix(in srgb,var(--a) 45%,#8a97a3)}
        .lg-inp:focus{border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 18%,transparent)}
        .lg-lbl{color:color-mix(in srgb,var(--a) 40%,#cbd5e1);font-size:11px;font-weight:700;display:block;margin-bottom:5px;letter-spacing:.05em}
        .lg-btn{width:100%;background:linear-gradient(135deg,var(--a),var(--a2));color:#07130d;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.03em;font-family:inherit;box-shadow:0 12px 30px color-mix(in srgb,var(--a) 35%,transparent);transition:.15s}
        .lg-btn:hover{filter:brightness(1.06)}
        .lg-btn:disabled{opacity:.6;cursor:default}
      `}</style>

      <main className={`pb-login${MARCA.bgAnim ? ' anim' : ''}`} style={temaVars}>
        {MARCA.bgAnim && <FundoAnimado zIndex={1} />}
        <div className="lg-box">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div
              style={{
                width: 106,
                height: 106,
                borderRadius: 26,
                padding: 3,
                background: 'linear-gradient(135deg,var(--ac),var(--a) 55%,var(--a2))',
                boxShadow: '0 0 22px color-mix(in srgb,var(--a) 55%,transparent), 0 0 9px color-mix(in srgb,var(--a2) 50%,transparent), 0 10px 26px rgba(0,0,0,.4)',
              }}
            >
              <Image
                src={MARCA.logo}
                alt={MARCA.nome}
                width={100}
                height={100}
                priority
                style={{ borderRadius: 23, objectFit: 'cover', display: 'block', width: '100%', height: '100%' }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  backgroundImage: 'linear-gradient(115deg,var(--a),var(--a2))',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: '.6px',
                  lineHeight: 1.1,
                }}
              >
                {MARCA.nome}
              </div>
              <div style={{ color: '#8ba468', fontSize: 12, marginTop: 2, letterSpacing: '.02em' }}>
                {mostrarCodigo ? 'Verificação em duas etapas' : 'Acesso ao sistema'}
              </div>
            </div>
          </div>

          {mostrarCodigo ? (
            <form action={codAction}>
              <div style={{ color: '#a9bd82', fontSize: 12.5, lineHeight: 1.6, marginBottom: 14, textAlign: 'center' }}>
                Digite o código de 6 dígitos do seu app autenticador
                <br />
                <span style={{ color: '#7d8a63' }}>(ou um código de recuperação)</span>
              </div>

              <label className="lg-lbl">CÓDIGO</label>
              <input
                name="codigo"
                className="lg-inp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                maxLength={14}
                style={{ textAlign: 'center', letterSpacing: '.3em', fontSize: 20, fontWeight: 700 }}
              />

              {estadoCod.erro && (
                <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{estadoCod.erro}</div>
              )}

              <button type="submit" className="lg-btn" disabled={pendCod} style={{ marginTop: 8 }}>
                {pendCod ? 'Verificando…' : 'Confirmar código →'}
              </button>

              <div
                onClick={() => window.location.reload()}
                style={{ color: '#8ba468', fontSize: 12, cursor: 'pointer', textAlign: 'center', marginTop: 14 }}
              >
                ← Voltar ao login
              </div>
            </form>
          ) : (
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
                  color: '#8ba468',
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', color: '#a9bd82', fontSize: 12 }}>
                <input type="checkbox" defaultChecked style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--a)' }} />
                Lembrar acesso
              </label>
              <span
                onClick={() => alert('Fale com o administrador para redefinir sua senha.')}
                style={{ color: 'var(--a)', fontSize: 12, cursor: 'pointer' }}
              >
                Esqueci minha senha
              </span>
            </div>

            <button type="submit" className="lg-btn" disabled={pendente}>
              {pendente ? 'Entrando…' : 'Entrar no painel →'}
            </button>
          </form>
          )}

          <div style={{ fontSize: 11.5, textAlign: 'center', marginTop: 22, lineHeight: 1.75 }}>
            <div style={{ color: '#cdb15f', fontWeight: 700 }}>© 2026 Tracker Tipster</div>
            <div style={{ color: '#8ba468' }}>Desenvolvedora de Softwares e Automações</div>
            <a
              href="https://wa.me/5567991995885"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#a9bd82', textDecoration: 'none', display: 'inline-block', marginTop: 3 }}
            >
              Contato: (67) 99199-5885
            </a>
            <a
              href="https://trackertipster.site/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#a9bd82', textDecoration: 'none', display: 'block', marginTop: 3 }}
            >
              www.trackertipster.site
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
