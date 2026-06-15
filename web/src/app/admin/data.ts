import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  type PanelData, type AfiliadoRow, type ClienteRow, type ApostaRow,
  mapAfiliado, mapCliente, mapAposta,
} from './types';

/**
 * Carrega todos os dados do painel direto do Supabase (service_role, ignora RLS).
 * Só roda no servidor — chamado pelo Server Component admin/page.tsx.
 */
export async function loadPanel(): Promise<PanelData> {
  const db = createAdminClient();

  const [afR, clR, apR] = await Promise.all([
    db.from('afiliados').select('*').order('nome'),
    db.from('clientes').select('*').order('nome'),
    db.from('apostas').select('*').order('data', { ascending: false }),
  ]);

  if (afR.error) throw afR.error;
  if (clR.error) throw clR.error;
  if (apR.error) throw apR.error;

  const afiliadosRows = (afR.data ?? []) as AfiliadoRow[];
  const afNome: Record<number, string> = {};
  afiliadosRows.forEach((a) => { afNome[a.id] = a.nome; });

  return {
    afiliados: afiliadosRows.map(mapAfiliado),
    clientes: ((clR.data ?? []) as ClienteRow[]).map((c) => mapCliente(c, afNome)),
    regs: ((apR.data ?? []) as ApostaRow[]).map(mapAposta),
  };
}
