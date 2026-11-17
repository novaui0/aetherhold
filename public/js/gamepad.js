// gamepad.js — PlayStation / Xbox kol desteği (Gamepad API)
//
// Sol çubuk yürür, sağ çubuk bakar; R2 gaz/koşu, L2 fren/el freni.
// Düğmeler klavyedeki karşılıklarını çağırır (E, V, R, M, I, Esc).
// Klavye ile çakışmaması için kol girdileri ayrı bir kümede tutulur
// (world.padKeys) ve orada birleştirilir.

const DEADZONE = 0.18;
const LOOK_SPEED = 2.9; // rad/sn @ tam sapma
const PITCH_SPEED = 1.6;

export class GamepadDriver {
  constructor(world, { onNotice, onPause, onMap, onSheet, onInventory, onTvMode } = {}) {
    this.world = world;
    this.onNotice = onNotice || (() => {});
    this.onPause = onPause || (() => {});
    this.onMap = onMap || (() => {});
    this.onSheet = onSheet || (() => {});
    this.onInventory = onInventory || (() => {});
    this.onTvMode = onTvMode || (() => {});

    this.index = null;
    this.id = "";
    this.connected = false;
    this._held = new Set();
    this._prevButtons = [];
    this._last = 0;
    this._raf = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    if (!this.world) return;
    this.world.padKeys = this.world.padKeys || new Set();
    this._last = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      try {
        this.poll(dt);
      } catch (error) {
        console.warn("[aetherhold] gamepad poll failed", error);
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._releaseAll();
    this.connected = false;
  }

  /** İlk bağlı kolu döndürür (Chrome'da 4 slota kadar dolabilir). */
  _pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  poll(dt) {
    const pad = this._pad();
    if (!pad) {
      if (this.connected) {
        this.connected = false;
        this.index = null;
        this._releaseAll();
        this.onNotice("Kol ayrıldı — klavye ve fare geri devrede", "");
      }
      return;
    }
    if (!this.connected || this.index !== pad.index) {
      this.connected = true;
      this.index = pad.index;
      this.id = pad.id || "gamepad";
      this.onNotice(`${shortName(this.id)} bağlandı — sol çubuk yürür, sağ çubuk bakar`, "good");
    }

    const world = this.world;
    if (!world) return;
    world.padKeys = world.padKeys || new Set();

    // ── sol çubuk: hareket ──────────────────────────────────────────────
    const mx = dead(pad.axes[0] || 0);
    const my = dead(pad.axes[1] || 0);
    setHeld(world.padKeys, "w", my < -DEADZONE);
    setHeld(world.padKeys, "s", my > DEADZONE);
    setHeld(world.padKeys, "a", mx < -DEADZONE);
    setHeld(world.padKeys, "d", mx > DEADZONE);

    // ── sağ çubuk: bakış ────────────────────────────────────────────────
    const lx = dead(pad.axes[2] || 0);
    const ly = dead(pad.axes[3] || 0);
    const look = this.world.settings?.invertLook ? -1 : 1;
    if (lx || ly) {
      world.yaw -= lx * LOOK_SPEED * look * dt;
      if (world.firstPerson) {
        world.viewPitch = clamp(world.viewPitch + ly * PITCH_SPEED * dt, -1.1, 1.1);
      } else {
        world.pitch = clamp(world.pitch + ly * PITCH_SPEED * dt, -0.18, 0.95);
      }
    }

    // ── tetikler: R2 koş/gaz, L2 el freni ───────────────────────────────
    const r2 = trigger(pad, 7);
    const l2 = trigger(pad, 6);
    setHeld(world.padKeys, "shift", r2 > 0.35);
    setHeld(world.padKeys, " ", l2 > 0.35);

    // ── düğmeler ────────────────────────────────────────────────────────
    const pressed = (i) => {
      const button = pad.buttons[i];
      const now = Boolean(button?.pressed);
      const before = Boolean(this._prevButtons[i]);
      this._prevButtons[i] = now;
      return now && !before;
    };

    if (pressed(0)) world.interact();            // ✕ / A — bin, in, konuş
    if (pressed(1)) this.onPause();              // ○ / B — geri / duraklat
    if (pressed(2)) world.toggleWeapon();        // □ / X — silah
    if (pressed(3)) world.toggleView();          // △ / Y — bakış modu
    if (pressed(4)) this.onMap();                // L1 — harita
    if (pressed(5)) this.onInventory();          // R1 — envanter
    if (pressed(8)) this.onTvMode();             // Share / Select — TV modu
    if (pressed(9)) this.onPause();              // Options / Start — menü
    if (pressed(12)) world.toggleView();         // D-pad yukarı — bakış
    if (pressed(13)) this.onSheet();             // D-pad aşağı — karakter
  }

  _releaseAll() {
    const keys = this.world?.padKeys;
    if (keys) {
      for (const key of ["w", "a", "s", "d", "shift", " "]) keys.delete(key);
    }
    this._prevButtons = [];
  }
}

function dead(value) {
  return Math.abs(value) < DEADZONE ? 0 : value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setHeld(set, key, active) {
  if (!set) return;
  if (active) set.add(key);
  else set.delete(key);
}

function trigger(pad, index) {
  const button = pad.buttons[index];
  if (!button) return 0;
  return typeof button.value === "number" ? button.value : (button.pressed ? 1 : 0);
}

/** "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c…)" → "DualSense" */
export function shortName(id = "") {
  const clean = id.replace(/\(.*?\)/g, "").trim();
  if (/dualsense/i.test(clean)) return "DualSense";
  if (/dualshock|wireless controller/i.test(clean)) return "DualShock";
  if (/xbox/i.test(clean)) return "Xbox kolu";
  if (/switch|joy-con|pro controller/i.test(clean)) return "Switch Pro";
  return clean.split(/\s+/).slice(0, 2).join(" ") || "Kol";
}
