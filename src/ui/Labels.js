import * as THREE from 'three';
import { WORLDS } from '../core/config.js';
import { store } from '../core/store.js';
import { t } from '../i18n/i18n.js';

const _v = new THREE.Vector3();

/**
 * Projects each world's 3D position into screen space and drives an HTML
 * label there.
 *
 * Why HTML and not 3D text: every label is a proper noun that has to render
 * in Latin, Arabic and Chinese. An SDF font atlas would need three separate
 * atlases, would not do Arabic contextual shaping, and would break the moment
 * someone adds a language. Projecting DOM nodes hands all of that to the
 * browser's text engine, for the cost of a matrix multiply per world per frame.
 *
 * The trade-off is that labels cannot be occluded by geometry for free, so we
 * do it explicitly: a label behind the camera is hidden, and a label whose
 * world is on the far side of the star fades by depth.
 */
export class Labels {
  constructor(container, system, camera, onSelect) {
    this.container = container;
    this.system = system;
    this.camera = camera;
    this.items = [];

    for (let i = 0; i < WORLDS.length; i++) {
      const cfg = WORLDS[i];
      const el = document.createElement('button');
      el.className = 'world-label';
      el.type = 'button';
      el.dataset.index = String(i);
      el.dataset.cursor = 'label';
      el.style.setProperty('--world-accent', cfg.palette.accent);
      el.innerHTML = `
        <span class="world-label__code">${cfg.code}</span>
        <span class="world-label__name"></span>
        <span class="world-label__epithet"></span>
        <span class="world-label__line" aria-hidden="true"></span>
      `;
      el.addEventListener('click', (e) => { e.stopPropagation(); onSelect?.(i); });
      container.appendChild(el);

      this.items.push({
        el,
        name: el.querySelector('.world-label__name'),
        epithet: el.querySelector('.world-label__epithet'),
        screen: { x: 0, y: 0, visible: false, depth: 0 },
      });
    }

    this.retranslate();
  }

  /** Re-reads every string from the active dictionary. */
  retranslate() {
    this.items.forEach((item, i) => {
      const cfg = WORLDS[i];
      item.name.textContent = t(`worlds.${cfg.id}.name`, null, cfg.name);
      item.epithet.textContent = t(`worlds.${cfg.id}.epithet`);
      item.el.setAttribute('aria-label', `${t(`worlds.${cfg.id}.name`, null, cfg.name)} — ${t(`worlds.${cfg.id}.epithet`)}`);
    });
  }

  screenPositionOf(index) { return this.items[index]?.screen; }

  update() {
    const w = window.innerWidth, h = window.innerHeight;
    const focused = store.view === 'focus';

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const planet = this.system.planets[i];

      _v.copy(planet.worldPos);
      // Anchor below the world, offset by its current (sprung) radius so the
      // label keeps its distance as the world grows on hover.
      _v.y -= planet.radius * 1.55;
      _v.project(this.camera);

      const behind = _v.z > 1;
      const x = (_v.x * 0.5 + 0.5) * w;
      const y = (-_v.y * 0.5 + 0.5) * h;

      item.screen.x = x;
      item.screen.y = y;
      item.screen.depth = _v.z;
      item.screen.visible = !behind;

      const isFocus = focused && store.focusIndex === i;
      const dimmed = focused && !isFocus;

      // Fade by true distance from the camera, not by clip-space z. Clip z is
      // non-linear and barely moves across the system's depth, so it left the
      // far-side labels at full strength where they collided with the
      // near-side ones and with the left-hand copy block.
      const dist = planet.worldPos.distanceTo(this.camera.position);
      const depthFade = 1 - 0.78 * Math.min(1, Math.max(0, (dist - 12) / 12));

      item.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, 0)`;
      // Only the world under the cursor (or in focus) gets full presence;
      // the rest recede. Five labels at equal weight reads as clutter.
      const emphasis = (store.hoverIndex === i || isFocus) ? 1 : 0.55;
      item.el.style.opacity = behind ? '0' : String(dimmed ? 0.14 : depthFade * emphasis);
      item.el.style.pointerEvents = behind || dimmed ? 'none' : 'auto';
      item.el.classList.toggle('is-hovered', store.hoverIndex === i);
      item.el.classList.toggle('is-focused', isFocus);
      item.el.classList.toggle('is-scanned', store.scanned.has(i));
    }
  }
}
