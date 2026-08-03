import { redirect } from 'next/navigation';
import { listarContas, podeContas } from '../actions';
import Contas from './Contas';

export const dynamic = 'force-dynamic';

export default async function ContasPage() {
  // Financeiro (master/admin/gestor) sempre; operador só com a permissão 'contas'.
  if (!(await podeContas())) redirect('/admin');
  const contas = await listarContas();
  return <Contas contasIni={contas} />;
}
