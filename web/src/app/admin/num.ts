// Números no padrão brasileiro para os campos EDITÁVEIS do painel (odd e entradas).
// Os campos eram <input type="number">, que mostra o número cru do banco: 1.8 e 1300.
// Aqui eles viram texto formatado — 1,80 e 1.300 — sem perder a edição.

/** Odd sempre com 2 casas: 1.8 -> "1,80" | 1.83 -> "1,83". 0/vazio -> "" (em aberto). */
export const fmtOdd = (n: number): string =>
  !Number(n) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dinheiro com separador de milhar, sem centavos à toa: 1300 -> "1.300" | 1300.5 -> "1.300,50". */
export const fmtMoney = (n: number): string => {
  const v = Number(n);
  if (!v) return '';
  const casas = Number.isInteger(v) ? 0 : 2; // valor redondo não carrega ",00"
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
};

/**
 * Texto digitado -> número. Aceita as duas convenções, porque o operador digita das duas
 * formas: "1,85" e "1.85" são 1.85; "1.300" é mil e trezentos (3 dígitos depois do ponto
 * = milhar); "1.200,50" é 1200.5. Mesma regra do parseValor do bot.
 */
export function parseNumBR(s: string): number {
  const t = String(s ?? '').trim().replace(/r\$/gi, '').replace(/\s/g, '');
  if (!t) return 0;
  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');
  let n: number;
  if (temVirgula && temPonto) n = Number(t.replace(/\./g, '').replace(',', '.')); // 1.200,50
  else if (temVirgula) n = Number(t.replace(',', '.'));                            // 1,85
  else if (temPonto) {
    const depois = t.split('.').pop() ?? '';
    n = depois.length === 3 ? Number(t.replace(/\./g, '')) : Number(t);            // 1.300 vs 1.85
  } else n = Number(t);
  return isNaN(n) ? 0 : n;
}
