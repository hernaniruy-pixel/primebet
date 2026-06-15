import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadBase } from './data';
import { listarApostas } from './actions';
import { weekRange } from './types';
import PainelAdmin from './PainelAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

  const semana = weekRange();
  const [base, apostas] = await Promise.all([
    loadBase(),
    listarApostas({ dt1: semana.d1, dt2: semana.d2, ord: 'data_desc', page: 1 }),
  ]);

  return (
    <PainelAdmin
      email={data.user.email ?? ''}
      clientesIni={base.clientes}
      afiliadosIni={base.afiliados}
      apostasIni={apostas}
      semana={semana}
    />
  );
}
