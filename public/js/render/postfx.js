// Aetherhold — HDR post-processing.
//
// The scene is rendered into a half-float target, bloom is built with a
// dual-filter down/up chain, and a final pass does ACES filmic tonemapping,
// film grade, vignette, edge chromatic aberration and grain. Without a linear
// HDR buffer every highlight clips to flat white; with it lamps, glass and wet
// asphalt glow the way they do in a modern title.

import * as THREE from "../../vendor/three.module.js";

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 tap(vec2 offset) { return texture2D(tDiffuse, vUv + offset * uTexel).rgb; }
void main() {
  vec3 c = tap(vec2(0.0)) * 0.25;
  c += (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.125;
  c += (tap(vec2(-2.0, 0.0)) + tap(vec2(2.0, 0.0)) + tap(vec2(0.0, -2.0)) + tap(vec2(0.0, 2.0))) * 0.0625;
  float luma = max(c.r, max(c.g, c.b));
  float soft = clamp(luma - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contribution = max(soft, luma - uThreshold) / max(luma, 1e-4);
  gl_FragColor = vec4(c * contribution, 1.0);
}
`;

const DOWNSAMPLE = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.25;
  c += texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel).rgb * 0.125;
  c += texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uTexel).rgb * 0.125;
  c += texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uTexel).rgb * 0.125;
  c += texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uTexel).rgb * 0.125;
  c += texture2D(tDiffuse, vUv + vec2(-2.0, 0.0) * uTexel).rgb * 0.0625;
  c += texture2D(tDiffuse, vUv + vec2(2.0, 0.0) * uTexel).rgb * 0.0625;
  c += texture2D(tDiffuse, vUv + vec2(0.0, -2.0) * uTexel).rgb * 0.0625;
  c += texture2D(tDiffuse, vUv + vec2(0.0, 2.0) * uTexel).rgb * 0.0625;
  gl_FragColor = vec4(c, 1.0);
}
`;

const UPSAMPLE = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel * uRadius).rgb;
  c += texture2D(tDiffuse, vUv + vec2(0.0, -1.0) * uTexel * uRadius).rgb * 2.0;
  c += texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uTexel * uRadius).rgb;
  c += texture2D(tDiffuse, vUv + vec2(-1.0, 0.0) * uTexel * uRadius).rgb * 2.0;
  c += texture2D(tDiffuse, vUv).rgb * 4.0;
  c += texture2D(tDiffuse, vUv + vec2(1.0, 0.0) * uTexel * uRadius).rgb * 2.0;
  c += texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uTexel * uRadius).rgb;
  c += texture2D(tDiffuse, vUv + vec2(0.0, 1.0) * uTexel * uRadius).rgb * 2.0;
  c += texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uTexel * uRadius).rgb;
  gl_FragColor = vec4(c / 16.0, 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloom;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uAberration;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uShadows;
uniform vec3 uHighlights;
varying vec2 vUv;

// Narkowicz ACES approximation — cheap and film-like.
vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), c));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 centered = vUv - 0.5;
  float dist = length(centered);
  float aberration = uAberration * dist * dist;
  vec3 color;
  color.r = texture2D(tScene, vUv + centered * aberration).r;
  color.g = texture2D(tScene, vUv).g;
  color.b = texture2D(tScene, vUv - centered * aberration).b;

  color += texture2D(tBloom, vUv).rgb * uBloom;
  color *= uExposure;

  // Split-tone: cool the shadows, warm the highlights.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = color + uShadows * (1.0 - smoothstep(0.0, 0.42, luma)) * 0.06;
  graded += uHighlights * smoothstep(0.35, 1.6, luma) * 0.05;

  float vig = smoothstep(1.15, 0.28, dist * 1.32);
  graded *= mix(1.0, vig, uVignette);

  graded = aces(graded);
  float finalLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded = mix(vec3(finalLuma), graded, uSaturation);
  graded = (graded - 0.5) * uContrast + 0.5;

  float grain = hash(vUv * uResolution + uTime) - 0.5;
  graded += grain * uGrain;

  gl_FragColor = vec4(toSRGB(clamp(graded, 0.0, 1.0)), 1.0);
}
`;

function fullscreenGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return geometry;
}

export class PostFX {
  constructor(renderer, scene, camera, options = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = options.enabled !== false;
    this.time = 0;
    this.levels = options.levels ?? 5;
    this.quality = options.quality || "high";

    this.exposure = options.exposure ?? 1.05;
    this.bloomStrength = options.bloomStrength ?? 0.72;
    this.bloomThreshold = options.bloomThreshold ?? 0.78;
    this.vignette = options.vignette ?? 0.55;
    this.grain = options.grain ?? 0.028;
    this.aberration = options.aberration ?? 0.0032;
    this.saturation = options.saturation ?? 1.06;
    this.contrast = options.contrast ?? 1.045;

    this.geometry = fullscreenGeometry();
    this.camera2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(this.geometry, null);
    this.mesh.frustumCulled = false;
    this.quad = new THREE.Scene();
    this.quad.add(this.mesh);

    this.sceneTarget = null;
    this.down = [];
    this.up = [];
    this.width = 1;
    this.height = 1;

    this.brightMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: BRIGHT, depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: this.bloomThreshold },
        uKnee: { value: 0.32 },
      },
    });
    this.downMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: DOWNSAMPLE, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
    });
    this.upMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: UPSAMPLE, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true,
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 } },
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uExposure: { value: this.exposure },
        uBloom: { value: this.bloomStrength },
        uVignette: { value: this.vignette },
        uGrain: { value: this.grain },
        uTime: { value: 0 },
        uAberration: { value: this.aberration },
        uSaturation: { value: this.saturation },
        uContrast: { value: this.contrast },
        uShadows: { value: new THREE.Color(0.22, 0.34, 0.55) },
        uHighlights: { value: new THREE.Color(1.0, 0.72, 0.42) },
      },
    });

    this.previousToneMapping = renderer.toneMapping;
    this.previousAutoClear = renderer.autoClear;
  }

  setQuality(quality) {
    this.quality = quality;
    if (this.enabled) this.setSize(this.width, this.height, this.pixelRatio || 1);
  }

  get active() {
    return Boolean(this.enabled && this.sceneTarget && this.renderer.capabilities.isWebGL2);
  }

  setSize(width, height, pixelRatio = 1) {
    const w = Math.max(2, Math.floor(width * pixelRatio));
    const h = Math.max(2, Math.floor(height * pixelRatio));
    if (w === this.width && h === this.height && this.sceneTarget) {
      this.width = w;
      this.height = h;
      return;
    }
    this.width = w;
    this.height = h;
    this.pixelRatio = pixelRatio;
    this._disposeTargets();

    const samples = this.quality === "low" ? 0 : this.quality === "cinematic" ? 4 : 2;
    this.sceneTarget = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: this.renderer.capabilities.isWebGL2 ? samples : 0,
    });
    this.sceneTarget.texture.generateMipmaps = false;

    const levelCount = this.quality === "low" ? 3 : this.levels;
    let levelWidth = Math.max(2, Math.floor(w / 2));
    let levelHeight = Math.max(2, Math.floor(h / 2));
    for (let i = 0; i < levelCount; i += 1) {
      const options = {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      };
      this.down.push(new THREE.WebGLRenderTarget(levelWidth, levelHeight, options));
      this.up.push(new THREE.WebGLRenderTarget(levelWidth, levelHeight, options));
      this.down[i].texture.generateMipmaps = false;
      this.up[i].texture.generateMipmaps = false;
      levelWidth = Math.max(2, Math.floor(levelWidth / 2));
      levelHeight = Math.max(2, Math.floor(levelHeight / 2));
    }
    this.compositeMaterial.uniforms.uResolution.value.set(w, h);
  }

  _disposeTargets() {
    this.sceneTarget?.dispose();
    this.sceneTarget = null;
    this.down.forEach((target) => target.dispose());
    this.up.forEach((target) => target.dispose());
    this.down = [];
    this.up = [];
  }

  _draw(material, target, clear = true) {
    const renderer = this.renderer;
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.autoClear = false;
    if (clear) renderer.clear(true, true, false);
    renderer.render(this.quad, this.camera2d);
    renderer.autoClear = this.previousAutoClear;
  }

  render(dt = 0.016) {
    const renderer = this.renderer;
    this.time += dt;
    if (!this.active) {
      renderer.setRenderTarget(null);
      renderer.render(this.scene, this.camera);
      return;
    }

    const previousToneMapping = renderer.toneMapping;
    const previousTarget = renderer.getRenderTarget();
    renderer.toneMapping = THREE.NoToneMapping;

    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // Bright pass into the first, half-resolution mip.
    this.brightMaterial.uniforms.tDiffuse.value = this.sceneTarget.texture;
    this.brightMaterial.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
    this._draw(this.brightMaterial, this.down[0]);

    // Down chain.
    for (let i = 1; i < this.down.length; i += 1) {
      const previous = this.down[i - 1];
      this.downMaterial.uniforms.tDiffuse.value = previous.texture;
      this.downMaterial.uniforms.uTexel.value.set(1 / previous.width, 1 / previous.height);
      this._draw(this.downMaterial, this.down[i]);
    }

    // Up chain — each level blurs the accumulated coarser mip and adds it back
    // on top of the sharper mip, which is what gives the wide, soft falloff.
    const last = this.down.length - 1;
    let source = this.down[last];
    for (let i = last - 1; i >= 0; i -= 1) {
      // Copy the matching sharper mip in first…
      this.downMaterial.uniforms.tDiffuse.value = this.down[i].texture;
      this.downMaterial.uniforms.uTexel.value.set(1 / this.down[i].width, 1 / this.down[i].height);
      this.mesh.material = this.downMaterial;
      this._draw(this.downMaterial, this.up[i]);
      // …then add the filtered coarser level additively.
      this.upMaterial.uniforms.tDiffuse.value = source.texture;
      this.upMaterial.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
      this.upMaterial.uniforms.uRadius.value = 1.0;
      this._draw(this.upMaterial, this.up[i], false);
      source = this.up[i];
    }

    const composer = this.compositeMaterial.uniforms;
    composer.tScene.value = this.sceneTarget.texture;
    composer.tBloom.value = this.up[0].texture;
    composer.uTime.value = this.time % 1000;
    composer.uExposure.value = this.exposure;
    composer.uBloom.value = this.bloomStrength;

    renderer.setRenderTarget(previousTarget);
    this.mesh.material = this.compositeMaterial;
    renderer.render(this.quad, this.camera2d);

    renderer.toneMapping = previousToneMapping;
  }

  dispose() {
    this._disposeTargets();
    this.geometry.dispose();
    [this.brightMaterial, this.downMaterial, this.upMaterial, this.compositeMaterial]
      .forEach((material) => material.dispose());
    this.mesh.material = null;
    if (this.renderer) this.renderer.toneMapping = this.previousToneMapping;
  }
}
