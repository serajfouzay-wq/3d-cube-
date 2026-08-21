import * as THREE from 'three';
import { STAR_VERT, STAR_FRAG } from './shaders.js';
import { SYSTEM } from '../core/config.js';
import { store } from '../core/store.js';
import { makeRandom } from '../core/math.js';

/**
 * Three parallax shells of stars. Splitting them apart (rather than one big
 * cloud) means the near layer can counter-rotate slightly against the far one,
 * which is what sells depth when the camera only moves a couple of units.
 *
 * Colours are drawn from a rough stellar-class distribution — mostly white and
 * pale gold with a scattering of blue and red — because a uniformly cyan
 * starfield is the single most common tell of a hobby WebGL scene.
 */
const CLASSES = [
  { color: '#9bb8ff', weight: 0.06 },  // blue giants
  { color: '#dfe8ff', weight: 0.20 },  // white
  { color: '#fff6e8', weight: 0.42 },  // sun-like
  { color: '#ffd9a8', weight: 0.22 },  // amber
  { color: '#ff9f7a', weight: 0.10 },  // red dwarfs
];

export class Starfield {
  constructor(stage) {
    this.stage = stage;
    this.layers = [];

    const total = SYSTEM.starCount[store.quality] || SYSTEM.starCount.high;
    const rand = makeRandom(20260821);

    // Radii are chosen so even the nearest shell is far outside the orbits
    // (the camera works between ~8 and ~26 units out). Sizes are in the
    // 0.4–1.6 range: with size attenuation these land at 1–4 device pixels,
    // which is what a star should be.
    const specs = [
      { count: Math.round(total * 0.52), radius: 320, size: [0.4, 1.0], drift: 0.003,  twinkle: 0.5 },
      { count: Math.round(total * 0.33), radius: 210, size: [0.5, 1.3], drift: -0.007, twinkle: 0.75 },
      { count: Math.round(total * 0.15), radius: 140, size: [0.7, 1.6], drift: 0.013,  twinkle: 1.0 },
    ];

    for (const spec of specs) {
      this.layers.push(this._makeLayer(spec, rand));
    }
  }

  _makeLayer(spec, rand) {
    const { count, radius, size } = spec;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    const palette = CLASSES.map((c) => new THREE.Color(c.color).convertSRGBToLinear());
    const cdf = [];
    let acc = 0;
    for (const c of CLASSES) { acc += c.weight; cdf.push(acc); }

    for (let i = 0; i < count; i++) {
      // Uniform on a sphere shell (rejection-free, no polar clustering).
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = radius * (0.72 + rand() * 0.28);
      const s = Math.sqrt(1 - u * u);
      positions[i * 3]     = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u * 0.68;   // flatten toward a galactic plane
      positions[i * 3 + 2] = r * s * Math.sin(theta);

      const pick = rand();
      let ci = 0;
      while (ci < cdf.length - 1 && pick > cdf[ci]) ci++;
      const col = palette[ci];
      // Slight per-star brightness jitter keeps the field from looking flat.
      const b = 0.42 + rand() * 0.58;
      colors[i * 3] = col.r * b; colors[i * 3 + 1] = col.g * b; colors[i * 3 + 2] = col.b * b;

      sizes[i] = size[0] + rand() * (size[1] - size[0]);
      phases[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: {
        uTime:       { value: 0 },
        uPixelRatio: { value: this.stage.renderer.getPixelRatio() },
        uTwinkle:    { value: store.reduceMotion ? 0 : spec.twinkle },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.userData.drift = spec.drift;
    this.stage.scene.add(points);
    return points;
  }

  update(dt, elapsed) {
    for (const layer of this.layers) {
      layer.material.uniforms.uTime.value = elapsed;
      layer.material.uniforms.uPixelRatio.value = this.stage.renderer.getPixelRatio();
      layer.rotation.y += dt * layer.userData.drift;
    }
  }

  dispose() {
    for (const l of this.layers) { l.geometry.dispose(); l.material.dispose(); }
  }
}
