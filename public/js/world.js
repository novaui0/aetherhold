// Aetherhold — the 3D plaza where wanderers meet.

import * as THREE from "../vendor/three.module.js";
import { animateAvatar, avatarLabelTexture, buildAvatar, setAvatarWeapon } from "./character.js";
import { THEMES } from "./store.js";
import { Region, RING_RADIUS, createTruck, spinWheels } from "./region.js";
import { t } from "./i18n.js";

const PLAZA_RADIUS = 19;
const FIRE_CLEARANCE = 1.9;
const WALK_SPEED = 3.2;
const RUN_SPEED = 6.2;
const EYE_HEIGHT = 1.63;
const TAU = Math.PI * 2;

function wrapAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= TAU;
  while (value < -Math.PI) value += TAU;
  return value;
}

function makeCobbleTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3a3346";
  ctx.fillRect(0, 0, size, size);
  const rows = 9;
  const rowHeight = size / rows;
  for (let row = 0; row < rows; row += 1) {
    const offset = (row % 2) * rowHeight * 0.7;
    for (let col = -1; col < 8; col += 1) {
      const x = col * rowHeight * 1.4 + offset + Math.random() * 6;
      const y = row * rowHeight + Math.random() * 4;
      const w = rowHeight * 1.32 - 5;
      const h = rowHeight - 6;
      const shade = 66 + Math.random() * 34;
      ctx.fillStyle = `rgb(${shade + 8},${shade + 2},${shade + 16})`;
      ctx.beginPath();
      const radius = 6;
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fill();
      ctx.strokeStyle = "rgba(12,10,18,0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
      ctx.fillRect(x + 4, y + 4, w - 8, 3);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.anisotropy = 4;
  return texture;
}

function makeGrassTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#2b3b2c";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i += 1) {
    const g = 40 + Math.random() * 60;
    ctx.fillStyle = `rgba(${g * 0.5},${g},${g * 0.6},0.35)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.6, 3.2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  return texture;
}

function makeEmberTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,242,214,1)");
  gradient.addColorStop(0.4, "rgba(255,176,83,0.55)");
  gradient.addColorStop(1, "rgba(255,110,20,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export class World {
  constructor(canvas, { settings, theme = "ember", world = null, language = "en" }) {
    this.canvas = canvas;
    this.settings = { ...settings };
    this.theme = THEMES[theme] || THEMES.ember;
    this.worldData = world;
    this.language = language;
    this.running = false;
    this.inputEnabled = true;
    this.keys = new Set();
    this.yaw = Math.PI;
    this.pitch = 0.22;
    this.viewPitch = 0;
    this.distance = 4.6;
    this.firstPerson = false;
    this.locked = false;
    this.weapon = "";
    this.fearActive = false;
    this.bobPhase = 0;
    this.pointer = { dragging: false, lastX: 0, lastY: 0 };
    this.players = new Map();
    this.messages = [];
    this.selfId = null;
    this.position = new THREE.Vector3(0, 0, 5.5);
    this.facing = Math.PI;
    this.velocity = new THREE.Vector3();
    this.anim = "idle";
    this.emote = null;
    this.emoteTime = 0;
    this.onAction = null;
    this.onLockChange = null;
    this.clock = new THREE.Clock();
    this.fps = 60;
    this._frames = 0;
    this._fpsTime = 0;
    this._disposables = [];
    this._chatCooldown = 0;
    this.inVehicle = false;
    this.vehicle = {
      model: "truck", fuel: 240, tank: 240, condition: 100, capacity: 18000, cargoKg: 0,
      consumption: 28, cash: 0, node: "", odometer: 0, speed: 0, heading: 0.9, rangeKm: 0,
    };
    this.vehicleSpeed = 0;
    this.onVehicleState = null;
    this.onNotice = null;
    this.onNpc = null;
    this.onPrompt = null;
    this._hudTimer = 0;

    this._initRenderer();
    this._initScene();
    this._buildWorld();
    this.region = new Region(this.scene, { world, language });
    this.truck = this.region.truck;
    this._bindInput();
  }

  // ── setup ────────────────────────────────────────────────────────────
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.settings.quality !== "low",
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x0a0812, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = Boolean(this.settings.shadows);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // A procedural sky is baked into an equirectangular environment map. Without
  // this every metal surface reads as flat paint; with it chrome, glass and
  // wet asphalt pick up real reflections, which is most of the realism gap.
  _makeEnvironmentMap() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#141a30");
    sky.addColorStop(0.34, "#2c3a5e");
    sky.addColorStop(0.5, this.theme.fog);
    sky.addColorStop(0.62, "#4a4252");
    sky.addColorStop(1, "#17131f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Low sun, matching the directional light's side.
    const glow = ctx.createRadialGradient(150, 96, 4, 150, 96, 110);
    glow.addColorStop(0, "rgba(255,244,222,1)");
    glow.addColorStop(0.22, "rgba(255,214,158,0.6)");
    glow.addColorStop(1, "rgba(255,196,132,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(150, 96, 110, 0, Math.PI * 2);
    ctx.fill();
    // A warm bounce from the fire, opposite the sun.
    const bounce = ctx.createRadialGradient(400, 180, 10, 400, 180, 120);
    bounce.addColorStop(0, "rgba(255,168,96,0.42)");
    bounce.addColorStop(1, "rgba(255,150,80,0)");
    ctx.fillStyle = bounce;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // three r160 has no environmentIntensity, so the map carries its own
    // exposure. A light touch of darkening keeps reflections without blowing
    // out the daylight grade.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromEquirectangular(texture);
    pmrem.dispose();
    texture.dispose();
    return target.texture;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.theme.fog);
    this.scene.fog = new THREE.Fog(this.theme.fog, 40, 240);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.045, 460);
    this.camera.position.set(0, 4, 12);
    this.camera.rotation.order = "YXZ";

    // The environment map now supplies most of the fill light, so the analytic
    // lights are dialled back to keep the grade from washing out.
    this.scene.add(new THREE.HemisphereLight(0xb9c7ff, 0x1b1420, 1.2));
    this.ambient = new THREE.AmbientLight(0x6a5f92, 0.7);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffd7a8, 1.5);
    this.sun.position.set(-14, 20, 8);
    this.sun.castShadow = Boolean(this.settings.shadows);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -26;
    this.sun.shadow.camera.right = 26;
    this.sun.shadow.camera.top = 26;
    this.sun.shadow.camera.bottom = -26;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.bias = -0.0007;
    this.scene.add(this.sun);
    this.sun.target = new THREE.Object3D();
    this.scene.add(this.sun.target);

    this.fireLight = new THREE.PointLight(new THREE.Color(this.theme.fire), 40, 30, 2);
    this.fireLight.position.set(0, 1.3, 0);
    this.fireLight.castShadow = false;
    this.scene.add(this.fireLight);

    this.emberTexture = makeEmberTexture();
    this._disposables.push(this.emberTexture);

    // Real reflections for every standard material in the scene.
    this.envMap = this._makeEnvironmentMap();
    this.scene.environment = this.envMap;
    if (this.envMap) this._disposables.push(this.envMap);
  }

  _buildWorld() {
    this.plaza = new THREE.Group();
    this.scene.add(this.plaza);

    // Outer meadow.
    this.grassTexture = makeGrassTexture();
    this.cobbleTexture = makeCobbleTexture();
    this._disposables.push(this.grassTexture, this.cobbleTexture);
    const meadow = new THREE.Mesh(
      new THREE.CircleGeometry(62, 56),
      new THREE.MeshStandardMaterial({
        map: this.grassTexture,
        color: new THREE.Color(this.theme.ground).multiplyScalar(1.15),
        roughness: 1,
      })
    );
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.y = -0.06;
    meadow.receiveShadow = true;
    this.plaza.add(meadow);

    // Stone plaza, laid as individual cobbles.
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(PLAZA_RADIUS, 64),
      new THREE.MeshStandardMaterial({
        map: this.cobbleTexture,
        bumpMap: this.cobbleTexture,
        bumpScale: 0.35,
        color: new THREE.Color(this.theme.ground).offsetHSL(0, -0.05, 0.22),
        roughness: 0.95,
        metalness: 0.04,
      })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0;
    plaza.receiveShadow = true;
    this.plaza.add(plaza);

    this.inlays = [];
    [4.6, 8.4, 13.2, 17.4].forEach((radius, index) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + (index === 3 ? 0.22 : 0.09), 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(this.theme.fire), transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012 + index * 0.001;
      this.plaza.add(ring);
      this.inlays.push(ring);
    });

    // Radial tiles.
    const tileMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2436, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 40; i += 1) {
      const angle = (i / 40) * Math.PI * 2;
      const tile = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.34), tileMaterial);
      tile.position.set(Math.cos(angle) * 9, 0.03, Math.sin(angle) * 9);
      tile.rotation.y = -angle;
      tile.rotation.z = (Math.random() - 0.5) * 0.03;
      tile.receiveShadow = true;
      this.plaza.add(tile);
    }

    // Perimeter stones.
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x3d3448, roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2 + 0.12;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 + Math.random() * 0.16, 0), stoneMaterial);
      stone.position.set(Math.cos(angle) * (PLAZA_RADIUS - 0.7), 0.14, Math.sin(angle) * (PLAZA_RADIUS - 0.7));
      stone.rotation.set(Math.random(), Math.random(), Math.random());
      this.plaza.add(shadowed(stone, true, true));
    }

    this._buildFire();
    this._buildPillars();
    this._buildTrees();
    this._buildGrass();
    this._buildLanterns();
    this._buildDust();

    this.avatarRoot = new THREE.Group();
    this.scene.add(this.avatarRoot);
  }

  _buildFire() {
    const fire = new THREE.Group();
    fire.position.set(0, 0, 0);

    const coalMaterial = new THREE.MeshStandardMaterial({ color: 0x241f2b, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), coalMaterial);
      stone.position.set(Math.cos(angle) * 1.15, 0.16, Math.sin(angle) * 1.15);
      stone.rotation.set(Math.random(), Math.random(), Math.random());
      fire.add(shadowed(stone, true, true));
    }

    const logMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3126, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 5; i += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 6), logMaterial);
      log.position.y = 0.18;
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 5) * Math.PI;
      fire.add(shadowed(log, true, false));
    }

    this.flameMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.theme.fire),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flames = [];
    for (let i = 0; i < 3; i += 1) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36 - i * 0.08, 1.1 - i * 0.2, 7), this.flameMaterial.clone());
      flame.position.y = 0.62 + i * 0.04;
      flame.rotation.y = i;
      fire.add(flame);
      this.flames.push(flame);
    }

    // Ember plume above the fire.
    const count = 90;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 0.9;
      positions[i * 3 + 1] = Math.random() * 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.9;
      speeds[i] = 0.35 + Math.random() * 0.8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.fireEmbers = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.13,
        map: this.emberTexture,
        color: new THREE.Color(this.theme.fire),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.9,
      })
    );
    this.fireEmberSpeeds = speeds;
    fire.add(this.fireEmbers);

    this.scene.add(fire);
    this.fire = fire;
  }

  _buildPillars() {
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x4c4359, roughness: 0.9, flatShading: true });
    this.pillars = new THREE.Group();
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2 + 0.4;
      const height = 2.4 + Math.random() * 2.6;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, height, 8), pillarMaterial);
      pillar.position.set(Math.cos(angle) * 15.2, height / 2, Math.sin(angle) * 15.2);
      pillar.rotation.z = (Math.random() - 0.5) * 0.08;
      this.pillars.add(shadowed(pillar, true, true));

      if (Math.random() > 0.4) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.9), pillarMaterial);
        slab.position.set(pillar.position.x, height + 0.1, pillar.position.z);
        slab.rotation.y = Math.random();
        this.pillars.add(shadowed(slab, true, true));
      }
    }
    this.scene.add(this.pillars);
  }

  _buildTrees() {
    this.trees = new THREE.Group();
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 1, flatShading: true });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x27402f, roughness: 1, flatShading: true });
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const radius = 25 + Math.random() * 14;
      const height = 3 + Math.random() * 3.4;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, height * 0.55, 6), trunkMaterial);
      trunk.position.y = height * 0.275;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1 + Math.random() * 0.6, height * 0.8, 7), leafMaterial);
      crown.position.y = height * 0.62;
      tree.add(shadowed(trunk, true, true), shadowed(crown, true, true));
      tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      this.trees.add(tree);
    }
    this.scene.add(this.trees);
  }

  _buildGrass() {
    const geo = new THREE.ConeGeometry(0.035, 0.34, 4, 1, true);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.theme.ground).offsetHSL(0.02, 0.08, 0.02),
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const count = 320;
    const tufts = new THREE.InstancedMesh(geo, material, count);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const radius = PLAZA_RADIUS + 0.6 + Math.random() * 26;
      position.set(Math.cos(angle) * radius, 0.15 * Math.random(), Math.sin(angle) * radius);
      quaternion.setFromEuler(new THREE.Euler(
        (Math.random() - 0.5) * 0.25, Math.random() * TAU, (Math.random() - 0.5) * 0.25
      ));
      const size = 0.6 + Math.random() * 1.2;
      scale.set(size, size * (0.8 + Math.random() * 0.7), size);
      matrix.compose(position, quaternion, scale);
      tufts.setMatrixAt(i, matrix);
    }
    tufts.instanceMatrix.needsUpdate = true;
    tufts.receiveShadow = true;
    this.plaza.add(tufts);
  }

  _buildLanterns() {
    this.lanternLights = [];
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x2f2938, roughness: 0.8, metalness: 0.3 });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.theme.fire) });
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(angle) * 12.5;
      const z = Math.sin(angle) * 12.5;
      const group = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), postMaterial);
      post.position.y = 1.3;
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), glowMaterial);
      cage.position.y = 2.75;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 6), postMaterial);
      cap.position.y = 3.05;
      group.add(post, cage, cap);
      group.position.set(x, 0, z);
      this.scene.add(group);
      const light = new THREE.PointLight(new THREE.Color(this.theme.fire), 9, 14, 2);
      light.position.set(x, 2.75, z);
      this.scene.add(light);
      this.lanternLights.push(light);
    }
  }

  _buildDust() {
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 46;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 46;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.05,
        color: 0xffe4b0,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scene.add(this.dust);
  }

  // ── theme ────────────────────────────────────────────────────────────
  setTheme(themeKey) {
    const theme = THEMES[themeKey] || THEMES.ember;
    this.theme = theme;
    this.scene.background.set(theme.fog);
    this.scene.fog.color.set(theme.fog);
    this.fireLight.color.set(theme.fire);
    this.lanternLights.forEach((light) => light.color.set(theme.fire));
    this.flames.forEach((flame) => flame.material.color.set(theme.fire));
    this.fireEmbers.material.color.set(theme.fire);
    this.inlays.forEach((ring) => ring.material.color.set(theme.fire));
    this.flameMaterial.color.set(theme.fire);
  }

  setSettings(settings) {
    this.settings = { ...settings };
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    // The cinematic grades lift exposure and pull the fog back, which is what
    // makes the ultra presets read as film rather than flat daylight.
    const grade = this.settings.quality === "cinematic" ? 1.26
      : this.settings.quality === "ultra" ? 1.2 : 1.12;
    this.renderer.toneMappingExposure = grade;
    if (this.scene.fog) {
      this.scene.fog.near = this.settings.quality === "cinematic" ? 55 : 40;
      this.scene.fog.far = this.settings.quality === "cinematic" ? 320 : 240;
    }
    this.renderer.shadowMap.enabled = Boolean(settings.shadows);
    this.sun.castShadow = Boolean(settings.shadows);
    // Cinematic/ultra want a crisp, high-resolution shadow cascade. The map is
    // rebuilt here because three.js keeps the old render target alive.
    const shadowSize = this.settings.quality === "cinematic" || this.settings.quality === "ultra"
      ? 2048 : this.settings.quality === "high" ? 1536 : 1024;
    if (this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    const reach = this.settings.quality === "cinematic" ? 46 : 34;
    this.sun.shadow.camera.left = -reach;
    this.sun.shadow.camera.right = reach;
    this.sun.shadow.camera.top = reach;
    this.sun.shadow.camera.bottom = -reach;
    this.sun.shadow.camera.far = reach * 3;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      // Remember what could cast before the toggle, so turning shadows back on works.
      if (object.userData.baseCast === undefined) object.userData.baseCast = object.castShadow;
      object.castShadow = Boolean(settings.shadows) && object.userData.baseCast;
    });
    this.players.forEach((record) => {
      if (record.label) record.label.visible = Boolean(settings.nameplates);
    });
  }

  // ── avatars ──────────────────────────────────────────────────────────
  setCharacter(character) {
    this.character = character;
    if (this.selfId && this.players.has(this.selfId)) {
      const record = this.players.get(this.selfId);
      this._replaceAvatar(record, character);
    }
  }

  _replaceAvatar(record, appearance) {
    // Avatar geometries and materials are shared from a cache, so they are
    // never disposed here — only the group is swapped.
    this.avatarRoot.remove(record.group);
    const group = buildAvatar(appearance);
    group.position.copy(record.group.position);
    group.rotation.y = record.group.rotation.y;
    this.avatarRoot.add(group);
    record.group = group;
    record.target = group.position.clone();
    if (record.label) {
      this.avatarRoot.remove(record.label);
      record.label.material.map?.dispose();
      record.label.material.dispose();
      const label = this._makeLabel(appearance.name, appearance.color, appearance.cls);
      label.position.set(group.position.x, group.position.y + 2.05, group.position.z);
      this.avatarRoot.add(label);
      record.label = label;
    }
  }

  _makeLabel(name, color, subtitle) {
    const texture = avatarLabelTexture(name, color, subtitle);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.2, 0.55, 1);
    sprite.renderOrder = 10;
    sprite.userData.texture = texture;
    return sprite;
  }

  setSelf(playerId) {
    this.selfId = playerId;
    if (playerId && this.players.has(playerId)) {
      const record = this.players.get(playerId);
      if (record.label) record.label.visible = false;
    }
  }

  applyPlayers(list) {
    const seen = new Set();
    for (const player of list) {
      seen.add(player.id);
      let record = this.players.get(player.id);
      // Cosmetics travel inside the sheet; without this flattening every other
      // driver rendered with the default face and skin.
      const appearance = player.sheet ? { ...player, ...player.sheet } : player;
      const cosmeticKey = JSON.stringify([
        appearance.skin, appearance.hair, appearance.hairStyle, appearance.build,
        appearance.eyeColor, appearance.face, appearance.nose, appearance.detail,
        appearance.color, appearance.accent, appearance.cls,
      ]);
      if (!record) {
        const group = buildAvatar(appearance);
        group.position.set(player.pos[0], player.pos[1], player.pos[2]);
        group.rotation.y = player.rot;
        this.avatarRoot.add(group);

        const label = this._makeLabel(player.name, player.color, player.cls);
        label.position.set(player.pos[0], player.pos[1] + 2.05, player.pos[2]);
        label.visible = this.settings.nameplates;
        this.avatarRoot.add(label);

        record = {
          id: player.id,
          data: player,
          cosmeticKey,
          group,
          label,
          target: new THREE.Vector3(player.pos[0], player.pos[1], player.pos[2]),
          targetRot: player.rot,
          bubble: null,
          bubbleUntil: 0,
          emoteUntil: 0,
          emote: "",
          jumping: 0,
        };
        this.players.set(player.id, record);
        if (player.id === this.selfId) label.visible = false;
      } else {
        record.data = { ...record.data, ...player };
        record.target.set(player.pos[0], player.pos[1], player.pos[2]);
        record.targetRot = player.rot;
        record.group.visible = true;
        if (record.cosmeticKey !== cosmeticKey) {
          record.cosmeticKey = cosmeticKey;
          this._replaceAvatar(record, appearance);
        }
      }
      if (record.label) record.label.visible = this.settings.nameplates && player.id !== this.selfId;
    }

    for (const [id, record] of [...this.players.entries()]) {
      if (seen.has(id)) continue;
      this._removeRecord(record);
      this.players.delete(id);
    }
  }

  _removeRecord(record) {
    this.avatarRoot.remove(record.group);
    if (record.label) {
      this.avatarRoot.remove(record.label);
      record.label.material.map?.dispose();
      record.label.material.dispose();
    }
    if (record.bubble) {
      this.avatarRoot.remove(record.bubble);
      record.bubble.material.map?.dispose();
      record.bubble.material.dispose();
    }
  }

  _showBubble(record, text) {
    if (!record) return;
    if (record.bubble) {
      this.avatarRoot.remove(record.bubble);
      record.bubble.material.map?.dispose();
      record.bubble.material.dispose();
      record.bubble = null;
    }
    const trimmed = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const font = "500 30px Inter, Segoe UI, sans-serif";
    ctx.font = font;
    const width = Math.min(560, Math.max(120, ctx.measureText(trimmed).width + 44));
    canvas.width = width;
    canvas.height = 88;
    const c2 = canvas.getContext("2d");
    c2.font = font;
    c2.fillStyle = "rgba(10,10,20,0.82)";
    c2.strokeStyle = "rgba(242,201,125,0.4)";
    c2.lineWidth = 2;
    const radius = 18;
    c2.beginPath();
    c2.moveTo(radius, 6);
    c2.lineTo(width - radius, 6);
    c2.quadraticCurveTo(width - 6, 6, width - 6, 6 + radius);
    c2.lineTo(width - 6, 60 - radius);
    c2.quadraticCurveTo(width - 6, 60, width - radius, 60);
    c2.lineTo(width / 2 + 12, 60);
    c2.lineTo(width / 2, 72);
    c2.lineTo(width / 2 - 12, 60);
    c2.lineTo(radius, 60);
    c2.quadraticCurveTo(6, 60, 6, 60 - radius);
    c2.lineTo(6, 6 + radius);
    c2.quadraticCurveTo(6, 6, radius, 6);
    c2.closePath();
    c2.fill();
    c2.stroke();
    c2.fillStyle = "#f4efe2";
    c2.textAlign = "center";
    c2.textBaseline = "middle";
    c2.fillText(trimmed, width / 2, 34, width - 28);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    const scale = 0.0052;
    sprite.scale.set(width * scale, 88 * scale, 1);
    sprite.position.copy(record.group.position).add(new THREE.Vector3(0, 2.5, 0));
    sprite.renderOrder = 12;
    this.avatarRoot.add(sprite);
    record.bubble = sprite;
    record.bubbleUntil = performance.now() + Math.min(9000, 3800 + text.length * 45);
  }

  pushMessage(message) {
    this.messages.push(message);
    const record = message.from ? this.players.get(message.from) : null;
    const bubbleKinds = ["chat", "emote", "try", "fear", "threat"];
    if (record && bubbleKinds.includes(message.kind)) {
      const prefix = message.kind === "emote" ? "* " : "";
      this._showBubble(record, `${prefix}${message.text}`);
    }
    if (message.kind === "emote" || message.kind === "roll") {
      this.emotePulse = performance.now();
      if (record) {
        record.emote = message.kind === "roll" ? "dance" : "wave";
        record.emoteUntil = performance.now() + 2400;
      }
    }
  }

  emoteLocal(kind) {
    this.emote = kind;
    this.emoteTime = 2.2;
  }

  // ── vehicle ──────────────────────────────────────────────────────────
  nearTruck(distance = 4.5) {
    if (!this.truck) return false;
    return Math.hypot(this.position.x - this.truck.position.x, this.position.z - this.truck.position.z) < distance;
  }

  enterVehicle() {
    if (!this.truck || !this.nearTruck() || this.inVehicle) return false;
    this.inVehicle = true;
    this.firstPerson = false;
    this.position.set(this.truck.position.x, 0, this.truck.position.z);
    this.facing = this.vehicle.heading;
    this.yaw = this.vehicle.heading + Math.PI;
    this.vehicleSpeed = this.vehicle.speed = 0;
    if (this.onViewChange) this.onViewChange(false);
    if (this.onNotice) this.onNotice(t("vehicle.enter"), "good");
    return true;
  }

  exitVehicle() {
    if (!this.inVehicle) return false;
    this.inVehicle = false;
    const heading = this.vehicle.heading;
    const side = heading + Math.PI / 2;
    this.position.set(
      this.truck.position.x + Math.sin(side) * 3.1,
      0,
      this.truck.position.z + Math.cos(side) * 3.1
    );
    this.vehicle.speed = 0;
    this.vehicleSpeed = 0;
    this.facing = heading;
    if (this.onNotice) this.onNotice(t("vehicle.exit"), "");
    if (this.onVehicleExit) this.onVehicleExit(this.fleetSnapshot());
    return true;
  }

  toggleVehicle() {
    return this.inVehicle ? this.exitVehicle() : this.enterVehicle();
  }

  interact() {
    if (this.inVehicle) return this.exitVehicle();
    if (this.nearTruck()) return this.enterVehicle();
    const npc = this.region?.nearestNpc(this.position.x, this.position.z);
    if (npc && this.onNpc) {
      this.onNpc({
        name: npc.preset.name,
        role: npc.roleKey,
        site: npc.site,
        title: t(`npc.${npc.roleKey}`),
      });
      return true;
    }
    const site = this.region?.nearestSite(this.position.x, this.position.z, 22);
    if (site) {
      if (this.onNotice) this.onNotice(`${t(`site.${site.kind}`)} — ${site.services.join(", ")}`, "");
      return true;
    }
    return false;
  }

  setWorld(worldData) {
    this.worldData = worldData;
    if (worldData?.climate) this.climate = worldData.climate;
  }

  applyFleet(fleet) {
    if (!fleet) return;
    const vehicle = this.vehicle;
    vehicle.model = fleet.model || vehicle.model;
    vehicle.fuel = Number(fleet.fuel ?? vehicle.fuel);
    vehicle.tank = Number(fleet.tank ?? vehicle.tank);
    vehicle.condition = Number(fleet.condition ?? vehicle.condition);
    vehicle.capacity = Number(fleet.capacity ?? vehicle.capacity);
    vehicle.cargoKg = Number(fleet.cargoKg ?? vehicle.cargoKg);
    vehicle.consumption = Number(fleet.consumption ?? vehicle.consumption);
    vehicle.cash = Number(fleet.cash ?? vehicle.cash);
    vehicle.node = fleet.node || vehicle.node;
    vehicle.odometer = Number(fleet.odometer ?? vehicle.odometer);
    vehicle.rangeKm = Number(fleet.rangeKm ?? vehicle.rangeKm);
    vehicle.rescues = Number(fleet.rescues ?? vehicle.rescues ?? 0);
    this.emitVehicleState();
  }

  fleetSnapshot() {
    const vehicle = this.vehicle;
    return {
      pos: [Number(this.truck.position.x.toFixed(2)), 0, Number(this.truck.position.z.toFixed(2))],
      heading: Number(vehicle.heading.toFixed(3)),
      fuel: Number(Math.max(0, vehicle.fuel).toFixed(2)),
      condition: Number(vehicle.condition.toFixed(2)),
      odometer: Number(vehicle.odometer.toFixed(2)),
      node: vehicle.node,
      inVehicle: this.inVehicle,
      speed: Number((vehicle.speed * 3.6).toFixed(1)),
      cargoKg: vehicle.cargoKg,
      capacity: vehicle.capacity,
      cash: vehicle.cash,
      model: vehicle.model,
      rangeKm: vehicle.rangeKm,
      tank: vehicle.tank,
      consumption: vehicle.consumption,
    };
  }

  emitVehicleState() {
    if (this.onVehicleState) this.onVehicleState(this.fleetSnapshot());
  }

  _driveVehicle(dt) {
    const vehicle = this.vehicle;
    const climateKey = this.region?.climateAt(this.truck.position.x, this.truck.position.z) || "temperate";
    const climate = this.worldData?.climate?.[climateKey] || { power: 1, grip: 1, fuel: 1 };
    const conditionFactor = 0.55 + 0.45 * Math.max(0, Math.min(1, vehicle.condition / 100));
    const maxSpeed = 27 * conditionFactor * (climate.power || 1);
    const throttle = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0)
      - (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
    const steer = (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0)
      - (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0);
    const handbrake = this.keys.has(" ");
    const hasFuel = vehicle.fuel > 0.001;

    if (hasFuel && throttle !== 0) {
      vehicle.speed += throttle * 7.4 * conditionFactor * (climate.power || 1) * dt;
    }
    if (handbrake) vehicle.speed *= Math.max(0, 1 - dt * 4.2);
    const drag = 0.55 + Math.abs(vehicle.speed) * 0.025;
    vehicle.speed *= Math.max(0, 1 - drag * dt);
    vehicle.speed = Math.max(-maxSpeed * 0.32, Math.min(maxSpeed, vehicle.speed));
    if (!hasFuel) vehicle.speed *= Math.max(0, 1 - dt * 3);

    if (Math.abs(vehicle.speed) > 0.05) {
      const steerFactor = Math.min(1, Math.abs(vehicle.speed) / (maxSpeed * 0.55));
      vehicle.heading += steer * 1.15 * (climate.grip || 1) * steerFactor * dt * Math.sign(vehicle.speed);
    }
    vehicle.heading %= Math.PI * 2;

    const forwardX = Math.sin(vehicle.heading);
    const forwardZ = Math.cos(vehicle.heading);
    const distance = Math.abs(vehicle.speed) * dt;
    const nextX = this.truck.position.x + forwardX * vehicle.speed * dt;
    const nextZ = this.truck.position.z + forwardZ * vehicle.speed * dt;
    const blocked = this.region?.isBlocked(nextX, nextZ) || this.region?.isBlocked(
      nextX + forwardX * 2.6, nextZ + forwardZ * 2.6);
    if (blocked) {
      vehicle.speed = -vehicle.speed * 0.18;
      const now = performance.now();
      if (now - (this._lastBlockNotice || 0) > 2600) {
        this._lastBlockNotice = now;
        const message = blocked === "water" ? "River — cross at the bridge"
          : blocked === "rock" ? "Canyon wall — use the tunnel road"
          : "Something solid ahead";
        if (this.onNotice) this.onNotice(message, "bad");
      }
    } else {
      this.truck.position.x = nextX;
      this.truck.position.z = nextZ;
      const limit = Math.hypot(this.truck.position.x, this.truck.position.z);
      if (limit > 212) {
        const scale = 212 / limit;
        this.truck.position.x *= scale;
        this.truck.position.z *= scale;
        vehicle.speed *= 0.4;
      }
    }
    this.truck.rotation.y = vehicle.heading;
    spinWheels(this.truck, vehicle.speed * dt);

    if (distance > 0) {
      const km = distance * 0.02;
      const load = Math.min(1.6, vehicle.cargoKg / Math.max(1, vehicle.capacity));
      const burn = km * vehicle.consumption / 100 * (1 + 0.35 * load)
        * (climate.fuel || 1) * (1 + Math.max(0, 100 - vehicle.condition) * 0.004);
      vehicle.fuel = Math.max(0, vehicle.fuel - burn);
      vehicle.odometer += km;
      vehicle.condition = Math.max(0, vehicle.condition - km * 0.012);
      if (vehicle.fuel <= 0.001 && vehicle.speed > 0.4 && !this._strandedNotified) {
        this._strandedNotified = true;
        if (this.onNotice) this.onNotice(t("vehicle.stranded"), "bad");
      }
    }
    if (vehicle.fuel > 0.05) this._strandedNotified = false;

    this.position.set(this.truck.position.x, 0, this.truck.position.z);
    this.facing = vehicle.heading;
    this.vehicleSpeed = Math.abs(vehicle.speed) * 3.6;
  }

  _updateVehicleCamera(dt, elapsed) {
    const vehicle = this.vehicle;
    const forwardX = Math.sin(vehicle.heading);
    const forwardZ = Math.cos(vehicle.heading);
    const offset = Math.max(-1.5, Math.min(1.5, wrapAngle((this.yaw - Math.PI) - vehicle.heading)));
    const angle = vehicle.heading + offset;
    const distance = 12.5 + Math.min(4, Math.abs(vehicle.speed) * 0.12);
    const targetX = this.truck.position.x - Math.sin(angle) * distance;
    const targetZ = this.truck.position.z - Math.cos(angle) * distance;
    const targetY = 5.2 + Math.max(0, Math.min(2.4, this.pitch - 0.22) * -2.2);
    const ease = Math.min(1, dt * 5.2);
    this.camera.position.x += (targetX - this.camera.position.x) * ease;
    this.camera.position.y += (targetY - this.camera.position.y) * ease;
    this.camera.position.z += (targetZ - this.camera.position.z) * ease;
    if (this.settings.shake && Math.abs(vehicle.speed) > 4) {
      const rumble = Math.min(0.03, Math.abs(vehicle.speed) * 0.0012);
      this.camera.position.y += Math.sin(elapsed * 31) * rumble;
    }
    this.camera.lookAt(
      this.truck.position.x + forwardX * 5.5,
      2.4,
      this.truck.position.z + forwardZ * 5.5
    );
    const targetFov = Math.min(84, (this.settings.fov || 62) + Math.min(10, Math.abs(vehicle.speed) * 0.32));
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  _resolveCollision(previousX, previousZ, isVehicle) {
    const blocked = this.region?.isBlocked(this.position.x, this.position.z);
    if (!blocked) return;
    this.position.x = previousX;
    this.position.z = previousZ;
    if (isVehicle) this.vehicle.speed = 0;
    else this.velocity.set(0, 0, 0);
  }

  localState() {
    return {
      pos: [Number(this.position.x.toFixed(3)), 0, Number(this.position.z.toFixed(3))],
      rot: Number(this.facing.toFixed(3)),
      look: Number(wrapAngle(this.yaw + Math.PI).toFixed(3)),
      pitch: Number((this.firstPerson ? this.viewPitch : (this.pitch - 0.22) * 1.2).toFixed(3)),
      anim: this.anim,
    };
  }

  // ── input ────────────────────────────────────────────────────────────
  _bindInput() {
    this._onKeyDown = (event) => {
      if (!this.inputEnabled) return;
      const tag = (event.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        event.preventDefault();
        this.keys.add(key);
      }
      if (key === "shift") this.keys.add("shift");
      if (key === " " || key === "spacebar") { event.preventDefault(); this.keys.add(" "); }
      if (key === "e") { event.preventDefault(); this.interact(); }
      if (key === "v") { event.preventDefault(); this.toggleView(); }
      if (key === "r") { event.preventDefault(); this.toggleWeapon(); }
    };
    this._onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      if (key === "shift") this.keys.delete("shift");
    };
    this._onBlur = () => {
      this.keys.clear();
      this.pointer.dragging = false;
    };

    this._onPointerDown = (event) => {
      if (event.button !== 0 || !this.inputEnabled) return;
      if (this.locked) return;
      this.pointer.dragging = true;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      this.requestLook();
      try {
        this.canvas.setPointerCapture?.(event.pointerId);
      } catch {
        /* synthetic or already-released pointer — drag-look still works */
      }
    };
    this._onPointerMove = (event) => {
      const sens = this.settings.sensitivity / 100;
      if (this.locked) {
        this.yaw -= event.movementX * 0.0022 * sens;
        const dy = event.movementY * 0.0022 * sens;
        if (this.firstPerson) {
          this.viewPitch = Math.max(-1.1, Math.min(1.1, this.viewPitch + dy));
        } else {
          this.pitch = Math.max(-0.18, Math.min(0.95, this.pitch + dy * 1.7));
        }
        return;
      }
      if (!this.pointer.dragging) return;
      const dx = event.clientX - this.pointer.lastX;
      const dy = event.clientY - this.pointer.lastY;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      this.yaw -= dx * 0.0055 * sens;
      if (this.firstPerson) {
        this.viewPitch = Math.max(-1.1, Math.min(1.1, this.viewPitch + dy * 0.004 * sens));
      } else {
        this.pitch = Math.max(-0.18, Math.min(0.95, this.pitch + dy * 0.004 * sens));
      }
    };
    this._onPointerUp = () => { this.pointer.dragging = false; };
    this._onWheel = (event) => {
      if (this.firstPerson) return;
      event.preventDefault();
      this.distance = Math.max(2.2, Math.min(10, this.distance + Math.sign(event.deltaY) * 0.4));
    };
    this._onPointerLockChange = () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked === this.locked) return;
      this.locked = locked;
      if (!locked) this.keys.clear();
      if (this.onLockChange) this.onLockChange(locked);
    };
    this._onPointerLockError = () => {
      this.locked = false;
    };

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    this.canvas.addEventListener("wheel", this._onWheel, { passive: false });
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    document.addEventListener("pointerlockerror", this._onPointerLockError);
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  requestLook() {
    if (!this.inputEnabled || this.locked) return;
    try {
      // Chrome returns a promise, older browsers return undefined. Either way a
      // refusal must fall back to drag-look instead of surfacing as an error.
      const result = this.canvas.requestPointerLock?.();
      if (result && typeof result.catch === "function") result.catch(() => { /* drag-look fallback */ });
    } catch {
      /* drag-look fallback */
    }
  }

  releaseLook() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  toggleWeapon() {
    this.weapon = this.weapon ? "" : "blade";
    if (this.onAction) this.onAction(this.weapon ? "draw" : "sheathe");
    return this.weapon;
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.viewPitch = 0;
    this.pitch = 0.22;
    this.distance = this.firstPerson ? 0 : 4.6;
    if (this.onViewChange) this.onViewChange(this.firstPerson);
  }

  setFear(active) {
    this.fearActive = Boolean(active);
  }

  setInputEnabled(enabled) {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.releaseLook();
    }
  }

  // ── loop ─────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      this._update(dt, this.clock.elapsedTime);
      this.renderer.render(this.scene, this.camera);
      this._frames += 1;
      this._fpsTime += dt;
      if (this._fpsTime >= 0.5) {
        this.fps = Math.round(this._frames / this._fpsTime);
        this._frames = 0;
        this._fpsTime = 0;
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _update(dt, elapsed) {
    let running = false;
    if (this.inVehicle) {
      this._driveVehicle(dt);
      this.anim = "idle";
      this.velocity.set(0, 0, 0);
      running = false;
    } else {
      // Movement.
      const forwardInput = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) - (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
      const strafeInput = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) - (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
      running = this.keys.has("shift");
      const speed = running ? RUN_SPEED : WALK_SPEED;

      const forwardX = -Math.sin(this.yaw);
      const forwardZ = -Math.cos(this.yaw);
      const rightX = -forwardZ;
      const rightZ = forwardX;
      let moveX = forwardX * forwardInput + rightX * strafeInput;
      let moveZ = forwardZ * forwardInput + rightZ * strafeInput;
      const length = Math.hypot(moveX, moveZ);
      if (length > 0.001) {
        moveX /= length;
        moveZ /= length;
        this.velocity.x += (moveX * speed - this.velocity.x) * Math.min(1, dt * 9);
        this.velocity.z += (moveZ * speed - this.velocity.z) * Math.min(1, dt * 9);
        // In first person the body follows the eyes; in third person it turns to the walk.
        this.facing = this.firstPerson ? wrapAngle(this.yaw + Math.PI) : Math.atan2(moveX, moveZ);
        this.anim = running ? "run" : "walk";
      } else {
        this.velocity.x *= Math.max(0, 1 - dt * 12);
        this.velocity.z *= Math.max(0, 1 - dt * 12);
        this.anim = "idle";
        if (this.firstPerson) this.facing = wrapAngle(this.yaw + Math.PI);
      }

      const previousX = this.position.x;
      const previousZ = this.position.z;
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;

      const radius = Math.hypot(this.position.x, this.position.z);
      if (radius > 214) {
        const scale = 214 / radius;
        this.position.x *= scale;
        this.position.z *= scale;
      }
      if (radius < FIRE_CLEARANCE) {
        const scale = FIRE_CLEARANCE / Math.max(0.0001, radius);
        this.position.x *= scale;
        this.position.z *= scale;
      }
      this._resolveCollision(previousX, previousZ, false);
    }

    // Keep the shadow cascade over whoever we are looking at, so the truck and
    // the garages cast real shadows instead of only the plaza at the origin.
    const focus = this.inVehicle && this.truck ? this.truck.position : this.position;
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.set(focus.x - 22, 38, focus.z + 16);
    this.sun.target.updateMatrixWorld();
    if (this.region) this.region.update(dt, elapsed);

    if (this.emoteTime > 0) this.emoteTime = Math.max(0, this.emoteTime - dt);

    const speedNow = Math.hypot(this.velocity.x, this.velocity.z);
    this.bobPhase += dt * (running ? 11.5 : 7.6) * (speedNow > 0.25 ? 1 : 0);
    this._updateCamera(dt, elapsed, speedNow, running);

    // Fire.
    const flicker = 0.82 + Math.sin(elapsed * 9.3) * 0.09 + Math.sin(elapsed * 23.7) * 0.05;
    this.fireLight.intensity = 38 * flicker;
    this.flames.forEach((flame, index) => {
      const wobble = 1 + Math.sin(elapsed * (7 + index * 2) + index) * 0.09;
      flame.scale.set(wobble, 1 + Math.sin(elapsed * (5 + index) + index * 2) * 0.15, wobble);
      flame.rotation.y += dt * (0.6 + index * 0.4);
      flame.material.opacity = 0.55 + Math.sin(elapsed * (6 + index)) * 0.16;
    });
    this.lanternLights.forEach((light, index) => {
      light.intensity = 8.5 + Math.sin(elapsed * (3 + index) + index * 1.7) * 1.4;
    });

    const emberPositions = this.fireEmbers.geometry.attributes.position.array;
    for (let i = 0; i < this.fireEmberSpeeds.length; i += 1) {
      emberPositions[i * 3 + 1] += dt * this.fireEmberSpeeds[i];
      emberPositions[i * 3] += Math.sin(elapsed * 2 + i) * dt * 0.16;
      if (emberPositions[i * 3 + 1] > 3.4) {
        emberPositions[i * 3 + 1] = 0.2;
        emberPositions[i * 3] = (Math.random() - 0.5) * 0.8;
        emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
      }
    }
    this.fireEmbers.geometry.attributes.position.needsUpdate = true;

    this.dust.rotation.y += dt * 0.012;

    this._animateAvatars(dt, elapsed);

    this._hudTimer += dt;
    if (this._hudTimer >= 0.2) {
      this._hudTimer = 0;
      this.emitVehicleState();
    }
  }

  _updateCamera(dt, elapsed, speed, running) {
    if (this.inVehicle) {
      this._updateVehicleCamera(dt, elapsed);
      return;
    }
    const focusY = 1.28;
    if (this.firstPerson) {
      const bob = Math.sin(this.bobPhase) * (running ? 0.032 : 0.02) * Math.min(1, speed / 3.2);
      const sway = Math.cos(this.bobPhase * 0.5) * (running ? 0.014 : 0.008) * Math.min(1, speed / 3.2);
      const cp = Math.cos(this.viewPitch);
      const dirX = -Math.sin(this.yaw) * cp;
      const dirZ = -Math.cos(this.yaw) * cp;
      const dirY = -Math.sin(this.viewPitch);
      const fearShake = this.fearActive && this.settings.shake ? 0.008 : 0;
      const shakeX = Math.sin(elapsed * 27.3) * fearShake;
      const shakeY = Math.cos(elapsed * 31.1) * fearShake;
      const eyeY = EYE_HEIGHT + bob + shakeY;
      this.camera.position.set(this.position.x + sway + shakeX, eyeY, this.position.z);
      this.camera.lookAt(this.position.x + sway + shakeX + dirX, eyeY + dirY, this.position.z + dirZ);
      this.camera.rotation.z = Math.sin(this.bobPhase * 0.5) * 0.006 * Math.min(1, speed / 4);
      const targetFov = this.settings.fov + (running ? 4 : 0);
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
      return;
    }

    const cosPitch = Math.cos(this.pitch);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const shoulder = 0.6;
    // The camera is over the right shoulder, so the avatar never hides the scene.
    const targetX = this.position.x + Math.sin(this.yaw) * cosPitch * this.distance + rightX * shoulder;
    const targetZ = this.position.z + Math.cos(this.yaw) * cosPitch * this.distance + rightZ * shoulder;
    const targetY = Math.max(0.45, focusY + 0.42 + Math.sin(this.pitch) * this.distance);
    const ease = Math.min(1, dt * 8.5);
    const fearShake = this.fearActive && this.settings.shake ? 0.012 : 0;
    this.camera.position.x += (targetX - this.camera.position.x) * ease;
    this.camera.position.y += (targetY - this.camera.position.y) * ease;
    this.camera.position.z += (targetZ - this.camera.position.z) * ease;
    if (this.emoteTime > 0 && this.settings.shake) {
      this.camera.position.y += Math.sin(elapsed * 24) * 0.008;
    }
    if (fearShake) {
      this.camera.position.x += Math.sin(elapsed * 27) * fearShake;
      this.camera.position.y += Math.cos(elapsed * 29) * fearShake;
    }
    this.camera.lookAt(
      this.position.x + rightX * 0.16,
      focusY,
      this.position.z + rightZ * 0.16
    );
    const targetFov = this.settings.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
    }
  }

  _animateAvatars(dt, elapsed) {
    const now = performance.now();
    const viewYaw = wrapAngle(this.yaw + Math.PI);
    for (const record of this.players.values()) {
      const group = record.group;
      const isSelf = record.id === this.selfId;
      const target = isSelf ? this.position : record.target;
      const targetRot = isSelf ? this.facing : record.targetRot;

      const lerpFactor = isSelf ? 1 : Math.min(1, dt * 9);
      group.position.x += (target.x - group.position.x) * lerpFactor;
      group.position.z += (target.z - group.position.z) * lerpFactor;
      group.position.y += ((target.y || 0) - group.position.y) * lerpFactor;

      const delta = wrapAngle(targetRot - group.rotation.y);
      group.rotation.y += delta * Math.min(1, dt * (isSelf ? 14 : 9));

      const anim = isSelf ? this.anim : (record.data.anim || "idle");
      const moving = anim !== "idle";
      const running = anim === "run";
      const emoteKind = isSelf
        ? (this.emoteTime > 0 ? this.emote : "")
        : (now < record.emoteUntil ? record.emote : "");

      let headYaw = 0;
      let headPitch = 0;
      if (isSelf) {
        headYaw = this.firstPerson ? 0 : wrapAngle(viewYaw - group.rotation.y);
        headPitch = this.firstPerson ? 0 : (this.pitch - 0.22) * 1.4;
      } else {
        const look = typeof record.data.look === "number" ? record.data.look : record.data.rot;
        headYaw = wrapAngle(look - group.rotation.y);
        headPitch = Math.max(-0.7, Math.min(0.55, -(record.data.pitch || 0)));
      }

      if (isSelf && this.inVehicle) {
        group.position.set(this.truck.position.x, 0, this.truck.position.z);
        group.rotation.y = this.vehicle.heading;
        group.visible = false;
        if (record.label) record.label.visible = false;
        continue;
      }

      animateAvatar(group, {
        dt,
        elapsed,
        speed: moving ? (running ? 1 : 0.62) : 0,
        moving,
        running,
        headYaw,
        headPitch,
        emote: emoteKind,
        firstPerson: isSelf && this.firstPerson,
      });
      setAvatarWeapon(group, isSelf ? this.weapon : (record.data.weapon || ""));
      group.visible = !(isSelf && this.firstPerson);

      if (record.label) {
        record.label.visible = this.settings.nameplates && !isSelf;
        record.label.position.set(group.position.x, group.position.y + 2.02, group.position.z);
      }
      if (record.bubble) {
        record.bubble.position.set(group.position.x, group.position.y + 2.42, group.position.z);
        record.bubble.visible = !(isSelf && this.firstPerson);
        if (now > record.bubbleUntil) {
          this.avatarRoot.remove(record.bubble);
          record.bubble.material.map?.dispose();
          record.bubble.material.dispose();
          record.bubble = null;
        }
      }
    }
  }

  resize(width, height) {
    const scale = Math.max(0.5, Math.min(1.6, this.settings.scale / 100));
    const maxRatio = this.settings.quality === "cinematic" ? 2.5
      : this.settings.quality === "ultra" ? 2.25
      : this.settings.quality === "high" ? 2 : 1.5;
    // Render scale multiplies the device ratio but never past the preset's
    // ceiling — 150% on a 2.5 ratio would allocate a 9000px buffer and kill
    // the GPU context (the tab simply vanished before this clamp).
    const ratio = Math.min((window.devicePixelRatio || 1) * scale, maxRatio);
    this.renderer.setPixelRatio(Math.max(0.6, ratio));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("wheel", this._onWheel);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    document.removeEventListener("pointerlockerror", this._onPointerLockError);
    this.releaseLook();
    this.players.forEach((record) => this._removeRecord(record));
    this.players.clear();
    this._disposables.forEach((item) => item?.dispose?.());
    this.renderer.dispose();
  }
}
