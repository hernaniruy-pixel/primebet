import { redirect } from 'next/navigation';
import { atorAtual } from '@/lib/auth-equipe';
import { listarConfGrupos, listarConfImagens } from '../actions';
import Conferencia from './Conferencia';

export const dynamic = 'force-dynamic';

export default async function ConferenciaPage() {
  const ator = await atorAtual();  // admin, gestor ou operador — todos usam a conferência
  if (!ator) redirect('/login');

  const [grupos, imagens] = await Promise.all([
    listarConfGrupos(),
    listarConfImagens({ pend: true, page: 1 }),
  ]);

  return <Conferencia gruposIni={grupos} imagensIni={imagens} />;
}
