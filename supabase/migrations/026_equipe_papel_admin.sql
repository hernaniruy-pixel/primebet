-- ═══════════════════════════════════════════════════════════════════
--  026 · Multi-admin: papel 'admin' na equipe
--
--  Hoje só existe UM admin (o "master" = dono da rede, no Supabase Auth).
--  Passa a existir o papel 'admin' na tabela equipe — é o dono do CLIENTE
--  (ex.: os 2 donos da PrimeBet). Ele gerencia gestor/operador e vê tudo,
--  mas NÃO cria/remove outros admins nem mexe em plano/cota (isso é do
--  master). Só o master cria admin.
--
--  Hierarquia: operador < gestor < admin < master.
--  (o master não fica nesta tabela — segue no Supabase Auth.)
-- ═══════════════════════════════════════════════════════════════════

alter table public.equipe drop constraint if exists equipe_papel_check;
alter table public.equipe
  add constraint equipe_papel_check check (papel in ('admin', 'gestor', 'operador'));
