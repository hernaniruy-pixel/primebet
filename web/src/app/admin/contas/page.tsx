import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listarContas } from '../actions';
import Contas from './Contas';

export const dynamic = 'force-dynamic';

export default async function ContasPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const contas = await listarContas();
  return <Contas contasIni={contas} />;
}
