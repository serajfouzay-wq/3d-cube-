/**
 * Frame-rate independent easing + spring helpers.
 * Every animated value in the experience goes through one of these so the
 * motion feels identical at 30fps, 60fps and 144fps.
 */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const saturate = (v) => clamp(v, 0, 1);

/** Exponential smoothing that is stable across variable frame times. */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Vector3-flavoured damp (mutates `out`). */
export function dampVec3(out, target, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  out.x = lerp(out.x, target.x, t);
  out.y = lerp(out.y, target.y, t);
  out.z = lerp(out.z, target.z, t);
  return out;
}

export const smoothstep = (edge0, edge1, x) => {
  const t = saturate((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * A damped harmonic oscillator. This is what gives the planets their weight:
 * they overshoot slightly and settle, instead of linearly lerping into place.
 * `stiffness` controls how eager it is, `damping` how much it fights momentum.
 */
export class Spring {
  constructor(value = 0, stiffness = 120, damping = 18) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  set(value) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    return this;
  }

  /** Sub-stepped semi-implicit Euler — stays stable even on a 200ms hitch. */
  step(dt) {
    const steps = Math.max(1, Math.min(8, Math.ceil(dt / (1 / 120))));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = (this.target - this.value) * this.stiffness;
      this.velocity += (force - this.velocity * this.damping) * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  get settled() {
    return Math.abs(this.target - this.value) < 1e-4 && Math.abs(this.velocity) < 1e-3;
  }
}

/** Shortest signed angular distance between two radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const randRange = (min, max) => min + Math.random() * (max - min);

/** Deterministic pseudo-random so particle layouts are reproducible. */
export function makeRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
