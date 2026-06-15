import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <h1 className="text-xl font-bold text-slate-900">Painel PrimeBet — Admin</h1>
      <p className="mt-2 text-sm text-slate-600">
        Logado como <strong>{data.user.email}</strong>.
      </p>
      <p className="mt-4 text-sm text-slate-500">
        🚧 As telas do painel (registros, clientes, afiliados, fechamentos) serão migradas aqui.
      </p>
    </main>
  );
}
