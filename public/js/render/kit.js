// Aetherhold — procedural modelling kit.
//
// Everything in the city is built from a handful of real modelling primitives
// instead of axis-aligned boxes: rounded/cambered solids, lathed profiles,
// swept tubes and extruded silhouettes. Normals are rebuilt with crease
// detection so curved surfaces shade smoothly while panel edges stay sharp —
// that single change is what stops the world reading as a pile of cubes.

import * as THREE from "../../vendor/three.module.js";

const TAU = Math.PI * 2;

// ── normals ─────────────────────────────────────────────────────────────
// Position-keyed crease smoothing: corners that share a position are averaged
// only across faces whose normals sit inside `creaseAngle`, so a bevelled edge
// fades smoothly but a 90° wall joint keeps a crisp line.
export function creasedNormals(geometry, creaseAngle = Math.PI / 4.4) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.attributes.position;
  const uv = source.attributes.uv;
  const count = position.count;
  const triCount = Math.floor(count / 3);
  const cosLimit = Math.cos(creaseAngle);

  const faces = new Float32Array(triCount * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let t = 0; t < triCount; t += 1) {
    a.fromBufferAttribute(position, t * 3);
    b.fromBufferAttribute(position, t * 3 + 1);
    c.fromBufferAttribute(position, t * 3 + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ab.cross(ac);
    if (ab.lengthSq() < 1e-12) ab.set(0, 1, 0);
    ab.normalize();
    faces[t * 3] = ab.x;
    faces[t * 3 + 1] = ab.y;
    faces[t * 3 + 2] = ab.z;
  }

  const buckets = new Map();
  const keyAt = (index) => {
    const x = Math.round(position.getX(index) * 8192);
    const y = Math.round(position.getY(index) * 8192);
    const z = Math.round(position.getZ(index) * 8192);
    return `${x}|${y}|${z}`;
  };
  for (let i = 0; i < count; i += 1) {
    const key = keyAt(i);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(Math.floor(i / 3));
  }

  const outPosition = new Float32Array(count * 3);
  const outNormal = new Float32Array(count * 3);
  const outUv = uv ? new Float32Array(count * 2) : null;
  const normal = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const key = keyAt(i);
    const bucket = buckets.get(key);
    const face = Math.floor(i / 3);
    const fx = faces[face * 3];
    const fy = faces[face * 3 + 1];
    const fz = faces[face * 3 + 2];
    normal.set(0, 0, 0);
    for (let k = 0; k < bucket.length; k += 1) {
      const other = bucket[k];
      const nx = faces[other * 3];
      const ny = faces[other * 3 + 1];
      const nz = faces[other * 3 + 2];
      if (nx * fx + ny * fy + nz * fz < cosLimit) continue;
      normal.x += nx;
      normal.y += ny;
      normal.z += nz;
    }
    if (normal.lengthSq() < 1e-10) normal.set(fx, fy, fz);
    normal.normalize();
    outPosition[i * 3] = position.getX(i);
    outPosition[i * 3 + 1] = position.getY(i);
    outPosition[i * 3 + 2] = position.getZ(i);
    outNormal[i * 3] = normal.x;
    outNormal[i * 3 + 1] = normal.y;
    outNormal[i * 3 + 2] = normal.z;
    if (outUv) {
      outUv[i * 2] = uv.getX(i);
      outUv[i * 2 + 1] = uv.getY(i);
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.BufferAttribute(outPosition, 3));
  result.setAttribute("normal", new THREE.BufferAttribute(outNormal, 3));
  if (outUv) result.setAttribute("uv", new THREE.BufferAttribute(outUv, 2));
  result.computeBoundingSphere();
  result.computeBoundingBox();
  source.dispose();
  if (source !== geometry) geometry.dispose();
  return result;
}

// Project UVs from the dominant axis of every triangle. Keeps tiled concrete
// and brick at a constant real-world size no matter how the solid was swept.
export function planarUV(geometry, scale = 1) {
  const position = geometry.attributes.position;
  const count = position.count;
  const uvs = new Float32Array(count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < count; t += 3) {
    a.fromBufferAttribute(position, t);
    b.fromBufferAttribute(position, t + 1);
    c.fromBufferAttribute(position, t + 2);
    const n = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    const absX = Math.abs(n.x);
    const absY = Math.abs(n.y);
    const absZ = Math.abs(n.z);
    for (let k = 0; k < 3; k += 1) {
      const px = position.getX(t + k);
      const py = position.getY(t + k);
      const pz = position.getZ(t + k);
      let u;
      let v;
      if (absY >= absX && absY >= absZ) {
        u = px;
        v = pz;
      } else if (absX >= absZ) {
        u = pz;
        v = py;
      } else {
        u = px;
        v = py;
      }
      uvs[(t + k) * 2] = u * scale;
      uvs[(t + k) * 2 + 1] = v * scale;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

// ── primitives ──────────────────────────────────────────────────────────
export function roundedRectShape(width, height, radius) {
  const w = width;
  const h = height;
  const r = Math.max(0.0005, Math.min(radius, Math.min(w, h) / 2 - 0.0005));
  const x = -w / 2;
  const y = -h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

// A solid with rounded vertical corners and a camber on the top and bottom
// faces. `width`/`depth` are the footprint, `height` the extrusion.
const boxCache = new Map();

export function roundedBox(width, height, depth, radius = 0.06, options = {}) {
  // Identical solids are everywhere in a city (slabs, rails, sills). Cache the
  // built geometry so a thousand rails cost one crease pass, not a thousand.
  const cacheKey = width + "|" + height + "|" + depth + "|" + radius + "|"
    + (options.bevel ?? "") + "|" + (options.bevelSegments ?? "") + "|"
    + (options.curveSegments ?? "") + "|" + (options.uvScale ?? "");
  const cached = boxCache.get(cacheKey);
  if (cached) return cached;
  const bevel = Math.min(options.bevel ?? 0.02, Math.min(width, height, depth) / 4);
  const shapeHeight = Math.max(0.01, depth - 2 * bevel);
  const shapeWidth = Math.max(0.01, width - 2 * bevel);
  const shape = roundedRectShape(shapeWidth, shapeHeight, Math.max(0.001, radius - bevel));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, height - 2 * bevel),
    bevelEnabled: bevel > 0.0005,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: options.bevelSegments ?? 2,
    curveSegments: options.curveSegments ?? 3,
    steps: 1,
  });
  geometry.translate(0, 0, -(height - 2 * bevel) / 2);
  geometry.rotateX(-Math.PI / 2);
  const box = geometry.boundingBox || (geometry.computeBoundingBox(), geometry.boundingBox);
  const centerY = (box.min.y + box.max.y) / 2;
  geometry.translate(0, -centerY, 0);
  const result = creasedNormals(geometry, options.crease ?? Math.PI / 4.2);
  planarUV(result, options.uvScale ?? 1);
  // Cached solids outlive one district: never let a merge pass free them.
  result.userData.cached = true;
  boxCache.set(cacheKey, result);
  return result;
}

// Revolve a 2D profile [[radius, y], …] around Y. Profiles should start and end
// on the axis to close the caps.
export function lathe(profile, segments = 28, options = {}) {
  const points = profile.map(([radius, y]) => new THREE.Vector2(Math.max(0, radius), y));
  const geometry = new THREE.LatheGeometry(points, segments, options.phiStart ?? 0, options.phiLength ?? TAU);
  const result = creasedNormals(geometry, options.crease ?? Math.PI / 3.2);
  if (options.uvScale) planarUV(result, options.uvScale);
  return result;
}

// Lathed cylinder with rounded rims — bolts, lamp posts, bins, hydrants.
export function turnedCylinder(radiusTop, radiusBottom, height, options = {}) {
  const chamfer = Math.min(options.chamfer ?? 0.03, height / 6, Math.min(radiusTop, radiusBottom) / 2);
  const profile = [
    [0, -height / 2],
    [Math.max(0.001, radiusBottom - chamfer), -height / 2],
    [radiusBottom, -height / 2 + chamfer],
    [radiusBottom, height / 2 - chamfer],
    [Math.max(0.001, radiusTop - chamfer), height / 2],
    [radiusTop, height / 2 - chamfer],
    [radiusTop, height / 2],
    [0, height / 2],
  ];
  return lathe(profile, options.segments ?? 24, { crease: options.crease ?? Math.PI / 5 });
}

// Sweep a tube along a smooth curve: lamp arms, railings, cables.
export function tube(points, radius, options = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geometry = new THREE.TubeGeometry(
    curve,
    options.segments ?? Math.max(12, points.length * 6),
    radius,
    options.radial ?? 7,
    false
  );
  return creasedNormals(geometry, Math.PI / 3);
}

// Extrude a 2D silhouette along Z (then centre it). Used for car bodies where
// a box can never look like a car.
export function extrudeProfile(points, depth, options = {}) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const bevel = options.bevel ?? 0.02;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: options.bevelSegments ?? 2,
    curveSegments: options.curveSegments ?? 4,
    steps: 1,
  });
  geometry.translate(0, 0, -(depth - 2 * bevel) / 2);
  const result = creasedNormals(geometry, options.crease ?? Math.PI / 4.2);
  if (options.uvScale) planarUV(result, options.uvScale);
  return result;
}

// Thin plate used for glass, signs and painted markings.
export function plate(width, height, options = {}) {
  const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
  if (options.doubleSided === false) return geometry;
  return geometry;
}

export function disposeObject(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    const material = object.material;
    if (Array.isArray(material)) material.forEach((entry) => entry?.dispose?.());
    else material?.dispose?.();
  });
}

// ── procedural textures ─────────────────────────────────────────────────
function canvas(size, draw) {
  const element = document.createElement("canvas");
  element.width = size;
  element.height = size;
  const ctx = element.getContext("2d");
  draw(ctx, size);
  return element;
}

function finish(element, { repeat = [1, 1], srgb = true, anisotropy = 8 } = {}) {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function grain(ctx, size, amount, alpha) {
  for (let i = 0; i < amount; i += 1) {
    const shade = Math.random() * 255;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    const s = Math.random() * 2.2 + 0.4;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

export function asphaltTexture() {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = "#3a3a40";
    ctx.fillRect(0, 0, size, size);
    // Aggregate: dense, small, varied grey stones.
    for (let i = 0; i < 9000; i += 1) {
      const shade = 44 + Math.random() * 62;
      ctx.fillStyle = `rgba(${shade},${shade + 1},${shade + 3},${0.35 + Math.random() * 0.4})`;
      const s = Math.random() * 2.6 + 0.5;
      ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
    // Tar seams and repairs.
    ctx.strokeStyle = "rgba(10,10,12,0.75)";
    for (let i = 0; i < 5; i += 1) {
      ctx.lineWidth = 1.2 + Math.random() * 2.4;
      ctx.beginPath();
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.moveTo(x, y);
      for (let s = 0; s < 7; s += 1) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // A faint worn patch in the wheel tracks.
    const wear = ctx.createLinearGradient(0, 0, size, size);
    wear.addColorStop(0, "rgba(120,118,124,0.05)");
    wear.addColorStop(0.5, "rgba(160,158,164,0.09)");
    wear.addColorStop(1, "rgba(120,118,124,0.05)");
    ctx.fillStyle = wear;
    ctx.fillRect(0, 0, size, size);
  });
  return finish(element, { repeat: [1, 1] });
}

export function sidewalkTexture() {
  const element = canvas(512, (ctx, size) => {
    const cells = 4;
    const step = size / cells;
    for (let row = 0; row < cells; row += 1) {
      for (let col = 0; col < cells; col += 1) {
        const shade = 116 + Math.random() * 26;
        ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 9})`;
        ctx.fillRect(col * step + 1.5, row * step + 1.5, step - 3, step - 3);
        // Speckled aggregate inside each slab.
        for (let i = 0; i < 220; i += 1) {
          const g = 96 + Math.random() * 70;
          ctx.fillStyle = `rgba(${g},${g},${g + 4},${0.16 + Math.random() * 0.22})`;
          ctx.fillRect(col * step + Math.random() * step, row * step + Math.random() * step, 1.6, 1.6);
        }
        ctx.strokeStyle = "rgba(58,56,54,0.55)";
        ctx.lineWidth = 2.4;
        ctx.strokeRect(col * step + 1.2, row * step + 1.2, step - 2.4, step - 2.4);
      }
    }
    grain(ctx, size, 2600, 0.06);
  });
  return finish(element, { repeat: [1, 1] });
}

export function concreteTexture(base = "#8d8b86") {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5200; i += 1) {
      const shade = 90 + Math.random() * 90;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.05 + Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 5, Math.random() * 5);
    }
    grain(ctx, size, 3200, 0.05);
  });
  return finish(element, { repeat: [1, 1] });
}

export function plasterTexture(base = "#b9b2a4") {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 3400; i += 1) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 8 + 1, Math.random() * 8 + 1);
    }
    for (let i = 0; i < 1600; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 6 + 1, Math.random() * 6 + 1);
    }
  });
  return finish(element, { repeat: [1, 1] });
}

export function brickTexture() {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = "#3c2f2b";
    ctx.fillRect(0, 0, size, size);
    const rows = 16;
    const rowHeight = size / rows;
    for (let row = 0; row < rows; row += 1) {
      const offset = (row % 2) * rowHeight * 1.1;
      for (let col = -1; col < 9; col += 1) {
        const w = rowHeight * 2.2;
        const x = col * w + offset;
        const y = row * rowHeight;
        const shade = 96 + Math.random() * 44;
        ctx.fillStyle = `rgb(${shade + 18},${shade - 10},${shade - 22})`;
        ctx.fillRect(x + 2, y + 2, w - 4, rowHeight - 4);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x + 3, y + 3, w - 6, 2);
      }
    }
    grain(ctx, size, 1800, 0.05);
  });
  return finish(element, { repeat: [1, 1] });
}

export function woodTexture(base = "#7a5232") {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 180; i += 1) {
      const y = Math.random() * size;
      ctx.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.12})`;
      ctx.lineWidth = 0.6 + Math.random() * 2.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < size; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
      ctx.stroke();
    }
    for (let i = 0; i < 22; i += 1) {
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, 6 + Math.random() * 8, 3 + Math.random() * 4, 0, 0, TAU);
      ctx.stroke();
    }
  });
  return finish(element, { repeat: [1, 1] });
}

export function gravelTexture() {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = "#2d2c2a";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 11000; i += 1) {
      const shade = 60 + Math.random() * 80;
      ctx.fillStyle = `rgba(${shade},${shade - 2},${shade - 6},${0.4 + Math.random() * 0.5})`;
      const s = Math.random() * 3.4 + 0.4;
      ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
  });
  return finish(element, { repeat: [1, 1] });
}

export function grassTexture() {
  const element = canvas(512, (ctx, size) => {
    ctx.fillStyle = "#2c3a24";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14000; i += 1) {
      const g = 54 + Math.random() * 70;
      ctx.strokeStyle = `rgba(${g * 0.55},${g},${g * 0.45},${0.3 + Math.random() * 0.5})`;
      ctx.lineWidth = 1 + Math.random();
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 5);
      ctx.stroke();
    }
  });
  return finish(element, { repeat: [1, 1] });
}

// A whole faceted facade (mullions + lit offices) painted once and tiled on
// distant towers — the cheap half of the skyline.
export function facadeTexture(options = {}) {
  const tint = options.tint || "#5c6472";
  const lit = options.lit ?? 0.35;
  const element = canvas(256, (ctx, size) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, size, size);
    const cols = 6;
    const rows = 8;
    const cw = size / cols;
    const ch = size / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = col * cw;
        const y = row * ch;
        ctx.fillStyle = "rgba(18,22,30,0.92)";
        ctx.fillRect(x + 3, y + 3, cw - 6, ch - 6);
        if (Math.random() < lit) {
          const warm = Math.random() < 0.7;
          ctx.fillStyle = warm ? "rgba(255,214,150,0.55)" : "rgba(150,200,255,0.4)";
          ctx.fillRect(x + 4.5, y + 4.5, cw - 9, ch - 9);
        } else {
          const sheen = ctx.createLinearGradient(x, y, x + cw, y + ch);
          sheen.addColorStop(0, "rgba(140,170,205,0.24)");
          sheen.addColorStop(0.5, "rgba(60,80,105,0.1)");
          sheen.addColorStop(1, "rgba(150,185,220,0.18)");
          ctx.fillStyle = sheen;
          ctx.fillRect(x + 4.5, y + 4.5, cw - 9, ch - 9);
        }
      }
    }
    // Slab lines.
    ctx.fillStyle = "rgba(210,205,195,0.5)";
    for (let row = 0; row <= rows; row += 1) ctx.fillRect(0, row * ch - 1.5, size, 3);
  });
  return finish(element, { repeat: [1, 1] });
}

// Signage: emissive canvas text, no external font files.
export function signTexture(lines, options = {}) {
  const element = document.createElement("canvas");
  element.width = 512;
  element.height = 128;
  const ctx = element.getContext("2d");
  const bg = options.background || "#101018";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 122);
  }
  const list = Array.isArray(lines) ? lines : [lines];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  list.forEach((line, index) => {
    const size = index === 0 ? 62 : 30;
    ctx.font = `${index === 0 ? 700 : 500} ${size}px Inter, Arial, sans-serif`;
    ctx.fillStyle = options.color || "#ffe9b8";
    ctx.shadowColor = options.glow || "rgba(255,190,90,0.85)";
    ctx.shadowBlur = index === 0 ? 18 : 8;
    ctx.fillText(line, 256, list.length === 1 ? 66 : 46 + index * 52);
  });
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// ── materials ───────────────────────────────────────────────────────────
export function createMaterials() {
  const materials = {};
  const registry = [];
  const keep = (material) => {
    // Session-shared materials: a district must never dispose one of these on
    // leave, or the next district renders vehicles and props without textures.
    material.userData.shared = true;
    registry.push(material);
    return material;
  };

  const asphaltMap = asphaltTexture();
  asphaltMap.repeat.set(0.14, 0.14);
  materials.asphalt = keep(new THREE.MeshStandardMaterial({
    map: asphaltMap, color: 0xffffff, roughness: 0.86, metalness: 0.04,
  }));

  const sidewalkMap = sidewalkTexture();
  sidewalkMap.repeat.set(0.42, 0.42);
  materials.sidewalk = keep(new THREE.MeshStandardMaterial({
    map: sidewalkMap, color: 0xa8a49c, roughness: 0.9, metalness: 0.03,
  }));

  const concreteMap = concreteTexture();
  materials.concrete = keep(new THREE.MeshStandardMaterial({
    map: concreteMap, color: 0xb2ada2, roughness: 0.92, metalness: 0.02,
  }));

  const plasterMap = plasterTexture();
  materials.plaster = keep(new THREE.MeshStandardMaterial({
    map: plasterMap, color: 0xc9c2b2, roughness: 0.88, metalness: 0.02,
  }));

  const brickMap = brickTexture();
  brickMap.repeat.set(0.7, 0.7);
  materials.brick = keep(new THREE.MeshStandardMaterial({
    map: brickMap, color: 0xb08a72, roughness: 0.94, metalness: 0.02,
  }));

  const gravelMap = gravelTexture();
  gravelMap.repeat.set(0.5, 0.5);
  materials.roof = keep(new THREE.MeshStandardMaterial({
    map: gravelMap, color: 0x8b8884, roughness: 0.97, metalness: 0.02,
  }));

  const grassMap = grassTexture();
  grassMap.repeat.set(0.35, 0.35);
  materials.grass = keep(new THREE.MeshStandardMaterial({
    map: grassMap, color: 0x9fae86, roughness: 1, metalness: 0,
  }));

  materials.stone = keep(new THREE.MeshStandardMaterial({
    color: 0x8d8578, roughness: 0.86, metalness: 0.04,
  }));
  materials.trim = keep(new THREE.MeshStandardMaterial({
    color: 0xcfc7b6, roughness: 0.7, metalness: 0.05,
  }));
  materials.darkTrim = keep(new THREE.MeshStandardMaterial({
    color: 0x2a2c31, roughness: 0.55, metalness: 0.45,
  }));
  materials.steel = keep(new THREE.MeshStandardMaterial({
    color: 0x9aa3ad, roughness: 0.35, metalness: 0.95,
  }));
  materials.chrome = keep(new THREE.MeshStandardMaterial({
    color: 0xf2f6fa, roughness: 0.06, metalness: 1,
  }));
  materials.brushed = keep(new THREE.MeshStandardMaterial({
    color: 0x8e949c, roughness: 0.48, metalness: 0.9,
  }));
  materials.iron = keep(new THREE.MeshStandardMaterial({
    color: 0x2c2e33, roughness: 0.72, metalness: 0.55,
  }));
  materials.rubber = keep(new THREE.MeshStandardMaterial({
    color: 0x121214, roughness: 0.95, metalness: 0.02,
  }));

  // Window glass: near-mirror, so the environment map does the work.
  materials.glass = keep(new THREE.MeshPhysicalMaterial({
    color: 0x0d1520, roughness: 0.05, metalness: 0.85,
    envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.04,
  }));
  materials.glassLight = keep(new THREE.MeshPhysicalMaterial({
    color: 0x2b3a44, roughness: 0.1, metalness: 0.7,
    envMapIntensity: 1.3, transparent: true, opacity: 0.72,
  }));
  materials.storeGlass = keep(new THREE.MeshPhysicalMaterial({
    color: 0x9fb6c6, roughness: 0.06, metalness: 0.35,
    transparent: true, opacity: 0.34, envMapIntensity: 1.6,
    clearcoat: 1, clearcoatRoughness: 0.05,
  }));
  materials.windowLit = keep(new THREE.MeshStandardMaterial({
    color: 0xffd7a3, emissive: 0xffb970, emissiveIntensity: 1.15,
    roughness: 0.35, metalness: 0.1,
  }));
  materials.windowCool = keep(new THREE.MeshStandardMaterial({
    color: 0xcfe6ff, emissive: 0x9dc4ff, emissiveIntensity: 0.8,
    roughness: 0.3, metalness: 0.1,
  }));

  materials.wood = keep(new THREE.MeshStandardMaterial({
    map: woodTexture(), color: 0xb08a62, roughness: 0.62, metalness: 0.04,
  }));
  materials.woodDark = keep(new THREE.MeshStandardMaterial({
    map: woodTexture("#4b3320"), color: 0x8a6a4c, roughness: 0.6, metalness: 0.04,
  }));
  materials.fabric = keep(new THREE.MeshStandardMaterial({
    color: 0x5b5f6b, roughness: 0.95, metalness: 0,
  }));
  materials.leather = keep(new THREE.MeshStandardMaterial({
    color: 0x2f2a28, roughness: 0.55, metalness: 0.05,
  }));
  materials.rug = keep(new THREE.MeshStandardMaterial({
    color: 0x6d4b45, roughness: 1, metalness: 0,
  }));

  materials.paintWhite = keep(new THREE.MeshStandardMaterial({
    color: 0xf2f0e6, roughness: 0.55, metalness: 0.05,
  }));
  materials.paintYellow = keep(new THREE.MeshStandardMaterial({
    color: 0xe8c15a, roughness: 0.5, metalness: 0.05,
    emissive: 0x3a2a08, emissiveIntensity: 0.4,
  }));
  materials.paintRed = keep(new THREE.MeshStandardMaterial({
    color: 0xb63a2c, roughness: 0.45, metalness: 0.15,
  }));

  // Light sources rendered as emissive geometry rather than lights.
  materials.lampWarm = keep(new THREE.MeshStandardMaterial({
    color: 0xfff3d6, emissive: 0xffcb86, emissiveIntensity: 3.4, roughness: 0.4,
  }));
  materials.lampCool = keep(new THREE.MeshStandardMaterial({
    color: 0xeaf4ff, emissive: 0xbcd8ff, emissiveIntensity: 2.6, roughness: 0.4,
  }));
  materials.neonPink = keep(new THREE.MeshStandardMaterial({
    color: 0xff8ac4, emissive: 0xff3d8b, emissiveIntensity: 3.2, roughness: 0.4,
  }));
  materials.neonBlue = keep(new THREE.MeshStandardMaterial({
    color: 0x8ecbff, emissive: 0x3f8dff, emissiveIntensity: 3.0, roughness: 0.4,
  }));
  materials.tailLight = keep(new THREE.MeshStandardMaterial({
    color: 0xff4530, emissive: 0xff2410, emissiveIntensity: 1.6, roughness: 0.35,
  }));
  materials.headLight = keep(new THREE.MeshStandardMaterial({
    color: 0xfff6dc, emissive: 0xfff0c4, emissiveIntensity: 2.2, roughness: 0.2,
    metalness: 0.3,
  }));

  materials.foliage = keep(new THREE.MeshStandardMaterial({
    color: 0x3d5c33, roughness: 0.95, metalness: 0, flatShading: false,
  }));
  materials.foliageDark = keep(new THREE.MeshStandardMaterial({
    color: 0x27401f, roughness: 1, metalness: 0,
  }));
  materials.bark = keep(new THREE.MeshStandardMaterial({
    color: 0x4a3a2c, roughness: 0.98, metalness: 0,
  }));
  materials.terracotta = keep(new THREE.MeshStandardMaterial({
    color: 0x9c5a3c, roughness: 0.85, metalness: 0.02,
  }));
  materials.water = keep(new THREE.MeshPhysicalMaterial({
    color: 0x2b4b5a, roughness: 0.06, metalness: 0.4,
    transparent: true, opacity: 0.82, envMapIntensity: 1.8,
  }));

  const paintCache = new Map();
  materials.carPaint = (color) => {
    if (paintCache.has(color)) return paintCache.get(color);
    const material = keep(new THREE.MeshPhysicalMaterial({
      color, roughness: 0.24, metalness: 0.62,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5,
    }));
    paintCache.set(color, material);
    return material;
  };

  materials.disposeAll = () => {
    registry.forEach((material) => {
      material.map?.dispose?.();
      material.dispose?.();
    });
    registry.length = 0;
  };
  return materials;
}

// Bake a static group down to one mesh per material. A district built from
// real solids costs hundreds of draw calls; merged, it costs one per material,
// which leaves the frame budget for post-processing instead of the submit
// queue. Two passes with pre-allocated typed arrays keep the bake fast enough
// to run during scene construction.
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);

  // Pass 1: collect meshes and count vertices per material.
  const groups = new Map();
  const meshes = [];
  let totalTris = 0;
  root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh) return;
    if (object.userData.noMerge) return;
    if (Array.isArray(object.material)) return;
    const geometry = object.geometry;
    const position = geometry?.attributes?.position;
    if (!position) return;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const count = geometry.index ? geometry.index.count : position.count;
    if (!count) return;
    meshes.push({ object, count });
    totalTris += count;
    let group = groups.get(object.material);
    if (!group) {
      group = { count: 0, cast: false, receive: false, order: 0 };
      groups.set(object.material, group);
    }
    group.count += count;
    group.cast = group.cast || object.castShadow;
    group.receive = group.receive || object.receiveShadow;
    group.order = object.order || group.order;
  });
  if (!meshes.length) return root;

  // Pass 2: allocate once per material and write transformed vertices.
  const buffers = new Map();
  for (const [material, group] of groups) {
    buffers.set(material, {
      group,
      position: new Float32Array(group.count * 3),
      normal: new Float32Array(group.count * 3),
      uv: new Float32Array(group.count * 2),
      offset: 0,
    });
  }

  const vector = new THREE.Vector3();
  const normalVector = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  for (const { object, count } of meshes) {
    const geometry = object.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const index = geometry.index;
    const target = buffers.get(object.material);
    normalMatrix.getNormalMatrix(object.matrixWorld);
    let write = target.offset;

    for (let i = 0; i < count; i += 1) {
      const vi = index ? index.getX(i) : i;
      vector.fromBufferAttribute(position, vi).applyMatrix4(object.matrixWorld);
      normalVector.fromBufferAttribute(normal, vi).applyNormalMatrix(normalMatrix).normalize();
      target.position[write * 3] = vector.x;
      target.position[write * 3 + 1] = vector.y;
      target.position[write * 3 + 2] = vector.z;
      target.normal[write * 3] = normalVector.x;
      target.normal[write * 3 + 1] = normalVector.y;
      target.normal[write * 3 + 2] = normalVector.z;
      target.uv[write * 2] = uv ? uv.getX(vi) : 0;
      target.uv[write * 2 + 1] = uv ? uv.getY(vi) : 0;
      write += 1;
    }
    target.offset = write;
    object.parent?.remove(object);
    // Cached kit geometries are reused by the next district in this session.
    if (!geometry.userData?.cached) geometry.dispose();
  }

  for (const [material, buffer] of buffers) {
    if (!buffer.group.count) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(buffer.position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(buffer.normal, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(buffer.uv, 2));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = buffer.group.cast;
    mesh.receiveShadow = buffer.group.receive;
    mesh.renderOrder = buffer.group.order;
    root.add(mesh);
  }
  return root;
}

// One material set per session: textures are expensive to regenerate and the
// whole city shares the same concrete, glass and paint.
let materialSingleton = null;
export function kitMaterials() {
  if (!materialSingleton) materialSingleton = createMaterials();
  return materialSingleton;
}

// Disposal is a page-lifetime event, never a district one. Districts come and
// go with every room you join; the concrete, chrome and car paint do not.
export function resetKitMaterials() {
  if (!materialSingleton) return;
  materialSingleton.disposeAll();
  materialSingleton = null;
  boxCache.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => resetKitMaterials());
}

// ── helpers ─────────────────────────────────────────────────────────────
export function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function soften(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// Cheap contact shadow: a soft radial decal that grounds an object without
// costing a shadow-map texel.
let blobTexture = null;
export function contactShadow(parent, radius = 1, opacity = 0.36, y = 0.012) {
  if (!blobTexture) {
    const element = canvas(128, (ctx, size) => {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, "rgba(0,0,0,0.85)");
      gradient.addColorStop(0.45, "rgba(0,0,0,0.4)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    });
    blobTexture = new THREE.CanvasTexture(element);
  }
  const material = new THREE.MeshBasicMaterial({
    map: blobTexture, transparent: true, opacity, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}
