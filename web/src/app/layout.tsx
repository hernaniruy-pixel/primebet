import type { Metadata } from "next";
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

export const metadata: Metadata = {
  metadataBase: new URL(MARCA.siteUrl),
  title: MARCA.nome,
  description: "Sistema de gestão.",
  robots: { index: false, follow: false },
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
