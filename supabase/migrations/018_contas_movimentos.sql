-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 018: histórico de movimentação das contas.
--
--  Hoje `contas.deposito` e `contas.retirada` são TOTAIS acumulados: o dono edita o
--  número e o anterior se perde. Não dá para saber quando entrou cada depósito nem
--  quanto foi sacado ontem — só o bolo.
--
--  Aqui guardamos cada MOVIMENTO com data/hora. O registro é feito comparando o
--  valor antes x depois a cada "Salvar": se o total depositado foi de 1.000 para
--  3.000, entra um depósito de 2.000 com a data/hora daquele momento.
--
--  `valor` pode ser NEGATIVO — é a correção de um lançamento errado (ex.: digitou
--  10.000 no lugar de 1.000). Guardamos `de`/`para` para a conta bater na auditoria.
--
--  Rode no Supabase SQL Editor. Idempotente.
-- ════════════════════════════════════════════════════════════════
create table if not exists public.contas_movimentos (
  id        bigint generated always as identity primary key,
  conta_id  bigint not null references public.contas(id) on delete cascade,
  tipo      text   not null check (tipo in ('deposito', 'retirada', 'saldo', 'em_aberto')),
  valor     numeric(14,2) not null,   -- quanto mudou (negativo = correção/estorno)
  de        numeric(14,2),            -- total antes
  para      numeric(14,2),            -- total depois
  criado_em timestamptz not null default now()
);

-- A tela do histórico lê sempre por conta, do mais recente para o mais antigo.
create index if not exists contas_mov_conta_idx on public.contas_movimentos (conta_id, criado_em desc);

alter table public.contas_movimentos enable row level security;

comment on table public.contas_movimentos is
  'Histórico de movimentação de cada conta (depósitos, retiradas e ajustes de saldo), com data/hora.';
