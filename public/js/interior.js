// Aetherhold — an apartment you can walk into.
//
// The room is modelled in local coordinates, baked down by material, then
// parked far outside the city grid. Entering is a teleport plus a switch of the
// collision set. Every piece is a real object: turned table legs, a sectioned
// sofa with piping, a glass shower door, a raked pendant shade over the island.

import * as THREE from "../vendor/three.module.js";
import {
  addMesh, lathe, mergeByMaterial, plate, roundedBox, tube, turnedCylinder,
  signTexture, soften,
} from "./render/kit.js";

const OFFSET = { x: 0, z: -420 };
const ROOM = { halfX: 7.6, halfZ: 5.6, height: 3.25 };

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
  // Distant blocks with a scatter of lit windows.
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

function artTexture(seed) {
  const element = document.createElement("canvas");
  element.width = 512;
  element.height = 384;
  const ctx = element.getContext("2d");
  ctx.fillStyle = seed % 2 ? "#1d2530" : "#efe7da";
  ctx.fillRect(0, 0, 512, 384);
  const palette = seed % 2
    ? ["#d8a657", "#3f6b8a", "#a4513c", "#6d7f63"]
    : ["#1c2430", "#b23a2c", "#3b5c76", "#c8a93f"];
  for (let i = 0; i < 7; i += 1) {
    ctx.fillStyle = palette[i % palette.length];
    ctx.globalAlpha = 0.55 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 512, Math.random() * 384);
    ctx.bezierCurveTo(Math.random() * 512, Math.random() * 384, Math.random() * 512,
      Math.random() * 384, Math.random() * 512, Math.random() * 384);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildInterior(materials) {
  const M = materials;
  const group = new THREE.Group();
  group.name = "apartment-interior";
  const colliders = [];

  const solid = (x, z, hx, hz) => colliders.push({ x: x + OFFSET.x, z: z + OFFSET.z, hx, hz });

  // ── shell ──
  const floor = new THREE.Mesh(roundedBox(ROOM.halfX * 2 + 0.6, 0.18, ROOM.halfZ * 2 + 0.6, 0.2),
    M.woodDark);
  floor.position.set(0, -0.09, 0);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(roundedBox(ROOM.halfX * 2 + 0.4, 0.22, ROOM.halfZ * 2 + 0.4, 0.2),
    M.paintWhite);
  ceiling.position.set(0, ROOM.height + 0.11, 0);
  group.add(ceiling);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.92 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4750, roughness: 0.88 });
  const walls = [
    { w: ROOM.halfX * 2 + 0.4, d: 0.24, x: 0, z: -ROOM.halfZ - 0.12, m: accentMaterial },
    { w: 0.24, d: ROOM.halfZ * 2 + 0.4, x: -ROOM.halfX - 0.12, z: 0, m: wallMaterial },
    { w: 0.24, d: ROOM.halfZ * 2 + 0.4, x: ROOM.halfX + 0.12, z: 0, m: wallMaterial },
    { w: ROOM.halfX * 2 + 0.4, d: 0.24, x: 0, z: ROOM.halfZ + 0.12, m: wallMaterial },
  ];
  walls.forEach((wall) => {
    addMesh(group, roundedBox(wall.w, ROOM.height + 0.4, wall.d, 0.06), wall.m,
      [wall.x, ROOM.height / 2, wall.z]);
  });
  // Skirting.
  [[0, -ROOM.halfZ + 0.02, ROOM.halfX * 1.95, 0.22], [0, ROOM.halfZ - 0.02, ROOM.halfX * 1.95, 0.22]]
    .forEach(([x, z, w, d]) => {
      addMesh(group, roundedBox(w, 0.16, d, 0.04), M.trim, [x, 0.08, z]);
    });

  // ── window with a real skyline behind it ──
  addMesh(group, roundedBox(0.3, 2.1, 6.2, 0.1), M.darkTrim, [ROOM.halfX - 0.02, 1.85, -0.4]);
  const viewMaterial = new THREE.MeshBasicMaterial({ map: cityViewTexture() });
  const view = new THREE.Mesh(plate(6.0, 1.9), viewMaterial);
  view.position.set(ROOM.halfX - 0.14, 1.85, -0.4);
  view.rotation.y = -Math.PI / 2;
  group.add(view);
  for (let i = 0; i < 3; i += 1) {
    addMesh(group, roundedBox(0.08, 2.1, 0.1, 0.02), M.darkTrim,
      [ROOM.halfX - 0.12, 1.85, -3.1 + i * 1.8]);
  }
  addMesh(group, roundedBox(0.34, 0.14, 6.3, 0.05), M.trim, [ROOM.halfX - 0.02, 0.86, -0.4]);
  addMesh(group, roundedBox(0.34, 0.14, 6.3, 0.05), M.trim, [ROOM.halfX - 0.02, 2.86, -0.4]);

  // Curtains: folded fabric panels either side of the glass.
  [-1, 1].forEach((side) => {
    for (let fold = 0; fold < 5; fold += 1) {
      const panel = new THREE.Mesh(roundedBox(0.16, 2.4, 0.2, 0.06), M.fabric);
      panel.position.set(ROOM.halfX - 0.34, 1.7, side * 2.9 + fold * 0.19 * side);
      group.add(panel);
    }
  });
  addMesh(group, turnedCylinder(0.05, 0.05, 6.6, { segments: 12 }), M.chrome,
    [ROOM.halfX - 0.36, 3.0, -0.4], [Math.PI / 2, 0, 0]);

  // ── rug ──
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.4, 1, 1), M.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-0.4, 0.012, 0.4);
  rug.receiveShadow = true;
  group.add(rug);

  // ── sofa: base, cushions, arms, back, piping, legs ──
  const sofa = new THREE.Group();
  sofa.position.set(-3.0, 0, 2.4);
  sofa.rotation.y = Math.PI;
  group.add(sofa);
  addMesh(sofa, roundedBox(3.4, 0.42, 1.35, 0.16), M.leather, [0, 0.42, 0]);
  for (let i = 0; i < 3; i += 1) {
    addMesh(sofa, roundedBox(1.02, 0.22, 1.12, 0.12), M.fabric, [-1.06 + i * 1.06, 0.6, 0.02]);
    addMesh(sofa, roundedBox(1.0, 0.7, 0.2, 0.1), M.fabric, [-1.06 + i * 1.06, 0.94, -0.54], [0.16, 0, 0]);
  }
  [-1, 1].forEach((side) => {
    addMesh(sofa, roundedBox(0.26, 0.72, 1.34, 0.12), M.leather, [side * 1.68, 0.7, 0]);
    addMesh(sofa, roundedBox(0.1, 0.1, 1.36, 0.04), M.leather, [side * 1.68, 1.06, 0]);
  });
  [[-1.4, 0.5], [1.4, 0.5], [-1.4, -0.5], [1.4, -0.5]].forEach(([x, z]) => {
    addMesh(sofa, turnedCylinder(0.06, 0.05, 0.22, { segments: 10 }), M.woodDark, [x, 0.13, z]);
  });
  // Throw cushions.
  [[-0.9, 0.92], [0.85, 0.9]].forEach(([x, z], index) => {
    const cushion = new THREE.Mesh(roundedBox(0.5, 0.44, 0.16, 0.1),
      index ? M.rug : M.carPaint("#c8a93f"));
    cushion.position.set(x, 0.98, z - 0.1);
    cushion.rotation.set(0.2, index ? -0.3 : 0.26, 0.1);
    sofa.add(cushion);
  });
  solid(-3.0, 2.4, 1.9, 0.85);

  // ── coffee table ──
  const table = new THREE.Group();
  table.position.set(-1.0, 0, 1.9);
  group.add(table);
  addMesh(table, roundedBox(2.0, 0.09, 1.0, 0.14), M.wood, [0, 0.44, 0]);
  addMesh(table, roundedBox(1.86, 0.04, 0.86, 0.06), M.woodDark, [0, 0.36, 0]);
  [[-0.82, 0.36], [0.82, 0.36], [-0.82, -0.36], [0.82, -0.36]].forEach(([x, z]) => {
    addMesh(table, turnedCylinder(0.05, 0.035, 0.4, { segments: 10 }), M.woodDark, [x, 0.2, z]);
  });
  // Books, a bowl and a remote.
  addMesh(table, roundedBox(0.34, 0.05, 0.26, 0.02), M.paintRed, [-0.5, 0.51, 0.1], [0, 0.2, 0]);
  addMesh(table, roundedBox(0.3, 0.04, 0.24, 0.02), M.paintWhite, [-0.48, 0.55, 0.12], [0, -0.1, 0]);
  addMesh(table, lathe([
    [0, 0], [0.16, 0], [0.2, 0.07], [0.17, 0.14], [0, 0.14],
  ], 18), M.terracotta, [0.42, 0.49, 0.02]);
  solid(-1.0, 1.9, 1.1, 0.6);

  // ── television wall ──
  const media = new THREE.Group();
  media.position.set(-1.0, 0, -4.9);
  group.add(media);
  addMesh(media, roundedBox(3.2, 0.42, 0.55, 0.08), M.woodDark, [0, 0.3, 0]);
  addMesh(media, roundedBox(3.1, 0.06, 0.5, 0.03), M.wood, [0, 0.52, 0]);
  addMesh(media, roundedBox(0.9, 0.4, 0.46, 0.06), M.darkTrim, [-1.0, 0.28, 0.02]);
  addMesh(media, roundedBox(0.5, 0.12, 0.36, 0.04), M.chrome, [0.9, 0.3, 0.02]);
  // Panel on the wall.
  addMesh(media, roundedBox(2.9, 1.66, 0.1, 0.05), M.iron, [0, 1.9, -0.42]);
  const screen = new THREE.Mesh(plate(2.74, 1.5),
    new THREE.MeshBasicMaterial({ map: cityViewTexture() }));
  screen.position.set(0, 1.9, -0.35);
  media.add(screen);
  addMesh(media, roundedBox(1.1, 0.09, 0.35, 0.04), M.iron, [0, 0.96, -0.3]);
  addMesh(media, roundedBox(0.16, 0.62, 0.16, 0.04), M.iron, [0, 0.66, -0.32]);
  // Speakers.
  [-1, 1].forEach((side) => {
    addMesh(media, roundedBox(0.34, 1.0, 0.34, 0.06), M.darkTrim, [side * 1.95, 1.2, -0.3]);
    addMesh(media, lathe([[0, 0], [0.13, 0], [0.15, 0.03], [0.13, 0.06], [0, 0.06]], 14), M.iron,
      [side * 1.95, 1.35, -0.16], [Math.PI / 2, 0, 0]);
    addMesh(media, lathe([[0, 0], [0.09, 0], [0.11, 0.03], [0.09, 0.06], [0, 0.06]], 14), M.iron,
      [side * 1.95, 1.05, -0.16], [Math.PI / 2, 0, 0]);
  });
  solid(-1.0, -4.9, 1.7, 0.5);

  // ── kitchen run: island, cabinets, sink, fridge ──
  const kitchen = new THREE.Group();
  kitchen.position.set(4.0, 0, -2.2);
  group.add(kitchen);
  addMesh(kitchen, roundedBox(3.6, 0.92, 1.5, 0.1), M.woodDark, [0, 0.46, 0]);
  addMesh(kitchen, roundedBox(3.9, 0.1, 1.72, 0.08), M.stone, [0, 0.97, 0]);
  for (let i = 0; i < 3; i += 1) {
    addMesh(kitchen, roundedBox(1.12, 0.78, 0.06, 0.03), M.wood,
      [-1.18 + i * 1.18, 0.46, 0.78]);
    addMesh(kitchen, roundedBox(0.5, 0.05, 0.08, 0.02), M.chrome, [-1.18 + i * 1.18, 0.74, 0.83]);
  }
  // Sink basin and swan-neck tap.
  const basin = new THREE.Mesh(lathe([
    [0, 0], [0.36, 0], [0.38, 0.06], [0.34, 0.2], [0.3, 0.2], [0.32, 0.06], [0, 0.06],
  ], 24), M.steel);
  basin.position.set(0.7, 1.0, 0);
  kitchen.add(basin);
  addMesh(kitchen, tube([
    [0.7, 1.02, -0.34], [0.7, 1.34, -0.36], [0.7, 1.44, -0.1], [0.7, 1.38, 0.04],
  ], 0.035, { segments: 16, radial: 7 }), M.chrome);
  // Hob and pans.
  addMesh(kitchen, roundedBox(0.8, 0.02, 0.55, 0.02), M.iron, [-0.9, 1.02, 0]);
  [[-1.1, 0.12], [-0.72, -0.1]].forEach(([x, z]) => {
    addMesh(kitchen, lathe([[0, 0], [0.16, 0], [0.19, 0.08], [0.16, 0.1], [0, 0.1]], 18),
      M.iron, [x, 1.03, z]);
  });
  solid(4.0, -2.2, 2.0, 0.9);

  // Stools on the living-room side of the island.
  [[-0.9, 1.4], [0.2, 1.4], [1.3, 1.4]].forEach(([x, z]) => {
    const stool = new THREE.Group();
    stool.position.set(4.0 + x, 0, -2.2 + z);
    group.add(stool);
    addMesh(stool, lathe([
      [0, 0], [0.22, 0], [0.24, 0.04], [0.2, 0.1], [0.06, 0.1], [0.05, 0.66], [0, 0.66],
    ], 16), M.steel);
    addMesh(stool, lathe([
      [0, 0], [0.24, 0], [0.26, 0.05], [0.24, 0.12], [0, 0.12],
    ], 18), M.leather, [0, 0.66, 0]);
    solid(4.0 + x, -2.2 + z, 0.3, 0.3);
  });

  // Fridge and pantry on the back wall.
  addMesh(group, roundedBox(0.94, 2.0, 0.78, 0.1), M.brushed, [6.2, 1.0, -4.4]);
  addMesh(group, roundedBox(0.9, 0.02, 0.76, 0.02), M.darkTrim, [6.2, 1.32, -4.0]);
  addMesh(group, roundedBox(0.06, 0.6, 0.07, 0.02), M.chrome, [5.72, 1.45, -4.02]);
  addMesh(group, roundedBox(0.06, 0.4, 0.07, 0.02), M.chrome, [5.72, 0.9, -4.02]);
  solid(6.2, -4.4, 0.55, 0.45);
  addMesh(group, roundedBox(1.5, 1.0, 0.6, 0.08), M.wood, [6.4, 2.6, -4.6]);
  for (let i = 0; i < 2; i += 1) {
    addMesh(group, roundedBox(0.66, 0.5, 0.05, 0.03), M.woodDark, [5.95 + i * 0.74, 2.6, -4.24]);
  }

  // Pendant lights over the island.
  [-1.0, 0.0, 1.0].forEach((x) => {
    addMesh(group, turnedCylinder(0.012, 0.012, 1.2, { segments: 6 }), M.iron, [4.0 + x, 2.7, -2.2]);
    addMesh(group, lathe([
      [0, 0], [0.34, 0], [0.3, 0.1], [0.16, 0.28], [0.06, 0.32], [0, 0.32],
    ], 20), M.iron, [4.0 + x, 2.05, -2.2]);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), M.lampWarm);
    bulb.position.set(4.0 + x, 2.03, -2.2);
    group.add(bulb);
  });

  // ── bed ──
  const bed = new THREE.Group();
  bed.position.set(-5.4, 0, -1.6);
  group.add(bed);
  addMesh(bed, roundedBox(3.0, 0.34, 3.9, 0.14), M.woodDark, [0, 0.24, 0]);
  addMesh(bed, roundedBox(2.86, 0.28, 3.7, 0.12), M.paintWhite, [0, 0.55, 0.02]);
  addMesh(bed, roundedBox(2.9, 0.16, 2.5, 0.1), M.fabric, [0, 0.72, 0.55]);
  addMesh(bed, roundedBox(2.96, 0.1, 0.7, 0.06), M.rug, [0, 0.76, 1.5]);
  [-0.72, 0.72].forEach((x) => {
    addMesh(bed, roundedBox(1.2, 0.22, 0.72, 0.12), M.paintWhite, [x, 0.82, -1.28], [-0.06, 0, 0]);
  });
  addMesh(bed, roundedBox(3.1, 1.1, 0.16, 0.08), M.leather, [0, 0.85, -1.95]);
  [[-1.3, 1.6], [1.3, 1.6], [-1.3, -1.6], [1.3, -1.6]].forEach(([x, z]) => {
    addMesh(bed, turnedCylinder(0.07, 0.06, 0.24, { segments: 10 }), M.woodDark, [x, 0.12, z]);
  });
  solid(-5.4, -1.6, 1.6, 2.0);

  // Bedside table with a lamp and a phone.
  addMesh(group, roundedBox(0.72, 0.52, 0.62, 0.08), M.wood, [-3.3, 0.26, -3.4]);
  addMesh(group, roundedBox(0.2, 0.04, 0.16, 0.02), M.paintWhite, [-3.3, 0.54, -3.4]);
  addMesh(group, lathe([
    [0, 0], [0.14, 0], [0.16, 0.03], [0.08, 0.1], [0.05, 0.3], [0, 0.3],
  ], 14), M.brass || M.chrome, [-3.3, 0.54, -3.6]);
  addMesh(group, lathe([
    [0, 0], [0.19, 0], [0.21, 0.06], [0.15, 0.24], [0, 0.24],
  ], 16), M.fabric, [-3.3, 0.86, -3.6]);
  solid(-3.3, -3.4, 0.5, 0.45);

  // Wardrobe: sliding doors and a mirror panel.
  addMesh(group, roundedBox(2.4, 2.3, 0.7, 0.1), M.woodDark, [3.6, 1.15, 4.6]);
  [-0.6, 0.6].forEach((x) => {
    addMesh(group, roundedBox(1.16, 2.2, 0.06, 0.03), M.wood, [3.6 + x, 1.15, 4.24]);
    addMesh(group, roundedBox(0.05, 0.5, 0.08, 0.02), M.chrome, [3.6 + x * 1.02, 1.15, 4.2]);
  });
  const mirror = new THREE.Mesh(plate(0.9, 1.9), M.glass);
  mirror.position.set(3.6, 1.2, 4.2);
  group.add(mirror);
  solid(3.6, 4.6, 1.3, 0.5);

  // ── art, plants, ceiling spots ──
  [[-1.0, -5.45, 0.1, 0], [5.0, 0.05, 1.6, Math.PI / 2], [-5.0, 5.45, 1.2, Math.PI]]
    .forEach(([x, z, size, rotation], index) => {
      addMesh(group, roundedBox(1.1 * size + 0.12, 0.82 * size + 0.12, 0.07, 0.03), M.woodDark,
        [x, 2.1, z], [0, rotation, 0]);
      const art = new THREE.Mesh(plate(1.1 * size, 0.82 * size),
        new THREE.MeshStandardMaterial({ map: artTexture(index), roughness: 0.85 }));
      art.position.set(x + Math.sin(rotation) * 0.05, 2.1, z + Math.cos(rotation) * 0.05);
      art.rotation.y = rotation;
      group.add(art);
    });

  // Plant in the corner: turned pot and a fan of leaves.
  const plant = new THREE.Group();
  plant.position.set(-6.6, 0, 4.5);
  group.add(plant);
  addMesh(plant, lathe([
    [0, 0], [0.34, 0], [0.42, 0.12], [0.46, 0.5], [0.5, 0.56], [0.42, 0.56], [0.4, 0.16], [0, 0.16],
  ], 22), M.terracotta);
  addMesh(plant, roundedBox(0.8, 0.06, 0.8, 0.05), M.bark, [0, 0.56, 0]);
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.foliage);
    leaf.scale.set(0.5, 1.9, 0.5);
    leaf.position.set(Math.cos(angle) * 0.3, 1.0 + Math.random() * 0.4, Math.sin(angle) * 0.3);
    leaf.rotation.set(Math.cos(angle) * 0.5, angle, Math.sin(angle) * 0.5);
    plant.add(leaf);
  }
  solid(-6.6, 4.5, 0.6, 0.6);

  // Ceiling downlights.
  for (let i = 0; i < 6; i += 1) {
    const x = -5.5 + (i % 3) * 5.5;
    const z = i < 3 ? -2.6 : 3.0;
    addMesh(group, lathe([
      [0, 0], [0.16, 0], [0.18, 0.03], [0.14, 0.06], [0, 0.06],
    ], 16), M.lampWarm, [x, ROOM.height - 0.06, z], [Math.PI, 0, 0]);
  }

  // Interior lighting: warm fill, a cool pool from the window and a lamp glow.
  const keyLight = new THREE.PointLight(0xffd3a1, 46, 22, 2);
  keyLight.position.set(-1.6, 2.7, 1.2);
  group.add(keyLight);
  const windowLight = new THREE.PointLight(0xbcd6ff, 30, 18, 2);
  windowLight.position.set(5.6, 1.9, -0.4);
  group.add(windowLight);
  const kitchenLight = new THREE.PointLight(0xffc07a, 24, 12, 2);
  kitchenLight.position.set(4.0, 2.2, -2.2);
  group.add(kitchenLight);

  // Bake the room: it is a static set, so one mesh per material is enough.
  mergeByMaterial(group);
  group.position.set(OFFSET.x, 0.02, OFFSET.z);
  group.visible = false;

  return {
    group,
    bounds: {
      x0: OFFSET.x - ROOM.halfX + 0.2, x1: OFFSET.x + ROOM.halfX - 0.2,
      z0: OFFSET.z - ROOM.halfZ + 0.2, z1: OFFSET.z + ROOM.halfZ - 0.2,
    },
    colliders,
    spawn: { x: OFFSET.x - 0.5, z: OFFSET.z + 4.2 },
    exit: { x: OFFSET.x, z: OFFSET.z + ROOM.halfZ - 0.6 },
    exitOutside: { x: 52, z: 13.4 },
    entrance: { x: 52, z: 13.4 },
    name: "APARTMENT 4B",
  };
}

export { OFFSET as INTERIOR_OFFSET };
