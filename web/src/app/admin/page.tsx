import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PainelAdmin from './PainelAdmin';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

  return <PainelAdmin email={data.user.email ?? ''} />;
}
