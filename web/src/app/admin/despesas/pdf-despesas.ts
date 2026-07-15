// PDF das despesas do período selecionado (semana atual, semana passada ou intervalo).
// Baixa direto na máquina: DESPESAS_PRIMEBET_-_dd-mm-aaaa_A_dd-mm-aaaa.pdf
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SemanaDespesas } from './types';

const money = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// 'YYYY-MM-DD' → 'DD-MM-AAAA'
const brDate = (d: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (d || '');
};

// A data da despesa chega como 'HH:mm DD-MM-AAAA' (fmtTs). No PDF a linha fica mais
// legível como 'DD/MM/AAAA HH:mm'.
const dataLinha = (s: string): string => {
  const m = /^(\d{2}):(\d{2})\s+(\d{2})-(\d{2})-(\d{4})$/.exec(s || '');
  return m ? `${m[3]}/${m[4]}/${m[5]} ${m[1]}:${m[2]}` : s;
};

export interface PdfDespesasOpts {
  banca?: string;
  sem: SemanaDespesas;   // rótulo + intervalo + linhas + total
}

export function gerarPdfDespesas({ banca = 'PrimeBet', sem }: PdfDespesasOpts) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const temIntervalo = !!(sem.d1 && sem.d2);
  const periodo = temIntervalo ? `${brDate(sem.d1)} a ${brDate(sem.d2)}` : 'Todo o histórico';

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(banca, M, 46);
  doc.setFontSize(12);
  doc.setTextColor(120, 113, 108);
  doc.text('Despesas', W - M, 46, { align: 'right' });

  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.5);
  doc.line(M, 56, W - M, 56);

  // Nomenclatura do período selecionado + datas apuradas.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`Despesas ${banca}`, M, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`${sem.rotulo} — período apurado: ${periodo}`, M, 96);
  doc.text(`${sem.rows.length} lançamento(s)`, M, 110);

  // ── Tabela: cada despesa discriminada ──
  const body = sem.rows.map((d) => [dataLinha(d.data), d.descricao, `R$ ${money(d.valor)}`]);

  autoTable(doc, {
    startY: 126,
    head: [['Data', 'Descrição', 'Valor']],
    body: body.length ? body : [['', 'Nenhuma despesa no período.', '']],
    foot: [['', 'TOTAL DO PERÍODO', `R$ ${money(sem.total)}`]],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, valign: 'middle', overflow: 'linebreak', textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold', fontSize: 9 },
    footStyles: { fillColor: [241, 245, 249], textColor: [225, 29, 72], fontStyle: 'bold', fontSize: 10 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 90, halign: 'right' },
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

  const sufixo = temIntervalo ? `${brDate(sem.d1)}_A_${brDate(sem.d2)}` : 'HISTORICO_COMPLETO';
  doc.save(`DESPESAS_${safe(banca)}_-_${sufixo}.pdf`);
}
