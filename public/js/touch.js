// touch.js — on-screen controls for phones and tablets.
//
// Nothing in the simulation changes: the joystick presses the same keys the
// keyboard would (world.touchKeys). Drag-to-look needs no code here — the
// world already turns on a canvas drag, and on touch it simply never grabs the
// pointer lock. The layer is only built while mobile mode is active, so a
// desktop session never pays for it.

const DEADZONE = 0.26;   // stick deflection before a key is pressed
const RUN_AT = 0.82;     // stick deflection that counts as running

const ACTIONS = [
  { act: "interact", glyph: "✋", label: "Interact (E)" },
  { act: "attack", glyph: "⚔", label: "Strike" },
  { act: "inventory", glyph: "🎒", label: "Loadout (I)" },
  { act: "weapon", glyph: "🗡", label: "Draw or sheathe (R)" },
  { act: "view", glyph: "👁", label: "First person (V)" },
  { act: "map", glyph: "🗺", label: "Road map (M)" },
  { act: "chat", glyph: "💬", label: "Chat" },
  { act: "pause", glyph: "⏸", label: "Pause" },
];

export class TouchControls {
  constructor(world, handlers = {}) {
    this.world = world;
    this.canvas = world.canvas;
    this.handlers = handlers;
    this.running = false;
    this.root = null;
    this.stick = null;
    this.knob = null;
    this.hint = null;
    this.stickPointer = null;
    this.hintTimer = null;

    this._onStickDown = this._onStickDown.bind(this);
    this._onStickMove = this._onStickMove.bind(this);
    this._onStickUp = this._onStickUp.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._build();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = null;
    this._releaseStick();
    this.root?.remove();
    this.root = null;
    this.stick = null;
    this.knob = null;
    this.world.touchKeys?.clear();
  }

  // ── build ────────────────────────────────────────────────────────────
  _build() {
    this.root?.remove();
    const root = document.createElement("div");
    root.className = "touch-layer";
    root.id = "touch-layer";

    const stick = document.createElement("div");
    stick.className = "touch-stick";
    stick.setAttribute("role", "group");
    stick.setAttribute("aria-label", "Movement joystick");
    const ring = document.createElement("span");
    ring.className = "touch-stick-ring";
    const knob = document.createElement("span");
    knob.className = "touch-stick-knob";
    stick.append(ring, knob);

    const actions = document.createElement("div");
    actions.className = "touch-actions";
    for (const { act, glyph, label } of ACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.act = act;
      button.className = `touch-btn touch-btn-${act}`;
      button.textContent = glyph;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._act(act);
      });
      actions.append(button);
    }

    const hint = document.createElement("div");
    hint.className = "touch-hint";
    hint.textContent = "Sol: yürü · Sağ: bak · ✋ etkileşim";

    root.append(stick, actions, hint);
    (document.getElementById("game") || document.body).append(root);

    stick.addEventListener("pointerdown", this._onStickDown, { passive: false });
    stick.addEventListener("pointermove", this._onStickMove, { passive: false });
    stick.addEventListener("pointerup", this._onStickUp);
    stick.addEventListener("pointercancel", this._onStickUp);

    this.root = root;
    this.stick = stick;
    this.knob = knob;
    this.hint = hint;
    this.hintTimer = setTimeout(() => hint.classList.add("faded"), 7000);
  }

  _act(act) {
    const handler = this.handlers[`on${act[0].toUpperCase()}${act.slice(1)}`];
    if (typeof handler === "function") {
      handler();
      return;
    }
    const world = this.world;
    if (!world) return;
    if (act === "interact") world.interact();
    else if (act === "view") world.toggleView();
    else if (act === "weapon") world.toggleWeapon();
    else if (act === "attack") world.attack();
    else if (act === "inventory") world.onNotice?.("Open the loadout from the bag button", "");
  }

  // ── joystick ─────────────────────────────────────────────────────────
  _onStickDown(event) {
    if (!this.running) return;
    event.preventDefault();
    this.stickPointer = event.pointerId;
    try {
      this.stick.setPointerCapture(event.pointerId);
    } catch {
      /* capture is a nicety, not a requirement */
    }
    this._trackStick(event);
  }

  _onStickMove(event) {
    if (this.stickPointer !== event.pointerId) return;
    event.preventDefault();
    this._trackStick(event);
  }

  _onStickUp(event) {
    if (this.stickPointer !== event.pointerId) return;
    this._releaseStick();
  }

  _trackStick(event) {
    const box = this.stick.getBoundingClientRect();
    const radius = Math.max(24, box.width * 0.36);
    let dx = event.clientX - (box.left + box.width / 2);
    let dy = event.clientY - (box.top + box.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    this.knob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
    const nx = dx / radius;
    const ny = dy / radius;
    this._setKeys(nx, ny);
    this.hint?.classList.add("faded");
  }

  _releaseStick() {
    this.stickPointer = null;
    if (this.knob) this.knob.style.transform = "translate(-50%, -50%)";
    this.world?.touchKeys?.clear();
  }

  _setKeys(x, y) {
    const world = this.world;
    if (!world) return;
    const keys = world.touchKeys || (world.touchKeys = new Set());
    keys.clear();
    const magnitude = Math.hypot(x, y);
    if (magnitude < DEADZONE) return;
    if (y < -DEADZONE) keys.add("w");
    if (y > DEADZONE) keys.add("s");
    if (x < -DEADZONE) keys.add("a");
    if (x > DEADZONE) keys.add("d");
    if (magnitude > RUN_AT) keys.add("shift");
  }
}
