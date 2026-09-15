# Signature Mosaic

Two things in one Next.js app:

1. **The Wall** (`/`) — visitors sign a drawing pad; every signature is trimmed,
   measured and slotted into a giant macro-glyph (`26` by default). As more people
   sign, the glyph fills in.
2. **Sketch to Life** (`/sketch`) — draw a rough rose/cat/tree, hit *Bring to life*,
   and the sketch is sent to an image-to-image model as a structural guide.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No API keys needed — Sketch to Life falls back to a built-in mock renderer.
Copy `.env.example` to `.env.local` and drop in a key to go live.

## Stack

| Piece            | Choice                                                          |
| ---------------- | --------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router) + React 19 + TypeScript                  |
| Styling          | Tailwind CSS v4                                                  |
| Drawing / mosaic | Native HTML5 Canvas 2D (no canvas library — see note below)      |
| Persistence      | JSON file under `.data/` behind a 3-function interface           |
| AI               | Pluggable providers: Replicate / fal.ai / OpenAI / mock          |

> **Why native canvas rather than react-konva/fabric?** The mosaic needs pixel-level
> `getImageData` on a mask and draws hundreds of bitmaps per frame. A retained-mode
> scene graph would allocate a node per signature and fight the animation loop for
> control. Everything here is one `<canvas>` and one `requestAnimationFrame` loop —
> and it keeps the dependency list at zero.

---

## The macro-shape algorithm

Implemented in [`src/lib/macroShape.ts`](src/lib/macroShape.ts). Four stages.

### 1. Rasterise the glyph into a binary mask

The target text is drawn into an offscreen **1200 × 620** canvas and the alpha
channel is thresholded:

```
inside(x, y) = alpha(x, y) > 128
```

Font metrics are **linear in font-size**, so the perfect fit is solved from a
single measurement rather than a binary search. Measure at a reference size
`REF = 200px`, then:

```
size = REF · min( (W · fillRatio) / refWidth ,  (H · fillRatio) / refInkHeight )
```

where `refInkHeight = actualBoundingBoxAscent + actualBoundingBoxDescent`. The text
is centred horizontally on its advance width and vertically on its *ink* box
(`y = H/2 + (ascent − descent)/2`), which is what makes digits sit optically centred
rather than sagging toward the baseline.

### 2. Lattice + coverage test

A **hexagonally-offset lattice** is walked over the mask. Every other row is shifted
by half a cell:

```
cx = (r mod 2)·cellW/2 + (c + 0.5)·cellW
cy = yPad + (r + 0.5)·cellH
```

The half-row offset matters: a plain square grid produces visible stair-steps along
the curved bowls of the `2` and `6`; the staggered rows interlock and follow a curve
far more smoothly.

Cells are **wider than they are tall** — `cellH = cellW / 2.4` — because signatures
are. A handwritten name is roughly 2.5 : 1, so with square cells a contain-fit would
leave ~65% of every slot as empty vertical space and the wall would look sparse.

A cell becomes a slot only if its **area coverage** clears a threshold:

```
coverage = (# ink samples in cell) / (# samples in cell)     sampled every 2px
keep if coverage ≥ 0.60
```

Testing *area* rather than just the centre pixel is what keeps signatures from
hanging off the edge of the glyph — a cell straddling the boundary is rejected, so
the silhouette of the `26` stays crisp.

### 3. Seeded jitter

A perfect lattice reads as a spreadsheet. Each slot gets deterministic noise from a
`mulberry32` PRNG seeded by its lattice coordinates (`r·7919 + c·104729`, both prime
so the seeds don't collide):

| Property | Range |
| -------- | ----- |
| position | ± 8% of cell width, ± 15% of cell height |
| scale    | 0.86× … 1.16× |
| rotation | ± 7.5° |

Because the seed derives from the cell's coordinates, a slot's jitter is **stable**
across re-renders, resizes and reloads — your signature never jumps.

### 4. Farthest-point ordering (the part that matters most)

Slots come out of the lattice in raster order. If you filled them that way, the
first 20 signatures would form a horizontal bar across the top of the `2` and the
shape would be unreadable until hundreds of people had signed.

Instead the slot list is re-ordered by **greedy farthest-point sampling** (Mitchell's
best-candidate). Starting from the slot nearest the centroid, repeatedly take the
slot whose distance to the *nearest already-taken slot* is maximal:

```
nearest[i] ← ∞  for all i
current  ← argmin_i ‖p_i − centroid‖
repeat:
    emit current
    for each untaken i:
        nearest[i] ← min(nearest[i], ‖p_i − p_current‖²)
    current ← argmax_i nearest[i]
```

Every prefix of the resulting list is an approximately **blue-noise** subset of the
glyph — evenly spread, no clumps, no gaps. So the `26` is legible with 10 signatures
and simply gets denser with 500. The incremental `nearest[]` cache makes this
O(n²) with a tiny constant; at a few hundred slots it is sub-millisecond.

### 5. Densification

`buildMosaic(text, minCapacity)` keeps re-running the lattice with 25% more columns
until there is at least one slot per signature (capped at 150 columns). The wall
therefore never "fills up" — it just gets finer-grained as the crowd grows, and the
result is memoised per `(text, columns)`.

### 6. Placement and the fly-in

Slots are stored in **normalised** coordinates (0…1 of the mask box), so the renderer
scales to any display width as long as it preserves the mask aspect ratio (1200:620).
For each signature:

```
fit = min(slotW / imgW, slotH / imgH) · 1.06      // contain-fit, slight overscale
```

Aspect ratio is preserved, so nobody's signature is squashed. New arrivals animate
from an 8× oversized version at the centre of the wall into their slot over 1.1s with
an ease-out-cubic curve, interpolating position, scale, rotation and opacity together.
Only signatures that arrive *after* first paint animate — otherwise loading a page
with 300 existing signatures would trigger a 300-object fly-in.

---

## Sketch to Life

`POST /api/sketch-to-life` with `{ imageDataUrl, prompt, strength }`.

Providers live in `src/lib/providers/` behind one interface:

```ts
interface SketchProvider {
  name: string;
  isConfigured(): boolean;
  run(req: SketchToLifeRequest): Promise<{ imageUrl: string }>;
}
```

Selection order (`src/lib/providers/index.ts`): explicit `SKETCH_PROVIDER` env var →
first provider with a key present → **mock**. So the app runs with zero configuration
and goes live the moment you add a key.

| Provider    | Env                                              | Notes                                   |
| ----------- | ------------------------------------------------ | --------------------------------------- |
| `replicate` | `REPLICATE_API_TOKEN`, `REPLICATE_MODEL_VERSION` | ControlNet Scribble; create-then-poll   |
| `fal`       | `FAL_KEY`, `FAL_MODEL`                           | Synchronous, one round trip             |
| `openai`    | `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`           | `images/edits`, multipart, returns b64  |
| `mock`      | —                                                | SVG filter chain, watermarked, ~1.6s    |

All three real providers accept the sketch as a data URL / inline PNG, so there is no
upload step to build.

## API

| Route                    | Method   | Purpose                                     |
| ------------------------ | -------- | ------------------------------------------- |
| `/api/signatures`        | `GET`    | List every signature                        |
| `/api/signatures`        | `POST`   | Add one (`dataUrl`, `width`, `height`, …)   |
| `/api/signatures`        | `DELETE` | Reset the wall (dev convenience)            |
| `/api/sketch-to-life`    | `GET`    | Which provider is active                    |
| `/api/sketch-to-life`    | `POST`   | Generate                                    |

The client polls `GET /api/signatures` every 5s, so a second browser tab's signature
shows up on the wall without a refresh. Swap the poll for SSE/WebSocket when you want
it instant.

## Where to go next

- **Storage** — `src/lib/store.ts` is deliberately three functions. Point `load`/`save`
  at Postgres + S3 (store PNGs as blobs, not base64 in a JSON column) for production.
- **Shapes** — `buildMosaic` takes any string. Pass an SVG path or a logo PNG into
  `rasteriseShape` instead of `fillText` and everything downstream works unchanged.
- **Moderation** — queue submissions and gate them before they land on the wall.
- **Rate limiting** — `POST /api/signatures` is currently open.
