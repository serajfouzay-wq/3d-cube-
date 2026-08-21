import * as THREE from 'three';
import { BACKDROP_VERT, BACKDROP_FRAG } from './shaders.js';
import { ASSETS } from '../core/config.js';
import { damp } from '../core/math.js';

/**
 * Fullscreen procedural nebula that the supplied space plate is screen-blended
 * over. Drawing it *inside* the WebGL scene (instead of as a CSS video behind a
 * transparent canvas, as the original did) means it goes through bloom and the
 * grade pass with everything else — so the plate and the planets share one
 * exposure, one grain field and one vignette rather than looking like two
 * layers stacked in the DOM.
 *
 * If the video is missing or blocked from autoplaying, uVideoMix stays at 0 and
 * the nebula alone carries the frame. Nothing errors.
 */
export class Backdrop {
  constructor(stage) {
    this.stage = stage;
    this.videoReady = false;
    this.mixTarget = 0;

    this.material = new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERT,
      fragmentShader: BACKDROP_FRAG,
      uniforms: {
        uTime:        { value: 0 },
        uResolution:  { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uVideoAspect: { value: new THREE.Vector2(1, 1) },
        uVideo:       { value: null },
        uVideoMix:    { value: 0 },
        uColorA:      { value: new THREE.Color('#2a4a9c').convertSRGBToLinear() },
        uColorB:      { value: new THREE.Color('#7b3a9e').convertSRGBToLinear() },
        uIntensity:   { value: 0.68 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    stage.scene.add(this.mesh);

    window.addEventListener('resize', () => this._resize(), { passive: true });
  }

  /** Attaches the <video> element as a texture. Safe to call before it plays. */
  attachVideo(videoEl) {
    if (!videoEl) return;
    this.video = videoEl;

    const texture = new THREE.VideoTexture(videoEl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    this.material.uniforms.uVideo.value = texture;
    this.texture = texture;

    const onReady = () => {
      if (!videoEl.videoWidth) return;
      this.videoReady = true;
      this.mixTarget = 0.55;
      this._resize();
    };
    videoEl.addEventListener('loadeddata', onReady);
    videoEl.addEventListener('canplay', onReady);
    if (videoEl.readyState >= 2) onReady();

    // Autoplay can be refused until the first gesture; retry then, quietly.
    const tryPlay = () => videoEl.play().catch(() => {});
    tryPlay();
    window.addEventListener('pointerdown', tryPlay, { once: true });
  }

  /** Cover-fit maths: scale the shorter axis' UV range so nothing squashes. */
  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.material.uniforms.uResolution.value.set(w, h);

    if (!this.video?.videoWidth) return;
    const screenAspect = w / h;
    const videoAspect = this.video.videoWidth / this.video.videoHeight;
    const a = this.material.uniforms.uVideoAspect.value;
    if (screenAspect > videoAspect) a.set(1, videoAspect / screenAspect);
    else a.set(screenAspect / videoAspect, 1);
  }

  update(dt, elapsed) {
    this.material.uniforms.uTime.value = elapsed;
    const u = this.material.uniforms.uVideoMix;
    u.value = damp(u.value, this.mixTarget, 1.2, dt);
  }

  /** Dim the plate when a world is focused so the dossier text stays legible. */
  setFocused(on) { this.mixTarget = this.videoReady ? (on ? 0.24 : 0.55) : 0; }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}
