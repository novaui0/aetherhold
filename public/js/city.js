// Aetherhold — the city district.
//
// A four-lane boulevard, four cross streets, raised pavements with real kerbs,
// storefront towers built storey by storey, a park, a filling station, an
// apartment block you can walk into, and enough street furniture that the
// pavement reads as a city rather than a set. Every solid here comes from the
// modelling kit (bevelled extrusions, lathed profiles, swept tubes), never from
// a bare box.

import * as THREE from "../vendor/three.module.js";
import {
  addMesh, contactShadow, facadeTexture, kitMaterials, lathe, mergeByMaterial,
  plate, roundedBox, signTexture, tube, turnedCylinder,
} from "./render/kit.js";
import { createCar, createTrafficCar, spinWheels } from "./vehicles.js";
import { createNpcRecord } from "./region.js";
import { buildInterior } from "./interior.js";
import { buildThemedInterior } from "./interiors.js";
import { Traffic } from "./traffic.js";

const TAU = Math.PI * 2;

export const AVE_HALF = 12;
export const CROSS_STREETS = [-140, -78, -26, 26, 78, 140];
export const CROSS_HALF = 10;
// Twice the old footprint: a residential west row, a harbour east row and a
// market back street south of the boulevard.
export const CITY_EDGE = { x: 180, z: 110 };

const STREETS = {
  avenue: "VINEWOOD BLVD",
  cross: ["WESTGATE", "ALTA ST", "POWER ST", "MISSION ROW", "ELGIN AVE", "HARBOR WAY"],
};

const BLOCKS = [
  { x0: -118, x1: -88, z0: 12, z1: 68, kind: "park" },
  { x0: -68, x1: -36, z0: 12, z1: 68, kind: "brick" },
  { x0: -16, x1: 16, z0: 12, z1: 68, kind: "tower" },
  { x0: 36, x1: 68, z0: 12, z1: 68, kind: "apartment" },
  { x0: 88, x1: 118, z0: 12, z1: 68, kind: "warehouse" },
  { x0: -118, x1: -88, z0: -68, z1: -12, kind: "lot" },
  { x0: -68, x1: -36, z0: -68, z1: -12, kind: "garage" },
  { x0: -16, x1: 16, z0: -68, z1: -12, kind: "shops" },
  { x0: 36, x1: 68, z0: -68, z1: -12, kind: "fuel" },
  { x0: 88, x1: 118, z0: -68, z1: -12, kind: "diner" },
  // ── west residential row ──
  { x0: -176, x1: -146, z0: 12, z1: 68, kind: "houses" },
  { x0: -176, x1: -146, z0: -68, z1: -12, kind: "houses" },
  // ── east harbour row ──
  { x0: 146, x1: 176, z0: 12, z1: 68, kind: "harbor" },
  { x0: 146, x1: 176, z0: -68, z1: -12, kind: "harbor" },
  // ── south market back street ──
  { x0: -68, x1: -36, z0: -104, z1: -80, kind: "alley" },
  { x0: 36, x1: 68, z0: -104, z1: -80, kind: "alley" },
  // ── north back gardens ──
  { x0: -68, x1: -36, z0: 80, z1: 104, kind: "park" },
  { x0: 36, x1: 68, z0: 80, z1: 104, kind: "park" },
];

export class City {
  constructor(scene, { world = null, language = "en" } = {}) {
    this.scene = scene;
    this.world = world;
    this.language = language;
    this.materials = kitMaterials();
    this.group = new THREE.Group();
    this.group.name = "city";
    scene.add(this.group);

    this.statics = new THREE.Group();
    this.dynamic = new THREE.Group();
    this.group.add(this.statics, this.dynamic);

    this.sites = [];
    this.npcs = [];
    this.solids = [];
    this.boxes = [];
    this.cars = [];
    this.roads = [];
    this.blips = [];
    this.blinkers = [];
    this.time = 0;
    this.inside = false;
    this.interior = null;
    this.blocks = BLOCKS;
    this.doors = [];
    this.interiors = new Map();
    this.doorMarkers = [];
    this.truck = null;
    this.neonSigns = [];

    const __t = performance.now();
    console.info("[city] start", Math.round(performance.now() - __t));

    this._buildSky();
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildSkyline();
    this._buildStreetFurniture();
    this._buildTraffic();
    this._spawnVehicle();
    this._buildDoors();
    this.traffic = new Traffic(this);

    mergeByMaterial(this.statics);
    console.info("[city] merge", Math.round(performance.now() - __t));
  }

  // ── sky ──────────────────────────────────────────────────────────────
  // A painted dome rather than a flat clear colour: the gradient, the low sun
  // and the haze band are what make the light in the district feel like a place
  // with weather instead of a studio.
  _buildSky() {
    const element = document.createElement("canvas");
    element.width = 1024;
    element.height = 512;
    const ctx = element.getContext("2d");
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#101a33");
    sky.addColorStop(0.24, "#25325a");
    sky.addColorStop(0.44, "#5d5f86");
    sky.addColorStop(0.56, "#a97f7d");
    sky.addColorStop(0.64, "#d79a6c");
    sky.addColorStop(0.7, "#8a6a63");
    sky.addColorStop(0.82, "#372c34");
    sky.addColorStop(1, "#161219");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    // Sun: a hot core with two washes of glow.
    const sunX = 742;
    const sunY = 286;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 300);
    glow.addColorStop(0, "rgba(255,246,224,1)");
    glow.addColorStop(0.06, "rgba(255,226,170,0.95)");
    glow.addColorStop(0.22, "rgba(255,176,110,0.42)");
    glow.addColorStop(0.55, "rgba(240,140,110,0.14)");
    glow.addColorStop(1, "rgba(240,140,110,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1024, 512);

    // Thin stratus bands catching the last light.
    for (let i = 0; i < 22; i += 1) {
      const y = 150 + Math.random() * 170;
      const w = 120 + Math.random() * 320;
      const x = Math.random() * 1024;
      const r = Math.round(210 + Math.random() * 40);
      const g = Math.round(170 + Math.random() * 50);
      const b = Math.round(150 + Math.random() * 60);
      const a = (0.05 + Math.random() * 0.1).toFixed(3);
      ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + a + ")";
      ctx.beginPath();
      ctx.ellipse(x, y, w, 5 + Math.random() * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // A dirty orange haze along the horizon — smog, not romance.
    const haze = ctx.createLinearGradient(0, 300, 0, 380);
    haze.addColorStop(0, "rgba(226,150,102,0)");
    haze.addColorStop(0.6, "rgba(226,150,102,0.24)");
    haze.addColorStop(1, "rgba(120,90,90,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 300, 1024, 80);

    const texture = new THREE.CanvasTexture(element);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(720, 48, 32),
      new THREE.MeshBasicMaterial({
        map: texture, side: THREE.BackSide, fog: false, depthWrite: false,
      })
    );
    dome.renderOrder = -10;
    dome.userData.noMerge = true;
    this.group.add(dome);
    this.sky = dome;
  }

  // ── ground and road network ───────────────────────────────────────────
  _buildGround() {
    const M = this.materials;
    // Everything outside the grid is scrub and dust.
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), M.grass);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.16;
    outer.receiveShadow = true;
    this.statics.add(outer);

    // The city plate: one asphalt slab the whole grid sits on.
    addMesh(this.statics, roundedBox(CITY_EDGE.x * 2, 0.32, CITY_EDGE.z * 2, 2.4, { bevel: 0.06 }),
      M.asphalt, [0, -0.16, 0]);

    // Distant hills so the horizon is not a hard line.
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * TAU + 0.3;
      const radius = 330 + Math.random() * 90;
      const ridge = new THREE.Mesh(
        new THREE.IcosahedronGeometry(60 + Math.random() * 70, 1),
        new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 1 })
      );
      ridge.position.set(Math.cos(angle) * radius, -12 - Math.random() * 6, Math.sin(angle) * radius);
      ridge.scale.set(1.6, 0.42, 1.2);
      this.statics.add(ridge);
    }
  }

  _buildRoads() {
    const M = this.materials;
    this.roads.push({ x1: -CITY_EDGE.x, z1: 0, x2: CITY_EDGE.x, z2: 0, w: AVE_HALF * 2, name: STREETS.avenue });
    CROSS_STREETS.forEach((x, index) => {
      this.roads.push({
        x1: x, z1: -CITY_EDGE.z, x2: x, z2: CITY_EDGE.z, w: CROSS_HALF * 2,
        name: STREETS.cross[index],
      });
    });

    const paint = (width, depth, x, z, material = M.paintWhite) => {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x, 0.014, z);
      mark.receiveShadow = true;
      this.statics.add(mark);
      return mark;
    };

    // Double yellow centre line, broken for every junction.
    const isJunction = (x) => CROSS_STREETS.some((c) => Math.abs(x - c) < CROSS_HALF + 3);
    for (let x = -CITY_EDGE.x + 4; x < CITY_EDGE.x - 4; x += 4) {
      if (isJunction(x)) continue;
      paint(3.4, 0.16, x + 1.7, -0.35, M.paintYellow);
      paint(3.4, 0.16, x + 1.7, 0.35, M.paintYellow);
    }
    // Lane dividers.
    [-6, 6].forEach((z) => {
      for (let x = -CITY_EDGE.x + 4; x < CITY_EDGE.x - 4; x += 9) {
        if (isJunction(x + 2)) continue;
        paint(4.2, 0.12, x + 2, z, M.paintWhite);
      }
    });
    // Kerb-side parking boxes and stop bars at every junction.
    CROSS_STREETS.forEach((cx) => {
      [-1, 1].forEach((side) => {
        for (let i = 0; i < 5; i += 1) {
          paint(0.12, 5.2, cx + side * (CROSS_HALF + 4 + i * 5.2), AVE_HALF - 4.4);
        }
        paint(0.3, 10, cx + side * (CROSS_HALF + 1.2), -6);
      });
      // Crosswalk ladders on both sides of the junction.
      [-1, 1].forEach((dir) => {
        for (let i = 0; i < 7; i += 1) {
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 8.4), M.paintWhite);
          stripe.rotation.x = -Math.PI / 2;
          stripe.position.set(cx + (i - 3) * 1.05, 0.016, dir * (AVE_HALF + 1.6));
          this.statics.add(stripe);
        }
        for (let i = 0; i < 6; i += 1) {
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 0.62), M.paintWhite);
          stripe.rotation.x = -Math.PI / 2;
          stripe.position.set(cx + dir * (CROSS_HALF + 2.2), 0.016, (i - 2.5) * 1.05);
          this.statics.add(stripe);
        }
      });
    });

    // Manhole covers, drains and puddles: the small proofs that it rains here.
    for (let i = 0; i < 22; i += 1) {
      const x = -CITY_EDGE.x + 10 + Math.random() * (CITY_EDGE.x * 2 - 20);
      const z = (Math.random() - 0.5) * AVE_HALF * 1.7;
      const cover = new THREE.Mesh(lathe([
        [0, 0], [0.42, 0], [0.44, 0.03], [0.42, 0.06], [0, 0.06],
      ], 20), M.iron);
      cover.position.set(x, 0.012, z);
      this.statics.add(cover);
    }
    const puddleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x2a3138, roughness: 0.02, metalness: 0.5,
      transparent: true, opacity: 0.55, envMapIntensity: 2.2,
    });
    for (let i = 0; i < 16; i += 1) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.7 + Math.random() * 1.7, 18), puddleMaterial);
      puddle.rotation.x = -Math.PI / 2;
      puddle.scale.set(1, 0.4 + Math.random() * 0.8, 1);
      puddle.position.set(
        -CITY_EDGE.x + 8 + Math.random() * (CITY_EDGE.x * 2 - 16),
        0.012,
        (Math.random() - 0.5) * AVE_HALF * 1.8
      );
      this.statics.add(puddle);
    }
  }

  // ── blocks ────────────────────────────────────────────────────────────
  _buildBlocks() {
    const M = this.materials;
    for (const block of BLOCKS) {
      const width = block.x1 - block.x0;
      const depth = block.z1 - block.z0;
      const cx = (block.x0 + block.x1) / 2;
      const cz = (block.z0 + block.z1) / 2;

      // Raised pavement with a bevelled kerb all round.
      addMesh(this.statics, roundedBox(width, 0.24, depth, 0.5, { bevel: 0.07 }),
        M.sidewalk, [cx, 0.12, cz]);
      // A planted strip keeps the pavement from looking poured in one piece.
      if (block.kind !== "park" && block.kind !== "lot") {
        addMesh(this.statics, roundedBox(width - 1.2, 0.3, 1.1, 0.4), M.stone,
          [cx, 0.2, block.z0 < 0 ? block.z1 - 0.8 : block.z0 + 0.8]);
      }

      const builder = {
        houses: () => this._housesBlock(block),
        harbor: () => this._harborBlock(block),
        alley: () => this._alleyBlock(block),
        park: () => this._parkBlock(block),
        brick: () => this._brickBlock(block),
        tower: () => this._towerBlock(block),
        apartment: () => this._apartmentBlock(block),
        warehouse: () => this._warehouseBlock(block),
        lot: () => this._lotBlock(block),
        garage: () => this._garageBlock(block),
        shops: () => this._shopsBlock(block),
        fuel: () => this._fuelBlock(block),
        diner: () => this._dinerBlock(block),
      }[block.kind];
      builder?.();
    }
  }

  // A building: mass with chamfered corners, slab bands, real windows on four
  // elevations, storefront at street level, cornice, parapet and roof plant.
  _building(config) {
    const M = this.materials;
    const {
      x, z, w, d, floors, floorHeight = 3.7, material = M.brick, facing = "south",
      storefront = true, sign = null, signColor, awning = null, rooftop = true,
      fireEscape = false, balconies = false, collider = true,
      interior = "shop", doorName = null, doorId = null,
    } = config;

    const height = floors * floorHeight;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);

    const dir = facing === "north" ? 1 : -1;
    const faceZ = (facing === "north" ? d / 2 : -d / 2);

    addMesh(root, roundedBox(w, height, d, 0.5, { bevel: 0.09 }), material, [0, height / 2, 0]);

    // Floor slabs read as horizontal shadow lines — the single strongest cue
    // that a block is a building and not a box.
    for (let floor = 1; floor < floors; floor += 1) {
      addMesh(root, roundedBox(w + 0.45, 0.26, d + 0.45, 0.16), M.trim, [0, floor * floorHeight, 0]);
    }

    // Corner pilasters.
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        addMesh(root, roundedBox(0.7, height, 0.7, 0.18), M.trim,
          [sx * (w / 2 - 0.05), height / 2, sz * (d / 2 - 0.05)]);
      });
    });

    const sides = [
      { axis: "z", offset: faceZ, dir, span: w, rotate: facing === "north" ? 0 : Math.PI },
      { axis: "z", offset: -faceZ, dir: -dir, span: w, rotate: facing === "north" ? Math.PI : 0 },
      { axis: "x", offset: w / 2, dir: 1, span: d, rotate: Math.PI / 2 },
      { axis: "x", offset: -w / 2, dir: -1, span: d, rotate: -Math.PI / 2 },
    ];

    for (const side of sides) {
      const isFront = side.dir === dir && side.axis === "z";
      // Tight grid on the street elevations, a wider one on the flanks: the
      // sides are read at a glance and do not need the same density.
      const cols = Math.max(2, Math.round(side.span / (side.axis === "z" ? 4.4 : 6.2)));
      const step = side.span / cols;
      for (let floor = 1; floor < floors; floor += 1) {
        const y = floor * floorHeight + floorHeight * 0.52;
        for (let col = 0; col < cols; col += 1) {
          const t = -side.span / 2 + step * (col + 0.5);
          const lit = Math.random() < (isFront ? 0.42 : 0.28);
          const winW = Math.min(2.1, step * 0.62);
          const winH = floorHeight * 0.52;
          if (side.axis === "z") {
            this._window(root, t, y, side.offset + side.dir * 0.02, winW, winH, side.rotate, lit);
          } else {
            this._window(root, side.offset + side.dir * 0.02, y, t, winW, winH, side.rotate, lit, true);
          }
        }
      }
    }

    // Storefront: recessed glass, mullions, door, sign band, canopy.
    if (storefront) {
      const baseH = floorHeight * 1.05;
      const glassW = w * 0.78;
      addMesh(root, roundedBox(w * 0.9, baseH * 0.86, 0.3, 0.1), M.iron,
        [0, baseH * 0.46, faceZ - dir * 0.22]);
      const front = new THREE.Mesh(plate(glassW, baseH * 0.66), M.storeGlass);
      front.position.set(0, baseH * 0.46, faceZ + dir * 0.06);
      front.rotation.y = facing === "north" ? 0 : Math.PI;
      root.add(front);

      const mullions = Math.max(2, Math.round(glassW / 1.7));
      for (let i = 0; i <= mullions; i += 1) {
        addMesh(root, roundedBox(0.1, baseH * 0.7, 0.16, 0.03), M.darkTrim,
          [-glassW / 2 + (glassW / mullions) * i, baseH * 0.46, faceZ + dir * 0.1]);
      }
      addMesh(root, roundedBox(glassW + 0.3, 0.14, 0.3, 0.05), M.darkTrim,
        [0, baseH * 0.84, faceZ + dir * 0.08]);
      addMesh(root, roundedBox(glassW + 0.3, 0.16, 0.34, 0.05), M.trim,
        [0, 0.12, faceZ + dir * 0.08]);

      // Door with a push bar.
      const doorX = w * 0.3;
      addMesh(root, roundedBox(1.0, baseH * 0.7, 0.12, 0.04), M.darkTrim,
        [doorX, baseH * 0.35, faceZ + dir * 0.12]);
      addMesh(root, roundedBox(0.06, 0.5, 0.1, 0.02), M.chrome,
        [doorX + 0.36, baseH * 0.36, faceZ + dir * 0.2]);

      // Sign board above the shopfront.
      if (sign) {
        const texture = signTexture(sign, { color: signColor || "#ffe6b0", background: "#0b0d12", border: signColor });
        const signMaterial = new THREE.MeshStandardMaterial({
          map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.9,
          roughness: 0.55, metalness: 0.15,
        });
        const board = new THREE.Mesh(plate(w * 0.72, baseH * 0.3), signMaterial);
        board.position.set(0, baseH * 1.02, faceZ + dir * 0.14);
        board.rotation.y = facing === "north" ? 0 : Math.PI;
        root.add(board);
        addMesh(root, roundedBox(w * 0.76, baseH * 0.34, 0.12, 0.04), M.darkTrim,
          [0, baseH * 1.02, faceZ + dir * 0.06]);
      }

      // Awning: a swept canvas with a valance.
      if (awning) {
        const awningMat = M.carPaint(awning);
        const aw = w * 0.8;
        const canopy = addMesh(root, roundedBox(aw, 0.1, 2.4, 0.05), awningMat,
          [0, baseH * 0.9, faceZ + dir * 1.15], [dir * -0.12, 0, 0]);
        canopy.castShadow = true;
        addMesh(root, roundedBox(aw, 0.34, 0.08, 0.03), awningMat,
          [0, baseH * 0.9 - 0.34, faceZ + dir * 2.3]);
        for (let i = 0; i <= 4; i += 1) {
          addMesh(root, roundedBox(0.06, 0.06, 2.3, 0.02), M.steel,
            [-aw / 2 + (aw / 4) * i, baseH * 0.9, faceZ + dir * 1.1]);
        }
      }
    }

    // Balconies for residential blocks.
    if (balconies) {
      for (let floor = 2; floor < floors; floor += 1) {
        for (let col = 0; col < 3; col += 1) {
          const bx = -w * 0.3 + col * w * 0.3;
          addMesh(root, roundedBox(w * 0.2, 0.12, 1.3, 0.05), M.trim,
            [bx, floor * floorHeight + 0.3, faceZ + dir * 0.7]);
          addMesh(root, roundedBox(w * 0.2, 0.85, 0.06, 0.04), M.glassLight,
            [bx, floor * floorHeight + 0.75, faceZ + dir * 1.32]);
        }
      }
    }

    // Cornice and parapet.
    addMesh(root, roundedBox(w + 1.1, 0.7, d + 1.1, 0.22), M.trim, [0, height + 0.12, 0]);
    addMesh(root, roundedBox(w + 0.2, 0.55, d + 0.2, 0.14), material, [0, height + 0.62, 0]);
    addMesh(root, roundedBox(w, 0.3, d, 0.2), M.roof, [0, height + 0.34, 0]);

    if (rooftop) this._rooftop(root, w, d, height);

    if (fireEscape) this._fireEscape(root, w, d, height, faceZ, dir);

    if (collider) {
      this.boxes.push({ x, z, hx: w / 2 + 0.3, hz: d / 2 + 0.3 });
    }
    if (interior !== false) {
      const label = doorName || (Array.isArray(sign) ? sign[0] : sign) || "THE DOOR";
      this._registerDoor({
        id: doorId || `door-${this.doors.length}`,
        name: label,
        template: interior || "shop",
        x,
        z: z + faceZ + dir * 1.7,
      });
    }
    return { root, height, width: w, depth: d };
  }

  _window(parent, x, y, z, w, h, rotationY, lit = false, sideways = false) {
    const M = this.materials;
    const nx = Math.sin(rotationY);
    const nz = Math.cos(rotationY);

    const reveal = new THREE.Mesh(plate(w + 0.14, h + 0.14), M.darkTrim);
    reveal.position.set(x - nx * 0.01, y, z - nz * 0.01);
    reveal.rotation.y = rotationY;
    parent.add(reveal);

    const glass = new THREE.Mesh(plate(w, h), lit
      ? (Math.random() < 0.75 ? M.windowLit : M.windowCool)
      : M.glass);
    glass.position.set(x, y, z);
    glass.rotation.y = rotationY;
    parent.add(glass);

    if (!sideways) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.1, 0.28), M.trim);
      sill.position.set(x + nx * 0.12, y - h / 2 - 0.07, z + nz * 0.12);
      sill.rotation.y = rotationY;
      sill.castShadow = true;
      parent.add(sill);
    }
  }

  _rooftop(parent, w, d, height) {
    const M = this.materials;
    const baseY = height + 0.55;
    // Stair penthouse.
    addMesh(parent, roundedBox(w * 0.22, 2.4, d * 0.24, 0.16), M.plaster,
      [-w * 0.24, baseY + 1.2, -d * 0.18]);
    addMesh(parent, roundedBox(w * 0.24, 0.18, d * 0.26, 0.06), M.trim,
      [-w * 0.24, baseY + 2.42, -d * 0.18]);
    addMesh(parent, roundedBox(0.95, 1.9, 0.1, 0.05), M.iron,
      [-w * 0.24, baseY + 0.95, -d * 0.18 + d * 0.12]);

    // HVAC: cabinet, fan cowl, ductwork.
    const units = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < units; i += 1) {
      const ux = -w * 0.1 + i * (w * 0.26);
      const uz = d * 0.16 + Math.random() * d * 0.1;
      addMesh(parent, roundedBox(2.6, 1.1, 1.8, 0.12), M.brushed, [ux, baseY + 0.55, uz]);
      const cowl = new THREE.Mesh(lathe([
        [0, 0], [0.55, 0], [0.6, 0.1], [0.6, 0.22], [0.5, 0.3], [0, 0.3],
      ], 18), M.iron);
      cowl.position.set(ux, baseY + 1.1, uz);
      parent.add(cowl);
      addMesh(parent, roundedBox(0.25, 0.25, 2.2, 0.08), M.steel, [ux + 1.5, baseY + 0.2, uz - 0.6]);
      this._pipe(parent, [ux + 2.4, baseY, uz], [ux + 2.4, baseY + 2.4, uz + 0.4], 0.14);
    }

    // Antenna mast with a red beacon.
    const mastHeight = 3 + Math.random() * 3;
    this._pipe(parent, [w * 0.3, baseY, -d * 0.2], [w * 0.3, baseY + mastHeight, -d * 0.2], 0.09);
    addMesh(parent, roundedBox(1.7, 0.06, 0.06, 0.02), M.steel, [w * 0.3, baseY + mastHeight * 0.55, -d * 0.2]);
    addMesh(parent, roundedBox(0.9, 0.06, 0.06, 0.02), M.steel, [w * 0.3, baseY + mastHeight * 0.8, -d * 0.2]);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), M.tailLight);
    beacon.position.set(w * 0.3, baseY + mastHeight + 0.1, -d * 0.2);
    parent.add(beacon);
  }

  _pipe(parent, from, to, radius) {
    const mesh = new THREE.Mesh(tube([from, to], radius, { segments: 6, radial: 6 }), this.materials.steel);
    parent.add(mesh);
    return mesh;
  }

  _fireEscape(parent, w, d, height, faceZ, dir) {
    const M = this.materials;
    const floors = Math.max(2, Math.round(height / 3.7) - 1);
    for (let floor = 2; floor <= floors; floor += 1) {
      const y = floor * (height / (floors + 1));
      addMesh(parent, roundedBox(w * 0.28, 0.08, 1.5, 0.03), M.iron, [-w * 0.1, y, faceZ + dir * 0.9]);
      addMesh(parent, roundedBox(w * 0.28, 0.08, 0.06, 0.02), M.iron, [-w * 0.1, y + 0.9, faceZ + dir * 1.62]);
      for (let i = 0; i < 6; i += 1) {
        addMesh(parent, roundedBox(0.05, 0.9, 0.05, 0.02), M.iron,
          [-w * 0.23 + (w * 0.26 / 5) * i, y + 0.45, faceZ + dir * 1.62]);
      }
      if (floor < floors) {
        const ladder = new THREE.Mesh(roundedBox(0.9, 0.06, 2.0, 0.02), M.iron);
        ladder.position.set(-w * 0.01, y + 1.7, faceZ + dir * 1.05);
        ladder.rotation.x = 0.62;
        parent.add(ladder);
      }
    }
  }

  // ── block recipes ─────────────────────────────────────────────────────
  _brickBlock(block) {
    const M = this.materials;
    this._building({
      x: block.x0 + 16, z: block.z0 + 16, w: 28, d: 26, floors: 6,
      material: M.brick, facing: "south", sign: ["HARROW & SONS", "HARDWARE · SINCE 1974"],
      signColor: "#ffd9a0", awning: "#2f4a3a", fireEscape: true,
      interior: "shop", doorName: "HARROW & SONS",
    });
    this._building({
      x: block.x0 + 16, z: block.z0 + 42, w: 28, d: 16, floors: 4,
      material: M.plaster, facing: "south", sign: ["ELGIN LAUNDRY"], signColor: "#ffb3c6",
      interior: "shop", doorName: "ELGIN LAUNDRY",
    });
  }

  _towerBlock(block) {
    const M = this.materials;
    const tower = this._building({
      x: block.x0 + 14, z: block.z0 + 20, w: 30, d: 34, floors: 13, floorHeight: 3.8,
      material: M.concrete, facing: "south", sign: ["MAZE BANK", "TOWER · LEVELS 1–20"],
      signColor: "#9fd0ff", storefront: true,
      interior: "bank", doorName: "MAZE BANK",
    });
    // Vertical fins: the signature of a modern curtain-wall tower.
    for (let i = 0; i < 9; i += 1) {
      const x = -tower.width / 2 + 1.7 + i * 3.3;
      addMesh(tower.root, roundedBox(0.28, tower.height - 4, 0.5, 0.08), M.brushed,
        [x, tower.height / 2 + 1.6, -tower.depth / 2 - 0.2]);
    }
    addMesh(tower.root, roundedBox(tower.width * 0.55, 3.2, tower.depth * 0.55, 0.3, { bevel: 0.12 }),
      M.glass, [0, tower.height + 2.2, 0]);
    addMesh(tower.root, roundedBox(tower.width * 0.6, 0.4, tower.depth * 0.6, 0.15), M.trim,
      [0, tower.height + 3.9, 0]);

    // Plaza in front of the tower, with benches and planters.
    addMesh(this.statics, roundedBox(30, 0.2, 4, 0.4), M.stone, [block.x0 + 14, 0.28, block.z0 + 2]);
    for (let i = 0; i < 4; i += 1) {
      this._planter(block.x0 + 2 + i * 8, block.z0 + 2.4);
    }
    this._siteMarker("viewpoint", block.x0 + 14, block.z0 + 2.6, {
      label: "VISTA TERRACE", color: "#9fd0ff", npc: "northerner",
    });
  }

  _apartmentBlock(block) {
    const M = this.materials;
    const building = this._building({
      x: block.x0 + 16, z: block.z0 + 20, w: 30, d: 34, floors: 6,
      material: M.plaster, facing: "south", sign: ["THE AURELIA", "RESIDENCES · APARTMENTS 4A–7C"],
      signColor: "#ffd9a0", balconies: true, collider: false,
      interior: "apartment", doorName: "THE AURELIA",
    });
    // Entrance bay: canopy, steps, brass door, wall lamps.
    const faceZ = -17;
    addMesh(building.root, roundedBox(7.2, 0.5, 4.4, 0.2), M.stone, [0, 0.3, faceZ - 1.6]);
    addMesh(building.root, roundedBox(6.4, 0.28, 3.6, 0.14), M.stone, [0, 0.62, faceZ - 1.4]);
    addMesh(building.root, roundedBox(6.8, 0.3, 3.4, 0.12), M.trim, [0, 3.5, faceZ - 1.5]);
    [-1, 1].forEach((side) => {
      addMesh(building.root, roundedBox(0.24, 3.3, 0.24, 0.08), M.brass || M.trim,
        [side * 3.1, 1.9, faceZ - 3.0]);
      const lamp = new THREE.Mesh(lathe([
        [0, 0], [0.19, 0], [0.24, 0.16], [0.19, 0.34], [0, 0.34],
      ], 14), M.lampWarm);
      lamp.position.set(side * 2.4, 2.8, faceZ - 0.4);
      building.root.add(lamp);
    });
    addMesh(building.root, roundedBox(2.6, 2.9, 0.16, 0.05), M.darkTrim, [0, 1.75, faceZ - 0.06]);
    addMesh(building.root, roundedBox(2.2, 2.5, 0.1, 0.04), M.glassLight, [0, 1.75, faceZ - 0.14]);
    addMesh(building.root, roundedBox(0.07, 0.9, 0.12, 0.02), M.chrome, [0.5, 1.6, faceZ - 0.24]);

    const light = new THREE.PointLight(0xffbf7a, 26, 22, 2);
    light.position.set(block.x0 + 16, 3.4, block.z0 + 15);
    this.statics.add(light);

    this.boxes.push({
      x: block.x0 + 16, z: block.z0 + 20, hx: 15.4, hz: 17.4,
      door: { x: block.x0 + 16, z: block.z0 + 3.6, radius: 4.4 },
    });
    this._siteMarker("inn", block.x0 + 16, block.z0 + 2.2, {
      label: "THE AURELIA", color: "#ffd9a0", npc: "innkeeper", enterable: true,
    });
  }

  // ── new neighbourhoods ───────────────────────────────────────────────
  _housesBlock(block) {
    for (let i = 0; i < 4; i += 1) {
      const x = block.x0 + 8 + (i % 2) * 15;
      const z = block.z0 + 9 + Math.floor(i / 2) * 26;
      this._house(x, z, `${block.x0}:${block.z0}:${i}`);
    }
  }

  _house(x, z, key) {
    const M = this.materials;
    const palette = ["#7a5a44", "#8d6b52", "#6b5848", "#9b7a5e", "#5f6b62", "#7c6a80"][
      Math.abs(key.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % 6
    ];
    const wall = M.carPaint(palette);
    // Garden plate, fence and path.
    addMesh(this.statics, roundedBox(13, 0.12, 17, 0.3), M.grass, [x, 0.24, z]);
    addMesh(this.statics, roundedBox(2.0, 0.13, 5.0, 0.2), M.sidewalk, [x, 0.26, z - 8.2]);
    for (let i = 0; i < 7; i += 1) {
      const fx = x - 6 + i * 2;
      addMesh(this.statics, roundedBox(0.1, 0.75, 0.1, 0.03), M.woodDark, [fx, 0.62, z - 8.4]);
    }
    addMesh(this.statics, roundedBox(13, 0.07, 0.08, 0.02), M.woodDark, [x, 0.95, z - 8.4]);

    // House body with a pitched roof.
    addMesh(this.statics, roundedBox(9, 3.4, 8, 0.35), wall, [x, 1.95, z]);
    addMesh(this.statics, roundedBox(9.3, 0.3, 8.3, 0.2), M.trim, [x, 3.7, z]);
    for (const side of [-1, 1]) {
      addMesh(this.statics, roundedBox(9.6, 0.24, 5.3, 0.16), M.roof,
        [x, 4.85, z + side * 2.1], [side * 0.5, 0, 0]);
    }
    addMesh(this.statics, roundedBox(9.7, 0.16, 0.24, 0.05), M.trim, [x, 5.9, z]);
    addMesh(this.statics, roundedBox(0.8, 1.1, 0.8, 0.1), M.brick, [x + 2.8, 5.4, z - 1.6]);

    // Door and two lit windows on the street face.
    addMesh(this.statics, roundedBox(1.25, 2.25, 0.16, 0.05), M.darkTrim, [x - 1.4, 1.35, z - 4.06]);
    addMesh(this.statics, roundedBox(1.05, 2.1, 0.1, 0.04), M.woodDark, [x - 1.4, 1.3, z - 4.12]);
    [-1, 1].forEach((side) => {
      addMesh(this.statics, roundedBox(1.45, 1.0, 0.12, 0.04), M.darkTrim, [x + side * 2.7, 2.35, z - 4.06]);
      addMesh(this.statics, roundedBox(1.25, 0.82, 0.06, 0.03), M.windowLit, [x + side * 2.7, 2.35, z - 4.12]);
    });
    // Porch lamp.
    addMesh(this.statics, roundedBox(0.22, 0.3, 0.22, 0.05), M.lampWarm, [x + 0.5, 2.5, z - 4.3]);
    // Garden tree and a flower bed.
    this._tree(x - 4.2, z + 5.2, 0.7, 0.28);
    addMesh(this.statics, roundedBox(4.6, 0.3, 1.2, 0.2), M.stone, [x + 2.6, 0.34, z + 5.6]);
    for (let i = 0; i < 5; i += 1) {
      addMesh(this.statics, roundedBox(0.34, 0.32, 0.34, 0.08), M.foliage,
        [x + 0.8 + i * 0.95, 0.55, z + 5.6]);
    }
    this.boxes.push({ x, z, hx: 4.8, hz: 4.3 });
    const number = String(1 + Math.abs(key.length + key.charCodeAt(0)) % 8).padStart(2, "0");
    this._registerDoor({
      id: `house-${key}`,
      name: `HOUSE ${number}`,
      template: "house",
      x: x - 1.4,
      z: z - 5.0,
    });
  }

  _harborBlock(block) {
    const M = this.materials;
    this._building({
      x: block.x0 + 15, z: block.z0 + 22, w: 26, d: 30, floors: 2, floorHeight: 4.4,
      material: M.concrete, facing: "south", sign: ["HARBOUR DEPOT", "BERTHS 4–9 · CUSTOMS"],
      signColor: "#9fd0ff", storefront: false, interior: "warehouse", doorName: "HARBOUR DEPOT",
    });
    // Containers in stacks down the street edge.
    const colors = ["#7d1f22", "#2c4d63", "#4d5a45", "#c9a227", "#5b2a43"];
    for (let i = 0; i < 6; i += 1) {
      const cx = block.x0 + 4 + (i % 2) * 6;
      const cz = block.z0 + 45 + Math.floor(i / 2) * 8;
      const stack = 1 + (i % 2);
      for (let level = 0; level < stack; level += 1) {
        addMesh(this.statics, roundedBox(5.6, 2.3, 2.3, 0.16), M.carPaint(colors[i % colors.length]),
          [cx, 0.24 + 1.15 + level * 2.36, cz]);
      }
      this.boxes.push({ x: cx, z: cz, hx: 3.0, hz: 1.4 });
    }
    // Crane: a mast, a jib and a hook.
    addMesh(this.statics, roundedBox(1.0, 13, 1.0, 0.2), M.paintYellow, [block.x0 + 4, 6.7, block.z0 + 36]);
    addMesh(this.statics, roundedBox(12, 0.7, 0.8, 0.15), M.paintYellow, [block.x0 + 9, 12.8, block.z0 + 36]);
    addMesh(this.statics, roundedBox(0.06, 4.2, 0.06, 0.02), M.steel, [block.x0 + 14.4, 10.6, block.z0 + 36]);
    addMesh(this.statics, roundedBox(0.7, 0.5, 0.7, 0.1), M.iron, [block.x0 + 14.4, 8.4, block.z0 + 36]);
    // Bollards and a painted berth line.
    for (let i = 0; i < 4; i += 1) {
      addMesh(this.statics, roundedBox(0.4, 0.8, 0.4, 0.1), M.iron, [block.x0 + 3, 0.64, block.z0 + 10 + i * 4]);
    }
    addMesh(this.statics, roundedBox(0.24, 0.04, 44, 0.02), M.paintWhite, [block.x0 + 1.4, 0.28, block.z0 + 30]);
  }

  _alleyBlock(block) {
    const M = this.materials;
    this._building({
      x: block.x0 + 16, z: block.z0 + 9, w: 22, d: 10, floors: 2, floorHeight: 3.6,
      material: M.brick, facing: "north", sign: ["NIGHT MARKET", "SPICES · PARTS · RUMOURS"],
      signColor: "#ffd166", storefront: true, interior: "shop", doorName: "NIGHT MARKET",
    });
    // Stalls under a string of bulbs.
    for (let i = 0; i < 4; i += 1) {
      const sx = block.x0 + 4 + i * 6;
      const sz = block.z0 + 19;
      addMesh(this.statics, roundedBox(4.4, 0.9, 2.2, 0.12), M.woodDark, [sx, 0.9, sz]);
      addMesh(this.statics, roundedBox(4.7, 0.12, 2.5, 0.06), M.wood, [sx, 1.4, sz]);
      [-1, 1].forEach((side) => {
        addMesh(this.statics, roundedBox(0.1, 2.6, 0.1, 0.03), M.iron, [sx + side * 2.1, 1.55, sz + 0.9]);
      });
      addMesh(this.statics, roundedBox(4.5, 0.1, 2.3, 0.04), M.carPaint(["#7d1f22", "#2c4d63", "#4d5a45", "#c9a227"][i]), [sx, 2.9, sz], [-0.12, 0, 0]);
      addMesh(this.statics, roundedBox(0.3, 0.3, 0.3, 0.05), M.lampWarm, [sx, 2.5, sz + 0.4]);
      this.boxes.push({ x: sx, z: sz, hx: 2.3, hz: 1.2 });
    }
    for (let i = 0; i < 12; i += 1) {
      addMesh(this.statics, roundedBox(0.09, 0.09, 0.09, 0.03), M.lampWarm, [block.x0 + 2 + i * 2.1, 3.3, block.z0 + 18]);
    }
  }

  _warehouseBlock(block) {
    const M = this.materials;
    const hall = this._building({
      x: block.x0 + 15, z: block.z0 + 23, w: 26, d: 38, floors: 3, floorHeight: 4.6,
      material: M.concrete, facing: "south", sign: ["PORT ELGIN FREIGHT", "LOADING BAYS 1–6 · NO PARKING"],
      signColor: "#cfd8e3", storefront: false,
      interior: "warehouse", doorName: "PORT ELGIN FREIGHT",
    });
    // Roller doors and dock levellers.
    for (let i = 0; i < 3; i += 1) {
      const dx = -9 + i * 9;
      addMesh(hall.root, roundedBox(6.4, 5.0, 0.3, 0.08), M.brushed, [dx, 2.7, -19.1]);
      for (let slat = 0; slat < 8; slat += 1) {
        addMesh(hall.root, roundedBox(6.2, 0.09, 0.1, 0.03), M.iron,
          [dx, 4.7 - slat * 0.58, -19.3]);
      }
      addMesh(hall.root, roundedBox(7.0, 0.22, 1.6, 0.06), M.steel, [dx, 5.4, -19.9]);
      addMesh(hall.root, roundedBox(7.0, 0.8, 1.2, 0.08), M.concrete, [dx, 0.3, -20.4]);
    }
    this._siteMarker("warehouse", block.x0 + 15, block.z0 + 2.2, {
      label: "FREIGHT DEPOT", color: "#cfd8e3", npc: "hauler",
    });
  }

  _garageBlock(block) {
    const M = this.materials;
    const garage = this._building({
      x: block.x0 + 16, z: block.z0 + 22, w: 30, d: 24, floors: 3, floorHeight: 4.2,
      material: M.concrete, facing: "north", sign: ["REDLINE AUTOMOTIVE", "SERVICE · TUNING · BODY"],
      signColor: "#ff8a5c", storefront: true, awning: "#7d1f22",
      interior: "garage", doorName: "REDLINE",
    });
    // Open service bays with a car on a lift inside one of them.
    for (let i = 0; i < 2; i += 1) {
      const dx = -7 + i * 14;
      addMesh(garage.root, roundedBox(7.4, 4.2, 0.4, 0.1), M.iron, [dx, 2.2, 12.1]);
      for (let slat = 0; slat < 7; slat += 1) {
        addMesh(garage.root, roundedBox(7.2, 0.1, 0.12, 0.03), M.brushed,
          [dx, 4.0 - slat * 0.6, 12.3]);
      }
      addMesh(garage.root, roundedBox(8.2, 0.3, 2.0, 0.08), M.steel, [dx, 4.6, 12.9]);
    }
    // Forecourt with a tyre stack, compressor and a rolling tool chest.
    addMesh(this.statics, roundedBox(30, 0.18, 16, 0.3), M.concrete, [block.x0 + 16, 0.27, block.z0 + 46]);
    for (let i = 0; i < 5; i += 1) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 8, 20), M.rubber);
      tyre.position.set(block.x0 + 3.5, 0.14 + i * 0.24, block.z0 + 48);
      tyre.rotation.x = Math.PI / 2;
      this.statics.add(tyre);
    }
    this._siteMarker("garage", block.x0 + 16, block.z0 + 48, {
      label: "REDLINE", color: "#ff8a5c", npc: "mechanic",
    });
    this._siteMarker("parts", block.x0 + 26, block.z0 + 44, {
      label: "PARTS COUNTER", color: "#9be7c4", npc: "trader",
    });
  }

  _shopsBlock(block) {
    const M = this.materials;
    this._building({
      x: block.x0 + 14, z: block.z0 + 44, w: 26, d: 18, floors: 3, floorHeight: 4.0,
      material: M.brick, facing: "north", sign: ["AMMU-NATION", "FIREARMS · AMMO · LICENSE"],
      signColor: "#ff6b6b", storefront: true,
      interior: "shop", doorName: "AMMU-NATION",
    });
    this._building({
      x: block.x0 + 14, z: block.z0 + 14, w: 26, d: 18, floors: 2, floorHeight: 4.4,
      material: M.plaster, facing: "north", sign: ["MISSION ROW MARKET", "GROCERIES · 24 HOURS"],
      signColor: "#a9f0c0", awning: "#2f6b4a", storefront: true,
      interior: "shop", doorName: "MISSION ROW MARKET",
    });
    // Billboard on the pavement.
    const billboard = this._billboard(block.x0 + 26, block.z0 + 6, ["CLUCKIN' BELL", "NOW HIRING — ASK INSIDE"], "#ffd166");
    billboard.rotation.y = -0.2;
    this._siteMarker("market", block.x0 + 14, block.z0 + 51, {
      label: "MISSION ROW", color: "#a9f0c0", npc: "trader",
    });
  }

  _fuelBlock(block) {
    const M = this.materials;
    // Forecourt.
    addMesh(this.statics, roundedBox(34, 0.2, 30, 0.6), M.concrete, [block.x0 + 16, 0.3, block.z0 + 34]);
    // Canopy: slab on four swept columns, with light strips underneath.
    addMesh(this.statics, roundedBox(30, 0.75, 17, 0.18), M.paintWhite, [block.x0 + 16, 5.6, block.z0 + 34]);
    addMesh(this.statics, roundedBox(30.4, 0.3, 17.4, 0.14), M.paintRed, [block.x0 + 16, 5.14, block.z0 + 34]);
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        addMesh(this.statics, roundedBox(1.1, 5.1, 1.1, 0.16), M.paintWhite,
          [block.x0 + 16 + sx * 12.5, 2.55, block.z0 + 34 + sz * 7]);
      });
    });
    for (let i = 0; i < 3; i += 1) {
      addMesh(this.statics, roundedBox(26, 0.08, 1.1, 0.04), M.lampCool,
        [block.x0 + 16, 5.16, block.z0 + 29 + i * 5]);
    }
    // Pumps.
    for (let i = 0; i < 4; i += 1) {
      const px = block.x0 + 6 + (i % 2) * 12;
      const pz = block.z0 + 29 + Math.floor(i / 2) * 10;
      addMesh(this.statics, roundedBox(2.2, 0.24, 1.6, 0.1), M.concrete, [px, 0.4, pz]);
      addMesh(this.statics, roundedBox(0.9, 1.9, 0.7, 0.16), M.paintRed, [px, 1.5, pz]);
      const display = new THREE.Mesh(plate(0.6, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x0a1018, emissive: 0x2f6a4a, emissiveIntensity: 1.4 }));
      display.position.set(px, 2.05, pz + 0.36);
      this.statics.add(display);
      addMesh(this.statics, roundedBox(0.72, 0.12, 0.5, 0.05), M.steel, [px, 2.34, pz]);
    }
    // Kiosk.
    this._building({
      x: block.x0 + 30, z: block.z0 + 10, w: 14, d: 12, floors: 2, floorHeight: 3.4,
      material: M.plaster, facing: "north", sign: ["GO-GO FUEL", "MINI MART · COFFEE"],
      signColor: "#ffd166", storefront: true,
      interior: "kiosk", doorName: "GO-GO MINI MART",
    });
    const light = new THREE.PointLight(0xd6ebff, 60, 34, 2);
    light.position.set(block.x0 + 16, 5.0, block.z0 + 34);
    this.statics.add(light);
    this._siteMarker("fuel", block.x0 + 16, block.z0 + 55, {
      label: "GO-GO FUEL", color: "#ffd166", npc: "attendant",
    });
  }

  _dinerBlock(block) {
    const M = this.materials;
    // Neon diner with a chrome band and a curved roof.
    const diner = this._building({
      x: block.x0 + 14, z: block.z0 + 43, w: 24, d: 18, floors: 2, floorHeight: 3.9,
      material: M.paintWhite, facing: "north", sign: ["THE SPOON", "DINER · OPEN ALL NIGHT"],
      signColor: "#ff70a6", storefront: true, awning: "#8a1f4a",
      interior: "diner", doorName: "THE SPOON",
    });
    const neon = new THREE.Mesh(roundedBox(20, 0.18, 0.18, 0.06), M.neonPink);
    neon.position.set(0, 8.2, -9.2);
    diner.root.add(neon);
    const neon2 = neon.clone();
    neon2.position.y = 8.6;
    diner.root.add(neon2);
    const light = new THREE.PointLight(0xff5f9e, 40, 26, 2);
    light.position.set(block.x0 + 14, 6, block.z0 + 30);
    this.statics.add(light);

    // Motel wing behind it.
    this._building({
      x: block.x0 + 14, z: block.z0 + 16, w: 24, d: 18, floors: 2, floorHeight: 3.4,
      material: M.plaster, facing: "north", sign: ["STARLITE MOTEL", "VACANCY"],
      signColor: "#8ee6ff", storefront: false,
    });
    for (let i = 0; i < 5; i += 1) {
      addMesh(this.statics, roundedBox(1.1, 0.5, 1.1, 0.2), M.terracotta,
        [block.x0 + 5 + i * 4.4, 0.45, block.z0 + 32]);
      this._tree(block.x0 + 5 + i * 4.4, block.z0 + 32, 0.5 + Math.random() * 0.2);
    }
    this._siteMarker("camp", block.x0 + 22, block.z0 + 53, {
      label: "STARLITE", color: "#8ee6ff", npc: "courier",
    });
  }

  _parkBlock(block) {
    const M = this.materials;
    // Lawn, paths, fountain, benches — the lung of the district.
    addMesh(this.statics, roundedBox(block.x1 - block.x0, 0.3, block.z1 - block.z0, 1.2),
      M.grass, [(block.x0 + block.x1) / 2, 0.3, (block.z0 + block.z1) / 2]);
    const cx = (block.x0 + block.x1) / 2;
    const cz = (block.z0 + block.z1) / 2;
    // Gravel cross path.
    addMesh(this.statics, roundedBox(block.x1 - block.x0, 0.32, 4.4, 0.4), M.roof, [cx, 0.32, cz]);
    addMesh(this.statics, roundedBox(4.4, 0.32, block.z1 - block.z0, 0.4), M.roof, [cx, 0.32, cz]);

    // Fountain: octagonal basin, tiered bowls, water disc.
    const basin = new THREE.Mesh(lathe([
      [0, 0], [4.6, 0], [4.8, 0.3], [4.8, 0.85], [4.5, 1.0], [4.2, 1.0], [4.2, 0.34], [0, 0.34],
    ], 32), M.stone);
    basin.position.set(cx, 0.32, cz);
    this.statics.add(basin);
    const stem = new THREE.Mesh(lathe([
      [0, 0], [0.9, 0], [0.7, 0.5], [0.42, 1.5], [0.7, 1.9], [1.9, 2.1], [1.9, 2.3], [0.5, 2.4], [0.35, 3.2], [0, 3.3],
    ], 26), M.stone);
    stem.position.set(cx, 0.36, cz);
    this.statics.add(stem);
    const water = new THREE.Mesh(new THREE.CircleGeometry(4.1, 36), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 1.16, cz);
    this.statics.add(water);
    this.waterMesh = water;

    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * TAU + 0.2;
      const tx = cx + Math.cos(angle) * (9 + Math.random() * 8);
      const tz = cz + Math.sin(angle) * (10 + Math.random() * 14);
      if (Math.abs(tx - cx) < 4 || Math.abs(tz - cz) < 4) continue;
      this._tree(tx, tz, 0.9 + Math.random() * 0.5);
    }
    for (let i = 0; i < 4; i += 1) {
      this._bench(cx + (i % 2 ? 7 : -7), cz - 12 + i * 8, i % 2 ? -Math.PI / 2 : Math.PI / 2);
    }
    for (let i = 0; i < 6; i += 1) {
      this._lampPost(cx + Math.cos((i / 6) * TAU) * 16, cz + Math.sin((i / 6) * TAU) * 16, 0);
    }
    this._siteMarker("camp", cx, cz + 4, { label: "ELGIN PARK", color: "#a9e08a", npc: "gossip" });
  }

  _lotBlock(block) {
    const M = this.materials;
    // Parking lot with bays, a booth and a chain-link fence.
    addMesh(this.statics, roundedBox(block.x1 - block.x0, 0.2, block.z1 - block.z0, 0.4),
      M.asphalt, [(block.x0 + block.x1) / 2, 0.3, (block.z0 + block.z1) / 2]);
    for (let row = 0; row < 4; row += 1) {
      for (let bay = 0; bay < 6; bay += 1) {
        const x = block.x0 + 5 + bay * 4.6;
        const z = block.z0 + 10 + row * 9;
        addMesh(this.statics, roundedBox(0.1, 0.02, 4.6, 0.02), M.paintWhite, [x, 0.42, z]);
        if (row < 3 && Math.random() < 0.5) {
          this._parkedCar(x + 2.2, z, Math.random() < 0.5 ? 0 : Math.PI, bay + row);
        }
      }
    }
    addMesh(this.statics, roundedBox(2.4, 2.6, 2.4, 0.14), M.plaster, [block.x1 - 5, 1.5, block.z0 + 5]);
    addMesh(this.statics, roundedBox(2.8, 0.2, 2.8, 0.1), M.trim, [block.x1 - 5, 2.94, block.z0 + 5]);
    for (let i = 0; i < 12; i += 1) {
      addMesh(this.statics, roundedBox(0.03, 2.0, 0.03, 0.01), M.steel, [block.x0 + 1 + i * 2.4, 1.0, block.z0 + 1]);
    }
    this._tree(block.x0 + 6, block.z1 - 6, 1.1);
    this._tree(block.x1 - 8, block.z1 - 4, 0.9);
  }

  // ── street life ───────────────────────────────────────────────────────
  _buildStreetFurniture() {
    // Lamps down both sides of the boulevard.
    for (let x = -168; x <= 168; x += 24) {
      [-1, 1].forEach((side) => {
        const z = side * (AVE_HALF + 1.6);
        if (CROSS_STREETS.some((c) => Math.abs(x - c) < 11)) return;
        this._lampPost(x, z, side);
      });
    }
    // Traffic signals at every junction.
    CROSS_STREETS.forEach((cx) => {
      [-1, 1].forEach((side) => {
        this._trafficSignal(cx + side * (CROSS_HALF + 3), -side * (AVE_HALF + 2.2), side > 0 ? 0 : Math.PI);
        this._trafficSignal(cx + side * (CROSS_HALF + 3), side * (AVE_HALF + 2.2), side > 0 ? Math.PI : 0);
      });
    });
    // Hydrants, bins, benches, bollards along the avenue.
    for (let i = 0; i < 14; i += 1) {
      const x = -160 + i * 15.4;
      const side = i % 2 ? 1 : -1;
      const z = side * (AVE_HALF + 2.4);
      if (CROSS_STREETS.some((c) => Math.abs(x - c) < 12)) continue;
      if (i % 3 === 0) this._hydrant(x, z);
      else if (i % 3 === 1) this._bin(x, z);
      else this._bench(x, z, side > 0 ? Math.PI : 0);
    }
    // Bus shelter and a phone booth near the spawn.
    this._busShelter(-14, -AVE_HALF - 3.4);
    this._phoneBooth(9, AVE_HALF + 3.6);
    // Bollards guarding the tower plaza.
    for (let i = 0; i < 8; i += 1) {
      this._bollard(-14 + i * 4, AVE_HALF + 1.1);
    }
    // Road-side signage.
    this._streetSign(-26, -AVE_HALF - 0.8, ["VINEWOOD BLVD"]);
    this._streetSign(26, AVE_HALF + 0.8, ["ALTA ST"]);
    // Planters at the corners.
    [[-30, 16], [30, 16], [-30, -16], [30, -16]].forEach(([x, z]) => this._planter(x, z));
  }

  _lampPost(x, z, side = 1) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);
    addMesh(root, lathe([
      [0, 0], [0.46, 0], [0.5, 0.14], [0.42, 0.34], [0.24, 0.46], [0, 0.5],
    ], 18), M.iron, [0, 0, 0]);
    addMesh(root, turnedCylinder(0.12, 0.19, 6.4, { segments: 16, chamfer: 0.06 }), M.iron, [0, 3.5, 0]);
    // Curved arm sweeping out over the road.
    const arm = tube([
      [0, 6.6, 0], [0, 7.2, -side * 0.5], [0, 7.5, -side * 1.9], [0, 7.45, -side * 3.1],
    ], 0.09, { segments: 18, radial: 6 });
    addMesh(root, arm, M.iron);
    addMesh(root, roundedBox(0.3, 0.24, 1.5, 0.1), M.iron, [0, 7.36, -side * 3.6]);
    addMesh(root, roundedBox(0.6, 0.1, 1.0, 0.05), M.lampWarm, [0, 7.2, -side * 3.6]);
    contactShadow(root, 0.7, 0.5, 0.02);
  }

  _trafficSignal(x, z, rotation) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    root.rotation.y = rotation;
    this.statics.add(root);
    addMesh(root, turnedCylinder(0.11, 0.16, 5.0, { segments: 14 }), M.iron, [0, 2.5, 0]);
    addMesh(root, roundedBox(0.7, 2.0, 0.4, 0.08), M.darkTrim, [0, 4.7, 0.3]);
    const colors = [M.tailLight, M.paintYellow, M.neonBlue];
    colors.forEach((material, index) => {
      const lens = new THREE.Mesh(lathe([[0, 0], [0.16, 0], [0.2, 0.05], [0.16, 0.1], [0, 0.1]], 14), material);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 5.3 - index * 0.58, 0.52);
      root.add(lens);
      addMesh(root, roundedBox(0.44, 0.06, 0.2, 0.03), M.iron, [0, 5.42 - index * 0.58, 0.6]);
    });
    addMesh(root, roundedBox(0.1, 0.1, 1.9, 0.03), M.iron, [0, 3.4, 0.9]);
  }

  _hydrant(x, z) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);
    addMesh(root, lathe([
      [0, 0], [0.26, 0], [0.28, 0.08], [0.2, 0.14], [0.17, 0.5], [0.22, 0.62],
      [0.2, 0.78], [0.1, 0.86], [0, 0.88],
    ], 18), M.paintRed);
    [-1, 1].forEach((side) => {
      const cap = new THREE.Mesh(turnedCylinder(0.1, 0.1, 0.16, { segments: 10 }), M.paintRed);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(side * 0.2, 0.46, 0);
      root.add(cap);
    });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 16), M.paintRed);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.78;
    root.add(collar);
  }

  _bin(x, z) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);
    addMesh(root, lathe([
      [0, 0], [0.34, 0], [0.36, 0.1], [0.4, 0.9], [0.36, 0.98], [0, 0.98],
    ], 20), M.iron);
    const lid = new THREE.Mesh(lathe([[0, 0], [0.44, 0], [0.42, 0.1], [0.3, 0.16], [0, 0.18]], 20), M.steel);
    lid.position.y = 0.98;
    root.add(lid);
    addMesh(root, roundedBox(0.5, 0.06, 0.5, 0.03), M.darkTrim, [0, 1.16, 0]);
  }

  _bench(x, z, rotation) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    root.rotation.y = rotation;
    this.statics.add(root);
    const slatMaterial = M.wood;
    for (let i = 0; i < 5; i += 1) {
      addMesh(root, roundedBox(1.9, 0.09, 0.16, 0.04), slatMaterial, [0, 0.46, -0.32 + i * 0.16]);
    }
    for (let i = 0; i < 4; i += 1) {
      const back = addMesh(root, roundedBox(1.9, 0.14, 0.08, 0.04), slatMaterial, [0, 0.66 + i * 0.15, -0.44]);
      back.rotation.x = -0.16;
    }
    [-1, 1].forEach((side) => {
      addMesh(root, roundedBox(0.1, 0.46, 0.9, 0.04), M.iron, [side * 0.86, 0.24, 0]);
      addMesh(root, roundedBox(0.1, 0.55, 0.08, 0.04), M.iron, [side * 0.86, 0.72, -0.4]);
    });
  }

  _bollard(x, z) {
    const M = this.materials;
    const bollard = new THREE.Mesh(lathe([
      [0, 0], [0.14, 0], [0.16, 0.1], [0.14, 0.8], [0.18, 0.88], [0.14, 0.94], [0, 0.96],
    ], 14), M.iron);
    bollard.position.set(x, 0.24, z);
    this.statics.add(bollard);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.02, 6, 14), M.chrome);
    band.rotation.x = Math.PI / 2;
    band.position.set(x, 0.78, z);
    this.statics.add(band);
  }

  _planter(x, z) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);
    addMesh(root, lathe([
      [0, 0], [0.9, 0], [0.98, 0.2], [0.95, 0.86], [1.02, 0.94], [0.86, 0.94], [0.84, 0.24], [0, 0.24],
    ], 22), M.concrete);
    addMesh(root, roundedBox(1.6, 0.1, 1.6, 0.06), M.bark, [0, 0.9, 0]);
    this._tree(x, z, 0.55, 1.02);
  }

  _busShelter(x, z) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);
    addMesh(root, roundedBox(5.2, 0.18, 2.2, 0.1), M.trim, [0, 2.7, 0]);
    [-1, 1].forEach((side) => {
      addMesh(root, roundedBox(0.14, 2.6, 0.14, 0.05), M.steel, [side * 2.4, 1.3, -0.9]);
      addMesh(root, roundedBox(0.14, 2.6, 0.14, 0.05), M.steel, [side * 2.4, 1.3, 0.9]);
    });
    const back = new THREE.Mesh(plate(4.8, 2.4), M.glassLight);
    back.position.set(0, 1.4, -1.0);
    root.add(back);
    addMesh(root, roundedBox(4.4, 0.12, 0.5, 0.05), M.wood, [0, 0.7, -0.6]);
    addMesh(root, roundedBox(0.9, 1.9, 0.12, 0.04), M.lampCool, [2.0, 1.5, -0.92]);
    addMesh(root, roundedBox(2.6, 0.4, 0.1, 0.04), M.lampWarm, [0, 2.98, 0.9]);
  }

  _phoneBooth(x, z) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);
    addMesh(root, roundedBox(1.1, 2.4, 1.1, 0.1), M.darkTrim, [0, 1.2, 0]);
    [-1, 1].forEach((side) => {
      const glass = new THREE.Mesh(plate(0.9, 2.0), M.glassLight);
      glass.position.set(side * 0.56, 1.3, 0);
      glass.rotation.y = side * Math.PI / 2;
      root.add(glass);
      const front = new THREE.Mesh(plate(0.9, 2.0), M.glassLight);
      front.position.set(0, 1.3, 0.56);
      root.add(front);
    });
    addMesh(root, roundedBox(1.24, 0.16, 1.24, 0.06), M.trim, [0, 2.44, 0]);
    addMesh(root, roundedBox(0.5, 0.34, 0.12, 0.04), M.lampCool, [0, 1.9, 0.5]);
  }

  _streetSign(x, z, lines) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);
    addMesh(root, turnedCylinder(0.07, 0.09, 3.0, { segments: 12 }), M.steel, [0, 1.5, 0]);
    const texture = signTexture(lines, { color: "#e8f0ff", background: "#123a2a", border: "#e8f0ff" });
    const material = new THREE.MeshStandardMaterial({
      map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.7,
    });
    const board = new THREE.Mesh(plate(2.4, 0.6), material);
    board.position.set(0, 3.1, 0);
    board.rotation.y = Math.PI / 2;
    root.add(board);
    addMesh(root, roundedBox(2.56, 0.72, 0.08, 0.03), M.darkTrim, [0, 3.1, -0.04]);
  }

  _billboard(x, z, lines, color) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, 0.24, z);
    this.statics.add(root);
    [-1, 1].forEach((side) => {
      addMesh(root, roundedBox(0.34, 8.6, 0.34, 0.1), M.iron, [side * 3.4, 4.3, 0]);
    });
    addMesh(root, roundedBox(9.0, 4.6, 0.4, 0.14), M.darkTrim, [0, 9.6, 0]);
    const texture = signTexture(lines, { color, background: "#11131a", border: color });
    const material = new THREE.MeshStandardMaterial({
      map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 1.5,
      roughness: 0.5,
    });
    const face = new THREE.Mesh(plate(8.6, 4.2), material);
    face.position.set(0, 9.6, 0.22);
    root.add(face);
    [-1, 1].forEach((side) => {
      addMesh(root, roundedBox(1.0, 0.14, 0.6, 0.05), M.lampCool, [side * 2.6, 11.8, 0.4]);
    });
    return root;
  }

  _tree(x, z, scale = 1, baseY = 0.24) {
    const M = this.materials;
    const root = new THREE.Group();
    root.position.set(x, baseY, z);
    root.scale.setScalar(scale);
    this.statics.add(root);
    const trunkHeight = 3.4 + Math.random() * 1.6;
    addMesh(root, lathe([
      [0, 0], [0.26, 0], [0.2, 0.5], [0.16, 1.6], [0.13, trunkHeight * 0.7], [0, trunkHeight],
    ], 10), M.bark);
    // A few branches, then clusters of leaf volume.
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * TAU + Math.random();
      const reach = 1.2 + Math.random() * 0.9;
      addMesh(root, tube([
        [0, trunkHeight * 0.62, 0],
        [Math.cos(angle) * reach * 0.5, trunkHeight * 0.8, Math.sin(angle) * reach * 0.5],
        [Math.cos(angle) * reach, trunkHeight * 0.92, Math.sin(angle) * reach],
      ], 0.08, { segments: 6, radial: 5 }), M.bark);
    }
    const blobs = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < blobs; i += 1) {
      const angle = (i / blobs) * TAU + Math.random() * 0.6;
      const spread = i === 0 ? 0 : 0.9 + Math.random() * 1.1;
      const globe = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.1 + Math.random() * 0.7, 1),
        i % 3 === 0 ? M.foliageDark : M.foliage
      );
      globe.position.set(
        Math.cos(angle) * spread,
        trunkHeight * 0.95 + (Math.random() - 0.3) * 1.1,
        Math.sin(angle) * spread
      );
      globe.scale.set(1, 0.82 + Math.random() * 0.3, 1);
      globe.castShadow = true;
      root.add(globe);
    }
    contactShadow(root, 1.6, 0.34, 0.02);
  }

  // ── skyline ───────────────────────────────────────────────────────────
  _buildSkyline() {
    const texture = facadeTexture({ tint: "#4a5260", lit: 0.34 });
    const material = new THREE.MeshStandardMaterial({
      map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.32,
      roughness: 0.75, metalness: 0.2,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c3a4a, roughness: 0.18, metalness: 0.85, envMapIntensity: 1.2,
    });
    const count = 18;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * TAU + 0.1;
      const radius = 190 + Math.random() * 150;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.8;
      if (Math.abs(x) < 192 && Math.abs(z) < 132) continue;
      const height = 28 + Math.random() * 86;
      const w = 14 + Math.random() * 22;
      const d = 14 + Math.random() * 20;
      addMesh(this.statics, roundedBox(w, height, d, 0.9, { bevel: 0.2, uvScale: 0.7 }),
        Math.random() < 0.55 ? material : glassMaterial, [x, height / 2 - 1, z]);
      if (Math.random() < 0.4) {
        addMesh(this.statics, roundedBox(w * 0.7, 3, d * 0.7, 0.4), material,
          [x, height + 0.5, z]);
      }
    }
  }

  // ── sites, NPCs and the player car ────────────────────────────────────
  _siteMarker(kind, x, z, options = {}) {
    const site = {
      id: options.id || kind,
      kind,
      x, z,
      services: options.services || [kind],
      label: options.label || kind,
      enterable: Boolean(options.enterable),
      npc: options.npc,
    };
    this.sites.push(site);
    this.blips.push({ x, z, kind, label: site.label, color: options.color || "#ffd166" });
    if (options.npc) {
      const npc = createNpcRecord(options.npc, site, { x: x + 1.6, z: z + 1.4 }, options.npc, this.language);
      this.dynamic.add(npc.group);
      this.dynamic.add(npc.label);
      this.npcs.push(npc);
      site.npcs = [npc];
    }
    return site;
  }

  // ── doors & interiors ─────────────────────────────────────────────────
  // Every building registers its street door here. Interiors are built lazily
  // on first entry and cached, so a district with nineteen doors costs one
  // room of geometry until somebody actually walks in.
  _registerDoor(door) {
    if (!door || !door.id) return null;
    if (this.doors.some((entry) => entry.id === door.id)) return null;
    const record = {
      id: door.id,
      name: door.name || door.id,
      template: door.template || "shop",
      x: door.x, z: door.z,
      radius: 3.4,
    };
    this.doors.push(record);
    return record;
  }

  _buildDoors() {
    // One shared "E" texture for every threshold: cheap and readable.
    const element = document.createElement("canvas");
    element.width = 128;
    element.height = 128;
    const ctx = element.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,10,18,0.82)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(242,201,125,0.85)";
    ctx.stroke();
    ctx.font = "700 54px Inter, Segoe UI, sans-serif";
    ctx.fillStyle = "#ffe9b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(242,201,125,0.9)";
    ctx.shadowBlur = 16;
    ctx.fillText("E", 64, 66);
    const texture = new THREE.CanvasTexture(element);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthTest: true, depthWrite: false,
    });
    const ringGeometry = new THREE.RingGeometry(0.55, 0.78, 24);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2c97d, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (const door of this.doors) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(door.x, 0.035, door.z);
      ring.renderOrder = 2;
      this.statics.add(ring);
      const sprite = new THREE.Sprite(material.clone());
      sprite.scale.set(0.62, 0.62, 1);
      sprite.position.set(door.x, 1.45, door.z);
      sprite.renderOrder = 9;
      this.dynamic.add(sprite);
      this.doorMarkers.push({ door, ring, sprite, phase: Math.random() * Math.PI * 2 });
    }
  }

  enterBuilding(id) {
    const door = this.doors.find((entry) => entry.id === id);
    if (!door) return null;
    let room = this.interiors.get(door.id);
    if (!room) {
      room = door.template === "apartment"
        ? buildInterior(this.materials)
        : buildThemedInterior(door.template, this.interiors.size, this.materials);
      room.name = door.name;
      room.exitOutside = { x: door.x, z: door.z };
      room.entrance = { x: door.x, z: door.z };
      room.doorId = door.id;
      this.scene.add(room.group);
      this.interiors.set(door.id, room);
    }
    this.inside = true;
    this.interior = room;
    room.group.visible = true;
    return room.spawn;
  }

  // The Aurelia apartment still uses its bespoke room; it is built lazily in
  // enterBuilding() like every other door.

  _buildTraffic() {
    // Parked along the boulevard: the strongest cue that this is a living city.
    const spots = [
      [-64, -1], [-46, -1], [-18, 1], [8, 1], [34, -1], [58, 1], [84, -1], [104, 1],
    ];
    spots.forEach(([x, side], index) => {
      this._parkedCar(x, side * (AVE_HALF - 1.8), side > 0 ? 0 : Math.PI, index);
    });
    // A police cruiser by the market and one car on the pavement corner.
    const police = createTrafficCar(1);
    mergeByMaterial(police);
    police.position.set(-40, 0, -AVE_HALF + 2);
    police.rotation.y = Math.PI / 2;
    this.dynamic.add(police);
    this.cars.push(police);
  }

  _parkedCar(x, z, rotation, index) {
    // Parked cars never move, so each body style is built and baked once and
    // every other instance is a clone that shares the same geometry.
    if (!this._carTemplates) this._carTemplates = new Map();
    const key = index % 4;
    let template = this._carTemplates.get(key);
    if (!template) {
      template = createTrafficCar(key, { detail: false });
      mergeByMaterial(template);
      this._carTemplates.set(key, template);
    }
    const car = template.clone(true);
    car.position.set(x, 0, z);
    car.rotation.y = rotation;
    this.dynamic.add(car);
    this.cars.push(car);
    this.boxes.push({ x, z, hx: 1.5, hz: 2.6, noBlock: true });
    contactShadow(car, 1.9, 0.42, 0.02);
    return car;
  }

  _spawnVehicle() {
    const car = createCar({ type: "sports", color: "#c8a93f" });
    car.position.set(-8, 0, 7.6);
    car.rotation.y = Math.PI / 2;
    this.dynamic.add(car);
    this.truck = car;
    this.cars.push(car);
    contactShadow(car, 2.0, 0.45, 0.02);
    this.vehicleSpawn = { x: -8, z: 7.6, heading: Math.PI / 2 };
  }

  // ── interaction ───────────────────────────────────────────────────────
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

  nearDoor(x, z) {
    let best = null;
    let bestDistance = 3.4;
    for (const door of this.doors) {
      const distance = Math.hypot(x - door.x, z - door.z);
      if (distance < bestDistance) {
        best = door;
        bestDistance = distance;
      }
    }
    return best;
  }

  nearInteriorEntrance(x, z) {
    const door = this.interior?.entrance;
    if (!door) return null;
    return Math.hypot(x - door.x, z - door.z) < 4.2 ? door : null;
  }

  nearInteriorExit(x, z) {
    const door = this.interior?.exit;
    if (!door) return null;
    return Math.hypot(x - door.x, z - door.z) < 2.8 ? door : null;
  }

  enterInterior() {
    const door = this.nearDoor(this._lastPlayerX ?? 0, this._lastPlayerZ ?? 0)
      || this.doors.find((entry) => entry.template === "apartment");
    return door ? this.enterBuilding(door.id) : null;
  }

  exitInterior() {
    const room = this.interior;
    if (!room) return { x: 0, z: 6 };
    this.inside = false;
    room.group.visible = false;
    this.interior = null;
    return room.exitOutside || { x: 52, z: 13.4 };
  }

  get edge() {
    return { x: CITY_EDGE.x - 2, z: CITY_EDGE.z - 2 };
  }

  clamp(x, z) {
    return {
      x: Math.max(-this.edge.x, Math.min(this.edge.x, x)),
      z: Math.max(-this.edge.z, Math.min(this.edge.z, z)),
    };
  }

  climateAt() {
    return "temperate";
  }

  isBlocked(x, z) {
    if (this.inside) {
      const room = this.interior;
      if (!room) return false;
      if (x < room.bounds.x0 || x > room.bounds.x1 || z < room.bounds.z0 || z > room.bounds.z1) return "wall";
      for (const box of room.colliders) {
        if (Math.abs(x - box.x) < box.hx && Math.abs(z - box.z) < box.hz) return "furniture";
      }
      return "";
    }
    for (const box of this.boxes) {
      if (box.noBlock) continue;
      if (Math.abs(x - box.x) < box.hx && Math.abs(z - box.z) < box.hz) return "building";
    }
    if (Math.abs(x) > CITY_EDGE.x - 1 || Math.abs(z) > CITY_EDGE.z - 1) return "building";
    return "";
  }

  // Radar source data for the HUD: roads, blocks and blips in world units.
  radarData() {
    return {
      roads: this.roads,
      blocks: BLOCKS.map((b) => ({
        x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1,
      })),
      blips: this.blips,
      streets: STREETS,
    };
  }

  update(dt, elapsed) {
    this.time += dt;
    if (this.waterMesh?.material?.normalMap) {
      this.waterMesh.material.normalMap.offset.x = Math.sin(elapsed * 0.2) * 0.02;
    }
    for (const npc of this.npcs) {
      npc.label.position.set(npc.group.position.x, 2.18, npc.group.position.z);
    }
    for (const marker of this.doorMarkers) {
      const wave = 0.5 + Math.sin(this.time * 2.2 + marker.phase) * 0.5;
      marker.sprite.material.opacity = 0.55 + wave * 0.4;
      marker.sprite.position.y = 1.42 + Math.sin(this.time * 1.7 + marker.phase) * 0.05;
    }
    this.traffic?.update(dt, elapsed);
  }

  disposes() {
    for (const room of this.interiors.values()) {
      room.group?.traverse?.((object) => {
        if (!object.isMesh) return;
        if (!object.geometry?.userData?.cached) object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m) => { if (m && !m.userData?.shared) m.dispose?.(); });
      });
    }
    this.interiors.clear();
    this.group.traverse((object) => {
      if (!object.isMesh) return;
      // Merged meshes are owned by this district; kit materials are shared
      // across districts and must survive until the page is closed.
      if (!object.geometry?.userData?.cached) object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((m) => {
        if (m && !m.userData?.shared) m.dispose?.();
      });
    });
  }
}

export { spinWheels };
