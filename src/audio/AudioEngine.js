import { AUDIO } from '../core/config.js';
import { bus, EV } from '../core/bus.js';
import { store } from '../core/store.js';
import { clamp } from '../core/math.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AudioEngine — Web Audio graph
 * ═══════════════════════════════════════════════════════════════════════
 *
 *      source ─▶ [panner] ─▶ busGain(music|ambient|sfx) ─▶ masterGain
 *                                                             │
 *                                             compressor ◀────┘
 *                                                  ▼
 *                                             destination
 *
 *  Three design decisions worth calling out:
 *
 *  1. NOTHING is required. Every entry in the AUDIO manifest declares a
 *     `synth` fallback. If the file 404s — or you never add one — the engine
 *     synthesises an equivalent from oscillators and filtered noise. The
 *     site ships with a complete soundtrack and an empty public/audio/.
 *
 *  2. The context is created lazily on the first real user gesture, because
 *     browsers refuse to start one otherwise. Calls made before that are
 *     dropped silently rather than queued — a hover sound that arrives four
 *     seconds late is worse than no hover sound.
 *
 *  3. SFX are panned by where the event happened on screen. Clicking a world
 *     on the left of the frame plays left. It costs one node and it is the
 *     single cheapest thing you can do to make a 3D scene feel inhabited.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.buffers = new Map();
    this.loops = new Map();       // id → { source, gain }
    this.muted = false;
    this.unlockBound = false;
  }

  /** Wires the gesture listeners that will unlock the context. */
  prime() {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => this.init();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(ev, unlock, { once: true, passive: true });
    }
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
      return;
    }

    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;                       // no Web Audio: run silent

    this.ctx = new Ctor({ latencyHint: 'interactive' });

    // A gentle limiter on the master keeps stacked SFX from clipping when
    // someone drags the cursor across all five worlds at once.
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 7;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;

    this.master.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    this.buses = {};
    for (const [name, level] of Object.entries(AUDIO.buses)) {
      const g = this.ctx.createGain();
      g.gain.value = level;
      g.connect(this.master);
      this.buses[name] = g;
    }

    this.ready = true;
    await this.loadAll();
    this.startAmbience();
  }

  /**
   * Fetches every sample in parallel. A failure is not an error — the id is
   * simply left without a buffer and `play` routes it to the synth instead.
   */
  async loadAll(onProgress) {
    if (!this.ctx) return;
    const entries = Object.entries(AUDIO.samples);
    let done = 0;

    await Promise.all(entries.map(async ([id, spec]) => {
      try {
        const res = await fetch(spec.url);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(id, buf);
      } catch {
        // Expected whenever the asset has not been supplied yet.
      } finally {
        done++;
        onProgress?.(done / entries.length);
      }
    }));
  }

  _busFor(id) {
    const spec = AUDIO.samples[id];
    return this.buses?.[spec?.bus || 'sfx'] || this.master;
  }

  /**
   * @param id     key in AUDIO.samples
   * @param opts   { volume, rate, pan (-1..1), loop }
   */
  play(id, opts = {}) {
    if (!this.ready || this.muted) return null;
    const spec = AUDIO.samples[id];
    if (!spec) return null;

    const { volume = 1, rate = 1, pan = 0 } = opts;
    const loop = opts.loop ?? spec.loop;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    let node = gain;
    if (pan && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      gain.connect(panner);
      node = panner;
    }
    node.connect(this._busFor(id));

    const buffer = this.buffers.get(id);
    let source;

    if (buffer) {
      source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      source.playbackRate.value = rate;
      source.connect(gain);
      source.start();
    } else {
      source = this._synth(spec.synth, gain, { rate, loop });
      if (!source) return null;
    }

    if (loop) {
      this.stop(id);
      this.loops.set(id, { source, gain });
    }
    return { source, gain };
  }

  stop(id, fade = 0.35) {
    const entry = this.loops.get(id);
    if (!entry) return;
    this.loops.delete(id);
    const now = this.ctx.currentTime;
    try {
      entry.gain.gain.cancelScheduledValues(now);
      entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
      entry.gain.gain.linearRampToValueAtTime(0, now + fade);
      entry.source.stop?.(now + fade + 0.05);
      entry.stopAll?.();
    } catch { /* already stopped */ }
  }

  /** Ambient bed: the looping music plus the low system hum underneath it. */
  startAmbience() {
    this.play('ambience', { volume: 0.9 });
    this.play('hum', { volume: 0.6 });
  }

  /** Ducks the music bed briefly so a transition cue reads clearly over it. */
  duck(amount = 0.45, hold = 0.35) {
    if (!this.ready) return;
    const g = this.buses.music.gain;
    const now = this.ctx.currentTime;
    const base = AUDIO.buses.music;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(base * amount, now + 0.08);
    g.linearRampToValueAtTime(base, now + 0.08 + hold);
  }

  setMuted(muted) {
    this.muted = muted;
    store.muted = muted;
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.25);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    bus.emit(EV.AUDIO_TOGGLE, { muted: this.muted });
    return this.muted;
  }

  /* ═════════════════════════════════════════════════════════════════════
     Synthesised fallbacks
     ═════════════════════════════════════════════════════════════════════ */

  _noiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Brown-ish noise: integrated white, which sits far better under a mix
    // than raw white noise does.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }

  _synth(kind, out, { rate = 1, loop = false } = {}) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const stops = [];
    const osc = (type, freq) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      stops.push(o);
      return o;
    };
    const env = (node, peak, attack, decay) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      node.connect(g);
      g.connect(out);
      return g;
    };

    switch (kind) {
      /* ── One-shots ── */
      case 'blip': {                    // hover
        const o = osc('sine', 1180 * rate);
        o.frequency.exponentialRampToValueAtTime(1560 * rate, t0 + 0.06);
        env(o, 0.16, 0.005, 0.075);
        o.start(t0); o.stop(t0 + 0.12);
        break;
      }
      case 'tick': {                    // UI toggle
        const o = osc('square', 880 * rate);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 2400;
        o.connect(f);
        env(f, 0.10, 0.002, 0.05);
        o.start(t0); o.stop(t0 + 0.08);
        break;
      }
      case 'click': {                   // confirm — body + transient
        const o = osc('sine', 220 * rate);
        o.frequency.exponentialRampToValueAtTime(110 * rate, t0 + 0.13);
        env(o, 0.34, 0.003, 0.16);
        o.start(t0); o.stop(t0 + 0.2);

        const n = ctx.createBufferSource();
        n.buffer = this._noiseBuffer(0.2);
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass'; nf.frequency.value = 2600; nf.Q.value = 1.4;
        n.connect(nf);
        env(nf, 0.13, 0.002, 0.07);
        n.start(t0); n.stop(t0 + 0.12);
        stops.push(n);
        break;
      }
      case 'sweepUp': {                 // focus a world
        const o = osc('sawtooth', 130 * rate);
        o.frequency.exponentialRampToValueAtTime(760 * rate, t0 + 0.42);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(400, t0);
        f.frequency.exponentialRampToValueAtTime(4800, t0 + 0.42);
        f.Q.value = 7;
        o.connect(f);
        env(f, 0.20, 0.02, 0.5);
        o.start(t0); o.stop(t0 + 0.6);

        const sub = osc('sine', 62);
        env(sub, 0.22, 0.01, 0.42);
        sub.start(t0); sub.stop(t0 + 0.5);
        break;
      }
      case 'sweepDown': {               // release focus
        const o = osc('sawtooth', 620 * rate);
        o.frequency.exponentialRampToValueAtTime(120 * rate, t0 + 0.38);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(3600, t0);
        f.frequency.exponentialRampToValueAtTime(360, t0 + 0.38);
        f.Q.value = 5;
        o.connect(f);
        env(f, 0.17, 0.015, 0.44);
        o.start(t0); o.stop(t0 + 0.55);
        break;
      }
      case 'chord': {                   // scan complete — a rising minor 9th
        const root = 196 * rate;        // G3
        [1, 1.2, 1.5, 2, 2.25].forEach((mul, i) => {
          const o = osc('triangle', root * mul);
          const g = ctx.createGain();
          const at = t0 + i * 0.055;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.11, at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 1.05);
          o.connect(g); g.connect(out);
          o.start(at); o.stop(at + 1.15);
        });
        break;
      }

      /* ── Loops ── */
      case 'scan': {                    // held-scan texture
        const o = osc('sawtooth', 320);
        const lfo = osc('sine', 7.5);
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 90;
        lfo.connect(lfoGain);
        lfoGain.connect(o.frequency);

        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.1);
        o.connect(f); f.connect(g); g.connect(out);
        o.start(t0); lfo.start(t0);
        break;
      }
      case 'drone': {                   // ambient music bed
        // Detuned fifths through a slowly opening lowpass — a simple,
        // genuinely non-repeating pad.
        const freqs = [55, 82.4, 110, 164.8];
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 1.2;

        const lfo = osc('sine', 0.055);
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 240;
        lfo.connect(lfoGain); lfoGain.connect(f.frequency);
        lfo.start(t0);

        freqs.forEach((freq, i) => {
          const a = osc('sawtooth', freq);
          const b = osc('sawtooth', freq * 1.004);   // beating detune
          const g = ctx.createGain();
          g.gain.value = 0.055 / (1 + i * 0.35);
          a.connect(g); b.connect(g); g.connect(f);
          a.start(t0); b.start(t0);
        });

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.85, t0 + 3.5);   // slow fade in
        f.connect(g); g.connect(out);
        break;
      }
      case 'hum': {                     // low room tone
        const n = ctx.createBufferSource();
        n.buffer = this._noiseBuffer(4);
        n.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 0.7;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.5, t0 + 2.5);
        n.connect(f); f.connect(g); g.connect(out);
        n.start(t0);
        stops.push(n);
        break;
      }
      default:
        return null;
    }

    // Give the caller something with a .stop() so loops can be torn down.
    return {
      stop(when) { for (const s of stops) { try { s.stop(when); } catch { /* noop */ } } },
    };
  }
}

export const audio = new AudioEngine();
