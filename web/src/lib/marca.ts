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

// IMPORTANTE: no cliente, o Next só embute (inline) uma NEXT_PUBLIC_* quando o
// acesso é LITERAL — process.env.NEXT_PUBLIC_X. Acesso por chave dinâmica
// (process.env[k]) NÃO é inlinado e volta ao padrão no navegador (o server ainda
// lê certo em runtime, então dava divergência: título certo, logo/nome no padrão).
// Por isso cada variável é referenciada estaticamente abaixo.
const pick = (v: string | undefined, padrao: string): string =>
  v && v.trim() ? v.trim() : padrao;

export const MARCA = {
  // Identidade
  nome: pick(process.env.NEXT_PUBLIC_MARCA_NOME, 'PrimeBet'),
  // Domínio próprio da banca (aparece no login e é o link do site do cliente).
  site: pick(process.env.NEXT_PUBLIC_MARCA_SITE, 'www.trackertipster.site'),
  siteUrl: pick(process.env.NEXT_PUBLIC_MARCA_SITE_URL, 'https://trackertipster.site/'),
  // Assinatura no rodapé dos PDFs. Padrão = marca do provedor (Tracker Tipster).
  // Um cliente pode trocar por algo próprio via NEXT_PUBLIC_MARCA_RODAPE.
  rodapePdf: pick(process.env.NEXT_PUBLIC_MARCA_RODAPE, 'desenvolvido por www.trackertipster.site'),
  // Assinatura das mensagens de WhatsApp (ex.: legenda do fechamento).
  equipe: pick(process.env.NEXT_PUBLIC_MARCA_EQUIPE, 'Equipe PrimeBet'),
  // Página do bot (QR / health) do cliente — link "reconectar" no topo do painel.
  botUrl: pick(process.env.NEXT_PUBLIC_BOT_URL, 'https://primebet-production.up.railway.app/?t=primebet2026'),

  // Logo do cliente. Arquivo em /public. Padrão = escudo PrimeBet (logo.jpg).
  // Um cliente troca via NEXT_PUBLIC_MARCA_LOGO (ex.: '/logo-tracker.jpeg').
  logo: pick(process.env.NEXT_PUBLIC_MARCA_LOGO, '/logo.jpg'),
  // Cor de FUNDO do app (login + trás do painel). Padrão = verde-escuro PrimeBet.
  fundo: pick(process.env.NEXT_PUBLIC_MARCA_FUNDO, '#08120a'),
  // Segunda cor do gradiente de destaque (ex.: verde→ciano da Tracker). Sem env,
  // cai na cor escura — assim a PrimeBet segue com o degradê dourado de sempre.
  cor2: pick(process.env.NEXT_PUBLIC_MARCA_COR2, pick(process.env.NEXT_PUBLIC_MARCA_COR_ESC, '#B8860B')),
  // Fundo animado (partículas subindo, temadas pela cor da marca). OFF por padrão
  // (PrimeBet não muda); a demo/clientes que quiserem ligam com NEXT_PUBLIC_MARCA_BG_ANIM=1.
  bgAnim: process.env.NEXT_PUBLIC_MARCA_BG_ANIM === '1',

  // Cores (hex). Usadas direto em PDF (jsPDF precisa de hex/RGB) e injetadas como
  // variáveis CSS em layout.tsx (--marca / --marca-esc / --marca-claro).
  cor: pick(process.env.NEXT_PUBLIC_MARCA_COR, '#DAA520'),        // dourado principal
  corEsc: pick(process.env.NEXT_PUBLIC_MARCA_COR_ESC, '#B8860B'), // dourado escuro (botões, bordas)
  corClaro: pick(process.env.NEXT_PUBLIC_MARCA_COR_CLARO, '#F0D060'), // dourado claro (realces)
  // Base da rampa do painel (bg-marca-*/text-marca-*). Lê a MESMA env da cor
  // principal, mas cai em amber-500 quando não definida — assim a PrimeBet fica
  // idêntica e um cliente que define NEXT_PUBLIC_MARCA_COR pinta o painel todo.
  corRamp: pick(process.env.NEXT_PUBLIC_MARCA_COR, '#f59e0b'),
};

/** '#RRGGBB' → [r,g,b] para o jsPDF (setDrawColor/setTextColor). */
export function corRGB(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [218, 165, 32];
}
