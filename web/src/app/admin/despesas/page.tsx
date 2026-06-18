import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listarDespesas } from '../actions';
import Despesas from './Despesas';

export const dynamic = 'force-dynamic';

export default async function DespesasPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const dados = await listarDespesas();
  return <Despesas dadosIni={dados} />;
}
