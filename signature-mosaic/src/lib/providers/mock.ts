import type { SketchProvider, SketchToLifeRequest } from "../types";

/**
 * Offline stand-in for a real image-to-image model. It wraps the user's sketch in
 * an SVG filter chain (turbulence displacement + blur + tint + lighting) so the UI
 * has something plausibly "rendered" to cross-fade to, and is clearly watermarked.
 */
export const mockProvider: SketchProvider = {
  name: "mock",
  isConfigured: () => true,
  async run({ imageDataUrl, prompt }: SketchToLifeRequest) {
    await new Promise((r) => setTimeout(r, 1600));

    const hue = [...prompt].reduce((a, c) => (a + c.charCodeAt(0)) % 360, 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="768" height="768" viewBox="0 0 768 768">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="hsl(${hue}, 55%, 24%)"/>
      <stop offset="60%" stop-color="hsl(${(hue + 40) % 360}, 45%, 12%)"/>
      <stop offset="100%" stop-color="#05060a"/>
    </radialGradient>
    <filter id="alive" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="${hue}" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" result="warped"/>
      <feGaussianBlur in="warped" stdDeviation="1.1" result="soft"/>
      <feColorMatrix in="soft" type="matrix" result="tinted"
        values="0.9 0.5 0.2 0 0.06
                0.4 0.9 0.3 0 0.04
                0.3 0.4 1.0 0 0.08
                0   0   0   1 0"/>
      <feSpecularLighting in="soft" surfaceScale="4" specularConstant="0.85" specularExponent="22"
        lighting-color="#fff7e6" result="spec">
        <fePointLight x="220" y="140" z="230"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="soft" operator="in" result="specClipped"/>
      <feMerge>
        <feMergeNode in="tinted"/>
        <feMergeNode in="specClipped"/>
      </feMerge>
    </filter>
    <filter id="bloom"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <rect width="768" height="768" fill="url(#bg)"/>
  <g opacity="0.55" filter="url(#bloom)">
    <image xlink:href="${imageDataUrl}" x="96" y="96" width="576" height="576" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <g filter="url(#alive)">
    <image xlink:href="${imageDataUrl}" x="96" y="96" width="576" height="576" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <text x="24" y="744" font-family="monospace" font-size="20" fill="#ffffff" opacity="0.45">MOCK RENDER — add an API key for the real thing</text>
</svg>`;

    return { imageUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
  },
};
