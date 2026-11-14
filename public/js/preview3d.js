// Aetherhold — a small real-time turntable so a character preset can be judged
// as a body, not as a colour swatch.

import * as THREE from "../vendor/three.module.js";
import { animateAvatar, buildAvatar } from "./character.js";

export class AvatarPreview {
  constructor(canvas) {
    this.canvas = canvas;
    if (!canvas) return;
    this.running = false;
    this.rotation = -0.35;
    this.dragging = false;
    this.lastX = 0;
    this.avatar = null;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 0.75, 0.05, 30);
    this.camera.position.set(0, 1.18, 3.1);
    this.camera.lookAt(0, 1.0, 0);

    const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x2a2018, 1.5);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe3bb, 3.2);
    key.position.set(-2.2, 3.4, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0006;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb8ff, 1.6);
    rim.position.set(2.4, 2.2, -2.2);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0xffb36b, 8, 6, 2);
    fill.position.set(0.6, 1.4, 1.8);
    this.scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 48),
      new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 0.86, metalness: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.09, 64),
      new THREE.MeshBasicMaterial({ color: 0xf2c97d, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    this.scene.add(ring);
    this.ring = ring;

    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      this.rotation += (event.clientX - this.lastX) * 0.009;
      this.lastX = event.clientX;
    });
    this.canvas.addEventListener("pointerup", () => { this.dragging = false; });
    this.canvas.addEventListener("pointerleave", () => { this.dragging = false; });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
    this.start();
  }

  setCharacter(character) {
    if (!this.canvas) return;
    if (this.avatar) {
      this.scene.remove(this.avatar);
      this.avatar = null;
    }
    this.avatar = buildAvatar(character);
    this.avatar.position.set(0, 0, 0);
    this.scene.add(this.avatar);
    this.avatar.rotation.y = this.rotation;
  }

  resize() {
    if (!this.renderer) return;
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || this.canvas.clientWidth || 320;
    const height = parent?.clientHeight || this.canvas.clientHeight || 400;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      const elapsed = this.clock.elapsedTime;
      if (!this.dragging) this.rotation += dt * 0.16;
      if (this.avatar) {
        this.avatar.rotation.y += (this.rotation - this.avatar.rotation.y) * Math.min(1, dt * 8);
        animateAvatar(this.avatar, {
          dt, elapsed, speed: 0, moving: false, running: false,
          headYaw: Math.sin(elapsed * 0.4) * 0.16, headPitch: 0, emote: "", firstPerson: false,
        });
      }
      if (this.ring) this.ring.material.opacity = 0.2 + Math.sin(elapsed * 1.6) * 0.06;
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  dispose() {
    this.stop();
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
  }
}
