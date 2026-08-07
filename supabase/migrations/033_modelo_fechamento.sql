-- ════════════════════════════════════════════════════════════════
--  Migração 033: MODELO DE FECHAMENTO por CASA (banca)
--  Como a casa monetiza os apostadores dela — escolhido por banca.
--  ADITIVO: o padrão é o comportamento atual → PrimeBet e clientes
--  atuais ficam IDÊNTICOS (só o 5% da baixa liquidez, antes cravado,
--  vira config com default 5%).
--
--  'comissao_ganho' (PADRÃO, PrimeBet): por BILHETE, casa cobra
--     comissao_pct do LUCRO nos ganhos. Perde quem perde. + BL se marcada.
--  'cashback_perda' (LuxPort): casa BANCA o jogo. Ganho é pago CHEIO,
--     sem comissão e SEM baixa liquidez. No fim da SEMANA, se o apostador
--     fechou no vermelho, a casa devolve comissao_pct% da PERDA líquida.
-- ════════════════════════════════════════════════════════════════

-- 1) Config por banca -------------------------------------------------
alter table public.bancas
  add column if not exists modo_fechamento     text          not null default 'comissao_ganho',
  add column if not exists baixa_liquidez_pct  numeric(5,2)  not null default 5;

alter table public.bancas drop constraint if exists bancas_modo_fechamento_chk;
alter table public.bancas add constraint bancas_modo_fechamento_chk
  check (modo_fechamento in ('comissao_ganho','cashback_perda'));

-- 2) calc_aposta (por bilhete) — ramifica pelo modo da banca -----------
create or replace function public.calc_aposta()
returns trigger
language plpgsql
as $$
declare
  c_com    numeric(5,2) := 0;
  c_af     numeric(5,2) := 0;
  c_desc   numeric(6,2) := 0;
  odd_ef   numeric(12,2);
  sb       numeric(12,2);
  cm_ganho numeric(12,2);
  caf      numeric(12,2);
  taxa_bl  numeric(12,2);
  v_modo   text         := 'comissao_ganho';
  v_blpct  numeric(5,2) := 5;
begin
  select comissao_pct, afiliado_comissao_pct, desconto
    into c_com, c_af, c_desc
    from public.clientes where id = new.cliente_id;

  select modo_fechamento, baixa_liquidez_pct
    into v_modo, v_blpct
    from public.bancas where id = new.banca_id;
  v_modo  := coalesce(v_modo, 'comissao_ganho');
  v_blpct := coalesce(v_blpct, 5);

  -- odd efetiva = odd - desconto (só afeta ganhos)
  odd_ef := greatest(new.odd - coalesce(c_desc, 0), 0);
  sb := case new.status
          when 'GREEN'      then new.valor * (odd_ef - 1)
          when 'MEIO GREEN' then new.valor * (odd_ef - 1) / 2
          when 'RED'        then -new.valor
          when 'MEIO RED'   then -new.valor / 2
          else 0
        end;

  if v_modo = 'cashback_perda' then
    -- Casa banca o jogo: ganho CHEIO, sem comissão e SEM baixa liquidez.
    -- A devolução da perda é SEMANAL (fechamento_clientes), não por bilhete.
    new.saldo_bruto       := round(sb, 2);
    new.comissao          := 0;
    new.comissao_afiliado := 0;
    new.saldo_liquido     := round(sb, 2);
  else
    -- comissao_ganho (PrimeBet, PADRÃO — idêntico ao 009; só a BL virou config)
    cm_ganho := case when sb > 0 then sb * (coalesce(c_com,0) / 100) else 0 end;
    caf      := cm_ganho * (coalesce(c_af,0) / 100);
    taxa_bl  := case when new.baixa_liquidez then new.valor * (v_blpct / 100) else 0 end;

    new.saldo_bruto       := round(sb, 2);
    new.comissao          := round(cm_ganho + taxa_bl, 2);
    new.comissao_afiliado := round(caf, 2);
    new.saldo_liquido     := round(sb - cm_ganho - taxa_bl - caf, 2);
  end if;

  new.em_aberto_odd   := (new.odd = 0);
  new.em_aberto_valor := (new.valor = 0);
  new.atualizado_em   := now();
  return new;
end;
$$;

-- 3) fechamento_clientes (soma semanal) — ramifica pelo modo da banca ---
--    Modelo B: cashback = % da PERDA líquida da semana (só se o cliente
--    fechou negativo). O campo "cm" passa a significar "cashback devolvido"
--    (crédito ao cliente) e entra SOMANDO no saldo líquido.
create or replace function public.fechamento_clientes(p_dt1 date default null, p_dt2 date default null)
returns json language sql stable as $$
  with f as (
    select a.* from public.apostas a
    where (p_dt1 is null or (a.data at time zone 'America/Sao_Paulo')::date >= p_dt1)
      and (p_dt2 is null or (a.data at time zone 'America/Sao_Paulo')::date <= p_dt2)
  ),
  per as (
    select c.id, c.nome, c.calcao as cal, b.modo_fechamento as modo, c.comissao_pct as pct,
      coalesce(sum(f.valor),0) val,
      coalesce(sum(f.valor) filter (where f.status='EM ABERTO'),0) ab,
      coalesce(sum(f.saldo_bruto),0) sb,
      coalesce(sum(f.comissao),0) cm_a,
      coalesce(sum(f.comissao_afiliado),0) caf,
      coalesce(sum(f.saldo_liquido),0) sl_base
    from public.clientes c
    join public.bancas b on b.id = c.banca_id
    join f on f.cliente_id = c.id
    group by c.id, c.nome, c.calcao, b.modo_fechamento, c.comissao_pct
    having coalesce(sum(f.valor),0) > 0
  ),
  fin as (
    select id, nome, cal, val, ab, sb, caf,
      -- cashback só no modo B e só quando a semana fechou no vermelho
      (case when modo='cashback_perda' and sb < 0 then round(pct/100 * (-sb), 2) else 0 end) as cashback,
      cm_a, sl_base, modo
    from per
  ),
  outp as (
    select id, nome, cal, val, ab, sb, caf, modo,
      (case when modo='cashback_perda' then cashback else cm_a end)          as cm,
      (case when modo='cashback_perda' then round(sl_base + cashback, 2) else sl_base end) as sl
    from fin
  )
  select json_build_object(
    'rows', coalesce((select json_agg(json_build_object(
      'id',id,'nome',nome,'cal',cal,'val',val,'ab',ab,'sb',sb,'cm',cm,'caf',caf,'sl',sl,
      'saldoCal', cal+sl) order by nome) from outp), '[]'::json),
    'g', json_build_object(
      -- modo da casa: o frontend usa p/ rotular ('Comissão' vs 'Cashback devolvido')
      'modo',     coalesce((select modo from outp limit 1), (select modo_fechamento from public.bancas order by id limit 1), 'comissao_ganho'),
      'cal',      coalesce((select sum(cal)      from outp),0),
      'saldoCal', coalesce((select sum(cal+sl)   from outp),0),
      'val',      coalesce((select sum(val)      from outp),0),
      'ab',       coalesce((select sum(ab)       from outp),0),
      'sb',       coalesce((select sum(sb)       from outp),0),
      'cm',       coalesce((select sum(cm)       from outp),0),
      'caf',      coalesce((select sum(caf)      from outp),0),
      'sl',       coalesce((select sum(sl)       from outp),0))
  );
$$;

-- Recalcula as apostas com a regra nova (idempotente; Modelo A = idêntico).
update public.apostas set atualizado_em = now();
