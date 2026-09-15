"use client";

import { useEffect, useState } from "react";
import DrawingCanvas, { type CapturedDrawing } from "@/components/DrawingCanvas";
import type { SketchToLifeResult } from "@/lib/types";

const PRESETS = ["a red rose", "a sunflower in a field", "a tabby cat", "a goldfish", "an oak tree"];

export default function SketchPage() {
  const [prompt, setPrompt] = useState("a red rose");
  const [strength, setStrength] = useState(0.8);
  const [sketch, setSketch] = useState<string | null>(null);
  const [result, setResult] = useState<SketchToLifeResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<{ provider: string; mocked: boolean } | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    fetch("/api/sketch-to-life")
      .then((r) => r.json())
      .then(setProvider)
      .catch(() => setProvider(null));
  }, []);

  const bringToLife = async (drawing: CapturedDrawing) => {
    setSketch(drawing.dataUrl);
    setResult(null);
    setRevealed(false);
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/sketch-to-life", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: drawing.dataUrl, prompt, strength }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");

      setResult(json as SketchToLifeResult);
      setStatus("idle");
      // Let the <img> mount at opacity 0, then cross-fade on the next frame.
      requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16">
      <div className="fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Sketch{" "}
          <span className="bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-transparent">
            to life
          </span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/55">
          Draw a rough shape — a rose, a cat, a tree — describe it in a few words, and the sketch is
          handed to an image-to-image model as a structural guide.
        </p>

        {provider && (
          <div
            className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
              provider.mocked
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {provider.mocked
              ? "Mock renderer — add REPLICATE_API_TOKEN, FAL_KEY or OPENAI_API_KEY to go live"
              : `Live via ${provider.provider}`}
          </div>
        )}
      </div>

      <div className="fade-up mt-6 grid gap-6 lg:grid-cols-2">
        {/* Input side */}
        <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5 backdrop-blur-sm">
          <h2 className="mb-3 text-lg font-semibold">1 · Sketch it</h2>
          <DrawingCanvas
            theme="light"
            height={340}
            busy={status === "loading"}
            submitLabel="Bring to life ✨"
            hint="Draw a simple outline — a rose, a cat, a tree"
            maxExport={768}
            guideLine={false}
            onSubmit={bringToLife}
          />

          <div className="mt-5">
            <label className="text-sm font-medium">2 · Describe it</label>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={300}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-white/30 focus:border-amber-400/60"
              placeholder="a red rose, dew on the petals"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition hover:border-amber-400/40 hover:text-white"
                >
                  {p}
                </button>
              ))}
            </div>

            <label className="mt-4 flex items-center gap-3 text-xs text-white/50">
              Freedom
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                className="flex-1 accent-amber-400"
              />
              <span className="w-8 font-mono text-white/70">{strength.toFixed(2)}</span>
            </label>
          </div>
        </div>

        {/* Output side */}
        <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5 backdrop-blur-sm">
          <h2 className="mb-3 text-lg font-semibold">3 · Alive</h2>

          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
            {!sketch && (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-white/35">
                Your generated image lands here
              </div>
            )}

            {/* The sketch sits underneath and fades out as the render fades in. */}
            {sketch && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sketch}
                alt="Your sketch"
                className={`absolute inset-0 h-full w-full bg-white object-contain p-6 transition-opacity duration-1000 ${
                  revealed ? "opacity-0" : "opacity-100"
                }`}
              />
            )}

            {result && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.imageUrl}
                alt={result.prompt}
                className={`absolute inset-0 h-full w-full object-contain transition-all duration-1000 ${
                  revealed ? "scale-100 opacity-100 blur-0" : "scale-105 opacity-0 blur-md"
                }`}
              />
            )}

            {status === "loading" && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-amber-300" />
                  <p className="text-sm text-white/70">Bringing it to life…</p>
                  <p className="max-w-[16rem] text-center text-xs text-white/35">
                    Sending your strokes as a structural guide
                  </p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/45">
              <span>
                via <span className="text-white/75">{result.provider}</span>
              </span>
              <span>{(result.latencyMs / 1000).toFixed(1)}s</span>
              {sketch && (
                <button
                  onMouseEnter={() => setRevealed(false)}
                  onMouseLeave={() => setRevealed(true)}
                  className="rounded-lg bg-white/10 px-2.5 py-1 font-medium text-white/80 transition hover:bg-white/20"
                >
                  Hold to compare
                </button>
              )}
              <a
                href={result.imageUrl}
                download="sketch-to-life.png"
                className="ml-auto rounded-lg bg-white/10 px-2.5 py-1 font-medium text-white/80 transition hover:bg-white/20"
              >
                Download
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
