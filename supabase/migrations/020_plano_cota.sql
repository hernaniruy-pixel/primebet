-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 020: PLANO + COTA DE TRANSCRIÇÕES
--  Cada banca tem um plano com cota mensal de bilhetes. Ao estourar,
--  NÃO trava: continua transcrevendo e o excedente é cobrado na
--  mensalidade seguinte. O "usado" é sempre uma CONSULTA AO VIVO
--  (nº de apostas transcritas do ciclo) — nunca um contador que soma
--  e pode dessincronizar. Correção não conta 2x; exclusão sai da conta.
-- ════════════════════════════════════════════════════════════════

-- 1) Config do plano na banca (tenant)
alter table public.bancas add column if not exists plano_nome        text    not null default 'Pro';
alter table public.bancas add column if not exists cota_mensal       integer not null default 3000;   -- bilhetes/mês inclusos
alter table public.bancas add column if not exists preco_excedente   numeric not null default 1.00;    -- R$ por bilhete acima da cota
alter table public.bancas add column if not exists renova_dia        integer not null default 1;       -- dia do mês em que o ciclo reinicia (1-28)
alter table public.bancas add column if not exists contador_zerado_em timestamptz;                     -- reset manual: conta só o que veio depois disto

-- guarda-corpo: dia de renovação sempre 1..28 (evita mês sem dia 29/30/31)
alter table public.bancas drop constraint if exists bancas_renova_dia_chk;
alter table public.bancas add  constraint bancas_renova_dia_chk check (renova_dia between 1 and 28);

-- 2) Flag de TESTE na aposta: bilhetes do grupo "Teste print NOMECLIENTE"
--    são transcritos (custam API), mas NÃO entram na cota do cliente.
alter table public.apostas add column if not exists teste boolean not null default false;

-- 3) Índice para a consulta da cota (banca + origem + teste + data)
create index if not exists apostas_cota_idx
  on public.apostas (banca_id, origem, teste, data);

-- 4) Função de uso da cota — fonte única de verdade, usada pelo painel e pelo bot.
--    Devolve início do ciclo, usados, cota, excedente e valor a cobrar.
--    ciclo_inicio = a última virada do dia de renovação (no fuso de Brasília);
--    se houve reset manual DEPOIS disso, vale o reset.
create or replace function public.uso_cota(p_banca_id bigint)
returns table (
  ciclo_inicio  timestamptz,
  usados        integer,
  cota          integer,
  excedente     integer,
  valor_excedente numeric,
  preco_excedente numeric,
  pct           numeric
)
language plpgsql
stable
as $$
declare
  v_cota    integer;
  v_preco   numeric;
  v_dia     integer;
  v_reset   timestamptz;
  v_hoje    date;
  v_inicio  timestamptz;
  v_usados  integer;
  v_exc     integer;
begin
  -- alias 'b' + qualificação: sem isso, "preco_excedente" colide com o parâmetro de
  -- saída de mesmo nome (ambíguo) e a função quebra.
  select b.cota_mensal, b.preco_excedente, b.renova_dia, b.contador_zerado_em
    into v_cota, v_preco, v_dia, v_reset
    from public.bancas b where b.id = p_banca_id;

  if v_cota is null then  -- banca inexistente: devolve zeros seguros
    return query select now(), 0, 0, 0, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  -- hoje no fuso de Brasília
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  -- início do ciclo: dia de renovação deste mês; se ainda não chegou, o do mês passado
  v_inicio := (date_trunc('month', v_hoje)::date + (v_dia - 1))::timestamp at time zone 'America/Sao_Paulo';
  if v_hoje < (date_trunc('month', v_hoje)::date + (v_dia - 1)) then
    v_inicio := ((date_trunc('month', v_hoje) - interval '1 month')::date + (v_dia - 1))::timestamp at time zone 'America/Sao_Paulo';
  end if;

  -- reset manual vence se for mais recente que o início natural do ciclo
  if v_reset is not null and v_reset > v_inicio then
    v_inicio := v_reset;
  end if;

  -- CONSULTA AO VIVO: bilhetes transcritos (origem whatsapp), não-teste, do ciclo.
  select count(*) into v_usados
    from public.apostas
   where banca_id = p_banca_id
     and origem   = 'whatsapp'
     and teste    = false
     and data    >= v_inicio;

  v_exc := greatest(v_usados - v_cota, 0);

  return query select
    v_inicio,
    v_usados,
    v_cota,
    v_exc,
    round(v_exc * v_preco, 2),
    v_preco,
    case when v_cota > 0 then round(v_usados::numeric * 100 / v_cota, 1) else 0 end;
end $$;
