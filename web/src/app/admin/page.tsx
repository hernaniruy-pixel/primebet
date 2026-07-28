import { redirect } from 'next/navigation';
import { atorAtual } from '@/lib/auth-equipe';
import { loadBase } from './data';
import { listarApostas } from './actions';
import { weekRange } from './types';
import PainelModerno from './PainelModerno';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const ator = await atorAtual();          // admin (dono), gestor ou operador
  if (!ator) redirect('/login');

  const semana = weekRange();
  const [base, apostas] = await Promise.all([
    loadBase(),
    listarApostas({ ord: 'data_desc', page: 1, pend: true }),  // fila pendente (default da UI)
  ]);

  return (
    <PainelModerno
      email={ator.nome}
      papel={ator.tipo}
      clientesIni={base.clientes}
      afiliadosIni={base.afiliados}
      apostasIni={apostas}
      semana={semana}
    />
  );
}
