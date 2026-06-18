import type { MetadataRoute } from 'next';

// Bloqueia todos os robôs/buscadores — o sistema não deve ser indexado nem scrapeado.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
