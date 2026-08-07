-- ════════════════════════════════════════════════════════════════
--  Migração 034: BAIXA LIQUIDEZ vira propriedade do CLIENTE
--
--  Antes: a BL era marcada por BILHETE (vinha "automática" do sistema).
--  Agora: é uma opção do CLIENTE (área Clientes), PADRÃO DESLIGADA. Todo
--  cliente novo entra sem BL; o admin liga só quando precisar — sem ter
--  que avisar ninguém.
--
--  Comportamento:
--   • clientes.baixa_liquidez (default false) = padrão do cliente.
--   • No INSERT do bilhete, a aposta HERDA o flag do cliente (OR com um
--     eventual override manual do bilhete). No UPDATE o valor é preservado
--     (mantém override por bilhete + os recálculos em massa).
--   • Quando ativa, desconta baixa_liquidez_pct% do VALOR — nos DOIS
--     modelos (A comissão-sobre-ganho e B cashback-sobre-perda). No B a casa
--     banca o jogo, mas se a BL estiver marcada ela conta como receita da
--     casa (reduz o saldo líquido do apostador). Confirmado pelo dono.
--
--  ADITIVO: default false + só INSERT herda → PrimeBet e clientes atuais
--  ficam idênticos até o admin ligar o flag em algum cliente.
-- ════════════════════════════════════════════════════════════════

alter table public.clientes
  add column if not exists baixa_liquidez boolean not null default false;

create or replace function public.calc_aposta()
returns trigger
language plpgsql
as $$
declare
  c_com    numeric(5,2) := 0;
  c_af     numeric(5,2) := 0;
  c_desc   numeric(6,2) := 0;
  c_bl     boolean      := false;
  odd_ef   numeric(12,2);
  sb       numeric(12,2);
  cm_ganho numeric(12,2);
  caf      numeric(12,2);
  taxa_bl  numeric(12,2);
  v_modo   text         := 'comissao_ganho';
  v_blpct  numeric(5,2) := 5;
begin
  select comissao_pct, afiliado_comissao_pct, desconto, baixa_liquidez
    into c_com, c_af, c_desc, c_bl
    from public.clientes where id = new.cliente_id;

  select modo_fechamento, baixa_liquidez_pct
    into v_modo, v_blpct
    from public.bancas where id = new.banca_id;
  v_modo  := coalesce(v_modo, 'comissao_ganho');
  v_blpct := coalesce(v_blpct, 5);

  -- No INSERT o bilhete herda o padrão do cliente (OR com override manual).
  -- No UPDATE preserva o que está na linha (override por bilhete + recálculos).
  if TG_OP = 'INSERT' then
    new.baixa_liquidez := coalesce(c_bl, false) or coalesce(new.baixa_liquidez, false);
  end if;

  -- odd efetiva = odd - desconto (só afeta ganhos)
  odd_ef := greatest(new.odd - coalesce(c_desc, 0), 0);
  sb := case new.status
          when 'GREEN'      then new.valor * (odd_ef - 1)
          when 'MEIO GREEN' then new.valor * (odd_ef - 1) / 2
          when 'RED'        then -new.valor
          when 'MEIO RED'   then -new.valor / 2
          else 0
        end;

  -- taxa de baixa liquidez: % do valor SEMPRE que ativa (independe do resultado
  -- e do modelo). É receita da casa.
  taxa_bl := case when new.baixa_liquidez then new.valor * (v_blpct / 100) else 0 end;

  if v_modo = 'cashback_perda' then
    -- Casa banca o jogo: ganho CHEIO, sem comissão. A BL, se marcada, ainda conta.
    -- A devolução da perda é SEMANAL (fechamento_clientes), não por bilhete.
    new.saldo_bruto       := round(sb, 2);
    new.comissao          := round(taxa_bl, 2);
    new.comissao_afiliado := 0;
    new.saldo_liquido     := round(sb - taxa_bl, 2);
  else
    -- comissao_ganho (PrimeBet, PADRÃO)
    cm_ganho := case when sb > 0 then sb * (coalesce(c_com,0) / 100) else 0 end;
    caf      := cm_ganho * (coalesce(c_af,0) / 100);

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

-- Recalcula as apostas existentes (UPDATE → não muda o flag herdado; só os saldos).
update public.apostas set atualizado_em = now();
