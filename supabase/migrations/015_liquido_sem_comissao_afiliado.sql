-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 015: o SALDO LÍQUIDO do cliente não desconta
--  a comissão do supervisor.
--
--  REGRA DE NEGÓCIO (confirmada pelo dono):
--    • O CLIENTE paga apenas a comissão fixa à PrimeBet em cada GREEN
--      (mais a taxa de baixa liquidez, quando marcada).
--    • A comissão do SUPERVISOR é paga PELA PRIMEBET — sai do lucro de
--      comissão dela, NÃO do bolso do cliente.
--
--  Antes:  saldo_liquido = saldo_bruto − comissao − comissao_afiliado  ❌
--  Agora:  saldo_liquido = saldo_bruto − comissao                      ✅
--
--  A comissao_afiliado continua sendo calculada e gravada (é o custo da
--  PrimeBet) — ela é descontada no "Total fechamento" do painel, uma vez só.
--
--  Mantém intacto o DESVIO da importação (origem = 'importado').
--  Rode no Supabase SQL Editor. Idempotente.
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
  -- ── DESVIO da importação: mantém os números exatos do JM ──
  if new.origem = 'importado' then
    new.em_aberto_odd   := (new.odd = 0);
    new.em_aberto_valor := (new.valor = 0);
    new.atualizado_em   := now();
    return new;
  end if;

  -- ── Cálculo normal (bilhetes ao vivo) ──
  select comissao_pct, afiliado_comissao_pct, desconto into c_com, c_af, c_desc
  from public.clientes where id = new.cliente_id;

  -- desconto do cliente derruba a odd (só afeta ganhos)
  odd_ef := greatest(new.odd - coalesce(c_desc, 0), 0);

  sb := case new.status
          when 'GREEN'      then new.valor * (odd_ef - 1)
          when 'MEIO GREEN' then new.valor * (odd_ef - 1) / 2
          when 'RED'        then -new.valor
          when 'MEIO RED'   then -new.valor / 2
          else 0
        end;

  -- comissão que o CLIENTE paga: % sobre o ganho (só quando há lucro)
  cm  := case when sb > 0 then sb * (coalesce(c_com,0) / 100) else 0 end;
  -- comissão do SUPERVISOR: % sobre a comissão gerada pelo cliente.
  -- Custo da PrimeBet — NÃO entra no líquido do cliente.
  caf := cm * (coalesce(c_af,0) / 100);
  -- taxa de baixa liquidez: 5% do valor, sempre que marcada. O cliente paga.
  if new.baixa_liquidez then cm := cm + new.valor * 0.05; end if;

  new.saldo_bruto       := round(sb, 2);
  new.comissao          := round(cm, 2);
  new.comissao_afiliado := round(caf, 2);
  new.saldo_liquido     := round(sb - cm, 2);   -- ✅ sem − caf

  new.em_aberto_odd   := (new.odd = 0);
  new.em_aberto_valor := (new.valor = 0);
  new.atualizado_em   := now();
  return new;
end;
$$;

-- Recalcula as apostas ao vivo existentes com a regra corrigida
-- (importadas ficam intactas pelo desvio acima).
update public.apostas set atualizado_em = now() where origem <> 'importado';
