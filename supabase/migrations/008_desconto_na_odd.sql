-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 008: desconto aplicado na ODD
--  Regra: a odd usada no cálculo é (odd - desconto do cliente).
--  Ex.: bilhete odd 2,00, cliente com desconto 0,01 -> vale 1,99.
--  O desconto só afeta GANHOS (GREEN/MEIO GREEN); perdas continuam -valor.
--  A comissão (comissao_pct) já era aplicada e continua igual.
-- ════════════════════════════════════════════════════════════════

create or replace function public.calc_aposta()
returns trigger
language plpgsql
as $$
declare
  c_com  numeric(5,2) := 0;
  c_af   numeric(5,2) := 0;
  c_desc numeric(6,2) := 0;
  odd_ef numeric(12,2);
  sb     numeric(12,2);
  cm     numeric(12,2);
  caf    numeric(12,2);
begin
  select comissao_pct, afiliado_comissao_pct, desconto
    into c_com, c_af, c_desc
    from public.clientes where id = new.cliente_id;

  -- odd efetiva = odd - desconto (nunca negativa)
  odd_ef := greatest(new.odd - coalesce(c_desc, 0), 0);

  sb := case new.status
          when 'GREEN'      then new.valor * (odd_ef - 1)
          when 'MEIO GREEN' then new.valor * (odd_ef - 1) / 2
          when 'RED'        then -new.valor
          when 'MEIO RED'   then -new.valor / 2
          else 0
        end;

  cm  := case when sb > 0 then sb * (coalesce(c_com,0) / 100) else 0 end;
  caf := cm * (coalesce(c_af,0) / 100);

  new.saldo_bruto       := round(sb, 2);
  new.comissao          := round(cm, 2);
  new.comissao_afiliado := round(caf, 2);
  new.saldo_liquido     := round(sb - cm - caf, 2);

  new.em_aberto_odd   := (new.odd = 0);
  new.em_aberto_valor := (new.valor = 0);
  new.atualizado_em   := now();
  return new;
end;
$$;

-- Recalcula TODAS as apostas existentes com a nova regra (dispara o trigger).
update public.apostas set atualizado_em = now();
