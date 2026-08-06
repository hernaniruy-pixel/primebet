'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  iniciarCadastro2fa, confirmarCadastro2fa, regenerarRecuperacao2fa, desativar2faAtual,
  type EstadoSeguranca,
} from './actions';
import type { EventoAcesso } from '@/lib/login-audit';

function quando(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function dispositivo(ua: string | null): string {
  const s = ua || '';
  if (/iPhone|iPad|iPod/i.test(s)) return 'iPhone/iPad';
  if (/Android/i.test(s)) return 'Android';
  if (/Windows/i.test(s)) return 'Windows';
  if (/Mac OS/i.test(s)) return 'Mac';
  if (/Linux/i.test(s)) return 'Linux';
  return s ? s.slice(0, 24) : '—';
}

const TIPO_LABEL: Record<string, string> = {
  master: 'Master', admin: 'Admin', gestor: 'Gestor', operador: 'Operador', cliente: 'Cliente',
};

export default function Seguranca({ estadoIni, acessosIni }: { estadoIni: EstadoSeguranca; acessosIni: EventoAcesso[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [estado, setEstado] = useState(estadoIni);
  const [fase, setFase] = useState<'ver' | 'cadastro' | 'recuperacao'>('ver');
  const [qr, setQr] = useState('');
  const [segredo, setSegredo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [recuperacao, setRecuperacao] = useState<string[]>([]);

  const ativar = () =>
    start(async () => {
      setErro('');
      const r = await iniciarCadastro2fa();
      if (!r.ok) { setErro(r.erro); return; }
      setQr(r.qr); setSegredo(r.segredo); setCodigo(''); setFase('cadastro');
    });

  const confirmar = () =>
    start(async () => {
      setErro('');
      const r = await confirmarCadastro2fa(codigo);
      if (!r.ok) { setErro(r.erro); return; }
      setRecuperacao(r.recuperacao);
      setEstado((e) => ({ ...e, ativo: true, obrigatorio: false, restamRecuperacao: r.recuperacao.length }));
      setFase('recuperacao');
    });

  const regenerar = () =>
    start(async () => {
      const r = await regenerarRecuperacao2fa();
      if (r.ok && r.recuperacao) { setRecuperacao(r.recuperacao); setFase('recuperacao'); }
    });

  const desativar = () =>
    start(async () => {
      if (!confirm('Desativar o 2FA? Sua conta volta a exigir só a senha.')) return;
      const r = await desativar2faAtual();
      if (!r.ok) { setErro(r.erro || 'Não foi possível desativar.'); return; }
      setEstado((e) => ({ ...e, ativo: false, restamRecuperacao: 0 }));
      setFase('ver');
    });

  const concluir = () => { setFase('ver'); setRecuperacao([]); router.refresh(); };

  const copiarCodigos = () => navigator.clipboard?.writeText(recuperacao.join('\n')).catch(() => {});

  return (
    <div className="sg-wrap">
      <style>{`
        .sg-wrap{min-height:100vh;background:#0b1207;color:#e7efd8;padding:28px 18px 60px;font-family:inherit}
        .sg-inner{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
        .sg-top{display:flex;align-items:center;gap:12px;margin-bottom:2px}
        .sg-back{color:#8ba468;font-size:13px;text-decoration:none;cursor:pointer}
        .sg-h1{font-size:22px;font-weight:800;color:#f0d67a;letter-spacing:.3px}
        .sg-card{background:linear-gradient(180deg,rgba(26,40,15,.5),rgba(13,21,8,.4));border:1px solid rgba(120,160,50,.24);border-radius:16px;padding:22px}
        .sg-card h2{font-size:15px;font-weight:800;color:#cfe0a8;margin:0 0 4px}
        .sg-sub{color:#9fb27d;font-size:12.5px;line-height:1.6}
        .sg-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px}
        .sg-on{background:rgba(52,168,83,.16);color:#7ee08a;border:1px solid rgba(52,168,83,.35)}
        .sg-off{background:rgba(239,68,68,.14);color:#f19d9d;border:1px solid rgba(239,68,68,.32)}
        .sg-btn{background:linear-gradient(135deg,#B8860B,#DAA520);color:#1a1400;border:none;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit}
        .sg-btn:disabled{opacity:.55;cursor:default}
        .sg-btn2{background:transparent;color:#a9bd82;border:1px solid rgba(120,160,50,.4);border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
        .sg-btn-danger{background:transparent;color:#f19d9d;border:1px solid rgba(239,68,68,.4);border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
        .sg-inp{background:rgba(9,16,6,.6);border:1px solid rgba(120,160,50,.3);border-radius:10px;padding:12px 14px;color:#eaf0dc;font-size:20px;letter-spacing:.3em;text-align:center;font-weight:700;width:200px;outline:none;font-family:inherit}
        .sg-inp:focus{border-color:#DAA520}
        .sg-warn{background:rgba(218,165,32,.1);border:1px solid rgba(218,165,32,.4);border-radius:12px;padding:14px 16px;color:#f0d67a;font-size:13px;line-height:1.6}
        .sg-err{color:#ef4444;font-size:12.5px;margin-top:8px}
        .sg-secret{font-family:ui-monospace,monospace;background:rgba(9,16,6,.7);border:1px dashed rgba(120,160,50,.4);border-radius:8px;padding:8px 12px;color:#cfe0a8;font-size:13px;letter-spacing:.12em;word-break:break-all;display:inline-block}
        .sg-codes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
        .sg-code{font-family:ui-monospace,monospace;background:rgba(9,16,6,.6);border:1px solid rgba(120,160,50,.28);border-radius:8px;padding:9px 12px;color:#e7efd8;font-size:14px;letter-spacing:.08em;text-align:center}
        .sg-steps{color:#9fb27d;font-size:12.5px;line-height:1.9;padding-left:18px;margin:8px 0 14px}
        .sg-table{width:100%;border-collapse:collapse;font-size:12.5px}
        .sg-table th{text-align:left;color:#8ba468;font-weight:700;padding:8px 10px;border-bottom:1px solid rgba(120,160,50,.2);white-space:nowrap}
        .sg-table td{padding:8px 10px;border-bottom:1px solid rgba(120,160,50,.1);color:#cdd8b6}
        .sg-ok{color:#7ee08a;font-weight:700}
        .sg-fail{color:#f19d9d;font-weight:700}
        .sg-scroll{overflow-x:auto}
        .sg-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}
      `}</style>

      <div className="sg-inner">
        <div className="sg-top">
          <a className="sg-back" onClick={() => router.push('/admin')}>← Painel</a>
          <div className="sg-h1">🔐 Segurança</div>
        </div>

        {estado.obrigatorio && fase === 'ver' && (
          <div className="sg-warn">
            <b>Ative o 2FA para continuar.</b> Sua conta de administrador da rede (master) exige verificação
            em duas etapas. Leva 1 minuto: instale um app autenticador (Google Authenticator, Authy) e escaneie o QR.
          </div>
        )}

        {/* ── Cartão 2FA ── */}
        <div className="sg-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2>Verificação em duas etapas (2FA)</h2>
              <div className="sg-sub">
                {estado.tipo === 'master'
                  ? 'Obrigatório para o master. Um código do app autenticador é pedido a cada login.'
                  : 'Opcional, mas recomendado. Protege sua conta mesmo se a senha vazar.'}
              </div>
            </div>
            <span className={`sg-badge ${estado.ativo ? 'sg-on' : 'sg-off'}`}>
              {estado.ativo ? '● Ativo' : '○ Desligado'}
            </span>
          </div>

          {/* Ver / desligado */}
          {fase === 'ver' && !estado.ativo && (
            <div className="sg-row">
              <button className="sg-btn" onClick={ativar} disabled={pend}>
                {pend ? 'Gerando…' : 'Ativar 2FA'}
              </button>
              {erro && <span className="sg-err">{erro}</span>}
            </div>
          )}

          {/* Ver / ativo */}
          {fase === 'ver' && estado.ativo && (
            <>
              <div className="sg-sub" style={{ marginTop: 12 }}>
                {estado.confirmadoEm && <>Ativado em {quando(estado.confirmadoEm)}. </>}
                Restam <b style={{ color: '#cfe0a8' }}>{estado.restamRecuperacao}</b> códigos de recuperação.
              </div>
              <div className="sg-row">
                <button className="sg-btn2" onClick={regenerar} disabled={pend}>Gerar novos códigos de recuperação</button>
                {estado.tipo === 'admin' && (
                  <button className="sg-btn-danger" onClick={desativar} disabled={pend}>Desativar 2FA</button>
                )}
              </div>
              {erro && <div className="sg-err">{erro}</div>}
            </>
          )}

          {/* Cadastro (QR) */}
          {fase === 'cadastro' && (
            <div style={{ marginTop: 16 }}>
              <ol className="sg-steps">
                <li>Abra o app autenticador (Google Authenticator, Authy, 1Password…).</li>
                <li>Escaneie o QR abaixo (ou digite a chave manualmente).</li>
                <li>Digite o código de 6 dígitos que aparecer para confirmar.</li>
              </ol>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
                {qr && (
                  <Image src={qr} alt="QR do 2FA" width={200} height={200}
                    style={{ borderRadius: 12, background: '#fff', padding: 6 }} unoptimized />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div className="sg-sub" style={{ marginBottom: 5 }}>Chave manual:</div>
                    <span className="sg-secret">{segredo}</span>
                  </div>
                  <div>
                    <div className="sg-sub" style={{ marginBottom: 5 }}>Código do app:</div>
                    <input className="sg-inp" value={codigo} inputMode="numeric" maxLength={6}
                      placeholder="000000" autoFocus
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
                  </div>
                  <div className="sg-row" style={{ marginTop: 2 }}>
                    <button className="sg-btn" onClick={confirmar} disabled={pend || codigo.length !== 6}>
                      {pend ? 'Confirmando…' : 'Confirmar e ativar'}
                    </button>
                    <button className="sg-btn2" onClick={() => { setFase('ver'); setErro(''); }} disabled={pend}>Cancelar</button>
                  </div>
                  {erro && <div className="sg-err">{erro}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Códigos de recuperação */}
          {fase === 'recuperacao' && (
            <div style={{ marginTop: 16 }}>
              <div className="sg-warn" style={{ marginBottom: 8 }}>
                <b>Guarde estes códigos de recuperação.</b> Cada um serve UMA vez, para entrar caso você perca
                o celular. Eles não aparecem de novo — salve num lugar seguro.
              </div>
              <div className="sg-codes">
                {recuperacao.map((c) => <div key={c} className="sg-code">{c}</div>)}
              </div>
              <div className="sg-row">
                <button className="sg-btn2" onClick={copiarCodigos}>Copiar códigos</button>
                <button className="sg-btn" onClick={concluir}>Concluí, salvei os códigos</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Auditoria de acessos ── */}
        <div className="sg-card">
          <h2>Últimos acessos</h2>
          <div className="sg-sub" style={{ marginBottom: 12 }}>Quem entrou (ou tentou), quando, de onde e em qual dispositivo.</div>
          <div className="sg-scroll">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>Data/Hora</th><th>Usuário</th><th>Resultado</th><th>IP</th><th>Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {acessosIni.length === 0 && (
                  <tr><td colSpan={5} style={{ color: '#8ba468', padding: '16px 10px' }}>Nenhum acesso registrado ainda.</td></tr>
                )}
                {acessosIni.map((a) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{quando(a.quando)}</td>
                    <td>{TIPO_LABEL[a.sujeito_tipo || ''] || a.sujeito_tipo || '—'}{a.sujeito_nome ? ` · ${a.sujeito_nome}` : ''}</td>
                    <td className={a.sucesso ? 'sg-ok' : 'sg-fail'}>{a.sucesso ? 'OK' : 'Falhou'}{a.motivo ? ` (${a.motivo})` : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.ip || '—'}</td>
                    <td>{dispositivo(a.agente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
