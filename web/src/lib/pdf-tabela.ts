// Alinhamento de cabeçalho/rodapé no jsPDF-autotable.
//
// O jspdf-autotable NÃO propaga o `halign` de `columnStyles` para as células de
// CABEÇALHO nem de RODAPÉ — elas ficam sempre à esquerda, enquanto o corpo respeita
// o alinhamento da coluna. Resultado: o título "Valor"/"Saldo" e a linha "TOTAL"
// saíam à esquerda e não batiam com os números (alinhados à direita) logo abaixo.
//
// `alinharCabecalho` reaplica, no head e no foot, o mesmo alinhamento das colunas.
// Chame dentro do `didParseCell` da tabela, passando o mapa coluna->alinhamento.

import { type CellHookData } from 'jspdf-autotable';

export type Halign = 'left' | 'center' | 'right';

export function alinharCabecalho(d: CellHookData, mapa: Record<number, Halign>) {
  if ((d.section === 'head' || d.section === 'foot') && mapa[d.column.index]) {
    d.cell.styles.halign = mapa[d.column.index];
  }
}
