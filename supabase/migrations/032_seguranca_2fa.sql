-- ════════════════════════════════════════════════════════════════
--  032 — Segurança de entrada: 2FA (TOTP) + auditoria de acessos.
--
--  • login_2fa      → segredo TOTP por sujeito ('master' | 'equipe:<id>'),
--                     códigos de recuperação (hash scrypt) e se está ativo.
--  • login_eventos  → histórico de acessos (quem, quando, IP, dispositivo,
--                     sucesso/falha e motivo). Dá visibilidade de quem entrou.
--
--  Idempotente (if not exists). O rate-limit por IP reaproveita a tabela
--  login_rate (mig. 027) com chave 'ip:<addr>' — não precisa de coluna nova.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.login_2fa (
  sujeito       text primary key,               -- 'master' | 'equipe:<id>'
  segredo       text not null,                  -- segredo TOTP em base32
  ativo         boolean not null default false, -- confirmado (validou o 1º código)
  recuperacao   jsonb not null default '[]'::jsonb, -- hashes scrypt dos códigos de recuperação
  criado_em     timestamptz not null default now(),
  confirmado_em timestamptz
);

create table if not exists public.login_eventos (
  id           bigint generated always as identity primary key,
  quando       timestamptz not null default now(),
  sujeito_tipo text,     -- master | admin | gestor | operador | cliente | desconhecido
  sujeito_nome text,
  sucesso      boolean not null,
  motivo       text,     -- senha_ok | senha_incorreta | bloqueado | 2fa_ok | 2fa_incorreto | 2fa_expirado
  ip           text,
  agente       text
);

create index if not exists login_eventos_quando_idx on public.login_eventos (quando desc);

-- Ambas server-only (service_role). RLS ligado + sem policy = ninguém acessa via anon.
alter table public.login_2fa     enable row level security;
alter table public.login_eventos enable row level security;
