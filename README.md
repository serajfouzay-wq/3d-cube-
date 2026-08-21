# AETHERION — Stellar Catalog

An interactive survey of five worlds. Vanilla ES modules + Three.js r160, **no build step**.

```bash
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

> Must be served over HTTP. Opening `index.html` from `file://` will fail — ES
> modules and the import map are blocked by the file-protocol origin rules.

---

## What you need to supply

**Nothing. The site runs complete as-is.** Everything below is optional polish;
each item degrades to a working fallback rather than an error.

### Audio — optional, all 9 files

Drop these into `public/audio/`. Any file that is missing is replaced at runtime
by a synthesised equivalent built from oscillators and filtered noise, so the
site ships with a full soundtrack and an empty folder.

| File | Bus | Loop | Suggested length | Used for |
|---|---|---|---|---|
| `ambience-deep-space.mp3` | music | ✓ | 60–120 s, seamless | Background bed |
| `system-hum.mp3` | ambient | ✓ | 10–30 s, seamless | Low room tone under everything |
| `ui-hover.mp3` | sfx | — | 80–150 ms | Cursor enters a world or control |
| `ui-click.mp3` | sfx | — | 120–250 ms | Confirm |
| `ui-toggle.mp3` | sfx | — | 60–120 ms | Language / menu / mute |
| `world-focus.mp3` | sfx | — | 400–700 ms | Camera flies to a world |
| `world-release.mp3` | sfx | — | 350–600 ms | Camera returns to the system |
| `scan-loop.mp3` | sfx | ✓ | 0.5–2 s, seamless | Held-scan texture |
| `scan-complete.mp3` | sfx | — | 0.8–1.5 s | Survey unlocked |

Use `.mp3` (or change the extensions in `src/core/config.js` → `AUDIO.samples`).
Normalise to about −14 LUFS; the master bus has a limiter but headroom helps.

### Dossier art — optional, 1 per world

`WORLDS[n].art` in `src/core/config.js`. Portrait, roughly 3:4, any web format.
Four of the five are already wired to your existing plates in `public/3d/`.
`NUUR` is deliberately left as `null` to demonstrate the fallback — set its
`art` path to add one. These load lazily, only when a world is opened.

### Background plate — optional

`public/space-bg.mp4` is already present and is composited **inside** WebGL as a
video texture, so it shares the scene's exposure, bloom and grain. If it is
missing or the browser cannot decode it, the procedural nebula carries the frame
on its own.

### 3D models — none required

There are no `.gltf` / `.glb` assets and none are needed. Every world's surface
is generated in a fragment shader from 3D simplex noise, which is why there are
no planet textures to download.

---

## Architecture

```
index.html                  markup shell only — no logic, no inline styles
src/
  main.js                   bootstrap: builds subsystems, owns the frame loop
  core/
    config.js               ★ single source of truth: brand, worlds, camera, audio
    bus.js                  event bus — the only seam between the 3D and DOM layers
    store.js                shared app state + render-quality detection
    math.js                 frame-rate-independent damping, springs, easing
  i18n/
    i18n.js                 dictionary resolution, DOM binding, Intl formatting
    locales/{en,ar,zh,fr}.js
  world/
    Stage.js                renderer, camera, lights, post-processing chain
    System.js               orbital rig, drag inertia, magnetic detents
    Planet.js               one world: surface, atmosphere, ring, halo
    Backdrop.js             procedural nebula + video plate
    Starfield.js            three parallax star shells
    Particles.js            ambient dust + pooled selection bursts
    CameraRig.js            every camera move (springs + screen-space framing)
    Interaction.js          pointer / touch / wheel / keyboard → intent
    shaders.js              all GLSL
  audio/AudioEngine.js      Web Audio graph + synthesised fallbacks
  ui/{HUD,Labels,Cursor}.js DOM chrome, projected labels, custom cursor
  styles/{base,hud}.css
legacy/                     previous versions, kept for reference
```

**Nothing in `world/` imports from `ui/`, and nothing in `ui/` imports `three`.**
They communicate only through the bus, so either half can be replaced without
touching the other.

### Rebranding

Everything brand-facing is in `src/core/config.js`. Change `BRAND.name`, edit or
add entries to `WORLDS`, and the 3D scene, world index, floating labels, dossier
panel and audio panning all follow. Copy lives in `src/i18n/locales/` so it can
be translated; only structure and physics live in config.

### Adding a language

1. Copy `src/i18n/locales/en.js` and translate it.
2. Add `{ code, label, short, dir, font }` to `LOCALES` in `config.js`.

That is the whole procedure — the switcher, `dir` mirroring, font stack and
number formatting are all driven from that entry. Set `dir: 'rtl'` and the
entire interface mirrors, because the CSS uses logical properties throughout.

World names can be transliterated per-locale via `worlds.<id>.name`; if a locale
omits it, the Latin name from `config.js` is used.

---

## Controls

| Input | Action |
|---|---|
| Drag | Rotate the system — carries momentum, parks on the nearest world |
| Click a world | Fly to it |
| **Hold** a world (0.9 s) | Run a deep scan; unlocks its dossier stats |
| Scroll / pinch | Dolly in and out |
| `1`–`5` | Jump to a world |
| `←` `→` | Step between worlds |
| `Esc` | Return to the system |

---

## Notes

- **Quality tiers.** `detectQuality()` picks high/medium/low from core count,
  device memory and pointer type, scaling star and dust counts, sphere
  tessellation, pixel ratio and bloom. Low tier also drops the SMAA pass.
- **Reduced motion.** `prefers-reduced-motion` forces the low tier, slows axial
  spin and orbital rates, cuts grain, and disables camera shake and warp flashes.
  The scene keeps rendering; it just stops moving on its own.
- **Audio autoplay.** The `AudioContext` is created on the first real gesture,
  as browsers require. Calls made before that are dropped rather than queued.
- **Vendoring Three.js.** The import map in `index.html` points at a CDN. To run
  fully offline, drop the `three` package into `vendor/` and repoint the two
  import-map entries; nothing else changes.
