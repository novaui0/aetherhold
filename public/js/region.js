// Aetherhold — the region around the hold: ring highway, secondary roads,
// river and bridge, canyon pass, climate zones, service sites and the people
// who work them.

import * as THREE from "../vendor/three.module.js";
import { animateAvatar, avatarLabelTexture, buildAvatar } from "./character.js";
import { CHARACTER_PRESETS } from "./store.js";

export const RING_RADIUS = 58;
const TAU = Math.PI * 2;

const materials = new Map();
const geometries = new Map();

function mat(color, options = {}) {
  const key = `${color}|${options.roughness ?? 0.9}|${options.metalness ?? 0}|${options.emissive ?? ""}|${options.opacity ?? 1}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: options.roughness ?? 0.9,
      metalness: options.metalness ?? 0,
      emissive: options.emissive ? new THREE.Color(options.emissive) : 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 1,
      transparent: (options.opacity ?? 1) < 1,
      opacity: options.opacity ?? 1,
      side: options.side ?? THREE.FrontSide,
      flatShading: options.flat ?? false,
    });
    materials.set(key, material);
  }
  return material;
}

function geo(key, build) {
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = build();
    geometries.set(key, geometry);
  }
  return geometry;
}

function mesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(...position);
  node.rotation.set(...rotation);
  node.scale.set(...scale);
  node.castShadow = true;
  node.receiveShadow = true;
  parent.add(node);
  return node;
}

function box(parent, w, h, d, material, position, rotation = [0, 0, 0]) {
  return mesh(parent, geo(`box${w}x${h}x${d}`, () => new THREE.BoxGeometry(w, h, d)), material, position, rotation);
}

let shadowTexture = null;

// A soft dark ellipse under a vehicle or a building. It is the cheapest way to
// stop objects from looking like they float above the ground.
function contactShadow(parent, radius = 3.4, opacity = 0.4, y = 0.02) {
  if (!shadowTexture) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(0,0,0,0.85)");
    gradient.addColorStop(0.55, "rgba(0,0,0,0.35)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    shadowTexture = new THREE.CanvasTexture(canvas);
  }
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: shadowTexture, transparent: true, opacity,
      depthWrite: false, color: 0x000000,
    })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  plane.renderOrder = 1;
  parent.add(plane);
  return plane;
}

function makeAsphaltTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#22222a";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i += 1) {
    const g = 38 + Math.random() * 46;
    ctx.fillStyle = `rgba(${g},${g},${g + 4},${0.2 + Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.3, 1.3);
  }
  ctx.strokeStyle = "rgba(12,12,16,0.5)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, 0);
    ctx.bezierCurveTo(Math.random() * size, size * 0.3, Math.random() * size, size * 0.7, Math.random() * size, size);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 34);
  texture.anisotropy = 8;
  return texture;
}

function makeGroundTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#39422f";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 24000; i += 1) {
    const g = 44 + Math.random() * 46;
    ctx.fillStyle = `rgba(${g * 0.68},${g},${g * 0.55},${0.12 + Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 2.6);
  }
  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 12 + Math.random() * 48;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(96,88,58,0.10)");
    gradient.addColorStop(1, "rgba(96,88,58,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(22, 22);
  texture.anisotropy = 8;
  return texture;
}

const SITE_LAYOUT = [
  { id: "garage", kind: "garage", angle: 22, radius: 82, npc: "mechanic", npc2: "courier" },
  { id: "fuel", kind: "fuel", angle: 90, radius: 80, npc: "attendant" },
  { id: "scrapyard", kind: "scrapyard", angle: 152, radius: 84, npc: "mechanic" },
  { id: "camp", kind: "camp", angle: 212, radius: 84, npc: "trader" },
  { id: "warehouse", kind: "warehouse", angle: 276, radius: 82, npc: "courier" },
  { id: "tower", kind: "viewpoint", angle: 336, radius: 78, npc: "northerner" },
];

const NPC_BY_KEY = {
  mechanic: "mechanic",
  courier: "courier",
  attendant: "runaway",
  trader: "trader",
  northerner: "northerner",
  hauler: "hauler",
};

function sitePoint(site) {
  const angle = (site.angle / 180) * Math.PI;
  return { x: Math.cos(angle) * site.radius, z: Math.sin(angle) * site.radius, angle };
}

function createLabel(text, color) {
  const texture = avatarLabelTexture(text, color);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.4, 0.6, 1);
  sprite.renderOrder = 8;
  return sprite;
}

function addTree(parent, x, z, scale = 1, snowy = false) {
  const trunk = mat("#4a382a", { roughness: 1 });
  const leaf = snowy ? mat("#d7e6ec", { roughness: 0.95 }) : mat("#25402e", { roughness: 1 });
  const height = (4 + Math.random() * 4) * scale;
  const trunkMesh = mesh(parent, geo("treeTrunk", () => new THREE.CylinderGeometry(0.18, 0.28, height * 0.6, 6)), trunk,
    [x, height * 0.3, z]);
  trunkMesh.castShadow = true;
  for (let i = 0; i < 3; i += 1) {
    const cone = mesh(parent, geo("treeCone", () => new THREE.ConeGeometry(1.5 - i * 0.35, height * 0.55, 8)), leaf,
      [x, height * (0.45 + i * 0.18), z], [0, Math.random() * TAU, 0]);
    cone.castShadow = true;
  }
}

function addRock(parent, x, z, size = 1, material = null) {
  const rock = mesh(parent, geo("rockGeo", () => new THREE.DodecahedronGeometry(1, 0)),
    material || mat("#5a5148", { roughness: 1, flat: true }),
    [x, size * 0.45, z], [Math.random(), Math.random(), Math.random()], [size, size * (0.7 + Math.random() * 0.6), size]);
  rock.castShadow = true;
  return rock;
}

function addRoadRings(group) {
  const asphalt = new THREE.MeshStandardMaterial({
    map: makeAsphaltTexture(), color: 0x8f8f9a, roughness: 0.94, metalness: 0.02,
  });
  asphalt.map.repeat.set(2, 30);
  const ring = new THREE.Mesh(new THREE.RingGeometry(RING_RADIUS - 4.2, RING_RADIUS + 4.2, 128), asphalt);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.021;
  ring.receiveShadow = true;
  group.add(ring);

  // Painted edge lines and a dashed centre line.
  [RING_RADIUS - 3.7, RING_RADIUS + 3.7].forEach((radius) => {
    const line = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.18, 128),
      new THREE.MeshBasicMaterial({ color: 0xe8e2d0, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.03;
    group.add(line);
  });
  for (let i = 0; i < 96; i += 1) {
    const angle = (i / 96) * TAU;
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.1),
      new THREE.MeshBasicMaterial({ color: 0xe6d9b0, transparent: true, opacity: 0.5 }));
    dash.rotation.x = -Math.PI / 2;
    dash.rotation.z = -angle;
    dash.position.set(Math.cos(angle) * RING_RADIUS, 0.031, Math.sin(angle) * RING_RADIUS);
    group.add(dash);
  }
  return asphalt;
}

// Street furniture: lamp posts with warm light pools, guardrail posts on the
// outer shoulder and kilometre markers. Cheap to draw, and they are what makes
// a ring road read as a place rather than a texture.
function addStreetFurniture(group) {
  const steel = mat("#4d525c", { metalness: 0.65, roughness: 0.45 });
  const dark = mat("#22262d", { roughness: 0.8 });
  const lampGlass = mat("#ffe9b8", { emissive: "#ffd489", emissiveIntensity: 1.7, roughness: 0.3 });
  const pool = new THREE.MeshBasicMaterial({
    color: 0xffc978, transparent: true, opacity: 0.11, depthWrite: false,
  });
  for (let i = 0; i < 20; i += 1) {
    const angle = (i / 20) * TAU + 0.09;
    const radius = RING_RADIUS + 6.2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const post = new THREE.Group();
    post.position.set(x, 0, z);
    post.rotation.y = -angle;
    // Column and arm.
    box(post, 0.18, 6.2, 0.18, steel, [0, 3.1, 0]);
    box(post, 0.14, 0.14, 1.5, steel, [0, 6.18, -0.72]);
    box(post, 0.9, 0.16, 0.4, dark, [0, 6.02, -1.44]);
    box(post, 0.62, 0.1, 0.3, lampGlass, [0, 5.92, -1.44]);
    // Foot and light pool on the ground.
    box(post, 0.42, 0.22, 0.42, dark, [0, 0.11, 0]);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 18), pool);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.035, -1.44);
    post.add(glow);
    group.add(post);
  }
  // Guardrail posts along the outer shoulder.
  const railGeo = new THREE.BoxGeometry(0.1, 0.55, 0.1);
  const railMat = mat("#8d939c", { metalness: 0.55, roughness: 0.5 });
  const beamGeo = new THREE.BoxGeometry(0.08, 0.16, 3.4);
  const count = 96;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU;
    const radius = RING_RADIUS + 4.9;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (i % 3 === 0) {
      const postMesh = new THREE.Mesh(railGeo, railMat);
      postMesh.position.set(x, 0.28, z);
      postMesh.castShadow = true;
      group.add(postMesh);
    }
    const beam = new THREE.Mesh(beamGeo, railMat);
    beam.position.set(x, 0.52, z);
    beam.rotation.y = -angle;
    group.add(beam);
  }
  // Kilometre stones down the inner shoulder.
  const stoneMat = mat("#d9d2c2", { roughness: 0.9 });
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * TAU + 0.2;
    const radius = RING_RADIUS - 5.4;
    box(group, 0.34, 0.7, 0.2, stoneMat,
      [Math.cos(angle) * radius, 0.35, Math.sin(angle) * radius], [0, -angle, 0]);
  }
}

function addSpoke(group, site, asphalt) {
  const { x, z, angle } = sitePoint(site);
  const length = Math.hypot(x, z) - RING_RADIUS + 8;
  const mid = RING_RADIUS + length / 2 - 2;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.2, length), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = -angle;
  road.position.set(Math.cos(angle) * mid, 0.022, Math.sin(angle) * mid);
  road.receiveShadow = true;
  group.add(road);
  return { x, z, angle, length };
}

function addFuelStation(group, site) {
  const { x, z, angle } = sitePoint(site);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = -angle + Math.PI / 2;
  group.add(root);

  const concrete = mat("#8d8a82", { roughness: 0.95 });
  const steel = mat("#b9c2cc", { metalness: 0.6, roughness: 0.4 });
  const brand = mat("#d94f3a", { roughness: 0.6, emissive: "#5a1b12", emissiveIntensity: 0.3 });
  mesh(root, geo("pad", () => new THREE.BoxGeometry(26, 0.16, 18)), concrete, [0, 0.08, 0]);
  box(root, 18, 0.5, 12, mat("#e6e1d4", { roughness: 0.8 }), [0, 5.4, 0]);
  [-7, 7].forEach((sx) => {
    box(root, 0.4, 5.2, 0.4, steel, [sx, 2.6, -4.5]);
    box(root, 0.4, 5.2, 0.4, steel, [sx, 2.6, 4.5]);
  });
  box(root, 18.4, 0.9, 0.35, brand, [0, 4.9, -6.05]);
  for (let i = 0; i < 3; i += 1) {
    const px = -5.5 + i * 5.5;
    box(root, 1.5, 2.3, 1.1, mat("#d8d2c4", { roughness: 0.55 }), [px, 1.2, 0]);
    box(root, 1.1, 0.9, 0.1, mat("#20242c", { emissive: "#7ad7c0", emissiveIntensity: 0.8, roughness: 0.3 }), [px, 1.85, 0.58]);
    box(root, 0.22, 0.9, 0.22, mat("#1c1c22"), [px + 0.5, 1.2, 0.5], [0, 0, 0.4]);
    for (let l = 0; l < 3; l += 1) {
      box(root, 2.4, 0.14, 0.02, mat("#e8e4d8", { emissive: "#ffe9b0", emissiveIntensity: 0.5 }), [0, 5.3, -6.2 + l * 0.02]);
    }
  }
  // Small shop with a warm window.
  box(root, 7, 3.4, 5, mat("#6b5a49", { roughness: 0.92 }), [9, 1.7, -6]);
  box(root, 7.4, 0.3, 5.4, mat("#3b3129"), [9, 3.5, -6]);
  box(root, 4.4, 1.6, 0.12, mat("#ffd79a", { emissive: "#ffb457", emissiveIntensity: 0.65 }), [9, 2.0, -3.45]);
  mesh(root, geo("siteSign", () => new THREE.CylinderGeometry(0.14, 0.14, 5.4, 6)), steel, [12.5, 2.7, 4]);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 0.16), brand);
  sign.position.set(12.5, 5.0, 4);
  root.add(sign);
  return root;
}

function addGarage(group, site) {
  const { x, z, angle } = sitePoint(site);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = -angle + Math.PI / 2;
  group.add(root);

  const wall = mat("#7d7466", { roughness: 0.95 });
  const roof = mat("#3a3c40", { roughness: 0.8, metalness: 0.3 });
  const door = mat("#4e5b63", { roughness: 0.6, metalness: 0.4 });
  mesh(root, geo("garagePad", () => new THREE.BoxGeometry(28, 0.16, 22)), mat("#7f7b70"), [0, 0.08, 0]);
  box(root, 20, 7, 13, wall, [0, 3.5, -3]);
  box(root, 21, 0.6, 14, roof, [0, 7.2, -3]);
  [-5, 5].forEach((sx) => {
    box(root, 7.6, 5.4, 0.3, door, [sx, 2.9, 3.55]);
    for (let i = 0; i < 6; i += 1) box(root, 7.4, 0.1, 0.06, mat("#2c3238"), [sx, 0.4 + i, 3.75]);
  });
  box(root, 9, 1.2, 0.2, mat("#b23a2b", { roughness: 0.6 }), [0, 6.2, 3.5]);
  box(root, 21, 0.25, 8, roof, [0, 7.35, 3.8]);
  [-9, 9].forEach((sx) => box(root, 0.35, 7, 0.35, mat("#5b544a"), [sx, 3.5, 3.2]));
  // Tyre stacks and a parts bench outside, so the yard reads as a working shop.
  for (let i = 0; i < 9; i += 1) {
    const tx = -11 + (i % 3) * 1.1;
    const tz = 8 + Math.floor(i / 3) * 1.1;
    mesh(root, geo("tyre", () => new THREE.TorusGeometry(0.5, 0.22, 8, 16)), mat("#1b1b1f", { roughness: 0.95 }),
      [tx, 0.36, tz], [Math.PI / 2, 0, 0]);
  }
  box(root, 4.2, 0.85, 1.2, mat("#5b4636"), [9.5, 0.75, 8]);
  box(root, 1.2, 0.5, 0.9, mat("#8b2f2a"), [10.2, 1.35, 8]);
  const lamp = new THREE.PointLight(0xffd9a0, 22, 24, 2);
  lamp.position.set(0, 6.4, 5.5);
  root.add(lamp);
  return root;
}

function addScrapyard(group, site) {
  const { x, z, angle } = sitePoint(site);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = -angle + Math.PI / 2;
  group.add(root);

  const rust = mat("#7a4f33", { roughness: 1 });
  const rustDark = mat("#553828", { roughness: 1 });
  const glass = mat("#334354", { metalness: 0.4, roughness: 0.3 });
  mesh(root, geo("scrapPad", () => new THREE.BoxGeometry(32, 0.14, 26)), mat("#5d5649"), [0, 0.07, 0]);
  for (let i = 0; i < 12; i += 1) {
    const cx = -12 + (i % 4) * 3.4;
    const cz = -8 + Math.floor(i / 4) * 4.6;
    const crushed = new THREE.Group();
    crushed.position.set(cx, 0.8, cz);
    crushed.rotation.y = (Math.random() - 0.5) * 0.5;
    box(crushed, 2.6, 1.0, 1.6, rust, [0, 0.3, 0]);
    box(crushed, 1.8, 0.6, 1.5, rustDark, [0.2, 1.0, 0]);
    box(crushed, 2.0, 0.35, 1.4, glass, [-0.2, 0.95, 0]);
    root.add(crushed);
  }
  for (let i = 0; i < 5; i += 1) {
    const stack = new THREE.Group();
    stack.position.set(11, 0, -9 + i * 3.4);
    for (let s = 0; s < 7; s += 1) {
      mesh(stack, geo("scrapTyre", () => new THREE.TorusGeometry(0.55, 0.22, 6, 14)), mat("#1c1c20"),
        [0, 0.3 + s * 0.34, 0], [Math.PI / 2, 0, 0]);
    }
    root.add(stack);
  }
  box(root, 9, 3, 6, rustDark, [8, 1.5, 9]);
  box(root, 9.6, 0.3, 6.6, mat("#3a3f43"), [8, 3.1, 9]);
  box(root, 4, 1.2, 0.2, mat("#d2a33c", { roughness: 0.7 }), [8, 2.2, 12.05]);
  return root;
}

function addCamp(group, site) {
  const { x, z, angle } = sitePoint(site);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = -angle + Math.PI / 2;
  group.add(root);

  const canvasMat = mat("#8a7a5c", { roughness: 0.98, side: THREE.DoubleSide });
  const canvasDark = mat("#5e5340", { roughness: 0.98, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i += 1) {
    const tent = new THREE.Group();
    tent.position.set(-9 + i * 7, 0, -5 + (i % 2) * 3);
    tent.rotation.y = (Math.random() - 0.5) * 0.5;
    const body = mesh(tent, geo("tent", () => new THREE.ConeGeometry(3.2, 3.0, 4, 1, true)), canvasMat,
      [0, 1.5, 0], [0, Math.PI / 4, 0]);
    body.castShadow = true;
    box(tent, 0.12, 2.4, 0.12, canvasDark, [0, 1.3, 1.7]);
    box(tent, 0.9, 0.1, 0.1, canvasDark, [0, 2.6, 0]);
    root.add(tent);
  }
  // Fire ring.
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * TAU;
    addRock(root, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0.35);
  }
  mesh(root, geo("campLog", () => new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6)), mat("#4a3123"),
    [0, 0.2, 2.4], [0, 0.4, Math.PI / 2]);
  mesh(root, geo("campLog2", () => new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6)), mat("#3d281e"),
    [0.2, 0.28, 2.4], [0, -0.6, Math.PI / 2.2]);
  const flame = new THREE.PointLight(0xff8a3c, 26, 22, 2);
  flame.position.set(0, 0.9, 2.4);
  root.add(flame);
  const ember = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.199, 7),
    new THREE.MeshBasicMaterial({ color: 0xff9c4a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  ember.position.set(0, 0.7, 2.4);
  root.add(ember);
  // Observation platform.
  const platform = new THREE.Group();
  platform.position.set(9, 0, 2);
  for (let i = 0; i < 4; i += 1) {
    const sx = i % 2 === 0 ? -2 : 2;
    const sz = i < 2 ? -2 : 2;
    box(platform, 0.25, 6, 0.25, mat("#6a5138"), [sx, 3, sz]);
  }
  box(platform, 4.6, 0.28, 4.6, mat("#7b5f40"), [0, 6.1, 0]);
  box(platform, 4.6, 0.8, 0.14, mat("#6a5138"), [0, 6.6, -2.2]);
  box(platform, 0.14, 0.8, 4.6, mat("#6a5138"), [2.2, 6.6, 0]);
  root.add(platform);
  return root;
}

function addWarehouse(group, site) {
  const { x, z, angle } = sitePoint(site);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = -angle + Math.PI / 2;
  group.add(root);

  const wall = mat("#6c6f6b", { roughness: 0.95, metalness: 0.1 });
  const roof = mat("#41484e", { roughness: 0.7, metalness: 0.4 });
  mesh(root, geo("warehousePad", () => new THREE.BoxGeometry(36, 0.16, 24)), mat("#5f5c52"), [0, 0.08, 0]);
  box(root, 26, 9, 15, wall, [0, 4.5, -3]);
  box(root, 27, 0.7, 16, roof, [0, 9.3, -3]);
  box(root, 8, 6.4, 0.3, mat("#4d555c", { metalness: 0.5, roughness: 0.5 }), [0, 3.2, 4.55]);
  for (let i = 0; i < 8; i += 1) box(root, 7.8, 0.1, 0.06, mat("#2f353a"), [0, 0.5 + i * 0.8, 4.75]);
  for (let i = 0; i < 6; i += 1) {
    const cx = -14 + (i % 3) * 2.6;
    const cz = 8 + Math.floor(i / 3) * 2.2;
    box(root, 2.2, 1.6, 2.0, mat("#8b7048", { roughness: 0.95 }), [cx, 0.9, cz]);
    box(root, 2.2, 0.12, 2.0, mat("#6d5738"), [cx, 1.72, cz]);
  }
  return root;
}

function addViewTower(group, site) {
  const { x, z } = sitePoint(site);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  group.add(root);
  const steel = mat("#7d858c", { metalness: 0.55, roughness: 0.45 });
  for (let i = 0; i < 4; i += 1) {
    const sx = i % 2 === 0 ? -1.6 : 1.6;
    const sz = i < 2 ? -1.6 : 1.6;
    box(root, 0.22, 14, 0.22, steel, [sx, 7, sz], [sz * 0.01, 0, sx * 0.01]);
  }
  for (let level = 0; level < 4; level += 1) {
    const y = 3 + level * 3.2;
    box(root, 3.6, 0.16, 0.16, steel, [0, y, -1.6]);
    box(root, 3.6, 0.16, 0.16, steel, [0, y, 1.6]);
    box(root, 0.16, 0.16, 3.6, steel, [-1.6, y, 0]);
    box(root, 0.16, 0.16, 3.6, steel, [1.6, y, 0]);
  }
  box(root, 4.4, 0.3, 4.4, mat("#5d5141"), [0, 14.2, 0]);
  for (let i = 0; i < 4; i += 1) {
    box(root, 4.4, 0.9, 0.08, steel, [0, 14.8, -2.1 + i * 1.4]);
  }
  const lamp = new THREE.PointLight(0xfff0c0, 16, 30, 2);
  lamp.position.set(0, 15.2, 0);
  root.add(lamp);
  return root;
}

function createNpcRecord(presetId, site, position, roleKey, language) {
  const preset = CHARACTER_PRESETS.find((item) => item.id === presetId) || CHARACTER_PRESETS[0];
  const group = buildAvatar({ ...preset, name: preset.name });
  group.position.set(position.x, 0, position.z);
  group.rotation.y = Math.random() * TAU;
  const label = createLabel(preset.name, preset.color);
  label.position.set(position.x, 2.2, position.z);
  return {
    group, label, preset, roleKey, site: site.id,
    target: new THREE.Vector3(position.x, 0, position.z),
    phase: Math.random() * TAU,
    talkUntil: 0,
  };
}

export class Region {
  constructor(scene, { world = null, language = "en" } = {}) {
    this.scene = scene;
    this.world = world;
    this.language = language;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sites = [];
    this.npcs = [];
    this.solids = [];
    this.time = 0;
    this.waterTexture = null;
    this.truck = null;
    this.towTruck = null;
    this._buildGround();
    this.asphalt = addRoadRings(this.group);
    addStreetFurniture(this.group);
    this._buildGeography();
    this._buildSites();
    this._buildPlazaInn();
    this._buildTruck();
  }

  _buildGround() {
    const groundTexture = makeGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(230, 96),
      new THREE.MeshStandardMaterial({ map: groundTexture, color: 0xffffff, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Climate zones painted into the land: snowfield north-east, desert
    // south-west, a darker forest belt to the west.
    const zones = [
      { x: 96, z: -78, radius: 62, color: 0xdfe8ea, name: "alpine" },
      { x: -100, z: 84, radius: 68, color: 0xc8a677, name: "desert" },
      { x: -112, z: -22, radius: 56, color: 0x2d4030, name: "forest" },
      { x: 112, z: 96, radius: 58, color: 0x4b5a3e, name: "temperate" },
    ];
    this.zones = zones;
    zones.forEach((zone) => {
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(zone.radius, 48),
        new THREE.MeshStandardMaterial({ color: zone.color, roughness: 1, transparent: true, opacity: 0.94 })
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(zone.x, -0.035, zone.z);
      patch.receiveShadow = true;
      this.group.add(patch);
    });

    for (let i = 0; i < 26; i += 1) {
      const angle = Math.random() * TAU;
      const radius = 110 + Math.random() * 100;
      addTree(this.group, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.9 + Math.random() * 0.8,
        angle > 0 && Math.cos(angle) > 0.2 && Math.sin(angle) < -0.1);
    }
    for (let i = 0; i < 14; i += 1) {
      const angle = Math.random() * TAU;
      const radius = 95 + Math.random() * 80;
      addRock(this.group, Math.cos(angle) * radius, Math.sin(angle) * radius, 1.2 + Math.random() * 2);
    }
  }

  _buildGeography() {
    // River crossing the eastern approach; the ring road bridge is the only
    // safe crossing for vehicles.
    const waterCanvas = document.createElement("canvas");
    waterCanvas.width = waterCanvas.height = 128;
    const wctx = waterCanvas.getContext("2d");
    wctx.fillStyle = "#22414a";
    wctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i += 1) {
      wctx.strokeStyle = `rgba(150,220,226,${0.04 + Math.random() * 0.14})`;
      wctx.lineWidth = 1;
      const y = Math.random() * 128;
      wctx.beginPath();
      wctx.moveTo(0, y);
      wctx.bezierCurveTo(40, y + 4, 80, y - 4, 128, y);
      wctx.stroke();
    }
    this.waterTexture = new THREE.CanvasTexture(waterCanvas);
    this.waterTexture.wrapS = this.waterTexture.wrapT = THREE.RepeatWrapping;
    this.waterTexture.repeat.set(3, 26);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 300),
      new THREE.MeshPhysicalMaterial({
        map: this.waterTexture, color: 0x7fa8b8, roughness: 0.12, metalness: 0.35,
        transparent: true, opacity: 0.9, clearcoat: 0.8, clearcoatRoughness: 0.1,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(64, 0.02, 0);
    this.group.add(water);
    this.river = { x: 64, halfWidth: 9, zMin: -150, zMax: 150, bridgeZ: 28, bridgeHalf: 7 };

    // River banks.
    [-1, 1].forEach((side) => {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 300), mat("#5b5647", { roughness: 1 }));
      bank.position.set(64 + side * 10, 0.2, 0);
      bank.receiveShadow = true;
      this.group.add(bank);
    });

    // The bridge itself, wide enough for a truck.
    const bridge = new THREE.Group();
    bridge.position.set(64, 0, this.river.bridgeZ);
    const deckMat = mat("#6d6a62", { roughness: 0.9 });
    const railMat = mat("#9aa3aa", { metalness: 0.6, roughness: 0.4 });
    box(bridge, 22, 0.55, 12, deckMat, [0, 0.22, 0]);
    [-5.6, 5.6].forEach((sz) => {
      box(bridge, 22, 0.16, 0.16, railMat, [0, 1.05, sz]);
      for (let i = -10; i <= 10; i += 2) box(bridge, 0.12, 1.0, 0.12, railMat, [i, 0.58, sz]);
    });
    this.group.add(bridge);

    // Canyon walls on the southern approach with a tunnel bore.
    const rock = mat("#6b5c4d", { roughness: 1, flat: true });
    for (let i = 0; i < 14; i += 1) {
      const z = -66 - i * 6;
      const height = 8 + Math.random() * 12;
      addRock(this.group, -13 - Math.random() * 4, z, 3 + Math.random() * 2.4, rock);
      addRock(this.group, 13 + Math.random() * 4, z, 3 + Math.random() * 2.4, rock);
      const wallL = new THREE.Mesh(new THREE.BoxGeometry(9, height, 6), rock);
      wallL.position.set(-9, height / 2, z);
      wallL.rotation.y = (Math.random() - 0.5) * 0.12;
      this.group.add(wallL);
      const wallR = wallL.clone();
      wallR.position.x = 9;
      wallR.rotation.y *= -1;
      this.group.add(wallR);
    }
    // Tunnel arch over the road.
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(6.2, 1.4, 8, 20, Math.PI),
      rock
    );
    arch.position.set(0, 0.2, -96);
    arch.rotation.y = Math.PI / 2;
    this.group.add(arch);
    box(this.group, 17, 1.4, 8, rock, [0, 8.2, -96]);
    this.canyon = { zMin: -130, zMax: -60, halfRoad: 6.4 };

    // Mountain ridge to the north with snow caps.
    for (let i = 0; i < 9; i += 1) {
      const angle = (-150 + i * 10) * Math.PI / 180;
      const radius = 190 + Math.random() * 40;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(26 + Math.random() * 16, 48 + Math.random() * 32, 7),
        mat(i % 3 === 0 ? "#e4edf0" : "#5c6068", { roughness: 1, flat: true }));
      peak.position.set(Math.cos(angle) * radius, 18, Math.sin(angle) * radius);
      peak.rotation.y = Math.random();
      this.group.add(peak);
    }
  }

  _buildSites() {
    SITE_LAYOUT.forEach((site) => {
      const point = sitePoint(site);
      addSpoke(this.group, site, this.asphalt);
      let root;
      if (site.kind === "garage") root = addGarage(this.group, site);
      else if (site.kind === "fuel") root = addFuelStation(this.group, site);
      else if (site.kind === "scrapyard") root = addScrapyard(this.group, site);
      else if (site.kind === "camp") root = addCamp(this.group, site);
      else if (site.kind === "warehouse") root = addWarehouse(this.group, site);
      else root = addViewTower(this.group, site);

      this.sites.push({ ...site, x: point.x, z: point.z, root, services: [site.kind] });
      this.solids.push({ x: point.x, z: point.z, radius: 6.5 });

      const npcPos = { x: point.x + 3.4, z: point.z + 3.2 };
      const npc = createNpcRecord(NPC_BY_KEY[site.npc] || "hauler", site, npcPos, site.npc, this.language);
      this.scene.add(npc.group);
      this.scene.add(npc.label);
      this.npcs.push(npc);

      if (site.npc2) {
        const second = createNpcRecord(NPC_BY_KEY[site.npc2] || "courier", site,
          { x: point.x - 4.0, z: point.z + 1.5 }, site.npc2, this.language);
        this.scene.add(second.group);
        this.scene.add(second.label);
        this.npcs.push(second);
      }
    });
  }

  _buildPlazaInn() {
    // The inn already exists at the centre; dress its edge with a doorway,
    // lanterns and the innkeeper so the hold is a real stop.
    const inn = new THREE.Group();
    inn.position.set(0, 0, 20.6);
    inn.rotation.y = Math.PI;
    const wall = mat("#5a4534", { roughness: 0.95 });
    const trim = mat("#7d6348", { roughness: 0.85 });
    box(inn, 9, 4.6, 4.2, wall, [0, 2.3, 0]);
    box(inn, 10, 0.5, 5.2, mat("#3b3027"), [0, 4.85, 0]);
    box(inn, 3.2, 2.6, 0.16, mat("#2c211a"), [0, 1.3, 2.16]);
    box(inn, 4.6, 1.5, 0.14, mat("#ffcf8a", { emissive: "#ffb457", emissiveIntensity: 0.75 }), [-3.1, 2.4, 2.14]);
    box(inn, 4.6, 1.5, 0.14, mat("#ffcf8a", { emissive: "#ffb457", emissiveIntensity: 0.75 }), [3.1, 2.4, 2.14]);
    box(inn, 1.6, 1.0, 0.2, trim, [0, 4.1, 2.1]);
    box(inn, 0.3, 4.6, 0.3, trim, [-4.7, 2.3, 2.1]);
    box(inn, 0.3, 4.6, 0.3, trim, [4.7, 2.3, 2.1]);
    for (let i = 0; i < 3; i += 1) {
      const lamp = new THREE.PointLight(0xffc07a, 12, 16, 2);
      lamp.position.set(-4 + i * 4, 4.2, 2.6);
      inn.add(lamp);
    }
    this.group.add(inn);
    this.solids.push({ x: 0, z: 20.6, radius: 5.6 });

    const innkeeper = createNpcRecord("runaway", { id: "inn", kind: "inn" },
      { x: -4.4, z: 13.6 }, "innkeeper", this.language);
    innkeeper.preset = { ...innkeeper.preset, name: "Nell Harrow" };
    this.scene.add(innkeeper.group);
    this.scene.add(innkeeper.label);
    this.npcs.push(innkeeper);
    this.sites.push({ id: "inn", kind: "inn", angle: 0, radius: 14, x: 0, z: 14, services: ["inn", "camp"], npcs: [innkeeper] });
  }

  _buildTruck() {
    this.truck = createTruck();
    const garage = this.sites.find((site) => site.id === "garage");
    // Park on the workshop side of the river, not in it.
    const x = garage ? garage.x + 7 : 60;
    const z = garage ? garage.z + 7 : 20;
    this.truck.position.set(x, 0, z);
    this.truck.rotation.y = 0.9;
    this.scene.add(this.truck);
    this.truckSpawn = { x, z, heading: 0.9 };
    this.towTruck = createTowTruck();
    this.towTruck.position.set(garage ? garage.x + 13 : 68, 0, garage ? garage.z + 2 : 28);
    this.towTruck.rotation.y = 1.1;
    this.scene.add(this.towTruck);
  }

  climateAt(x, z) {
    for (const zone of this.zones || []) {
      if ((x - zone.x) ** 2 + (z - zone.z) ** 2 < zone.radius ** 2) {
        return zone.name === "forest" ? "temperate" : zone.name;
      }
    }
    return "temperate";
  }

  isOnBridge(x, z) {
    return Math.abs(z - this.river.bridgeZ) <= this.river.bridgeHalf && Math.abs(x - this.river.x) <= 12;
  }

  isBlocked(x, z) {
    // River: only the bridge is passable.
    if (Math.abs(x - this.river.x) < this.river.halfWidth && z > this.river.zMin && z < this.river.zMax
      && !this.isOnBridge(x, z)) {
      return "water";
    }
    // Canyon walls either side of the tunnel road.
    if (z < this.canyon.zMax && z > this.canyon.zMin && Math.abs(x) > this.canyon.halfRoad && Math.abs(x) < 22) {
      return "rock";
    }
    for (const solid of this.solids) {
      if ((x - solid.x) ** 2 + (z - solid.z) ** 2 < (solid.radius * 0.55) ** 2) return "building";
    }
    return "";
  }

  nearestSite(x, z, maxDistance = 18) {
    let best = null;
    let bestDistance = maxDistance;
    for (const site of this.sites) {
      const distance = Math.hypot(x - site.x, z - site.z);
      if (distance < bestDistance) {
        best = site;
        bestDistance = distance;
      }
    }
    return best;
  }

  nearestNpc(x, z, maxDistance = 4.5) {
    let best = null;
    let bestDistance = maxDistance;
    for (const npc of this.npcs) {
      const distance = Math.hypot(x - npc.group.position.x, z - npc.group.position.z);
      if (distance < bestDistance) {
        best = npc;
        bestDistance = distance;
      }
    }
    return best;
  }

  setLanguage(language) {
    this.language = language;
  }

  update(dt, elapsed) {
    this.time += dt;
    if (this.waterTexture) this.waterTexture.offset.y = (this.waterTexture.offset.y + dt * 0.035) % 1;
    for (const npc of this.npcs) {
      const breathe = Math.sin(elapsed * 0.7 + npc.phase);
      const look = Math.sin(elapsed * 0.31 + npc.phase) * 0.5;
      animateAvatar(npc.group, {
        dt, elapsed, speed: 0, moving: false, running: false,
        headYaw: look, headPitch: breathe * 0.04, emote: "", firstPerson: false,
      });
      npc.label.position.set(npc.group.position.x, 2.18, npc.group.position.z);
    }
    if (this.towTruck) {
      this.towTruck.rotation.y += 0;
    }
  }

  disposes() {
    this.group.traverse((object) => {
      if (object.isMesh) {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose?.());
        else object.material?.dispose?.();
      }
    });
  }
}

export function createTruck(color = "#b34a3a") {
  const truck = new THREE.Group();
  truck.name = "truck";
  const paint = mat(color, { roughness: 0.42, metalness: 0.35 });
  const paintDark = mat("#7d2f25", { roughness: 0.5, metalness: 0.3 });
  const chrome = mat("#c8d0d8", { metalness: 0.85, roughness: 0.22 });
  const tyre = mat("#17171c", { roughness: 0.92 });
  const glass = mat("#1e2c38", { metalness: 0.6, roughness: 0.12, opacity: 0.85 });
  const headlight = mat("#fff3cf", { emissive: "#ffe6a8", emissiveIntensity: 1.1, roughness: 0.2 });
  const taillight = mat("#ff4e3a", { emissive: "#ff2a18", emissiveIntensity: 1.0, roughness: 0.3 });

  // Chassis and fifth wheel.
  box(truck, 2.4, 0.5, 8.4, mat("#2b2b30", { metalness: 0.5, roughness: 0.6 }), [0, 0.78, 0.4]);
  box(truck, 2.2, 0.25, 2.6, mat("#3d3d44", { metalness: 0.6 }), [0, 1.02, -0.4]);

  // Cab: tall nose, sleeper, roof fairing.
  box(truck, 2.45, 2.2, 2.6, paint, [0, 2.15, 2.75]);
  box(truck, 2.3, 1.4, 1.3, paintDark, [0, 1.55, 4.9]);
  box(truck, 2.5, 0.45, 2.7, paint, [0, 3.3, 2.65]);
  box(truck, 2.1, 0.45, 1.2, paint, [0, 3.05, 4.5]);
  box(truck, 2.3, 0.28, 0.35, chrome, [0, 1.02, 5.55]);
  // Grille and bumper.
  box(truck, 1.9, 0.95, 0.16, mat("#2a2c31", { metalness: 0.7, roughness: 0.35 }), [0, 1.9, 5.94]);
  for (let i = 0; i < 5; i += 1) box(truck, 1.7, 0.08, 0.08, chrome, [0, 1.55 + i * 0.18, 6.0]);
  box(truck, 2.45, 0.35, 0.5, chrome, [0, 0.86, 5.86]);
  // Windshield, side glass, mirrors.
  box(truck, 2.0, 1.1, 0.1, glass, [0, 2.75, 4.02], [0.18, 0, 0]);
  [-1, 1].forEach((side) => {
    box(truck, 0.1, 0.85, 0.9, glass, [side * 1.2, 2.55, 3.3]);
    box(truck, 0.08, 0.3, 0.5, chrome, [side * 1.42, 2.9, 4.35]);
    box(truck, 0.06, 0.55, 0.16, mat("#252a30"), [side * 1.48, 2.5, 4.2], [0, 0, side * 0.2]);
    // Headlights and indicators.
    box(truck, 0.55, 0.26, 0.12, headlight, [side * 0.85, 1.32, 5.9]);
    box(truck, 0.35, 0.18, 0.1, mat("#ffb347", { emissive: "#ff9a1f", emissiveIntensity: 0.9 }), [side * 1.1, 1.0, 5.9]);
  });
  // Exhaust stacks.
  [-1, 1].forEach((side) => {
    mesh(truck, geo("stack", () => new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8)), chrome,
      [side * 1.32, 2.1, 3.2]);
  });
  // Trailer.
  box(truck, 2.55, 2.65, 6.9, mat("#d9d4c6", { roughness: 0.55, metalness: 0.15 }), [0, 2.65, -4.4]);
  box(truck, 2.58, 0.18, 7.0, mat("#8e8a80"), [0, 3.98, -4.4]);
  box(truck, 2.58, 0.16, 7.0, mat("#5b5852"), [0, 1.36, -4.4]);
  for (let i = 0; i < 6; i += 1) box(truck, 2.6, 0.05, 0.08, mat("#a7a297"), [0, 1.6 + i * 0.4, -4.4]);
  [-1, 1].forEach((side) => {
    box(truck, 0.06, 0.16, 5.8, mat("#c0392b"), [side * 1.29, 2.3, -4.4]);
    box(truck, 0.4, 0.18, 0.1, taillight, [side * 0.85, 1.5, -7.9]);
    box(truck, 0.1, 0.4, 0.1, mat("#f2c14e", { emissive: "#d99a1a", emissiveIntensity: 0.5 }), [side * 1.25, 1.65, -7.7]);
  });
  // Mudflaps and rear bar.
  box(truck, 2.5, 0.22, 0.16, mat("#33343a"), [0, 0.65, -8.0]);
  // Wheels: steer axle + dual drive axles.
  const wheels = [];
  const axle = (x, z, radius = 0.52) => {
    [-1, 1].forEach((side) => {
      const tyreMesh = mesh(truck, geo(`truckWheel${radius}`, () => new THREE.CylinderGeometry(radius, radius, 0.42, 18)), tyre,
        [x * side, radius, z], [0, 0, Math.PI / 2]);
      mesh(truck, geo(`hub${radius}`, () => new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 0.44, 12)), chrome,
        [x * side, radius, z], [0, 0, Math.PI / 2]);
      wheels.push(tyreMesh);
    });
  };
  axle(1.16, 4.55);
  axle(1.16, -3.1, 0.56);
  axle(1.16, -4.35, 0.56);
  axle(1.16, -6.0, 0.56);
  contactShadow(truck, 4.6, 0.46);
  truck.userData = { wheels, headlights: [headlight, taillight] };
  return truck;
}

export function createTowTruck() {
  const tow = new THREE.Group();
  const paint = mat("#d9a441", { roughness: 0.45, metalness: 0.3 });
  const steel = mat("#9aa3aa", { metalness: 0.7, roughness: 0.35 });
  const tyre = mat("#17171c", { roughness: 0.92 });
  const glass = mat("#1e2c38", { metalness: 0.6, roughness: 0.15, opacity: 0.85 });
  box(tow, 2.2, 0.45, 5.4, mat("#2c2c32"), [0, 0.72, 0]);
  box(tow, 2.3, 1.9, 2.3, paint, [0, 1.85, 1.2]);
  box(tow, 2.05, 1.0, 0.12, glass, [0, 2.35, 2.4], [0.16, 0, 0]);
  box(tow, 2.35, 0.35, 0.4, steel, [0, 0.85, 2.75]);
  box(tow, 1.7, 0.6, 0.14, mat("#2a2c31"), [0, 1.5, 2.7]);
  box(tow, 0.5, 0.24, 0.1, mat("#fff3cf", { emissive: "#ffe6a8", emissiveIntensity: 1 }), [-0.75, 1.35, 2.72]);
  box(tow, 0.5, 0.24, 0.1, mat("#fff3cf", { emissive: "#ffe6a8", emissiveIntensity: 1 }), [0.75, 1.35, 2.72]);
  box(tow, 0.12, 0.35, 0.55, mat("#ffb020", { emissive: "#ffa000", emissiveIntensity: 1.6 }), [0, 2.85, 0.6]);
  // Flat bed and recovery boom.
  box(tow, 2.3, 0.18, 3.0, mat("#4a4a50"), [0, 1.08, -1.6]);
  box(tow, 0.35, 3.6, 0.35, steel, [0, 1.9, -2.4], [0.7, 0, 0]);
  box(tow, 0.45, 0.45, 1.8, steel, [0, 3.5, -3.2]);
  mesh(tow, geo("towHook", () => new THREE.TorusGeometry(0.28, 0.07, 5, 12)), steel, [0, 3.2, -3.9]);
  [-1, 1].forEach((side) => {
    [1.55, -1.4, -2.3].forEach((z) => {
      mesh(tow, geo("towWheel", () => new THREE.CylinderGeometry(0.48, 0.48, 0.4, 16)), tyre,
        [side * 1.05, 0.48, z], [0, 0, Math.PI / 2]);
    });
  });
  return tow;
}

export function spinWheels(truck, distance) {
  const wheels = truck?.userData?.wheels;
  if (!wheels) return;
  wheels.forEach((wheel) => { wheel.rotation.x -= distance / 0.52; });
}
