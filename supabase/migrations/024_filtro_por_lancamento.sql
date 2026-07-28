-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 024: filtro opcional "por data de LANÇAMENTO"
--
--  O operador reage bilhetes com atraso (print do fim de semana → reage na
--  segunda). Pela regra da semana (data do PRINT, usada no fechamento/cobrança),
--  esse trabalho aparece na semana passada — e o operador estranha "sumiu".
--
--  Este filtro é SÓ DE VISUALIZAÇÃO: quando p_por_lancamento = true, o filtro de
--  data compara pela data em que o bilhete foi LANÇADO (apostas.criado_em) em vez
--  da data do print (apostas.data). NÃO muda fechamento/cobrança — só a listagem.
--  Padrão = false (comportamento atual idêntico).
--
--  ATENÇÃO: como esta versão tem um parâmetro A MAIS, o `create or replace` NÃO
--  substitui a função de 18 args da migração 023 — ele cria uma SEGUNDA função
--  (overload), e aí uma chamada sem o parâmetro fica ambígua ("could not choose
--  the best candidate"). Por isso derrubamos a versão antiga primeiro.
-- ════════════════════════════════════════════════════════════════

drop function if exists public.controle_listar(
  date, date, text, bigint, text, text, text,
  numeric, numeric, numeric, numeric,
  boolean, boolean, boolean, text, integer, integer, boolean
);

create or replace function public.controle_listar(
  p_dt1 date default null, p_dt2 date default null,
  p_id text default null, p_cliente bigint default null,
  p_status text default null, p_jogo text default null, p_descarrego text default null,
  p_odd_min numeric default null, p_odd_max numeric default null,
  p_val_min numeric default null, p_val_max numeric default null,
  p_bl boolean default null, p_adv boolean default null, p_irr boolean default null,
  p_sort text default 'data_desc', p_page int default 1, p_per int default 20,
  p_pendentes boolean default null,
  p_por_lancamento boolean default false
) returns json language sql stable as $$
  with f as (
    select a.* from public.apostas a
    -- Data comparada: PRINT (a.data) por padrão; LANÇAMENTO (a.criado_em) quando
    -- p_por_lancamento. Sempre em horário de Brasília (ver migração 023).
    where (p_dt1 is null or (case when p_por_lancamento then a.criado_em else a.data end at time zone 'America/Sao_Paulo')::date >= p_dt1)
      and (p_dt2 is null or (case when p_por_lancamento then a.criado_em else a.data end at time zone 'America/Sao_Paulo')::date <= p_dt2)
      and (p_id is null or a.id::text like '%'||p_id||'%')
      and (p_cliente is null or a.cliente_id = p_cliente)
      and (p_status is null or a.status = p_status)
      and (p_jogo is null or a.jogo ilike '%'||p_jogo||'%')
      and (p_descarrego is null or a.casa ilike '%'||p_descarrego||'%')
      and (p_odd_min is null or a.odd >= p_odd_min)
      and (p_odd_max is null or a.odd <= p_odd_max)
      and (p_val_min is null or a.valor >= p_val_min)
      and (p_val_max is null or a.valor <= p_val_max)
      and (p_bl is null or a.baixa_liquidez = p_bl)
      and (p_adv is null or a.advertido = p_adv)
      and (p_irr is null or a.irregular = p_irr)
      and (coalesce(p_pendentes, false) = false
           or a.status = 'EM ABERTO' or a.contestada = true)
  ),
  ord as (
    select f.*, row_number() over (
      order by
        case when coalesce(p_pendentes, false)
             then (case when f.contestada then 0 else 1 end) end asc,
        case when p_sort='data_asc' then f.data end asc,
        case when p_sort='data_desc' then f.data end desc,
        case when p_sort='val_asc' then f.valor end asc,
        case when p_sort='val_desc' then f.valor end desc,
        f.id desc
    ) rn
    from f
  )
  select json_build_object(
    'rows', coalesce((
      select json_agg(row_to_json(o.*) order by o.rn) from ord o
      where o.rn >  greatest(p_page-1,0)*greatest(p_per,1)
        and o.rn <= greatest(p_page-1,0)*greatest(p_per,1) + greatest(p_per,1)
    ), '[]'::json),
    'total', (select count(*) from f),
    'totals', json_build_object(
      'entradas',          coalesce((select sum(valor) from f),0),
      'em_aberto_total',   coalesce((select sum(valor) from f where status='EM ABERTO'),0),
      'em_aberto_qtd',     (select count(*) from f where status='EM ABERTO'),
      'saldo_bruto',       coalesce((select sum(saldo_bruto) from f),0),
      'comissao',          coalesce((select sum(comissao) from f),0),
      'comissao_afiliado', coalesce((select sum(comissao_afiliado) from f),0),
      'saldo_liquido',     coalesce((select sum(saldo_liquido) from f),0),
      'contestadas_qtd',   (select count(*) from f where contestada = true)
    )
  );
$$;
