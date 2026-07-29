-- ═══════════════════════════════════════════════════════════════════
--  027 · Trava de tentativas no login (anti-força-bruta)
--
--  Guarda, por chave (nome de usuário em minúsculas), quantas tentativas
--  FALHARAM em sequência e até quando o login fica bloqueado. Zera no
--  acerto. Com scrypt (lento) + este teto, força-bruta fica inviável.
--
--  RLS ligada, sem policy pública: só o service-role (server) enxerga.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.login_rate (
  chave         text primary key,               -- lower(usuario)
  falhas        int  not null default 0,
  ate           timestamptz,                     -- bloqueado até (null = liberado)
  atualizado_em timestamptz not null default now()
);

alter table public.login_rate enable row level security;
