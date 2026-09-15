import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/providers";
import type { SketchToLifeResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_DATA_URL_BYTES = 6_000_000;

export async function GET() {
  const provider = resolveProvider();
  return NextResponse.json({ provider: provider.name, mocked: provider.name === "mock" });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageDataUrl, prompt, strength } = (body ?? {}) as Record<string, unknown>;

  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "imageDataUrl must be a base64 PNG data URL" }, { status: 400 });
  }
  if (imageDataUrl.length > MAX_DATA_URL_BYTES) {
    return NextResponse.json({ error: "Sketch is too large" }, { status: 413 });
  }

  const cleanPrompt =
    typeof prompt === "string" && prompt.trim() ? prompt.trim().slice(0, 300) : "a red rose";

  const provider = resolveProvider();
  const startedAt = Date.now();

  try {
    const { imageUrl } = await provider.run({
      imageDataUrl,
      prompt: cleanPrompt,
      strength: typeof strength === "number" ? Math.min(1, Math.max(0, strength)) : undefined,
    });

    const result: SketchToLifeResult = {
      imageUrl,
      provider: provider.name,
      mocked: provider.name === "mock",
      latencyMs: Date.now() - startedAt,
      prompt: cleanPrompt,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[sketch-to-life]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Generation failed",
        provider: provider.name,
      },
      { status: 502 },
    );
  }
}
