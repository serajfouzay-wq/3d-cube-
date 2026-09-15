"use client";

import { useEffect, useState } from "react";
import DrawingCanvas, { type CapturedDrawing } from "@/components/DrawingCanvas";
import { useReveal } from "@/lib/useReveal";
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
  const leftRef = useReveal<HTMLDivElement>();
  const rightRef = useReveal<HTMLDivElement>();

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
      <div className="pt-6 sm:pt-10">
        <h1
          className="fade-up text-4xl font-semibold tracking-tight sm:text-6xl"
          style={{ animationDelay: "60ms" }}
        >
          Sketch <span className="shimmer-text-warm">to life</span>
        </h1>
        <p
          className="fade-up mt-4 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base"
          style={{ animationDelay: "140ms" }}
        >
          Draw a rough shape — a rose, a cat, a tree — describe it in a few words, and the sketch is
          handed to an image-to-image model as a structural guide.
        </p>

        {provider && (
          <div
            className={`fade-up mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
              provider.mocked
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            }`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            {provider.mocked
              ? "Mock renderer — add REPLICATE_API_TOKEN, FAL_KEY or OPENAI_API_KEY to go live"
              : `Live via ${provider.provider}`}
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Input side */}
        <div ref={leftRef} className="reveal card card-hover p-5 sm:p-6">
          <h2 className="mb-3 flex items-center gap-2.5 text-lg font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/15 font-mono text-xs text-amber-300">
              1
            </span>
            Sketch it
          </h2>
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
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/15 font-mono text-xs text-amber-300">
                2
              </span>
              Describe it
            </label>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={300}
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-white/25 focus:border-amber-400/60 focus:bg-white/[0.07] focus:shadow-[0_0_0_4px_rgba(251,191,36,0.12)]"
              placeholder="a red rose, dew on the petals"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-all duration-300 hover:-translate-y-0.5 ${
                    prompt === p
                      ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                      : "border-white/10 bg-white/[0.04] text-white/55 hover:border-amber-400/40 hover:text-white"
                  }`}
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
        <div ref={rightRef} className="reveal card card-hover p-5 sm:p-6" style={{ transitionDelay: "110ms" }}>
          <h2 className="mb-3 flex items-center gap-2.5 text-lg font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-400/15 font-mono text-xs text-rose-300">
              3
            </span>
            Alive
          </h2>

          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
            {!sketch && (
              <div className="grid h-full place-items-center px-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <span className="float-soft text-3xl opacity-40">🌹</span>
                  <p className="text-sm text-white/35">Your generated image lands here</p>
                </div>
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
              <div className="absolute inset-0 overflow-hidden bg-slate-950/85 backdrop-blur-[3px]">
                {/* Scanner sweeping down over the sketch */}
                <div
                  className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-amber-300/25 to-transparent"
                  style={{ animation: "scan-line 2.2s ease-in-out infinite" }}
                />
                <div className="relative grid h-full place-items-center">
                  <div className="flex flex-col items-center gap-4">
                    <svg viewBox="0 0 100 100" className="h-16 w-16">
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="rgba(255,255,255,0.09)"
                        strokeWidth="3"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#fcd34d"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray="70 190"
                        style={{ animation: "dash-orbit 1.4s linear infinite" }}
                      />
                      <circle cx="50" cy="50" r="5" fill="#fb7185" className="float-soft" />
                    </svg>
                    <p className="text-sm font-medium text-white/80">Bringing it to life…</p>
                    <p className="max-w-[16rem] text-center text-xs text-white/35">
                      Sending your strokes as a structural guide
                    </p>
                  </div>
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
            <div className="fade-up mt-4 flex flex-wrap items-center gap-3 text-xs text-white/45">
              <span>
                via <span className="text-white/75">{result.provider}</span>
              </span>
              <span>{(result.latencyMs / 1000).toFixed(1)}s</span>
              {sketch && (
                <button
                  onMouseEnter={() => setRevealed(false)}
                  onMouseLeave={() => setRevealed(true)}
                  className="btn-ghost rounded-lg px-2.5 py-1 font-medium text-white/80"
                >
                  Hold to compare
                </button>
              )}
              <a
                href={result.imageUrl}
                download="sketch-to-life.png"
                className="btn-ghost ml-auto rounded-lg px-2.5 py-1 font-medium text-white/80"
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
