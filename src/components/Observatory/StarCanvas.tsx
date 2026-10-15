import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  v: number;
  p: number;
}

export const StarCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let stars: Star[] = [];
    let animationFrameId: number;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const reduceMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const count = Math.max(40, Math.round((canvas.width * canvas.height) / 8000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.2 + 0.2,
        v: Math.random() * 0.07 + 0.02,
        p: Math.random() * 6,
      }));
    };

    const handlePointerMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const handlePointerLeave = () => {
      tx = 0;
      ty = 0;
    };

    const render = (ts: number) => {
      if (!reduceMedia.matches) {
        cx += (tx - cx) * 0.05;
        cy += (ty - cy) * 0.05;
        document.documentElement.style.setProperty('--mx', cx.toFixed(3));
        document.documentElement.style.setProperty('--my', cy.toFixed(3));
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const s of stars) {
        if (!reduceMedia.matches) {
          s.y -= s.v;
          if (s.y < 0) s.y = canvas.height;
        }

        const alpha = reduceMedia.matches
          ? 0.45
          : 0.3 + 0.35 * Math.sin(ts / 1800 + s.p);

        ctx.fillStyle = `rgba(226, 222, 239, ${Math.max(0.08, alpha)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduceMedia.matches) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    resize();
    render(0);

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      document.documentElement.style.removeProperty('--mx');
      document.documentElement.style.removeProperty('--my');
    };
  }, []);

  return <canvas id="stars" ref={canvasRef} className="px" aria-hidden="true" />;
};
