import * as THREE from 'three';
import { CAMERA } from '../core/config.js';
import { store } from '../core/store.js';
import { Spring, damp, clamp } from '../core/math.js';

const _v = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  CameraRig — every camera move in the experience
 * ═══════════════════════════════════════════════════════════════════════
 *  The camera never has its position assigned directly. Three springs (x, y, z)
 *  chase a target derived from the current view state, and a separately damped
 *  look-at point trails them. Because the look-at lags the position slightly,
 *  flying to a world produces a natural arc and a beat of settle at the end,
 *  instead of the rigid dolly you get from lerping both together.
 *
 *  Layered on top, in order of application:
 *    · pointer parallax  — a small counter-move, damped, never springy
 *    · scroll zoom       — changes the overview dolly distance
 *    · impact shake      — decaying noise offset for scan completion
 */
export class CameraRig {
  constructor(stage, system) {
    this.stage = stage;
    this.system = system;
    this.camera = stage.camera;

    const [ox, oy, oz] = CAMERA.overview.position;
    const { stiffness, damping } = CAMERA.spring;
    this.px = new Spring(ox, stiffness, damping);
    this.py = new Spring(oy, stiffness, damping);
    this.pz = new Spring(oz, stiffness, damping);

    this.lookAt = new THREE.Vector3(...CAMERA.overview.target);
    this.lookTarget = this.lookAt.clone();

    this.dolly = Math.hypot(ox, oy, oz);
    this.dollyTarget = this.dolly;

    this.parallax = new THREE.Vector2();
    this.shake = 0;
    this.transitioning = false;
  }

  /** Wheel / pinch — only meaningful in overview. */
  zoom(deltaY) {
    if (store.view === 'focus') return;
    this.dollyTarget = clamp(
      this.dollyTarget + Math.sign(deltaY) * CAMERA.zoom.step,
      CAMERA.zoom.min,
      CAMERA.zoom.max
    );
  }

  addShake(amount) {
    if (store.reduceMotion) return;
    this.shake = Math.min(1.2, this.shake + amount);
  }

  /** Called on every view change; also fires the grade pass' warp flash. */
  onViewChange() {
    this.transitioning = true;
    this.stage.triggerFlash(store.view === 'focus' ? 0.32 : 0.18);
  }

  _overviewTarget(out) {
    const [ox, oy, oz] = CAMERA.overview.position;
    const base = new THREE.Vector3(ox, oy, oz).normalize().multiplyScalar(this.dolly);
    return out.copy(base);
  }

  /**
   * Focus target: sit off the world's shoulder, on the side facing the star,
   * so the lit hemisphere and the terminator are both in frame. Distance
   * scales with the world's radius — the gas giant needs more room than the
   * small ice world, and hard-coding one distance would make one of them wrong.
   */
  _focusTarget(out, planet) {
    planet.body.getWorldPosition(_v);
    const dist = CAMERA.focus.distance * (0.5 + planet.baseRadius * 1.15);

    // Direction from the world toward the camera's current side of the system,
    // nudged toward the star so the shot is front-lit rather than silhouetted.
    _offset.copy(_v).setY(0);
    if (_offset.lengthSq() < 1e-6) _offset.set(0, 0, 1);
    _offset.normalize().multiplyScalar(0.62);
    _offset.addScaledVector(this.stage.starDirection, 0.55);
    _offset.y = 0;
    _offset.normalize().multiplyScalar(dist);

    out.copy(_v).add(_offset);
    out.y = _v.y + CAMERA.focus.height + planet.baseRadius * 0.35;
    return out;
  }

  /**
   * Offsets the look-at point so the world lands in a specific part of the
   * frame instead of dead centre. Aiming the camera away from the subject is
   * how you compose around UI: the alternative — centring the world and then
   * covering it with a panel — is what makes most 3D sites feel unconsidered.
   */
  _frameLookTarget(out, planet, camPos) {
    _fwd.copy(planet.worldPos).sub(camPos);
    const dist = _fwd.length() || 1;
    _fwd.divideScalar(dist);

    _right.crossVectors(_fwd, WORLD_UP);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _fwd).normalize();

    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * dist;
    const halfW = halfH * this.camera.aspect;

    const portrait = this.camera.aspect < 1;
    const fx = portrait ? 0 : CAMERA.focus.frameX;
    const fy = portrait ? CAMERA.focus.framePortraitY : CAMERA.focus.frameY;

    // Looking left of / below the world pushes it right and up on screen.
    out.copy(planet.worldPos)
       .addScaledVector(_right, -fx * halfW)
       .addScaledVector(_up, -fy * halfH);
  }

  update(dt) {
    this.dolly = damp(this.dolly, this.dollyTarget, 3.2, dt);

    const target = _v.set(0, 0, 0);
    if (store.view === 'focus' && store.focusIndex >= 0) {
      const planet = this.system.planets[store.focusIndex];
      this._focusTarget(target, planet);
      this._frameLookTarget(this.lookTarget, planet, target);
    } else {
      this._overviewTarget(target);
      this.lookTarget.set(0, 0, 0);
    }

    this.px.target = target.x;
    this.py.target = target.y;
    this.pz.target = target.z;

    this.px.step(dt); this.py.step(dt); this.pz.step(dt);
    this.camera.position.set(this.px.value, this.py.value, this.pz.value);

    /* Pointer parallax — a gentle counter-move applied after the springs so
       it never fights them, and scaled down while focused so reading the
       dossier does not feel like the frame is swimming. */
    const amount = CAMERA.parallax.amount * (store.view === 'focus' ? 0.28 : 1);
    const targetPX = store.pointer.nx * amount;
    const targetPY = -store.pointer.ny * amount * 0.55;
    this.parallax.x = damp(this.parallax.x, targetPX, CAMERA.parallax.lambda, dt);
    this.parallax.y = damp(this.parallax.y, targetPY, CAMERA.parallax.lambda, dt);

    // Apply parallax in camera-local axes so it works from any orbit angle.
    this.camera.position.x += this.parallax.x;
    this.camera.position.y += this.parallax.y;

    /* Impact shake. */
    if (this.shake > 0.001) {
      this.shake = damp(this.shake, 0, 7, dt);
      const s = this.shake * 0.14;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.5;
    }

    // Look-at trails the body — this is what gives the move its arc.
    this.lookAt.x = damp(this.lookAt.x, this.lookTarget.x, 4.2, dt);
    this.lookAt.y = damp(this.lookAt.y, this.lookTarget.y, 4.2, dt);
    this.lookAt.z = damp(this.lookAt.z, this.lookTarget.z, 4.2, dt);
    this.camera.lookAt(this.lookAt);

    if (this.transitioning && this.px.settled && this.py.settled && this.pz.settled) {
      this.transitioning = false;
    }
  }
}
