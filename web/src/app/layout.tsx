import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MARCA } from "@/lib/marca";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Cor da UI do navegador no mobile (barra de status). Segue o fundo da marca —
// demo escuro (#05090c), PrimeBet no seu padrão. Navegadores que respeitam
// theme-color escurecem a barra em vez de branco.
export const viewport: Viewport = {
  themeColor: MARCA.fundo,
  // Deixa o conteúdo ir até as bordas (embaixo da barra de status / notch) —
  // com apple-mobile-web-app-capable, o atalho na tela inicial abre em tela cheia.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(MARCA.siteUrl),
  title: MARCA.nome,
  description: "Sistema de gestão.",
  robots: { index: false, follow: false },
  // iOS: "Adicionar à Tela de Início" abre em TELA CHEIA (sem a moldura branca
  // do Safari). status bar translúcida sobre o fundo escuro.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: MARCA.nome },
  // O Next 16 só emite "mobile-web-app-capable"; o iOS antigo/Safari ainda exige o
  // meta com prefixo apple- p/ abrir o atalho em TELA CHEIA. Forçamos os dois.
  other: { "apple-mobile-web-app-capable": "yes", "mobile-web-app-capable": "yes" },
  openGraph: {
    title: MARCA.nome,
    description: "Sistema de gestão.",
    url: MARCA.siteUrl,
    siteName: MARCA.nome,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Cores da marca do cliente (env) sobrescrevem os padrões do globals.css.
      style={{ ["--marca" as string]: MARCA.cor, ["--marca-esc" as string]: MARCA.corEsc, ["--marca-claro" as string]: MARCA.corClaro, ["--marca-base" as string]: MARCA.corRamp, ["--marca-2" as string]: MARCA.cor2, ["--marca-fundo" as string]: MARCA.fundo }}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
