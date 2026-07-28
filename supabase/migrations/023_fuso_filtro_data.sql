-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 023: corrige o FUSO no filtro de data
--
--  Bug: o filtro usava `data::date` (e `enviado_em::date`), que converte no fuso do
--  banco (UTC). Um bilhete de DOMINGO 21:28 (horário de Brasília) fica gravado como
--  27/07 00:28 em UTC → o `::date` virava 27/07 e o bilhete caía na SEMANA SEGUINTE.
--  Ex.: bilhete de domingo aparecia em "esta semana" e sumia de "semana passada".
--
--  Fix: comparar sempre a data em Brasília: (data at time zone 'America/Sao_Paulo')::date.
--  Aplicado a: controle_listar, fechamento_clientes, fechamento_afiliados (apostas.data)
--  e conferencia_grupos (imagens_recebidas.enviado_em). Só muda o filtro de data.
-- ════════════════════════════════════════════════════════════════

-- ── controle_listar (lista/painel) ──
create or replace function public.controle_listar(
  p_dt1 date default null, p_dt2 date default null,
  p_id text default null, p_cliente bigint default null,
  p_status text default null, p_jogo text default null, p_descarrego text default null,
  p_odd_min numeric default null, p_odd_max numeric default null,
  p_val_min numeric default null, p_val_max numeric default null,
  p_bl boolean default null, p_adv boolean default null, p_irr boolean default null,
  p_sort text default 'data_desc', p_page int default 1, p_per int default 20,
  p_pendentes boolean default null
) returns json language sql stable as $$
  with f as (
    select a.* from public.apostas a
    where (p_dt1 is null or (a.data at time zone 'America/Sao_Paulo')::date >= p_dt1)
      and (p_dt2 is null or (a.data at time zone 'America/Sao_Paulo')::date <= p_dt2)
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

-- ── fechamento_clientes (por cliente + total) ──
create or replace function public.fechamento_clientes(p_dt1 date default null, p_dt2 date default null)
returns json language sql stable as $$
  with f as (
    select a.* from public.apostas a
    where (p_dt1 is null or (a.data at time zone 'America/Sao_Paulo')::date >= p_dt1)
      and (p_dt2 is null or (a.data at time zone 'America/Sao_Paulo')::date <= p_dt2)
  ),
  per as (
    select c.id, c.nome, c.calcao as cal,
      coalesce(sum(f.valor),0) val,
      coalesce(sum(f.valor) filter (where f.status='EM ABERTO'),0) ab,
      coalesce(sum(f.saldo_bruto),0) sb,
      coalesce(sum(f.comissao),0) cm,
      coalesce(sum(f.comissao_afiliado),0) caf,
      coalesce(sum(f.saldo_liquido),0) sl
    from public.clientes c join f on f.cliente_id = c.id
    group by c.id, c.nome, c.calcao
    having coalesce(sum(f.valor),0) > 0
  )
  select json_build_object(
    'rows', coalesce((select json_agg(json_build_object(
      'id',id,'nome',nome,'cal',cal,'val',val,'ab',ab,'sb',sb,'cm',cm,'caf',caf,'sl',sl,
      'saldoCal', cal+sl) order by nome) from per), '[]'::json),
    'g', json_build_object(
      'cal', coalesce((select sum(cal) from per),0),
      'saldoCal', coalesce((select sum(cal+sl) from per),0),
      'val', coalesce((select sum(val) from per),0),
      'ab', coalesce((select sum(ab) from per),0),
      'sb', coalesce((select sum(sb) from per),0),
      'cm', coalesce((select sum(cm) from per),0),
      'caf', coalesce((select sum(caf) from per),0),
      'sl', coalesce((select sum(sl) from per),0))
  );
$$;

-- ── fechamento_afiliados (por afiliado/supervisor + total) ──
create or replace function public.fechamento_afiliados(p_dt1 date default null, p_dt2 date default null)
returns json language sql stable as $$
  with f as (
    select a.* from public.apostas a
    where (p_dt1 is null or (a.data at time zone 'America/Sao_Paulo')::date >= p_dt1)
      and (p_dt2 is null or (a.data at time zone 'America/Sao_Paulo')::date <= p_dt2)
  ),
  per as (
    select af.id, af.nome as sup,
      (select count(*) from public.clientes c2 where c2.afiliado_id = af.id) logins,
      coalesce(sum(f.valor),0) val,
      coalesce(sum(f.valor) filter (where f.status='EM ABERTO'),0) ab,
      coalesce(sum(f.saldo_bruto),0) sb,
      coalesce(sum(f.comissao),0) cm,
      coalesce(sum(f.comissao_afiliado),0) caf,
      coalesce(sum(f.saldo_liquido),0) sl
    from public.afiliados af
    join public.clientes c on c.afiliado_id = af.id
    join f on f.cliente_id = c.id
    group by af.id, af.nome
  )
  select json_build_object(
    'rows', coalesce((select json_agg(json_build_object(
      'sup',sup,'logins',logins,'val',val,'ab',ab,'sb',sb,'cm',cm,'caf',caf,'sl',sl
    ) order by sup) from per), '[]'::json),
    'g', json_build_object(
      'logins', coalesce((select sum(logins) from per),0),
      'val', coalesce((select sum(val) from per),0),
      'ab', coalesce((select sum(ab) from per),0),
      'sb', coalesce((select sum(sb) from per),0),
      'cm', coalesce((select sum(cm) from per),0),
      'caf', coalesce((select sum(caf) from per),0),
      'sl', coalesce((select sum(sl) from per),0))
  );
$$;

-- ── conferencia_grupos (resumo por grupo) ──
create or replace function public.conferencia_grupos(p_dt1 date default null, p_dt2 date default null)
returns json language sql stable as $$
  select coalesce(json_agg(g order by g.pendentes desc, g.grupo_nome), '[]'::json) from (
    select
      grupo_id,
      max(grupo_nome)                                          as grupo_nome,
      bool_or(cliente_id is not null)                          as tem_cliente,
      count(*)                                                 as recebidas,
      count(*) filter (where reagida)                          as transcritas,
      count(*) filter (where not reagida and not ignorada)     as pendentes
    from public.imagens_recebidas
    where (p_dt1 is null or (enviado_em at time zone 'America/Sao_Paulo')::date >= p_dt1)
      and (p_dt2 is null or (enviado_em at time zone 'America/Sao_Paulo')::date <= p_dt2)
    group by grupo_id
  ) g;
$$;
