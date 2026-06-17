import { redirect } from 'next/navigation';
import { getClienteSessao } from '@/lib/cliente-session';
import { carregarExtrato } from './actions';
import Extrato from './Extrato';

export const dynamic = 'force-dynamic';

export default async function ClientePage() {
  const ses = await getClienteSessao();
  if (!ses) redirect('/cliente/login');
  const dados = await carregarExtrato();
  return <Extrato dados={dados} />;
}
