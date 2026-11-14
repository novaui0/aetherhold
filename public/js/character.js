// Aetherhold — articulated humanoid avatars with faces, cloth and a walk cycle.

import * as THREE from "../vendor/three.module.js";

const DEFAULT_SKIN = "#e3b48d";
const DEFAULT_HAIR = "#3a2a22";

const materials = new Map();
const geometries = new Map();
const skinMaterials = new Map();
const irisMaterials = new Map();

function makeSkinTexture(hex) {
  // Pores, blotches and a faint capillary flush. At avatar distance it reads as
  // skin rather than painted plastic; up close it still holds together.
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i += 1) {
    const alpha = 0.02 + Math.random() * 0.06;
    ctx.fillStyle = Math.random() > 0.45 ? `rgba(255,240,226,${alpha})` : `rgba(70,32,22,${alpha})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 1.6, 1 + Math.random() * 1.4);
  }
  for (let i = 0; i < 26; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 6 + Math.random() * 26;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(186,92,74,${0.03 + Math.random() * 0.05})`);
    gradient.addColorStop(1, "rgba(186,92,74,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function skinMaterial(color, rough = 0.58) {
  const key = `${color}|${rough}`;
  let material = skinMaterials.get(key);
  if (!material) {
    material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: makeSkinTexture(color),
      roughness: rough,
      metalness: 0.0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.72,
      sheen: 0.35,
      sheenRoughness: 0.85,
      sheenColor: new THREE.Color("#ffd9c4"),
    });
    skinMaterials.set(key, material);
  }
  return material;
}

function irisMaterial(color) {
  let material = irisMaterials.get(color);
  if (material) return material;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const base = new THREE.Color(color);
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, `#${base.clone().multiplyScalar(0.55).getHexString()}`);
  gradient.addColorStop(0.55, color);
  gradient.addColorStop(0.88, `#${base.clone().multiplyScalar(1.25).getHexString()}`);
  gradient.addColorStop(1, "#2a1c14");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const length = 18 + Math.random() * 38;
    ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? "255,246,232" : "38,24,16"},${0.05 + Math.random() * 0.15})`;
    ctx.lineWidth = 0.8 + Math.random() * 0.9;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(angle) * 12, 64 + Math.sin(angle) * 12);
    ctx.lineTo(64 + Math.cos(angle) * (12 + length), 64 + Math.sin(angle) * (12 + length));
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(28,16,10,0.6)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.28, metalness: 0.05 });
  irisMaterials.set(color, material);
  return material;
}

function mat(color, options = {}) {
  const key = `${color}|${options.roughness ?? 0.82}|${options.metalness ?? 0.03}|${options.emissive ?? ""}|${options.opacity ?? 1}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: options.roughness ?? 0.82,
      metalness: options.metalness ?? 0.03,
      emissive: options.emissive ? new THREE.Color(options.emissive) : 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 1,
      transparent: (options.opacity ?? 1) < 1,
      opacity: options.opacity ?? 1,
      side: options.side ?? THREE.FrontSide,
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

function piece(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function groupAt(parent, position) {
  const node = new THREE.Group();
  node.position.set(...position);
  parent.add(node);
  return node;
}

function addFace(head, skin, hairColor) {
  const eyeWhite = mat("#f6f1ea", { roughness: 0.45 });
  const iris = mat("#3b2a24", { roughness: 0.4 });
  const pupil = mat("#0b0a10", { roughness: 0.3 });
  const brow = mat(hairColor, { roughness: 0.9 });
  const eyes = [];

  [-1, 1].forEach((side) => {
    const eye = groupAt(head, [side * 0.038, 0.012, 0.086]);
    eyes.push(eye);
    piece(eye, geo("eye", () => new THREE.SphereGeometry(0.021, 10, 8)), eyeWhite, [0, 0, 0], [0, 0, 0], [1.16, 0.92, 0.72]);
    piece(eye, geo("iris", () => new THREE.SphereGeometry(0.0115, 8, 6)), iris, [0, 0, 0.014], [0, 0, 0], [1, 1, 0.45]);
    piece(eye, geo("pupil", () => new THREE.SphereGeometry(0.005, 6, 5)), pupil, [0, 0, 0.019], [0, 0, 0], [1, 1, 0.4]);
    // Eyelid and brow give the face a readable expression.
    piece(head, geo("lid", () => new THREE.SphereGeometry(0.0225, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      mat(new THREE.Color(skin).multiplyScalar(0.97), { roughness: 0.9 }),
      [side * 0.038, 0.016, 0.085], [0.35, 0, 0], [1.12, 0.9, 0.85]);
    piece(head, geo("brow", () => new THREE.BoxGeometry(0.038, 0.0085, 0.014)), brow,
      [side * 0.039, 0.042, 0.093], [0, 0, side * -0.12]);
  });

  // Nose bridge + tip.
  piece(head, geo("nose", () => new THREE.ConeGeometry(0.019, 0.052, 7)), mat(new THREE.Color(skin).multiplyScalar(0.95), { roughness: 0.9 }),
    [0, -0.012, 0.098], [Math.PI * 0.52, 0, 0], [1, 1, 0.85]);
  // Mouth: two thin lips, the lower slightly fuller.
  piece(head, geo("lip", () => new THREE.BoxGeometry(0.05, 0.008, 0.016)), mat("#a8615c", { roughness: 0.75 }),
    [0, -0.052, 0.092], [0.06, 0, 0]);
  piece(head, geo("lip2", () => new THREE.BoxGeometry(0.042, 0.011, 0.018)), mat("#b56f68", { roughness: 0.75 }),
    [0, -0.062, 0.09], [0.1, 0, 0]);
  // Jaw and cheekbones soften the sphere into a head.
  piece(head, geo("jaw", () => new THREE.SphereGeometry(0.078, 12, 8)), mat(new THREE.Color(skin).multiplyScalar(0.99), { roughness: 0.9 }),
    [0, -0.055, 0.012], [0, 0, 0], [1, 0.82, 0.98]);
  [-1, 1].forEach((side) => {
    piece(head, geo("ear", () => new THREE.SphereGeometry(0.024, 8, 6)), mat(skin, { roughness: 0.92 }),
      [side * 0.098, -0.004, 0.004], [0, 0, 0], [0.5, 1.15, 0.8]);
    piece(head, geo("cheek", () => new THREE.SphereGeometry(0.033, 8, 6)), mat(new THREE.Color(skin).multiplyScalar(0.985), { roughness: 0.95 }),
      [side * 0.055, -0.024, 0.07], [0, 0, 0], [1, 0.85, 0.7]);
  });
  return eyes;
}

function addHair(head, hairColor, style) {
  const hair = mat(hairColor, { roughness: 0.95 });
  if (style === "shaved") {
    piece(head, geo("cap", () => new THREE.SphereGeometry(0.108, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42)), hair,
      [0, 0.012, -0.004], [0, 0, 0], [1.01, 0.86, 1.03]);
    return;
  }
  piece(head, geo("cap", () => new THREE.SphereGeometry(0.112, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)), hair,
    [0, 0.012, -0.006], [0, 0, 0], [1.02, 1.02, 1.04]);
  if (style === "long") {
    const back = piece(head, geo("hairlong", () => new THREE.CapsuleGeometry(0.095, 0.2, 4, 10)), hair,
      [0, -0.12, -0.045], [0.12, 0, 0], [1.05, 1, 0.55]);
    back.castShadow = false;
    [-1, 1].forEach((side) => {
      piece(head, geo("hairside", () => new THREE.CapsuleGeometry(0.028, 0.16, 4, 8)), hair,
        [side * 0.093, -0.075, -0.005], [0, 0, side * 0.06], [1, 1, 0.8]);
    });
  } else if (style === "braid") {
    piece(head, geo("braid", () => new THREE.CapsuleGeometry(0.026, 0.3, 4, 8)), hair,
      [0, -0.17, -0.075], [0.18, 0, 0], [1, 1, 1]);
    piece(head, geo("brow2", () => new THREE.CapsuleGeometry(0.032, 0.02, 3, 8)), hair,
      [0.07, -0.02, 0.06], [0.2, 0.5, 0.4], [1, 1, 1]);
  } else if (style === "curls") {
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      piece(head, geo("curl", () => new THREE.SphereGeometry(0.038, 8, 6)), hair,
        [Math.cos(angle) * 0.082, 0.075 + Math.sin(i) * 0.008, Math.sin(angle) * 0.082 - 0.004],
        [0, 0, 0], [1, 0.8, 1]);
    }
  }
}

function tint(hex, factor) {
  return `#${new THREE.Color(hex).multiplyScalar(factor).getHexString()}`;
}

// The realistic face: sockets, lids and lashes, a striated iris, a shaped jaw,
// cheekbones and a nose that follows the chosen preset.
function addRealisticFace(head, look) {
  const skin = look.skin || DEFAULT_SKIN;
  const faceShape = look.face || "oval";
  const noseType = look.nose || "straight";
  const eyeColor = look.eyeColor || "#4a2f1d";
  const skinMat = skinMaterial(skin);
  const shadowSkin = skinMaterial(tint(skin, 0.9), 0.66);
  const sclera = mat("#f8f4ee", { roughness: 0.28 });
  const lashMat = mat("#201712", { roughness: 0.72 });
  const lips = mat("#a8605d", { roughness: 0.5 });
  const lipsDark = mat("#7d4644", { roughness: 0.55 });
  const eyes = [];

  // Eye sockets sit a little deeper than the cheekbone, so the face has structure.
  [-1, 1].forEach((side) => {
    piece(head, geo("socket", () => new THREE.SphereGeometry(0.037, 12, 10)), shadowSkin,
      [side * 0.041, 0.017, 0.078], [0, 0, 0], [1.12, 0.86, 0.42]);

    const eye = groupAt(head, [side * 0.041, 0.015, 0.091]);
    eyes.push(eye);
    piece(eye, geo("eye", () => new THREE.SphereGeometry(0.0215, 14, 12)), sclera, [0, 0, 0], [0, 0, 0], [1.15, 0.9, 0.74]);
    // The iris faces the room rather than the skull.
    piece(eye, geo("irisDisc", () => new THREE.CircleGeometry(0.0124, 20)), irisMaterial(eyeColor),
      [0, 0.0005, 0.0166], [0, 0, 0], [1, 1, 1]);
    piece(eye, geo("pupilDisc", () => new THREE.CircleGeometry(0.0054, 16)), mat("#08070a", { roughness: 0.25 }),
      [0, 0.0005, 0.0172]);
    piece(eye, geo("glint", () => new THREE.SphereGeometry(0.0026, 6, 5)),
      mat("#fffaf0", { emissive: "#fff4dc", emissiveIntensity: 0.6, roughness: 0.2 }),
      [-0.0042, 0.0052, 0.018]);

    // Upper lid, lower waterline and lashes.
    piece(eye, geo("lid", () => new THREE.SphereGeometry(0.0232, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.52)), skinMat,
      [0, 0.0035, 0.0015], [0.3, 0, 0], [1.1, 0.95, 0.92]);
    piece(eye, geo("waterline", () => new THREE.CapsuleGeometry(0.0021, 0.026, 2, 6)),
      mat("#b9786d", { roughness: 0.55 }), [0, -0.0112, 0.0092], [0, 0, Math.PI / 2], [1, 1, 0.8]);
    for (let i = 0; i < 4; i += 1) {
      piece(eye, geo("lash", () => new THREE.CapsuleGeometry(0.0011, 0.012, 1, 4)), lashMat,
        [(-0.012 + i * 0.008) * side, 0.0125, 0.0135], [0.1, 0, side * (0.5 - i * 0.22)]);
    }
    // Brow ridge and brow, thicker for presets that read older.
    piece(head, geo("browRidge", () => new THREE.SphereGeometry(0.03, 10, 7)), shadowSkin,
      [side * 0.043, 0.041, 0.078], [0, 0, 0], [1.25, 0.48, 0.55]);
    piece(head, geo("brow", () => new THREE.CapsuleGeometry(0.0052, 0.032, 2, 6)),
      mat(tint(look.hair || DEFAULT_HAIR, 0.92), { roughness: 0.86 }),
      [side * 0.042, 0.0455, 0.0918], [0.06, 0, Math.PI / 2 + side * 0.15], [1, 1, 0.7]);
    // Cheekbone.
    piece(head, geo("cheekbone", () => new THREE.SphereGeometry(0.032, 10, 8)), skinMat,
      [side * 0.058, -0.012, 0.064], [0.2, 0, side * 0.15], [1.05, 0.7, 0.6]);
  });

  // Nose: bridge, tip and nostrils, shaped by the preset.
  const noseScale = noseType === "broad" ? 1.32 : noseType === "small" ? 0.78 : 1;
  piece(head, geo("bridge", () => new THREE.CapsuleGeometry(0.0155, 0.05, 3, 8)), skinMat,
    [0, 0.004, 0.093], [0.12, 0, 0], [noseScale, 1, noseType === "broad" ? 1.2 : 0.9]);
  const tipY = noseType === "hooked" ? -0.043 : -0.036;
  const tipZ = noseType === "hooked" ? 0.104 : 0.099;
  piece(head, geo("noseTip", () => new THREE.SphereGeometry(0.0205, 10, 8)), skinMat,
    [0, tipY, tipZ], [0.2, 0, 0], [noseScale, 0.86, 0.9]);
  [-1, 1].forEach((side) => {
    piece(head, geo("nostril", () => new THREE.SphereGeometry(0.0062, 7, 6)), shadowSkin,
      [side * 0.011 * noseScale, tipY - 0.003, tipZ + 0.002], [0, 0, 0], [1, 0.7, 0.6]);
  });
  piece(head, geo("philtrum", () => new THREE.BoxGeometry(0.0035, 0.013, 0.004)), shadowSkin,
    [0, -0.055, 0.097], [0.08, 0, 0]);

  // Lips: a shaped upper lip, a fuller lower lip and a dark seam between.
  piece(head, geo("lipUpper", () => new THREE.CapsuleGeometry(0.0062, 0.036, 3, 8)), lips,
    [0, -0.067, 0.0955], [0.06, 0, Math.PI / 2], [1, 1.15, 0.72]);
  piece(head, geo("lipLower", () => new THREE.CapsuleGeometry(0.0084, 0.03, 3, 8)), lipsDark,
    [0, -0.0775, 0.0945], [0.04, 0, Math.PI / 2], [1, 1.3, 0.8]);
  piece(head, geo("lipSeam", () => new THREE.BoxGeometry(0.048, 0.0018, 0.004)), mat("#4d2a29", { roughness: 0.7 }),
    [0, -0.0725, 0.0995], [0.04, 0, 0]);
  // Chin and jaw, shaped per face.
  const jaw = {
    oval: { sx: 1.0, sy: 0.9, z: 0.024, chin: 0.948 },
    square: { sx: 1.14, sy: 0.92, z: 0.023, chin: 0.98 },
    heart: { sx: 1.04, sy: 0.86, z: 0.026, chin: 0.9 },
    long: { sx: 0.94, sy: 1.06, z: 0.024, chin: 0.95 },
    round: { sx: 1.06, sy: 0.86, z: 0.025, chin: 0.92 },
  }[faceShape] || { sx: 1.0, sy: 0.9, z: 0.024, chin: 0.95 };
  piece(head, geo("jaw", () => new THREE.SphereGeometry(0.076, 16, 12)), skinMat,
    [0, -0.055, jaw.z], [0, 0, 0], [jaw.sx, jaw.sy, jaw.chin]);
  piece(head, geo("chin", () => new THREE.SphereGeometry(0.03, 10, 8)), skinMat,
    [0, -0.096, 0.071], [0, 0, 0], [1.12, 0.7, 0.7]);

  // Ears with an inner fold; a little asymmetry keeps the face human.
  [-1, 1].forEach((side) => {
    piece(head, geo("ear", () => new THREE.SphereGeometry(0.025, 10, 8)), skinMat,
      [side * 0.097, -0.002, 0.0], [0, 0, side * 0.06], [0.42, 1.18, 0.78]);
    piece(head, geo("earFold", () => new THREE.TorusGeometry(0.014, 0.0034, 4, 10, Math.PI * 1.3)), shadowSkin,
      [side * 0.101, -0.002, 0.006], [0, side * Math.PI * 0.5, 0.4], [1, 1.15, 1]);
  });

  // The chosen detail is what makes two faces with the same preset read as
  // different people: freckles, a healing scar, sun lines, an unshaven jaw.
  const detail = look.detail || "clean";
  if (detail === "freckled") {
    const freckleMat = mat(tint(skin, 0.8), { roughness: 0.7, opacity: 0.6 });
    for (let i = 0; i < 26; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const band = i % 3;
      const x = side * (0.024 + band * 0.016 + Math.random() * 0.018);
      const y = 0.004 - band * 0.016 - Math.random() * 0.02;
      piece(head, geo("freckle", () => new THREE.SphereGeometry(0.0025, 5, 4)), freckleMat,
        [x, y, 0.089 + Math.random() * 0.006], [0, 0, 0], [1, 0.7, 0.4]);
    }
  }

  const hairTone = look.hair || DEFAULT_HAIR;
  if (detail === "stubble" || detail === "beard") {
    const beard = detail === "beard";
    const facialHair = mat(tint(hairTone, 0.74), { roughness: 0.95, opacity: beard ? 0.92 : 0.4 });
    piece(head, geo("beardMask", () => new THREE.SphereGeometry(0.0782, 18, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.4)),
      facialHair, [0, -0.05, jaw.z - 0.001], [0, 0, 0],
      [jaw.sx + (beard ? 0.012 : 0.004), beard ? 1.04 : 0.95, jaw.chin]);
    piece(head, geo("moustache", () => new THREE.CapsuleGeometry(0.0068, 0.032, 3, 8)), facialHair,
      [0, -0.0585, 0.1], [0.05, 0, Math.PI / 2], [beard ? 1.25 : 0.9, 1, 0.62]);
    if (beard) {
      piece(head, geo("beardChin", () => new THREE.SphereGeometry(0.03, 10, 8)), facialHair,
        [0, -0.104, 0.074], [0, 0, 0], [1.1, 0.9, 0.8]);
      [-1, 1].forEach((side) => {
        piece(head, geo("beardJaw", () => new THREE.CapsuleGeometry(0.019, 0.055, 3, 8)), facialHair,
          [side * 0.062, -0.075, 0.063], [0.2, 0, side * 0.28], [1, 1, 0.65]);
      });
    }
  }

  if (detail === "scarred" || detail === "weathered") {
    const scarMat = mat(tint(skin, 0.7), { roughness: 0.78, opacity: 0.85 });
    piece(head, geo("scar", () => new THREE.CapsuleGeometry(0.0018, 0.032, 2, 4)), scarMat,
      [-0.055, -0.038, 0.082], [0.2, 0, 0.5], [1, 1, 0.6]);
    if (detail === "scarred") {
      // A second, older line through the brow — the kind that never quite fades.
      piece(head, geo("scarBrow", () => new THREE.CapsuleGeometry(0.0016, 0.03, 2, 4)), scarMat,
        [0.049, 0.031, 0.09], [0.1, 0, -0.9], [1, 1, 0.6]);
      piece(head, geo("scarCheek", () => new THREE.CapsuleGeometry(0.0012, 0.018, 2, 4)), scarMat,
        [0.072, -0.03, 0.072], [0.4, 0, -1.2], [1, 1, 0.5]);
    }
  }

  if (detail === "weathered") {
    const lineMat = mat(tint(skin, 0.76), { roughness: 0.85, opacity: 0.5 });
    for (let i = 0; i < 3; i += 1) {
      piece(head, geo("foreheadLine", () => new THREE.CapsuleGeometry(0.0012, 0.03, 2, 4)), lineMat,
        [0, 0.072 + i * 0.011, 0.095], [0.1, 0, Math.PI / 2], [1 - i * 0.12, 1, 0.5]);
    }
    [-1, 1].forEach((side) => {
      // Crow's feet at the outer corner of each eye.
      for (let i = 0; i < 2; i += 1) {
        piece(head, geo("crowsFoot", () => new THREE.CapsuleGeometry(0.0009, 0.013, 1, 3)), lineMat,
          [side * 0.078, 0.018 - i * 0.008, 0.072], [0.2, 0, side * (0.9 - i * 0.5)], [1, 1, 0.5]);
      }
      // Nasolabial fold from the nose wing to the mouth corner.
      piece(head, geo("nasolabial", () => new THREE.CapsuleGeometry(0.0012, 0.03, 1, 4)), lineMat,
        [side * 0.03, -0.052, 0.088], [0.2, 0, side * 0.55], [1, 1, 0.5]);
      // A tired pocket under the eye.
      piece(head, geo("eyebag", () => new THREE.SphereGeometry(0.017, 8, 6)), mat(tint(skin, 0.88), { roughness: 0.7, opacity: 0.5 }),
        [side * 0.042, -0.008, 0.081], [0.2, 0, 0], [1.15, 0.38, 0.4]);
    });
  }

  return eyes;
}

function addRealisticHair(head, hairColor, style = "short", look = {}) {
  const hairMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hairColor),
    roughness: 0.62,
    metalness: 0.02,
    sheen: 0.8,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(hairColor).offsetHSL(0, 0, 0.2),
  });
  const hairDark = mat(tint(hairColor, 0.68), { roughness: 0.8 });
  const cap = geo("hairlineCap", () => new THREE.SphereGeometry(0.1145, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.5));

  if (style === "shaved") {
    piece(head, geo("stubble", () => new THREE.SphereGeometry(0.1115, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.46)),
      mat(tint(hairColor, 0.6), { roughness: 0.95, opacity: 0.45 }), [0, 0.012, -0.004], [0, 0, 0], [1.02, 0.82, 1.03]);
    return;
  }

  piece(head, cap, hairMat, [0, 0.013, -0.006], [0.06, 0, 0], [1.02, 1.06, 1.05]);
  // Hairline: short strands along the forehead and temples.
  for (let i = 0; i < 14; i += 1) {
    const angle = -1.1 + (i / 13) * 2.2;
    piece(head, geo("hairStrand", () => new THREE.CapsuleGeometry(0.006, 0.034, 2, 5)), hairMat,
      [Math.sin(angle) * 0.098, 0.07 - Math.abs(angle) * 0.012, Math.cos(angle) * -0.01 + 0.078 * Math.cos(angle * 0.9)],
      [0.55, angle * 0.4, angle * 0.25], [1, 1, 0.7]);
  }
  [-1, 1].forEach((side) => {
    piece(head, geo("sideburn", () => new THREE.CapsuleGeometry(0.011, 0.036, 2, 6)), hairMat,
      [side * 0.096, -0.004, 0.03], [0.1, 0, side * 0.1], [1, 1, 0.6]);
  });

  if (style === "long") {
    piece(head, geo("hairBack", () => new THREE.CapsuleGeometry(0.1, 0.24, 5, 12)), hairMat,
      [0, -0.135, -0.05], [0.1, 0, 0], [1.08, 1, 0.52]);
    [-1, 1].forEach((side) => {
      piece(head, geo("hairFall", () => new THREE.CapsuleGeometry(0.032, 0.26, 4, 9)), hairMat,
        [side * 0.092, -0.12, -0.002], [0.05, 0, side * 0.08], [1, 1, 0.7]);
    });
    for (let i = 0; i < 6; i += 1) {
      piece(head, geo("hairWave", () => new THREE.CapsuleGeometry(0.017, 0.19, 3, 6)), hairMat,
        [-0.08 + i * 0.032, -0.16 - Math.random() * 0.04, -0.075], [0.15, 0, (Math.random() - 0.5) * 0.2], [1, 1, 0.55]);
    }
  } else if (style === "braid") {
    piece(head, geo("braidRoot", () => new THREE.CapsuleGeometry(0.03, 0.26, 4, 8)), hairMat,
      [0.06, -0.12, -0.075], [0.24, 0.3, 0.15]);
    for (let i = 0; i < 5; i += 1) {
      piece(head, geo("braidKnot", () => new THREE.SphereGeometry(0.028 - i * 0.003, 8, 6)), hairMat,
        [0.07 + i * 0.008, -0.2 - i * 0.045, -0.082], [0, 0, 0], [1, 1.2, 0.85]);
    }
    piece(head, geo("braidTie", () => new THREE.TorusGeometry(0.016, 0.004, 4, 10)), mat(look.accent || "#f2c97d", { roughness: 0.6 }),
      [0.105, -0.415, -0.082], [Math.PI / 2, 0, 0]);
    piece(head, geo("fringe", () => new THREE.CapsuleGeometry(0.014, 0.11, 3, 6)), hairMat,
      [-0.06, 0.05, 0.082], [0.5, 0, -0.5]);
  } else if (style === "curls") {
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2;
      const radius = 0.078 + Math.random() * 0.026;
      piece(head, geo("curl", () => new THREE.SphereGeometry(0.029, 8, 7)), hairMat,
        [Math.cos(angle) * radius, 0.045 + Math.sin(i * 1.7) * 0.06, Math.sin(angle) * radius - 0.012],
        [Math.random(), Math.random(), 0], [1, 0.95, 1]);
    }
    for (let i = 0; i < 7; i += 1) {
      piece(head, geo("curlFall", () => new THREE.SphereGeometry(0.026, 7, 6)), hairMat,
        [-0.09 + i * 0.03, -0.1 - Math.random() * 0.03, -0.06], [0, 0, 0], [1, 1.1, 0.8]);
    }
  } else {
    // Short: a textured top and a precise fade at the sides.
    for (let i = 0; i < 10; i += 1) {
      piece(head, geo("topTuft", () => new THREE.CapsuleGeometry(0.014, 0.05, 2, 6)), hairMat,
        [-0.08 + i * 0.018, 0.108, 0.02 + Math.sin(i) * 0.03], [0.2, 0, (i % 3 - 1) * 0.3], [1, 1, 0.7]);
    }
    piece(head, geo("fade", () => new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.2)), hairDark,
      [0, 0.02, -0.006], [0, 0, 0], [1.04, 1.0, 1.05]);
  }
}

function addBody(avatar, appearance, palette) {
  const { color, accent, skin, hair, cls } = appearance;
  const coat = mat(color, { roughness: 0.88 });
  const coatDark = mat(new THREE.Color(color).multiplyScalar(0.72), { roughness: 0.92 });
  const skinTone = skinMaterial(skin);
  const leather = mat("#3b2b24", { roughness: 0.9 });
  const steel = mat("#aeb6c4", { metalness: 0.65, roughness: 0.35 });

  const hips = groupAt(avatar, [0, 0.93, 0]);
  piece(hips, geo("pelvis", () => new THREE.CapsuleGeometry(0.135, 0.1, 4, 12)), coatDark, [0, 0.01, 0], [0, 0, Math.PI / 2], [1, 1, 0.82]);

  const torso = groupAt(hips, [0, 0.02, 0]);
  // A lathe profile reads as ribs, waist and shoulders rather than a barrel.
  const chestGeometry = geo("torso", () => {
    const points = [];
    const profile = [
      [0.135, 0.0], [0.145, 0.07], [0.152, 0.16], [0.168, 0.26], [0.183, 0.35],
      [0.196, 0.43], [0.183, 0.49], [0.152, 0.53], [0.09, 0.555],
    ];
    profile.forEach(([r, y]) => points.push(new THREE.Vector2(r, y)));
    return new THREE.LatheGeometry(points, 14);
  });
  const build = appearance.build || "average";
  const chestBreadth = build === "broad" ? 1.1 : build === "slight" ? 0.93 : 1;
  piece(torso, chestGeometry, coat, [0, 0, 0], [0, 0, 0], [chestBreadth, 1, build === "broad" ? 0.84 : 0.78]);
  // Collar and belt.
  piece(torso, geo("collar", () => new THREE.TorusGeometry(0.083, 0.018, 6, 16)), coatDark, [0, 0.53, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1]);
  piece(torso, geo("belt", () => new THREE.TorusGeometry(0.148, 0.017, 6, 18)), leather, [0, 0.075, 0], [Math.PI / 2, 0, 0], [1, 0.8, 1]);
  piece(torso, geo("buckle", () => new THREE.BoxGeometry(0.05, 0.035, 0.012)), steel, [0, 0.075, 0.115]);
  // A diagonal strap, the kind every traveller owns.
  piece(torso, geo("strap", () => new THREE.BoxGeometry(0.038, 0.5, 0.016)), leather, [0.03, 0.3, 0.13], [0, 0, 0.32]);
  // Class trim at the neckline.
  piece(torso, geo("trim", () => new THREE.TorusGeometry(0.1, 0.006, 5, 16, Math.PI * 1.1)), mat(accent, { emissive: accent, emissiveIntensity: 0.25, roughness: 0.6 }),
    [0, 0.45, 0.02], [Math.PI / 2, 0.25, 0], [1, 0.8, 1]);

  // Sigil on the chest, the only bright thing on most wanderers.
  piece(torso, geo("sigil", () => new THREE.OctahedronGeometry(0.026, 0)), mat(accent, { emissive: accent, emissiveIntensity: 0.9, roughness: 0.4 }),
    [0, 0.36, 0.128], [0, 0, 0], [1, 1.5, 0.6]);

  const neck = groupAt(torso, [0, 0.545, 0]);
  piece(neck, geo("neck", () => new THREE.CylinderGeometry(0.052, 0.058, 0.1, 12)), skinTone, [0, 0.04, 0]);
  [-1, 1].forEach((side) => {
    piece(neck, geo("tendon", () => new THREE.CapsuleGeometry(0.008, 0.07, 2, 5)),
      skinMaterial(tint(skin, 0.94), 0.62), [side * 0.026, 0.045, 0.036], [0.08, 0, side * 0.08]);
    piece(torso, geo("collarbone", () => new THREE.CapsuleGeometry(0.009, 0.1, 2, 6)),
      skinMaterial(tint(skin, 0.98), 0.6), [side * 0.07, 0.5, 0.075], [0.05, 0, side * 1.05]);
  });
  piece(torso, geo("sternum", () => new THREE.BoxGeometry(0.004, 0.09, 0.006)),
    skinMaterial(tint(skin, 0.9), 0.7), [0, 0.45, 0.105], [0.06, 0, 0]);

  const head = groupAt(neck, [0, 0.135, 0]);
  const faceShape = appearance.face || "oval";
  const headScale = {
    oval: [0.94, 1.12, 1.02], square: [1.02, 1.08, 1.0], heart: [0.96, 1.1, 1.0],
    long: [0.91, 1.18, 0.98], round: [1.0, 1.04, 1.04],
  }[faceShape] || [0.94, 1.12, 1.02];
  const skull = piece(head, geo("head", () => new THREE.SphereGeometry(0.104, 24, 18)), skinTone,
    [0, 0.02, 0.006], [0, 0, 0], headScale);
  // Temple planes and the back of the skull break the perfect sphere.
  [-1, 1].forEach((side) => {
    piece(head, geo("temple", () => new THREE.SphereGeometry(0.042, 10, 8)),
      skinMaterial(tint(skin, 0.97), 0.6), [side * 0.072, 0.03, 0.03], [0, 0, 0], [0.7, 1, 0.9]);
  });
  piece(head, geo("occiput", () => new THREE.SphereGeometry(0.078, 14, 10)),
    skinMaterial(tint(skin, 0.98), 0.62), [0, 0.0, -0.052], [0, 0, 0], [1.02, 1.02, 0.72]);
  const eyes = addRealisticFace(head, { ...appearance, skin, hair });
  addRealisticHair(head, hair, appearance.hairStyle || "short", { ...appearance, accent });

  // Shoulders & arms.
  const shoulderWidth = build === "broad" ? 0.196 : build === "slight" ? 0.156 : build === "tall" ? 0.178 : 0.172;
  const armGirth = build === "broad" ? 1.1 : build === "slight" ? 0.9 : 1;
  const armBones = [];
  [-1, 1].forEach((side) => {
    const shoulder = groupAt(torso, [side * shoulderWidth, 0.475, 0]);
    piece(shoulder, geo("deltoid", () => new THREE.SphereGeometry(0.062, 12, 10)), coat, [0, 0, 0], [0, 0, 0], [armGirth, 0.95, 0.95]);
    const upper = piece(shoulder, geo("upperarm", () => new THREE.CapsuleGeometry(0.043, 0.2, 4, 8)), coat, [0, -0.14, 0], [0, 0, 0], [armGirth, 1, armGirth]);
    const elbow = groupAt(shoulder, [0, -0.275, 0]);
    piece(elbow, geo("elbow", () => new THREE.SphereGeometry(0.04, 8, 6)), coatDark, [0, 0, 0]);
    piece(elbow, geo("forearm", () => new THREE.CapsuleGeometry(0.036, 0.19, 4, 8)), mat(new THREE.Color(color).multiplyScalar(0.9), { roughness: 0.9 }), [0, -0.12, 0]);
    const hand = groupAt(elbow, [0, -0.245, 0]);
    piece(hand, geo("palm", () => new THREE.BoxGeometry(0.062, 0.082, 0.032)), skinTone, [0, -0.022, 0], [0, 0, 0]);
    for (let k = 0; k < 3; k += 1) {
      piece(hand, geo("knuckle", () => new THREE.SphereGeometry(0.0105, 6, 5)), skinTone,
        [-0.019 + k * 0.019, -0.05, 0.006], [0, 0, 0], [1, 0.8, 0.7]);
    }
    for (let n = 0; n < 4; n += 1) {
      piece(hand, geo("nail", () => new THREE.BoxGeometry(0.011, 0.014, 0.004)),
        mat("#e7c2ae", { roughness: 0.35 }), [(-0.021 + n * 0.014), -0.098, 0.009], [0.1, 0, 0]);
    }
    for (let f = 0; f < 4; f += 1) {
      piece(hand, geo("finger", () => new THREE.CapsuleGeometry(0.0075, 0.042, 2, 6)), skinTone,
        [(-0.021 + f * 0.014), -0.079, 0.002], [0.08, 0, 0]);
    }
    piece(hand, geo("thumb", () => new THREE.CapsuleGeometry(0.009, 0.032, 2, 6)), skinTone,
      [side * 0.032, -0.035, 0.014], [0.2, 0, side * 0.7]);
    armBones.push({ shoulder, elbow, hand, upper, side });
  });

  // Legs.
  const legBones = [];
  const hipWidth = build === "broad" ? 0.09 : build === "slight" ? 0.07 : 0.079;
  [-1, 1].forEach((side) => {
    const hip = groupAt(hips, [side * hipWidth, -0.015, 0]);
    piece(hip, geo("thigh", () => new THREE.CapsuleGeometry(0.063, 0.3, 4, 8)), coatDark, [0, -0.19, 0]);
    const knee = groupAt(hip, [0, -0.4, 0]);
    piece(knee, geo("knee", () => new THREE.SphereGeometry(0.056, 8, 6)), coatDark, [0, 0, 0]);
    piece(knee, geo("shin", () => new THREE.CapsuleGeometry(0.048, 0.28, 4, 8)), leather, [0, -0.16, 0]);
    const foot = groupAt(knee, [0, -0.32, 0]);
    piece(foot, geo("boot", () => new THREE.BoxGeometry(0.088, 0.062, 0.21)), leather, [0, -0.018, 0.045], [0, 0, 0], [1, 1, 1]);
    piece(foot, geo("toe", () => new THREE.SphereGeometry(0.045, 10, 7)), leather, [0, -0.02, 0.145], [0, 0, 0], [1, 0.7, 0.8]);
    piece(foot, geo("sole", () => new THREE.BoxGeometry(0.092, 0.014, 0.225)), mat("#191318", { roughness: 0.92 }),
      [0, -0.049, 0.048]);
    for (let l = 0; l < 3; l += 1) {
      piece(foot, geo("lace", () => new THREE.BoxGeometry(0.05, 0.004, 0.006)), mat("#c8b38a", { roughness: 0.7 }),
        [0, 0.006 + l * 0.008, 0.086], [0.12, 0, 0]);
    }
    legBones.push({ hip, knee, foot, side });
  });

  // Class costume: keeps the silhouette recognisable at a distance.
  if (cls === "Warrior") {
    [-1, 1].forEach((side) => {
      piece(torso, geo("pauldron", () => new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)), steel,
        [side * 0.19, 0.48, 0], [0, 0, side * 0.25], [1.05, 1, 1.1]);
      piece(torso, geo("rim", () => new THREE.TorusGeometry(0.084, 0.007, 5, 12, Math.PI)), mat(accent, { emissive: accent, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.4 }),
        [side * 0.19, 0.47, 0], [Math.PI / 2, 0, side * 0.25]);
    });
  } else if (cls === "Mage") {
    const hood = piece(torso, geo("hood", () => new THREE.ConeGeometry(0.19, 0.34, 12, 1, true)), mat(new THREE.Color(color).multiplyScalar(0.85), { roughness: 0.95, side: THREE.DoubleSide }),
      [0, 0.52, -0.055], [0.28, 0, 0]);
    hood.castShadow = true;
    piece(torso, geo("sash", () => new THREE.BoxGeometry(0.07, 0.52, 0.02)), mat(accent, { emissive: accent, emissiveIntensity: 0.2, roughness: 0.8 }),
      [-0.11, 0.25, 0.12], [0, 0, -0.28]);
  } else if (cls === "Rogue") {
    piece(head, geo("mask", () => new THREE.BoxGeometry(0.155, 0.052, 0.13)), mat("#241c26", { roughness: 0.9 }), [0, -0.035, 0.045]);
    piece(torso, geo("strap2", () => new THREE.BoxGeometry(0.03, 0.42, 0.014)), leather, [-0.05, 0.3, 0.128], [0, 0, -0.35]);
  } else if (cls === "Scholar") {
    const glass = mat("#cfe4ff", { metalness: 0.4, roughness: 0.25, opacity: 0.45 });
    [-1, 1].forEach((side) => {
      piece(head, geo("lens", () => new THREE.TorusGeometry(0.026, 0.004, 5, 12)), mat("#8a6a3c", { metalness: 0.5, roughness: 0.4 }),
        [side * 0.038, 0.012, 0.104], [0, 0, 0]);
      piece(head, geo("glass", () => new THREE.CircleGeometry(0.025, 12)), glass, [side * 0.038, 0.012, 0.106]);
    });
    piece(torso, geo("satchel", () => new THREE.BoxGeometry(0.15, 0.16, 0.07)), leather, [0.15, 0.13, -0.08], [0, 0, 0.1]);
  } else if (cls === "Bard") {
    const lute = new THREE.Group();
    piece(lute, geo("luteBody", () => new THREE.SphereGeometry(0.13, 12, 10)), mat("#a9722f", { roughness: 0.7 }), [0, 0, 0], [0, 0, 0], [1, 1.25, 0.4]);
    piece(lute, geo("luteNeck", () => new THREE.BoxGeometry(0.035, 0.34, 0.028)), mat("#5f4228", { roughness: 0.8 }), [0, 0.24, 0]);
    piece(lute, geo("luteHead", () => new THREE.BoxGeometry(0.045, 0.09, 0.03)), mat("#3b2a1e", { roughness: 0.8 }), [0, 0.44, 0]);
    lute.position.set(-0.13, 0.26, -0.16);
    lute.rotation.set(0.1, 0, -0.35);
    torso.add(lute);
  } else if (cls === "Ranger") {
    const bow = groupAt(torso, [0.14, 0.3, -0.16]);
    piece(bow, geo("bow", () => new THREE.TorusGeometry(0.24, 0.012, 5, 18, Math.PI * 1.3)), mat("#6b4a2c", { roughness: 0.85 }),
      [0, 0, 0], [0, Math.PI / 2, Math.PI * 0.35]);
    piece(bow, geo("string", () => new THREE.CylinderGeometry(0.002, 0.002, 0.44, 3)), mat("#d9cfae", { roughness: 0.8 }), [0, 0, 0.001], [0, 0, 0]);
    piece(torso, geo("quiver", () => new THREE.CylinderGeometry(0.038, 0.045, 0.3, 8)), leather, [-0.12, 0.2, -0.15], [0.18, 0, 0.25]);
  }

  // Cloak: a half-cape over the back and shoulders. It stops above the hips so
  // the arms, belt and boots stay readable instead of reading as one cone.
  const cloakMat = mat(new THREE.Color(color).multiplyScalar(0.62), {
    roughness: 0.96, side: THREE.DoubleSide,
  });
  const cloak = groupAt(torso, [0, 0.47, -0.075]);
  piece(cloak, geo("cloakHalf", () => {
    const points = [];
    [[0.095, 0], [0.135, -0.12], [0.185, -0.3], [0.235, -0.47], [0.25, -0.53]]
      .forEach(([r, y]) => points.push(new THREE.Vector2(r, y)));
    return new THREE.LatheGeometry(points, 18, false, Math.PI * 0.5, Math.PI * 1.55);
  }), cloakMat, [0, 0, 0], [0, Math.PI * 0.02, 0], [1.04, 1, 0.9]);
  // Hem weight and clasp so it reads as cloth, not a shell.
  piece(cloak, geo("cloakHem", () => new THREE.TorusGeometry(0.24, 0.012, 5, 20, Math.PI * 1.5)),
    mat(new THREE.Color(color).multiplyScalar(0.5), { roughness: 0.95 }),
    [0, -0.53, 0], [Math.PI / 2, 0, Math.PI * 0.25], [1, 0.9, 1]);
  piece(cloak, geo("clasp", () => new THREE.SphereGeometry(0.018, 8, 6)),
    mat(accent, { metalness: 0.6, roughness: 0.3 }), [0, 0.02, 0.105]);

  return { hips, torso, neck, head, skull, eyes, armBones, legBones, cloak, coat, skinTone };
}

function addProps(avatar, appearance) {
  const { cls, accent } = appearance;
  const grip = new THREE.Group();
  grip.position.set(0.02, 0.02, 0);
  grip.rotation.z = -0.1;

  if (cls === "Mage") {
    const staff = new THREE.Group();
    piece(staff, geo("shaft", () => new THREE.CylinderGeometry(0.016, 0.021, 1.55, 7)), mat("#6a4a33", { roughness: 0.85 }), [0, 0.5, 0]);
    piece(staff, geo("orb", () => new THREE.IcosahedronGeometry(0.055, 1)), mat(accent, { emissive: accent, emissiveIntensity: 1.4, roughness: 0.3 }), [0, 1.3, 0]);
    piece(staff, geo("cage", () => new THREE.TorusGeometry(0.07, 0.006, 4, 10)), mat("#9a7742", { metalness: 0.6, roughness: 0.4 }), [0, 1.3, 0], [Math.PI / 2, 0, 0]);
    staff.position.set(0.05, -0.55, 0.02);
    grip.add(staff);
  } else {
    const blade = new THREE.Group();
    piece(blade, geo("edge", () => new THREE.BoxGeometry(0.042, 0.56, 0.009)), mat("#cdd6e2", { metalness: 0.8, roughness: 0.24 }), [0, 0.46, 0]);
    piece(blade, geo("tip", () => new THREE.ConeGeometry(0.03, 0.1, 4)), mat("#cdd6e2", { metalness: 0.8, roughness: 0.24 }), [0, 0.79, 0], [0, Math.PI / 4, 0], [1, 1, 0.22]);
    piece(blade, geo("guard", () => new THREE.BoxGeometry(0.15, 0.02, 0.03)), mat(accent, { metalness: 0.5, roughness: 0.4 }), [0, 0.17, 0]);
    piece(blade, geo("gripw", () => new THREE.CylinderGeometry(0.017, 0.017, 0.15, 6)), mat("#40302a", { roughness: 0.9 }), [0, 0.08, 0]);
    blade.position.set(0, 0.04, 0);
    grip.add(blade);
  }
  return grip;
}

export function buildAvatar(appearance = {}) {
  const look = {
    color: appearance.color || "#8fb8ff",
    accent: appearance.accent || "#f0abfc",
    skin: appearance.skin || DEFAULT_SKIN,
    hair: appearance.hair || DEFAULT_HAIR,
    hairStyle: appearance.hairStyle || "short",
    build: appearance.build || "average",
    eyeColor: appearance.eyeColor || "#4a2f1d",
    face: appearance.face || "oval",
    nose: appearance.nose || "straight",
    detail: appearance.detail || "clean",
    height: Number(appearance.height) || 0,
    cls: appearance.cls || "Adventurer",
    name: appearance.name || "Wanderer",
  };

  const avatar = new THREE.Group();
  avatar.name = "avatar";
  const body = addBody(avatar, look, {});

  // Build scaling: a short, slight scholar should not stand like a warrior.
  const buildScale = (look.build === "slight" ? 0.945 : look.build === "tall" ? 1.065
    : look.build === "broad" ? 1.025 : 1) * (1 + Math.max(-0.05, Math.min(0.05, Number(look.height) || 0)));
  avatar.scale.setScalar(buildScale);
  avatar.userData = {
    ...body,
    look,
    buildScale,
    phase: Math.random() * Math.PI * 2,
    breathe: Math.random() * Math.PI * 2,
    blinkAt: performance.now() + 1200 + Math.random() * 4200,
    blinkUntil: 0,
    headYaw: 0,
    headPitch: 0,
    weapon: "",
    speed: 0,
  };

  // A soft contact shadow so the feet sit on the stone even with shadows off.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.renderOrder = 1;
  avatar.add(shadow);

  // Weapon is hidden until drawn; attaches to the right hand.
  const rightHand = body.armBones[1].hand;
  const prop = addProps(avatar, look);
  const sheathed = prop;
  const drawn = prop.clone(true);
  sheathed.position.set(0.16, -0.2, -0.12);
  sheathed.rotation.set(0.2, 0, 0.9);
  drawn.position.set(0.0, -0.05, 0.06);
  drawn.rotation.set(-1.35, 0, 0);
  drawn.visible = false;
  rightHand.add(sheathed);
  rightHand.add(drawn);

  // Staffs and bows read better slung on the back than in a fist.
  if (look.cls === "Mage") {
    sheathed.visible = false;
    prop.position.set(-0.18, 0.36, -0.14);
    prop.rotation.set(0.3, 0, 1.1);
    body.torso.add(prop);
    const drawnStaff = addProps(avatar, look);
    drawnStaff.position.set(0, -0.08, 0.05);
    drawnStaff.rotation.set(-1.45, 0, 0);
    drawnStaff.visible = false;
    rightHand.add(drawnStaff);
    avatar.userData.staff = drawnStaff;
  }

  avatar.userData.sheathed = sheathed;
  avatar.userData.drawn = drawn;
  return avatar;
}

export function setAvatarWeapon(avatar, weapon) {
  const data = avatar?.userData;
  if (!data) return;
  const drawn = Boolean(weapon);
  data.weapon = weapon || "";
  if (data.drawn) data.drawn.visible = drawn;
  if (data.sheathed) data.sheathed.visible = !drawn;
  if (data.staff) data.staff.visible = drawn;
}

export function animateAvatar(avatar, state) {
  const data = avatar?.userData;
  if (!data || !data.hips) return;
  const {
    dt = 0.016, elapsed = 0, speed = 0, moving = false, running = false,
    headYaw = 0, headPitch = 0, emote = "", firstPerson = false,
  } = state;

  const stride = running ? 11.5 : 7.4;
  const targetSpeed = moving ? 1 : 0;
  data.speed += (targetSpeed - data.speed) * Math.min(1, dt * 8);
  data.phase += dt * stride * Math.max(0.35, data.speed);
  data.breathe += dt * (1.5 + Math.abs(speed) * 0.25);

  const swing = Math.sin(data.phase) * (running ? 0.72 : 0.5) * data.speed;
  const bob = Math.abs(Math.cos(data.phase)) * 0.042 * data.speed + Math.sin(data.breathe) * 0.006;
  const sway = Math.sin(data.phase) * 0.035 * data.speed;

  data.hips.position.y = 0.93 + bob;
  data.hips.rotation.z = sway;
  data.hips.rotation.y = Math.sin(data.phase) * 0.06 * data.speed;
  data.torso.rotation.x = (running ? 0.1 : 0.035) * data.speed + Math.sin(data.breathe) * 0.008;
  data.torso.rotation.y = -Math.sin(data.phase) * 0.08 * data.speed;
  data.torso.scale.set(1, 1 + Math.sin(data.breathe) * 0.006, 1);

  // Legs: hip swing, knee bend only on the back stroke, ankle roll.
  data.legBones.forEach((leg) => {
    const phase = data.phase + (leg.side > 0 ? Math.PI : 0);
    const hipSwing = Math.sin(phase) * (running ? 0.62 : 0.45) * data.speed;
    leg.hip.rotation.x = hipSwing + (moving ? 0 : Math.sin(data.breathe + leg.side) * 0.015);
    leg.knee.rotation.x = Math.max(0, -Math.sin(phase - 0.6)) * (running ? 1.15 : 0.8) * data.speed;
    leg.foot.rotation.x = -hipSwing * 0.4 + 0.05 * data.speed;
  });

  // Arms counter-swing; the weapon hand stays steadier.
  data.armBones.forEach((arm, index) => {
    const phase = data.phase + (index === 1 ? 0 : Math.PI);
    let swingArm = -Math.sin(phase) * (running ? 0.62 : 0.42) * data.speed;
    arm.shoulder.rotation.x = swingArm;
    arm.shoulder.rotation.z = arm.side * (0.06 + (arm.side > 0 && data.weapon ? 0.05 : 0));
    arm.elbow.rotation.x = -0.18 - Math.max(0, Math.sin(phase)) * 0.35 * data.speed;
    if (arm.side > 0 && data.weapon) {
      arm.shoulder.rotation.x = -0.85 + Math.sin(elapsed * 1.4) * 0.04;
      arm.elbow.rotation.x = -0.55;
    }
  });

  // Idle weight shift and a slow glance, so nobody stands like a mannequin.
  if (data.speed < 0.08) {
    data.torso.rotation.z = Math.sin(data.breathe * 0.5) * 0.012;
    data.head.rotation.y = Math.sin(elapsed * 0.33 + data.phase) * 0.14;
  } else {
    data.torso.rotation.z = 0;
  }

  // Mouse-driven head look, clamped to a human neck.
  const yaw = Math.max(-1.05, Math.min(1.05, headYaw));
  const pitch = Math.max(-0.7, Math.min(0.55, headPitch));
  data.head.rotation.y += (yaw - data.head.rotation.y) * Math.min(1, dt * 12);
  data.head.rotation.x += (pitch - data.head.rotation.x) * Math.min(1, dt * 12);
  data.neck.rotation.x = data.head.rotation.x * 0.35;

  // Cloak trails with speed; hem lifts as the body moves.
  if (data.cloak) {
    data.cloak.rotation.x = -0.04 - Math.min(0.5, Math.abs(speed) * 0.055) - Math.sin(data.phase * 2) * 0.02 * data.speed;
    data.cloak.rotation.z = Math.sin(data.phase) * 0.03 * data.speed;
  }

  // Blink.
  const now = performance.now();
  if (now > data.blinkAt) {
    data.blinkUntil = now + 110;
    data.blinkAt = now + 2200 + Math.random() * 5200;
  }
  const blinking = now < data.blinkUntil;

  const lid = blinking ? 0.12 : 1;
  data.eyes?.forEach((eye) => { eye.scale.y = lid; });

  if (emote === "wave") {
    const arm = data.armBones[1];
    arm.shoulder.rotation.z = -2.05 - Math.sin(elapsed * 9) * 0.28;
    arm.shoulder.rotation.x = -0.25;
    arm.elbow.rotation.x = -0.55;
    data.head.rotation.y = Math.sin(elapsed * 3) * 0.08;
  } else if (emote === "bow") {
    data.torso.rotation.x = 0.6;
    data.head.rotation.x = 0.32;
    data.armBones[0].shoulder.rotation.x = 0.5;
    data.armBones[1].shoulder.rotation.x = 0.5;
  } else if (emote === "dance") {
    const bounce = Math.abs(Math.sin(elapsed * 6));
    data.hips.position.y = 0.93 + bounce * 0.11;
    data.hips.rotation.z = Math.sin(elapsed * 3) * 0.12;
    data.armBones.forEach((arm, index) => {
      arm.shoulder.rotation.z = (index === 0 ? 1 : -1) * (1.2 + Math.sin(elapsed * 6 + index) * 0.5);
      arm.shoulder.rotation.x = -0.4;
    });
    data.legBones.forEach((leg, index) => {
      leg.knee.rotation.x = Math.max(0, Math.sin(elapsed * 6 + index * Math.PI)) * 0.5;
    });
  }

  // The caller hides the whole avatar in first person; nothing to do here.
  void firstPerson;
}

export function avatarLabelTexture(name, color, subtitle = "") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 512, 160);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 16;
  ctx.font = "600 50px Inter, Segoe UI, sans-serif";
  ctx.fillStyle = color || "#f2c97d";
  ctx.fillText(name, 256, 62, 460);
  if (subtitle) {
    ctx.shadowBlur = 10;
    ctx.font = "500 24px Inter, Segoe UI, sans-serif";
    ctx.fillStyle = "rgba(236,233,247,0.72)";
    ctx.fillText(subtitle.toUpperCase(), 256, 108, 420);
  }
  ctx.shadowBlur = 0;
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
