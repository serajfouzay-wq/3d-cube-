import type { SketchProvider, SketchToLifeRequest } from "../types";

/**
 * OpenAI gpt-image-1 image edits. Takes the sketch as a multipart PNG and returns
 * base64, which we hand back to the client as a data URL.
 *
 *   OPENAI_API_KEY=sk-...
 */
export const openaiProvider: SketchProvider = {
  name: "openai",
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),

  async run({ imageDataUrl, prompt }: SketchToLifeRequest) {
    const base64 = imageDataUrl.split(",")[1] ?? "";
    const bytes = Buffer.from(base64, "base64");

    const form = new FormData();
    form.append("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1");
    form.append(
      "prompt",
      `Turn this rough line sketch into a photorealistic image: ${prompt}. Keep the composition and proportions of the sketch.`,
    );
    form.append("size", "1024x1024");
    form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "sketch.png");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!}` },
      body: form,
    });

    if (!res.ok) throw new Error(`OpenAI failed (${res.status}): ${await res.text()}`);

    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    const url = json?.data?.[0]?.url;
    if (b64) return { imageUrl: `data:image/png;base64,${b64}` };
    if (typeof url === "string") return { imageUrl: url };
    throw new Error("OpenAI returned no image");
  },
};
