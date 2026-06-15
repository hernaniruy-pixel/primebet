import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadPanel } from './data';
import PainelAdmin from './PainelAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

  const dados = await loadPanel();

  return <PainelAdmin email={data.user.email ?? ''} dados={dados} />;
}
