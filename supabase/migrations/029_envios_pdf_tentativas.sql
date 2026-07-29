-- ═══════════════════════════════════════════════════════════════════
--  029 · Envio de PDF: contador de tentativas (retry em vez de erro fatal)
--
--  Um tropeço de conexão do bot ("Connection Closed") marcava o pedido como
--  erro PERMANENTE e o PDF nunca era entregue. Agora o bot reenvia nos
--  próximos ciclos (quando reconecta) e só desiste após N tentativas.
-- ═══════════════════════════════════════════════════════════════════

alter table public.envios_pdf
  add column if not exists tentativas int not null default 0;
