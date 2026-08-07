// PDF do FECHAMENTO DE AFILIADOS — o relatório que o admin baixa e envia para os
// supervisores. Baixa direto na máquina: FECHAMENTO_AFILIADOS_<BANCA>_-_dd-mm-aaaa_A_dd-mm-aaaa.pdf
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FechAfResp } from './types';
import { wa } from '@/lib/pdf-winansi';
import { alinharCabecalho } from '@/lib/pdf-tabela';
import { MARCA, corRGB } from '@/lib/marca';

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

export interface PdfFechamentoAfiliadosOpts {
  banca?: string;
  g: FechAfResp['g'];      // totais do período
  rows: FechAfResp['rows']; // por supervisor
  dt1: string;              // YYYY-MM-DD
  dt2: string;              // YYYY-MM-DD
}

export function gerarPdfFechamentoAfiliados({ banca = MARCA.nome, g, rows, dt1, dt2 }: PdfFechamentoAfiliadosOpts) {
  banca = wa(banca);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const temIntervalo = !!(dt1 && dt2);
  const periodo = temIntervalo ? `${brDate(dt1)} a ${brDate(dt2)}` : 'Todo o período';

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(banca, M, 46);
  doc.setFontSize(12);
  doc.setTextColor(120, 113, 108);
  doc.text('Fechamento de afiliados', W - M, 46, { align: 'right' });

  doc.setDrawColor(...corRGB(MARCA.cor));
  doc.setLineWidth(1.5);
  doc.line(M, 56, W - M, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Período apurado: ${periodo}`, M, 78);

  // ── Total do período ──
  autoTable(doc, {
    startY: 94,
    head: [['Total do período', 'Valor']],
    body: [
      ['Logins (clientes com movimento)', String(g.logins)],
      ['Total apostado', `R$ ${money(g.val)}`],
      ['Em aberto', `R$ ${money(g.ab)}`],
      ['Saldo bruto', `R$ ${money(g.sb)}`],
      ['Comissão da banca', `R$ ${money(g.cm)}`],
      ['Comissão dos afiliados', `R$ ${money(g.caf)}`],
      ['Saldo líquido', `R$ ${money(g.sl)}`],
    ],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 140, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => alinharCabecalho(d, { 1: 'right' }),
  });

  // ── Por supervisor ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const y1 = (doc as any).lastAutoTable.finalY + 18;
  const ordenadas = [...rows].sort((a, b) => b.caf - a.caf);
  autoTable(doc, {
    startY: y1,
    head: [['Supervisor', 'Logins', 'Apostado', 'Em aberto', 'Saldo bruto', 'Comissão', 'C. afil.', 'Saldo líq.']],
    body: ordenadas.map((r) => [
      wa(r.sup), String(r.logins), money(r.val), money(r.ab), money(r.sb), money(r.cm), money(r.caf), money(r.sl),
    ]),
    foot: [['TOTAL', String(g.logins), money(g.val), money(g.ab), money(g.sb), money(g.cm), money(g.caf), money(g.sl)]],
    showFoot: 'lastPage',
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 48, halign: 'center' },
      2: { cellWidth: 66, halign: 'right' },
      3: { cellWidth: 60, halign: 'right' },
      4: { cellWidth: 66, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 58, halign: 'right' },
      6: { cellWidth: 54, halign: 'right' },
      7: { cellWidth: 66, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      alinharCabecalho(data, { 1: 'center', 2: 'right', 3: 'right', 4: 'right', 5: 'right', 6: 'right', 7: 'right' });
      // Saldo bruto (4) e saldo líquido (7) coloridos por sinal, no corpo e no total.
      if (data.column.index === 4 || data.column.index === 7) {
        const val = data.section === 'foot'
          ? (data.column.index === 4 ? g.sb : g.sl)
          : (data.section === 'body' ? (data.column.index === 4 ? ordenadas[data.row.index].sb : ordenadas[data.row.index].sl) : 0);
        if (data.section !== 'head') data.cell.styles.textColor = corNum(val);
      }
    },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${banca} — gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, M, ph - 18);
      doc.text(`Pág. ${doc.getCurrentPageInfo().pageNumber}/${doc.getNumberOfPages()}`, W - M, ph - 18, { align: 'right' });
      doc.setFontSize(7);
      doc.setTextColor(150, 160, 175);
      doc.text(MARCA.rodapePdf, M, ph - 9);
    },
  });

  const sufixo = temIntervalo ? `${brDate(dt1)}_A_${brDate(dt2)}` : 'TODO_O_PERIODO';
  doc.save(`FECHAMENTO_AFILIADOS_${safe(banca)}_-_${sufixo}.pdf`);
}
