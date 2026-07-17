// Relatório do jogador: resumo do período + todos os bilhetes discriminados.
// Devolve o PDF como Blob para o chamador decidir entre baixar (computador) ou
// compartilhar no WhatsApp (celular).
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Reg } from '../admin/types';
import { wa } from '@/lib/pdf-winansi';
import { alinharCabecalho } from '@/lib/pdf-tabela';

const money = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// 'HH:mm DD/MM/AA' → 'DD/MM/AA HH:mm' (a data manda na leitura de um extrato).
const dataLinha = (s: string): string => {
  const m = /^(\d{2}):(\d{2})\s+(\d{2})[/-](\d{2})[/-](\d{2}|\d{4})$/.exec(s || '');
  return m ? `${m[3]}/${m[4]}/${m[5]} ${m[1]}:${m[2]}` : s;
};

// O jogo vem com quebras de linha; no PDF vira uma linha só, sem poluir a célula.
// wa() no fim: o texto do jogo é transcrito por IA e pode trazer setas/emoji que
// quebrariam a linha inteira do PDF.
const jogoLinha = (s: string): string => wa(String(s || '').split('\n').map((l) => l.trim()).filter(Boolean).join(' · '));

export interface StatusResumo { st: string; qtd: number; val: number; sl: number }

export interface PdfExtratoOpts {
  banca?: string;
  cliente: string;
  periodo: string;          // 'Semana atual — 13/07/26 a 19/07/26' ou 'Quarta, 15/07/26'
  calcao: number;
  rows: Reg[];
  entradas: number;
  saldo: number;
  abertas: number;
  aproveitamento: number | null;  // % de greens sobre as resolvidas; null = nada resolvido
  porStatus: StatusResumo[];
  oddDoCliente: (odd: number) => number;
}

export function gerarPdfExtrato(o: PdfExtratoOpts): { blob: Blob; nome: string } {
  const banca = wa(o.banca ?? 'PrimeBet');
  const cliente = wa(o.cliente);
  const periodo = wa(o.periodo);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(banca, M, 46);
  doc.setFontSize(12);
  doc.setTextColor(120, 113, 108);
  doc.text('Extrato do jogador', W - M, 46, { align: 'right' });

  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.5);
  doc.line(M, 56, W - M, 56);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(cliente, M, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(periodo, M, 96);
  doc.text(`${o.rows.length} aposta(s) · calção R$ ${money(o.calcao)}`, M, 110);

  // ── Resumo do período ──
  autoTable(doc, {
    startY: 126,
    head: [['Resumo do período', '']],
    body: [
      ['Total apostado', `R$ ${money(o.entradas)}`],
      ['Em aberto', `${o.abertas} aposta(s)`],
      ['Aproveitamento', o.aproveitamento === null ? '—' : `${o.aproveitamento.toFixed(1)}% de greens`],
      ['SALDO DO PERÍODO', `R$ ${money(o.saldo)}`],
    ],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 5, textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold', fontSize: 10 },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 140, halign: 'right', fontStyle: 'bold' } },
    // O saldo é o número que o jogador procura: verde se ganhou, vermelho se perdeu.
    didParseCell: (d) => {
      alinharCabecalho(d, { 1: 'right' });
      if (d.section === 'body' && d.row.index === 3) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [241, 245, 249];
        if (d.column.index === 1) d.cell.styles.textColor = o.saldo > 0 ? [22, 163, 74] : o.saldo < 0 ? [225, 29, 72] : [15, 23, 42];
      }
    },
  });

  // ── Por status: quantidade e dinheiro ──
  type Doc = jsPDF & { lastAutoTable: { finalY: number } };
  autoTable(doc, {
    startY: (doc as Doc).lastAutoTable.finalY + 16,
    head: [['Status', 'Apostas', 'Apostado', 'Saldo']],
    body: o.porStatus.length
      ? o.porStatus.map((s) => [s.st, String(s.qtd), `R$ ${money(s.val)}`, `R$ ${money(s.sl)}`])
      : [['', 'Nenhuma aposta no período.', '', '']],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold' },
      1: { cellWidth: 60, halign: 'center' },
      2: { cellWidth: 90, halign: 'right' },
      3: { cellWidth: 90, halign: 'right' },
    },
    didParseCell: (d) => alinharCabecalho(d, { 1: 'center', 2: 'right', 3: 'right' }),
  });

  // ── Bilhete a bilhete ──
  autoTable(doc, {
    startY: (doc as Doc).lastAutoTable.finalY + 16,
    head: [['Data', 'Jogo', 'Odd', 'Valor', 'Status', 'Saldo']],
    body: o.rows.length
      ? o.rows.map((r) => [
        dataLinha(r.dt),
        jogoLinha(r.jogo) + (r.ct ? '  [CONTESTADA]' : ''),
        r.odd ? money(o.oddDoCliente(r.odd)) : '—',
        r.val ? money(r.val) : 'aberto',
        r.st,
        money(r.sl),
      ])
      : [['', 'Nenhuma aposta no período.', '', '', '', '']],
    // TOTAL sem o prefixo "R$ " e na MESMA fonte do corpo (8): com o prefixo e a
    // fonte maior, o valor não cabia na coluna Valor (54pt) e quebrava em duas
    // linhas, desalinhando a linha inteira. Os números seguem o corpo.
    foot: [['', 'TOTAL', '', money(o.entradas), '', money(o.saldo)]],
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, valign: 'middle', overflow: 'linebreak', textColor: [15, 23, 42] },
    headStyles: { fillColor: [19, 32, 10], textColor: [218, 165, 32], fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 74 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 42, halign: 'right' },
      3: { cellWidth: 54, halign: 'right' },
      4: { cellWidth: 62, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 58, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (d) => {
      alinharCabecalho(d, { 2: 'right', 3: 'right', 4: 'center', 5: 'right' });
      if (d.section !== 'body') return;
      const r = o.rows[d.row.index];
      if (!r) return;
      if (d.column.index === 5) d.cell.styles.textColor = r.sl > 0 ? [22, 163, 74] : r.sl < 0 ? [225, 29, 72] : [15, 23, 42];
      if (d.column.index === 4) {
        const c: Record<string, [number, number, number]> = {
          'GREEN': [22, 163, 74], 'MEIO GREEN': [34, 139, 84], 'RED': [220, 38, 38],
          'MEIO RED': [200, 60, 60], 'REEMBOLSO': [161, 98, 7], 'EM ABERTO': [109, 40, 217],
        };
        d.cell.styles.textColor = c[r.st] ?? [15, 23, 42];
      }
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

  const nome = `EXTRATO_${safe(o.cliente)}_-_${safe(o.periodo)}.pdf`;
  return { blob: doc.output('blob'), nome };
}

/**
 * Entrega o PDF do jeito que der no aparelho de quem clicou: no celular abre o
 * menu de compartilhar (WhatsApp entra ali); no computador, baixa. Não dá para
 * mandar direto ao WhatsApp por link — anexo só sai pelo menu do sistema.
 */
export async function entregarPdf(blob: Blob, nome: string, texto: string): Promise<'compartilhado' | 'baixado'> {
  const file = new File([blob], nome, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // Só compartilhar no CELULAR: no Windows/Chrome do desktop o canShare({files})
  // também dá true e abria o menu do sistema em vez de baixar — no computador o
  // esperado é baixar o arquivo. Ponteiro grosso (touch) = celular/tablet.
  const ehCelular = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  if (ehCelular && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nome, text: texto });
      return 'compartilhado';
    } catch {
      // Cancelou o menu ou o app recusou: cai para o download, nunca fica em silêncio.
    }
  }
  // Download: alguns navegadores (Firefox) só disparam com o <a> preso ao DOM.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'baixado';
}
