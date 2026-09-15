import type { SketchProvider, SketchToLifeRequest } from "../types";

/**
 * Replicate — ControlNet Scribble / SDXL img2img.
 *
 *   REPLICATE_API_TOKEN=r8_...
 *   REPLICATE_MODEL_VERSION=<version hash>   (optional, defaults to controlnet-scribble)
 *
 * Replicate accepts data URLs directly for image inputs, so the sketch needs no
 * upload step. Predictions are async: create, then poll until terminal.
 */
const DEFAULT_VERSION =
  process.env.REPLICATE_MODEL_VERSION ??
  "435061a1b5a4c1e26740464bf786efdfa9cb3a3ac488595a2de23e143fdb0117"; // jagilley/controlnet-scribble

const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 120_000;

export const replicateProvider: SketchProvider = {
  name: "replicate",
  isConfigured: () => Boolean(process.env.REPLICATE_API_TOKEN),

  async run({ imageDataUrl, prompt, strength = 0.8 }: SketchToLifeRequest) {
    const token = process.env.REPLICATE_API_TOKEN!;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const created = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        version: DEFAULT_VERSION,
        input: {
          image: imageDataUrl,
          prompt,
          num_samples: "1",
          image_resolution: "768",
          ddim_steps: 30,
          scale: 9,
          strength,
          a_prompt: "best quality, extremely detailed, photorealistic, natural lighting",
          n_prompt: "lowres, bad anatomy, worst quality, low quality, watermark, text",
        },
      }),
    });

    if (!created.ok) {
      throw new Error(`Replicate create failed (${created.status}): ${await created.text()}`);
    }

    let prediction = await created.json();
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (["starting", "processing"].includes(prediction.status)) {
      if (Date.now() > deadline) throw new Error("Replicate prediction timed out");
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const poll = await fetch(prediction.urls.get, { headers });
      if (!poll.ok) throw new Error(`Replicate poll failed (${poll.status})`);
      prediction = await poll.json();
    }

    if (prediction.status !== "succeeded") {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown"}`);
    }

    // ControlNet models return [control_image, generated...] — take the last frame.
    const output = prediction.output;
    const imageUrl = Array.isArray(output) ? output[output.length - 1] : output;
    if (typeof imageUrl !== "string") throw new Error("Replicate returned no image");
    return { imageUrl };
  },
};
