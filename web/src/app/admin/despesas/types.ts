export interface Despesa {
  id: number;
  descricao: string;
  valor: number;
  data: string;        // 'YYYY-MM-DD HH:mm'
  grupoNome: string | null;
}

export interface SemanaDespesas {
  rotulo: string;
  d1: string;
  d2: string;
  rows: Despesa[];
  total: number;
}

export interface DespesasResp {
  atual: SemanaDespesas;
  passada: SemanaDespesas;
}
