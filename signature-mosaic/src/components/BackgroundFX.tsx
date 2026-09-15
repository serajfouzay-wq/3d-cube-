"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient backdrop, in three layers:
 *   1. CSS aurora blobs  — big blurred radial gradients on long drift loops.
 *      GPU-composited, so they cost essentially nothing per frame.
 *   2. Canvas ink motes  — drifting particles with parallax that leans toward
 *      the pointer, plus a slow twinkle.
 *   3. Vignette + grain  — pulls focus to the centre and kills gradient banding.
 *
 * Everything pauses when the tab is hidden and collapses to a single static
 * frame under `prefers-reduced-motion`.
 */

type Mote = {
  x: number;
  y: number;
  z: number; // 0.3..1 — depth, drives size, speed and parallax
  vx: number;
  vy: number;
  phase: number;
  hue: number;
};

const MOTE_COUNT = 90;

export default function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let motes: Mote[] = [];
    let raf = 0;
    let dpr = 1;
    // Pointer parallax, eased toward the real cursor so it never snaps.
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      const count = window.innerWidth < 640 ? MOTE_COUNT / 2 : MOTE_COUNT;
      motes = Array.from({ length: count }, () => {
        const z = 0.3 + Math.random() * 0.7;
        return {
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          z,
          vx: (Math.random() - 0.5) * 0.14 * z,
          vy: -(0.05 + Math.random() * 0.18) * z,
          phase: Math.random() * Math.PI * 2,
          hue: Math.random() < 0.35 ? 268 : 189, // mostly cyan, some violet
        };
      });
    };

    const frame = (t: number) => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      for (const m of motes) {
        if (!reduced) {
          m.x += m.vx * dpr;
          m.y += m.vy * dpr;
          // Wrap around the viewport so the field never empties out.
          if (m.y < -20) {
            m.y = H + 20;
            m.x = Math.random() * W;
          }
          if (m.x < -20) m.x = W + 20;
          if (m.x > W + 20) m.x = -20;
        }

        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t / 1400 + m.phase));
        const px = m.x + pointer.x * m.z * 26 * dpr;
        const py = m.y + pointer.y * m.z * 26 * dpr;
        const r = (0.7 + m.z * 1.9) * dpr;

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${m.hue}, 90%, 72%, ${0.1 + twinkle * 0.3 * m.z})`;
        ctx.fill();

        // A soft halo on the nearest motes only — cheap depth cue.
        if (m.z > 0.75) {
          ctx.beginPath();
          ctx.arc(px, py, r * 3.4, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${m.hue}, 90%, 70%, ${0.035 * twinkle})`;
          ctx.fill();
        }
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base wash */}
      <div className="absolute inset-0 bg-[#04050b]" />
      <div className="absolute inset-0 bg-[radial-gradient(125%_95%_at_50%_-12%,#122a55_0%,#0a1230_38%,#04050b_72%)]" />

      {/* Aurora blobs */}
      <div
        className="absolute -left-[16vw] -top-[20vh] h-[78vh] w-[78vh] rounded-full opacity-80 blur-[90px]"
        style={{
          background: "radial-gradient(circle, rgba(34,211,238,0.75), transparent 66%)",
          animation: "blob-a 26s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -right-[12vw] top-[2vh] h-[74vh] w-[74vh] rounded-full opacity-75 blur-[95px]"
        style={{
          background: "radial-gradient(circle, rgba(168,85,247,0.72), transparent 66%)",
          animation: "blob-b 32s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-[-28vh] left-[26vw] h-[70vh] w-[70vh] rounded-full opacity-65 blur-[100px]"
        style={{
          background: "radial-gradient(circle, rgba(56,189,248,0.6), transparent 66%)",
          animation: "blob-c 38s ease-in-out infinite",
        }}
      />

      {/* Drifting motes */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Faint grid, fading out toward the bottom */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.16) 1px, transparent 1px)",
          backgroundSize: "68px 68px",
          maskImage: "radial-gradient(120% 75% at 50% 0%, #000 10%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(120% 75% at 50% 0%, #000 10%, transparent 72%)",
        }}
      />

      {/* Vignette — gentle, so the aurora survives it */}
      <div className="absolute inset-0 bg-[radial-gradient(100%_80%_at_50%_38%,transparent_35%,rgba(4,5,11,0.62))]" />
    </div>
  );
}
