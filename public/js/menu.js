// Aetherhold — main menu controller.

import {
  ACCENTS, BUILDS, CHARACTER_PRESETS, CLASSES, CLOAK_COLORS, DETAILS, EYE_COLORS, FACE_SHAPES,
  GRAPHICS_PRESETS, HAIR_COLORS, HAIR_STYLES, NOSES, SKIN_TONES,
  STAT_KEYS, STAT_LABELS, STAT_MAX, STAT_MIN, STAT_BUDGET, THEMES, applyPreset, character,
  characterPayload, DEFAULT_SETTINGS, enterFullscreen, isMobileControlMode, randomCharacter,
  rememberServer, saveCharacter, saveSettings, serverBaseFromQuery, settings, statsLeft,
  toggleFullscreen,
} from "./store.js";
import { GameClient, normalizeBase } from "./net.js";
import { AuthUI, account, forget, onAccount, pushDriver, resume, signOut, syncDriver } from "./auth.js";
import { language, mountLanguagePicker, onLanguage, t, translateDom } from "./i18n.js";
import { AvatarPreview } from "./preview3d.js";

const $ = (id) => document.getElementById(id);

export class MenuUI {
  constructor({ audio, onEnter, onSettings }) {
    this.audio = audio;
    this.onEnter = onEnter;
    this.onSettings = onSettings;
    this.client = new GameClient(serverBaseFromQuery());
    this.rooms = [];
    this.theme = "ember";
    this.connected = false;
    this.busy = false;
    this.stats = { ...character.stats };
    this.draft = { ...character, stats: this.stats };
    this.fps = 60;
    this.tickerIndex = 0;
    this._toastStack = null;
    this._initToasts();
    this._bindPanels();
    this._initCharacter();
    this.avatarPreview = new AvatarPreview($("avatar-preview"));
    this._initSettings();
    this._initJoin();
    this._initHost();
    this._initCodex();
    this._initMisc();
    this._initAccount();
    this.applyCharacter();
    this.applySettings();
    mountLanguagePicker();
    onLanguage(() => this._onLanguage());
    this.refreshRooms();
  }

  // ── accounts ────────────────────────────────────────────────────────
  // One overlay handles both sign-in and sign-up; it is also the gate in
  // front of every room entry, because the host owns the driver's progress.
  _initAccount() {
    this.auth = new AuthUI({
      audio: this.audio,
      getBase: () => this.client?.base || "",
      onNotice: (text, kind) => this.toast(text, kind),
      // A driver is only meaningful once the host knows the account, so the
      // sheet is adopted the moment sign-in succeeds.
      onSignedIn: () => this.adoptDriver(),
    });
    this.auth.bind();
    $("account-chip")?.addEventListener("click", () => {
      if (account.ready) {
        this.signOut();
        return;
      }
      this.auth.open({ reason: "" });
      this.audio?.click?.();
    });
    onAccount(() => this.auth.paintChip());
    this.auth.paintChip();
  }

  /** Ask the host whether the remembered session is still good. */
  async restoreAccount() {
    if (!this.client?.base) return account;
    await resume(this.client.base);
    this.auth.paintChip();
    if (account.ready) await this.adoptDriver();
    return account;
  }

  /** Pull the account's driver sheet, or upload the one built here. */
  async adoptDriver() {
    if (!account.ready) return;
    const origin = await syncDriver(this.client?.base || "");
    if (origin === "server") this.applyCharacter();
  }

  async requireAccount(reason = "") {
    if (!this.connected) await this.connectToServer(this.client.base, true);
    if (!account.ready) await resume(this.client.base);
    const ok = await this.auth.require(reason || t("auth.gate"));
    this.auth.paintChip();
    return ok;
  }

  async signOut() {
    if (!account.ready) return;
    const name = account.username;
    await signOut(this.client?.base || account.base);
    this.auth.paintChip();
    this.toast(`${name} — ${t("auth.signedOut")}`);
  }

  // ── toasts ───────────────────────────────────────────────────────────
  _initToasts() {
    const stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.style.cssText = "position:fixed;right:22px;bottom:70px;z-index:60;";
    document.body.appendChild(stack);
    this._toastStack = stack;
  }

  toast(message, kind = "") {
    if (!this._toastStack) return;
    const node = document.createElement("div");
    node.className = `toast ${kind}`;
    node.textContent = message;
    this._toastStack.appendChild(node);
    setTimeout(() => {
      node.classList.add("leaving");
      setTimeout(() => node.remove(), 320);
    }, 3800);
    while (this._toastStack.children.length > 4) this._toastStack.firstElementChild.remove();
  }

  // ── panels ───────────────────────────────────────────────────────────
  _bindPanels() {
    document.querySelectorAll(".rail-btn").forEach((btn) => {
      btn.addEventListener("mouseenter", () => this.audio.hover());
      btn.addEventListener("click", () => this.switchPanel(btn.dataset.panel));
    });
    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => this.switchPanel(btn.dataset.goto));
    });
  }

  switchPanel(name) {
    if (!name || name === this._panel) return;
    this._panel = name;
    this.audio.click();
    document.querySelectorAll(".rail-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.panel === name);
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === name);
    });
    const panel = document.querySelector(`.panel[data-panel="${name}"]`);
    if (panel) panel.scrollTop = 0;
    if (["enter", "join", "host"].includes(name)) this.refreshRooms();
    if (name === "host") this._updateHostFacts();
    if (name === "codex") this.loadCodex();
  }

  get panel() {
    return this._panel || "enter";
  }

  // ── helpers ──────────────────────────────────────────────────────────
  paintPortrait(element, appearance) {
    if (!element) return;
    element.style.setProperty("--swatch", appearance.color || "#8fb8ff");
    element.style.setProperty("--accent", appearance.accent || "#f0abfc");
    element.style.setProperty("--skin", appearance.skin || "#e8c3a0");
    element.style.setProperty("--hair", appearance.hair || "#3a2a22");
    const body = element.querySelector(".portrait-body");
    if (body) {
      body.style.background =
        `radial-gradient(circle at 50% 22%, ${shade(appearance.color, 0.35)}, ${appearance.color} 62%, #0a0a14 130%)`;
      body.style.boxShadow = `0 0 26px -6px ${appearance.color}`;
    }
  }

  renderStatBars(container, stats, compact = false) {
    if (!container) return;
    container.innerHTML = "";
    for (const key of STAT_KEYS) {
      const value = Number(stats[key]) || 0;
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `<span>${STAT_LABELS[key]}</span>` +
        `<div class="track"><i style="width:${Math.min(100, (value / STAT_MAX) * 100)}%"></i></div>` +
        `<b>${value}</b>`;
      container.appendChild(row);
    }
    container.classList.toggle("compact", compact);
  }

  // ── character ────────────────────────────────────────────────────────
  _initCharacter() {
    this._buildSwatches();
    this._renderPresets();
    this._bindClassPicker();
    this._renderStatEditor();

    const textFields = {
      "char-name": ["name", 22],
      "char-pronouns": ["pronouns", 24],
      "char-occupation": ["occupation", 60],
      "char-origin": ["origin", 80],
      "char-appearance": ["appearance", 260],
      "char-weakness": ["weakness", 180],
      "char-fear": ["fear", 180],
      "char-dream": ["dream", 180],
      "char-backstory": ["backstory", 700],
    };
    Object.entries(textFields).forEach(([id, [key, limit]]) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => {
        this.draft[key] = String(el.value).slice(0, limit);
        this._refreshCharacterPreview();
      });
    });
    $("char-age")?.addEventListener("input", () => {
      const value = Number($("char-age").value);
      this.draft.age = Number.isFinite(value) ? Math.max(0, Math.min(300, Math.round(value))) : 0;
      this._refreshCharacterPreview();
    });

    $("char-random")?.addEventListener("click", () => {
      const rolled = randomCharacter();
      this.draft = { ...rolled, stats: { ...rolled.stats } };
      this.stats = this.draft.stats;
      this.audio.dice();
      this._refreshCharacterPreview(true);
      this.toast(`${rolled.name} — ${rolled.occupation} of ${rolled.origin.split(" — ")[0]}`, "good");
    });
    $("char-reset")?.addEventListener("click", () => {
      this.draft = { ...character, stats: { ...character.stats } };
      this.stats = this.draft.stats;
      this.audio.click();
      this._refreshCharacterPreview(true);
    });
    $("char-save")?.addEventListener("click", () => {
      this._saveCharacter();
      this.toast("Wanderer saved — this history travels with you", "good");
    });
  }

  _buildSwatches() {
    this._swatchRow("color-row", CLOAK_COLORS, "color", "data-color");
    this._swatchRow("accent-row", ACCENTS, "accent", "data-accent");
    this._swatchRow("skin-row", SKIN_TONES, "skin", "data-skin");
    this._swatchRow("hair-row", HAIR_COLORS, "hair", "data-hair");
    this._swatchRow("eye-row", EYE_COLORS, "eyeColor", "data-eye");
    this._segRow("hairstyle-row", HAIR_STYLES, "hairStyle", "data-hairstyle");
    this._segRow("build-row", BUILDS, "build", "data-build");
    this._segRow("face-row", FACE_SHAPES, "face", "data-face");
    this._segRow("nose-row", NOSES, "nose", "data-nose");
    this._segRow("detail-row", DETAILS, "detail", "data-detail", (value) => t(`char.detail.${value}`));
  }

  _renderPresets() {
    const row = $("preset-row");
    if (!row) return;
    row.innerHTML = "";
    CHARACTER_PRESETS.forEach((preset) => {
      const copy = preset[language] || preset.en;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-opt";
      button.dataset.preset = preset.id;
      button.innerHTML = `<strong>${escapeHtml(copy.title)}</strong>
        <em>${escapeHtml(copy.blurb)}</em>
        <span class="preset-cls">${escapeHtml(preset.cls)} · ${preset.age}</span>`;
      button.addEventListener("click", () => {
        const rolled = applyPreset(preset.id);
        if (!rolled) return;
        this.draft = { ...rolled, stats: { ...rolled.stats } };
        this.stats = this.draft.stats;
        this.audio.chime();
        this._refreshCharacterPreview(true);
        this.toast(`${rolled.name} — ${rolled.occupation}`, "good");
      });
      row.appendChild(button);
    });
    this._syncActiveStates();
  }

  _onLanguage() {
    translateDom();
    this._buildSwatches();
    this._renderPresets();
    this._refreshCharacterPreview(false);
    this.avatarPreview?.setCharacter({ ...this.draft });
    this.toast(language === "tr" ? "Dil Türkçe olarak ayarlandı" : "Language set to English", "good");
  }

  _swatchRow(containerId, colors, key, attribute) {
    const row = $(containerId);
    if (!row) return;
    row.innerHTML = "";
    colors.forEach((color) => {
      const button = document.createElement("button");
      button.className = "swatch-dot";
      button.style.background = color;
      button.setAttribute(attribute, color);
      button.title = color;
      button.addEventListener("click", () => {
        this.draft[key] = color;
        this.audio.hover();
        this._refreshCharacterPreview(true);
      });
      row.appendChild(button);
    });
  }

  _segRow(containerId, values, key, attribute, labelFor = null) {
    const row = $(containerId);
    if (!row) return;
    row.innerHTML = "";
    values.forEach((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = labelFor ? labelFor(value) : value;
      button.setAttribute(attribute, value);
      button.addEventListener("click", () => {
        this.draft[key] = value;
        this.audio.hover();
        this._refreshCharacterPreview(true);
      });
      row.appendChild(button);
    });
  }

  _bindClassPicker() {
    document.querySelectorAll(".class-opt").forEach((button) => {
      button.addEventListener("click", () => {
        this.draft.cls = button.dataset.cls;
        this.audio.click();
        this._refreshCharacterPreview(true);
      });
    });
  }

  _renderStatEditor() {
    const editor = $("stat-editor");
    if (!editor) return;
    editor.innerHTML = "";
    const left = statsLeft(this.stats);
    for (const key of STAT_KEYS) {
      const value = this.stats[key];
      const line = document.createElement("div");
      line.className = "stat-line";
      line.innerHTML = `<span>${STAT_LABELS[key]}</span>
        <div class="bar"><i style="width:${(value / STAT_MAX) * 100}%"></i></div>
        <div class="steppers">
          <button data-act="minus" aria-label="Lower ${key}">−</button>
          <b>${value}</b>
          <button data-act="plus" aria-label="Raise ${key}">+</button>
        </div>`;
      line.querySelector('[data-act="minus"]').disabled = value <= STAT_MIN;
      line.querySelector('[data-act="plus"]').disabled = left <= 0 || value >= STAT_MAX;
      line.querySelector('[data-act="minus"]').addEventListener("click", () => {
        if (this.stats[key] > STAT_MIN) { this.stats[key] -= 1; this.audio.hover(); this._refreshCharacterPreview(); }
      });
      line.querySelector('[data-act="plus"]').addEventListener("click", () => {
        if (statsLeft(this.stats) > 0 && this.stats[key] < STAT_MAX) {
          this.stats[key] += 1; this.audio.hover(); this._refreshCharacterPreview();
        }
      });
      editor.appendChild(line);
    }
    const points = $("points-left");
    if (points) points.textContent = String(Math.max(0, left));
  }

  _syncForm() {
    const fields = {
      "char-name": this.draft.name,
      "char-age": this.draft.age || "",
      "char-pronouns": this.draft.pronouns,
      "char-occupation": this.draft.occupation,
      "char-origin": this.draft.origin,
      "char-appearance": this.draft.appearance,
      "char-weakness": this.draft.weakness,
      "char-fear": this.draft.fear,
      "char-dream": this.draft.dream,
      "char-backstory": this.draft.backstory,
    };
    Object.entries(fields).forEach(([id, value]) => {
      const el = $(id);
      if (el && el.value !== String(value ?? "")) el.value = value ?? "";
    });
    this._syncActiveStates();
    this._renderStatEditor();
  }

  _syncActiveStates() {
    const mark = (selector, attribute, expected) => {
      document.querySelectorAll(selector).forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute(attribute) === expected);
      });
    };
    mark(".class-opt", "data-cls", this.draft.cls);
    mark("[data-color]", "data-color", this.draft.color);
    mark("[data-accent]", "data-accent", this.draft.accent);
    mark("[data-skin]", "data-skin", this.draft.skin);
    mark("[data-hair]", "data-hair", this.draft.hair);
    mark("[data-hairstyle]", "data-hairstyle", this.draft.hairStyle);
    mark("[data-build]", "data-build", this.draft.build);
    mark("[data-eye]", "data-eye", this.draft.eyeColor);
    mark("[data-face]", "data-face", this.draft.face);
    mark("[data-nose]", "data-nose", this.draft.nose);
    mark("[data-detail]", "data-detail", this.draft.detail);
    document.querySelectorAll(".preset-opt").forEach((button) => {
      button.classList.toggle("active", button.dataset.preset === this.draft.preset);
    });
  }

  _renderIdentity() {
    const list = $("preview-identity");
    if (!list) return;
    const rows = [
      ["Age", this.draft.age ? `${this.draft.age}` : "—"],
      ["Trade", this.draft.occupation],
      ["Origin", this.draft.origin],
      ["Weakness", this.draft.weakness],
      ["Fear", this.draft.fear],
      ["Dream", this.draft.dream],
    ].filter(([, value]) => value);
    list.innerHTML = rows.map(([label, value]) =>
      `<li><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></li>`).join("");
  }

  _refreshCharacterPreview(full = false) {
    if (full) this._syncForm();
    const label = (this.draft.name || "").trim() || "Unnamed Wanderer";
    const previewName = $("preview-name");
    if (previewName) previewName.textContent = label;
    const previewClass = $("preview-class");
    if (previewClass) previewClass.textContent = `${CLASSES[this.draft.cls]?.icon || "✦"} ${this.draft.cls}`;
    this.paintPortrait($("big-portrait"), this.draft);
    this.avatarPreview?.setCharacter({ ...this.draft, name: label });
    this._renderIdentity();
    this.renderStatBars($("preview-stats"), this.stats);
    const points = $("points-left");
    if (points) points.textContent = String(Math.max(0, statsLeft(this.stats)));
    this._updateEnterCard();
  }

  _saveCharacter() {
    const name = (this.draft.name || "").trim() || "Wanderer";
    saveCharacter({
      name,
      age: Number(this.draft.age) || 0,
      pronouns: this.draft.pronouns || "",
      occupation: this.draft.occupation || "",
      origin: this.draft.origin || "",
      appearance: this.draft.appearance || "",
      weakness: this.draft.weakness || "",
      fear: this.draft.fear || "",
      dream: this.draft.dream || "",
      backstory: this.draft.backstory || "",
      cls: this.draft.cls,
      color: this.draft.color,
      accent: this.draft.accent,
      skin: this.draft.skin,
      hair: this.draft.hair,
      hairStyle: this.draft.hairStyle,
      build: this.draft.build,
      eyeColor: this.draft.eyeColor,
      face: this.draft.face,
      nose: this.draft.nose,
      detail: this.draft.detail,
      preset: this.draft.preset || "",
      stats: { ...this.stats },
    });
    this.draft.name = character.name;
    this.applyCharacter();
    // Keep the account's copy current; a dead host must not block the editor.
    if (account.ready) pushDriver(this.client?.base || "");
  }

  applyCharacter() {
    this.draft = { ...character, stats: { ...character.stats } };
    this.stats = this.draft.stats;
    this._syncForm();
    this._refreshCharacterPreview(false);
    const enterName = $("enter-name");
    if (enterName) enterName.textContent = character.name;
    const enterClass = $("enter-class");
    if (enterClass) {
      enterClass.textContent = `${CLASSES[character.cls]?.icon || "✦"} ${character.cls}` +
        (character.occupation ? ` · ${character.occupation}` : "");
    }
    this.paintPortrait($("enter-portrait"), character);
    this.renderStatBars($("enter-stats"), character.stats);
    if (this.onSettings) this.onSettings({ character });
  }

  _updateEnterCard() {
    const enterName = $("enter-name");
    if (enterName) enterName.textContent = (this.draft.name || "").trim() || "Unnamed Wanderer";
    const enterClass = $("enter-class");
    if (enterClass) {
      enterClass.textContent = `${CLASSES[this.draft.cls]?.icon || "✦"} ${this.draft.cls}` +
        (this.draft.occupation ? ` · ${this.draft.occupation}` : "");
    }
    this.paintPortrait($("enter-portrait"), this.draft);
    this.renderStatBars($("enter-stats"), this.stats);
  }

  // ── settings ─────────────────────────────────────────────────────────
  _initSettings() {
    const seg = $("quality-seg");
    seg?.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        const quality = button.dataset.quality;
        const preset = GRAPHICS_PRESETS[quality];
        const patch = { quality };
        if (preset) Object.assign(patch, { scale: preset.scale, fov: preset.fov, shadows: preset.shadows });
        this._patchSettings(patch);
        this.applySettings();
        this.toast(preset ? `${preset.label} graphics · ${preset.scale}% render scale` : quality, "good");
      });
    });
    const modeSeg = $("control-mode-seg");
    modeSeg?.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        this._patchSettings({ controlMode: mode });
        this.toast(`${t("settings.mode")}: ${t(`settings.mode.${mode}`)}`, "good");
      });
    });
    this._bindSlider("set-scale", "scale", (v) => `${v}%`);
    this._bindSlider("set-fov", "fov", (v) => `${v}°`);
    this._bindSlider("set-master", "master", (v) => `${v}%`);
    this._bindSlider("set-ambience", "ambience", (v) => `${v}%`);
    this._bindSlider("set-music", "music", (v) => `${v}%`);
    this._bindSlider("set-sens", "sensitivity", (v) => `${(v / 100).toFixed(1)}×`);
    ["set-nameplates:nameplates", "set-shadows:shadows", "set-shake:shake", "set-sfx:sfx", "set-tv:tv"].forEach((pair) => {
      const [id, key] = pair.split(":");
      const input = $(id);
      input?.addEventListener("change", () => {
        this._patchSettings({ [key]: input.checked });
      });
    });

    $("settings-fullscreen")?.addEventListener("click", () => {
      const entered = toggleFullscreen();
      this.toast(entered ? "Fullscreen — F to leave" : "Windowed");
    });

    $("settings-reset")?.addEventListener("click", () => {
      Object.assign(settings, DEFAULT_SETTINGS);
      saveSettings(DEFAULT_SETTINGS);
      this.applySettings();
      this.toast("Settings restored to defaults", "good");
    });

    $("mute-btn")?.addEventListener("click", () => {
      this._patchSettings({ muted: !settings.muted });
      this.toast(settings.muted ? "Audio muted" : "Audio restored");
    });
  }

  _bindSlider(id, key, format) {
    const input = $(id);
    const output = $(`${id}-value`);
    if (!input) return;
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (output) output.textContent = format(value);
      this._patchSettings({ [key]: value });
    });
  }

  _patchSettings(patch) {
    saveSettings(patch);
    this.applySettings();
  }

  applySettings() {
    const seg = $("quality-seg");
    seg?.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.quality === settings.quality);
    });
    const mode = settings.controlMode || "auto";
    $("control-mode-seg")?.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    // Same switch main.js uses; the stylesheet keys every touch rule off it.
    // applySettings() ends by telling main, which mounts or drops the layer.
    document.body.classList.toggle("mobile-mode", isMobileControlMode());
    const sync = (id, value, format) => {
      const input = $(id);
      if (input) input.value = value;
      const output = $(`${id}-value`);
      if (output) output.textContent = format(value);
    };
    sync("set-scale", settings.scale, (v) => `${v}%`);
    sync("set-fov", settings.fov, (v) => `${v}°`);
    sync("set-master", settings.master, (v) => `${v}%`);
    sync("set-ambience", settings.ambience, (v) => `${v}%`);
    sync("set-music", Number(settings.music) || 55, (v) => `${v}%`);
    sync("set-sens", settings.sensitivity, (v) => `${(v / 100).toFixed(1)}×`);

    const checks = {
      "set-nameplates": settings.nameplates,
      "set-shadows": settings.shadows,
      "set-shake": settings.shake,
      "set-sfx": settings.sfx,
      "set-tv": settings.tv,
    };
    // TV mode is one class on <body>; the stylesheet does the rest.
    document.body.classList.toggle("tv-mode", Boolean(settings.tv));
    Object.entries(checks).forEach(([id, value]) => {
      const input = $(id);
      if (input) input.checked = Boolean(value);
    });
    const mute = $("mute-btn");
    if (mute) mute.textContent = settings.muted ? "🔇" : "🔊";
    this.audio.applySettings(settings);
    if (this.onSettings) this.onSettings({ settings });
  }

  // ── join & rooms ─────────────────────────────────────────────────────
  _initJoin() {
    const input = $("join-server");
    if (input) input.value = this.client.base;
    $("join-connect")?.addEventListener("click", () => this.connectToServer(input?.value));
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.connectToServer(input.value);
    });
    $("join-refresh")?.addEventListener("click", () => this.refreshRooms(true));
    $("featured-refresh")?.addEventListener("click", () => this.refreshRooms(true));
    $("join-show-locked")?.addEventListener("change", () => this.renderRooms(this.rooms));
    $("join-new-room")?.addEventListener("click", () => this.switchPanel("host"));
    $("join-by-code")?.addEventListener("click", () => {
      const code = ($("join-code")?.value || "").trim().toUpperCase();
      if (!code) { this.toast("Enter a room code first"); return; }
      this.joinRoom(code);
    });
    $("quick-play")?.addEventListener("click", () => this.quickPlay());
    $("enter-ping")?.addEventListener("click", () => this.testConnection(true));
  }

  async connectToServer(rawUrl, silent = false) {
    const base = normalizeBase(rawUrl || this.client.base);
    if (!base) { this.toast("Enter a host address", "bad"); return false; }
    const candidate = new GameClient(base);
    if (!silent) this._setStatus("connecting…");
    try {
      const health = await candidate.health();
      this.client = candidate;
      rememberServer(base);
      this.connected = true;
      const input = $("join-server");
      if (input) input.value = base;
      if (!silent) this.toast(`Connected to ${health.app || "the realm"} v${health.version || "?"}`, "good");
      this._setStatus(`online · ${health.rooms ?? 0} rooms`);
      this._paintServerState(true);
      this._updateHostFacts();
      this.audio.chime();
      await this.refreshRooms(true);
      return true;
    } catch (error) {
      this.connected = false;
      this._paintServerState(false);
      this._setStatus("offline");
      if (!silent) {
        this.toast(error.message, "bad");
        this.audio.error();
      }
      return false;
    }
  }

  async testConnection(loud = false) {
    const ok = await this.connectToServer(this.client.base, !loud);
    if (ok) {
      if (loud) this.toast("The realm answers", "good");
    } else if (loud) {
      this.toast("No answer from that host", "bad");
    }
    return ok;
  }

  _setStatus(text) {
    const status = $("join-status");
    if (status) status.textContent = text;
  }

  _paintServerState(online) {
    const dot = $("enter-dot");
    if (dot) dot.className = `dot ${online ? "on" : "off"}`;
    const label = $("enter-server");
    if (label) label.textContent = online ? `${this.client.base} · online` : `${this.client.base} · unreachable`;
    const footDot = $("foot-dot");
    if (footDot) footDot.className = `dot ${online ? "on" : "off"}`;
    const foot = $("foot-server");
    if (foot) foot.textContent = this.client.base.replace(/^https?:\/\//, "");
  }

  async refreshRooms(loud = false) {
    if (!this.client?.base) return;
    try {
      const rooms = await this.client.rooms();
      this.rooms = rooms;
      this.connected = true;
      this._paintServerState(true);
      this.renderRooms(rooms);
      const count = $("featured-count");
      if (count) count.textContent = rooms.length ? `${rooms.length} hall${rooms.length === 1 ? "" : "s"} open` : "no halls open";
      const footRooms = $("foot-rooms");
      if (footRooms) footRooms.textContent = `${rooms.length} room${rooms.length === 1 ? "" : "s"}`;
      const hostRooms = $("host-rooms");
      if (hostRooms) hostRooms.textContent = String(rooms.length);
      this._setStatus(`online · refreshed ${new Date().toLocaleTimeString()}`);
      if (loud) {
        this.toast(rooms.length ? `Found ${rooms.length} open hall${rooms.length === 1 ? "" : "s"}` : "No halls yet — open one!", rooms.length ? "good" : "");
        this.audio.click();
      }
    } catch (error) {
      this.connected = false;
      this._paintServerState(false);
      this._setStatus("offline");
      this.renderRooms([]);
      if (loud) this.toast(error.message, "bad");
    }
  }

  renderRooms(rooms) {
    const showLocked = $("join-show-locked")?.checked ?? true;
    const visible = rooms.filter((room) => showLocked || !room.locked);
    const featured = visible.filter((room) => !room.locked).slice(0, 3);
    this._paintRoomList($("featured-rooms"), visible.length ? visible.slice(0, 4) : rooms.length ? featured : []);
    this._paintRoomList($("join-rooms"), visible);

    const featuredEl = $("featured-rooms");
    if (featuredEl && featuredEl.childElementCount === 0) {
      featuredEl.innerHTML = `<div class="list-empty">${this.connected
        ? "No open halls yet.<br />Open one from the Host tab."
        : "Cannot reach the host.<br />Check the address in Join Server."}</div>`;
    }
    const joinEl = $("join-rooms");
    if (joinEl && joinEl.childElementCount === 0) {
      joinEl.innerHTML = `<div class="list-empty">${this.connected
        ? "No rooms match. Create one from the Host tab."
        : "Connect to a host to see its rooms."}</div>`;
    }
  }

  _paintRoomList(container, rooms) {
    if (!container) return;
    container.innerHTML = "";
    for (const room of rooms) {
      const row = document.createElement("button");
      row.className = "room-row";
      const full = room.players >= room.maxPlayers;
      row.innerHTML = `<span>
          <strong>${escapeHtml(room.name)}</strong>
          <em><span class="theme-tag">${THEMES[room.theme]?.name || room.theme}</span> ·
              code <b style="color:var(--gold);letter-spacing:.16em">${room.code}</b>
              ${room.locked ? '<span class="lock">· 🔒</span>' : ""}
              ${full ? "· full" : ""}</em>
        </span>
        <span class="room-count">${room.players}/${room.maxPlayers}</span>`;
      row.disabled = full;
      if (row.disabled) row.classList.add("dead");
      row.addEventListener("mouseenter", () => this.audio.hover());
      row.addEventListener("click", () => this.joinRoom(room.code));
      container.appendChild(row);
    }
  }

  async joinRoom(code, password = "") {
    if (this.busy) return;
    if (!(await this.requireAccount())) return;
    // Fullscreen needs the click's user gesture, so ask before the network call.
    enterFullscreen();
    this.busy = true;
    this.audio.click();
    try {
      if (!this.connected && !(await this.testConnection())) return;
      const pass = password || $("join-password")?.value || "";
      this.toast(`Knocking on ${code}…`);
      const data = await this.client.join(code, {
        password: pass, player: characterPayload(), session: account.token,
      });
      this._enterRoom(data);
    } catch (error) {
      this.toast(error.message, "bad");
      this.audio.error();
      if (error.status === 401) {
        forget();
        this.auth.paintChip();
        this.auth.open({ reason: error.message });
      }
    } finally {
      this.busy = false;
    }
  }

  _enterRoom(data) {
    // Music starts when the room is actually entered so the user hears it
    // from the first moment they are in the world.
    this.audio.enter();
    this.audio.startMusic();
    this.audio.startAmbience();
    const themeKey = data.room?.theme || "ember";
    const theme = $("hud-room-theme");
    if (theme) theme.textContent = THEMES[themeKey]?.name || themeKey;
    if (this.onEnter) this.onEnter(this.client, data);
  }

  // ── hosting ──────────────────────────────────────────────────────────
  _initHost() {
    document.querySelectorAll(".theme-opt").forEach((button) => {
      button.addEventListener("click", () => {
        this.theme = button.dataset.theme;
        document.querySelectorAll(".theme-opt").forEach((b) => b.classList.toggle("active", b === button));
        this.audio.click();
      });
    });
    const maxSlider = $("host-max");
    maxSlider?.addEventListener("input", () => {
      const value = $("host-max-value");
      if (value) value.textContent = maxSlider.value;
    });
    $("host-create")?.addEventListener("click", () => {
      this.createRoom({
        name: $("host-name")?.value || "The Wanderer's Rest",
        maxPlayers: Number(maxSlider?.value || 16),
        password: $("host-password")?.value || "",
        theme: this.theme,
      });
    });
    $("copy-command")?.addEventListener("click", () => this._copy("host-command", $("copy-command")));
    $("copy-connect")?.addEventListener("click", () => this._copy("connect-command", $("copy-connect")));

    const storedKey = sessionStorage.getItem("aetherhold.adminKey") || "";
    if (storedKey && $("admin-key")) $("admin-key").value = storedKey;
    $("admin-open")?.addEventListener("click", () => this.openAdminPanel());
    $("admin-key")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.openAdminPanel();
    });

    this._updateHostFacts();
  }

  openAdminPanel() {
    const password = ($("admin-key")?.value || "").trim();
    const base = this.client?.base || location.origin;
    // The panel itself asks for the password before showing anything. Passing
    // it here only saves the second prompt; an empty field opens the gate.
    const suffix = password ? `?key=${encodeURIComponent(password)}` : "";
    window.open(`${base}/admin${suffix}`, "_blank", "noopener");
    this.toast("Warden's panel opened — it will ask for the password", "good");
  }

  // ── codex ────────────────────────────────────────────────────────────
  _initCodex() {
    this.codex = null;
  }

  async loadCodex(force = false) {
    if (this.codex && !force) {
      this._renderCodex();
      return;
    }
    try {
      const data = await this.client.codex();
      this.codex = data.codex || null;
      this._renderCodex();
    } catch (error) {
      const world = $("codex-world");
      if (world) {
        world.innerHTML = `<div class="list-empty">The host did not answer with a Codex.<br />${escapeHtml(error.message)}</div>`;
      }
    }
  }

  _renderCodex() {
    const codex = this.codex;
    if (!codex) return;
    const world = $("codex-world");
    if (world) {
      world.innerHTML = `
        <span class="eyebrow">World logic</span>
        <h3>${escapeHtml(codex.world?.name || "The Aetherhold")}</h3>
        <p class="codex-lede">${escapeHtml(codex.world?.summary || "")}</p>
        <div class="codex-sections">
          ${(codex.world?.sections || []).map((section) => `
            <div class="codex-section">
              <strong>${escapeHtml(section.title)}</strong>
              <p>${escapeHtml(section.body)}</p>
            </div>`).join("")}
        </div>`;
    }
    const rules = $("codex-rules");
    if (rules) {
      rules.innerHTML = `<h3>Table law</h3><ol class="rule-list">
        ${(codex.conduct || []).map((rule) => `
          <li>
            <span class="rule-n">${escapeHtml(rule.id)}</span>
            <div><strong>${escapeHtml(rule.title)}</strong><p>${escapeHtml(rule.body)}</p></div>
          </li>`).join("")}
      </ol>`;
    }
    const terms = $("codex-terms");
    if (terms) {
      terms.innerHTML = `<h3>Words at the table</h3><dl class="term-list">
        ${(codex.terms || []).map((term) => `<div><dt>${escapeHtml(term.term)}</dt><dd>${escapeHtml(term.body)}</dd></div>`).join("")}
      </dl>`;
    }
    const commands = $("codex-commands");
    if (commands) {
      commands.innerHTML = `<h3>Commands</h3><ul class="cmd-list">
        ${(codex.commands || []).map((item) => `<li><code>${escapeHtml(item.cmd)}</code><span>${escapeHtml(item.body)}</span></li>`).join("")}
      </ul>`;
    }
    const version = $("codex-version");
    if (version) version.textContent = `codex ${codex.version || ""}`;
  }

  _copy(targetId, button) {
    const text = $(targetId)?.textContent || "";
    navigator.clipboard?.writeText(text).then(() => {
      if (button) {
        button.classList.add("done");
        button.querySelector("span").textContent = "Copied";
        setTimeout(() => {
          button.classList.remove("done");
          button.querySelector("span").textContent = "Copy";
        }, 1600);
      }
      this.toast("Copied to clipboard", "good");
    }).catch(() => this.toast("Clipboard unavailable", "bad"));
  }

  _updateHostFacts() {
    const base = this.client?.base || "";
    const host = $("host-current");
    if (host) host.textContent = base || "—";
    const address = $("host-address");
    const port = (() => {
      try { return new URL(base).port || "8080"; } catch { return "8080"; }
    })();
    if (address) address.textContent = location.host || `localhost:${port}`;
    const rooms = $("host-rooms");
    if (rooms) rooms.textContent = String(this.rooms.length);

    const hostCommand = $("host-command");
    if (hostCommand) {
      const portFlag = port === "80" || port === "443" ? "" : ` --port ${port}`;
      const name = $("host-name")?.value || "The Gilded Flagon";
      hostCommand.textContent = `python server.py${portFlag} --room "${name}"`;
    }
    const connectCommand = $("connect-command");
    if (connectCommand) {
      const hostname = location.hostname && location.hostname !== "127.0.0.1"
        ? location.hostname
        : "YOUR_LAN_IP";
      connectCommand.textContent = `python server.py --connect http://${hostname}:${port}`;
    }

    // A player who reached this page over the network has no server.py on
    // disk, so the host card offers the exact file this server runs. Locally
    // the file is already there and the link would only be noise.
    const local = ["localhost", "127.0.0.1", "::1", ""].includes(location.hostname);
    $("download-server")?.classList.toggle("hidden", local);
    $("download-server-hint")?.classList.toggle("hidden", local);
  }

  async createRoom({ name, maxPlayers, password, theme }) {
    if (this.busy) return;
    if (!(await this.requireAccount())) return;
    enterFullscreen();
    this.busy = true;
    this.audio.click();
    try {
      if (!this.connected && !(await this.testConnection())) return;
      const data = await this.client.createRoom({
        name: name.trim() || "The Wanderer's Rest",
        maxPlayers,
        password,
        theme,
        player: characterPayload(),
        session: account.token,
      });
      this.toast(`Hall opened — code ${data.code}`, "good");
      this._enterRoom(data);
    } catch (error) {
      this.toast(error.message, "bad");
      this.audio.error();
      if (error.status === 401) {
        forget();
        this.auth.paintChip();
        this.auth.open({ reason: error.message });
      }
    } finally {
      this.busy = false;
    }
  }

  async quickPlay() {
    if (this.busy) return;
    if (!(await this.requireAccount())) return;
    enterFullscreen();
    this.audio.click();
    this.busy = true;
    try {
      if (!this.connected) {
        const ok = await this.connectToServer(this.client.base, true);
        if (!ok) {
          this.toast("No host found — open the Host tab to start one", "bad");
          this.switchPanel("host");
          return;
        }
      }
      await this.refreshRooms();
      const open = this.rooms
        .filter((room) => !room.locked && room.players < room.maxPlayers)
        .sort((a, b) => b.players - a.players);
      if (open.length) {
        const data = await this.client.join(open[0].code, {
          password: "", player: characterPayload(), session: account.token,
        });
        this.toast(`Joined ${open[0].name}`, "good");
        this._enterRoom(data);
        return;
      }
      const locked = this.rooms.find((room) => room.locked);
      if (locked) {
        this.switchPanel("join");
        const codeInput = $("join-code");
        if (codeInput) codeInput.value = locked.code;
        this.toast("That hall is warded — the password is needed", "bad");
        return;
      }
      const data = await this.client.createRoom({
        name: "The Wanderer's Rest",
        maxPlayers: 16,
        password: "",
        theme: this.theme,
        player: characterPayload(),
        session: account.token,
      });
      this.toast(`You lit a new fire — code ${data.code}`, "good");
      this._enterRoom(data);
    } catch (error) {
      this.toast(error.message, "bad");
      this.audio.error();
      if (error.status === 401) {
        forget();
        this.auth.paintChip();
        this.auth.open({ reason: error.message });
      }
    } finally {
      this.busy = false;
    }
  }

  // ── misc ─────────────────────────────────────────────────────────────
  _initMisc() {
    const ticker = $("ticker");
    const lines = [
      "The fire remembers every name spoken beside it",
      "Dice decide what the story will not",
      "A hall with one lantern is still a hall",
      "Type /who to see who else is brave enough to stay",
      "The best adventures are typed one line at a time",
    ];
    if (ticker) {
      const paint = () => {
        ticker.textContent = `✦  ${lines[this.tickerIndex % lines.length]}  ✦`;
        this.tickerIndex += 1;
      };
      paint();
      setInterval(paint, 9000);
    }

    const clock = $("clock-chip");
    const paintClock = () => {
      if (!clock) return;
      clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
    paintClock();
    setInterval(paintClock, 15000);

    window.addEventListener("keydown", (event) => {
      const tag = (event.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (event.key === "Enter" && this.panel === "enter" && !document.getElementById("menu")?.classList.contains("hidden")) {
        event.preventDefault();
        this.quickPlay();
      }
    });

    setInterval(() => {
      if (document.getElementById("menu")?.classList.contains("hidden")) return;
      this.refreshRooms();
    }, 25000);

    const version = $("version-chip");
    if (version) version.textContent = "v1.2.0";
  }

  setFps(fps) {
    const el = $("menu-fps");
    if (el) el.textContent = `${Math.round(fps)} fps`;
    this.fps = fps;
  }

  show() {
    document.getElementById("menu")?.classList.remove("hidden");
    setTimeout(() => this.refreshRooms(), 200);
  }

  hide() {
    document.getElementById("menu")?.classList.add("hidden");
  }

  onLeftRoom() {
    this.show();
    this.refreshRooms();
    this._toastFromGame = true;
  }
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function hexToRgb(hex) {
  const value = String(hex || "#ffffff").replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16) || 255,
    g: parseInt(value.slice(2, 4), 16) || 255,
    b: parseInt(value.slice(4, 6), 16) || 255,
  };
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
