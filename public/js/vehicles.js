// Aetherhold — vehicles.
//
// Car bodies are extruded side silhouettes with a bevelled edge, a separate
// glass canopy, lathed wheels with real rims and brake discs, and the small
// pieces (handles, mirrors, grille slats, plates, exhausts) that make a shape
// read as a car rather than a painted box.

import * as THREE from "../vendor/three.module.js";
import { lathe, roundedBox, tube, extrudeProfile, signTexture, kitMaterials } from "./render/kit.js";

const materials = kitMaterials;

const PROFILES = {
  sedan: {
    width: 1.86,
    wheelbase: 2.72,
    wheelRadius: 0.33,
    wheelWidth: 0.24,
    body: [
      [-2.18, 0.30], [-2.20, 0.54], [-2.08, 0.74], [-1.82, 0.86], [-1.26, 0.90],
      [1.02, 0.90], [1.48, 0.86], [1.96, 0.76], [2.16, 0.60], [2.18, 0.40],
      [2.08, 0.28], [1.70, 0.22], [-1.78, 0.22],
    ],
    cabin: [
      [-1.30, 0.89], [-1.08, 1.28], [-0.82, 1.40], [0.30, 1.40], [0.82, 1.32], [1.14, 0.89],
    ],
    roof: { width: 0.82, y: 1.40, z: 0.26, length: 1.1 },
  },
  sports: {
    width: 1.98,
    wheelbase: 2.66,
    wheelRadius: 0.35,
    wheelWidth: 0.30,
    body: [
      [-2.26, 0.24], [-2.22, 0.44], [-2.02, 0.60], [-1.56, 0.70], [1.24, 0.72],
      [1.94, 0.64], [2.20, 0.48], [2.22, 0.32], [1.96, 0.22], [-1.92, 0.18],
    ],
    cabin: [
      [-1.52, 0.71], [-1.08, 1.02], [-0.44, 1.14], [0.52, 1.12], [0.98, 0.71],
    ],
    roof: { width: 0.78, y: 1.14, z: 0.04, length: 0.92 },
  },
  suv: {
    width: 2.02,
    wheelbase: 2.94,
    wheelRadius: 0.40,
    wheelWidth: 0.30,
    body: [
      [-2.40, 0.34], [-2.42, 0.66], [-2.30, 0.94], [-2.02, 1.06], [-1.30, 1.10],
      [1.30, 1.10], [1.88, 1.02], [2.24, 0.84], [2.40, 0.60], [2.36, 0.38],
      [2.16, 0.30], [1.92, 0.24], [-2.14, 0.24],
    ],
    cabin: [
      [-2.06, 1.09], [-1.98, 1.72], [-1.40, 1.80], [1.10, 1.80], [1.52, 1.60], [1.56, 1.09],
    ],
    roof: { width: 1.62, y: 1.80, z: -0.26, length: 2.34 },
  },
  van: {
    width: 2.08,
    wheelbase: 3.24,
    wheelRadius: 0.38,
    wheelWidth: 0.28,
    body: [
      [-2.72, 0.32], [-2.74, 0.62], [-2.68, 0.94], [-2.30, 1.06], [1.50, 1.06],
      [2.10, 0.98], [2.44, 0.78], [2.52, 0.48], [2.36, 0.30], [2.02, 0.24], [-2.44, 0.24],
    ],
    cabin: [
      [-2.58, 1.05], [-2.56, 1.98], [-2.28, 2.12], [1.16, 2.12], [1.46, 1.94], [1.48, 1.05],
    ],
    roof: { width: 1.74, y: 2.12, z: -0.6, length: 3.4 },
  },
};

const PALETTE = [
  "#1b2f52", "#7d1f22", "#e6e3dc", "#16181d", "#4d5a45", "#8d939c",
  "#2c4d63", "#c9a227", "#5b2a43", "#2f7d74",
];

// A lathed wheel: sidewall, tread, rim face, five spokes, disc and caliper.
function buildWheel(radius, width, detail = true) {
  const M = materials();
  const group = new THREE.Group();

  const tyre = lathe([
    [radius * 0.60, -width / 2],
    [radius * 0.86, -width / 2],
    [radius * 0.99, -width / 2 + width * 0.16],
    [radius, 0],
    [radius * 0.99, width / 2 - width * 0.16],
    [radius * 0.86, width / 2],
    [radius * 0.60, width / 2],
  ], detail ? 26 : 14, { crease: Math.PI / 3 });
  tyre.rotateZ(Math.PI / 2);
  const tyreMesh = new THREE.Mesh(tyre, M.rubber);
  tyreMesh.castShadow = detail;
  group.add(tyreMesh);

  const rim = lathe([
    [0, -width * 0.42],
    [radius * 0.58, -width * 0.42],
    [radius * 0.62, -width * 0.30],
    [radius * 0.62, width * 0.34],
    [radius * 0.56, width * 0.44],
    [0, width * 0.44],
  ], detail ? 22 : 12, { crease: Math.PI / 5 });
  rim.rotateZ(Math.PI / 2);
  group.add(new THREE.Mesh(rim, M.brushed));

  // Spokes radiate in the YZ plane around the X axle.
  for (let i = 0; i < 5; i += 1) {
    const spoke = detail
      ? roundedBox(width * 0.30, radius * 0.92, 0.075, 0.018)
      : new THREE.BoxGeometry(width * 0.3, radius * 0.92, 0.075);
    const mesh = new THREE.Mesh(spoke, M.steel);
    mesh.rotation.x = (i / 5) * Math.PI * 2;
    mesh.position.x = width * 0.1;
    group.add(mesh);
  }
  const lip = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.6, radius * 0.035, 8, detail ? 28 : 14), M.chrome);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = width * 0.36;
  group.add(lip);

  const hub = new THREE.Mesh(lathe([
    [0, -width * 0.1], [radius * 0.16, -width * 0.1], [radius * 0.16, width * 0.1], [0, width * 0.1],
  ], detail ? 18 : 10), M.chrome);
  hub.rotateZ(Math.PI / 2);
  group.add(hub);

  if (detail) {
    const disc = new THREE.Mesh(lathe([
      [0, -0.018], [radius * 0.5, -0.018], [radius * 0.5, 0.018], [0, 0.018],
    ], 22), M.iron);
    disc.rotateZ(Math.PI / 2);
    disc.position.x = -width * 0.26;
    group.add(disc);

    const caliper = roundedBox(radius * 0.16, radius * 0.34, width * 0.12, 0.02);
    const caliperMesh = new THREE.Mesh(caliper, M.paintRed);
    caliperMesh.position.set(-width * 0.26, radius * 0.22, 0);
    caliperMesh.rotation.x = 0.2;
    group.add(caliperMesh);
  }

  return group;
}

function addWheelWell(parent, radius, width, x, z) {
  const M = materials();
  const well = new THREE.Mesh(lathe([
    [0, -0.01], [radius * 1.05, -0.01], [radius * 1.05, 0.01], [0, 0.01],
  ], 22), new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 1 }));
  well.rotateZ(Math.PI / 2);
  well.position.set(x, radius, z);
  parent.add(well);
}

function buildCar(options = {}) {
  const M = materials();
  const type = options.type && PROFILES[options.type] ? options.type : "sedan";
  const profile = PROFILES[type];
  const color = options.color || PALETTE[0];
  const detail = options.detail !== false;
  const paint = M.carPaint(color);

  const car = new THREE.Group();
  car.name = `car:${type}`;

  // ── shell ──
  const bodyGeometry = extrudeProfile(profile.body, profile.width, {
    bevel: 0.045, bevelSegments: 3, uvScale: 0.6,
  });
  bodyGeometry.rotateY(-Math.PI / 2);
  const body = new THREE.Mesh(bodyGeometry, paint);
  body.castShadow = true;
  body.receiveShadow = true;
  car.add(body);

  // ── glasshouse ──
  const cabinGeometry = extrudeProfile(profile.cabin, profile.width * 0.9, {
    bevel: 0.03, bevelSegments: 2,
  });
  cabinGeometry.rotateY(-Math.PI / 2);
  const cabin = new THREE.Mesh(cabinGeometry, M.glass);
  cabin.castShadow = true;
  car.add(cabin);

  const halfLength = Math.max(...profile.body.map(([x]) => Math.abs(x)));
  const roof = profile.roof;
  const roofMesh = new THREE.Mesh(roundedBox(roof.width, 0.055, roof.length, 0.03), paint);
  roofMesh.position.set(0, roof.y + 0.005, roof.z);
  roofMesh.castShadow = true;
  car.add(roofMesh);

  // A/C pillars so the canopy does not float like a greenhouse bubble.
  const pillarHeight = roof.y - profile.body[4][1];
  [-1, 1].forEach((side) => {
    const pillar = new THREE.Mesh(roundedBox(0.075, pillarHeight + 0.12, 0.10, 0.025), paint);
    pillar.position.set(side * (profile.width * 0.44), profile.body[4][1] + pillarHeight / 2 + 0.05,
      halfLength * 0.52);
    pillar.rotation.x = -0.22;
    car.add(pillar);
    const rearPillar = pillar.clone();
    rearPillar.position.z = -halfLength * 0.6;
    rearPillar.rotation.x = 0.34;
    car.add(rearPillar);
  });

  // ── wheels ──
  const wheelZ = profile.wheelbase / 2;
  const wheelX = profile.width / 2 - profile.wheelWidth / 2 - 0.015;
  const wheels = [];
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sideX, sideZ]) => {
    addWheelWell(car, profile.wheelRadius, profile.wheelWidth, sideX * wheelX, sideZ * wheelZ);
    const pivot = new THREE.Group();
    pivot.position.set(sideX * wheelX, profile.wheelRadius, sideZ * wheelZ);
    const spin = buildWheel(profile.wheelRadius, profile.wheelWidth, detail);
    pivot.add(spin);
    car.add(pivot);
    wheels.push({ pivot, spin, radius: profile.wheelRadius, front: sideZ > 0 });
  });
  car.userData.wheels = wheels;

  // ── wheel arch trim ──
  [-1, 1].forEach((sideX) => {
    [-1, 1].forEach((sideZ) => {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(profile.wheelRadius + 0.055, 0.045, 6, 22, Math.PI * 1.05),
        M.darkTrim
      );
      arch.position.set(sideX * (profile.width / 2 - 0.02), profile.wheelRadius, sideZ * wheelZ);
      arch.rotation.y = Math.PI / 2;
      arch.rotation.x = -Math.PI * 0.02;
      car.add(arch);
    });
  });

  // ── lighting ──
  const nose = halfLength - 0.02;
  const lampY = profile.body[3][1] - 0.06;
  [-1, 1].forEach((side) => {
    const housing = new THREE.Mesh(roundedBox(0.42, 0.15, 0.14, 0.05), M.darkTrim);
    housing.position.set(side * profile.width * 0.3, lampY, nose - 0.08);
    car.add(housing);
    const lens = new THREE.Mesh(roundedBox(0.34, 0.1, 0.05, 0.04), M.headLight);
    lens.position.set(side * profile.width * 0.3, lampY, nose - 0.005);
    car.add(lens);
    // Indicator.
    const indicator = new THREE.Mesh(roundedBox(0.1, 0.06, 0.04, 0.02), M.paintYellow);
    indicator.position.set(side * (profile.width * 0.3 + 0.26), lampY, nose - 0.02);
    car.add(indicator);
    // Tail cluster.
    const tail = new THREE.Mesh(roundedBox(0.40, 0.14, 0.07, 0.04), M.tailLight);
    tail.position.set(side * profile.width * 0.31, lampY, -halfLength + 0.03);
    car.add(tail);
  });

  // Daytime running light strip.
  const drl = new THREE.Mesh(roundedBox(profile.width * 0.68, 0.035, 0.045, 0.017), M.lampCool);
  drl.position.set(0, lampY + 0.1, nose - 0.02);
  car.add(drl);

  // ── grille + bumpers ──
  const grille = new THREE.Mesh(roundedBox(profile.width * 0.5, 0.2, 0.08, 0.05), M.iron);
  grille.position.set(0, profile.body[5][1] - 0.14, nose - 0.03);
  car.add(grille);
  for (let i = 0; i < 4; i += 1) {
    const slat = new THREE.Mesh(roundedBox(profile.width * 0.46, 0.018, 0.03, 0.008), M.chrome);
    slat.position.set(0, profile.body[5][1] - 0.24 + i * 0.045, nose + 0.01);
    car.add(slat);
  }
  const frontBumper = new THREE.Mesh(roundedBox(profile.width * 0.98, 0.16, 0.24, 0.09), paint);
  frontBumper.position.set(0, 0.3, nose - 0.12);
  car.add(frontBumper);
  const splitter = new THREE.Mesh(roundedBox(profile.width * 0.92, 0.035, 0.16, 0.02), M.darkTrim);
  splitter.position.set(0, 0.21, nose - 0.16);
  car.add(splitter);
  const rearBumper = frontBumper.clone();
  rearBumper.position.z = -nose + 0.12;
  car.add(rearBumper);

  // ── side detail ──
  [-1, 1].forEach((side) => {
    const skirt = new THREE.Mesh(roundedBox(0.09, 0.09, profile.wheelbase * 0.74, 0.04), M.darkTrim);
    skirt.position.set(side * (profile.width / 2 - 0.02), 0.35, 0);
    car.add(skirt);

    // Door handle.
    const handle = new THREE.Mesh(roundedBox(0.045, 0.035, 0.2, 0.017), M.chrome);
    handle.position.set(side * (profile.width / 2 + 0.005), profile.body[4][1] - 0.16, halfLength * 0.02);
    car.add(handle);

    // Mirror: stalk + housing.
    const arm = new THREE.Mesh(tube([
      [side * profile.width * 0.44, profile.body[4][1] + 0.06, halfLength * 0.42],
      [side * profile.width * 0.53, profile.body[4][1] + 0.10, halfLength * 0.40],
    ], 0.022, { segments: 6, radial: 5 }), M.darkTrim);
    car.add(arm);
    const mirror = new THREE.Mesh(roundedBox(0.06, 0.09, 0.15, 0.03), paint);
    mirror.position.set(side * profile.width * 0.56, profile.body[4][1] + 0.12, halfLength * 0.38);
    car.add(mirror);
  });

  // ── rear detail ──
  const plateTexture = signTexture(["LS 4K 218"], { background: "#e8e6dc", color: "#1a1a20" });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.13),
    new THREE.MeshStandardMaterial({ map: plateTexture, roughness: 0.6 })
  );
  plate.position.set(0, 0.42, -halfLength - 0.005);
  plate.rotation.y = Math.PI;
  car.add(plate);

  [-1, 1].forEach((side) => {
    const exhaust = new THREE.Mesh(lathe([
      [0, -0.07], [0.055, -0.07], [0.06, 0], [0.055, 0.07], [0, 0.07],
    ], 12), M.chrome);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * profile.width * 0.32, 0.3, -halfLength - 0.02);
    car.add(exhaust);
  });

  const spoiler = new THREE.Mesh(roundedBox(profile.width * 0.7, 0.035, 0.22, 0.02), M.darkTrim);
  spoiler.position.set(0, profile.body[1][1] + 0.1, -halfLength * 0.93);
  spoiler.rotation.x = -0.1;
  car.add(spoiler);

  if (options.police) {
    const bar = new THREE.Mesh(roundedBox(1.1, 0.12, 0.24, 0.04), M.darkTrim);
    bar.position.set(0, roof.y + 0.1, roof.z);
    car.add(bar);
    const red = new THREE.Mesh(roundedBox(0.34, 0.1, 0.18, 0.03), M.tailLight);
    red.position.set(-0.32, roof.y + 0.11, roof.z);
    car.add(red);
    const blue = new THREE.Mesh(roundedBox(0.34, 0.1, 0.18, 0.03), M.neonBlue);
    blue.position.set(0.32, roof.y + 0.11, roof.z);
    car.add(blue);
  }

  car.userData.type = type;
  car.userData.profile = profile;
  return car;
}

export function createCar(options = {}) {
  return buildCar(options);
}

export function createTrafficCar(index = 0, options = {}) {
  const types = ["sedan", "sports", "suv", "van"];
  return buildCar({
    ...options,
    type: types[index % types.length],
    color: options.color || PALETTE[(index * 3 + 1) % PALETTE.length],
  });
}

export function createPoliceCar() {
  return buildCar({ type: "sedan", color: "#1a1c22", police: true });
}

// Roll every wheel by ground distance and steer the front axle.
export function spinWheels(vehicle, distance, steerAngle = 0) {
  const wheels = vehicle?.userData?.wheels;
  if (!wheels) return;
  for (const wheel of wheels) {
    wheel.spin.rotation.x += distance / Math.max(0.1, wheel.radius);
    if (wheel.front) wheel.pivot.rotation.y = steerAngle;
  }
}

export function carForSale(color) {
  return buildCar({ type: "sports", color: color || PALETTE[7] });
}

export { PALETTE as CAR_PALETTE };
