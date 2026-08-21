import * as THREE from 'three';
import { Planet } from './Planet.js';
import { WORLDS, SYSTEM } from '../core/config.js';
import { store } from '../core/store.js';
import { damp, angleDelta, clamp } from '../core/math.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  System — the orbital rig
 * ═══════════════════════════════════════════════════════════════════════
 *  The whole catalog lives on one Group rotating about Y. Rather than
 *  setting that rotation directly, input adds *angular velocity* and the
 *  rig integrates it against friction. Consequences that matter for feel:
 *
 *    • a flick keeps spinning and bleeds off, so the system has inertia;
 *    • the same velocity term drives idle drift, so there is no visible
 *      seam between "auto-rotating" and "user is dragging";
 *    • when velocity drops below a threshold the rig is pulled toward the
 *      nearest world (a magnetic detent), so it always parks on something
 *      rather than halting at a meaningless angle.
 */
export class System {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    stage.scene.add(this.group);

    this.planets = WORLDS.map((cfg, i) => {
      const p = new Planet(cfg, i, store.quality);
      p.bodyMat.uniforms.uLightDir.value.copy(stage.starDirection);
      this.group.add(p.pivot);
      return p;
    });

    this.pickTargets = this.planets.map((p) => p.body);

    this.angle = 0;
    this.velocity = SYSTEM.orbitSpeed;
    this.autoSpeed = SYSTEM.orbitSpeed;
    this.dragging = false;
    /** Flat [t0, a0, t1, a1, …] ring of recent drag samples. */
    this._dragSamples = [];
    this.detentEnabled = true;

    this._buildOrbitPaths();
    this._buildStar();
  }

  /** Faint elliptical guides so the orbital structure is legible at a glance. */
  _buildOrbitPaths() {
    this.paths = new THREE.Group();
    this.group.add(this.paths);

    for (const cfg of WORLDS) {
      const pts = [];
      const segs = 256;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * cfg.orbit.radius, 0, Math.sin(a) * cfg.orbit.radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(cfg.palette.atmo).convertSRGBToLinear(),
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.rotation.z = cfg.orbit.inclination;
      line.userData.baseOpacity = 0.05;
      this.paths.add(line);
    }
  }

  /** The system's star: a small emissive core plus two additive glow sprites. */
  _buildStar() {
    this.star = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 48, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4dc').convertSRGBToLinear() })
    );
    this.star.add(core);
    this.starCore = core;

    const glowTex = radialSprite();
    for (const [scale, opacity, tint] of [[16, 0.55, '#ffd9a0'], [42, 0.2, '#7cc4ff']]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(tint).convertSRGBToLinear(),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      s.scale.setScalar(scale);
      this.star.add(s);
    }
    // Sits where the key light comes from, so the lighting reads as sourced.
    // Well outside the outermost orbit (NUUR sits at 8.6) — a star inside
    // the system would render between the worlds.
    this.star.position.copy(this.stage.starDirection).multiplyScalar(46);
    this.stage.scene.add(this.star);

    this.starLight = new THREE.PointLight(0xffd9a0, 210, 140, 2);
    this.starLight.position.copy(this.star.position);
    this.stage.scene.add(this.starLight);
  }

  /**
   * Angle, in rig space, that brings world `index` to the front of camera.
   * Reads the pivot's live rotation rather than the configured phase — each
   * world advances along its own orbit every frame, so the config value goes
   * stale within seconds of load.
   */
  angleForIndex(index) {
    const p = this.planets[index];
    if (!p) return this.angle;
    return -p.pivot.rotation.y + Math.PI * 0.5;
  }

  /**
   * Called by Interaction on every pointer move while dragging.
   * @param dxPixels horizontal pointer travel since the last move event
   *
   * The rotation is applied immediately (the system must track the finger
   * 1:1 — any smoothing here reads as lag), and the same delta is banked so
   * update() can convert it into an angular velocity for the release.
   */
  drag(dxPixels) {
    const delta = dxPixels * SYSTEM.dragSensitivity;
    this.angle += delta;

    // Bank a timestamped sample. Velocity is measured over a short trailing
    // window at release rather than per animation frame, because pointer
    // events and frames do not line up: browsers coalesce moves, and a frame
    // that happens to land between two events would otherwise read as "the
    // user stopped" and throw away the throw.
    const now = performance.now();
    this._dragSamples.push(now, this.angle);
    const cutoff = now - SYSTEM.flingWindow;
    while (this._dragSamples.length > 4 && this._dragSamples[0] < cutoff) {
      this._dragSamples.splice(0, 2);
    }
  }

  /**
   * Ends a drag and converts the trailing sample window into angular velocity.
   * A slow drag releases nearly dead; a flick keeps spinning and bleeds off
   * through the friction term in update().
   */
  releaseDrag() {
    const s = this._dragSamples;
    let v = 0;
    if (s.length >= 4) {
      const dt = (s[s.length - 2] - s[0]) / 1000;
      if (dt > 0.008) v = (s[s.length - 1] - s[1]) / dt;
    }
    this.velocity = clamp(v, -7, 7);
    this._dragSamples.length = 0;
    this.dragging = false;
    return this.velocity;
  }

  update(dt, elapsed) {
    const focused = store.view === 'focus' && store.focusIndex >= 0;

    if (this.dragging) {
      // The pointer owns the angle outright while it is down; velocity is
      // computed from the sample window in releaseDrag(), not here.
    } else if (focused) {
      // Focused: ease the rig so the chosen world sits front-of-camera.
      const target = this.angleForIndex(store.focusIndex);
      const delta = angleDelta(this.angle, target);
      this.velocity = damp(this.velocity, 0, 7, dt);
      this.angle += delta * (1 - Math.exp(-3.4 * dt));
    } else {
      const friction = Math.exp(-SYSTEM.dragFriction * dt);
      this.velocity = (this.velocity - this.autoSpeed) * friction + this.autoSpeed;

      // Magnetic detent — only once the flick has mostly bled off, otherwise
      // it would fight the user's momentum.
      if (this.detentEnabled && Math.abs(this.velocity - this.autoSpeed) < SYSTEM.detentThreshold) {
        let best = 0, bestAbs = Infinity;
        for (let i = 0; i < this.planets.length; i++) {
          const d = angleDelta(this.angle, this.angleForIndex(i));
          if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = d; }
        }
        this.velocity += best * SYSTEM.detentStrength * dt * 4;
      }
    }

    if (!focused && !this.dragging) this.angle += this.velocity * dt;
    this.group.rotation.y = this.angle;

    // Individual worlds also advance along their own orbits, at rates scaled
    // from their configured periods — the system is never static.
    for (const p of this.planets) {
      if (!focused) {
        const rate = (SYSTEM.orbitSpeed * 260) / p.cfg.stats.period;
        p.pivot.rotation.y += dt * rate * (store.reduceMotion ? 0.3 : 1);
      }
      p.update(dt, elapsed);
    }

    // Orbit guides brighten for the hovered / focused world only.
    this.paths.children.forEach((line, i) => {
      const lit = i === store.hoverIndex || i === store.focusIndex;
      // Guides are an overview affordance. In focus view they only cross the
      // frame behind the world and read as stray scratches, so they retire.
      const target = focused ? (lit ? 0.08 : 0.012) : (lit ? 0.26 : 0.05);
      line.material.opacity = damp(line.material.opacity, target, 6, dt);
    });

    const pulse = store.reduceMotion ? 1 : 1 + Math.sin(elapsed * 1.4) * 0.035;
    this.starCore.scale.setScalar(pulse);
    this.starLight.intensity = 210 * pulse;
  }

  /** World-space position of a planet, for the HTML label projection. */
  positionOf(index) { return this.planets[index].worldPos; }

  dispose() {
    this.planets.forEach((p) => p.dispose());
    this.paths.children.forEach((l) => { l.geometry.dispose(); l.material.dispose(); });
  }
}

let _sprite = null;
function radialSprite() {
  if (_sprite) return _sprite;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _sprite = new THREE.CanvasTexture(c);
  _sprite.colorSpace = THREE.SRGBColorSpace;
  return _sprite;
}
