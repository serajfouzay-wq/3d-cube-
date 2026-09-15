"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MASK_ASPECT, buildMosaic, type Mosaic, type Slot } from "@/lib/macroShape";
import type { SignatureRecord } from "@/lib/types";

type Props = {
  shape: string;
  signatures: SignatureRecord[];
  /** ids that should animate in rather than appear instantly. */
  highlightId?: string | null;
};

const FLIGHT_MS = 1100;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

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

  /* Render loop: runs only while something is still flying in. */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let raf = 0;

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = w / MASK_ASPECT;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const ctx = canvas.getContext("2d")!;
      const now = performance.now();
      let animating = false;

      ctx.clearRect(0, 0, W, H);

      // Ghost of the target glyph: a faint tile per EMPTY slot, so the shape reads
      // when the wall is nearly bare and disappears as it fills.
      const count = Math.min(signatures.length, mosaic.slots.length);
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = "#7dd3fc";
      for (let i = count; i < mosaic.slots.length; i++) {
        const slot = mosaic.slots[i];
        ctx.fillRect(
          slot.x * W - (slot.w * W) / 2,
          slot.y * H - (slot.h * H) / 2,
          slot.w * W * 0.86,
          slot.h * H * 0.86,
        );
      }
      ctx.restore();

      for (let i = 0; i < count; i++) {
        const sig = signatures[i];
        const slot: Slot = mosaic.slots[i];
        const img = imagesRef.current.get(sig.id);
        if (!img || !img.complete || !img.naturalWidth) continue;

        const born = arrivalRef.current.get(sig.id) ?? 0;
        const t = born === 0 ? 1 : Math.min(1, (now - born) / FLIGHT_MS);
        if (t < 1) animating = true;
        const e = easeOutCubic(t);

        // Target box in device pixels.
        const boxW = slot.w * W;
        const boxH = slot.h * H;
        const tx = slot.x * W;
        const ty = slot.y * H;

        // Fly-in: start big and centred, shrink into the slot.
        const startX = W / 2;
        const startY = H * 0.46;
        const cx = startX + (tx - startX) * e;
        const cy = startY + (ty - startY) * e;
        const grow = 1 + (1 - e) * 7; // 8x oversized at t=0

        // Aspect-preserving contain-fit inside the slot box.
        // Contain-fit with a small overscale so the ink reaches the slot edges.
        const fit = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight) * 1.06 * grow;
        const dw = img.naturalWidth * fit;
        const dh = img.naturalHeight * fit;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(slot.rotation * e);
        ctx.globalAlpha = (0.72 + slot.coverage * 0.28) * (0.15 + 0.85 * e);
        if (sig.id === highlightId && t < 1) {
          ctx.shadowColor = "#67e8f9";
          ctx.shadowBlur = 40 * (1 - e) + 10;
        }
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }

      if (animating) raf = requestAnimationFrame(draw);
    };

    redrawRef.current = draw;

    const onResize = () => {
      sizeCanvas();
      draw();
    };

    sizeCanvas();
    draw();
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/15 bg-slate-950/95 px-2.5 py-1.5 text-xs text-white shadow-xl"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          <div className="font-semibold">{hover.sig.name || "Anonymous"}</div>
          {hover.sig.message && <div className="text-white/60">{hover.sig.message}</div>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
        <span>
          <span className="font-semibold text-cyan-300">{filled}</span> of{" "}
          {mosaic.slots.length} slots filled · lattice {mosaic.columns} cols
        </span>
        <span>Hover a signature to see who left it</span>
      </div>
    </div>
  );
}
