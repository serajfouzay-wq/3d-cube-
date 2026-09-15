/**
 * MACRO-SHAPE ENGINE
 * ------------------
 * Turns any glyph ("26") into an ordered list of slots that individual
 * signatures get dropped into. Four stages:
 *
 *   1. RASTERISE  draw the text into an offscreen canvas, read the alpha channel
 *                 -> a binary mask `inside(x, y)`.
 *   2. LATTICE    walk a hexagonally-offset square lattice over the mask and keep
 *                 every cell whose *area coverage* passes a threshold.
 *   3. JITTER     perturb position / rotation / scale with a seeded PRNG so the
 *                 result reads as a hand-made collage, not a spreadsheet.
 *   4. ORDER      re-order the slots by farthest-point (Mitchell best-candidate)
 *                 sampling, so the first N signatures spread evenly across the
 *                 whole glyph instead of filling it left-to-right.
 *
 * Everything is stored in NORMALISED coordinates (0..1 of the mask box), so the
 * renderer can scale to any display size as long as it keeps MASK_ASPECT.
 */

export const MASK_W = 1200;
export const MASK_H = 620;
export const MASK_ASPECT = MASK_W / MASK_H;

export type Slot = {
  index: number;
  /** Slot centre, normalised to the mask box. */
  x: number;
  y: number;
  /** Slot box, normalised to mask width / height respectively. */
  w: number;
  h: number;
  rotation: number;
  /** Local ink coverage 0..1 — used to fade edge slots slightly. */
  coverage: number;
};

export type Mosaic = {
  slots: Slot[];
  columns: number;
  /** Raw mask, kept so the renderer can paint a ghost outline of the glyph. */
  mask: Uint8Array;
};

const FONT_STACK = `"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;

/* ------------------------------------------------------------------ *
 * 1. RASTERISE
 * ------------------------------------------------------------------ */

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Renders `text` as large as it will go inside the mask box and returns a
 * 1-byte-per-pixel alpha mask (255 = ink).
 */
export function rasteriseShape(text: string, fillRatio = 0.86): Uint8Array {
  const canvas = createCanvas(MASK_W, MASK_H);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Measure at a reference size, then scale linearly: font metrics are linear in
  // font-size, so one measurement is enough to solve for the perfect fit.
  const REF = 200;
  ctx.font = `900 ${REF}px ${FONT_STACK}`;
  const ref = ctx.measureText(text);
  const refW = ref.width;
  const refH = ref.actualBoundingBoxAscent + ref.actualBoundingBoxDescent;
  const size = REF * Math.min((MASK_W * fillRatio) / refW, (MASK_H * fillRatio) / refH);

  ctx.font = `900 ${size}px ${FONT_STACK}`;
  const m = ctx.measureText(text);
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // Horizontally centre on the advance width, vertically centre on the *ink* box.
  ctx.fillText(text, (MASK_W - m.width) / 2, MASK_H / 2 + (ascent - descent) / 2);

  const { data } = ctx.getImageData(0, 0, MASK_W, MASK_H);
  const mask = new Uint8Array(MASK_W * MASK_H);
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) mask[i] = data[p] > 128 ? 255 : 0;
  return mask;
}

/* ------------------------------------------------------------------ *
 * 2 + 3. LATTICE + JITTER
 * ------------------------------------------------------------------ */

/** Deterministic PRNG so a slot never changes shape between renders. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COVERAGE_THRESHOLD = 0.6; // keep a cell only if 60% of it is inside the glyph
const SAMPLE_STEP = 2; // sample every 2px when measuring coverage (4x cheaper)

/**
 * Cells are wider than tall because signatures are: a handwritten name is roughly
 * 2.5:1. Square cells would leave two thirds of every slot empty once the drawing
 * is contain-fitted, and the wall would look sparse.
 */
const SLOT_ASPECT = 2.4;

function latticeSlots(mask: Uint8Array, columns: number): Slot[] {
  const cellW = MASK_W / columns;
  const cellH = cellW / SLOT_ASPECT;
  const rows = Math.floor(MASK_H / cellH);
  const yPad = (MASK_H - rows * cellH) / 2;
  const halfW = cellW / 2;
  const halfH = cellH / 2;
  const slots: Slot[] = [];

  for (let r = 0; r < rows; r++) {
    // Offset every other row by half a cell -> hexagonal packing, which tiles a
    // curved outline (the "2" and "6" bowls) far better than a square grid.
    const xOffset = (r % 2) * halfW;
    for (let c = 0; c < columns; c++) {
      const cx = xOffset + (c + 0.5) * cellW;
      const cy = yPad + (r + 0.5) * cellH;

      const x0 = Math.max(0, Math.round(cx - halfW));
      const x1 = Math.min(MASK_W - 1, Math.round(cx + halfW));
      const y0 = Math.max(0, Math.round(cy - halfH));
      const y1 = Math.min(MASK_H - 1, Math.round(cy + halfH));

      let hits = 0;
      let total = 0;
      for (let y = y0; y <= y1; y += SAMPLE_STEP) {
        const row = y * MASK_W;
        for (let x = x0; x <= x1; x += SAMPLE_STEP) {
          total++;
          if (mask[row + x]) hits++;
        }
      }
      if (!total) continue;
      const coverage = hits / total;
      if (coverage < COVERAGE_THRESHOLD) continue;

      const rand = mulberry32(r * 7919 + c * 104729);
      const jx = (rand() - 0.5) * cellW * 0.16;
      const jy = (rand() - 0.5) * cellH * 0.3;
      const scale = 0.86 + rand() * 0.3; // 0.86x .. 1.16x
      const rotation = (rand() - 0.5) * 0.26; // about +/- 7.5 degrees

      slots.push({
        index: slots.length,
        x: (cx + jx) / MASK_W,
        y: (cy + jy) / MASK_H,
        w: (cellW * scale) / MASK_W,
        h: (cellH * scale) / MASK_H,
        rotation,
        coverage,
      });
    }
  }
  return slots;
}

/* ------------------------------------------------------------------ *
 * 4. ORDER
 * ------------------------------------------------------------------ */

/**
 * Greedy farthest-point ordering. Starting from the slot nearest the centroid we
 * repeatedly take the slot whose distance to the *nearest already-taken slot* is
 * largest. The prefix of the resulting list is always a well-spread (blue-noise)
 * subset, so with 10 signatures the "26" is legible everywhere rather than being
 * a solid blob in one corner. O(n^2) with an incremental nearest-distance cache,
 * which is nothing for the few thousand slots we deal with.
 */
function farthestPointOrder(slots: Slot[]): Slot[] {
  const n = slots.length;
  if (n < 3) return slots;

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    // Work in mask pixels so x and y are on the same metric scale.
    xs[i] = slots[i].x * MASK_W;
    ys[i] = slots[i].y * MASK_H;
    sx += xs[i];
    sy += ys[i];
  }
  sx /= n;
  sy /= n;

  let current = 0;
  let bestCentre = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (xs[i] - sx) ** 2 + (ys[i] - sy) ** 2;
    if (d < bestCentre) {
      bestCentre = d;
      current = i;
    }
  }

  const nearest = new Float64Array(n).fill(Infinity);
  const taken = new Uint8Array(n);
  const order: Slot[] = [];

  for (let k = 0; k < n; k++) {
    taken[current] = 1;
    order.push(slots[current]);
    const cx = xs[current];
    const cy = ys[current];

    let next = -1;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      if (taken[i]) continue;
      const d = (xs[i] - cx) ** 2 + (ys[i] - cy) ** 2;
      if (d < nearest[i]) nearest[i] = d;
      if (nearest[i] > bestD) {
        bestD = nearest[i];
        next = i;
      }
    }
    if (next === -1) break;
    current = next;
  }

  return order.map((slot, index) => ({ ...slot, index }));
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

const BASE_COLUMNS = 26;
const MAX_COLUMNS = 150;

const cache = new Map<string, Mosaic>();

/**
 * Builds the mosaic for `text`, densifying the lattice until there is at least
 * one slot per signature (so the wall never runs out of room — it just gets
 * finer-grained as the crowd grows).
 */
export function buildMosaic(text: string, minCapacity: number): Mosaic {
  const mask = rasteriseShape(text);
  let columns = BASE_COLUMNS;
  let slots = latticeSlots(mask, columns);

  while (slots.length < minCapacity && columns < MAX_COLUMNS) {
    columns = Math.min(MAX_COLUMNS, Math.round(columns * 1.25));
    slots = latticeSlots(mask, columns);
  }

  const key = `${text}@${columns}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const mosaic: Mosaic = { slots: farthestPointOrder(slots), columns, mask };
  cache.set(key, mosaic);
  return mosaic;
}
