"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import AnimatedNumber from "@/components/AnimatedNumber";
import DrawingCanvas, { type CapturedDrawing } from "@/components/DrawingCanvas";
import { useReveal } from "@/lib/useReveal";
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

const STEPS = [
  ["Rasterise", "The glyph is drawn to a hidden 1200×620 canvas; its alpha channel becomes a binary ink mask."],
  ["Lattice", "A hex-offset lattice walks the mask. A cell becomes a slot when ≥60% of its area is ink."],
  ["Jitter", "A seeded PRNG nudges position, rotation and scale so it reads as a collage, not a grid."],
  ["Order", "Slots are re-ordered by farthest-point sampling, so early signatures spread across the whole shape."],
];

export default function Home() {
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [shape, setShape] = useState("26");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const countRef = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const padRef = useReveal<HTMLDivElement>();
  const asideRef = useReveal<HTMLElement>();

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

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };

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
      showToast(`${name.trim() || "You"} landed in slot #${countRef.current}`);
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
      showToast(`Seeded ${count} signatures`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative mx-auto max-w-6xl px-5 pb-20">
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="pt-6 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p
              className="fade-up mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/[0.07] px-3 py-1.5 text-xs text-cyan-200/90"
              style={{ animationDelay: "40ms" }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-300" />
              </span>
              <AnimatedNumber value={signatures.length} /> signatures on the wall
            </p>

            <h1
              className="fade-up text-4xl font-semibold tracking-tight sm:text-6xl"
              style={{ animationDelay: "110ms" }}
            >
              One wall.
              <br />
              <span className="shimmer-text">Every signature.</span>
            </h1>

            <p
              className="fade-up mt-4 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base"
              style={{ animationDelay: "190ms" }}
            >
              Each drawing is trimmed, measured and slotted into the giant{" "}
              <span className="font-mono text-cyan-300">{shape}</span>. The lattice gets finer as
              the crowd grows, so the wall never runs out of room.
            </p>
          </div>

          <div
            className="fade-up flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 backdrop-blur-sm"
            style={{ animationDelay: "260ms" }}
          >
            {SHAPES.map((s) => (
              <button
                key={s}
                onClick={() => setShape(s)}
                className={`relative rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-300 ${
                  shape === s
                    ? "bg-white text-slate-950 shadow-[0_8px_24px_-10px_rgba(255,255,255,0.8)]"
                    : "text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------ Wall ------------------------------ */}
        <div
          className="fade-up card relative mt-8 p-4 sm:p-6"
          style={{ animationDelay: "330ms" }}
        >
          {/* halo behind the glyph */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3xl opacity-60"
            style={{
              background:
                "radial-gradient(60% 55% at 50% 45%, rgba(34,211,238,0.11), transparent 70%)",
            }}
          />
          <div className="relative">
            <MosaicWall shape={shape} signatures={signatures} highlightId={highlightId} />
          </div>
        </div>
      </section>

      {/* --------------------------- Pad + aside --------------------------- */}
      <section className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div ref={padRef} className="reveal card card-hover p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400/15 text-sm font-bold text-cyan-300">
              ✍
            </span>
            <div>
              <h2 className="text-lg font-semibold">Add yours</h2>
              <p className="text-xs text-white/45">
                Mouse, trackpad, finger or stylus — pressure is picked up where the device reports it.
              </p>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              maxLength={40}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-white/25 focus:border-cyan-400/60 focus:bg-white/[0.07] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]"
            />
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Short message (optional)"
              maxLength={120}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-white/25 focus:border-cyan-400/60 focus:bg-white/[0.07] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]"
            />
          </div>

          <DrawingCanvas theme="dark" busy={busy} onSubmit={submit} submitLabel="Add to the 26" />

          {error && (
            <p className="fade-up mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <aside ref={asideRef} className="reveal space-y-5" style={{ transitionDelay: "120ms" }}>
          <div className="card card-hover p-5">
            <h3 className="font-semibold">How a slot is chosen</h3>
            <ol className="mt-4 space-y-4">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="group flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-400/10 font-mono text-[11px] text-cyan-300 transition-all duration-300 group-hover:scale-110 group-hover:bg-cyan-400/20">
                    {i + 1}
                  </span>
                  <span className="text-sm text-white/55">
                    <span className="font-medium text-white/85">{title}.</span> {body}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="card card-hover p-5">
            <h3 className="font-semibold">Try it at scale</h3>
            <p className="mt-1 text-sm text-white/45">
              Drop in synthetic signatures to see the mosaic densify.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[10, 50, 200].map((n) => (
                <button
                  key={n}
                  onClick={() => seed(n)}
                  disabled={busy}
                  className="btn-ghost rounded-xl px-3.5 py-2 text-xs font-medium disabled:opacity-40"
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
                className="ml-auto rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-300 transition-all duration-300 hover:bg-red-500/20 active:scale-95 disabled:opacity-40"
              >
                Reset wall
              </button>
            </div>
          </div>
        </aside>
      </section>

      {/* ------------------------------ Toast ------------------------------ */}
      {toast && (
        <div className="toast-in pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-2xl border border-cyan-300/25 bg-slate-950/90 px-4 py-2.5 text-sm shadow-[0_24px_60px_-24px_rgba(34,211,238,0.95)] backdrop-blur-xl">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-400 text-[11px] font-bold text-slate-950">
              ✓
            </span>
            {toast}
          </div>
        </div>
      )}
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
