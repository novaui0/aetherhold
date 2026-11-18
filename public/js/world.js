// Aetherhold — the city district, its renderer and the player controller.

import * as THREE from "../vendor/three.module.js";
import { animateAvatar, avatarLabelTexture, buildAvatar, setAvatarWeapon } from "./character.js";
import { THEMES } from "./store.js";
import { City } from "./city.js";
import { spinWheels } from "./vehicles.js";
import { PostFX } from "./render/postfx.js";
import { GtaHud } from "./gtaHud.js";
import { kitMaterials } from "./render/kit.js";
import { t } from "./i18n.js";

const WALK_SPEED = 3.6;
const RUN_SPEED = 7.4;
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
    // Kol girdileri ayrı tutulur: klavyenin keyup'ı kolun basılı tuşunu silmesin.
    this.padKeys = new Set();
    // Dokunmatik joystick aynı kurala uyar: kendi kümesi, aynı hareket hattı.
    this.touchKeys = new Set();
    this.yaw = Math.PI;
    this.pitch = 0.22;
    this.viewPitch = 0;
    this.distance = 3.7;
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
    // "city" | "interior" | "raid": controls which avatars are drawn and
    // where the movement clamp applies.
    this.zone = "city";
    this.raid = null;
    this.inVehicle = false;
    this.vehicle = {
      model: "comet", fuel: 62, tank: 62, condition: 100, capacity: 180, cargoKg: 0,
      consumption: 11, cash: 0, node: "", odometer: 0, speed: 0, heading: Math.PI / 2, rangeKm: 0,
    };
    this.stats = { health: 100, armor: 0 };
    this.areaName = "";
    this.vehicleSpeed = 0;
    this.onVehicleState = null;
    this.onNotice = null;
    this.onNpc = null;
    this.onPrompt = null;
    this.onDoor = null;
    this.nearDoorName = "";
    this._hudTimer = 0;

    this._initRenderer();
    this._initScene();
    this._buildWorld();
    this.region = new City(this.scene, { world, language });
    this.truck = this.region.truck;
    this.position.set(-12, 0, 6);
    this.facing = Math.PI / 2;
    this.yaw = -Math.PI / 2;
    this.postfx = new PostFX(this.renderer, this.scene, this.camera, {
      quality: this.settings.quality,
      bloomStrength: 0.62,
      bloomThreshold: 0.82,
      exposure: 1.16,
      vignette: 0.5,
      grain: 0.022,
      aberration: 0.0026,
      saturation: 1.07,
      contrast: 1.03,
      enabled: this.settings.quality !== "low",
    });
    this.hud = new GtaHud();
    this.hud.setMap(this.region.radarData());

    // Sistemler (telefon, envanter, load screen) constructor'da değil,
    // start() çağrısından önce initSystems() ile başlatılır.
    this.playerId = this.worldData?.playerId || "local";
    this.inventory = null;
    this.phone = null;
    this.phoneUI = null;
    this.inventoryUI = null;
    this.loadScreen = null;
    // Server-owned sheet, mirrored for the HUD and the raid gate.
    this.profile = null;
    this.raid = null;
    this.onAttack = null;
    this.onRaidExit = null;
    this.onPlayerDown = null;
    this._attackTimer = 0;
    this._lastDamageAt = 0;

    this._bindInput();
  }

  /**
   * Telefon, envanter ve load screen sistemlerini başlatır.
   * Bu method main.js tarafından world.start() öncesi çağrılır.
   * Constructor'da async import yapmamak için ayrı method'dur.
   */
  async initSystems(playerId) {
    this.playerId = playerId || this.playerId || "local";

    const { Inventory } = await import("./inventory.js");
    this.inventory = new Inventory(this.playerId);

    const { PhoneSystem } = await import("./phone.js");
    this.phone = new PhoneSystem(this.playerId);
    this.phone.bindInventory(this.inventory);

    const { PhoneUI } = await import("./phone-ui.js");
    this.phoneUI = new PhoneUI(this, { phone: this.phone, inventory: this.inventory });

    const { InventoryUI } = await import("./inventory-ui.js");
    this.inventoryUI = new InventoryUI(this, { inventory: this.inventory, phone: this.phone });

    const { LoadScreen } = await import("./loadscreen.js");
    this.loadScreen = new LoadScreen(this);

    // The five-band arena lives outside the city grid and is only revealed
    // while the player is inside it.
    const { RaidArena } = await import("./raid.js");
    this.raid = new RaidArena(this.scene, {
      onPlayerHit: (damage, name) => this._hurtInRaid(damage, name),
    });
  }

  setProfile(profile) {
    this.profile = profile || null;
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
    // Dusk haze matched to the sky dome's horizon band, so distant towers melt
    // into the same air the sky is painted with.
    this.hazeColor = 0x8d7a83;
    this.scene.background = new THREE.Color(0x1a2138);
    this.scene.fog = new THREE.Fog(this.hazeColor, 95, 430);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.06, 900);
    this.camera.position.set(0, 4, 12);
    this.camera.rotation.order = "YXZ";

    // The environment map now supplies most of the fill light, so the analytic
    // lights are dialled back to keep the grade from washing out.
    this.scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x3a2c22, 0.85));
    this.ambient = new THREE.AmbientLight(0x8a7d9c, 0.38);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffcf9a, 2.7);
    this.sun.position.set(-42, 34, 26);
    this.sun.castShadow = Boolean(this.settings.shadows);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -46;
    this.sun.shadow.camera.right = 46;
    this.sun.shadow.camera.top = 46;
    this.sun.shadow.camera.bottom = -46;
    this.sun.shadow.camera.far = 190;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.sun.target = new THREE.Object3D();
    this.scene.add(this.sun.target);

    // Real reflections for every standard material in the scene.
    this.envMap = this._makeEnvironmentMap();
    this.scene.environment = this.envMap;
    if (this.envMap) this._disposables.push(this.envMap);
  }

  _buildWorld() {
    // The city module owns the ground, roads, buildings and props. This keeps
    // the container groups that the avatar and label systems still expect.
    this.avatarRoot = new THREE.Group();
    this.scene.add(this.avatarRoot);
  }

  setTheme(themeKey) {
    const theme = THEMES[themeKey] || THEMES.ember;
    this.theme = theme;
    // The district keeps its dusk haze whatever room theme is selected; the
    // theme still drives the interface and the avatar's lighting accents.
    this.scene.background.set(0x1a2138);
    this.scene.fog.color.set(this.hazeColor || 0x8d7a83);
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
    if (this.postfx) {
      this.postfx.enabled = settings.quality !== "low";
      this.postfx.quality = settings.quality;
      this.postfx.bloomStrength = settings.quality === "cinematic" ? 0.95 : 0.62;
      this.postfx.grain = settings.quality === "cinematic" ? 0.04 : 0.022;
      this.postfx.vignette = settings.quality === "cinematic" ? 0.7 : 0.5;
      this.postfx.setSize(window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());
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
      const otherZone = player.zone || "city";
      // Interiors and the raid are private spaces: only the city draws other
      // drivers, and the player themselves stays visible for the camera.
      const visible = player.id === this.selfId
        ? true
        : this.zone === "city" && otherZone === "city";
      if (!visible) {
        if (record) {
          record.group.visible = false;
          if (record.label) record.label.visible = false;
        }
        continue;
      }
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
      record.group.visible = true;
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
    // Indoors: the door out is the only interaction that matters.
    if (this.region?.inside) {
      const door = this.region.nearInteriorExit(this.position.x, this.position.z);
      if (door) {
        const name = this.region.interior?.name || "the street";
        const outside = this.region.exitInterior();
        this.zone = "city";
        this.position.set(outside.x, 0, outside.z);
        this.velocity.set(0, 0, 0);
        this.yaw = Math.PI;
        this.facing = 0;
        if (this.onDoor) this.onDoor({ leaving: true, name });
        if (this.onNotice) this.onNotice("Back on the street", "");
      } else if (this.onNotice) {
        this.onNotice("The exit is by the door on the near wall", "");
      }
      return true;
    }
    const door = this.region?.nearDoor(this.position.x, this.position.z);
    if (door) {
      const spawn = this.region.enterBuilding(door.id);
      if (spawn) {
        this.zone = "interior";
        this.position.set(spawn.x, 0, spawn.z);
        this.velocity.set(0, 0, 0);
        this.yaw = 0;
        this.facing = Math.PI;
        if (this.onDoor) this.onDoor({ entering: true, name: door.name, kind: door.template });
        if (this.onNotice) this.onNotice(`${door.name} — press E at the door to leave`, "good");
        return true;
      }
    }
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
    const maxSpeed = 41 * conditionFactor * (climate.power || 1);
    const throttle = (this.pressed("w") || this.keys.has("arrowup") ? 1 : 0)
      - (this.pressed("s") || this.keys.has("arrowdown") ? 1 : 0);
    const steer = (this.pressed("a") || this.keys.has("arrowleft") ? 1 : 0)
      - (this.pressed("d") || this.keys.has("arrowright") ? 1 : 0);
    const handbrake = this.pressed(" ");
    const hasFuel = vehicle.fuel > 0.001;

    if (hasFuel && throttle !== 0) {
      vehicle.speed += throttle * 11.2 * conditionFactor * (climate.power || 1) * dt;
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
        const message = blocked === "furniture" ? "Furniture in the way"
          : blocked === "wall" ? "That is a wall"
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
    const steerVisual = Math.max(-0.5, Math.min(0.5, steer * 0.42 * Math.min(1, Math.abs(vehicle.speed) / 6)));
    spinWheels(this.truck, vehicle.speed * dt, steerVisual);

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

  dispose() {
    this.stop();

    // Telefon UI ve envanter UI temizliği
    if (this.phoneUI) {
      this.phoneUI.close();
      if (this.phoneUI.panel && this.phoneUI.panel.parentNode) {
        this.phoneUI.panel.parentNode.removeChild(this.phoneUI.panel);
      }
    }
    if (this.inventoryUI) {
      this.inventoryUI.close();
      if (this.inventoryUI.panel && this.inventoryUI.panel.parentNode) {
        this.inventoryUI.panel.parentNode.removeChild(this.inventoryUI.panel);
      }
    }
    if (this.loadScreen?.overlay && this.loadScreen.overlay.parentNode) {
      this.loadScreen.overlay.parentNode.removeChild(this.loadScreen.overlay);
    }

    window.removeEventListener("keydown", this._onKeyDown);
    const vehicle = this.vehicle;
    const forwardX = Math.sin(vehicle.heading);
    const forwardZ = Math.cos(vehicle.heading);
    const offset = Math.max(-1.5, Math.min(1.5, wrapAngle((this.yaw - Math.PI) - vehicle.heading)));
    const angle = vehicle.heading + offset;
    const distance = 7.1 + Math.min(2.4, Math.abs(vehicle.speed) * 0.1);
    const targetX = this.truck.position.x - Math.sin(angle) * distance;
    const targetZ = this.truck.position.z - Math.cos(angle) * distance;
    const targetY = 3.05 + Math.max(0, Math.min(2.2, this.pitch - 0.22) * -2.0);
    const ease = Math.min(1, dt * 5.2);
    this.camera.position.x += (targetX - this.camera.position.x) * ease;
    this.camera.position.y += (targetY - this.camera.position.y) * ease;
    this.camera.position.z += (targetZ - this.camera.position.z) * ease;
    if (this.settings.shake && Math.abs(vehicle.speed) > 4) {
      const rumble = Math.min(0.03, Math.abs(vehicle.speed) * 0.0012);
      this.camera.position.y += Math.sin(elapsed * 31) * rumble;
    }
    this.camera.lookAt(
      this.truck.position.x + forwardX * 4.2,
      1.35,
      this.truck.position.z + forwardZ * 4.2
    );
    const targetFov = Math.min(92, (this.settings.fov || 62) + Math.min(16, Math.abs(vehicle.speed) * 0.42));
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  _resolveCollision(previousX, previousZ, isVehicle) {
    // The city collider has no idea the gate exists; the arena has its own
    // radial clamp and must not be treated as out-of-bounds city ground.
    if (this.zone === "raid") return;
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
      zone: this.zone || "city",
      weapon: this.weapon || "",
    };
  }

  /** Klavye, kol ya da dokunmatik joystick — biri basılıysa hareket sayılır. */
  pressed(key) {
    return this.keys.has(key)
      || (this.padKeys ? this.padKeys.has(key) : false)
      || (this.touchKeys ? this.touchKeys.has(key) : false);
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
      this.padKeys?.clear();
      this.touchKeys?.clear();
      this.pointer.dragging = false;
    };

    this._onPointerDown = (event) => {
      if (event.button !== 0 || !this.inputEnabled) return;
      if (this.locked) {
        // Pointer-locked, the left button is the weapon. Clicking anywhere in
        // the gate is a swing; drawing steel is still R.
        if (this.zone === "raid") this.attack();
        return;
      }
      this.pointer.dragging = true;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      // A finger has no way to give the mouse back: touch look is drag-only.
      if (event.pointerType !== "touch") this.requestLook();
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

  // ── the gate ────────────────────────────────────────────────────────
  enterRaid(band = 1) {
    if (!this.raid) return null;
    if (this.inVehicle) this.exitVehicle();
    if (this.region?.inside) {
      this.region.exitInterior();
      this.region.inside = false;
    }
    const info = this.raid.enter(band);
    this.zone = "raid";
    this.position.set(info.spawn.x, 0, info.spawn.z);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.PI;
    this.facing = 0;
    this.weapon = "";
    this.hud?.setMap?.({ roads: [], blocks: [], blips: [] });
    return info;
  }

  leaveRaid({ silent = false } = {}) {
    if (this.zone !== "raid") return false;
    this.raid?.leave();
    this.zone = "city";
    this.position.set(-8, 0, 8);
    this.velocity.set(0, 0, 0);
    this.facing = Math.PI / 2;
    this.yaw = -Math.PI / 2;
    this.hud?.setMap?.(this.region?.radarData?.() || null);
    this.stats.health = Math.max(35, this.stats.health);
    if (!silent) this.onNotice?.(`Back through the gate${this.profile ? ` · band ${this.profile.band}/5` : ""}`, "");
    this.onRaidExit?.();
    return true;
  }

  /**
   * Warp the driver to a map coordinate. Used by /tp; the next sync carries
   * the new position to the host, so other drivers see the arrival.
   */
  warpTo(x, z, { heading = null } = {}) {
    const targetX = Number(x);
    const targetZ = Number(z);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return false;
    if (this.inVehicle) this.exitVehicle();
    if (this.region?.inside) {
      this.region.exitInterior();
      this.zone = "city";
      this.hud?.setMap?.(this.region?.radarData?.() || null);
    }
    if (this.zone === "raid") {
      // The arena owns its own ring; leaving it is a job for the gate.
      return false;
    }
    const spot = this.region?.clamp ? this.region.clamp(targetX, targetZ) : { x: targetX, z: targetZ };
    this.position.set(spot.x, 0, spot.z);
    this.velocity.set(0, 0, 0);
    this.pointer.dragging = false;
    if (Number.isFinite(heading)) {
      this.facing = heading;
      this.yaw = wrapAngle(heading + Math.PI);
    }
    return true;
  }

  attack() {
    if (this.zone !== "raid" || !this.raid?.active) return false;
    if (this._attackTimer > 0) return false;
    if (!this.weapon) {
      this.onNotice?.("Draw a weapon first — R", "bad");
      return false;
    }
    const weapon = this.profile?.weapon || { range: 2.4, rate: 0.45 };
    const distance = this.raid.distanceTo(this.position.x, this.position.z);
    this._attackTimer = Math.max(0.18, Number(weapon.rate) || 0.45);
    // The swing happens whether or not the target is in reach; the server, not
    // the client, decides what the hit is worth.
    if (distance > Number(weapon.range || 2.4) + 1.2) {
      this.onNotice?.("Out of reach — close the distance", "bad");
      return false;
    }
    this.onAttack?.({ distance, range: Number(weapon.range) || 2.4 });
    return true;
  }

  _hurtInRaid(damage, name = "The boss") {
    if (this.zone !== "raid") return;
    this.stats.health = Math.max(0, this.stats.health - Math.max(1, Math.round(damage)));
    this._lastDamageAt = this.clock.elapsedTime;
    this.onNotice?.(`${name} hits you — ${Math.round(this.stats.health)} health`, "bad");
    if (this.stats.health <= 0) {
      this.stats.health = 40;
      this.leaveRaid({ silent: true });
      this.onNotice?.("You wake on the street. The gate keeps what it took.", "bad");
      this.onPlayerDown?.();
    }
  }

  toggleWeapon() {
    // The drawn silhouette follows the equipped weapon rather than a generic
    // "blade", so a pistol and a dagger read differently to other players.
    const equipped = this.profile?.equipped && this.profile.equipped !== "fists"
      ? this.profile.equipped : "knife";
    this.weapon = this.weapon ? "" : equipped;
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
  hudState() {
    const heading = this.inVehicle ? this.vehicle.heading : this.facing;
    const speedKmh = this.inVehicle
      ? Math.abs(this.vehicle.speed) * 3.6
      : Math.hypot(this.velocity.x, this.velocity.z) * 3.6;
    const speed = Math.abs(this.vehicle.speed);
    const gear = !this.inVehicle ? "" : speed < 0.6 ? "N" : speed < 8 ? "1" : speed < 15 ? "2" : speed < 22 ? "3" : speed < 30 ? "4" : "5";
    const inside = Boolean(this.region?.inside);
    const roomName = this.region?.interior?.name || "INTERIOR";
    return {
      x: this.position.x, z: this.position.z, heading,
      speedKmh, inVehicle: this.inVehicle, cash: this.profile?.cash ?? this.vehicle.cash,
      health: this.stats.health, armor: this.stats.armor,
      wanted: this.fearActive ? 2 : 0, gear,
      fuel: (this.vehicle.fuel / Math.max(1, this.vehicle.tank)) * 100,
      area: this.zone === "raid" ? "THE LAST GATE" : inside ? roomName : this.areaName,
      location: this.zone === "raid" ? "The Last Gate" : inside ? roomName : (this.nearDoorName || this.areaName),
      prompt: this.zone === "raid"
        ? "Click — strike · R — weapon · B — leave the gate"
        : this.nearDoorName ? `E — ${this.nearDoorName}` : "",
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.hud?.show();

    // Load screen'ı tamamla — world hazır, UI'lar görünür
    if (this.loadScreen && !this.loadScreen.visible) {
      this.loadScreen.show("Dünya yükleniyor…", "Oyun içi yapılandırılıyor");
    }
    if (this.loadScreen) {
      this.loadScreen.tick(0);
      // Gerçek bir yükleme süresi yok, çünkü world zaten inşa edildi.
      // Load screen'ı hızla tamamla.
      this.loadScreen.complete();
      setTimeout(() => this.loadScreen?.hide(), 350);
    }

    this.resize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight);
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      // A single bad frame must never take the render loop down with it: the
      // old loop scheduled the next frame at the very end, so one exception
      // (mounting the truck did exactly that) froze the whole game for good.
      try {
        this._update(dt, this.clock.elapsedTime);

        // Telefon akü ve sistem tick'i
        if (this.phone && this.running) {
          this.phone.tick(dt);
          if (this.phoneUI?.visible) {
            this.phoneUI._updateTime();
            this.phoneUI._refreshNotifications();
          }
        }

        if (this.postfx?.enabled) this.postfx.render(dt);
        else this.renderer.render(this.scene, this.camera);
      } catch (error) {
        if (!this._loopErrorLogged) {
          this._loopErrorLogged = true;
          console.error("[aetherhold] frame error — the loop keeps running", error);
        }
      }
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
      const forwardInput = (this.pressed("w") || this.keys.has("arrowup") ? 1 : 0) - (this.pressed("s") || this.keys.has("arrowdown") ? 1 : 0);
      const strafeInput = (this.pressed("d") || this.keys.has("arrowright") ? 1 : 0) - (this.pressed("a") || this.keys.has("arrowleft") ? 1 : 0);
      running = this.pressed("shift");
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

      if (!this.region?.inside && this.zone !== "raid") {
        const edge = this.region?.edge || { x: 118, z: 74 };
        this.position.x = Math.max(-edge.x, Math.min(edge.x, this.position.x));
        this.position.z = Math.max(-edge.z, Math.min(edge.z, this.position.z));
      }
      this._resolveCollision(previousX, previousZ, false);

      if (this.zone === "raid" && this.raid) {
        const center = this.raid.center;
        const dx = this.position.x - center.x;
        const dz = this.position.z - center.z;
        const distance = Math.hypot(dx, dz);
        const limit = center.radius - 1.6;
        if (distance > limit) {
          this.position.x = center.x + (dx / distance) * limit;
          this.position.z = center.z + (dz / distance) * limit;
        }
      }
    }

    // Keep the shadow cascade over whoever we are looking at, so the truck and
    // the garages cast real shadows instead of only the plaza at the origin.
    const focus = this.inVehicle && this.truck ? this.truck.position : this.position;
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.set(focus.x - 22, 38, focus.z + 16);
    this.sun.target.updateMatrixWorld();
    if (this.region) this.region.update(dt, elapsed);
    if (this._attackTimer > 0) this._attackTimer = Math.max(0, this._attackTimer - dt);
    if (this.raid?.active) this.raid.update(dt, elapsed, this.position);
    if (this.zone === "city" && this.stats.health < 100 && elapsed - this._lastDamageAt > 7) {
      this.stats.health = Math.min(100, this.stats.health + dt * 1.6);
    }

    if (this.emoteTime > 0) this.emoteTime = Math.max(0, this.emoteTime - dt);

    const speedNow = Math.hypot(this.velocity.x, this.velocity.z);
    this.bobPhase += dt * (running ? 11.5 : 7.6) * (speedNow > 0.25 ? 1 : 0);
    this._updateCamera(dt, elapsed, speedNow, running);

    this._animateAvatars(dt, elapsed);

    this._hudTimer += dt;
    if (this._hudTimer >= 0.2) {
      this._hudTimer = 0;
      this.emitVehicleState();
    }

    // Load screen animasyonu (kendi kendine tamamlanır)
    if (this.loadScreen && this.loadScreen.visible) {
      this.loadScreen.tick(dt);
      if (this.loadScreen.elapsed >= 1.4) {
        this.loadScreen.hide();
      }
    }

    // Street name for the radar banner, refreshed while walking the district.

    // Telefon akü ve sistem tick'i
    if (this.phone && this.running) {
      this.phone.tick(dt);
      if (this.phoneUI?.visible) {
        this.phoneUI._updateTime();
        this.phoneUI._refreshNotifications();
      }
    }
    if (this.zone === "city") {
      const streets = this.region?.radarData?.()?.streets;
      if (Math.abs(this.position.z) < 20) this.areaName = streets ? streets.avenue : "VINEWOOD";
      else if (Math.abs(this.position.x) < 20) this.areaName = "DOWNTOWN";
      else this.areaName = this.region?.nearestSite(this.position.x, this.position.z, 46)?.label || "ELGIN DISTRICT";
      const near = this.region?.nearDoor(this.position.x, this.position.z);
      this.nearDoorName = near?.name || "";
    } else {
      this.nearDoorName = "";
    }
    this._hudFrame = (this._hudFrame || 0) + dt;
    if (this._hudFrame >= 0.033) {
      this.hud?.update(this.hudState(), this._hudFrame);
      this._hudFrame = 0;
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
    const shoulder = this.region?.inside ? 0.15 : 0.6;
    // The camera is over the right shoulder, so the avatar never hides the scene.
    const cameraDistance = this.region?.inside ? 2.5 : this.distance;
    const targetX = this.position.x + Math.sin(this.yaw) * cosPitch * cameraDistance + rightX * shoulder;
    const targetZ = this.position.z + Math.cos(this.yaw) * cosPitch * cameraDistance + rightZ * shoulder;
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

  // Chase camera for the truck. `_updateCamera` delegates here while seated, so
  // it must always place the camera: this method was missing, which threw a
  // TypeError on the first mounted frame and left the player looking at a
  // frozen picture.
  _updateVehicleCamera(dt, elapsed) {
    const truck = this.truck;
    if (!truck) return;
    const heading = this.vehicle?.heading ?? truck.rotation.y ?? 0;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const speed = Math.abs(this.vehicle?.speed || 0);
    const cab = this.firstPerson;

    if (cab) {
      // In the cab the eye sits above the seat, looking down the bonnet.
      const eyeX = truck.position.x + forwardX * 0.6;
      const eyeZ = truck.position.z + forwardZ * 0.6;
      const ease = Math.min(1, dt * 14);
      this.camera.position.x += (eyeX - this.camera.position.x) * ease;
      this.camera.position.y += (2.02 - this.camera.position.y) * ease;
      this.camera.position.z += (eyeZ - this.camera.position.z) * ease;
      this.camera.lookAt(
        truck.position.x + forwardX * 16,
        1.7 - Math.sin(this.pitch || 0) * 8,
        truck.position.z + forwardZ * 16
      );
    } else {
      // Behind the cab and above the bed; the rig lags so turns read as weight.
      const back = 8.6 + Math.min(2.6, speed * 0.22);
      const high = 4.2 + Math.min(0.8, speed * 0.06);
      const targetX = truck.position.x - forwardX * back;
      const targetZ = truck.position.z - forwardZ * back;
      const ease = Math.min(1, dt * 4.6);
      this.camera.position.x += (targetX - this.camera.position.x) * ease;
      this.camera.position.y += (high - this.camera.position.y) * ease;
      this.camera.position.z += (targetZ - this.camera.position.z) * ease;
      this.camera.lookAt(
        truck.position.x + forwardX * 7.5,
        1.55,
        truck.position.z + forwardZ * 7.5
      );
    }

    // Engine shake, only when the player allows it.
    if (this.settings.shake && speed > 0.4) {
      const amp = Math.min(0.04, speed * 0.005);
      this.camera.position.y += Math.sin(elapsed * 22.5) * amp;
      this.camera.position.x += Math.cos(elapsed * 17.3) * amp * 0.5;
    }

    const targetFov = this.settings.fov + (cab ? 2 : 6) + Math.min(9, speed * 0.55);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
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
    // Load screen boyutlarını yeniden hesapla
    if (this.loadScreen?.overlay) {
      const card = this.loadScreen.overlay.querySelector(".load-card");
      if (card) {
        card.style.width = `${Math.min(380, window.innerWidth - 40)}px`;
      }
    }
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
    this.postfx?.setSize(width, height, this.renderer.getPixelRatio());
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();

    // Telefon UI ve envanter UI temizliği
    if (this.phoneUI) {
      this.phoneUI.close();
      if (this.phoneUI.panel && this.phoneUI.panel.parentNode) {
        this.phoneUI.panel.parentNode.removeChild(this.phoneUI.panel);
      }
    }
    if (this.inventoryUI) {
      this.inventoryUI.close();
      if (this.inventoryUI.panel && this.inventoryUI.panel.parentNode) {
        this.inventoryUI.panel.parentNode.removeChild(this.inventoryUI.panel);
      }
    }
    if (this.loadScreen?.overlay && this.loadScreen.overlay.parentNode) {
      this.loadScreen.overlay.parentNode.removeChild(this.loadScreen.overlay);
    }

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
    this.postfx?.dispose();
    this.postfx = null;
    this.hud?.destroy();
    this.hud = null;
    this.raid?.dispose();
    this.raid = null;
    this.region?.disposes?.();
    // kitMaterials() is intentionally session-scoped: disposing it here used
    // to leave every later district with dead car paint and sign textures.
    this._disposables.forEach((item) => item?.dispose?.());
    this.renderer.dispose();
  }
}
