// traffic.js — the district moves.
//
// Pedestrians walk the block perimeters, cars run the boulevard and the cross
// streets, and a couple of motorcycles thread between them. Everything here is
// visual: none of it blocks the player, and every material is either shared kit
// or owned by this district so leaving the room cannot corrupt the next one.

import * as THREE from "../vendor/three.module.js";
import { addMesh, contactShadow, roundedBox } from "./render/kit.js";
import { createMotorcycle, createTrafficCar, spinWheels } from "./vehicles.js";
import { CITY_EDGE, CROSS_STREETS } from "./city.js";

const CLOTHES = ["#7d1f22", "#2c4d63", "#4d5a45", "#c9a227", "#5b2a43", "#6b5848", "#3d5a80", "#8a5a44"];
const SKIN = ["#e8c3a0", "#d8a97f", "#bf8a5f", "#9a6544", "#6f4530"];
const HAIR = ["#2b1f1a", "#3a2a22", "#5a3a26", "#8b8b95", "#c9a05b"];

export class Traffic {
  constructor(city) {
    this.city = city;
    this.group = new THREE.Group();
    this.group.name = "traffic";
    city.dynamic.add(this.group);
    this.materials = new Map();
    this.pedestrians = [];
    this.vehicles = [];
    this._build();
  }

  _mat(color, roughness = 0.88, metalness = 0.02) {
    const key = `${color}|${roughness}|${metalness}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      this.materials.set(key, material);
    }
    return material;
  }

  _walker(index) {
    const root = new THREE.Group();
    const scale = 0.92 + (index % 3) * 0.05;
    root.scale.setScalar(scale);
    const shirt = this._mat(CLOTHES[index % CLOTHES.length]);
    const trousers = this._mat(index % 2 ? "#25262c" : "#3b3a36");
    const skin = this._mat(SKIN[index % SKIN.length], 0.95);
    const hair = this._mat(HAIR[index % HAIR.length], 0.9);

    const hips = new THREE.Group();
    hips.position.y = 0.92;
    root.add(hips);
    addMesh(hips, roundedBox(0.34, 0.52, 0.24, 0.08), shirt, [0, 0.28, 0]);
    addMesh(hips, roundedBox(0.2, 0.16, 0.18, 0.05), trousers, [0, 0.02, 0]);
    addMesh(hips, new THREE.SphereGeometry(0.115, 12, 10), skin, [0, 0.66, 0]);
    addMesh(hips, new THREE.SphereGeometry(0.125, 12, 10), hair, [0, 0.7, -0.01], [0, 0, 0]);
    addMesh(hips, new THREE.SphereGeometry(0.128, 12, 8), hair, [0, 0.735, -0.015], [0.2, 0, 0]);

    // Limbs use their own box geometry: the kit's rounded solids are cached
    // and shared, so translating one would move somebody else's arm.
    const limb = (w, h, d, material, x, y) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      hips.add(mesh);
      return mesh;
    };
    const limbs = {
      armL: limb(0.09, 0.48, 0.09, shirt, -0.23, 0.44),
      armR: limb(0.09, 0.48, 0.09, shirt, 0.23, 0.44),
      legL: limb(0.12, 0.78, 0.13, trousers, -0.1, -0.02),
      legR: limb(0.12, 0.78, 0.13, trousers, 0.1, -0.02),
    };
    addMesh(hips, roundedBox(0.16, 0.1, 0.28, 0.03), this._mat("#1a1a20"), [0, -0.79, 0.04]);
    return { root, limbs, hips };
  }

  _pathFor(block) {
    const inset = 1.1;
    return [
      [block.x0 - inset, block.z0 - inset],
      [block.x1 + inset, block.z0 - inset],
      [block.x1 + inset, block.z1 + inset],
      [block.x0 - inset, block.z1 + inset],
    ];
  }

  _addPedestrian(block, index) {
    const walker = this._walker(index);
    const path = this._pathFor(block);
    const start = (index * 0.37) % 1;
    this.group.add(walker.root);
    this.pedestrians.push({
      ...walker,
      path,
      segment: Math.floor(start * 4),
      t: start * 4 % 1,
      speed: 0.72 + (index % 4) * 0.08,
      phase: index * 1.7,
    });
  }

  _addCar(index, lane) {
    const car = createTrafficCar(index, { detail: false });
    car.position.set(lane.x, 0, lane.z);
    car.rotation.y = lane.heading;
    this.group.add(car);
    contactShadow(car, 2.0, 0.4, 0.02);
    this.vehicles.push({ object: car, lane, distance: 0, wheelDistance: 0 });
    void index;
  }

  _addBike(index, lane) {
    const bike = createMotorcycle({ color: index % 2 ? "#7d1f22" : "#2c4d63", rider: true });
    bike.position.set(lane.x, 0, lane.z);
    bike.rotation.y = lane.heading;
    this.group.add(bike);
    contactShadow(bike, 1.1, 0.4, 0.02);
    this.vehicles.push({ object: bike, lane, distance: 0, wheelDistance: 0 });
  }

  _build() {
    const blocks = this.city.blocks || [];
    // If the city did not expose its blocks, fall back to a few hand-picked
    // pavement loops; the spawn still reads as a busy street.
    const paths = blocks.length ? blocks : [
      { x0: -118, x1: -88, z0: 12, z1: 68 },
      { x0: -68, x1: -36, z0: -68, z1: -12 },
      { x0: -176, x1: -146, z0: 12, z1: 68 },
      { x0: 36, x1: 68, z0: 12, z1: 68 },
      { x0: 146, x1: 176, z0: -68, z1: -12 },
      { x0: 88, x1: 118, z0: 12, z1: 68 },
    ];
    paths.slice(0, 6).forEach((block, blockIndex) => {
      this._addPedestrian(block, blockIndex * 2);
      this._addPedestrian(block, blockIndex * 2 + 1);
    });

    const east = { x: -156, z: 6.2, dir: 1, axis: "x", heading: Math.PI / 2, min: -CITY_EDGE.x + 12, max: CITY_EDGE.x - 12 };
    const west = { x: 150, z: -6.2, dir: -1, axis: "x", heading: -Math.PI / 2, min: -CITY_EDGE.x + 12, max: CITY_EDGE.x - 12 };
    [east, west].forEach((lane, index) => this._addCar(index, { ...lane }));
    this._addBike(0, { x: 118, z: 9.4, dir: -1, axis: "x", heading: -Math.PI / 2, min: -CITY_EDGE.x + 12, max: CITY_EDGE.x - 12 });

    CROSS_STREETS.slice(1, 5).forEach((cx, index) => {
      const south = { x: cx, z: CITY_EDGE.z - 14, dir: -1, axis: "z", heading: Math.PI, min: -CITY_EDGE.z + 12, max: CITY_EDGE.z - 12 };
      const north = { x: cx + 4, z: -CITY_EDGE.z + 14, dir: 1, axis: "z", heading: 0, min: -CITY_EDGE.z + 12, max: CITY_EDGE.z - 12 };
      this._addCar(index + 2, index % 2 ? south : north);
      if (index === 1) this._addBike(1, { ...south, x: cx - 4.4 });
    });

    // The ring road: four cars running the edge of the map in both
    // directions, so no matter where you stand there is traffic somewhere.
    const ringX = CITY_EDGE.x - 20;
    const ringZ = CITY_EDGE.z - 20;
    [
      { x: -ringX + 40, z: -ringZ + 5, dir: 1, axis: "x", heading: Math.PI / 2, min: -ringX + 20, max: ringX - 20 },
      { x: ringX - 40, z: ringZ - 5, dir: -1, axis: "x", heading: -Math.PI / 2, min: -ringX + 20, max: ringX - 20 },
      { x: -ringX + 5, z: ringZ - 40, dir: -1, axis: "z", heading: Math.PI, min: -ringZ + 20, max: ringZ - 20 },
      { x: ringX - 5, z: -ringZ + 40, dir: 1, axis: "z", heading: 0, min: -ringZ + 20, max: ringZ - 20 },
    ].forEach((lane, index) => this._addCar(8 + index, lane));

    // Outer arteries: a handful of cars crossing the districts north–south and
    // east–west, far enough out that the sprawl never feels abandoned.
    [0.34, 0.62, 0.86].forEach((factor, index) => {
      const x = -CITY_EDGE.x * factor;
      this._addCar(12 + index, {
        x, z: -CITY_EDGE.z + 60, dir: 1, axis: "z", heading: 0,
        min: -CITY_EDGE.z + 12, max: CITY_EDGE.z - 12,
      });
      this._addCar(15 + index, {
        x: -x, z: CITY_EDGE.z - 60, dir: -1, axis: "z", heading: Math.PI,
        min: -CITY_EDGE.z + 12, max: CITY_EDGE.z - 12,
      });
      const z = CITY_EDGE.z * factor * 0.8;
      this._addCar(18 + index, {
        x: -CITY_EDGE.x + 60, z: z + 6, dir: 1, axis: "x", heading: Math.PI / 2,
        min: -CITY_EDGE.x + 12, max: CITY_EDGE.x - 12,
      });
    });

    // Parked motorcycles outside the garage, one by the diner.
    [
      [30, 62.6, Math.PI / 2],
      [33.4, 62.6, Math.PI / 2],
      [102, -70.4, -Math.PI / 2],
    ].forEach(([x, z, heading], index) => {
      const bike = createMotorcycle({ color: ["#c9a227", "#7d1f22", "#2c4d63"][index], rider: false });
      bike.position.set(x, 0, z);
      bike.rotation.y = heading;
      this.group.add(bike);
      contactShadow(bike, 1.0, 0.4, 0.02);
    });
  }

  update(dt, elapsed) {
    for (const person of this.pedestrians) {
      const path = person.path;
      const from = path[person.segment];
      const to = path[(person.segment + 1) % path.length];
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      person.t += (person.speed * dt) / Math.max(0.1, length);
      if (person.t >= 1) {
        person.t -= 1;
        person.segment = (person.segment + 1) % path.length;
      }
      const a = path[person.segment];
      const b = path[(person.segment + 1) % path.length];
      const x = a[0] + (b[0] - a[0]) * person.t;
      const z = a[1] + (b[1] - a[1]) * person.t;
      person.root.position.set(x, 0.24, z);
      person.root.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const swing = Math.sin(elapsed * 7 + person.phase) * 0.5;
      person.limbs.legL.rotation.x = swing;
      person.limbs.legR.rotation.x = -swing;
      person.limbs.armL.rotation.x = -swing * 0.7;
      person.limbs.armR.rotation.x = swing * 0.7;
      person.hips.position.y = 0.92 + Math.abs(Math.sin(elapsed * 7 + person.phase)) * 0.025;
    }

    for (const vehicle of this.vehicles) {
      const { lane } = vehicle;
      const step = (lane.axis === "x" ? 12 : 10) * dt;
      vehicle.distance += step;
      const object = vehicle.object;
      if (lane.axis === "x") {
        object.position.x += step * lane.dir;
        if (object.position.x > lane.max) object.position.x = lane.min;
        if (object.position.x < lane.min) object.position.x = lane.max;
      } else {
        object.position.z += step * lane.dir;
        if (object.position.z > lane.max) object.position.z = lane.min;
        if (object.position.z < lane.min) object.position.z = lane.max;
      }
      if (object.userData?.wheels) {
        spinWheels(object, step, 0);
      }
      object.position.y = Math.abs(Math.sin(vehicle.distance * 0.8)) * 0.008;
    }
  }
}
