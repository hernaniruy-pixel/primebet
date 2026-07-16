export interface Conta {
  id: number;
  casa: string;
  login: string;
  nome: string;
  cpf: string;
  saldo: number;
  emAberto: number;
  deposito: number;   // total depositado
  retirada: number;   // total sacado
  atualizadoEm: string; // ISO
}

export interface NovaConta {
  casa: string; login: string; nome: string; cpf: string;
  saldo: number; emAberto: number; deposito: number; retirada: number;
}

/**
 * Um lançamento no histórico da conta. `valor` é o quanto MUDOU naquele momento
 * (negativo = correção de um lançamento errado); `de`/`para` são os totais antes e
 * depois, para a conta bater na hora de auditar.
 */
export interface MovimentoConta {
  id: number;
  contaId: number;
  tipo: 'deposito' | 'retirada' | 'saldo' | 'em_aberto';
  valor: number;
  de: number;
  para: number;
  criadoEm: string; // 'HH:mm DD-MM-AAAA'
}

export const MOV_LABEL: Record<MovimentoConta['tipo'], string> = {
  deposito: 'Depósito',
  retirada: 'Retirada',
  saldo: 'Ajuste de saldo',
  em_aberto: 'Ajuste em aberto',
};

export interface PatchConta {
  casa?: string; login?: string; nome?: string; cpf?: string;
  saldo?: number; emAberto?: number; deposito?: number; retirada?: number;
}

// Total da conta = saldo + em aberto (valor atual na casa).
export const contaTotal = (c: Pick<Conta, 'saldo' | 'emAberto'>) => c.saldo + c.emAberto;
// Resultado (ganhou/perdeu) = valor atual + já sacado − depositado.
export const contaResultado = (c: Pick<Conta, 'saldo' | 'emAberto' | 'deposito' | 'retirada'>) =>
  c.saldo + c.emAberto + c.retirada - c.deposito;
