import { redirect } from 'next/navigation';
import { atorAtual } from '@/lib/auth-equipe';
import { carregarSeguranca, listarAcessosSeguranca } from './actions';
import Seguranca from './Seguranca';

export const dynamic = 'force-dynamic';

export default async function SegurancaPage() {
  const ator = await atorAtual();
  if (!ator) redirect('/login');
  // Só master e admin (dono) têm 2FA / auditoria. Gestor/operador voltam ao painel.
  if (ator.tipo !== 'master' && ator.tipo !== 'admin') redirect('/admin');

  const [estado, acessos] = await Promise.all([carregarSeguranca(), listarAcessosSeguranca()]);
  return <Seguranca estadoIni={estado} acessosIni={acessos} />;
}
