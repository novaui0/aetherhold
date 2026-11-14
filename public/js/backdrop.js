// Aetherhold — the slow, breathing 3D diorama behind the main menu.

import * as THREE from "../vendor/three.module.js";

function emberTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,240,210,1)");
  gradient.addColorStop(0.35, "rgba(255,180,90,0.65)");
  gradient.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createBackdrop(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0814, 0.055);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 140);
  camera.position.set(0, 3.2, 12);

  scene.add(new THREE.AmbientLight(0x5a4a8a, 1.1));
  const key = new THREE.DirectionalLight(0xffd7a0, 1.6);
  key.position.set(6, 9, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0x8fb8ff, 22, 26, 2);
  rim.position.set(-7, 4, -4);
  scene.add(rim);

  const world = new THREE.Group();
  world.position.y = -1.2;
  scene.add(world);

  // Central floating crystal.
  const crystal = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 0),
    new THREE.MeshStandardMaterial({
      color: 0xf2c97d,
      emissive: 0xd99436,
      emissiveIntensity: 0.55,
      metalness: 0.35,
      roughness: 0.28,
      flatShading: true,
    })
  );
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.3, 1),
    new THREE.MeshBasicMaterial({ color: 0xf2c97d, wireframe: true, transparent: true, opacity: 0.13 })
  );
  crystal.add(core, shell);
  crystal.position.y = 3.1;
  world.add(crystal);

  // Floating shards orbiting the crystal.
  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b3459, roughness: 0.9, metalness: 0.1, flatShading: true,
  });
  const shards = [];
  for (let i = 0; i < 26; i += 1) {
    const radius = 3.4 + Math.random() * 5.2;
    const angle = Math.random() * Math.PI * 2;
    const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.5, 0), shardMaterial);
    shard.position.set(Math.cos(angle) * radius, 1.2 + Math.random() * 5, Math.sin(angle) * radius * 0.7);
    shard.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    shard.userData = {
      angle,
      radius,
      speed: 0.02 + Math.random() * 0.06,
      bob: Math.random() * Math.PI * 2,
      baseY: shard.position.y,
      spin: (Math.random() - 0.5) * 0.3,
    };
    shards.push(shard);
    world.add(shard);
  }

  // Ring of runes.
  const runeGroup = new THREE.Group();
  runeGroup.rotation.x = 0.38;
  runeGroup.position.y = 2.6;
  const runeMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fc4ff, emissive: 0x5b8fff, emissiveIntensity: 1.6, roughness: 0.3,
  });
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const rune = new THREE.Mesh(new THREE.TetrahedronGeometry(0.13, 0), runeMaterial);
    rune.position.set(Math.cos(angle) * 4.4, Math.sin(angle * 3) * 0.35, Math.sin(angle) * 4.4);
    rune.userData.angle = angle;
    runeGroup.add(rune);
  }
  world.add(runeGroup);

  // Embers.
  const emberCount = 420;
  const positions = new Float32Array(emberCount * 3);
  const speeds = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 1] = Math.random() * 12 - 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 16;
    speeds[i] = 0.12 + Math.random() * 0.55;
  }
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const embers = new THREE.Points(
    emberGeometry,
    new THREE.PointsMaterial({
      size: 0.16,
      map: emberTexture(),
      color: 0xffca7a,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(embers);

  // Distant star field.
  const starPositions = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i += 1) {
    const r = 40 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6;
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ size: 0.35, color: 0xbfd4ff, transparent: true, opacity: 0.55, depthWrite: false })
  );
  scene.add(stars);

  let width = 1;
  let height = 1;

  function resize(w, h, scale = 1) {
    width = w; height = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * scale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function update(dt, elapsed, pointer = { x: 0, y: 0 }) {
    crystal.rotation.y += dt * 0.16;
    crystal.rotation.x = Math.sin(elapsed * 0.24) * 0.12;
    crystal.position.y = 3.1 + Math.sin(elapsed * 0.7) * 0.16;
    shell.rotation.y -= dt * 0.09;

    for (const shard of shards) {
      const data = shard.userData;
      data.angle += dt * data.speed;
      shard.position.x = Math.cos(data.angle) * data.radius;
      shard.position.z = Math.sin(data.angle) * data.radius * 0.7;
      shard.position.y = data.baseY + Math.sin(elapsed * 0.5 + data.bob) * 0.4;
      shard.rotation.y += dt * data.spin;
      shard.rotation.x += dt * data.spin * 0.4;
    }

    runeGroup.rotation.z += dt * 0.06;
    runeGroup.children.forEach((rune, index) => {
      rune.rotation.x += dt * 0.5;
      rune.rotation.y += dt * 0.3;
      rune.position.y = Math.sin(elapsed * 1.1 + index) * 0.35;
    });

    const positions = emberGeometry.attributes.position.array;
    for (let i = 0; i < emberCount; i += 1) {
      positions[i * 3 + 1] += dt * speeds[i];
      positions[i * 3] += Math.sin(elapsed * 0.4 + i) * dt * 0.06;
      if (positions[i * 3 + 1] > 10) positions[i * 3 + 1] = -2.5;
    }
    emberGeometry.attributes.position.needsUpdate = true;

    stars.rotation.y += dt * 0.004;

    const driftX = pointer.x * 1.1;
    const driftY = pointer.y * 0.55;
    camera.position.x += (driftX + Math.sin(elapsed * 0.18) * 1.4 - camera.position.x) * Math.min(1, dt * 1.2);
    camera.position.y += (3.2 + driftY + Math.sin(elapsed * 0.26) * 0.4 - camera.position.y) * Math.min(1, dt * 1.2);
    camera.position.z = 12 + Math.sin(elapsed * 0.12) * 0.8;
    camera.lookAt(0, 2.6, 0);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { resize, update, render, renderer, scene, camera };
}
