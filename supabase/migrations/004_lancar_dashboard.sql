-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 004: lançar (reagir) direto do dashboard
--  O painel enfileira um pedido; o bot (que tem a chave da IA e acesso
--  ao WhatsApp) processa, transcreve e grava a aposta. Idempotente.
-- ════════════════════════════════════════════════════════════════

alter table public.imagens_recebidas add column if not exists pedido_status  text;  -- null | 'pendente' | 'feito' | 'erro'
alter table public.imagens_recebidas add column if not exists pedido_emoji   text;  -- ⚪ ⚫ 🔵 ⚠️
alter table public.imagens_recebidas add column if not exists pedido_legenda text;  -- valor/observação opcional
alter table public.imagens_recebidas add column if not exists pedido_erro    text;

create index if not exists imgrec_pedido_idx on public.imagens_recebidas(pedido_status) where pedido_status = 'pendente';
