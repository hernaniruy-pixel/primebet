-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 017: guardar a REFERÊNCIA da mensagem da imagem.
--
--  PROBLEMA: a Baileys não guarda histórico, então o bot mantinha as imagens
--  recentes só na MEMÓRIA do processo. Todo reinício (deploy, queda, reconexão)
--  apagava essa memória. A reação que chegasse depois caía na miniatura de 720px
--  da Conferência — e a IA, lendo letra miúda borrada, inventava número:
--  "odd 120 / valor 1", "valor 18,5", "valor 0,5". Dinheiro errado no painel.
--
--  SOLUÇÃO: guardar aqui o objeto da mensagem (mediaKey, directPath etc.). Com ele
--  o bot rebaixa a imagem ORIGINAL do WhatsApp mesmo depois de reiniciar, e a
--  miniatura volta a ser só o último recurso. São ~2 KB por imagem.
--
--  Rode no Supabase SQL Editor. Idempotente.
-- ════════════════════════════════════════════════════════════════
alter table public.imagens_recebidas
  add column if not exists msg_json jsonb;

comment on column public.imagens_recebidas.msg_json is
  'Mensagem original da Baileys (para rebaixar a imagem em ALTA depois de um restart). Sem isto, a reação cai na miniatura e a IA lê valores errados.';
