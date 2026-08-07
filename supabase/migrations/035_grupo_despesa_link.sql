-- ════════════════════════════════════════════════════════════════
--  Migração 035: GRUPO DE DESPESA por LINK (não mais por nome)
--
--  Antes: o bot achava o grupo de despesa pelo NOME (/despesa/i ou a env
--  GRUPO_DESPESA_NOME). Risco: se o cliente tiver OUTRO grupo com "despesa"
--  no nome, o robô lia o grupo errado.
--
--  Agora: o admin cola o LINK do grupo de despesa (igual ao do cliente). O
--  bot resolve o link para o JID (grupo_despesa_id) e lê SÓ aquele grupo.
--   • grupo_despesa_link = link colado no painel.
--   • grupo_despesa_id   = JID resolvido pelo bot (...@g.us).
--
--  ADITIVO: sem link configurado, o bot mantém o comportamento por NOME
--  (PrimeBet e clientes atuais ficam idênticos até colarem um link).
-- ════════════════════════════════════════════════════════════════

alter table public.bancas
  add column if not exists grupo_despesa_link text,
  add column if not exists grupo_despesa_id   text;
