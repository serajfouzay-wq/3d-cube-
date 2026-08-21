import { bus, EV } from './bus.js';

/**
 * Single mutable app state. Deliberately tiny — the 3D world owns its own
 * transforms; this only tracks what both the DOM and the scene need to agree on.
 */
export const store = {
  view: 'overview',     // 'overview' | 'focus'
  focusIndex: -1,
  hoverIndex: -1,
  scanIndex: -1,
  scanned: new Set(),   // indices whose dossier has been unlocked
  menuOpen: false,
  locale: 'en',
  muted: false,
  ready: false,
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  quality: 'high',      // 'high' | 'medium' | 'low'
  pointer: { x: 0, y: 0, nx: 0, ny: 0 },
};

export function setView(view, index = -1) {
  if (store.view === view && store.focusIndex === index) return;
  store.view = view;
  store.focusIndex = index;
  bus.emit(EV.VIEW, { view, index });
}

export function setHover(index) {
  if (store.hoverIndex === index) return;
  store.hoverIndex = index;
  bus.emit(EV.HOVER, { index });
}

/**
 * Picks a render quality tier up-front. Low-end devices get fewer particles
 * and a cheaper bloom rather than a slideshow.
 */
export function detectQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (store.reduceMotion) return (store.quality = 'low');
  if (mobile || cores <= 4 || mem <= 4) return (store.quality = 'medium');
  if (cores <= 2) return (store.quality = 'low');
  return (store.quality = 'high');
}
