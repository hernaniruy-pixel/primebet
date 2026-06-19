-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 009: taxa de BAIXA LIQUIDEZ
--  Quando baixa_liquidez = true, a PrimeBet ganha 5% do VALOR apostado
--  INDEPENDENTE do resultado (em aberto, perdido ou ganho). Se o bilhete
--  for ganho, soma também a comissão normal (comissao_pct). O cliente paga
--  as duas taxas. A taxa de BL entra na "comissao" e reduz o saldo líquido.
-- ════════════════════════════════════════════════════════════════

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
begin
  select comissao_pct, afiliado_comissao_pct, desconto
    into c_com, c_af, c_desc
    from public.clientes where id = new.cliente_id;

  -- odd efetiva = odd - desconto (só afeta ganhos)
  odd_ef := greatest(new.odd - coalesce(c_desc, 0), 0);

  sb := case new.status
          when 'GREEN'      then new.valor * (odd_ef - 1)
          when 'MEIO GREEN' then new.valor * (odd_ef - 1) / 2
          when 'RED'        then -new.valor
          when 'MEIO RED'   then -new.valor / 2
          else 0
        end;

  -- comissão da banca sobre o GANHO (só quando há lucro)
  cm_ganho := case when sb > 0 then sb * (coalesce(c_com,0) / 100) else 0 end;
  -- comissão do afiliado: % sobre a comissão do ganho
  caf := cm_ganho * (coalesce(c_af,0) / 100);
  -- taxa de baixa liquidez: 5% do valor, SEMPRE que ativa (independe do resultado)
  taxa_bl := case when new.baixa_liquidez then new.valor * 0.05 else 0 end;

  new.saldo_bruto       := round(sb, 2);
  new.comissao          := round(cm_ganho + taxa_bl, 2);          -- ganho + baixa liquidez
  new.comissao_afiliado := round(caf, 2);
  new.saldo_liquido     := round(sb - cm_ganho - taxa_bl - caf, 2);

  new.em_aberto_odd   := (new.odd = 0);
  new.em_aberto_valor := (new.valor = 0);
  new.atualizado_em   := now();
  return new;
end;
$$;

-- Recalcula todas as apostas existentes com a nova regra.
update public.apostas set atualizado_em = now();
