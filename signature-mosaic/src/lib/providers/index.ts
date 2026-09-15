import type { SketchProvider } from "../types";
import { falProvider } from "./fal";
import { mockProvider } from "./mock";
import { openaiProvider } from "./openai";
import { replicateProvider } from "./replicate";

const registry: Record<string, SketchProvider> = {
  replicate: replicateProvider,
  fal: falProvider,
  openai: openaiProvider,
  mock: mockProvider,
};

/**
 * Explicit SKETCH_PROVIDER wins; otherwise pick the first provider whose key is
 * present; otherwise fall back to the mock so the app always runs.
 */
export function resolveProvider(): SketchProvider {
  const explicit = process.env.SKETCH_PROVIDER?.toLowerCase();
  if (explicit && registry[explicit]) return registry[explicit];
  return (
    [replicateProvider, falProvider, openaiProvider].find((p) => p.isConfigured()) ?? mockProvider
  );
}

export { registry as providers };
