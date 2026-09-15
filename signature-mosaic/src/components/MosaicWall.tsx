"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MASK_ASPECT, buildMosaic, type Mosaic, type Slot } from "@/lib/macroShape";
import AnimatedNumber from "@/components/AnimatedNumber";
import type { SignatureRecord } from "@/lib/types";

type Props = {
  shape: string;
  signatures: SignatureRecord[];
  highlightId?: string | null;
};

const FLIGHT_MS = 1150;
const RIPPLE_MS = 1400;
/** Above this many signatures the ambient loop stops and the wall renders statically. */
const AMBIENT_LIMIT = 700;
const AMBIENT_FPS = 32;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

export default function MosaicWall({ shape, signatures, highlightId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const arrivalRef = useRef(new Map<string, number>());
  const mountedRef = useRef(false);
  /** Set by the render effect; lets async image loads trigger a repaint without state. */
  const redrawRef = useRef<() => void>(() => {});
  const [hover, setHover] = useState<{ x: number; y: number; sig: SignatureRecord } | null>(null);

  const mosaic: Mosaic = useMemo(
    () => buildMosaic(shape, Math.max(signatures.length, 1)),
    [shape, signatures.length],
  );

  /* Load each signature bitmap once; repaint when one lands. */
  useEffect(() => {
    for (const sig of signatures) {
      if (imagesRef.current.has(sig.id)) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = sig.dataUrl;
      imagesRef.current.set(sig.id, img);
      // Animate only the ones that arrive after first paint, so a page load with
      // 300 existing signatures doesn't turn into a 300-object fly-in.
      arrivalRef.current.set(sig.id, mountedRef.current ? performance.now() : 0);
      img.onload = () => redrawRef.current();
    }
    mountedRef.current = true;
  }, [signatures]);

  /* Render loop. */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Ambient motion is a nicety — drop it when it would be expensive or unwanted.
    const ambient = !reduced && signatures.length <= AMBIENT_LIMIT;

    let raf = 0;
    let lastFrame = 0;
    let onScreen = true;

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = w / MASK_ASPECT;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const draw = (now: number) => {
      const W = canvas.width;
      const H = canvas.height;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);

      const count = Math.min(signatures.length, mosaic.slots.length);

      /* ---- Ghost tiles for empty slots, breathing in a slow wave ---- */
      ctx.save();
      ctx.fillStyle = "#7dd3fc";
      for (let i = count; i < mosaic.slots.length; i++) {
        const slot = mosaic.slots[i];
        const pulse = ambient ? 0.5 + 0.5 * Math.sin(now / 1100 + i * 0.6) : 0.5;
        ctx.globalAlpha = 0.025 + pulse * 0.035;
        ctx.fillRect(
          slot.x * W - (slot.w * W) / 2,
          slot.y * H - (slot.h * H) / 2,
          slot.w * W * 0.86,
          slot.h * H * 0.86,
        );
      }
      ctx.restore();

      /* ---- Shimmer sweep ----
       * A diagonal band of light travels across the glyph every ~7s. `u` projects
       * each slot onto the sweep axis; slots within the band get an alpha and
       * scale boost that falls off linearly from the band centre. */
      const sweep = ambient ? ((now / 7000) % 1.55) - 0.28 : -99;
      const BAND = 0.1;

      let animating = false;

      for (let i = 0; i < count; i++) {
        const sig = signatures[i];
        const slot: Slot = mosaic.slots[i];
        const img = imagesRef.current.get(sig.id);
        if (!img || !img.complete || !img.naturalWidth) continue;

        const born = arrivalRef.current.get(sig.id) ?? 0;
        const t = born === 0 || reduced ? 1 : Math.min(1, (now - born) / FLIGHT_MS);
        if (t < 1) animating = true;
        const e = easeOutCubic(t);

        const boxW = slot.w * W;
        const boxH = slot.h * H;
        const tx = slot.x * W;
        const ty = slot.y * H;

        // Fly-in: start oversized at the centre of the wall, settle into the slot.
        const startX = W / 2;
        const startY = H * 0.46;
        const cx = startX + (tx - startX) * e;
        const cy = startY + (ty - startY) * e;
        const grow = 1 + (1 - e) * 7;

        // Ambient life: a shimmer boost plus a tiny out-of-phase bob.
        const u = slot.x * 0.82 + slot.y * 0.18;
        const glow = Math.max(0, 1 - Math.abs(u - sweep) / BAND);
        const bob = ambient ? Math.sin(now / 2600 + i * 0.8) * 0.9 : 0;
        const breathe = ambient ? 1 + glow * 0.09 + Math.sin(now / 3100 + i) * 0.008 : 1;

        // Contain-fit with a small overscale so the ink reaches the slot edges.
        const fit =
          Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight) * 1.06 * grow * breathe;
        const dw = img.naturalWidth * fit;
        const dh = img.naturalHeight * fit;

        ctx.save();
        ctx.translate(cx, cy + bob);
        ctx.rotate(slot.rotation * e);
        ctx.globalAlpha = Math.min(
          1,
          (0.72 + slot.coverage * 0.28) * (0.15 + 0.85 * e) + glow * 0.32,
        );
        if (glow > 0.05) {
          ctx.shadowColor = "rgba(103, 232, 249, 0.9)";
          ctx.shadowBlur = glow * 16;
        }
        if (sig.id === highlightId && t < 1) {
          ctx.shadowColor = "#67e8f9";
          ctx.shadowBlur = 44 * (1 - e) + 12;
        }
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();

        /* ---- Landing ripple ---- */
        if (born > 0) {
          const rt = (now - born) / RIPPLE_MS;
          if (rt >= 0 && rt < 1) {
            animating = true;
            const r = easeOutBack(Math.min(1, rt)) * Math.max(boxW, boxH) * 1.9;
            ctx.save();
            ctx.globalAlpha = (1 - rt) * 0.55;
            ctx.strokeStyle = "#67e8f9";
            ctx.lineWidth = Math.max(1, 2.5 * (1 - rt) * (W / 1200));
            ctx.beginPath();
            ctx.ellipse(tx, ty, r, r * 0.55, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      return animating;
    };

    const loop = (now: number) => {
      // Throttle the ambient pass; fly-ins still get every frame they need.
      if (ambient && now - lastFrame < 1000 / AMBIENT_FPS) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastFrame = now;
      const animating = draw(now);
      if ((ambient && onScreen) || animating) raf = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };

    redrawRef.current = () => start();

    sizeCanvas();
    start();

    const ro = new ResizeObserver(() => {
      sizeCanvas();
      start();
    });
    ro.observe(wrap);

    // Stop burning frames when the wall scrolls away or the tab is backgrounded.
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
        else cancelAnimationFrame(raf);
      },
      { threshold: 0 },
    );
    io.observe(wrap);

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      // Late image loads must not paint into an unmounted canvas.
      redrawRef.current = () => {};
    };
  }, [mosaic, signatures, highlightId]);

  /* Hit-test the slot under the cursor to show who signed there. */
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    const count = Math.min(signatures.length, mosaic.slots.length);
    for (let i = 0; i < count; i++) {
      const s = mosaic.slots[i];
      if (Math.abs(nx - s.x) <= s.w / 2 && Math.abs(ny - s.y) <= s.h / 2) {
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, sig: signatures[i] });
        return;
      }
    }
    setHover(null);
  };

  const filled = Math.min(signatures.length, mosaic.slots.length);
  const pct = mosaic.slots.length ? (filled / mosaic.slots.length) * 100 : 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full rounded-3xl"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      />

      {hover && (
        <div
          className="toast-in pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-cyan-300/25 bg-slate-950/95 px-3 py-2 text-xs shadow-[0_18px_40px_-18px_rgba(34,211,238,0.9)]"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          <div className="font-semibold text-white">{hover.sig.name || "Anonymous"}</div>
          {hover.sig.message && <div className="text-white/55">{hover.sig.message}</div>}
        </div>
      )}

      {/* Fill meter */}
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-500 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
        <span>
          <AnimatedNumber value={filled} className="font-semibold text-cyan-300" /> of{" "}
          {mosaic.slots.length} slots filled · lattice {mosaic.columns} cols
        </span>
        <span className="hidden sm:inline">Hover a signature to see who left it</span>
      </div>
    </div>
  );
}
