import type { SketchProvider, SketchToLifeRequest } from "../types";

/**
 * fal.ai — synchronous endpoint, returns the image in one round trip.
 *
 *   FAL_KEY=<key-id>:<key-secret>
 *   FAL_MODEL=fal-ai/flux-control-lora-canny   (optional)
 */
const DEFAULT_MODEL = process.env.FAL_MODEL ?? "fal-ai/flux-control-lora-canny";

export const falProvider: SketchProvider = {
  name: "fal",
  isConfigured: () => Boolean(process.env.FAL_KEY),

  async run({ imageDataUrl, prompt, strength = 0.85 }: SketchToLifeRequest) {
    const res = await fetch(`https://fal.run/${DEFAULT_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${process.env.FAL_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: `${prompt}, photorealistic, highly detailed, natural lighting`,
        control_image_url: imageDataUrl,
        image_url: imageDataUrl,
        strength,
        num_images: 1,
        image_size: "square_hd",
      }),
    });

    if (!res.ok) throw new Error(`fal.ai failed (${res.status}): ${await res.text()}`);

    const json = await res.json();
    const imageUrl = json?.images?.[0]?.url ?? json?.image?.url;
    if (typeof imageUrl !== "string") throw new Error("fal.ai returned no image");
    return { imageUrl };
  },
};
