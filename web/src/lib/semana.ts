// Semana segunda→domingo no fuso do Brasil (UTC-3, sem horário de verão).
// Trabalhamos com Datas cujos campos UTC representam a "hora de parede" do Brasil.
const TZ_BR_MS = 3 * 60 * 60 * 1000;

export const agoraBR = () => new Date(Date.now() - TZ_BR_MS);
export const fmtD = (d: Date) => d.toISOString().split('T')[0];

/** Segunda-feira (00:00 BR) da semana que contém `base` (base em "BR sobre UTC"). */
export function segundaBR(base: Date): Date {
  const d = new Date(base);
  const dow = d.getUTCDay(); // 0=dom ... 6=sab
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Limites (datas YYYY-MM-DD) da semana que começa em `mon`. */
export function janelaSemana(mon: Date): { d1: string; d2: string } {
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  return { d1: fmtD(mon), d2: fmtD(sun) };
}

/** Segundas (atual e passada) a partir de "agora" no Brasil. */
export function semanasBR(): { atual: Date; passada: Date } {
  const atual = segundaBR(agoraBR());
  const passada = new Date(atual); passada.setUTCDate(atual.getUTCDate() - 7);
  return { atual, passada };
}
