-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 014: contas de aposta (controle dos donos).
--  Cada conta é de uma casa (Bet365/Betano/SuperBet…). Os donos atualizam
--  saldo/em aberto/depósito/retirada diariamente. RLS ligado (só service_role).
--  Rode no Supabase SQL Editor. Idempotente.
-- ════════════════════════════════════════════════════════════════
create table if not exists public.contas (
  id            bigint generated always as identity primary key,
  banca_id      bigint not null,
  casa          text not null default '',
  login         text not null default '',
  nome          text not null default '',
  cpf           text not null default '',
  saldo         numeric(14,2) not null default 0,
  em_aberto     numeric(14,2) not null default 0,
  deposito      numeric(14,2) not null default 0,   -- total depositado
  retirada      numeric(14,2) not null default 0,   -- total sacado
  atualizado_em timestamptz  not null default now(),
  criado_em     timestamptz  not null default now()
);

create index if not exists contas_banca_idx on public.contas(banca_id);
create index if not exists contas_casa_idx  on public.contas(casa);

alter table public.contas enable row level security;
