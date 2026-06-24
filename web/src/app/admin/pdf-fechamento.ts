// Gera o PDF de fechamento individual de um cliente (resumo + lista de bilhetes).
// Baixa direto na máquina, no estilo do JM: FECHAMENTO_-_NOME_-_dd-mm-aaaa_A_dd-mm-aaaa.pdf
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FechCliRow, Reg } from './types';

const money = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// 'YYYY-MM-DD' → 'DD-MM-AAAA' (para nome do arquivo / cabeçalho)
function brDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (d || '');
}

// Cor dos números no padrão do painel: positivo verde, negativo vermelho, zero preto.
const COR_POS: [number, number, number] = [5, 150, 105];
const COR_NEG: [number, number, number] = [225, 29, 72];
const COR_ZERO: [number, number, number] = [15, 23, 42];
const corNum = (n: number): [number, number, number] => (n > 0 ? COR_POS : n < 0 ? COR_NEG : COR_ZERO);

export interface PdfFechamentoOpts {
  banca: string;
  resumo: FechCliRow;
  bilhetes: Reg[];
  dt1: string; // YYYY-MM-DD
  dt2: string; // YYYY-MM-DD
}

export function gerarPdfFechamento({ banca, resumo, bilhetes, dt1, dt2 }: PdfFechamentoOpts) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const periodo = `${brDate(dt1)} a ${brDate(dt2)}`;

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(banca, M, 46);
  doc.setFontSize(12);
  doc.setTextColor(120, 113, 108);
  doc.text('Fechamento', W - M, 46, { align: 'right' });

  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.5);
  doc.line(M, 56, W - M, 56);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(resumo.nome, M, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Período: ${periodo}`, M, 96);

  // ── Resumo (grade de cartões) ──
  const cards: [string, number][] = [
    ['Calção', resumo.cal], ['Saldo calção', resumo.saldoCal],
    ['Total apostado', resumo.val], ['Em aberto', resumo.ab],
    ['Saldo bruto', resumo.sb], ['Comissão', resumo.cm],
    ['Com. afiliado', resumo.caf], ['Saldo líquido', resumo.sl],
  ];
  const cols = 4;
  const gap = 8;
  const cw = (W - 2 * M - (cols - 1) * gap) / cols;
  const ch = 38;
  let y0 = 112;
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
    const [r, g, b] = corNum(val);
    doc.setTextColor(r, g, b);
    doc.text(`R$ ${money(val)}`, x + 8, y + 29);
  });
  const tableTop = y0 + 2 * (ch + gap) + 6;

  // ── Tabela de bilhetes ──
  const body = bilhetes.map((b) => [
    b.dt,
    (b.jogo || '').replace(/\s+\n/g, '\n').trim(),
    money(b.odd),
    money(b.val),
    b.st,
    money(b.sl),
  ]);

  autoTable(doc, {
    startY: tableTop,
    head: [['Data', 'Jogo', 'Odd', 'Valor', 'Status', 'Saldo líq.']],
    body: body.length ? body : [['', 'Sem bilhetes no período.', '', '', '', '']],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, valign: 'top', overflow: 'linebreak', textColor: [15, 23, 42] },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 42, halign: 'right' },
      3: { cellWidth: 56, halign: 'right' },
      4: { cellWidth: 64, halign: 'center' },
      5: { cellWidth: 60, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const n = Number(String(data.cell.raw).replace(/\./g, '').replace(',', '.')) || 0;
        data.cell.styles.textColor = corNum(n);
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${banca} — gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, M, ph - 18);
      const pg = doc.getNumberOfPages();
      doc.text(`Pág. ${doc.getCurrentPageInfo().pageNumber}/${pg}`, W - M, ph - 18, { align: 'right' });
    },
  });

  const nome = `FECHAMENTO_-_${safe(resumo.nome)}_-_${brDate(dt1)}_A_${brDate(dt2)}.pdf`;
  doc.save(nome);
}
