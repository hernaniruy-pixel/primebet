-- ════════════════════════════════════════════════════════════════
--  SEED DA DEMO — função restaurar_demo() + 1ª carga.
--
--  ⚠️ APLIQUE SÓ NO PROJETO SUPABASE DA DEMO. Este arquivo NÃO faz parte
--  das migrações dos clientes reais — a função restaurar_demo() APAGA e
--  recarrega os dados operacionais, então nunca deve existir num cliente real.
--
--  Rode DEPOIS de schema.sql + functions.sql + migrations. Os saldos
--  (bruto/comissão/líquido) são calculados pelo trigger calc_aposta.
--
--  Objetivo (vídeo/demonstração): painel CHEIO e realista — 10 clientes
--  fictícios com histórico dos últimos ~30 dias (apostas resolvidas,
--  despesas, afiliados, acertos da semana passada, contas), pra filtrar
--  "semana passada" e simular um fechamento. O cliente TESTE DEMO fica
--  VAZIO, só com o link do grupo, para a transcrição AO VIVO.
-- ════════════════════════════════════════════════════════════════

create or replace function public.restaurar_demo()
returns void
language plpgsql
as $$
declare
  v_banca bigint;
  v_cli int;
  v_n   int;
  v_k   int;
  v_d   int;
  v_dt  timestamptz;
  v_odd numeric;
  v_val numeric;
  v_st  text;
  v_r   double precision;
  v_jogo text;
  v_casa text;
  v_seg date;
  v_dom date;
  times text[] := array['Real Madrid v Barcelona','Flamengo v Palmeiras','Man City v Liverpool','Bayern v Dortmund','PSG v Marseille','Juventus v Inter','Arsenal v Chelsea','Corinthians v Sao Paulo','Atletico-MG v Cruzeiro','Boca v River','Napoli v Roma','Sevilla v Betis','Ajax v PSV','Benfica v Porto','Gremio v Internacional'];
  mercados text[] := array['Resultado Final','Ambas Marcam - Sim','Mais de 2.5 - Total de Gols','Menos de 3.5 - Total de Gols','Dupla Chance','Handicap -1.5','Escanteios +9.5'];
  casas text[] := array['BET365','BETANO','SUPERBET','',''];
begin
  -- Zera os dados operacionais (mantém banca/config). CASCADE + RESTART IDENTITY.
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

  select id into v_banca from public.bancas order by id limit 1;

  -- banca_id é NOT NULL (mig 006). Fixa como DEFAULT p/ os inserts abaixo.
  execute format('alter table public.afiliados alter column banca_id set default %s', v_banca);
  execute format('alter table public.clientes  alter column banca_id set default %s', v_banca);
  execute format('alter table public.apostas   alter column banca_id set default %s', v_banca);

  -- ── AFILIADOS (supervisores) ──
  insert into public.afiliados (id, nome, comissao_pct) values
    (1, 'Carlos Mendes', 15),
    (2, 'Rafael Souza',  10),
    (3, 'Bruno Lima',     0),
    (4, 'Andre Costa',   10);

  -- ── CLIENTES: 10 fictícios (com histórico) ──
  insert into public.clientes
    (id, nome, senha_hash, ativo, calcao, desconto, comissao_pct, afiliado_id, afiliado_comissao_pct) values
    (1,  'RODRIGO',  '1234', true,    0, 0.01, 6, 1,    15),
    (2,  'MATHEUS',  '1234', true, 2000, 0.01, 6, 2,    10),
    (3,  'FELIPAO',  '1234', true,    0, 0.01, 6, null, 0),
    (4,  'THIAGO',   '1234', true, 1500, 0.01, 6, 3,    0),
    (5,  'DUDU',     '1234', true,    0, 0.01, 6, 1,    15),
    (6,  'VINICIUS', '1234', true,    0, 0,    6, 4,    10),
    (7,  'KAIO',     '1234', true,  800, 0.01, 6, 2,    10),
    (8,  'PEDRO',    '1234', true,    0, 0.01, 6, null, 0),
    (9,  'LEANDRO',  '1234', true, 3000, 0.01, 6, 3,    0),
    (10, 'GUSTAVO',  '1234', true,    0, 0.01, 6, 4,    10);

  -- ── CLIENTE TESTE DEMO: vazio, só com o link do grupo (transcrição ao vivo) ──
  insert into public.clientes
    (id, nome, senha_hash, ativo, calcao, desconto, comissao_pct, afiliado_id, afiliado_comissao_pct, grupo_link) values
    (11, 'TESTE DEMO', '1234', true, 0, 0.01, 6, null, 0, 'https://chat.whatsapp.com/HQLADSgM6xz518M0UjIbLD');

  -- ── APOSTAS: 6–12 por cliente nos últimos 30 dias, status variado ──
  for v_cli in 1..10 loop
    v_n := 6 + floor(random() * 7)::int;
    for v_k in 1..v_n loop
      v_d  := floor(random() * 30)::int;
      v_dt := now() - (v_d || ' days')::interval - (floor(random() * 13) || ' hours')::interval;
      v_odd := round((1.4 + random() * 1.6)::numeric, 2);
      v_val := (50 + floor(random() * 20)::int * 50);
      if v_d <= 1 then
        v_st := 'EM ABERTO';
      else
        v_r := random();
        -- Vantagem de banca (~9% do turnover): os jogadores perdem no agregado, como
        -- numa banca real. Assim o Modelo B (cashback sobre perda) mostra a casa
        -- LUCRANDO; no Modelo A a casa segue com a comissão dos greens que sobram.
        v_st := case
          when v_r < 0.30 then 'GREEN'
          when v_r < 0.76 then 'RED'
          when v_r < 0.84 then 'MEIO GREEN'
          when v_r < 0.92 then 'MEIO RED'
          when v_r < 0.96 then 'REEMBOLSO'
          else 'EM ABERTO' end;
      end if;
      v_jogo := '1) ' || times[1 + floor(random() * 15)::int]
                || ' (Odd ' || replace(v_odd::text, '.', ',') || ')'
                || chr(10) || '- ' || mercados[1 + floor(random() * 7)::int];
      v_casa := casas[1 + floor(random() * 5)::int];
      insert into public.apostas (cliente_id, data, jogo, odd, valor, status, casa, origem, baixa_liquidez)
        values (v_cli, v_dt, v_jogo, v_odd, v_val, v_st, v_casa, 'manual', random() < 0.08);
    end loop;
  end loop;

  -- ── DESPESAS: 12 espalhadas no mês ──
  insert into public.despesas (banca_id, descricao, valor, data, grupo_nome, msg_id)
  select v_banca,
    (array['Gasolina','Uber','Internet','Aluguel sala','Cafe equipe','Material escritorio','Energia','Agua','Marketing','Telefone','Manutencao PC','Almoco equipe'])[n],
    (30 + (n * 17) % 120)::numeric,   -- despesas menores: no Modelo A a comissão ainda supera as despesas
    now() - ((n * 2) || ' days')::interval,
    'Despesas demo', 'seed-desp-' || n
  from generate_series(1, 12) as g(n);

  -- ── ACERTOS: pagamentos/recebimentos da SEMANA PASSADA (seg–dom) ──
  v_seg := (date_trunc('week', now() at time zone 'America/Sao_Paulo')::date) - 7;
  v_dom := v_seg + 6;
  insert into public.acertos (banca_id, cliente_id, dt1, dt2, tipo, valor, obs, ator_tipo, ator_nome) values
    (v_banca, 1, v_seg, v_dom, 'pago',     1250, 'Pagamento da semana',    'admin', 'admin'),
    (v_banca, 2, v_seg, v_dom, 'recebido',  430, 'Recebido do cliente',    'admin', 'admin'),
    (v_banca, 4, v_seg, v_dom, 'pago',      780, 'Pagamento parcial',      'admin', 'admin'),
    (v_banca, 5, v_seg, v_dom, 'recebido',  600, 'Recebido',               'admin', 'admin'),
    (v_banca, 7, v_seg, v_dom, 'pago',      320, 'Pagamento',              'admin', 'admin'),
    (v_banca, 9, v_seg, v_dom, 'recebido', 1500, 'Recebido',               'admin', 'admin');

  -- ── CONTAS (casas usadas para replicar apostas) ──
  insert into public.contas (banca_id, casa, login, nome, cpf, saldo, em_aberto, deposito, retirada) values
    (v_banca, 'BET365',   'bet365_01', 'Conta Bet365',   '000.000.000-00', 5200,  800, 12000, 6000),
    (v_banca, 'BETANO',   'betano_01', 'Conta Betano',   '000.000.000-00', 3100, 1200,  9000, 4700),
    (v_banca, 'SUPERBET', 'super_01',  'Conta SuperBet', '000.000.000-00', 1800,  300,  5000, 2900),
    (v_banca, 'BET365',   'bet365_02', 'Conta Bet365 2', '000.000.000-00',  900,    0,  3000, 2100);

  -- ── Sequences (ids explícitos em afiliados/clientes) ──
  perform setval(pg_get_serial_sequence('public.afiliados', 'id'), (select max(id) from public.afiliados));
  perform setval(pg_get_serial_sequence('public.clientes',  'id'), (select max(id) from public.clientes));
end;
$$;

-- 1ª carga.
select public.restaurar_demo();
