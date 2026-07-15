import type { Reg } from '../admin/types';

export interface SemanaExtrato {
  rotulo: string; d1: string; d2: string;
  rows: Reg[];
  entradas: number; saldo: number; abertas: number;
}

export interface ExtratoResp {
  cliente: { id: number; nome: string; cal: number; desc: number };
  atual: SemanaExtrato;
  passada: SemanaExtrato;
}
