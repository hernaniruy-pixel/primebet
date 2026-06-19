-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 010: vínculo explícito grupo ↔ cliente
--  O operador cola o LINK do grupo no cadastro (grupo_link). O bot
--  resolve esse link para o ID interno do grupo (grupo_id, ...@g.us).
--  O match passa a ser por grupo_id (assertivo); nome vira reserva.
-- ════════════════════════════════════════════════════════════════

alter table public.clientes add column if not exists grupo_link text;  -- link colado (chat.whatsapp.com/...)
alter table public.clientes add column if not exists grupo_id   text;  -- ID interno resolvido pelo bot (...@g.us)

create index if not exists clientes_grupo_id_idx on public.clientes(grupo_id);
