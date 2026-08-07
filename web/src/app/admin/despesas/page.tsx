import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listarDespesas, getConfigDespesa } from '../actions';
import Despesas from './Despesas';

export const dynamic = 'force-dynamic';

export default async function DespesasPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const [dados, cfg] = await Promise.all([listarDespesas(), getConfigDespesa()]);
  return <Despesas dadosIni={dados} cfgIni={cfg} />;
}
