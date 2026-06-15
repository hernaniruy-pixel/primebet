import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  type Afiliado, type Cliente, type AfiliadoRow, type ClienteRow,
  mapAfiliado, mapCliente,
} from './types';

/**
 * Carrega a base do painel (afiliados + clientes) — listas pequenas usadas
 * em dropdowns/modais. As apostas vêm paginadas pela action listarApostas.
 */
export async function loadBase(): Promise<{ afiliados: Afiliado[]; clientes: Cliente[] }> {
  const db = createAdminClient();

  const [afR, clR] = await Promise.all([
    db.from('afiliados').select('*').order('nome'),
    db.from('clientes').select('*').order('nome').limit(5000),
  ]);
  if (afR.error) throw afR.error;
  if (clR.error) throw clR.error;

  const afiliadosRows = (afR.data ?? []) as AfiliadoRow[];
  const afNome: Record<number, string> = {};
  afiliadosRows.forEach((a) => { afNome[a.id] = a.nome; });

  return {
    afiliados: afiliadosRows.map(mapAfiliado),
    clientes: ((clR.data ?? []) as ClienteRow[]).map((c) => mapCliente(c, afNome)),
  };
}
