-- ═══════════════════════════════════════════════════════════════════
--  030 · Permissões por usuário da equipe (perfil editável pelo admin)
--
--  Até aqui o acesso era SÓ por papel (operador < gestor < admin < master).
--  Agora o admin pode LIGAR permissões extras num operador específico, sem
--  mudar o cargo dele. A primeira permissão é "contas" (acesso à página de
--  contas de aposta). Guardado como JSON de flags: { "contas": true }.
--
--  Idempotente. Rode no SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

alter table public.equipe
  add column if not exists permissoes jsonb not null default '{}'::jsonb;
