import { redirect } from 'next/navigation';
import { atorAtual } from '@/lib/auth-equipe';
import { precisa2fa, SUJEITO_MASTER } from '@/lib/login-2fa';
import { loadBase } from './data';
import { listarApostas, podeContas } from './actions';
import { weekRange } from './types';
import PainelModerno from './PainelModerno';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const ator = await atorAtual();          // admin (dono), gestor ou operador
  if (!ator) redirect('/login');

  // 2FA obrigatório para o master: sem 2FA ativo, vai cadastrar antes de usar o painel.
  if (ator.tipo === 'master' && !(await precisa2fa(SUJEITO_MASTER))) redirect('/admin/seguranca');

  const semana = weekRange();
  const [base, apostas] = await Promise.all([
    loadBase(),
    // Default ao entrar: fila pendente DA SEMANA ATUAL (visão de trabalho do dia).
    // Tem que casar com o estado inicial do PainelModerno (mesma semana + pend).
    listarApostas({ ord: 'data_desc', page: 1, pend: true, dt1: semana.d1, dt2: semana.d2 }),
  ]);

  // Operador não vê o financeiro nem a gestão de clientes/afiliados. Ele PRECISA do
  // id→nome dos clientes (filtro/rótulo dos bilhetes), então mandamos só isso — sem
  // senha, comissão, desconto, link do grupo, etc. Afiliados vão vazios.
  const operador = ator.tipo === 'operador';
  const clientesIni = operador
    ? base.clientes.map((c) => ({
        id: c.id, nome: c.nome, on: c.on,
        s: '', cal: 0, desc: 0, com: 0, af: 0, sup: null, bl: false,
        link: null, grupoLink: null, grupoId: null,
      }))
    : base.clientes;
  const afiliadosIni = operador ? [] : base.afiliados;

  // Operador só vê o menu Contas se o admin ligou a permissão no perfil dele.
  const contasLiberado = await podeContas();

  // Instância de demonstração: habilita o botão "Restaurar demo" e a faixa DEMO.
  const demo = process.env.NEXT_PUBLIC_DEMO === '1';

  return (
    <PainelModerno
      email={ator.nome}
      papel={ator.tipo}
      demo={demo}
      contasLiberado={contasLiberado}
      clientesIni={clientesIni}
      afiliadosIni={afiliadosIni}
      apostasIni={apostas}
      semana={semana}
    />
  );
}
