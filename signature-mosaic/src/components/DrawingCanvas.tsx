"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CapturedDrawing = {
  dataUrl: string;
  width: number;
  height: number;
  isEmpty: boolean;
};

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; color: string; size: number };

type Props = {
  /** Visual theme of the pad. Ink defaults follow the theme. */
  theme?: "dark" | "light";
  inkOptions?: string[];
  height?: number;
  busy?: boolean;
  submitLabel?: string;
  hint?: string;
  /** Export scale cap — the longest edge of the exported PNG. */
  maxExport?: number;
  /** Dashed baseline guide — helpful for signing, noise for sketching. */
  guideLine?: boolean;
  onSubmit: (drawing: CapturedDrawing) => void | Promise<void>;
};

const DARK_INKS = ["#ffffff", "#8be9fd", "#ffb86c", "#ff79c6", "#50fa7b"];
const LIGHT_INKS = ["#111827", "#2563eb", "#dc2626", "#059669", "#7c3aed"];

export default function DrawingCanvas({
  theme = "dark",
  inkOptions,
  height = 260,
  busy = false,
  submitLabel = "Submit signature",
  hint = "Sign or write a short message",
  maxExport = 640,
  guideLine = true,
  onSubmit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<Stroke | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const inks = inkOptions ?? (theme === "dark" ? DARK_INKS : LIGHT_INKS);
  const [color, setColor] = useState(inks[0]);
  const [size, setSize] = useState(3.2);

  /** Repaint every stroke from the model — this is what makes undo trivial. */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = canvas.width / canvas.clientWidth || 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const all = activeRef.current
      ? [...strokesRef.current, activeRef.current]
      : strokesRef.current;

    for (const stroke of all) {
      const pts = stroke.points;
      if (pts.length === 0) continue;
      ctx.strokeStyle = stroke.color;

      if (pts.length === 1) {
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, (stroke.size * pts[0].pressure) / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Draw segment-by-segment through midpoints: quadratic curves smooth the
      // polyline, and per-segment width gives pressure/velocity-sensitive ink.
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        const midX = (prev.x + cur.x) / 2;
        const midY = (prev.y + cur.y) / 2;
        ctx.lineWidth = stroke.size * ((prev.pressure + cur.pressure) / 2);
        ctx.beginPath();
        if (i === 1) ctx.moveTo(prev.x, prev.y);
        else ctx.moveTo((pts[i - 2].x + prev.x) / 2, (pts[i - 2].y + prev.y) / 2);
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        ctx.stroke();
      }
    }
    ctx.restore();
  }, []);

  /** Keep the backing store in device pixels so strokes stay crisp. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      repaint();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [repaint]);

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Mouse events report pressure 0 / 0.5 inconsistently; normalise to a usable range.
    const raw = e.pressure > 0 && e.pointerType !== "mouse" ? e.pressure : 0.5;
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: 0.55 + raw * 0.9,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activeRef.current = { points: [toLocal(e)], color, size };
    setDrawing(true);
    repaint();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    const pts = activeRef.current.points;
    const p = toLocal(e);
    const last = pts[pts.length - 1];
    // Drop sub-pixel jitter: fewer points, smoother curve, cheaper repaint.
    if ((p.x - last.x) ** 2 + (p.y - last.y) ** 2 < 1.5) return;
    pts.push(p);
    repaint();
  };

  const endStroke = () => {
    if (!activeRef.current) return;
    strokesRef.current.push(activeRef.current);
    activeRef.current = null;
    setDrawing(false);
    setHasInk(true);
    repaint();
  };

  const undo = () => {
    strokesRef.current.pop();
    setHasInk(strokesRef.current.length > 0);
    repaint();
  };

  const clear = () => {
    strokesRef.current = [];
    activeRef.current = null;
    setDrawing(false);
    setHasInk(false);
    repaint();
  };

  /**
   * Export: find the ink bounding box in the alpha channel, crop to it (+ padding),
   * and downscale so the longest edge is <= maxExport. A trimmed PNG is essential
   * for the mosaic — otherwise every slot would be padded with empty space and the
   * signatures would look randomly sized.
   */
  const capture = useCallback((): CapturedDrawing => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { width: W, height: H } = canvas;
    const { data } = ctx.getImageData(0, 0, W, H);

    let minX = W;
    let minY = H;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { dataUrl: "", width: 0, height: 0, isEmpty: true };

    const pad = Math.round(Math.max(4, (maxX - minX + maxY - minY) * 0.02));
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad);
    maxY = Math.min(H - 1, maxY + pad);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = Math.min(1, maxExport / Math.max(cropW, cropH));
    const outW = Math.max(1, Math.round(cropW * scale));
    const outH = Math.max(1, Math.round(cropH * scale));

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const octx = out.getContext("2d")!;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, outW, outH);

    return { dataUrl: out.toDataURL("image/png"), width: outW, height: outH, isEmpty: false };
  }, [maxExport]);

  const submit = async () => {
    const drawing = capture();
    if (drawing.isEmpty) return;
    await onSubmit(drawing);
  };

  const dark = theme === "dark";

  return (
    <div className="w-full">
      <div
        className={`relative overflow-hidden rounded-2xl border transition-all duration-500 ${
          dark
            ? `bg-slate-950/60 ${drawing ? "border-cyan-400/50 shadow-[0_0_0_4px_rgba(34,211,238,0.10),0_20px_50px_-24px_rgba(34,211,238,0.85)]" : "border-white/12"}`
            : `bg-white ${drawing ? "border-cyan-500/60 shadow-[0_0_0_4px_rgba(34,211,238,0.14)]" : "border-slate-300"}`
        }`}
        style={{ height }}
      >
        {/* Corner ticks — a quiet "this is a canvas" cue */}
        {dark && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-3 rounded-xl opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.10) 1px, transparent 1px)",
              backgroundSize: "26px 26px",
              maskImage: "radial-gradient(75% 65% at 50% 50%, #000, transparent 85%)",
              WebkitMaskImage: "radial-gradient(75% 65% at 50% 50%, #000, transparent 85%)",
            }}
          />
        )}
        {/* Guide line + placeholder */}
        {guideLine && (
          <div
            className={`pointer-events-none absolute inset-x-8 bottom-[28%] border-b border-dashed ${
              dark ? "border-white/15" : "border-slate-300"
            }`}
          />
        )}
        {!hasInk && !drawing && (
          <div
            className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm transition-opacity duration-300 ${
              dark ? "text-white/25" : "text-slate-400"
            }`}
          >
            <span className="float-soft text-2xl opacity-60">✎</span>
            {hint}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ cursor: busy ? "wait" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {inks.map((ink) => (
            <button
              key={ink}
              type="button"
              aria-label={`Ink ${ink}`}
              onClick={() => setColor(ink)}
              className={`h-6 w-6 rounded-full border transition-all duration-300 hover:scale-110 ${
                color === ink
                  ? "scale-115 border-white ring-2 ring-offset-2 ring-white/50 ring-offset-transparent"
                  : "border-white/25 opacity-70 hover:opacity-100"
              }`}
              style={{ background: ink }}
            />
          ))}
        </div>

        <label className={`flex items-center gap-2 text-xs ${dark ? "text-white/60" : "text-slate-500"}`}>
          Stroke
          <input
            type="range"
            min={1.5}
            max={9}
            step={0.5}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-24 accent-cyan-400"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!hasInk || busy}
            className={`btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-35 ${
              dark ? "text-white" : "!border-slate-200 !bg-slate-100 text-slate-700"
            }`}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={!hasInk || busy}
            className={`btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-35 ${
              dark ? "text-white" : "!border-slate-200 !bg-slate-100 text-slate-700"
            }`}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!hasInk || busy}
            className="btn-primary rounded-lg px-4 py-2 text-xs disabled:opacity-35 disabled:shadow-none"
          >
            {busy ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-slate-900/30 border-t-slate-900" />
                Working…
              </span>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
