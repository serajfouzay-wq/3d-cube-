import * as THREE from 'three';
import { DUST_VERT, DUST_FRAG } from './shaders.js';
import { SYSTEM } from '../core/config.js';
import { store } from '../core/store.js';
import { makeRandom } from '../core/math.js';

/**
 * Ambient dust — motes suspended through the volume the camera moves in.
 * Displacement happens entirely in the vertex shader from a per-mote phase, so
 * there is no per-frame CPU buffer upload no matter how many there are.
 */
export class Dust {
  constructor(stage) {
    this.stage = stage;
    const count = SYSTEM.dustCount[store.quality] || SYSTEM.dustCount.high;
    const rand = makeRandom(9931);

    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Disc-biased distribution: dense near the orbital plane, sparse above.
      const r = 2.5 + Math.pow(rand(), 0.7) * 16;
      const a = rand() * Math.PI * 2;
      positions[i * 3]     = Math.cos(a) * r;
      positions[i * 3 + 1] = (rand() - 0.5) * 6 * (1 - r / 24);
      positions[i * 3 + 2] = Math.sin(a) * r;
      sizes[i] = 0.5 + rand() * 1.5;
      phases[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: {
        uTime:       { value: 0 },
        uPixelRatio: { value: stage.renderer.getPixelRatio() },
        uColor:      { value: new THREE.Color('#a8c8ff').convertSRGBToLinear() },
        uOpacity:    { value: 0.2 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    stage.scene.add(this.points);
  }

  update(dt, elapsed) {
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uPixelRatio.value = this.stage.renderer.getPixelRatio();
    this.points.rotation.y += dt * 0.006;
  }

  dispose() { this.points.geometry.dispose(); this.material.dispose(); }
}

/**
 * Burst emitter — the shower of sparks thrown off when a world is selected or
 * a scan completes.
 *
 * One pre-allocated pool of particles is reused for every burst; nothing is
 * constructed at interaction time, because allocating a BufferGeometry inside a
 * click handler is exactly how you get a hitch on the frame the user is
 * judging your responsiveness by.
 */
export class BurstField {
  constructor(stage, capacity = 320) {
    this.stage = stage;
    this.capacity = capacity;
    this.cursor = 0;

    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);      // seconds remaining
    this.maxLife = new Float32Array(capacity);
    this.sizes = new Float32Array(capacity);
    this.colors = new Float32Array(capacity * 3);

    // Park unused particles far off-screen rather than paying for a discard.
    this.positions.fill(9999);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: stage.renderer.getPixelRatio() } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        uniform float uPixelRatio;
        varying vec3 vColor;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (300.0 / max(-mv.z, 0.001));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        void main(){
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          float a = pow(1.0 - r * 2.0, 2.0);
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    stage.scene.add(this.points);
  }

  /**
   * @param origin  THREE.Vector3 world position
   * @param color   THREE.Color (already linear)
   * @param count   how many sparks
   * @param speed   base outward speed
   */
  emit(origin, color, count = 60, speed = 2.4) {
    if (store.reduceMotion) count = Math.min(count, 16);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;

      const i3 = i * 3;
      this.positions[i3] = origin.x;
      this.positions[i3 + 1] = origin.y;
      this.positions[i3 + 2] = origin.z;

      // Random direction on a sphere, biased outward in the orbital plane.
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + Math.random() * 0.9);
      this.velocities[i3] = s * Math.cos(t) * v;
      this.velocities[i3 + 1] = u * v * 0.55;
      this.velocities[i3 + 2] = s * Math.sin(t) * v;

      const life = 0.65 + Math.random() * 0.85;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.sizes[i] = 1.4 + Math.random() * 2.6;

      const tint = 0.75 + Math.random() * 0.45;
      this.colors[i3] = color.r * tint;
      this.colors[i3 + 1] = color.g * tint;
      this.colors[i3 + 2] = color.b * tint;
    }
  }

  update(dt) {
    let alive = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      alive = true;
      this.life[i] -= dt;
      const i3 = i * 3;

      if (this.life[i] <= 0) {
        this.positions[i3] = this.positions[i3 + 1] = this.positions[i3 + 2] = 9999;
        this.sizes[i] = 0;
        continue;
      }

      // Drag makes the sparks decelerate — they read as matter, not tracers.
      const drag = Math.exp(-2.6 * dt);
      this.velocities[i3] *= drag;
      this.velocities[i3 + 1] *= drag;
      this.velocities[i3 + 2] *= drag;

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      const k = this.life[i] / this.maxLife[i];
      this.sizes[i] = (1.4 + k * 2.6) * k;
    }

    if (alive) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
    }
    this.material.uniforms.uPixelRatio.value = this.stage.renderer.getPixelRatio();
  }

  dispose() { this.geo.dispose(); this.material.dispose(); }
}
