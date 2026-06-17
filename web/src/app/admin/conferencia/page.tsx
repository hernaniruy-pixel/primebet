import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listarConfGrupos, listarConfImagens } from '../actions';
import Conferencia from './Conferencia';

export const dynamic = 'force-dynamic';

export default async function ConferenciaPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

  const [grupos, imagens] = await Promise.all([
    listarConfGrupos(),
    listarConfImagens({ pend: true, page: 1 }),
  ]);

  return <Conferencia gruposIni={grupos} imagensIni={imagens} />;
}
