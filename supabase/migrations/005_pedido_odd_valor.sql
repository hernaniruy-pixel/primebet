-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 005: lançar do dashboard com odd/valor digitados
--  Quando o operador marca "odd em aberto" / "valor em aberto" no painel,
--  ele DIGITA o valor ali; o bot usa isso para preencher o campo.
-- ════════════════════════════════════════════════════════════════

alter table public.imagens_recebidas add column if not exists pedido_odd   text;
alter table public.imagens_recebidas add column if not exists pedido_valor text;
