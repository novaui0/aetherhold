// interiors.js — themed interiors for every street door.
//
// One parameterised room shell plus a small prop library gives every building a
// real interior. Rooms are parked on a private grid hundreds of metres outside
// the city and revealed only when somebody walks in.

import * as THREE from "../vendor/three.module.js";
import {
  addMesh, lathe, mergeByMaterial, plate, roundedBox, turnedCylinder,
} from "./render/kit.js";

const THEMES = {
  house:     { floor: "woodDark", wall: 0x2f3038, accent: 0x3c4750 },
  shop:      { floor: "wood", wall: 0x33343a, accent: 0x4a3f34 },
  garage:    { floor: "concrete", wall: 0x2b2c30, accent: 0x3a3b40 },
  warehouse: { floor: "concrete", wall: 0x2a2b2f, accent: 0x3b3c42 },
  diner:     { floor: "wood", wall: 0x3a2c33, accent: 0x5a2f3f },
  bank:      { floor: "stone", wall: 0x2c2f38, accent: 0x3d4150 },
  kiosk:     { floor: "sidewalk", wall: 0x333a3d, accent: 0x46504f },
};

function cityViewTexture() {
  const element = document.createElement("canvas");
  element.width = 1024;
  element.height = 512;
  const ctx = element.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#0b1224");
  sky.addColorStop(0.42, "#28324e");
  sky.addColorStop(0.68, "#83553c");
  sky.addColorStop(1, "#1b1a22");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);
  for (let layer = 0; layer < 3; layer += 1) {
    const depth = layer / 2;
    const base = 300 + depth * 130;
    for (let i = 0; i < 18; i += 1) {
      const width = 30 + Math.random() * 80;
      const height = 60 + Math.random() * (170 + depth * 90);
      const x = Math.random() * 1024;
      ctx.fillStyle = `rgba(${14 + depth * 12},${16 + depth * 12},${24 + depth * 16},0.96)`;
      ctx.fillRect(x, base - height, width, height);
      for (let row = 0; row < height / 12; row += 1) {
        for (let col = 0; col < width / 10; col += 1) {
          if (Math.random() < 0.28) {
            ctx.fillStyle = Math.random() < 0.7 ? "rgba(255,206,140,0.75)" : "rgba(150,200,255,0.55)";
            ctx.fillRect(x + 3 + col * 10, base - height + 4 + row * 12, 4, 5);
          }
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildThemedInterior(kind = "house", index = 0, materials = {}) {
  const M = materials;
  const theme = THEMES[kind] || THEMES.house;
  const offset = {
    x: -300 - (index % 6) * 34,
    z: -420 - Math.floor(index / 6) * 34,
  };
  const halfX = 7.4;
  const halfZ = 5.2;
  const height = 3.2;
  const group = new THREE.Group();
  group.name = `interior-${kind}-${index}`;
  const colliders = [];
  const solid = (x, z, hx, hz) => colliders.push({ x: x + offset.x, z: z + offset.z, hx, hz });
  const floorMat = M[theme.floor] || M.woodDark;
  const wallMat = new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.92 });
  const accentMat = new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.86 });

  // ── shell ──
  addMesh(group, roundedBox(halfX * 2 + 0.6, 0.18, halfZ * 2 + 0.6, 0.2), floorMat,
    [0, -0.09, 0]).receiveShadow = true;
  addMesh(group, roundedBox(halfX * 2 + 0.4, 0.22, halfZ * 2 + 0.4, 0.2), M.paintWhite,
    [0, height + 0.11, 0]);
  [
    { w: halfX * 2 + 0.4, d: 0.24, x: 0, z: -halfZ - 0.12, m: accentMat },
    { w: 0.24, d: halfZ * 2 + 0.4, x: -halfX - 0.12, z: 0, m: wallMat },
    { w: 0.24, d: halfZ * 2 + 0.4, x: halfX + 0.12, z: 0, m: wallMat },
    { w: halfX * 2 + 0.4, d: 0.24, x: 0, z: halfZ + 0.12, m: wallMat },
  ].forEach((wall) => addMesh(group, roundedBox(wall.w, height + 0.4, wall.d, 0.06), wall.m,
    [wall.x, height / 2, wall.z]));
  addMesh(group, roundedBox(halfX * 1.9, 0.16, 0.2, 0.04), M.trim, [0, 0.08, -halfZ + 0.02]);
  addMesh(group, roundedBox(halfX * 1.9, 0.16, 0.2, 0.04), M.trim, [0, 0.08, halfZ - 0.02]);

  // ── window with a painted skyline ──
  addMesh(group, roundedBox(0.3, 2.0, 5.6, 0.1), M.darkTrim, [halfX - 0.02, 1.75, -0.2]);
  const view = new THREE.Mesh(plate(5.4, 1.8),
    new THREE.MeshBasicMaterial({ map: cityViewTexture() }));
  view.position.set(halfX - 0.14, 1.75, -0.2);
  view.rotation.y = -Math.PI / 2;
  group.add(view);
  for (let i = 0; i < 3; i += 1) {
    addMesh(group, roundedBox(0.08, 2.0, 0.1, 0.02), M.darkTrim,
      [halfX - 0.12, 1.75, -2.4 + i * 1.6]);
  }
  addMesh(group, roundedBox(0.34, 0.14, 5.7, 0.05), M.trim, [halfX - 0.02, 0.8, -0.2]);
  addMesh(group, roundedBox(0.34, 0.14, 5.7, 0.05), M.trim, [halfX - 0.02, 2.7, -0.2]);

  // ── exit door on the near wall ──
  addMesh(group, roundedBox(1.4, 2.45, 0.16, 0.05), M.darkTrim, [0, 1.3, halfZ - 0.04]);
  addMesh(group, roundedBox(1.2, 2.3, 0.1, 0.04), M.woodDark, [0, 1.25, halfZ - 0.12]);
  addMesh(group, roundedBox(0.1, 0.22, 0.1, 0.03), M.chrome, [0.45, 1.2, halfZ - 0.2]);
  addMesh(group, roundedBox(1.7, 0.1, 0.34, 0.04), M.lampWarm, [0, 2.58, halfZ - 0.16]);

  const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 3.6), M.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-0.6, 0.012, 0.4);
  rug.receiveShadow = true;
  group.add(rug);

  // ── props ──
  if (kind === "house") {
    addMesh(group, roundedBox(2.6, 0.36, 3.6, 0.14), M.woodDark, [-4.7, 0.28, -1.4]);
    addMesh(group, roundedBox(2.45, 0.24, 3.45, 0.1), M.paintWhite, [-4.7, 0.58, -1.4]);
    addMesh(group, roundedBox(2.5, 0.14, 2.2, 0.08), M.fabric, [-4.7, 0.73, -0.9]);
    addMesh(group, roundedBox(2.55, 0.1, 0.62, 0.05), M.rug, [-4.7, 0.78, 0.15]);
    addMesh(group, roundedBox(2.6, 1.0, 0.14, 0.07), M.leather, [-4.7, 0.86, -3.05]);
    solid(-4.7, -1.4, 1.4, 1.9);

    addMesh(group, roundedBox(2.2, 0.42, 1.0, 0.1), M.leather, [-0.4, 0.4, 2.9]);
    addMesh(group, roundedBox(1.0, 0.2, 1.0, 0.08), M.fabric, [-0.9, 0.58, 2.85]);
    addMesh(group, roundedBox(1.0, 0.2, 1.0, 0.08), M.fabric, [0.2, 0.58, 2.85]);
    solid(-0.4, 2.9, 1.3, 0.7);

    addMesh(group, roundedBox(2.0, 0.1, 1.0, 0.08), M.wood, [1.9, 0.44, 1.4]);
    [[1.1, 1.0], [2.7, 1.0]].forEach(([x, z]) =>
      addMesh(group, turnedCylinder(0.05, 0.04, 0.4, { segments: 8 }), M.woodDark, [x, 0.2, z]));
    solid(1.9, 1.4, 1.1, 0.6);

    addMesh(group, roundedBox(2.4, 0.92, 1.1, 0.1), M.woodDark, [4.8, 0.46, -3.2]);
    addMesh(group, roundedBox(2.55, 0.1, 1.25, 0.06), M.stone, [4.8, 0.97, -3.2]);
    addMesh(group, lathe([[0, 0], [0.3, 0], [0.33, 0.05], [0.28, 0.18], [0, 0.18]], 18),
      M.steel, [4.8, 1.0, -3.2]);
    solid(4.8, -3.2, 1.3, 0.6);
  }

  if (kind === "shop" || kind === "kiosk" || kind === "diner") {
    addMesh(group, roundedBox(6.4, 1.02, 0.9, 0.08), M.woodDark, [0.6, 0.51, -2.2]);
    addMesh(group, roundedBox(6.6, 0.1, 1.02, 0.06), M.stone, [0.6, 1.07, -2.2]);
    solid(0.6, -2.2, 3.3, 0.55);
    for (let i = 0; i < 4; i += 1) {
      addMesh(group, roundedBox(6.6, 0.09, 0.45, 0.04), M.wood, [0.6, 0.9 + i * 0.62, -4.7]);
      addMesh(group, roundedBox(6.4, 0.04, 0.4, 0.03), M.iron, [0.6, 1.2 + i * 0.62, -4.72]);
    }
    addMesh(group, roundedBox(0.7, 0.5, 0.5, 0.06), M.darkTrim, [2.8, 1.3, -2.2]);
    addMesh(group, plate(0.46, 0.3), new THREE.MeshStandardMaterial({
      color: 0x0c1a16, emissive: 0x2f8f6a, emissiveIntensity: 1.5,
    })).position.set(2.8, 1.34, -2.0);
    for (let i = 0; i < 5; i += 1) {
      addMesh(group, roundedBox(0.8, 0.8, 0.8, 0.08),
        M.carPaint(["#7d1f22", "#2c4d63", "#4d5a45", "#c9a227", "#5b2a43"][i]),
        [-4.6 + (i % 3) * 1.1, 0.64 + Math.floor(i / 3) * 0.82, -1.2]);
    }
    if (kind === "diner") {
      for (let i = 0; i < 4; i += 1) {
        addMesh(group, turnedCylinder(0.28, 0.24, 0.08, { segments: 14 }), M.leather,
          [-1.7 + i * 1.5, 0.75, -1.1]);
        addMesh(group, turnedCylinder(0.05, 0.06, 0.7, { segments: 8 }), M.chrome,
          [-1.7 + i * 1.5, 0.35, -1.1]);
      }
      addMesh(group, roundedBox(4.4, 0.16, 2.4, 0.1), M.leather, [-0.4, 0.46, 3.1]);
      addMesh(group, roundedBox(4.4, 1.0, 0.2, 0.08), M.leather, [-0.4, 0.95, 4.2]);
      addMesh(group, roundedBox(2.6, 0.1, 1.6, 0.06), M.wood, [-0.4, 0.78, 3.0]);
      solid(-0.4, 3.1, 2.3, 1.3);
      addMesh(group, roundedBox(0.1, 0.6, 0.1, 0.03), M.neonPink, [3.2, 2.5, -4.4]);
      addMesh(group, roundedBox(1.8, 0.1, 0.1, 0.03), M.neonPink, [3.2, 2.2, -4.4]);
    }
    if (kind === "kiosk") {
      addMesh(group, roundedBox(0.7, 1.6, 0.7, 0.08), M.brushed, [-3.2, 0.8, -4.5]);
      addMesh(group, roundedBox(0.5, 0.9, 0.5, 0.06), M.glass, [-3.2, 1.1, -4.15]);
    }
  }

  if (kind === "garage" || kind === "warehouse") {
    addMesh(group, roundedBox(5.0, 0.9, 1.0, 0.1), M.woodDark, [-2.6, 0.46, -4.4]);
    addMesh(group, roundedBox(5.1, 0.08, 1.1, 0.04), M.steel, [-2.6, 0.95, -4.4]);
    solid(-2.6, -4.4, 2.6, 0.6);
    for (let i = 0; i < 4; i += 1) {
      addMesh(group, roundedBox(0.9, 0.9, 0.9, 0.08), M.wood,
        [2.9 + (i % 2) * 1.0, 0.6 + Math.floor(i / 2) * 0.95, -2.0 + (i % 2) * 0.9]);
    }
    for (let i = 0; i < 3; i += 1) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 8, 18), M.rubber);
      tyre.position.set(4.9, 0.58 + i * 0.28, 2.6);
      tyre.rotation.x = Math.PI / 2;
      group.add(tyre);
    }
    addMesh(group, roundedBox(3.4, 1.0, 1.4, 0.1), M.brushed, [-1.0, 0.6, 2.4]);
    addMesh(group, roundedBox(3.5, 0.1, 1.5, 0.05), M.steel, [-1.0, 1.12, 2.4]);
    solid(-1.0, 2.4, 1.8, 0.8);
    if (kind === "garage") {
      addMesh(group, roundedBox(4.0, 0.14, 6.0, 0.05), M.iron, [0, 0.14, 0.4]);
      [[-1.5, -2.2], [1.5, -2.2], [-1.5, 2.8], [1.5, 2.8]].forEach(([x, z]) =>
        addMesh(group, turnedCylinder(0.11, 0.11, 0.18, { segments: 8 }), M.steel, [x, 0.18, z]));
    }
  }

  if (kind === "bank") {
    addMesh(group, roundedBox(4.8, 0.12, 2.0, 0.06), M.stone, [0.2, 0.95, -3.9]);
    [-2.0, 2.4].forEach((x) =>
      addMesh(group, turnedCylinder(0.2, 0.26, 0.95, { segments: 12 }), M.trim, [x, 0.48, -3.9]));
    addMesh(group, roundedBox(3.0, 0.9, 1.6, 0.1), M.woodDark, [0.2, 0.5, -1.4]);
    addMesh(group, roundedBox(0.5, 0.4, 0.35, 0.05), M.chrome, [1.0, 0.9, -1.4]);
    solid(0.2, -1.4, 1.6, 0.9);
    addMesh(group, roundedBox(2.4, 2.8, 0.4, 0.1), M.steel, [-5.8, 1.5, -4.6]);
    addMesh(group, roundedBox(1.8, 2.2, 0.2, 0.08), M.brushed, [-5.8, 1.5, -4.4]);
    [[-5.8, -4.2], [-4.6, -4.2], [-7.0, -4.2]].forEach(([x, z]) =>
      addMesh(group, turnedCylinder(0.09, 0.09, 0.3, { segments: 8 }), M.chrome,
        [x, 1.5, z], [Math.PI / 2, 0, 0]));
  }

  // A shared bench along the near wall and the two lights.
  addMesh(group, roundedBox(4.2, 0.42, 1.2, 0.08), M.woodDark, [0.2, 0.32, 4.2]);
  const key = new THREE.PointLight(0xffd3a1, 34, 18, 2);
  key.position.set(-1.4, 2.6, 0.6);
  group.add(key);
  const fill = new THREE.PointLight(0xbcd6ff, 20, 14, 2);
  fill.position.set(4.4, 1.9, -0.2);
  group.add(fill);

  mergeByMaterial(group);
  group.position.set(offset.x, 0.02, offset.z);
  group.visible = false;

  return {
    group,
    kind,
    bounds: {
      x0: offset.x - halfX + 0.2, x1: offset.x + halfX - 0.2,
      z0: offset.z - halfZ + 0.2, z1: offset.z + halfZ - 0.2,
    },
    colliders,
    spawn: { x: offset.x, z: offset.z + halfZ - 1.2 },
    exit: { x: offset.x, z: offset.z + halfZ - 0.5 },
    exitOutside: { x: 0, z: 0 },
    entrance: { x: 0, z: 0 },
    name: "INTERIOR",
  };
}
