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

  // Operador não vê o financeiro nem a gestão de clientes/afiliados. Ele PRECISA do
  // id→nome dos clientes (filtro/rótulo dos bilhetes), então mandamos só isso — sem
  // senha, comissão, desconto, link do grupo, etc. Afiliados vão vazios.
  const operador = ator.tipo === 'operador';
  const clientesIni = operador
    ? base.clientes.map((c) => ({
        id: c.id, nome: c.nome, on: c.on,
        s: '', cal: 0, desc: 0, com: 0, af: 0, sup: null,
        link: null, grupoLink: null, grupoId: null,
      }))
    : base.clientes;
  const afiliadosIni = operador ? [] : base.afiliados;

  return (
    <PainelModerno
      email={ator.nome}
      papel={ator.tipo}
      clientesIni={clientesIni}
      afiliadosIni={afiliadosIni}
      apostasIni={apostas}
      semana={semana}
    />
  );
}
