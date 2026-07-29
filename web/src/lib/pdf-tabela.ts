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
import { type jsPDF } from 'jspdf';

export type Halign = 'left' | 'center' | 'right';

export function alinharCabecalho(d: CellHookData, mapa: Record<number, Halign>) {
  if ((d.section === 'head' || d.section === 'foot') && mapa[d.column.index]) {
    d.cell.styles.halign = mapa[d.column.index];
  }
}

export type CorStatus = { bg: [number, number, number]; fg: [number, number, number] };

/**
 * Desenha uma "pílula" arredondada SÓ em volta do texto do status (do tamanho do
 * texto, não a célula inteira). Chame no `didDrawCell` da tabela. IMPORTANTE: no
 * `didParseCell` esvazie o texto da célula de status (`d.cell.text = []`) para o
 * autotable não desenhar o texto padrão por baixo da pílula.
 */
export function desenharPilulaStatus(doc: jsPDF, d: CellHookData, cores: Record<string, CorStatus>) {
  if (d.section !== 'body') return;
  const label = String(d.cell.raw ?? '').trim().toUpperCase();
  const cor = cores[label];
  if (!label || !cor) return;
  const fs = 8, h = 12, padX = 5, topo = 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fs);
  const w = doc.getTextWidth(label) + padX * 2;
  const cx = d.cell.x + d.cell.width / 2;
  const x = cx - w / 2;
  const y = d.cell.y + topo;              // junto ao topo (alinha com a 1ª linha do bilhete)
  doc.setFillColor(cor.bg[0], cor.bg[1], cor.bg[2]);
  doc.roundedRect(x, y, w, h, 3, 3, 'F');
  doc.setTextColor(cor.fg[0], cor.fg[1], cor.fg[2]);
  doc.text(label, cx, y + h / 2 + 0.4, { align: 'center', baseline: 'middle' });
}
