// Saneamento de texto para PDF (jsPDF com as fontes padrão).
//
// As fontes standard do jsPDF (helvetica/times/courier) só desenham WinAnsi (1
// byte). Basta UM caractere fora dessa tabela — sinal de menos U+2212, setas,
// emoji, símbolos — para o jsPDF trocar a string inteira por UTF-16 (2 bytes); a
// fonte não tem esses glifos e a LINHA toda sai com as letras espaçadas e o char
// virando lixo (foi o que quebrou o "(−)" no fechamento geral).
//
// `wa` normaliza: troca os culpados comuns por equivalentes ASCII e descarta o que
// a fonte não sabe desenhar. Use em TODO texto dinâmico (banca, cliente, jogo…),
// já que o "jogo" vem da transcrição por IA e pode trazer qualquer caractere.

// Extras do CP1252 (0x80–0x9F) que o jsPDF DESENHA — mantê-los é seguro.
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function wa(s: unknown): string {
  let out = '';
  for (const ch of String(s ?? '')) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x2212) { out += '-'; continue; }                 // menos → hífen
    if (cp >= 0x2190 && cp <= 0x21ff) { out += '->'; continue; } // setas
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) { out += ch; continue; }
    if (cp >= 0x20 && cp <= 0x7e) { out += ch; continue; }       // ASCII
    if (cp >= 0xa0 && cp <= 0xff) { out += ch; continue; }       // Latin-1
    if (CP1252_EXTRA.has(cp)) { out += ch; continue; }           // extras do CP1252
    // resto (emoji, box-drawing, símbolos diversos): descarta
  }
  return out;
}
