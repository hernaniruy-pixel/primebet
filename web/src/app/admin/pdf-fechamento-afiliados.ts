// PDF do FECHAMENTO DE UM AFILIADO — o admin baixa o PDF do afiliado X e envia
// pra ELE (igual ao PDF por cliente). Mostra o resumo do afiliado + os clientes dele.
// Baixa: FECHAMENTO_AFILIADO_<NOME>_-_dd-mm-aaaa_A_dd-mm-aaaa.pdf
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FechAfRow, FechCliRow } from './types';
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

export interface PdfFechamentoAfiliadoOpts {
  banca?: string;
  afiliado: FechAfRow;      // totais do afiliado no período
  clientes: FechCliRow[];   // clientes DESTE afiliado (com movimento no período)
  dt1: string;              // YYYY-MM-DD
  dt2: string;              // YYYY-MM-DD
}

export function gerarPdfFechamentoAfiliado({ banca = MARCA.nome, afiliado, clientes, dt1, dt2 }: PdfFechamentoAfiliadoOpts) {
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
  doc.text('Fechamento de afiliado', W - M, 46, { align: 'right' });

  doc.setDrawColor(...corRGB(MARCA.cor));
  doc.setLineWidth(1.5);
  doc.line(M, 56, W - M, 56);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(wa(afiliado.sup), M, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Período: ${periodo}`, M, 96);

  // ── Resumo do afiliado (grade de cartões) ──
  const cards: [string, string][] = [
    ['Logins (clientes)', String(afiliado.logins)],
    ['Total apostado', `R$ ${money(afiliado.val)}`],
    ['Em aberto', `R$ ${money(afiliado.ab)}`],
    ['Saldo bruto', `R$ ${money(afiliado.sb)}`],
    ['Comissão da banca', `R$ ${money(afiliado.cm)}`],
    ['Comissão do afiliado', `R$ ${money(afiliado.caf)}`],
    ['Saldo líquido', `R$ ${money(afiliado.sl)}`],
  ];
  const cols = 4;
  const gap = 8;
  const cw = (W - 2 * M - (cols - 1) * gap) / cols;
  const ch = 38;
  const y0 = 112;
  cards.forEach(([label, val], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (cw + gap);
    const y = y0 + row * (ch + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cw, ch, 4, 4, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(label.toUpperCase(), x + 8, y + 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(val, x + 8, y + 29);
  });
  const tableTop = y0 + 2 * (ch + gap) + 6;

  // ── Clientes deste afiliado ──
  const ordenados = [...clientes].sort((a, b) => b.caf - a.caf);
  autoTable(doc, {
    startY: tableTop,
    head: [['Cliente', 'Apostado', 'Em aberto', 'Saldo bruto', 'Com. afil.', 'Saldo líq.']],
    body: ordenados.length
      ? ordenados.map((c) => [wa(c.nome), money(c.val), money(c.ab), money(c.sb), money(c.caf), money(c.sl)])
      : [['Sem clientes com movimento no período.', '', '', '', '', '']],
    foot: [['TOTAL', money(afiliado.val), money(afiliado.ab), money(afiliado.sb), money(afiliado.caf), money(afiliado.sl)]],
    showFoot: 'lastPage',
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 74, halign: 'right' },
      2: { cellWidth: 66, halign: 'right' },
      3: { cellWidth: 74, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 70, halign: 'right' },
      5: { cellWidth: 74, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      alinharCabecalho(data, { 1: 'right', 2: 'right', 3: 'right', 4: 'right', 5: 'right' });
      // Saldo bruto (3) e saldo líquido (5) coloridos por sinal, no corpo e no total.
      if ((data.column.index === 3 || data.column.index === 5) && data.section !== 'head') {
        const val = data.section === 'foot'
          ? (data.column.index === 3 ? afiliado.sb : afiliado.sl)
          : (ordenados[data.row.index] ? (data.column.index === 3 ? ordenados[data.row.index].sb : ordenados[data.row.index].sl) : 0);
        data.cell.styles.textColor = corNum(val);
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
  doc.save(`FECHAMENTO_AFILIADO_${safe(afiliado.sup)}_-_${sufixo}.pdf`);
}
