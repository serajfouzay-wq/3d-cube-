import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CAMERA, POST } from '../core/config.js';
import { store } from '../core/store.js';
import { GRADE_SHADER } from './shaders.js';
import { damp } from '../core/math.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Stage — renderer, camera and the post-processing chain
 * ═══════════════════════════════════════════════════════════════════════
 *  Chain:  Render → UnrealBloom → Grade → SMAA → Output
 *
 *  • Bloom before grade, so the grain and aberration sit on top of the
 *    glow rather than being smeared by it.
 *  • SMAA after grade, because anti-aliasing a grained image is what keeps
 *    the hairline UI-adjacent geometry (rings, orbit paths) from crawling.
 *    MSAA is unavailable once you render through a composer target, so
 *    SMAA is doing the real anti-aliasing work here.
 *  • OutputPass last — single point of ACES tone mapping + sRGB encode.
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // SMAA handles this; MSAA would be wasted
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });

    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x03050b, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05070f, 0.012);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      CAMERA.near,
      CAMERA.far
    );
    this.camera.position.fromArray(CAMERA.overview.position);
    this.camera.lookAt(0, 0, 0);

    this._buildComposer();
    this._buildLights();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });

    this.elapsed = 0;
    this.flash = 0;
  }

  _targetPixelRatio() {
    const cap = store.quality === 'high' ? 2 : store.quality === 'medium' ? 1.5 : 1;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  _buildComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const bloomCfg = POST.bloom[store.quality] || POST.bloom.high;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(this._targetPixelRatio());

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      bloomCfg.strength,
      bloomCfg.radius,
      bloomCfg.threshold
    );
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(GRADE_SHADER);
    const g = this.gradePass.uniforms;
    g.uVignette.value = POST.grade.vignette;
    g.uGrain.value = store.reduceMotion ? 0.02 : POST.grade.grain;
    g.uAberration.value = POST.grade.aberration;
    g.uScanline.value = POST.grade.scanline;
    g.uSaturation.value = POST.grade.saturation;
    g.uResolution.value = [window.innerWidth, window.innerHeight];
    this.composer.addPass(this.gradePass);

    // SMAA is comparatively costly; low tier skips it and leans on DPR.
    if (store.quality !== 'low') {
      this.smaaPass = new SMAAPass(
        window.innerWidth * this.renderer.getPixelRatio(),
        window.innerHeight * this.renderer.getPixelRatio()
      );
      this.composer.addPass(this.smaaPass);
    }

    this.composer.addPass(new OutputPass());
  }

  /**
   * Three-point rig. The key light doubles as the "star" whose direction is
   * fed to every planet shader, so the terminator on the spheres always
   * agrees with the specular highlights and the atmospheric scattering.
   */
  _buildLights() {
    /* Strongly side-on, only slightly toward the camera. This is the single
       most important value in the scene: it is what gives every world a
       visible terminator instead of flat, evenly-lit disc. Pointing it near
       the view axis (as a naive setup does) kills all form. */
    this.starDirection = new THREE.Vector3(-0.86, 0.30, 0.22).normalize();

    this.ambient = new THREE.AmbientLight(0x2a3d5c, 0.55);
    this.scene.add(this.ambient);

    this.hemi = new THREE.HemisphereLight(0x6f9dd8, 0x120a1e, 0.42);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff2e0, 2.15);
    this.keyLight.position.copy(this.starDirection).multiplyScalar(30);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x7cc4ff, 0.85);
    this.rimLight.position.set(6, -3, -9);
    this.scene.add(this.rimLight);

    this.fillLight = new THREE.PointLight(0x8f7bff, 1.1, 40, 2);
    this.fillLight.position.set(-8, 4, -6);
    this.scene.add(this.fillLight);
  }

  /** A short white lift used when the camera warps between views. */
  triggerFlash(amount = 0.35) {
    if (store.reduceMotion) return;
    this.flash = Math.max(this.flash, amount);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this._targetPixelRatio();

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);

    this.gradePass.uniforms.uResolution.value = [w, h];
    this.bloomPass?.setSize(w, h);
    this.smaaPass?.setSize(w * pr, h * pr);
  }

  render(dt) {
    this.elapsed += dt;
    this.flash = damp(this.flash, 0, 6.5, dt);
    this.gradePass.uniforms.uTime.value = this.elapsed;
    this.gradePass.uniforms.uFlash.value = this.flash;
    this.composer.render(dt);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}
