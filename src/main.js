import * as THREE from 'three';

import { store, detectQuality, setView } from './core/store.js';
import { bus, EV } from './core/bus.js';
import { WORLDS, ASSETS } from './core/config.js';
import { clamp } from './core/math.js';
import { initI18n, t } from './i18n/i18n.js';

import { Stage } from './world/Stage.js';
import { System } from './world/System.js';
import { Backdrop } from './world/Backdrop.js';
import { Starfield } from './world/Starfield.js';
import { Dust, BurstField } from './world/Particles.js';
import { CameraRig } from './world/CameraRig.js';
import { Interaction } from './world/Interaction.js';

import { audio } from './audio/AudioEngine.js';
import { Cursor } from './ui/Cursor.js';
import { Labels } from './ui/Labels.js';
import { HUD } from './ui/HUD.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AETHERION — bootstrap
 * ═══════════════════════════════════════════════════════════════════════
 *  Ownership map:
 *    Stage        renderer, camera, lights, post chain
 *    System       orbital rig + the five worlds
 *    CameraRig    every camera move (springs)
 *    Interaction  pointer/touch/wheel/keyboard → intent on the bus
 *    HUD/Labels   DOM chrome, reacting to the bus
 *    AudioEngine  Web Audio graph, reacting to the bus
 *
 *  Nothing in world/ imports anything from ui/, and nothing in ui/ imports
 *  three. The bus is the only seam between them.
 */

const boot = async () => {
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderText = document.getElementById('loader-text');

  const progress = (value, key) => {
    loaderBar.style.setProperty('--progress', String(clamp(value, 0, 1)));
    if (key) loaderText.textContent = t(key);
    bus.emit(EV.PROGRESS, { value });
  };

  detectQuality();
  await initI18n();
  progress(0.1, 'loader.boot');

  /* ── World ──────────────────────────────────────────────────────────── */
  const canvas = document.getElementById('stage');
  const stage = new Stage(canvas);
  progress(0.3, 'loader.stars');

  const backdrop = new Backdrop(stage);
  backdrop.attachVideo(document.getElementById('backdrop-video'));

  const starfield = new Starfield(stage);
  const dust = new Dust(stage);
  const burst = new BurstField(stage);
  progress(0.55, 'loader.worlds');

  const system = new System(stage);
  const rig = new CameraRig(stage, system);
  const interaction = new Interaction(stage, system, rig);
  progress(0.75, 'loader.audio');

  /* ── UI ─────────────────────────────────────────────────────────────── */
  const labels = new Labels(
    document.getElementById('labels'),
    system,
    stage.camera,
    (i) => interaction.focus(i)
  );

  const hud = new HUD({
    onSelect: (i) => {
      if (store.view === 'focus' && store.focusIndex === i) interaction.release();
      else interaction.focus(i);
    },
    onRelease: () => interaction.release(),
    onMuteToggle: () => audio.toggleMute(),
  });

  const cursor = new Cursor(document.getElementById('cursor'), labels);

  /* ── Audio wiring ───────────────────────────────────────────────────── */
  audio.prime();
  progress(0.9, 'loader.audio');

  /** Screen-space pan for a world, so cues come from where the world is. */
  const panFor = (index) => {
    const s = labels.screenPositionOf(index);
    if (!s) return 0;
    return clamp((s.x / window.innerWidth) * 2 - 1, -1, 1);
  };

  bus.on(EV.UI_SOUND, ({ id, pan = 0 }) => audio.play(id, { pan, volume: 0.7 }));

  bus.on(EV.HOVER, ({ index }) => {
    if (index < 0) return;
    audio.play('hover', { pan: panFor(index), volume: 0.55, rate: 0.94 + index * 0.03 });
  });

  bus.on(EV.FOCUS, ({ index }) => {
    audio.duck(0.45, 0.6);
    audio.play('focus', { pan: panFor(index) });
    audio.play('click', { volume: 0.5 });
    rig.onViewChange();
    backdrop.setFocused(true);

    const p = system.planets[index];
    burst.emit(p.worldPos, new THREE.Color(p.cfg.palette.accent).convertSRGBToLinear(), 70, 2.6);
    rig.addShake(0.22);
  });

  bus.on(EV.RELEASE, () => {
    audio.play('release');
    rig.onViewChange();
    backdrop.setFocused(false);
  });

  bus.on(EV.SCAN_START, ({ index }) => audio.play('scan', { pan: panFor(index), volume: 0.5 }));
  bus.on(EV.SCAN_CANCEL, () => audio.stop('scan', 0.12));
  bus.on(EV.SCAN_PROGRESS, ({ t: p }) => cursor.setScanProgress(p));

  bus.on(EV.SCAN_DONE, ({ index }) => {
    audio.stop('scan', 0.08);
    audio.duck(0.35, 0.9);
    audio.play('scanDone', { pan: panFor(index) });
    cursor.setScanProgress(0);

    const p = system.planets[index];
    burst.emit(p.worldPos, new THREE.Color(p.cfg.palette.accent).convertSRGBToLinear(), 150, 3.6);
    rig.addShake(0.55);
    stage.triggerFlash(0.28);
  });

  bus.on(EV.DRAG_END, ({ velocity }) => {
    // Only sound a flick that actually carried momentum.
    if (Math.abs(velocity) > 0.6) audio.play('toggle', { volume: 0.28, rate: 1.4 });
  });

  bus.on(EV.LOCALE, () => labels.retranslate());

  /* ── Loop ───────────────────────────────────────────────────────────── */
  const clock = new THREE.Clock();
  let running = true;

  // A backgrounded tab returns a huge delta on its first frame back; clamping
  // it stops every spring in the scene from exploding on tab refocus.
  const MAX_DT = 1 / 20;

  const frame = () => {
    requestAnimationFrame(frame);
    if (!running) return;

    const dt = Math.min(clock.getDelta(), MAX_DT);
    const elapsed = clock.getElapsedTime();

    interaction.update(dt);
    system.update(dt, elapsed);
    rig.update(dt);
    backdrop.update(dt, elapsed);
    starfield.update(dt, elapsed);
    dust.update(dt, elapsed);
    burst.update(dt);

    // Hover/focus flags are pushed to the planets here rather than in the
    // event handlers, so a planet that changes state mid-transition still
    // resolves to the correct spring target.
    for (let i = 0; i < system.planets.length; i++) {
      const p = system.planets[i];
      p.setHover(store.hoverIndex === i);
      p.setFocus(store.view === 'focus' && store.focusIndex === i);
    }

    labels.update();
    cursor.update(dt);
    stage.render(dt);
  };

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.getDelta();      // discard the accumulated gap
  });

  frame();

  /* ── Reveal ─────────────────────────────────────────────────────────── */
  progress(1, 'loader.done');
  store.ready = true;
  bus.emit(EV.READY);

  // Two frames of headroom so the first rendered frame is a complete one —
  // fading in over a half-drawn scene is the cheapest-looking thing a 3D site
  // can do.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(() => {
      loader.classList.add('is-done');
      document.body.classList.add('is-ready');
      setTimeout(() => { loader.hidden = true; }, 900);
    }, 260);
  }));

  // Expose for debugging; harmless and genuinely useful when tuning shaders.
  window.AETHERION = { stage, system, rig, interaction, hud, labels, audio, store, bus, EV, setView, WORLDS };
};

boot().catch((err) => {
  console.error('[aetherion] boot failed', err);
  const loader = document.getElementById('loader');
  const text = document.getElementById('loader-text');
  if (text) text.textContent = 'INITIALISATION FAILED — SEE CONSOLE';
  loader?.classList.add('is-error');
});
