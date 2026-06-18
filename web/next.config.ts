import type { NextConfig } from "next";

// Cabeçalhos de segurança: impedem embed/iframe (anti-clonagem/clickjacking),
// sniffing de tipo, vazamento de referer, e forçam HTTPS.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },                       // ninguém embute o site num iframe
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, // idem (navegadores modernos)
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },             // não aparece em buscadores
];

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false, // não publica o código-fonte legível do front
  poweredByHeader: false,             // remove o header "X-Powered-By: Next.js"
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
