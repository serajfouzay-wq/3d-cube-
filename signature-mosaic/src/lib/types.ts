export type SignatureRecord = {
  id: string;
  /** Trimmed PNG of the user's drawing, transparent background. */
  dataUrl: string;
  /** Intrinsic pixel size of the trimmed PNG, used for aspect-preserving fit. */
  width: number;
  height: number;
  name?: string;
  message?: string;
  createdAt: number;
};

export type SketchToLifeRequest = {
  imageDataUrl: string;
  prompt: string;
  /** 0..1 — how far from the sketch the model is allowed to travel. */
  strength?: number;
};

export type SketchToLifeResult = {
  imageUrl: string;
  provider: string;
  mocked: boolean;
  latencyMs: number;
  prompt: string;
};

export interface SketchProvider {
  name: string;
  isConfigured(): boolean;
  run(req: SketchToLifeRequest): Promise<{ imageUrl: string }>;
}
