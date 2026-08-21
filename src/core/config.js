/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AETHERION — single source of truth
 * ═══════════════════════════════════════════════════════════════════════
 *  Everything brand-facing lives here. Change a name, a colour or a world
 *  in this file and it propagates to the 3D scene, the HUD, the floating
 *  labels, the dossier panel and the audio mix automatically.
 *
 *  Human-readable copy is NOT here — it lives in src/i18n/locales/*.js so
 *  it can be translated. This file holds structure, identity and physics.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const BRAND = {
  id: 'aetherion',
  name: 'AETHERION',
  mark: 'AE',
  version: 'V-2.0',
  year: 2026,
  /** Drives --accent and every default glow in the scene. */
  accent: '#7cc4ff',
  accentWarm: '#ffb27a',
};

/**
 * Surface archetypes consumed by the planet shader.
 *   0 = gas giant (banded)   1 = terrestrial   2 = ocean
 *   3 = machine (city lights) 4 = luminous ice
 */
export const SURFACE = { GAS: 0, TERRA: 1, OCEAN: 2, MACHINE: 3, ICE: 4 };

/**
 * The five worlds of the Aetherion catalog.
 * `nameKey` resolves through i18n with a fallback to `name`, so proper nouns
 * can be transliterated per-locale (see locales/ar.js) without breaking here.
 */
export const WORLDS = [
  {
    id: 'velthara',
    code: 'VEL-01',
    name: 'VELTHARA',
    art: 'public/3d/3dbox1en.png',
    palette: {
      deep: '#39150a', base: '#a35730', accent: '#ffc078',
      atmo: '#ff8a44', light: '#ffd7a8',
    },
    surface: {
      type: SURFACE.TERRA,
      noiseScale: 2.2, ridges: 0.82, landLevel: 0.44,
      bands: 0.0, nightLights: 0.35, spin: 0.055, roughness: 0.75,
    },
    orbit: { radius: 3.1, size: 0.70, tiltX: 0.16, tiltZ: 0.05, phase: 0.0, inclination: 0.0 },
    ring: null,
    /** Raw values — formatted per-locale by Intl.NumberFormat in the HUD. */
    stats: { period: 412, gravity: 1.34, moons: 2, temp: 318, diameter: 14200 },
  },
  {
    id: 'kyonis',
    code: 'KYO-02',
    name: 'KYONIS',
    art: 'public/3d/3dbox2en.png',
    palette: {
      deep: '#01131f', base: '#0d6f9e', accent: '#8ff2ff',
      atmo: '#39c9ff', light: '#d6f7ff',
    },
    surface: {
      type: SURFACE.OCEAN,
      noiseScale: 1.7, ridges: 0.35, landLevel: 0.62,
      bands: 0.0, nightLights: 0.08, spin: 0.038, roughness: 0.18,
    },
    orbit: { radius: 4.35, size: 0.82, tiltX: -0.22, tiltZ: 0.11, phase: 1.32, inclination: 0.07 },
    ring: null,
    stats: { period: 688, gravity: 1.02, moons: 4, temp: 281, diameter: 16400 },
  },
  {
    id: 'orrinvael',
    code: 'ORR-03',
    name: 'ORRIN VAEL',
    art: 'public/3d/3dbox3en.png',
    palette: {
      deep: '#170a2e', base: '#6d4fd6', accent: '#e0b6ff',
      atmo: '#a97bff', light: '#f0e2ff',
    },
    surface: {
      type: SURFACE.GAS,
      noiseScale: 1.35, ridges: 0.55, landLevel: 0.5,
      bands: 1.0, nightLights: 0.0, spin: 0.085, roughness: 0.9,
    },
    orbit: { radius: 5.75, size: 1.12, tiltX: 0.28, tiltZ: -0.14, phase: 2.74, inclination: -0.05 },
    ring: { inner: 1.45, outer: 2.35, tilt: 0.36, opacity: 0.42, color: '#a98fd0' },
    stats: { period: 1841, gravity: 2.61, moons: 19, temp: 148, diameter: 92600 },
  },
  {
    id: 'sable',
    code: 'SAB-04',
    name: 'SABLE IX',
    art: 'public/3d/3dbox4en.png',
    palette: {
      deep: '#050a10', base: '#1d3448', accent: '#6fe9d0',
      atmo: '#2fd6b4', light: '#bff7ec',
    },
    surface: {
      type: SURFACE.MACHINE,
      noiseScale: 3.4, ridges: 0.95, landLevel: 0.5,
      bands: 0.0, nightLights: 1.0, spin: 0.024, roughness: 0.45,
    },
    orbit: { radius: 7.1, size: 0.66, tiltX: -0.09, tiltZ: 0.22, phase: 4.11, inclination: 0.12 },
    ring: null,
    stats: { period: 2960, gravity: 0.88, moons: 0, temp: 94, diameter: 12100 },
  },
  {
    id: 'nuur',
    code: 'NUU-05',
    name: 'NUUR',
    art: null, // no dossier art supplied yet — falls back to a generated plate
    palette: {
      deep: '#241b0d', base: '#8f7638', accent: '#f2dda6',
      atmo: '#d8b673', light: '#fffaf0',
    },
    surface: {
      type: SURFACE.ICE,
      noiseScale: 2.6, ridges: 0.68, landLevel: 0.52,
      bands: 0.18, nightLights: 0.0, spin: 0.032, roughness: 0.3,
    },
    orbit: { radius: 8.6, size: 0.58, tiltX: 0.34, tiltZ: -0.08, phase: 5.5, inclination: -0.11 },
    ring: null,
    stats: { period: 4415, gravity: 0.61, moons: 1, temp: 61, diameter: 9800 },
  },
];

/** Camera behaviour per view state. */
export const CAMERA = {
  fov: 42,
  near: 0.1,
  far: 400,
  overview: { position: [0, 4.0, 19.0], target: [0, 0, 0] },
  /** Focus rig is computed relative to the world; these are the offsets. */
  /**
   * distance    multiplier on the world's radius for the dolly-in
   * height      how far above the orbital plane the camera sits
   * targetLift  NEGATIVE: the camera looks *below* the world, which pushes it
   *             into the upper half of the frame, clear of the dossier panel
   *             that occupies the lower half in focus view.
   */
  focus: {
    distance: 5.0,
    height: 1.05,
    /**
     * Screen-space framing, as a fraction of the visible half-extent at the
     * focus distance. The dossier panel occupies the lower-left of the frame,
     * so the world is pushed toward the upper-right rather than being centred
     * and then hidden behind it. In portrait the panel is full-width, so the
     * world only moves up.
     */
    frameX: 0.34,
    frameY: 0.30,
    framePortraitY: 0.44,
  },
  parallax: { amount: 1.15, lambda: 2.2 },
  zoom: { min: 11, max: 30, step: 1.5 },
  /** Spring constants — lower stiffness = heavier, more cinematic glide. */
  spring: { stiffness: 42, damping: 12 },
};

export const SYSTEM = {
  /** Base orbital speed of the whole rig, radians/second. */
  orbitSpeed: 0.052,
  /** How much a drag adds to angular velocity, and how fast it bleeds off. */
  dragSensitivity: 0.0042,
  dragFriction: 1.85,
  /** Trailing window (ms) the fling velocity is measured over on release. */
  flingWindow: 110,
  /** Magnetic detents: the rig eases toward the nearest world when slow. */
  detentStrength: 0.55,
  detentThreshold: 0.16,
  starCount: { high: 9000, medium: 5000, low: 2200 },
  dustCount: { high: 2600, medium: 1400, low: 600 },
};

export const POST = {
  bloom: {
    high: { strength: 0.58, radius: 0.66, threshold: 0.72 },
    medium: { strength: 0.5, radius: 0.6, threshold: 0.76 },
    low: { strength: 0.36, radius: 0.52, threshold: 0.82 },
  },
  grade: { vignette: 0.42, grain: 0.055, aberration: 0.0016, scanline: 0.028, saturation: 1.08 },
};

export const INTERACTION = {
  /** Hold this long over a world to run a deep scan. */
  scanDuration: 900,
  /** Pointer travel (px) past which a press becomes a drag, not a click. */
  dragThreshold: 6,
  /** Raycast at most this often (ms) — picking every frame is wasteful. */
  pickInterval: 45,
};

/**
 * Audio manifest. Every entry is OPTIONAL: if the file is missing the engine
 * falls back to a synthesised equivalent, so the site is fully playable with
 * an empty public/audio/ directory.
 */
export const AUDIO = {
  buses: { music: 0.34, ambient: 0.5, sfx: 0.62 },
  samples: {
    ambience:   { url: 'public/audio/ambience-deep-space.mp3', bus: 'music',   loop: true,  synth: 'drone' },
    hum:        { url: 'public/audio/system-hum.mp3',          bus: 'ambient', loop: true,  synth: 'hum' },
    hover:      { url: 'public/audio/ui-hover.mp3',            bus: 'sfx',     loop: false, synth: 'blip' },
    click:      { url: 'public/audio/ui-click.mp3',            bus: 'sfx',     loop: false, synth: 'click' },
    focus:      { url: 'public/audio/world-focus.mp3',         bus: 'sfx',     loop: false, synth: 'sweepUp' },
    release:    { url: 'public/audio/world-release.mp3',       bus: 'sfx',     loop: false, synth: 'sweepDown' },
    scan:       { url: 'public/audio/scan-loop.mp3',           bus: 'sfx',     loop: true,  synth: 'scan' },
    scanDone:   { url: 'public/audio/scan-complete.mp3',       bus: 'sfx',     loop: false, synth: 'chord' },
    toggle:     { url: 'public/audio/ui-toggle.mp3',           bus: 'sfx',     loop: false, synth: 'tick' },
  },
};

/** Locales registered at boot. `dir` drives the document writing direction. */
export const LOCALES = [
  { code: 'en', label: 'English', short: 'EN', dir: 'ltr', font: 'ui' },
  { code: 'ar', label: 'العربية', short: 'AR', dir: 'rtl', font: 'arabic' },
  { code: 'zh', label: '中文',    short: 'ZH', dir: 'ltr', font: 'cjk' },
  { code: 'fr', label: 'Français', short: 'FR', dir: 'ltr', font: 'ui' },
];

export const ASSETS = {
  backdropVideo: 'public/space-bg.mp4',
};
