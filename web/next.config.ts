import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fixa a raiz do projeto nesta pasta (web/). Há um package-lock.json também na
  // raiz do repositório (backend legado), e sem isto o Next/Turbopack infere a
  // raiz errada, quebrando o roteamento no deploy da Vercel.
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
