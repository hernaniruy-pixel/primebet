-- ═══════════════════════════════════════════════════════════════════
--  031 · Quem fez cada lançamento no histórico das contas
--
--  O histórico (contas_movimentos) mostrava só data/hora e valor. Os sócios
--  precisam saber QUAL usuário (admin/gestor/operador) lançou/alterou. Guardamos
--  o nome e o papel de quem estava logado no momento do lançamento.
--
--  Linhas antigas ficam com NULL (a tela mostra "—"). Idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.contas_movimentos
  add column if not exists ator_nome text,
  add column if not exists ator_tipo text;
