-- ════════════════════════════════════════════════════════════════
--  SEED DA DEMO — função restaurar_demo() + 1ª carga.
--
--  ⚠️ APLIQUE SÓ NO PROJETO SUPABASE DA DEMO. Este arquivo NÃO faz parte
--  das migrações dos clientes reais — a função restaurar_demo() APAGA e
--  recarrega os dados operacionais, então nunca deve existir num cliente real.
--
--  Rode DEPOIS de schema.sql + functions.sql + migrations. Os saldos
--  (bruto/comissão/líquido) são calculados pelo trigger calc_aposta —
--  aqui só entram cliente/jogo/odd/valor/status.
--
--  As datas são RELATIVAS a now(): a demo sempre aparece "desta semana".
--  O botão "Restaurar demo" no painel chama esta função por RPC.
-- ════════════════════════════════════════════════════════════════

create or replace function public.restaurar_demo()
returns void
language plpgsql
as $$
declare
  v_banca bigint;
begin
  -- Zera os dados operacionais (mantém equipe/logins e config). CASCADE cobre
  -- qualquer tabela dependente. RESTART IDENTITY reinicia os ids.
  truncate table
    public.apostas,
    public.imagens_recebidas,
    public.despesas,
    public.contas_movimentos,
    public.contas,
    public.acertos,
    public.auditoria,
    public.envios_pdf,
    public.clientes,
    public.afiliados
    restart identity cascade;

  -- A migração 006 tornou banca_id NOT NULL em afiliados/clientes/apostas. A
  -- banca (linha em public.bancas) não é apagada pelo truncate acima. Fixamos o
  -- banca_id como DEFAULT das 3 tabelas para os inserts abaixo não precisarem
  -- repetir a coluna em cada linha.
  select id into v_banca from public.bancas order by id limit 1;
  execute format('alter table public.afiliados alter column banca_id set default %s', v_banca);
  execute format('alter table public.clientes  alter column banca_id set default %s', v_banca);
  execute format('alter table public.apostas   alter column banca_id set default %s', v_banca);

  -- ── AFILIADOS (supervisores) ──
  insert into public.afiliados (id, nome, comissao_pct) values
    (1, 'Samuel Henrique', 15),
    (2, 'Heitor Escossia',  0),
    (3, 'Lucas Tiger',     10),
    (4, 'Renan Cardoso',   10);

  -- ── CLIENTES (apostadores) ──
  insert into public.clientes
    (id, nome, senha_hash, ativo, calcao, desconto, comissao_pct, afiliado_id, afiliado_comissao_pct) values
    (1,  'AHLEFELD',    '102030', true,    0, 0.01, 6, null, 0),
    (2,  'BRUNOFIRMINO','666666', true,    0, 0.01, 6, 1,    15),
    (3,  'CAVALCANTE',  '909090', true, 3000, 0.01, 6, null, 0),
    (4,  'CRISTIAN',    '102030', true, 2045, 0.01, 6, 2,    10),
    (5,  'DAVID',       '050505', true, 1957, 0.01, 6, null, 0),
    (6,  'DAVIDLOPES',  '010101', true,    0, 0,    6, 1,    15),
    (7,  'DIEGOMORAIS', '858585', true,    0, 0.01, 6, 1,    15),
    (8,  'DRMURIELL',   '131313', true, 1500, 0.01, 6, 2,    10),
    (9,  'EDUARDO',     '242424', true,    0, 0.01, 6, 3,    10),
    (10, 'FELIPE',      '353535', true,    0, 0.01, 6, null, 0),
    (11, 'GABRIEL',     '464646', true,  800, 0.01, 6, 4,    10),
    (12, 'HENRIQUE',    '575757', true,    0, 0.01, 6, null, 0);

  -- ── APOSTAS (datas relativas a agora; trigger calcula os saldos) ──
  insert into public.apostas (cliente_id, data, jogo, odd, valor, status, casa, origem) values
    -- Hoje (fila EM ABERTO — o que aparece assim que abre o painel)
    (1,  now() - interval '1 hour',  E'1) Real Madrid v Barcelona (Odd 1,95)\n• Real Madrid – Resultado Final', 1.95, 800, 'EM ABERTO', 'BET365', 'manual'),
    (4,  now() - interval '2 hours', E'1) Arsenal – Chelsea (Odd 1,56)\n• Menos de 3.5 – Total de Gols\n• Arsenal – Dupla Chance', 1.56, 1200, 'EM ABERTO', 'BETANO', 'manual'),
    (7,  now() - interval '3 hours', E'1) Flamengo v Palmeiras (Odd 2,10)\n• Ambas Marcam – Sim', 2.10, 500, 'EM ABERTO', 'SUPERBET', 'manual'),
    (11, now() - interval '4 hours', E'1) Bayern v Leipzig (Odd 1,72)\n• Bayern -1.5 – Handicap', 1.72, 650, 'EM ABERTO', '', 'manual'),
    -- Ontem
    (2,  now() - interval '1 day 2 hours',  E'1) Manchester City v Liverpool (Odd 1,84)\n• Mais de 2.5 – Total de Gols', 1.84, 1000, 'GREEN', 'BETANO', 'manual'),
    (5,  now() - interval '1 day 5 hours',  E'1) Juventus v Napoli (Odd 1,90)\n• Napoli – Resultado Final', 1.90, 750, 'RED',   'BET365', 'manual'),
    (8,  now() - interval '1 day 7 hours',  E'1) PSG v Marseille (Odd 1,67)\n• PSG – Resultado Final', 1.67, 1500, 'GREEN', 'SUPERBET', 'manual'),
    (3,  now() - interval '1 day 9 hours',  E'1) Inter v Milan (Odd 2,05)\n• Menos de 2.5 – Total de Gols', 2.05, 400, 'MEIO GREEN', '', 'manual'),
    -- Anteontem
    (6,  now() - interval '2 days 3 hours', E'1) Atlético-MG v Cruzeiro (Odd 1,75)\n• Atlético-MG – Dupla Chance', 1.75, 900, 'GREEN', 'BETANO', 'manual'),
    (9,  now() - interval '2 days 6 hours', E'1) Dortmund v Wolfsburg (Odd 1,58)\n• Mais de 1.5 – Total de Gols', 1.58, 600, 'GREEN', 'BET365', 'manual'),
    (10, now() - interval '2 days 8 hours', E'1) Sevilla v Betis (Odd 2,20)\n• Betis – Resultado Final', 2.20, 350, 'RED', '', 'manual'),
    -- 3–4 dias atrás
    (1,  now() - interval '3 days 4 hours', E'1) Corinthians v São Paulo (Odd 1,88)\n• Menos de 3.5 – Total de Gols', 1.88, 700, 'GREEN', 'SUPERBET', 'manual'),
    (4,  now() - interval '3 days 7 hours', E'1) Chelsea v Tottenham (Odd 1,95)\n• Ambas Marcam – Sim', 1.95, 850, 'RED', 'BETANO', 'manual'),
    (12, now() - interval '4 days 5 hours', E'1) Boca Juniors v River Plate (Odd 2,00)\n• Empate – Resultado Final', 2.00, 300, 'GREEN', 'BET365', 'manual'),
    -- Semana passada (aparece no filtro "semana anterior")
    (2,  now() - interval '8 days',  E'1) Roma v Lazio (Odd 1,80)\n• Roma – Dupla Chance', 1.80, 500, 'GREEN', 'BETANO', 'manual'),
    (5,  now() - interval '9 days',  E'1) Ajax v PSV (Odd 1,70)\n• Mais de 2.5 – Total de Gols', 1.70, 650, 'RED', 'BET365', 'manual'),
    (7,  now() - interval '10 days', E'1) Benfica v Porto (Odd 2,10)\n• Menos de 2.5 – Total de Gols', 2.10, 450, 'GREEN', '', 'manual');

  -- ── Sequences (ids explícitos em afiliados/clientes) ──
  perform setval(pg_get_serial_sequence('public.afiliados', 'id'), (select max(id) from public.afiliados));
  perform setval(pg_get_serial_sequence('public.clientes',  'id'), (select max(id) from public.clientes));
end;
$$;

-- 1ª carga.
select public.restaurar_demo();
