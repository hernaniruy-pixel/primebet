// ════════════════════════════════════════════════════════════════
//  MARCA — identidade white-label (nome, site, cores, textos).
//
//  Fonte ÚNICA da marca no web. Para um cliente novo NÃO se mexe em código:
//  basta definir as variáveis de ambiente NEXT_PUBLIC_MARCA_* no deploy dele
//  (Vercel) e trocar o arquivo public/logo.jpg. Sem env, cai no padrão PrimeBet
//  — então o deploy atual continua idêntico.
//
//  As NEXT_PUBLIC_* são embutidas no bundle em build time (cada cliente tem seu
//  próprio deploy), então valem tanto no servidor quanto no navegador.
// ════════════════════════════════════════════════════════════════

const env = (k: string, padrao: string): string => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : padrao;
};

export const MARCA = {
  // Identidade
  nome: env('NEXT_PUBLIC_MARCA_NOME', 'PrimeBet'),
  // Domínio próprio da banca (aparece no login e é o link do site do cliente).
  site: env('NEXT_PUBLIC_MARCA_SITE', 'www.trackertipster.site'),
  siteUrl: env('NEXT_PUBLIC_MARCA_SITE_URL', 'https://trackertipster.site/'),
  // Assinatura no rodapé dos PDFs. Padrão = marca do provedor (Tracker Tipster).
  // Um cliente pode trocar por algo próprio via NEXT_PUBLIC_MARCA_RODAPE.
  rodapePdf: env('NEXT_PUBLIC_MARCA_RODAPE', 'desenvolvido por www.trackertipster.site'),
  // Assinatura das mensagens de WhatsApp (ex.: legenda do fechamento).
  equipe: env('NEXT_PUBLIC_MARCA_EQUIPE', 'Equipe PrimeBet'),
  // Página do bot (QR / health) do cliente — link "reconectar" no topo do painel.
  botUrl: env('NEXT_PUBLIC_BOT_URL', 'https://primebet-production.up.railway.app/?t=primebet2026'),

  // Cores (hex). Usadas direto em PDF (jsPDF precisa de hex/RGB) e injetadas como
  // variáveis CSS em layout.tsx (--marca / --marca-esc / --marca-claro).
  cor: env('NEXT_PUBLIC_MARCA_COR', '#DAA520'),        // dourado principal
  corEsc: env('NEXT_PUBLIC_MARCA_COR_ESC', '#B8860B'), // dourado escuro (botões, bordas)
  corClaro: env('NEXT_PUBLIC_MARCA_COR_CLARO', '#F0D060'), // dourado claro (realces)
};

/** '#RRGGBB' → [r,g,b] para o jsPDF (setDrawColor/setTextColor). */
export function corRGB(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [218, 165, 32];
}
