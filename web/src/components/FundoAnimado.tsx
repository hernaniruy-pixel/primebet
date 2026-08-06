'use client';

import { useEffect, useRef } from 'react';

// ════════════════════════════════════════════════════════════════
//  Fundo animado — partículas subindo (mesma animação do trackertipster.site).
//  Temado pela marca do cliente: lê as cores --marca (principal) e --marca-2
//  (segunda cor do gradiente) do :root. Fica FIXO atrás de todo o conteúdo.
//  Só é montado quando MARCA.bgAnim (env NEXT_PUBLIC_MARCA_BG_ANIM=1) — a
//  PrimeBet e quem não liga a flag não recebe nada.
//  Respeita prefers-reduced-motion (não anima).
// ════════════════════════════════════════════════════════════════

/** '#rrggbb' -> [r,g,b]. Aceita valor de CSS var; cai no verde da Tracker se falhar. */
function hexRGB(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex || '').trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [53, 214, 76];
}

export default function FundoAnimado({ zIndex = 0 }: { zIndex?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // Cores da marca (lidas do :root). Duas cores = o degradê da marca.
    const cs = getComputedStyle(document.documentElement);
    const c1 = hexRGB(cs.getPropertyValue('--marca'));
    const c2r = cs.getPropertyValue('--marca-2') || cs.getPropertyValue('--marca-esc');
    const c2 = hexRGB(c2r);

    let raf = 0, W = 0, H = 0;
    const dots: { x: number; y: number; vy: number; r: number; a: number; g: boolean }[] = [];
    const fit = () => {
      W = c.width = window.innerWidth;
      H = c.height = window.innerHeight;
      dots.length = 0;
      const n = Math.min(110, Math.round(W / 16));
      for (let i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vy: -(0.14 + Math.random() * 0.4),
          r: Math.random() * 1.7 + 0.7,
          a: Math.random() * 0.55 + 0.28,
          g: Math.random() > 0.5,
        });
      }
    };
    fit();
    window.addEventListener('resize', fit);

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const d of dots) {
        d.y += d.vy;
        if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; }
        const col = d.g ? c1 : c2;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${d.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex, pointerEvents: 'none' }}
    />
  );
}
