import * as THREE from 'three';
import { bus, EV } from '../core/bus.js';
import { store, setHover, setView } from '../core/store.js';
import { INTERACTION, WORLDS } from '../core/config.js';
import { clamp } from '../core/math.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Interaction — pointer, touch, wheel and keyboard
 * ═══════════════════════════════════════════════════════════════════════
 *  Uses Pointer Events throughout, so mouse / touch / pen share one code path
 *  and pointer capture keeps a drag alive when the cursor leaves the canvas.
 *
 *  Gesture resolution, in priority order:
 *    press + move  > threshold  → DRAG   (rotates the system, with inertia)
 *    press + hold  > 900ms      → SCAN   (on a world; unlocks its dossier)
 *    press + release, no move   → CLICK  (focus the world / release focus)
 *
 *  A drag cancels a pending scan, and a scan suppresses the click that would
 *  otherwise fire on release. Without that, every scan would also toggle
 *  focus and the interaction would feel like it is fighting you.
 */
export class Interaction {
  constructor(stage, system, rig) {
    this.stage = stage;
    this.system = system;
    this.rig = rig;
    this.canvas = stage.canvas;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    this.pointerDown = false;
    this.dragged = false;
    this.pressStart = { x: 0, y: 0, t: 0 };
    this.lastX = 0;
    this.lastMoveTime = 0;
    this.pressedPlanet = null;

    this.scanning = false;

    this._lastPick = 0;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    const opts = { passive: false };

    c.addEventListener('pointermove', this._onMove = this._onMove.bind(this), { passive: true });
    c.addEventListener('pointerdown', this._onDown = this._onDown.bind(this), opts);
    window.addEventListener('pointerup', this._onUp = this._onUp.bind(this), opts);
    window.addEventListener('pointercancel', this._onCancel = this._onCancel.bind(this), { passive: true });
    c.addEventListener('wheel', this._onWheel = this._onWheel.bind(this), opts);
    window.addEventListener('keydown', this._onKey = this._onKey.bind(this));

    // Never let a drag start a native image drag or a text selection.
    c.addEventListener('dragstart', (e) => e.preventDefault());
    c.addEventListener('contextmenu', (e) => { if (this.dragged) e.preventDefault(); });
  }

  _updateNDC(e) {
    this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    store.pointer.x = e.clientX;
    store.pointer.y = e.clientY;
    store.pointer.nx = this.ndc.x;
    store.pointer.ny = -this.ndc.y;
  }

  /** Raycast against planet bodies only — throttled, picking is not free. */
  pick(force = false) {
    const now = performance.now();
    if (!force && now - this._lastPick < INTERACTION.pickInterval) return this._lastHit;
    this._lastPick = now;

    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const hits = this.raycaster.intersectObjects(this.system.pickTargets, false);
    this._lastHit = hits.length ? hits[0].object.userData.planet : null;
    return this._lastHit;
  }

  _onMove(e) {
    this._updateNDC(e);

    if (this.pointerDown) {
      const dx = e.clientX - this.lastX;
      const travel = Math.hypot(e.clientX - this.pressStart.x, e.clientY - this.pressStart.y);

      if (!this.dragged && travel > INTERACTION.dragThreshold) {
        this.dragged = true;
        this.system.dragging = true;
        this._cancelScan();
        document.body.classList.add('is-dragging');
        bus.emit(EV.DRAG_START);
      }

      if (this.dragged) {
        // Not mirrored under RTL: the system is a physical object, so dragging
        // right spins it right regardless of the document's text direction.
        this.system.drag(dx);
      }
      this.lastX = e.clientX;
      return;
    }

    const hit = this.pick();
    setHover(hit ? hit.index : -1);
  }

  _onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this._updateNDC(e);

    this.pointerDown = true;
    this.dragged = false;
    this.pressStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.lastX = e.clientX;

    const hit = this.pick(true);
    this.pressedPlanet = hit;

    if (hit) {
      this.scanStart = performance.now();
      this.scanning = true;
      store.scanIndex = hit.index;
      bus.emit(EV.SCAN_START, { index: hit.index });
    }
  }

  _onUp(e) {
    if (!this.pointerDown) return;
    this.canvas.releasePointerCapture?.(e.pointerId);
    this.pointerDown = false;
    document.body.classList.remove('is-dragging');

    const wasScanComplete = this.scanCompletedThisPress;
    this.scanCompletedThisPress = false;

    if (this.dragged) {
      const velocity = this.system.releaseDrag();
      bus.emit(EV.DRAG_END, { velocity });
      this.dragged = false;
      this._cancelScan();
      return;
    }

    this._cancelScan();

    // A completed scan consumes the click; otherwise a tap toggles focus.
    if (!wasScanComplete) {
      const hit = this.pressedPlanet;
      if (hit) {
        if (store.view === 'focus' && store.focusIndex === hit.index) this.release();
        else this.focus(hit.index);
      } else if (store.view === 'focus') {
        this.release();
      }
    }
    this.pressedPlanet = null;
  }

  _onCancel() {
    this.pointerDown = false;
    this.dragged = false;
    if (this.system.dragging) this.system.releaseDrag();
    document.body.classList.remove('is-dragging');
    this._cancelScan();
  }

  _cancelScan() {
    if (!this.scanning) return;
    this.scanning = false;
    const idx = store.scanIndex;
    store.scanIndex = -1;
    if (idx >= 0) this.system.planets[idx]?.setScan(0);
    bus.emit(EV.SCAN_CANCEL, { index: idx });
  }

  _onWheel(e) {
    e.preventDefault();
    this.rig.zoom(e.deltaY);
  }

  _onKey(e) {
    // Digits jump straight to a world; arrows step; Escape backs out.
    if (e.key === 'Escape') { if (store.view === 'focus') this.release(); return; }
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= WORLDS.length) { this.focus(n - 1); return; }

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const cur = store.focusIndex >= 0 ? store.focusIndex : 0;
      const next = (cur + dir + WORLDS.length) % WORLDS.length;
      this.focus(next);
    }
  }

  focus(index) {
    if (index < 0 || index >= WORLDS.length) return;
    setView('focus', index);
    bus.emit(EV.FOCUS, { index });
  }

  release() {
    setView('overview', -1);
    bus.emit(EV.RELEASE, {});
  }

  update() {
    if (!this.scanning) return;

    const t = clamp((performance.now() - this.scanStart) / INTERACTION.scanDuration, 0, 1);
    const planet = this.system.planets[store.scanIndex];
    planet?.setScan(t);
    bus.emit(EV.SCAN_PROGRESS, { index: store.scanIndex, t });

    if (t >= 1) {
      const index = store.scanIndex;
      this.scanning = false;
      this.scanCompletedThisPress = true;
      store.scanned.add(index);
      store.scanIndex = -1;
      planet?.setScan(0);
      bus.emit(EV.SCAN_DONE, { index });
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onCancel);
    this.canvas.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('keydown', this._onKey);
  }
}
