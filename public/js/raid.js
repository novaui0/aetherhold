// raid.js — the five-band gate below Elgin.
//
// The arena is built once, a few hundred metres outside the city grid, and
// revealed only while the player is inside. Each band repaints the sigil,
// braziers and boss; the server still owns the boss's health, so the arena is
// presentation and local melee, never the reward ledger.

import * as THREE from "../vendor/three.module.js";
import { addMesh, contactShadow, roundedBox } from "./render/kit.js";
import { animateAvatar, buildAvatar, setAvatarWeapon } from "./character.js";

export const ARENA = { x: -304, z: -344, radius: 24 };
export const ARENA_GATE = { x: ARENA.x, z: ARENA.z + 20 };

const TAU = Math.PI * 2;

export const BAND_LOOKS = [
  {
    name: "The Rat King", place: "The Drowned Docks", color: "#8fd0b0",
    floor: "#26362f", banner: "#3f6b58", fog: "#20302c",
    look: { color: "#31463a", accent: "#8fd0b0", skin: "#8a9a84", hair: "#1d2a23", hairStyle: "wild", build: "tall", cls: "Brute" },
  },
  {
    name: "Marrow Jack", place: "Slaughter Row", color: "#ffab7a",
    floor: "#3b2a24", banner: "#7a3f2c", fog: "#3a2620",
    look: { color: "#5c3327", accent: "#ffab7a", skin: "#c9a07f", hair: "#2a1712", hairStyle: "short", build: "broad", cls: "Butcher" },
  },
  {
    name: "The Hollow Choir", place: "The Silent Chapel", color: "#b9a2ff",
    floor: "#2a2640", banner: "#4a3d78", fog: "#241f38",
    look: { color: "#3c3560", accent: "#b9a2ff", skin: "#b9b2c9", hair: "#14111f", hairStyle: "long", build: "slight", cls: "Mage" },
  },
  {
    name: "Iron Widow", place: "Foundry Nine", color: "#ff8f8f",
    floor: "#3b2424", banner: "#7a2f2f", fog: "#341d1d",
    look: { color: "#5c2b2b", accent: "#ff8f8f", skin: "#8f7a72", hair: "#2b1414", hairStyle: "braid", build: "average", cls: "Ranger" },
  },
  {
    name: "The Pale Warden", place: "The Last Gate", color: "#f2e6c9",
    floor: "#35322c", banner: "#6d6448", fog: "#2c2a25",
    look: { color: "#4a463c", accent: "#f2e6c9", skin: "#d9cfbd", hair: "#1c1a16", hairStyle: "long", build: "tall", cls: "Warden" },
  },
];

export class RaidArena {
  constructor(scene, { onPlayerHit = null } = {}) {
    this.scene = scene;
    this.onPlayerHit = onPlayerHit;
    this.time = 0;
    this.band = 0;
    this.active = false;
    this.boss = null;
    this.bossHp = 1;
    this.bossMaxHp = 1;
    this.nextAttack = 0;
    this.hitFlash = 0;
    this.deadAt = 0;
    this.moving = false;
    this._bosses = new Map();

    this.group = new THREE.Group();
    this.group.name = "raid-arena";
    this.group.position.set(ARENA.x, 0, ARENA.z);
    this.group.visible = false;
    scene.add(this.group);
    this._build();
  }

  // ── build ────────────────────────────────────────────────────────────
  _build() {
    const M = this._materials();
    this.materials = M;

    // A stone ring, cracked and stained, sitting just above the fog line.
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.radius + 3, ARENA.radius + 4.4, 0.6, 64), M.stone);
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    this.group.add(floor);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.radius + 1.6, ARENA.radius + 1.8, 0.12, 64), M.darkStone);
    top.position.y = 0.02;
    top.receiveShadow = true;
    this.group.add(top);

    // Sigil rings read the current band colour.
    this.sigilMat = new THREE.MeshStandardMaterial({
      color: 0x8fd0b0, emissive: 0x8fd0b0, emissiveIntensity: 0.8,
      roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.8,
    });
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(6 + i * 4.4, 6.18 + i * 4.4, 64), this.sigilMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09 + i * 0.002;
      ring.renderOrder = 1;
      this.group.add(ring);
    }
    // Spokes between the rings.
    for (let i = 0; i < 8; i += 1) {
      const spoke = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 17.6), this.sigilMat);
      spoke.rotation.x = -Math.PI / 2;
      spoke.rotation.z = (i / 8) * TAU;
      spoke.position.y = 0.095;
      this.group.add(spoke);
    }

    // Outer wall, broken into segments, with an opening at the gate.
    const segmentCount = 18;
    for (let i = 0; i < segmentCount; i += 1) {
      const angle = (i / segmentCount) * TAU;
      if (Math.abs(angle - Math.PI / 2) < 0.24) continue;
      const x = Math.cos(angle) * (ARENA.radius + 4.2);
      const z = Math.sin(angle) * (ARENA.radius + 4.2);
      const height = 4.4 + (i % 3) * 1.4;
      addMesh(this.group, roundedBox(7.4, height, 1.4, 0.18), M.wall,
        [x, height / 2, z], [0, -angle, 0]);
      if (i % 2 === 0) {
        const torch = addMesh(this.group, new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), M.iron,
          [x * 0.94, 2.8, z * 0.94]);
        torch.castShadow = true;
      }
    }

    // Gate arch: two pillars and a lintel, with runes that pulse.
    this.gateMat = new THREE.MeshStandardMaterial({
      color: 0xf2c97d, emissive: 0xf2c97d, emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.6,
    });
    [-1, 1].forEach((side) => {
      addMesh(this.group, roundedBox(1.6, 8.4, 1.6, 0.18), M.gateStone,
        [side * 4.2, 4.2, ARENA.radius + 1.2]);
      addMesh(this.group, roundedBox(0.22, 6.4, 0.1, 0.04), this.gateMat,
        [side * 3.36, 4.2, ARENA.radius + 1.24]);
    });
    addMesh(this.group, roundedBox(10.4, 1.1, 1.8, 0.22), M.gateStone,
      [0, 8.6, ARENA.radius + 1.2]);
    addMesh(this.group, roundedBox(7.6, 0.18, 0.2, 0.05), this.gateMat,
      [0, 7.9, ARENA.radius + 2.12]);

    // Braziers at the four quarters; each band recolours the flame.
    this.flameMat = new THREE.MeshStandardMaterial({
      color: 0x8fd0b0, emissive: 0x8fd0b0, emissiveIntensity: 2.2,
      roughness: 0.4, transparent: true, opacity: 0.92,
    });
    this.braziers = [];
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * TAU + Math.PI / 4;
      const x = Math.cos(angle) * (ARENA.radius - 2.5);
      const z = Math.sin(angle) * (ARENA.radius - 2.5);
      addMesh(this.group, new THREE.CylinderGeometry(0.32, 0.52, 1.5, 10), M.iron, [x, 0.75, z]);
      addMesh(this.group, new THREE.CylinderGeometry(0.62, 0.28, 0.28, 12), M.iron, [x, 1.55, z]);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 10), this.flameMat);
      flame.position.set(x, 2.1, z);
      this.group.add(flame);
      this.braziers.push(flame);
      const light = new THREE.PointLight(0x8fd0b0, 14, 26, 2);
      light.position.set(x, 3.2, z);
      this.group.add(light);
      this._lights = this._lights || [];
      this._lights.push(light);
    }

    // Band props: five little tableaux toggled on entry.
    this.bandProps = BAND_LOOKS.map((look, index) => {
      const holder = new THREE.Group();
      holder.visible = false;
      this.group.add(holder);
      if (index === 0) {
        for (let i = 0; i < 12; i += 1) {
          const angle = Math.random() * TAU;
          const radius = 13 + Math.random() * 6;
          addMesh(holder, roundedBox(1.1, 0.5, 0.7, 0.08), M.crate,
            [Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius]);
        }
      } else if (index === 1) {
        for (let i = 0; i < 9; i += 1) {
          const angle = (i / 9) * TAU;
          const hook = addMesh(holder, new THREE.TorusGeometry(0.34, 0.05, 6, 16), M.chain,
            [Math.cos(angle) * 16, 2.8 + (i % 3) * 0.8, Math.sin(angle) * 16]);
          hook.rotation.x = Math.PI / 2;
        }
      } else if (index === 2) {
        for (let i = 0; i < 7; i += 1) {
          const angle = (i / 7) * TAU;
          addMesh(holder, roundedBox(0.6, 2.6, 0.6, 0.08), M.candle,
            [Math.cos(angle) * 14, 1.3, Math.sin(angle) * 14]);
          addMesh(holder, new THREE.ConeGeometry(0.16, 0.5, 8), this.flameMat,
            [Math.cos(angle) * 14, 2.9, Math.sin(angle) * 14]);
        }
      } else if (index === 3) {
        for (let i = 0; i < 5; i += 1) {
          addMesh(holder, new THREE.CylinderGeometry(0.9, 1.1, 1.6, 12), M.rust,
            [-15 + i * 7.5, 0.8, -15 + (i % 2) * 3]);
        }
      } else {
        addMesh(holder, roundedBox(3.6, 0.5, 3.6, 0.2), M.gateStone, [0, 0.25, -10]);
        for (let i = 0; i < 5; i += 1) {
          const angle = (i / 5) * TAU;
          addMesh(holder, new THREE.CylinderGeometry(0.16, 0.22, 2.2, 8), M.candle,
            [Math.cos(angle) * 8, 1.1, Math.sin(angle) * 8]);
        }
      }
      return holder;
    });

    // Fog only exists inside the arena so the city stays readable.
    this.fog = new THREE.Fog(0x20302c, 26, 96);
    // No geometry merge here: the braziers, sigils and gate are animated every
    // frame and must stay individual meshes.
    this._bossRoot = new THREE.Group();
    this.group.add(this._bossRoot);
    this._flashRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.4, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }),
    );
    this._flashRing.rotation.x = -Math.PI / 2;
    this._flashRing.position.y = 0.16;
    this.group.add(this._flashRing);
  }

  _materials() {
    const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...extra });
    return {
      stone: standard(0x2f3431, { roughness: 0.95 }),
      darkStone: standard(0x1b1f1e),
      wall: standard(0x2a2d2b, { roughness: 0.96 }),
      gateStone: standard(0x3a3d39),
      crate: standard(0x5a4630),
      chain: standard(0x3b3b3b, { metalness: 0.7, roughness: 0.5 }),
      candle: standard(0xcdbfa2, { emissive: 0x30251a, emissiveIntensity: 0.4 }),
      rust: standard(0x5a3a2c, { metalness: 0.55, roughness: 0.7 }),
      iron: standard(0x25282a, { metalness: 0.8, roughness: 0.45 }),
    };
  }

  // ── lifecycle ────────────────────────────────────────────────────────
  enter(band = 1) {
    this.active = true;
    this.band = Math.max(1, Math.min(5, band));
    this.group.visible = true;
    this.bandProps.forEach((props, index) => { props.visible = index === this.band - 1; });
    const look = BAND_LOOKS[this.band - 1];
    this.sigilMat.color.set(look.color);
    this.sigilMat.emissive.set(look.color);
    this.flameMat.color.set(look.color);
    this.flameMat.emissive.set(look.color);
    this.gateMat.emissiveIntensity = 1.3;
    for (const light of this._lights || []) light.color.set(look.color);
    this.fog.color.set(look.fog);

    const boss = this._bossFor(this.band);
    this._bossRoot.clear();
    this._bossRoot.add(boss);
    boss.position.set(0, 0, -3);
    boss.rotation.set(0, 0, 0);
    boss.visible = true;
    this.boss = boss;
    this.bossMaxHp = 1;
    this.bossHp = 1;
    this.deadAt = 0;
    this.nextAttack = 0;
    this.time = 0;
    this._flashRing.material.opacity = 0;
    return {
      spawn: { x: ARENA.x, z: ARENA.z + 17 },
      band: this.band,
    };
  }

  leave() {
    this.active = false;
    this.group.visible = false;
    if (this.boss) this.boss.visible = false;
  }

  _bossFor(band) {
    if (this._bosses.has(band)) return this._bosses.get(band);
    const look = BAND_LOOKS[band - 1];
    const boss = buildAvatar({ ...look.look, name: look.name });
    boss.scale.multiplyScalar(1.32);
    boss.userData.isBoss = true;
    setAvatarWeapon(boss, "cleaver");
    // A crown ring so the silhouette is unmistakable in the mist.
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 20),
      new THREE.MeshStandardMaterial({
        color: look.color, emissive: look.color, emissiveIntensity: 1.4, metalness: 0.7, roughness: 0.35,
      }));
    crown.rotation.x = Math.PI / 2.6;
    crown.position.set(0, 2.42, 0);
    boss.add(crown);
    const shadow = contactShadow(boss, 1.6, 0.4, 0.02);
    boss.userData.raidShadow = shadow;
    this._bosses.set(band, boss);
    return boss;
  }

  setHp(hp, maxHp) {
    this.bossHp = Math.max(0, Number(hp) || 0);
    this.bossMaxHp = Math.max(1, Number(maxHp) || 1);
  }

  get center() {
    return ARENA;
  }

  position() {
    if (!this.boss) return null;
    return {
      x: ARENA.x + this.boss.position.x,
      z: ARENA.z + this.boss.position.z,
      y: this.boss.position.y,
    };
  }

  distanceTo(x, z) {
    if (!this.boss) return Infinity;
    return Math.hypot(x - (ARENA.x + this.boss.position.x), z - (ARENA.z + this.boss.position.z));
  }

  // Local feedback when a shot lands; the server's reply owns the number.
  impact(crit = false) {
    this.hitFlash = 0.24;
    this._flashRing.material.opacity = crit ? 0.8 : 0.5;
    this._flashRing.material.color.set(crit ? 0xffd27a : 0xffffff);
    if (this.boss) {
      this.boss.position.z += 0.16;
      this.boss.position.x += (Math.random() - 0.5) * 0.14;
    }
  }

  defeat() {
    this.deadAt = this.time;
    this.bossHp = 0;
  }

  update(dt, elapsed, playerPos) {
    if (!this.active || !this.boss) return;
    this.time += dt;
    const look = BAND_LOOKS[this.band - 1];

    // Braziers breathe; sigils rotate slowly.
    this.sigilMat.emissiveIntensity = 0.65 + Math.sin(elapsed * 1.7) * 0.2;
    for (let i = 0; i < this.braziers.length; i += 1) {
      const flame = this.braziers[i];
      flame.scale.y = 0.9 + Math.sin(elapsed * 7 + i) * 0.16;
      flame.rotation.y += dt * 1.5;
    }
    this.gateMat.emissiveIntensity = 1.0 + Math.sin(elapsed * 2.4) * 0.35;

    if (this._flashRing.material.opacity > 0) {
      this._flashRing.material.opacity = Math.max(0, this._flashRing.material.opacity - dt * 2.4);
      this._flashRing.scale.setScalar(1 + (0.5 - this._flashRing.material.opacity) * 1.8);
    }

    const boss = this.boss;
    if (this.bossHp <= 0) {
      // A short death fall, then the corpse stays until the player leaves.
      const fall = Math.min(1, (this.time - this.deadAt) * 1.8);
      boss.rotation.z = fall * 1.3;
      boss.position.y = -fall * 0.5;
      animateAvatar(boss, { dt, elapsed, speed: 0, moving: false, running: false, emote: "", headYaw: 0, headPitch: 0.5 });
      return;
    }

    const dx = playerPos.x - (ARENA.x + boss.position.x);
    const dz = playerPos.z - (ARENA.z + boss.position.z);
    const distance = Math.hypot(dx, dz);
    const speed = 1.5 + this.band * 0.22;
    this.moving = distance > 3.3;
    if (this.moving) {
      boss.position.x += (dx / Math.max(0.001, distance)) * speed * dt;
      boss.position.z += (dz / Math.max(0.001, distance)) * speed * dt;
    }
    boss.rotation.y = Math.atan2(dx, dz);

    // Keep the boss inside the sigil ring even if the player hugs the wall.
    const limit = ARENA.radius - 5;
    const radial = Math.hypot(boss.position.x, boss.position.z);
    if (radial > limit) {
      boss.position.x *= limit / radial;
      boss.position.z *= limit / radial;
    }

    animateAvatar(boss, {
      dt, elapsed,
      speed: this.moving ? speed : 0,
      moving: this.moving,
      running: distance > 9,
      emote: this.time < 1.2 ? "wave" : "",
      headYaw: 0, headPitch: 0,
    });

    if (distance < 4.2 && this.time > this.nextAttack) {
      this.nextAttack = this.time + Math.max(1.05, 2.2 - this.band * 0.16);
      const damage = 5 + this.band * 2;
      // A lunge is the only telegraph the player needs.
      boss.position.x -= (dx / Math.max(0.001, distance)) * 0.55;
      boss.position.z -= (dz / Math.max(0.001, distance)) * 0.55;
      this._flashRing.material.opacity = 0.34;
      this._flashRing.material.color.set(look.color);
      if (this.onPlayerHit) this.onPlayerHit(damage, look.name);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this._bosses.clear();
    this.boss = null;
  }
}
