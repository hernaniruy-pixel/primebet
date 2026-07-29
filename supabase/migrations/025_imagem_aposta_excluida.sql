-- ═══════════════════════════════════════════════════════════════════
--  025 · Conferência: marca "aposta excluída" em vez de mostrar #null
--
--  Bug: imagens_recebidas.aposta_id tem FK "on delete set null". Quando
--  o operador EXCLUI uma aposta no painel, o vínculo zera mas `lancada`
--  continua true — a Conferência então imprime "#null". Nunca deve
--  acontecer: some a informação e assusta (parece bilhete perdido).
--
--  Fix: coluna própria `aposta_excluida`. O painel passa a marcá-la ao
--  excluir a aposta (nada some — a imagem fica rotulada "excluída", com
--  rastro). Aqui também fazemos o backfill das que já estão nesse estado.
--
--  IMPORTANTE: NADA é apagado. Só rotulamos. Bilhete nenhum é tocado.
-- ═══════════════════════════════════════════════════════════════════

alter table public.imagens_recebidas
  add column if not exists aposta_excluida boolean not null default false;

-- Backfill: toda imagem que ficou "lançada mas sem aposta" (o #null de hoje)
-- é, por definição, um bilhete cuja aposta foi excluída. Rotula retroativo.
update public.imagens_recebidas
   set aposta_excluida = true
 where lancada = true
   and aposta_id is null
   and aposta_excluida = false;
