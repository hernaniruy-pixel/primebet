// PDF do FECHAMENTO GERAL — o relatório que os sócios imprimem para ver o lucro do período.
// Baixa direto na máquina: FECHAMENTO_GERAL_PRIMEBET_-_dd-mm-aaaa_A_dd-mm-aaaa.pdf
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FechCliResp } from './types';

const money = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const brDate = (d: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (d || '');
};

const COR_POS: [number, number, number] = [5, 150, 105];
const COR_NEG: [number, number, number] = [225, 29, 72];
const COR_ZERO: [number, number, number] = [15, 23, 42];
const corNum = (n: number): [number, number, number] => (n > 0 ? COR_POS : n < 0 ? COR_NEG : COR_ZERO);

export interface PdfFechamentoGeralOpts {
  banca?: string;
  g: FechCliResp['g'];  // totais do período (vindos do fechamento_clientes)
  despesas: number;     // total de despesas do MESMO período
  dt1: string;          // YYYY-MM-DD
  dt2: string;          // YYYY-MM-DD
}

/**
 * REGRA DO LUCRO (confirmada pelo dono em 15/07/2026):
 *   Lucro = Comissão ganha − Comissão dos afiliados − Despesas
 *
 * A PrimeBet só lucra em bilhete GREEN: o percentual dela incide sobre cada green,
 * e quando o cliente perde ela não ganha comissão. O resultado da aposta em si não
 * entra aqui — ele é espelhado nas casas e acompanhado na aba Contas.
 */
export const lucroPeriodo = (comissao: number, comissaoAfiliado: number, despesas: number) =>
  comissao - comissaoAfiliado - despesas;

export function gerarPdfFechamentoGeral({ banca = 'PrimeBet', g, despesas, dt1, dt2 }: PdfFechamentoGeralOpts) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const temIntervalo = !!(dt1 && dt2);
  const periodo = temIntervalo ? `${brDate(dt1)} a ${brDate(dt2)}` : 'Todo o período';
  const lucro = lucroPeriodo(g.cm, g.caf, despesas);

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(banca, M, 46);
  doc.setFontSize(12);
  doc.setTextColor(120, 113, 108);
  doc.text('Fechamento geral', W - M, 46, { align: 'right' });

  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.5);
  doc.line(M, 56, W - M, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Período apurado: ${periodo}`, M, 78);

  // ── Movimento do período ──
  autoTable(doc, {
    startY: 94,
    head: [['Movimento do período', 'Valor']],
    body: [
      ['Total apostado', `R$ ${money(g.val)}`],
      ['Em aberto', `R$ ${money(g.ab)}`],
      ['Saldo bruto', `R$ ${money(g.sb)}`],
      ['Saldo líquido', `R$ ${money(g.sl)}`],
    ],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 130, halign: 'right', fontStyle: 'bold' } },
  });

  // ── Apuração do lucro ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const y1 = (doc as any).lastAutoTable.finalY + 18;
  autoTable(doc, {
    startY: y1,
    head: [['Apuração do lucro', 'Valor']],
    body: [
      ['Comissão ganha (receita)', `R$ ${money(g.cm)}`],
      ['(−) Comissão dos afiliados', `R$ ${money(g.caf)}`],
      ['(−) Despesas do período', `R$ ${money(despesas)}`],
    ],
    foot: [['LUCRO DO PERÍODO', `R$ ${money(lucro)}`]],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: corNum(lucro), fontStyle: 'bold', fontSize: 13 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 130, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data) => {
      // Deduções em vermelho, para ficar claro o que soma e o que subtrai.
      if (data.section === 'body' && data.column.index === 1 && data.row.index > 0) data.cell.styles.textColor = COR_NEG;
    },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${banca} — gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, M, ph - 18);
      doc.text(`Pág. ${doc.getCurrentPageInfo().pageNumber}/${doc.getNumberOfPages()}`, W - M, ph - 18, { align: 'right' });
    },
  });

  // Deixa a conta explícita no papel: quem imprime não precisa confiar no número solto.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const y2 = (doc as any).lastAutoTable.finalY + 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Lucro = Comissão ganha − Comissão dos afiliados − Despesas.', M, y2);
  doc.text('A comissão incide sobre cada bilhete GREEN; em bilhete perdido não há comissão.', M, y2 + 12);

  const sufixo = temIntervalo ? `${brDate(dt1)}_A_${brDate(dt2)}` : 'TODO_O_PERIODO';
  doc.save(`FECHAMENTO_GERAL_${safe(banca)}_-_${sufixo}.pdf`);
}
