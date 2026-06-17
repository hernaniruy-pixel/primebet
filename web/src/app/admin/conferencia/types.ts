export interface ConfGrupo {
  grupo_id: string;
  grupo_nome: string | null;
  tem_cliente: boolean;
  recebidas: number;
  transcritas: number;
  pendentes: number;
}

export interface ConfImagem {
  id: number;
  grupoId: string;
  grupoNome: string | null;
  clienteId: number | null;
  remetente: string;
  enviadoEm: string;
  thumbUrl: string | null;
  reagida: boolean;
  lancada: boolean;
  ignorada: boolean;
  emoji: string | null;
  apostaId: number | null;
  pedidoStatus: string | null;   // null | 'pendente' | 'feito' | 'erro'
  pedidoErro: string | null;
}

export interface ConfImagensResp { rows: ConfImagem[]; total: number }
export interface ConfFiltro { grupoId?: string; pend?: boolean; dt1?: string | null; dt2?: string | null; page?: number }
