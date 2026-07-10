-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Migração 012: importação do histórico do JM (até 05/07)
--  Objetivo: permitir gravar apostas históricas com os valores JÁ
--  calculados pelo JM (bruto/comissão/líquido) SEM o trigger recalcular,
--  garantindo fechamentos idênticos ao sistema antigo.
--
--  IMPORTANTE: NÃO altera o comportamento dos bilhetes ao vivo
--  (origem 'manual' e 'whatsapp' continuam passando pelo motor de cálculo).
--  O desvio só vale para linhas marcadas como origem = 'importado'.
-- ════════════════════════════════════════════════════════════════

-- 1) Rastreabilidade + idempotência: id original do JM.
alter table public.apostas add column if not exists jm_id bigint;
create unique index if not exists apostas_jm_id_uidx
  on public.apostas(jm_id) where jm_id is not null;

-- 2) Permitir a origem 'importado'.
alter table public.apostas drop constraint if exists apostas_origem_check;
alter table public.apostas
  add constraint apostas_origem_check
  check (origem in ('manual','whatsapp','importado'));

-- 3) Trigger: para linhas importadas, PRESERVA os valores gravados
--    (bruto/comissão/comissão_afiliado/líquido vindos do JM) e só
--    ajusta os flags derivados. Para o resto, cálculo normal (inalterado).
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

  -- ── Cálculo normal (bilhetes ao vivo) — inalterado ──
  select comissao_pct, afiliado_comissao_pct, desconto into c_com, c_af, c_desc
  from public.clientes where id = new.cliente_id;

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
  if new.baixa_liquidez then cm := cm + new.valor * 0.05; end if;

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
