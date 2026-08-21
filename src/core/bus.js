/**
 * Minimal typed-ish event bus. Every subsystem (audio, UI, world, i18n)
 * talks through this instead of holding references to each other, which is
 * what lets the 3D layer and the DOM layer stay completely decoupled.
 */
class Bus {
  constructor() { this._map = new Map(); }

  on(type, handler) {
    if (!this._map.has(type)) this._map.set(type, new Set());
    this._map.get(type).add(handler);
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => { off(); handler(payload); });
    return off;
  }

  off(type, handler) {
    this._map.get(type)?.delete(handler);
  }

  emit(type, payload) {
    const set = this._map.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try { handler(payload); }
      catch (err) { console.error(`[bus] handler for "${type}" threw`, err); }
    }
  }
}

export const bus = new Bus();

/** Canonical event names — keeps typos out of the wiring. */
export const EV = {
  READY: 'app:ready',
  PROGRESS: 'app:progress',
  VIEW: 'view:change',          // { view, index }
  HOVER: 'world:hover',         // { index | null }
  FOCUS: 'world:focus',         // { index }
  RELEASE: 'world:release',     // {}
  SCAN_START: 'scan:start',     // { index }
  SCAN_PROGRESS: 'scan:progress', // { index, t }
  SCAN_CANCEL: 'scan:cancel',
  SCAN_DONE: 'scan:done',       // { index }
  DRAG_START: 'input:dragstart',
  DRAG_END: 'input:dragend',    // { velocity }
  LOCALE: 'i18n:change',        // { locale, dir }
  AUDIO_TOGGLE: 'audio:toggle', // { muted }
  UI_SOUND: 'audio:ui',         // { id, pan }
  MENU: 'ui:menu',              // { open }
};
