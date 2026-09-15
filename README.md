# 3d-cube-

- `index.html` — the original Three.js planetary/cube scene.
- [`signature-mosaic/`](signature-mosaic) — **Signature Mosaic**, a Next.js app where
  visitors sign a canvas and their signature is placed into a giant macro-glyph
  (`26`), plus a Sketch-to-Life image-to-image tool.

  ```bash
  cd signature-mosaic && npm install && npm run dev
  ```

  See [`signature-mosaic/README.md`](signature-mosaic/README.md) for the macro-shape
  algorithm (mask rasterisation → hex lattice → seeded jitter → farthest-point ordering).
