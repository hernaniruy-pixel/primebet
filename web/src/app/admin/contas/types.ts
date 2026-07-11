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

export interface PatchConta {
  casa?: string; login?: string; nome?: string; cpf?: string;
  saldo?: number; emAberto?: number; deposito?: number; retirada?: number;
}

// Total da conta = saldo + em aberto (valor atual na casa).
export const contaTotal = (c: Pick<Conta, 'saldo' | 'emAberto'>) => c.saldo + c.emAberto;
// Resultado (ganhou/perdeu) = valor atual + já sacado − depositado.
export const contaResultado = (c: Pick<Conta, 'saldo' | 'emAberto' | 'deposito' | 'retirada'>) =>
  c.saldo + c.emAberto + c.retirada - c.deposito;
