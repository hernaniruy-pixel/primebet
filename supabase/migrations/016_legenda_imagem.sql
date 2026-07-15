-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 016: guardar a LEGENDA/TEXTO do valor da imagem.
--
--  PROBLEMA: o cliente manda o print e escreve o valor NA MENSAGEM DE BAIXO
--  (uma segunda mensagem, só com o número). O bot só lia a legenda colada na
--  própria imagem, então esse valor se perdia e a aposta entrava sem valor.
--
--  SOLUÇÃO: quando chega um texto que é SÓ um valor logo depois de um print no
--  mesmo grupo, o bot gruda esse texto na linha da imagem (coluna `legenda`).
--  Na hora da reação, a legenda sai daqui — sobrevive até a reinicialização
--  do bot (a memória do processo, não).
--
--  Rode no Supabase SQL Editor. Idempotente.
-- ════════════════════════════════════════════════════════════════
alter table public.imagens_recebidas
  add column if not exists legenda text;

comment on column public.imagens_recebidas.legenda is
  'Texto do valor: legenda da própria imagem OU mensagem de texto enviada logo abaixo do print.';
