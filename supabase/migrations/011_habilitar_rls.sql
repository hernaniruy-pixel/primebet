-- ════════════════════════════════════════════════════════════════
--  011 — Segurança: habilita RLS nas tabelas que ficaram sem ele.
--  bancas / despesas / imagens_recebidas foram criadas sem RLS, ficando
--  acessíveis pela anon key (pública, vai pro navegador). Aqui ligamos RLS
--  SEM políticas públicas — só o servidor (service_role) acessa, igual a
--  afiliados/clientes/apostas. O app e o bot usam service_role, então nada
--  quebra; a anon key deixa de ler/gravar essas tabelas.
-- ════════════════════════════════════════════════════════════════
alter table public.bancas            enable row level security;
alter table public.despesas          enable row level security;
alter table public.imagens_recebidas enable row level security;
