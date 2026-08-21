/**
 * ═══════════════════════════════════════════════════════════════════════
 *  GLSL library
 * ═══════════════════════════════════════════════════════════════════════
 *  The planets are not textured spheres — every surface is generated in the
 *  fragment shader from 3D simplex noise. That buys us: no texture downloads,
 *  correct seamless wrapping at the poles, animated weather, a real
 *  day/night terminator, and per-world art direction from a handful of
 *  uniforms instead of five 3MB image files.
 */

/* Ashima Arts 3D simplex noise (MIT licence) — the workhorse for every
 * surface, cloud band and nebula in the scene. */
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

/* Fractal Brownian motion — layered noise for continents and cloud decks. */
float fbm(vec3 p, int octaves, float lacunarity, float gain){
  float sum = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 8; i++){
    if (i >= octaves) break;
    sum += amp * snoise(p * freq);
    freq *= lacunarity;
    amp *= gain;
  }
  return sum;
}

/* Ridged variant — sharp mountain chains and storm filaments. */
float ridged(vec3 p, int octaves){
  float sum = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 8; i++){
    if (i >= octaves) break;
    float n = 1.0 - abs(snoise(p * freq));
    sum += amp * n * n;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
`;

/* ── Planet ───────────────────────────────────────────────────────────── */

export const PLANET_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vObjPos;

void main(){
  vObjPos = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const PLANET_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3  uDeep;        // ocean / low ground
uniform vec3  uBase;        // dominant land tone
uniform vec3  uAccent;      // highlands, storms, city glow
uniform vec3  uAtmo;        // rim colour
uniform vec3  uLightDir;    // normalised, world space
uniform float uNoiseScale;
uniform float uRidges;
uniform float uLandLevel;
uniform float uBands;       // 1.0 = gas giant
uniform float uNightLights;
uniform float uRoughness;
uniform int   uType;        // 0 gas · 1 terra · 2 ocean · 3 machine · 4 ice
uniform float uHover;       // 0..1
uniform float uFocus;       // 0..1
uniform float uScan;        // 0..1 sweep progress

varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vObjPos;

${NOISE}

void main(){
  vec3 n  = normalize(vNormalW);
  vec3 sp = normalize(vObjPos);
  vec3 p  = sp * uNoiseScale;

  /* Slow domain warp so weather drifts without the sphere visibly spinning. */
  vec3 warp = vec3(
    fbm(p * 0.55 + vec3(uTime * 0.012, 0.0, 0.0), 3, 2.0, 0.5),
    fbm(p * 0.55 + vec3(0.0, uTime * 0.009, 4.7), 3, 2.0, 0.5),
    fbm(p * 0.55 + vec3(9.1, 0.0, uTime * 0.011), 3, 2.0, 0.5)
  );

  float height = fbm(p + warp * 0.42, 6, 2.05, 0.52) * 0.62 + 0.5;
  float ridge  = ridged(p * 1.6 + warp * 0.3, 5);
  height = mix(height, height * 0.62 + ridge * 0.55, uRidges);

  /* Gas giants: latitude bands, wobbled by the warp so they never look striped. */
  float lat   = sp.y;
  float bandN = sin(lat * 13.0 + warp.y * 2.6 + uTime * 0.05) * 0.5 + 0.5;
  bandN = mix(bandN, fbm(vec3(sp.x * 0.7, lat * 9.0 + warp.y * 1.5, sp.z * 0.7), 4, 2.0, 0.5) * 0.5 + 0.5, 0.45);
  height = mix(height, bandN, uBands);

  /* ── Albedo per archetype ── */
  vec3 albedo;
  float wetness = 0.0;

  if (uType == 0) {                                   // GAS
    albedo = mix(uDeep, uBase, smoothstep(0.25, 0.75, height));
    albedo = mix(albedo, uAccent, smoothstep(0.72, 0.98, height) * 0.85);
  } else if (uType == 2) {                            // OCEAN
    float land = smoothstep(uLandLevel - 0.02, uLandLevel + 0.06, height);
    albedo = mix(uDeep, uBase, land);
    albedo = mix(albedo, uAccent, smoothstep(0.86, 1.0, height));
    wetness = 1.0 - land;
  } else if (uType == 3) {                            // MACHINE
    float plate = step(0.5, fract(height * 9.0));     // panelled shell
    float seam  = smoothstep(0.46, 0.5, fract(height * 9.0)) * (1.0 - smoothstep(0.5, 0.54, fract(height * 9.0)));
    albedo = mix(uDeep, uBase, plate * 0.7 + 0.15);
    albedo = mix(albedo, uAccent * 0.5, seam);
  } else if (uType == 4) {                            // ICE
    float shelf = smoothstep(uLandLevel - 0.12, uLandLevel + 0.12, height);
    albedo = mix(uDeep, uBase, shelf);
    albedo = mix(albedo, uAccent, pow(shelf, 3.0) * 0.9);
    wetness = 0.35;
  } else {                                            // TERRA
    float land = smoothstep(uLandLevel - 0.05, uLandLevel + 0.05, height);
    albedo = mix(uDeep, uBase, land);
    float lava = smoothstep(0.80, 0.97, height + sin(uTime * 0.4 + height * 20.0) * 0.02);
    albedo = mix(albedo, uAccent, lava);
    wetness = (1.0 - land) * 0.6;
  }

  /* ── Lighting: wrapped diffuse + a warm terminator band ── */
  float ndl = dot(n, normalize(uLightDir));

  /* Wrapped diffuse across the FULL lit hemisphere. The obvious
     smoothstep(-0.18, 0.42, ndl) saturates about 65 degrees from the light,
     so most of the visible disc clips to maximum brightness and the world
     renders as a flat coloured circle. Wrapping and then applying a gentle
     gamma keeps a continuous gradient from limb to terminator. */
  float day  = pow(clamp((ndl + 0.30) / 1.30, 0.0, 1.0), 1.4);
  float term = (1.0 - abs(ndl)) * smoothstep(-0.4, 0.25, ndl);

  vec3 lit = albedo * (0.055 + day * 1.32);
  lit += uAtmo * term * 0.22;                          // sunset ring

  /* Specular — sharp on water and ice, broad and dim elsewhere. */
  vec3 h = normalize(normalize(uLightDir) + vViewDir);
  float shininess = mix(14.0, 190.0, wetness);
  float spec = pow(max(dot(n, h), 0.0), shininess) * mix(0.05, 0.9, wetness) * (1.0 - uRoughness * 0.6);
  lit += vec3(1.0, 0.97, 0.92) * spec * day;

  /* ── Night side: settlement / machine lights ── */
  float night = 1.0 - day;
  if (uNightLights > 0.001){
    float grid = fbm(p * 3.1 + 17.0, 4, 2.1, 0.5) * 0.5 + 0.5;
    float cells = smoothstep(0.62, 0.78, grid);
    if (uType == 3){
      /* Pulses travel across the shell — the machine is still running. */
      cells *= 0.35 + 0.65 * (sin(uTime * 1.5 + sp.x * 9.0 + sp.y * 5.0) * 0.5 + 0.5);
    }
    lit += uAccent * cells * night * uNightLights * 0.95;
  }

  /* Ice emits a little of its own light on the dark side. */
  if (uType == 4) lit += uAccent * night * 0.07 * (0.6 + 0.4 * sin(uTime * 0.6));

  /* ── Fresnel rim + interaction response ── */
  /* Kept deliberately restrained: there is already a dedicated additive
     atmosphere shell outside this mesh, and bloom on top of that. Pushing the
     rim here as well flattens the surface into a glowing ball. */
  float fres = pow(1.0 - max(dot(n, vViewDir), 0.0), 4.0);
  lit += uAtmo * fres * (0.16 + uHover * 0.20 + uFocus * 0.16);
  lit += albedo * uHover * 0.10;

  /* Scan sweep: a bright latitude band travelling pole to pole. */
  if (uScan > 0.001){
    float sweep = 1.0 - abs(sp.y - (uScan * 2.4 - 1.2));
    sweep = pow(max(sweep, 0.0), 22.0);
    lit += uAtmo * sweep * 2.2;
    lit += uAccent * uScan * 0.06;
  }

  gl_FragColor = vec4(lit, 1.0);
}
`;

/* ── Atmosphere shell (back-faced, additive) ──────────────────────────── */

export const ATMO_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
void main(){
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const ATMO_FRAG = /* glsl */ `
precision highp float;
uniform vec3  uAtmo;
uniform vec3  uLightDir;
uniform float uIntensity;
uniform float uPower;
varying vec3 vNormalW;
varying vec3 vViewDir;

void main(){
  vec3 n = normalize(vNormalW);
  /* Back-face normals point inward — flip so the fresnel reads correctly. */
  float fres = pow(1.0 - max(dot(-n, vViewDir), 0.0), uPower);
  /* Scatter more where the star hits: a real limb, not a uniform halo. */
  float scatter = smoothstep(-0.55, 0.7, dot(-n, normalize(uLightDir)));
  float a = fres * uIntensity * (0.22 + scatter * 0.95);
  gl_FragColor = vec4(uAtmo * a, a);
}
`;

/* ── Planetary ring ───────────────────────────────────────────────────── */

export const RING_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const RING_FRAG = /* glsl */ `
precision highp float;
uniform vec3  uColor;
uniform vec3  uAccent;
uniform float uTime;
uniform float uInner;
uniform float uOuter;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorld;
${NOISE}

void main(){
  /* RingGeometry uv.x runs inner→outer, uv.y around the circumference. */
  float r = vUv.x;
  float theta = vUv.y * 6.2831853;

  float bands = fbm(vec3(r * 46.0, 0.0, 0.0), 5, 2.1, 0.55) * 0.5 + 0.5;
  float gaps  = smoothstep(0.30, 0.42, bands) * smoothstep(0.94, 0.72, bands);
  float chunk = fbm(vec3(cos(theta) * 3.0, sin(theta) * 3.0, r * 12.0 + uTime * 0.02), 3, 2.0, 0.5) * 0.5 + 0.5;

  float edge = smoothstep(0.0, 0.10, r) * smoothstep(1.0, 0.88, r);
  float a = gaps * edge * uOpacity * (0.55 + chunk * 0.6);

  vec3 col = mix(uColor, uAccent, bands * 0.7);
  col *= 0.65 + chunk * 0.8;

  gl_FragColor = vec4(col, a);
}
`;

/* ── Starfield ────────────────────────────────────────────────────────── */

export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3  aColor;
uniform float uTime;
uniform float uPixelRatio;
uniform float uTwinkle;
varying vec3  vColor;
varying float vAlpha;

void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  /* Twinkle is per-star phase-offset so the field never pulses in unison. */
  float tw = 0.65 + 0.35 * sin(uTime * 1.6 + aPhase * 6.2831);
  tw = mix(1.0, tw, uTwinkle);
  vAlpha = tw;
  /* 110 (not 260): stars are lens points, not sprites. Anything larger and
     additive blending plus bloom turns the field into confetti. */
  gl_PointSize = aSize * uPixelRatio * (110.0 / max(-mv.z, 0.001)) * tw;
  gl_Position = projectionMatrix * mv;
}
`;

export const STAR_FRAG = /* glsl */ `
precision highp float;
varying vec3  vColor;
varying float vAlpha;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  /* A tight core with a short falloff. The high exponent is what keeps the
     field reading as pinpoints once bloom widens every bright pixel. */
  float core = 1.0 - smoothstep(0.0, 0.5, r);
  float a = pow(core, 3.0) * 0.85;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

/* ── Drifting dust motes ──────────────────────────────────────────────── */

export const DUST_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;
void main(){
  vec3 p = position;
  /* Cheap per-mote drift entirely on the GPU — no CPU buffer updates. */
  p.x += sin(uTime * 0.18 + aPhase * 6.28) * 0.42;
  p.y += cos(uTime * 0.13 + aPhase * 4.71) * 0.36;
  p.z += sin(uTime * 0.11 + aPhase * 3.14) * 0.42;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.001);
  /* Motes are meant to be specks of suspended matter. Without the near fade a
     mote that drifts within a few units of the camera covers a third of the
     screen as a soft blob. */
  float near = smoothstep(2.5, 9.0, dist);
  vAlpha = (0.25 + 0.75 * (sin(uTime * 0.7 + aPhase * 6.28) * 0.5 + 0.5)) * near;
  gl_PointSize = aSize * uPixelRatio * (26.0 / dist);
  gl_Position = projectionMatrix * mv;
}
`;

export const DUST_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main(){
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float a = pow(1.0 - r * 2.0, 2.2) * vAlpha * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`;

/* ── Nebula backdrop (fullscreen, behind everything) ──────────────────── */

export const BACKDROP_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  /* Emit straight to the far plane — no view/projection needed. */
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const BACKDROP_FRAG = /* glsl */ `
precision highp float;
uniform float     uTime;
uniform vec2      uResolution;
uniform vec2      uVideoAspect;   // (scaleX, scaleY) for cover-fit
uniform sampler2D uVideo;
uniform float     uVideoMix;      // 0 until the video is decoding
uniform vec3      uColorA;
uniform vec3      uColorB;
uniform float     uIntensity;
varying vec2 vUv;
${NOISE}

void main(){
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  /* Two counter-drifting noise fields make a slow, non-repeating nebula. */
  float n1 = fbm(vec3(p * 1.6, uTime * 0.014), 5, 2.0, 0.55) * 0.5 + 0.5;
  float n2 = fbm(vec3(p * 2.9 + 31.0, uTime * -0.009), 4, 2.1, 0.5) * 0.5 + 0.5;

  /* Thresholds sit near the middle of the fbm's actual distribution. Placing
     them higher (the intuitive 0.42/0.92) clips almost the whole field to
     zero and the backdrop renders black — which is also exactly what a
     visitor sees when the video plate fails to decode, so the nebula has to
     carry the frame on its own. */
  float cloud = smoothstep(0.28, 0.72, n1) * 1.0 + smoothstep(0.44, 0.88, n2) * 0.7;
  cloud = pow(cloud, 1.5);           // more structure, less flat wash
  vec3 neb = mix(uColorA, uColorB, n2);
  neb *= cloud * uIntensity;

  /* Radial falloff keeps the centre clean so the planets stay readable, but
     never fully dark — a pure-black centre looks like a rendering failure. */
  float d = length(p);
  neb *= smoothstep(0.05, 1.45, d) * 0.72 + 0.3;

  /* A faint deep-space floor so the frame is never pure #000. */
  neb += uColorA * 0.06;

  vec3 col = neb;

  if (uVideoMix > 0.001){
    vec2 vuv = (uv - 0.5) * uVideoAspect + 0.5;
    vec3 vid = texture2D(uVideo, vuv).rgb;
    /* Screen-blend the plate over the nebula so both survive the bloom. */
    col = 1.0 - (1.0 - col) * (1.0 - vid * uVideoMix * 0.85);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ── Final grade pass ─────────────────────────────────────────────────── */

/**
 * One pass for the whole photographic finish: chromatic aberration that grows
 * toward the edges, animated grain, a soft vignette, a barely-there scanline,
 * and a `uFlash` uniform the camera rig drives during warp transitions.
 */
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse:    { value: null },
    uTime:       { value: 0 },
    uResolution: { value: [1, 1] },
    uVignette:   { value: 0.42 },
    uGrain:      { value: 0.055 },
    uAberration: { value: 0.0016 },
    uScanline:   { value: 0.028 },
    uSaturation: { value: 1.08 },
    uFlash:      { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uScanline, uSaturation, uFlash;
    uniform vec2  uResolution;
    varying vec2  vUv;

    float hash(vec2 p){
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main(){
      vec2 uv = vUv;
      vec2 c  = uv - 0.5;
      float d = dot(c, c);

      /* Lateral chromatic aberration — zero at centre, strongest at corners. */
      float amt = uAberration * (1.0 + d * 5.0) * (1.0 + uFlash * 8.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * amt).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * amt).b;

      /* Saturation around luma. */
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);

      /* Warp flash — a brief bloom-white lift on camera transitions. */
      col += vec3(0.55, 0.72, 1.0) * uFlash * 0.5;

      /* Vignette. */
      col *= 1.0 - uVignette * smoothstep(0.15, 0.78, d);

      /* Scanline, sub-perceptual but it kills banding in the gradients. */
      col *= 1.0 - uScanline * (0.5 + 0.5 * sin(uv.y * uResolution.y * 1.6));

      /* Animated grain, applied in a luma-weighted way so shadows stay clean. */
      float g = hash(uv * uResolution + fract(uTime) * 137.0) - 0.5;
      col += g * uGrain * (0.35 + luma * 0.9);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
