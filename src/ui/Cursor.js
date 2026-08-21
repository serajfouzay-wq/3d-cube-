import { store } from '../core/store.js';
import { damp } from '../core/math.js';

/**
 * Custom cursor: a precise dot that tracks the pointer exactly, and a ring
 * that lags behind it. The lag is the entire effect — it gives the pointer
 * weight and makes hover states feel like the ring is being *captured* by the
 * target rather than snapping to it.
 *
 * When a world is hovered the ring is magnetically pulled toward that world's
 * projected screen position, so it visibly locks on before the click lands.
 */
export class Cursor {
  constructor(root, labels) {
    this.dot = root.querySelector('.cursor-dot');
    this.ring = root.querySelector('.cursor-ring');
    this.progress = root.querySelector('.cursor-scan-arc');
    this.labels = labels;

    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.rx = this.x;
    this.ry = this.y;

    // Circumference of the r=22 scan arc, for stroke-dashoffset animation.
    this.circumference = 2 * Math.PI * 22;
    if (this.progress) {
      this.progress.style.strokeDasharray = String(this.circumference);
      this.progress.style.strokeDashoffset = String(this.circumference);
    }

    this.enabled = window.matchMedia('(pointer: fine)').matches;
    document.body.classList.toggle('has-custom-cursor', this.enabled);

    window.addEventListener('pointermove', (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
    }, { passive: true });

    // Interactive DOM controls get the same lock-on treatment as the worlds.
    document.querySelectorAll('[data-cursor]').forEach((el) => {
      el.addEventListener('pointerenter', () => this.setState(el.dataset.cursor || 'hover'));
      el.addEventListener('pointerleave', () => this.setState(null));
    });

    document.addEventListener('pointerdown', () => this.root?.classList.add('is-down'));
    document.addEventListener('pointerup', () => this.root?.classList.remove('is-down'));
    this.root = root;
  }

  setState(state) {
    if (!this.root) return;
    this.root.dataset.state = state || '';
  }

  setScanProgress(t) {
    if (!this.progress) return;
    this.progress.style.strokeDashoffset = String(this.circumference * (1 - t));
    this.root.classList.toggle('is-scanning', t > 0.001);
  }

  update(dt) {
    if (!this.enabled) return;

    let targetX = this.x, targetY = this.y;

    // Magnetic pull toward the hovered world's label anchor.
    if (store.hoverIndex >= 0) {
      const anchor = this.labels?.screenPositionOf(store.hoverIndex);
      if (anchor && anchor.visible) {
        targetX = this.x + (anchor.x - this.x) * 0.28;
        targetY = this.y + (anchor.y - this.y) * 0.28;
      }
    }

    this.rx = damp(this.rx, targetX, 14, dt);
    this.ry = damp(this.ry, targetY, 14, dt);

    this.dot.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) translate(-50%, -50%)`;
    this.ring.style.transform = `translate3d(${this.rx}px, ${this.ry}px, 0) translate(-50%, -50%)`;

    this.root.classList.toggle('on-world', store.hoverIndex >= 0);
  }
}
