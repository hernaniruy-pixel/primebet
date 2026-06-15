-- ════════════════════════════════════════════════════════════════
--  PrimeBet — Seed (dados iniciais que antes ficavam mockados no painel)
--  Rode DEPOIS do schema.sql: Supabase → SQL Editor → cole tudo → Run.
--  Os saldos (bruto/comissão/líquido) NÃO são inseridos: o trigger
--  calc_aposta os calcula automaticamente.
-- ════════════════════════════════════════════════════════════════

-- ───────────────── AFILIADOS ─────────────────
insert into public.afiliados (id, nome, comissao_pct) values
  (3, 'Samuel Henriquer', 15),
  (4, 'Samuel Henrique', 15),
  (5, 'Heitor Escossia', 0),
  (6, 'Yuri Honorio', 0),
  (7, 'Lucas Tiger', 10),
  (8, 'Renan Cardoso', 10)
on conflict (id) do nothing;

-- ───────────────── CLIENTES ─────────────────
-- OBS: senha_hash recebe a senha em texto (mesmo comportamento do painel atual).
-- Trocar por hash de verdade quando o login de jogador for implementado.
insert into public.clientes
  (id, nome, senha_hash, ativo, calcao, desconto, comissao_pct, afiliado_id, afiliado_comissao_pct) values
  (12, 'AHLEFELD',     '102030', true,    0, 0.01, 6, null, 0),
  (28, 'ALE_FALTAS',   null,     true,    0, 0.01, 6, null, 15),
  (27, 'ALE_NBA',      null,     true,    0, 0.01, 6, null, 15),
  (26, 'ALECORNERS',   null,     true,    0, 0.01, 6, null, 15),
  (50, 'BRUNOFIRMINO', '666666', true,    0, 0.01, 6, 4,    15),
  (19, 'BRUNOGIRAO',   null,     false,   0, 0.01, 6, null, 0),
  (9,  'BRUXO',        null,     false,   0, 0.01, 6, null, 0),
  (20, 'CARIOCA',      null,     false,   0, 0.01, 6, null, 0),
  (51, 'CAVALCANTE',   '909090', true, 3000, 0.01, 6, null, 0),
  (22, 'CRISTIAN',     '102030', true, 2045, 0.01, 6, 5,    10),
  (16, 'DAVID',        '050505', true, 1957, 0.01, 6, null, 0),
  (37, 'DAVIDBDS',     null,     true,    0, 0.01, 6, null, 0),
  (39, 'DAVIDLOPES',   '010101', true,    0, 0,    6, 4,    15),
  (31, 'DIEGOMORAIS',  '858585', true,    0, 0.01, 6, 4,    15),
  (41, 'DRMURIELL',    '131313', true, 1500, 0.01, 6, 5,    10)
on conflict (id) do nothing;

-- ───────────────── APOSTAS ─────────────────
-- saldo_*/comissao* ficam por conta do trigger calc_aposta.
insert into public.apostas (id, cliente_id, data, jogo, odd, valor, status, casa, origem) values
  (7184, 22, '2026-05-18 21:54', E'1) Cruzeiro (F) v Corinthians (F) (Odd 2,04)\n• Corinthians (F) – Resultado Final', 1.89, 962, 'EM ABERTO', '',       'manual'),
  (7311, 28, '2026-05-18 21:28', E'1) Arsenal – Burnley (Odd 1,56)\n• Menos de 30.5 – Total de chutes\n• Menos de 6.5 – Total de Gols', 1.56, 886, 'EM ABERTO', 'BETANO', 'manual'),
  (7316, 12, '2026-05-18 11:39', E'1) Cruzeiro (F) v Corinthians (F) (Odd 2,04)\n• Corinthians (F) – Resultado Final', 2.09, 538, 'EM ABERTO', 'BET365', 'manual'),
  (7100, 50, '2026-05-17 14:20', E'1) Bayern v Dortmund\n• Bayern – Resultado Final', 1.72, 1200, 'GREEN', 'BETANO', 'manual'),
  (7090, 22, '2026-05-17 10:05', E'1) PSG v Marseille\n• PSG – Resultado Final', 1.84, 500, 'RED', '', 'manual'),
  (7080, 16, '2026-05-16 20:00', E'1) Liverpool v Arsenal\n• Menos de 2.5 gols', 2.1, 750, 'GREEN', 'BET365', 'manual')
on conflict (id) do nothing;

-- ───────────────── Ajusta as sequences (ids explícitos acima) ─────────────────
select setval(pg_get_serial_sequence('public.afiliados', 'id'), (select max(id) from public.afiliados));
select setval(pg_get_serial_sequence('public.clientes',  'id'), (select max(id) from public.clientes));
select setval(pg_get_serial_sequence('public.apostas',   'id'), (select max(id) from public.apostas));
