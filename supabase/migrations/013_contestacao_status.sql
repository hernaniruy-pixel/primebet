-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 013: status sugerido na contestação + fila
--  com contestadas no topo do dashboard. Idempotente.
--  Rode no Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════

-- 1) Status que o CLIENTE sugere como correto ao contestar (ex.: 'GREEN').
--    Fica só como sinalização para o admin; não altera o saldo sozinho.
alter table public.apostas add column if not exists contestacao_status text;

-- 2) controle_listar: mesma assinatura de antes, mas na FILA PENDENTE
--    (p_pendentes = true) as apostas CONTESTADAS vêm sempre no topo,
--    depois a ordenação normal (data/valor). Fora da fila (PDF, "Todas"),
--    a ordem continua puramente cronológica.
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
    where (p_dt1 is null or a.data::date >= p_dt1)
      and (p_dt2 is null or a.data::date <= p_dt2)
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
        -- Só na fila pendente: contestadas primeiro (0), demais depois (1).
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
