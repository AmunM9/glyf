'use client';
import { useEffect, useRef } from 'react';

// Haz de partículas láser durante el procesamiento. Se pausa cuando no hay
// proceso y respeta prefers-reduced-motion.
export default function LaserField({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const particles = Array.from({ length: 42 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      v: 1.5 + Math.random() * 3.5,
      len: 14 + Math.random() * 40,
      a: 0.15 + Math.random() * 0.5,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const p of particles) {
        ctx.strokeStyle = `rgba(0, 255, 136, ${p.a})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len, p.y);
        ctx.stroke();
        p.x += p.v;
        if (p.x - p.len > w) {
          p.x = -Math.random() * 60;
          p.y = Math.random() * h;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <canvas ref={ref} className="laser-field" aria-hidden="true" />;
}
