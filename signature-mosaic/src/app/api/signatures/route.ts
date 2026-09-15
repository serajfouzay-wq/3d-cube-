import { NextResponse } from "next/server";
import { addSignature, clearSignatures, listSignatures } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_DATA_URL_BYTES = 900_000; // ~900KB of base64 — plenty for a trimmed signature

export async function GET() {
  const signatures = await listSignatures();
  return NextResponse.json({ signatures });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { dataUrl, width, height, name, message } = (body ?? {}) as Record<string, unknown>;

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "dataUrl must be a base64 PNG data URL" }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATA_URL_BYTES) {
    return NextResponse.json({ error: "Drawing is too large" }, { status: 413 });
  }
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return NextResponse.json({ error: "width and height are required" }, { status: 400 });
  }

  const signature = await addSignature({
    dataUrl,
    width,
    height,
    name: typeof name === "string" ? name.slice(0, 40).trim() || undefined : undefined,
    message: typeof message === "string" ? message.slice(0, 120).trim() || undefined : undefined,
  });

  return NextResponse.json({ signature }, { status: 201 });
}

/** Dev convenience: wipe the wall. */
export async function DELETE() {
  await clearSignatures();
  return NextResponse.json({ ok: true });
}
