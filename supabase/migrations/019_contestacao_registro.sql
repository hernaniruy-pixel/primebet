-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 019: registro PERMANENTE da contestação.
--  Rode no Supabase SQL Editor. Idempotente.
--
--  Antes, ao resolver uma contestação, todos os campos eram apagados e não
--  sobrava nenhum rastro de que a aposta havia sido contestada. Aqui guardamos
--  QUANDO foi resolvida e COMO (aceita/recusada). Os campos contestacao (motivo)
--  e contestacao_status (sugerido) passam a ser PRESERVADOS ao resolver, servindo
--  de histórico. O que tira a aposta da fila é só a flag `contestada`.
-- ════════════════════════════════════════════════════════════════
alter table public.apostas
  add column if not exists contestacao_resolvida_em timestamptz,
  add column if not exists contestacao_desfecho text;  -- 'aceita' | 'recusada'
