"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import DrawingCanvas, { type CapturedDrawing } from "@/components/DrawingCanvas";
import type { SignatureRecord } from "@/lib/types";

// The wall rasterises the glyph with a real <canvas>, so it is browser-only.
const MosaicWall = dynamic(() => import("@/components/MosaicWall"), {
  ssr: false,
  loading: () => (
    <div className="aspect-[1200/620] w-full animate-pulse rounded-3xl bg-white/[0.03]" />
  ),
});

const SHAPES = ["26", "2026", "HI", "★"];
const POLL_MS = 5000;

export default function Home() {
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [shape, setShape] = useState("26");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const countRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/signatures", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const next: SignatureRecord[] = json.signatures ?? [];
      // Only re-render when something actually changed (polling every 5s).
      if (next.length !== countRef.current) {
        countRef.current = next.length;
        setSignatures(next);
      }
    } catch {
      /* offline — keep whatever we have */
    }
  }, []);

  useEffect(() => {
    // Kick the first poll off the effect body so state only ever lands async.
    Promise.resolve().then(refresh);
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const submit = async (drawing: CapturedDrawing) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: drawing.dataUrl,
          width: drawing.width,
          height: drawing.height,
          name,
          message,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save your signature");

      const signature: SignatureRecord = json.signature;
      countRef.current += 1;
      setSignatures((prev) => [...prev, signature]);
      setHighlightId(signature.id);
      setMessage("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const seed = async (count: number) => {
    setBusy(true);
    try {
      for (let i = 0; i < count; i++) {
        const drawing = syntheticSignature();
        await fetch("/api/signatures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...drawing, name: `Guest ${i + 1}` }),
        });
      }
      countRef.current = -1;
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16">
      <section className="fade-up">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              One wall.{" "}
              <span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">
                Every signature.
              </span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/55">
              Each drawing is trimmed, measured and slotted into the giant{" "}
              <span className="font-mono text-cyan-300">{shape}</span>. The lattice gets finer as
              the crowd grows, so the wall never runs out of room.
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1">
            {SHAPES.map((s) => (
              <button
                key={s}
                onClick={() => setShape(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  shape === s ? "bg-white text-slate-950" : "text-white/60 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-sm sm:p-6">
          <MosaicWall shape={shape} signatures={signatures} highlightId={highlightId} />
        </div>
      </section>

      <section className="fade-up mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5 backdrop-blur-sm">
          <h2 className="text-lg font-semibold">Add yours</h2>
          <p className="mb-4 mt-1 text-sm text-white/50">
            Draw with a mouse, trackpad, finger or stylus — pressure is picked up where the device
            reports it.
          </p>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              maxLength={40}
              className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-white/30 focus:border-cyan-400/60"
            />
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Short message (optional)"
              maxLength={120}
              className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-white/30 focus:border-cyan-400/60"
            />
          </div>

          <DrawingCanvas theme="dark" busy={busy} onSubmit={submit} submitLabel="Add to the 26" />

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5 text-sm backdrop-blur-sm">
            <h3 className="font-semibold">How a slot is chosen</h3>
            <ol className="mt-3 space-y-2.5 text-white/55">
              <li>
                <span className="font-mono text-cyan-300">1</span> The glyph is drawn to a hidden
                1200×620 canvas; the alpha channel becomes a binary ink mask.
              </li>
              <li>
                <span className="font-mono text-cyan-300">2</span> A hex-offset square lattice walks
                the mask; a cell becomes a slot when ≥60% of its area is ink.
              </li>
              <li>
                <span className="font-mono text-cyan-300">3</span> A seeded PRNG jitters position,
                rotation and scale so it reads as a collage, not a grid.
              </li>
              <li>
                <span className="font-mono text-cyan-300">4</span> Slots are re-ordered by
                farthest-point sampling, so early signatures spread across the whole shape.
              </li>
            </ol>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5 text-sm backdrop-blur-sm">
            <h3 className="font-semibold">Try it at scale</h3>
            <p className="mt-1 text-white/50">
              Drop in synthetic signatures to see the mosaic densify.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[10, 50, 200].map((n) => (
                <button
                  key={n}
                  onClick={() => seed(n)}
                  disabled={busy}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20 disabled:opacity-40"
                >
                  +{n}
                </button>
              ))}
              <button
                onClick={async () => {
                  setBusy(true);
                  await fetch("/api/signatures", { method: "DELETE" });
                  countRef.current = -1;
                  await refresh();
                  setBusy(false);
                }}
                disabled={busy}
                className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/25 disabled:opacity-40"
              >
                Reset wall
              </button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

/** Generates a scribble that looks like a handwritten signature — demo data only. */
function syntheticSignature() {
  const W = 420;
  const H = 150;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = ["#ffffff", "#8be9fd", "#ffb86c", "#ff79c6"][Math.floor(Math.random() * 4)];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 + Math.random() * 3;

  const strokes = 1 + Math.floor(Math.random() * 2);
  for (let s = 0; s < strokes; s++) {
    ctx.beginPath();
    let x = 20 + Math.random() * 40;
    let y = H / 2 + (Math.random() - 0.5) * 20;
    ctx.moveTo(x, y);
    const loops = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < loops; i++) {
      const cx = x + 20 + Math.random() * 45;
      const cy = y + (Math.random() - 0.5) * 110;
      x = cx + 15 + Math.random() * 35;
      y = H / 2 + (Math.random() - 0.5) * 45;
      ctx.quadraticCurveTo(cx, cy, x, y);
    }
    ctx.stroke();
  }

  return { dataUrl: canvas.toDataURL("image/png"), width: W, height: H };
}
