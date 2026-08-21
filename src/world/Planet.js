import * as THREE from 'three';
import {
  PLANET_VERT, PLANET_FRAG, ATMO_VERT, ATMO_FRAG, RING_VERT, RING_FRAG,
} from './shaders.js';
import { Spring, damp } from '../core/math.js';
import { store } from '../core/store.js';

const _v = new THREE.Vector3();

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Planet — one world
 * ═══════════════════════════════════════════════════════════════════════
 *  Composition (all parented to `pivot` so orbital motion is one rotation):
 *
 *    pivot ──▶ anchor (orbital radius offset)
 *               ├── body      procedural surface, raycast target
 *               ├── atmo      back-faced additive fresnel shell
 *               ├── ring      optional, shader-carved debris
 *               └── halo      camera-facing sprite for distant glow
 *
 *  Hover and focus are Springs rather than lerps. That is the whole reason
 *  the worlds feel like they have mass: they lead into the motion, overshoot
 *  by a hair, and settle — instead of easing to a dead stop.
 */
export class Planet {
  constructor(cfg, index, quality = 'high') {
    this.cfg = cfg;
    this.index = index;

    const pal = cfg.palette;
    const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();

    this.pivot = new THREE.Group();
    this.anchor = new THREE.Group();
    this.anchor.position.set(cfg.orbit.radius, 0, 0);
    this.pivot.rotation.y = cfg.orbit.phase;
    this.pivot.rotation.z = cfg.orbit.inclination;
    this.pivot.add(this.anchor);

    /* ── Body ── */
    const seg = quality === 'high' ? 96 : quality === 'medium' ? 64 : 40;
    this.bodyMat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: {
        uTime:        { value: Math.random() * 500 },
        uDeep:        { value: col(pal.deep) },
        uBase:        { value: col(pal.base) },
        uAccent:      { value: col(pal.accent) },
        uAtmo:        { value: col(pal.atmo) },
        uLightDir:    { value: new THREE.Vector3(-0.55, 0.34, 0.76).normalize() },
        uNoiseScale:  { value: cfg.surface.noiseScale },
        uRidges:      { value: cfg.surface.ridges },
        uLandLevel:   { value: cfg.surface.landLevel },
        uBands:       { value: cfg.surface.bands },
        uNightLights: { value: cfg.surface.nightLights },
        uRoughness:   { value: cfg.surface.roughness },
        uType:        { value: cfg.surface.type },
        uHover:       { value: 0 },
        uFocus:       { value: 0 },
        uScan:        { value: 0 },
      },
    });

    this.body = new THREE.Mesh(new THREE.SphereGeometry(cfg.orbit.size, seg, seg / 2), this.bodyMat);
    this.body.rotation.x = cfg.orbit.tiltX;
    this.body.rotation.z = cfg.orbit.tiltZ;
    // Interaction resolves picks back to the Planet through this reference.
    this.body.userData.planet = this;
    this.anchor.add(this.body);

    /* ── Atmosphere ── */
    this.atmoMat = new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: {
        uAtmo:      { value: col(pal.atmo) },
        uLightDir:  { value: this.bodyMat.uniforms.uLightDir.value },
        uIntensity: { value: 0.5 },
        uPower:     { value: 3.0 },
      },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.orbit.size * 1.19, seg / 2, seg / 4),
      this.atmoMat
    );
    this.anchor.add(this.atmo);

    /* ── Ring (only worlds that declare one) ── */
    if (cfg.ring) {
      this.ringMat = new THREE.ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        uniforms: {
          uColor:   { value: col(cfg.ring.color) },
          uAccent:  { value: col(pal.accent) },
          uTime:    { value: 0 },
          uInner:   { value: cfg.ring.inner },
          uOuter:   { value: cfg.ring.outer },
          uOpacity: { value: cfg.ring.opacity },
        },
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const rg = new THREE.RingGeometry(
        cfg.orbit.size * cfg.ring.inner,
        cfg.orbit.size * cfg.ring.outer,
        128, 1
      );
      // RingGeometry's default uv is a square projection; remap uv.x to the
      // normalised radius so the shader can carve bands by distance.
      const pos = rg.attributes.position;
      const uv = rg.attributes.uv;
      const rIn = cfg.orbit.size * cfg.ring.inner;
      const rOut = cfg.orbit.size * cfg.ring.outer;
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i);
        const r = (_v.length() - rIn) / (rOut - rIn);
        uv.setX(i, r);
        uv.setY(i, (Math.atan2(_v.y, _v.x) + Math.PI) / (Math.PI * 2));
      }
      uv.needsUpdate = true;

      this.ring = new THREE.Mesh(rg, this.ringMat);
      this.ring.rotation.x = Math.PI / 2 + cfg.ring.tilt;
      this.anchor.add(this.ring);
    }

    /* ── Distance halo ── */
    this.haloMat = new THREE.SpriteMaterial({
      color: col(pal.atmo),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: makeGlowTexture(),
    });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(cfg.orbit.size * 3.4);
    this.halo.renderOrder = -5;
    this.anchor.add(this.halo);

    /* ── Springs ── */
    this.hoverSpring = new Spring(0, 170, 16);
    this.focusSpring = new Spring(0, 55, 13);
    this.scale = new Spring(1, 90, 14);
    this.scanValue = 0;
    this.scanTarget = 0;

    this.baseRadius = cfg.orbit.size;
    this.worldPos = new THREE.Vector3();
  }

  setHover(on) { this.hoverSpring.target = on ? 1 : 0; }
  setFocus(on) { this.focusSpring.target = on ? 1 : 0; }
  setScan(t)   { this.scanTarget = t; }

  update(dt, elapsed) {
    const hover = this.hoverSpring.step(dt);
    const focus = this.focusSpring.step(dt);
    this.scanValue = damp(this.scanValue, this.scanTarget, 9, dt);

    // Hovering grows the world ~7%, focusing ~26% — enough to register as
    // physical response without breaking the orbital spacing.
    this.scale.target = 1 + hover * 0.07 + focus * 0.26;
    const s = this.scale.step(dt);
    this.body.scale.setScalar(s);
    this.atmo.scale.setScalar(s);
    if (this.ring) this.ring.scale.setScalar(s);

    const u = this.bodyMat.uniforms;
    u.uTime.value = elapsed;
    u.uHover.value = hover;
    u.uFocus.value = focus;
    u.uScan.value = this.scanValue;

    // Axial spin. Hovering spins the world up slightly — a small tell that
    // the object is live and responding to the cursor.
    const spinScale = store.reduceMotion ? 0.25 : 1;
    this.body.rotation.y += dt * this.cfg.surface.spin * (1 + hover * 0.85) * spinScale;
    this.atmo.rotation.y = this.body.rotation.y * 0.4;

    this.atmoMat.uniforms.uIntensity.value = 0.5 + hover * 0.34 + focus * 0.38 + this.scanValue * 0.5;
    this.haloMat.opacity = 0.16 + hover * 0.22 + focus * 0.26;
    this.halo.scale.setScalar(this.baseRadius * (3.4 + hover * 0.7 + focus * 1.3));

    if (this.ringMat) {
      this.ringMat.uniforms.uTime.value = elapsed;
      this.ringMat.uniforms.uOpacity.value =
        this.cfg.ring.opacity * (1 + hover * 0.35 + focus * 0.4);
      this.ring.rotation.z += dt * 0.02 * spinScale;
    }

    this.body.getWorldPosition(this.worldPos);
  }

  /** Effective on-screen radius, used by the label layer for collision. */
  get radius() { return this.baseRadius * this.scale.value; }

  dispose() {
    this.body.geometry.dispose(); this.bodyMat.dispose();
    this.atmo.geometry.dispose(); this.atmoMat.dispose();
    this.ring?.geometry.dispose(); this.ringMat?.dispose();
    this.haloMat.map?.dispose(); this.haloMat.dispose();
  }
}

/** Radial-gradient sprite, generated once and shared by every halo. */
let _glowTex = null;
function makeGlowTexture() {
  if (_glowTex) return _glowTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.34)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.07)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}
