// Aetherhold — bootstrap: backdrop, menu wiring and game session.

import * as THREE from "../vendor/three.module.js";
import { AudioEngine } from "./audio.js";
import { createBackdrop } from "./backdrop.js";
import { MenuUI } from "./menu.js";
import { World } from "./world.js";
import { WorldMap } from "./worldmap.js";
import { WelcomeUI } from "./welcome-ui.js";
import { GameUI } from "./game-ui.js";
import { Profile, formatCash } from "./profile.js";
import { account, onAccount, resume } from "./auth.js";
import { teleportCommand } from "./teleport.js";
import { language, onLanguage, setLanguage, t, translateDom } from "./i18n.js";
import {
  character, characterPayload, CLASSES, enterFullscreen, getClientId, isMobileControlMode,
  saveSettings, settings, sheetRows, STAT_KEYS, STAT_LABELS, STAT_MAX, toggleFullscreen,
} from "./store.js";

const $ = (id) => document.getElementById(id);
let audio;

window.audioEngine = null; // replaced in boot() with the real engine

audio = new AudioEngine(settings);
window.audioEngine = audio;
const welcomeUI = new WelcomeUI();
let welcomeShown = false;
const backdropCanvas = $("backdrop");
const backdrop = createBackdrop(backdropCanvas);

let menu = null;
let world = null;
let client = null;
let session = null;
let syncTimer = null;
let syncGeneration = 0;
let syncing = false;
let touchControls = null;
let lastMessageSeq = 0;
let menuFps = 60;
let menuFrames = 0;
let menuFpsTime = 0;
let backdropVisible = true;
let chatTab = "all";
let chatChannel = "ic";
let codex = null;
let fearState = { active: false, secondsLeft: 0, by: "" };
let worldData = null;
let fleet = null;
let worldMap = null;
let mapSelected = null;
let fleetBusy = false;
let fleetSyncTimer = null;
let vehicleState = null;
const profile = new Profile();
let gameUI = null;
let profileUnsub = null;
let pendingTrade = null;
// The account id is the game's client id; keep it fresh across sign-in/out.
let clientId = getClientId();
onAccount(() => {
  clientId = getClientId();
  updateScoreboard();
});

const qualityScale = () => (settings.quality === "low" ? 0.75 : settings.quality === "high" ? 1.15 : 1);

// The GTA-6 Cinematic preset adds a graded vignette and film grain on top of
// the brighter tone mapping in the renderer.
function applyCinematicLook() {
  $("game")?.classList.toggle("cinematic", settings.quality === "cinematic");
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  backdrop.resize(width, height, qualityScale() * 0.9);
  world?.resize(width, height);
}
window.addEventListener("resize", resize);

function unlockAudio() {
  audio.ensure();
  audio.startAmbience();
  audio.startMusic();
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
}
// Keep a global handle so settings changes elsewhere can reach the engine.
window.audioEngine = audio;
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

// ── menu backdrop loop ──────────────────────────────────────────────────
const pointer = { x: 0, y: 0 };
window.addEventListener("pointermove", (event) => {
  pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
});

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.06, clock.getDelta());
  if (backdropVisible) {
    backdrop.update(dt, clock.elapsedTime, pointer);
    backdrop.render();
    menuFrames += 1;
    menuFpsTime += dt;
    if (menuFpsTime > 0.6) {
      menuFps = Math.round(menuFrames / menuFpsTime);
      menuFrames = 0;
      menuFpsTime = 0;
      menu?.setFps(menuFps);
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function gameToast(message, kind = "") {
  const stack = $("toast-stack");
  if (!stack) return;
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  stack.appendChild(node);
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 320);
  }, 4600);
  while (stack.children.length > 4) stack.firstElementChild.remove();
}

// ── profile, loadout and the gate ──────────────────────────────────────
// The server owns cash, gear and band progress. This block only mirrors it and
// turns clicks into authenticated room calls.
function nearbyPlayers() {
  if (!world || !session) return [];
  const out = [];
  for (const record of world.players?.values?.() || []) {
    if (!record || record.id === session.playerId) continue;
    const point = record.group?.position;
    if (!point) continue;
    const distance = Math.hypot(point.x - world.position.x, point.z - world.position.z);
    if (distance > 10) continue;
    out.push({
      id: record.id,
      name: record.data?.name || record.data?.sheet?.name || "Driver",
      cls: record.data?.cls || "",
      distance,
    });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

function gamePanelOpen() {
  return Boolean(gameUI?.isOpen())
    || ["pause", "sheet", "help", "map-overlay"].some((id) => overlayOpen(id));
}

function restoreGameInput() {
  if (!gamePanelOpen() && !chestOpen) world?.setInputEnabled(true);
}

function setupGameUI() {
  gameUI?.destroy();
  gameUI = new GameUI({
    profile,
    api: async (action, payload) => {
      if (!client) throw new Error("The hall is not connected");
      return client.profile(action, payload);
    },
    toast: (message, kind) => gameToast(message, kind || ""),
    getNearby: nearbyPlayers,
    onOpen: () => {
      ["pause", "sheet", "help"].forEach((id) => $(id)?.classList.add("hidden"));
      $("map-overlay")?.classList.add("hidden");
      if (chestOpen) closeChest();
      world?.releaseLook();
      world?.setInputEnabled(false);
    },
    onClose: () => {
      restoreGameInput();
    },
    onHeal: (amount) => {
      if (!world || !amount) return;
      world.stats.health = Math.min(100, world.stats.health + amount);
      gameToast(`+${amount} health`, "good");
      audio.chime();
    },
    onVehicle: () => openChest(),
  });
  gameUI.setPendingTrade(pendingTrade);
}

function toggleGamePanel(tab = "kit") {
  if (!session || !gameUI) return;
  if (gameUI.isOpen()) {
    if (gameUI.tab === tab) gameUI.close();
    else gameUI.open(tab);
  } else {
    if (overlayOpen("map-overlay")) closeMap();
    gameUI.open(tab);
  }
}

async function resolveAttack() {
  if (!client || world?.zone !== "raid") return;
  audio.hit();
  try {
    const data = await client.boss("hit");
    if (!world || world.zone !== "raid") return;
    profile.apply(data.profile);
    world.setProfile(profile.data);
    world.raid?.setHp(data.boss.hp, data.boss.maxHp);
    world.raid?.impact(Boolean(data.crit));
    gameUI?.updateBoss({ hp: data.boss.hp, maxHp: data.boss.maxHp, band: data.boss.band });
    if (data.crit) gameUI?.flashBoss(true);
    if (data.defeated) {
      world.raid?.defeat();
      audio.loot();
      const loot = (data.loot || []).map((entry) => `${entry.name} ×${entry.qty}`).join(" · ");
      gameUI?.setBossTip(`${formatCash(data.cash, profile.currency)} · ${loot || "no loot"} · <kbd>B</kbd> leave`);
      showCenter(`${data.boss.name} falls`, `${data.boss.place} — band ${data.boss.band} cleared`, 3400);
      showTopBar(`${data.boss.place} cleared`, 1, 2600);
      gameToast(`Band ${data.boss.band} cleared — ${formatCash(data.cash, profile.currency)}${loot ? ` · ${loot}` : ""}`, "good");
      updateScoreboard();
    }
  } catch (error) {
    // The server paces shots by the weapon's cycle time; a racing swing is
    // expected and should not spam the toast stack.
    if (error.status !== 429) gameToast(error.message || "The strike did not land", "bad");
  }
}

async function enterBossGate() {
  if (!client || !world) return;
  if (world.zone === "raid") { leaveBossGate(); return; }
  if (!profile.ready) { gameToast("Your sheet has not arrived yet", "bad"); return; }
  if (overlayOpen("map-overlay")) closeMap();
  if (gameUI?.isOpen()) gameUI.close();
  if (chestOpen) closeChest();
  const band = profile.band;
  try {
    const data = await client.boss("start", { band });
    profile.apply(data.profile);
    world.setProfile(profile.data);
    const info = world.enterRaid(band);
    if (!info) throw new Error("The gate did not open");
    world.raid?.setHp(data.boss.hp, data.boss.maxHp);
    gameUI?.showBoss(data.boss);
    gameUI?.setBossTip("Left click to strike · <kbd>R</kbd> draw · <kbd>B</kbd> leave");
    showCenter(data.boss.name, data.boss.place, 2800);
    showTopBar(`Band ${band} of 5 — ${data.boss.name}`, 0, 2400);
    audio.portal();
    const root = $("game");
    root?.classList.add("raid-warp");
    setTimeout(() => root?.classList.remove("raid-warp"), 900);
    world.requestLook?.();
    updateScoreboard();
  } catch (error) {
    gameToast(error.message || "The gate stays shut", "bad");
  }
}

function leaveBossGate() {
  if (!world || world.zone !== "raid") return;
  world.leaveRaid();
  gameUI?.hideBoss();
  client?.boss("leave").then((data) => {
    if (data?.profile) profile.apply(data.profile);
  }).catch(() => { /* the next start resets it */ });
  audio.door();
}

function stamp(ts) {
  const date = ts ? new Date(ts) : new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setHudCharacter() {
  const name = $("hud-self-name");
  if (name) name.textContent = character.name;
  const cls = $("hud-self-class");
  if (cls) cls.textContent = `${CLASSES[character.cls]?.icon || "✦"} ${character.cls}`;
  updateScoreboard();
  const portrait = $("hud-portrait");
  if (portrait) {
    portrait.style.setProperty("--swatch", character.color);
    portrait.style.setProperty("--accent", character.accent);
    const body = portrait.querySelector(".portrait-body");
    if (body) body.style.background = `radial-gradient(circle at 50% 22%, ${character.color}, #0a0a14 130%)`;
  }
  const bars = $("hud-stats");
  if (bars) {
    bars.innerHTML = STAT_KEYS.map((key) => `
      <div class="bar-row">
        <span>${STAT_LABELS[key]}</span>
        <div class="track"><i style="width:${(character.stats[key] / STAT_MAX) * 100}%"></i></div>
        <b>${character.stats[key]}</b>
      </div>`).join("");
    bars.classList.add("compact");
  }

  const sheetName = $("sheet-name");
  if (sheetName) sheetName.textContent = character.name;
  const sheetClass = $("sheet-class");
  if (sheetClass) sheetClass.textContent = `${CLASSES[character.cls]?.icon || "✦"} ${character.cls}`;
  const sheetPortrait = $("sheet-portrait");
  if (sheetPortrait) {
    sheetPortrait.style.setProperty("--swatch", character.color);
    sheetPortrait.style.setProperty("--accent", character.accent);
    const body = sheetPortrait.querySelector(".portrait-body");
    if (body) body.style.background = `radial-gradient(circle at 50% 22%, ${character.color}, #0a0a14 130%)`;
  }
  const sheetStats = $("sheet-stats");
  if (sheetStats) {
    sheetStats.innerHTML = STAT_KEYS.map((key) => `
      <div class="bar-row">
        <span>${STAT_LABELS[key]}</span>
        <div class="track"><i style="width:${(character.stats[key] / STAT_MAX) * 100}%"></i></div>
        <b>${character.stats[key]}</b>
      </div>`).join("");
  }
  const details = $("sheet-details");
  if (details) {
    details.innerHTML = sheetRows(character).map(([label, value]) => `
      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  }
}

function updateParty(players) {
  const list = $("party-list");
  const count = $("party-count");
  if (count) count.textContent = String(players.length);
  // Scoreboard lives on the right side.
  updateScoreboard();
  updateTabList(players);
  if (chestOpen) renderChest();
  if (!list) return;
  list.innerHTML = "";
  players
    .slice()
    .sort((a, b) => (a.id === session?.playerId ? -1 : b.id === session?.playerId ? 1 : a.name.localeCompare(b.name)))
    .forEach((player) => {
      const item = document.createElement("li");
      if (player.id === session?.playerId) item.classList.add("self");
      item.innerHTML = `<span class="pip" style="background:${player.color};color:${player.color}"></span>
        <span>${escapeHtml(player.name)}</span>
        <span class="cls">${escapeHtml(player.cls)}</span>`;
      list.appendChild(item);
    });
}

// ── chat ────────────────────────────────────────────────────────────────
function channelFor(message) {
  if (message.kind === "ooc") return "ooc";
  if (["chat", "emote", "fear", "threat", "sheet", "try"].includes(message.kind)) return "ic";
  return "rolls";
}

function chatSheet(sheet) {
  const fields = [
    ["Age", sheet.age || "—"],
    ["Pronouns", sheet.pronouns || "—"],
    ["Trade", sheet.occupation || "—"],
    ["Origin", sheet.origin || "—"],
    ["Wears", sheet.appearance || "—"],
    ["Weakness", sheet.weakness || "—"],
    ["Fear", sheet.fear || "—"],
    ["Dream", sheet.dream || "—"],
    ["History", sheet.backstory || "—"],
  ];
  return `<div class="chat-sheet"><div class="chat-sheet-name">${escapeHtml(sheet.name || "Wanderer")}
      <span>${escapeHtml(sheet.cls || "")}${sheet.weapon ? ` · ${escapeHtml(sheet.weapon)} drawn` : ""}</span></div>
    ${fields.map(([label, value]) => `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>`;
}

function linkifyCommands(text) {
  return escapeHtml(text || "").replace(/(^|\s)(\/[a-zA-Z][\w-]*)/g, (match, before, cmd) => (
    `${before}<button type="button" class="chat-cmd" data-cmd="${cmd}">${cmd}</button>`
  ));
}

function messageBody(message, isSelf) {
  const who = `<span class="who" style="color:${escapeHtml(message.color || message.accent || "#f2c97d")}">${escapeHtml(message.name || "Someone")}</span>`;
  switch (message.kind) {
    case "system":
      return `<span class="body">${linkifyCommands(message.text)}</span>`;
    case "ooc":
      return `${who}<span class="tag ooc">OOC</span><span class="body ooc-text">${escapeHtml(message.text)}</span>`;
    case "emote":
      return `${who}<span class="body emote-text">${escapeHtml(message.text)}</span>`;
    case "try":
      return `${who}<span class="body">tries: ${escapeHtml(message.text)}</span>
        <span class="detail">${escapeHtml(message.detail || "")}</span>`;
    case "roll":
      return `${who}<span class="body">${escapeHtml(message.text)}</span>
        <span class="detail">${escapeHtml(message.detail || "")}</span>`;
    case "fear":
      return `${who}<span class="tag fear">FEAR</span><span class="body">${escapeHtml(message.text)}</span>`;
    case "threat":
      return `${who}<span class="tag threat">STEEL</span><span class="body">${escapeHtml(message.text)}</span>
        <span class="detail">${escapeHtml(message.detail || "")}</span>`;
    case "sheet":
      return `<span class="tag">LOOK</span>${chatSheet(message.sheet || {})}`;
    default:
      return `${who}<span class="tag">IC</span><span class="body">${isSelf ? escapeHtml(message.text) : escapeHtml(message.text)}</span>`;
  }
}

function applyChatTab() {
  const log = $("chat-log");
  if (!log) return;
  let visible = 0;
  [...log.children].forEach((line) => {
    const show = chatTab === "all" || line.dataset.channel === chatTab;
    line.classList.toggle("tab-hidden", !show);
    if (show) visible += 1;
  });
  const counter = $("chat-count");
  if (counter) counter.textContent = `${visible} line${visible === 1 ? "" : "s"}`;
}

function appendMessage(message) {
  const log = $("chat-log");
  const kind = message.kind || "chat";
  // Server events (including mod output) can drive the big screen furniture
  // instead of the chat log.
  if (kind === "welcome") {
    // Private arrival card: the server addressed this event to us alone.
    welcomeShown = true;
    welcomeUI.show({
      name: message.text || character.name,
      cls: `${CLASSES[character.cls]?.icon || "✦"} ${character.cls || "Adventurer"}`,
      tagline: message.detail || t("welcome.tagline"),
      tip: t("welcome.tip"),
    });
    audio.welcome();
    return;
  }
  if (kind === "title") {
    showCenter(message.text || "", message.detail || "", 4600);
    audio.chime();
    return;
  }
  if (kind === "bar") {
    showTopBar(message.text || "", Number.parseFloat(message.detail) || 0, 4600);
    return;
  }
  if (!log) return;
  const line = document.createElement("div");
  line.className = `chat-line ${kind}`;
  line.dataset.channel = channelFor(message);
  const isSelf = message.from && message.from === session?.playerId;
  if (isSelf) line.classList.add("self");
  line.innerHTML = `<time>${stamp(message.ts)}</time><div class="line-body">${messageBody(message, isSelf)}</div>`;
  log.appendChild(line);
  while (log.children.length > 120) log.firstElementChild.remove();
  applyChatTab();
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  if (nearBottom || isSelf) log.scrollTop = log.scrollHeight;

  if (kind === "roll" || kind === "try") {
    const banner = $("hud-dice");
    const text = $("hud-dice-text");
    if (text) text.textContent = `${message.name} → ${message.roll?.total ?? "?"}`;
    if (banner) {
      banner.classList.add("show", "rolled");
      clearTimeout(banner._timer);
      banner._timer = setTimeout(() => banner.classList.remove("show", "rolled"), 4200);
    }
    audio.dice();
  } else if (kind === "threat") {
    audio.error();
  } else if (kind !== "system" && kind !== "sheet" && !isSelf) {
    audio.message();
  }
  world?.pushMessage(message);
}

const LOCAL_COMMANDS = {
  "/market": () => openChest(),
  "/shop": () => openChest(),
  "/stall": () => openChest(),
  "/tab": () => showTabList(true),
  "/players": () => showTabList(true),
};

function runChatCommand(cmd) {
  const clean = String(cmd || "").trim();
  if (!clean) return;
  const base = clean.split(" ")[0].toLowerCase();
  if (base === "/tp") {
    runTeleport(clean.slice(3).trim());
    return;
  }
  const local = LOCAL_COMMANDS[base];
  if (local) {
    closeAllOverlays();
    local();
    audio.click();
    return;
  }
  const input = $("chat-input");
  if (input) {
    input.value = clean;
    input.focus();
  }
}

// Chat-visible feedback for commands the client answers on its own.
function echoSystem(text) {
  if (!text) return;
  appendMessage({ kind: "system", from: null, text, ts: Date.now() });
}

function runTeleport(args) {
  if (!world) {
    gameToast(t("tp.noworld"), "bad");
    return;
  }
  const result = teleportCommand(world, args);
  echoSystem(result.text);
  if (result.run === "boss") {
    audio.portal?.();
    enterBossGate();
    return;
  }
  if (!result.ok) {
    gameToast(result.text, "bad");
    audio.error();
    return;
  }
  gameToast(result.text, "good");
  audio.chime?.();
  updateActionBar();
}

function sendChat(text) {
  if (!client || !text.trim()) return;
  const value = text.trim().slice(0, 400);
  const base = value.split(" ")[0].toLowerCase();
  if (base === "/tp") {
    runTeleport(value.slice(3).trim());
    return;
  }
  if (LOCAL_COMMANDS[base]) {
    LOCAL_COMMANDS[base]();
    return;
  }
  client.chat(value).catch((error) => {
    gameToast(error.message, "bad");
    audio.error();
    if (error.status === 403) {
      setTimeout(() => leaveRoom("You were barred from the realm."), 900);
    }
  });
}

function bindChat() {
  const input = $("chat-input");
  const send = () => {
    if (!input) return;
    let value = input.value;
    input.value = "";
    if (!value.trim()) return;
    if (chatChannel === "ooc" && !value.trim().startsWith("/")) value = `/ooc ${value.trim()}`;
    sendChat(value);
  };
  $("chat-send")?.addEventListener("click", send);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      send();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      input.blur();
      world?.setInputEnabled(true);
    }
  });
  input?.addEventListener("focus", () => world?.setInputEnabled(false));
  input?.addEventListener("blur", () => {
    world?.setInputEnabled(true);
    // The phone chat tray folds away as soon as the keyboard is dismissed.
    setTimeout(() => {
      if (document.activeElement !== input) document.body.classList.remove("touch-chat-open");
    }, 140);
  });

  const channel = $("channel-toggle");
  channel?.addEventListener("click", () => {
    chatChannel = chatChannel === "ic" ? "ooc" : "ic";
    channel.textContent = chatChannel.toUpperCase();
    channel.dataset.channel = chatChannel;
    if (input) {
      input.placeholder = chatChannel === "ooc"
        ? "Out of character — table talk, rules, comfort checks"
        : "Speak in character · /ooc for table talk · Enter to send";
      input.focus();
    }
    audio.click();
  });

  document.querySelectorAll("#chat-tabs [data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      chatTab = button.dataset.tab;
      document.querySelectorAll("#chat-tabs [data-tab]").forEach((other) => {
        other.classList.toggle("active", other === button);
      });
      applyChatTab();
      audio.click();
    });
  });

  document.querySelectorAll("#chat-quick [data-insert]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!input) return;
      input.focus();
      const insert = button.dataset.insert || "";
      input.value = insert;
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });
  document.querySelectorAll("#chat-quick [data-emote]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.emote;
      world?.emoteLocal(kind);
      audio.click();
      const line = kind === "wave" ? "waves, a little too late to be casual"
        : kind === "bow" ? "bows, and holds it a beat too long"
          : "breaks into a dance that nobody asked for";
      sendChat(`/me ${line}`);
    });
  });
}

// ── fear ────────────────────────────────────────────────────────────────
function updateFear(state) {
  if (!state) return;
  fearState = { active: Boolean(state.active), secondsLeft: Number(state.secondsLeft) || 0, by: state.by || "" };
  const banner = $("fear-banner");
  const title = $("fear-title");
  const text = $("fear-text");
  const active = fearState.active && fearState.secondsLeft > 0;
  world?.setFear(active);
  $("game")?.classList.toggle("fear", active);
  banner?.classList.toggle("hidden", !active);
  if (active) {
    if (title) title.textContent = `${fearState.by || "Someone"} has drawn steel`;
    if (text) {
      text.textContent = `You are within reach. ${Math.ceil(fearState.secondsLeft)}s to answer in character — freeze, yield, flee or fight.`;
    }
  }
}

// ── fleet, region map & road logistics ─────────────────────────────────
const GOSSIP = {
  en: {
    mechanic: "your left front bearing is singing. Bring it in before the pass.",
    attendant: "diesel is fresh today. The bridge east is open; the canyon road is not.",
    scrapyard: "found a matched pair of tyres in the pile. They still hold air, mostly.",
    trader: "the caravan ahead lost a wheel at the tunnel. Parts will be cheap by morning.",
    innkeeper: "beds upstairs, gossip downstairs. The road north is snowed in past the ridge.",
    northerner: "black ice on the pass after dusk. Chains or patience — pick one.",
    courier: "there is a shortcut behind the fuel stop. It is not on any map, and it eats axles.",
  },
  tr: {
    mechanic: "sol ön rulmanın şarkı söylüyor. Geçitten önce getir.",
    attendant: "mazot bugün taze. Doğudaki köprü açık; kanyon yolu değil.",
    scrapyard: "yığında eşleşen bir çift lastik buldum. Havalarını tutuyorlar, çoğunlukla.",
    trader: "öndeki kervan tünelde teker kaybetti. Sabaha parçalar ucuzlar.",
    innkeeper: "üst katta yatak, alt katta dedikodu. Kuzey yolu sırtın ötesinde kapalı.",
    northerner: "akşamdan sonra geçitte buz var. Zincir ya da sabır — birini seç.",
    courier: "yakıt istasyonunun arkasında bir kestirme var. Haritada yok ve aks yiyor.",
  },
};

function currentCurrency() {
  return fleet?.currency || worldData?.currency || "₺";
}

function nodeById(id) {
  return worldData?.nodes?.find((node) => node.id === id) || null;
}

function nodeLabel(node) {
  if (!node) return "—";
  return `${t(`site.${node.kind}`)} · ${node.climate}`;
}

// ── TV / couch mode ─────────────────────────────────────────────────────
// A single class on <body>; public/css/style.css scales the HUD for a sofa
// and a controller, and Settings → Graphics keeps the toggle honest.
function tvModeOn() {
  return document.body.classList.contains("tv-mode");
}

function setTvMode(on, announce = true) {
  document.body.classList.toggle("tv-mode", Boolean(on));
  settings.tv = Boolean(on);
  saveSettings({ tv: Boolean(on) });
  const input = $("set-tv");
  if (input) input.checked = Boolean(on);
  if (announce) gameToast(on ? "TV modu açık — HUD ve yazılar büyütüldü" : "TV modu kapalı");
}

function toggleTvMode() {
  setTvMode(!tvModeOn());
}

function updateVehicleHud(state = vehicleState) {
  // Vehicle panel only lives while you are inside a vehicle.
  if (!state || !state.inVehicle) {
    $("vehicle-hud")?.classList.add("hidden");
    return;
  }
  $("vehicle-hud")?.classList.remove("hidden");
  const fuelPct = state.tank ? Math.max(0, Math.min(100, (state.fuel / state.tank) * 100)) : 0;
  const rangePct = Math.max(0, Math.min(100, (state.rangeKm / 900) * 100));
  const loadPct = state.capacity ? Math.max(0, Math.min(100, (state.cargoKg / state.capacity) * 100)) : 0;
  const condition = Math.max(0, Math.min(100, state.condition));
  const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  const bar = (id, value) => { const el = $(id); if (el) el.style.width = `${value}%`; };
  set("vh-model", language === "tr" && fleet?.modelTr ? fleet.modelTr : (fleet?.model || state.model || "Truck"));
  set("vh-speed", Math.round(state.speed || 0));
  set("vh-fuel", `${Math.round(state.fuel)} / ${Math.round(state.tank)} L`);
  set("vh-range", `${Math.round(state.rangeKm)} km`);
  set("vh-load", `${Math.round(state.cargoKg)} / ${Math.round(state.capacity)} kg`);
  set("vh-condition", `${Math.round(condition)}%`);
  set("vh-cash", `${Math.round(state.cash)} ${currentCurrency()}`);
  bar("vh-fuel-bar", fuelPct);
  bar("vh-range-bar", rangePct);
  bar("vh-load-bar", loadPct);
  bar("vh-condition-bar", condition);
  $("vh-fuel")?.parentElement?.classList.toggle("low", fuelPct < 18);
  $("vh-condition")?.parentElement?.classList.toggle("low", condition < 40);
  const site = nodeById(fleet?.node);
  set("vh-site", site ? site.name : "");
  set("vh-hint", state.inVehicle
    ? `${t("vehicle.exit")} · E · Space · M ${t("hud.map")}`
    : `${t("vehicle.enter")} · E · M ${t("hud.map")}`);
}

function applyFleetPayload(data) {
  if (data?.fleet) {
    fleet = data.fleet;
    vehicleState = world?.fleetSnapshot() || vehicleState;
    world?.applyFleet(fleet);
    worldMap?.setFleet(fleet);
  }
  updateVehicleHud();
  refreshMapSide(mapSelected);
}

function setFleetBusy(busy) {
  fleetBusy = busy;
  document.querySelectorAll("#map-actions button, #map-cargo-actions button").forEach((button) => {
    button.disabled = busy || button.dataset.disabled === "true";
  });
}

async function fleetAction(action, payload = {}, success = "") {
  if (!client || fleetBusy) return null;
  setFleetBusy(true);
  try {
    const data = await client.fleetAction({ clientId, action, ...payload });
    applyFleetPayload(data);
    if (success) gameToast(success, "good");
    audio.chime();
    return data;
  } catch (error) {
    gameToast(error.message, "bad");
    audio.error();
    return null;
  } finally {
    setFleetBusy(false);
    renderCargoActions();
  }
}

function refreshMapSide(node) {
  if (!worldMap) return;
  mapSelected = node || null;
  const title = $("map-selected");
  const travel = $("map-travel");
  const services = $("map-services");
  if (!title) return;
  const climateChip = $("map-climate-chip");
  if (climateChip) {
    climateChip.textContent = node
      ? `${t(`site.${node.kind}`)} · ${node.climate}${node.km ? ` · ${node.km} km` : ""}`
      : "—";
  }
  if (!node) {
    title.innerHTML = `<span class="eyebrow">${t("map.route")}</span><h3>${t("map.no")}</h3><p class="muted small">${t("map.fog")}</p>`;
    if (services) services.innerHTML = "";
    if (travel) { travel.disabled = true; travel.textContent = t("map.travel"); }
  } else {
    const here = fleet?.node === node.id;
    const adjacent = worldMap.isAdjacent(node.id);
    const road = worldMap.roadTo(node.id);
    const consumption = fleet?.consumption || 28;
    const load = Math.min(1.6, (fleet?.cargoKg || 0) / Math.max(1, fleet?.capacity || 18000));
    const need = road ? road.km * consumption / 100 * (1 + 0.35 * load) : 0;
    title.innerHTML = `<span class="eyebrow">${t("map.route")}</span>
      <h3>${escapeHtml(node.name)}</h3>
      <p class="muted small">${escapeHtml(nodeLabel(node))}</p>
      ${here ? `<p class="muted small">${t("map.vehicleAt")}</p>` : road
        ? `<p class="muted small">${escapeHtml(road.name)} · ${road.km} km · ${t("map.cost")} ${need.toFixed(1)} L</p>`
        : `<p class="muted small">${t("map.notAdjacent")}</p>`}`;
    if (services) {
      services.innerHTML = node.services
        .map((service) => `<span class="chip">${escapeHtml(t(`site.${service}`) === `site.${service}` ? service : t(`site.${service}`))}</span>`)
        .join("");
    }
    if (travel) {
      travel.textContent = t("map.travel");
      const allowed = adjacent && !here && !fleetBusy;
      travel.disabled = !allowed;
      travel.dataset.disabled = allowed ? "false" : "true";
      travel.title = adjacent ? `${road ? road.km + " km" : ""}` : t("map.notAdjacent");
    }
  }
  updateServiceButtons();
  renderCargoActions();
}

function updateServiceButtons() {
  const here = nodeById(fleet?.node);
  const services = new Set(here?.services || []);
  const map = {
    "map-refuel": services.has("fuel"),
    "map-repair": services.has("garage"),
    "map-pour": Number(fleet?.cargo?.jerrycan || 0) > 0,
    "map-tow": true,
  };
  Object.entries(map).forEach(([id, enabled]) => {
    const button = $(id);
    if (!button) return;
    button.disabled = fleetBusy || !enabled;
    button.dataset.disabled = enabled ? "false" : "true";
  });
}

function renderCargoActions() {
  const container = $("map-cargo-actions");
  const list = $("map-cargo-list");
  if (!container || !list) return;
  const parts = worldData?.parts || {};
  const cargo = fleet?.cargo || {};
  const here = nodeById(fleet?.node);
  const canBuy = here?.services?.includes("parts");
  const canSell = here?.services?.includes("parts") || here?.services?.includes("scrapyard");
  list.innerHTML = Object.keys(cargo).length
    ? Object.entries(cargo).map(([key, qty]) => `<div class="cargo-row"><span>${escapeHtml(parts[key]?.[language] || parts[key]?.en || key)}</span><b>${qty}</b></div>`).join("")
    : `<span class="muted">${t("vehicle.empty")}</span>`;
  container.innerHTML = "";
  Object.entries(parts).forEach(([key, part]) => {
    const label = part[language] || part.en || key;
    if (canBuy) {
      const buy = document.createElement("button");
      buy.className = "mini-btn";
      buy.textContent = `+ ${label}`;
      buy.addEventListener("click", () => fleetAction("buy", { part: key, qty: 1 }, `${label} — ${part.price} ${currentCurrency()}`));
      container.appendChild(buy);
    }
    if (canSell && Number(cargo[key] || 0) > 0) {
      const sell = document.createElement("button");
      sell.className = "mini-btn";
      sell.textContent = `− ${label}`;
      sell.addEventListener("click", () => fleetAction("sell", { part: key, qty: 1 }, t("map.sell")));
      container.appendChild(sell);
    }
  });
  if (!container.childElementCount) {
    container.innerHTML = `<span class="muted small">${t("map.services")}: ${(here?.services || []).join(", ") || "—"}</span>`;
  }
}

function openMap() {
  if (!session) return;
  closeAllOverlays();
  $("map-overlay")?.classList.remove("hidden");
  world?.setInputEnabled(false);
  world?.releaseLook();
  worldMap?.show();
  refreshMapSide(worldMap?.selected ? nodeById(worldMap.selected) : null);
  updateVehicleHud();
}

function closeMap() {
  $("map-overlay")?.classList.add("hidden");
  if (!overlayOpen("pause") && !overlayOpen("sheet") && !overlayOpen("help")) world?.setInputEnabled(true);
}

function toggleMap() {
  if (overlayOpen("map-overlay")) closeMap();
  else openMap();
}

async function travelToSelected() {
  const target = mapSelected?.id;
  if (!target || !worldMap?.isAdjacent(target)) return;
  const data = await fleetAction("travel", { to: target }, "");
  if (!data) return;
  const node = nodeById(target);
  if (world && world.region) {
    const spawn = world.region.truckSpawn;
    world.truck.position.set(spawn.x, 0, spawn.z);
    world.truck.rotation.y = 0;
    world.vehicle.heading = 0;
    world.vehicle.speed = 0;
    world.position.set(spawn.x + 3, 0, spawn.z + 2);
    world.yaw = Math.PI;
    world.pitch = 0.22;
    world._strandedNotified = false;
    worldMap?.setFleet(fleet);
    if (worldMap) worldMap.select(target);
  }
  worldMap?.setFleet(fleet);
  const revealed = data.discovered?.length ? ` · ${data.discovered.length} new roads` : "";
  gameToast(`${node?.name || target} — ${Math.round(data.road?.km || 0)} km, ${data.spent?.toFixed(1)} L${revealed}`, "good");
  audio.enter();
  updateVehicleHud();
  refreshMapSide(node);
}

async function loadRegionSystems(regionKey) {
  if (!client) return;
  try {
    const [worldResponse, fleetResponse] = await Promise.all([
      client.world(regionKey || ""),
      client.fleet(clientId),
    ]);
    worldData = worldResponse.world || null;
    fleet = fleetResponse.fleet || null;
    world?.setWorld(worldData);
    if (fleet) world?.applyFleet(fleet);
    const mapRegion = $("map-region");
    if (mapRegion) mapRegion.textContent = worldData?.name || "";
    if (!worldMap) {
      worldMap = new WorldMap($("map-canvas"), {
        onSelect: (node) => refreshMapSide(node),
        onAction: (action, payload) => fleetAction(action, payload),
      });
    }
    worldMap.setLanguage(language);
    worldMap.setWorld(worldData);
    worldMap.setFleet(fleet);
    updateVehicleHud();
    refreshMapSide(null);
  } catch (error) {
    gameToast(error.message, "bad");
  }
}

function startFleetSync() {
  clearInterval(fleetSyncTimer);
  fleetSyncTimer = setInterval(() => {
    if (!client || !world || !fleet || fleetBusy) return;
    const snapshot = world.fleetSnapshot();
    client.fleetAction({
      clientId, action: "save",
      pos: snapshot.pos, heading: snapshot.heading,
      fuel: snapshot.fuel, condition: snapshot.condition, odometer: snapshot.odometer,
    }).catch(() => { /* the road is allowed to be offline for a moment */ });
  }, 6000);
}

// ── session lifecycle ───────────────────────────────────────────────────

let actionBarTimer = null;

function startActionBar() {
  clearInterval(actionBarTimer);
  updateActionBar();
  actionBarTimer = setInterval(updateActionBar, 220);
}

// 9 syncs a second is the target. The loop reschedules itself as soon as the
// previous answer lands, so a slow link costs one round trip per sync instead of
// one round trip plus the rest of the interval. On a distant host that is the
// difference between 2 and 4 updates a second for everyone else's characters.
const SYNC_INTERVAL = 110;

function startSync() {
  clearTimeout(syncTimer);
  const generation = ++syncGeneration;
  const step = async () => {
    if (generation !== syncGeneration) return;
    const started = performance.now();
    await syncTick();
    if (generation !== syncGeneration) return;
    syncTimer = setTimeout(step, Math.max(0, SYNC_INTERVAL - (performance.now() - started)));
  };
  step();
}

function stopSync() {
  syncGeneration += 1;
  clearTimeout(syncTimer);
  syncTimer = null;
}

let recoveringSession = false;

// Re-join the same hall with the same character. The token changes, the world
// keeps running.
async function recoverSession() {
  if (recoveringSession || !client?.code) return false;
  recoveringSession = true;
  try {
    const data = await client.join(client.code, { player: characterPayload(), session: account.token });
    if (!data) return false;
    session = session || {};
    world?.setSelf(data.playerId);
    return true;
  } catch {
    return false;
  } finally {
    recoveringSession = false;
  }
}

async function syncTick() {
  if (syncing || !client?.code || !world || !session) return;
  syncing = true;
  try {
    const data = await client.sync(world.localState());
    if (!session) return;
    world.applyPlayers(data.players || []);
    updateParty(data.players || []);
    updateFear(data.fear);
    pendingTrade = data.trade || null;
    gameUI?.setPendingTrade(pendingTrade);
    for (const message of data.messages || []) {
      if (message.seq > lastMessageSeq) {
        lastMessageSeq = message.seq;
        appendMessage(message);
      }
    }
  } catch (error) {
    if (error.status === 401) {
      // The host drops players that stop syncing, and the first frame of a new
      // district can take a while to build. Reclaim the seat silently once
      // instead of throwing the player back to the menu.
      if (await recoverSession()) return;
      gameToast("The hall closed — returning to the menu", "bad");
      leaveRoom();
    } else if (error.status === 404) {
      gameToast("The hall closed — returning to the menu", "bad");
      leaveRoom();
    } else if (error.status === 403) {
      gameToast(error.message, "bad");
      leaveRoom();
    }
  } finally {
    syncing = false;
  }
}

// Hides the boot and loading overlays. The boot element is hidden, not removed,
// so the next world entry can reuse it (and the startup test can still see it).
function hideLoadingScreen() {
  $("boot")?.classList.add("hidden");
  $("loading-screen")?.classList.add("hidden");
}

async function startSession(activeClient, data) {
  client = activeClient;
  session = {
    playerId: data.playerId,
    code: data.code,
    name: data.room?.name || "A hall",
  };
  client.seq = typeof data.room?.seq === "number" ? data.room.seq : 0;

  menu.hide();
  const game = $("game");
  game?.classList.remove("hidden");
  // The vehicle panel is revealed by updateVehicleHud() only once you are seated.
  $("vehicle-hud")?.classList.add("hidden");
  applyCinematicLook();
  backdropVisible = false;

  // Show loading screen during world build (with transition)
  $("boot")?.classList.remove("hidden");
  $("boot")?.classList.add("done");
  $("loading-screen")?.classList.remove("hidden");
  if ($("loading-text")) $("loading-text").textContent = "Sunucuya bağlanılıyor…";

  // Failsafe: a broken sub-system must never strand the player on the loading
  // screen. Whatever happens below, the overlay closes and the error surfaces.
  const loadingFailsafe = setTimeout(() => {
    console.error("[aetherhold] world entry timed out — closing the loading screen");
    hideLoadingScreen();
    gameToast("Dünya kurulurken bir hata oluştu — ayrıntılar tarayıcı konsolunda.", "error");
  }, 120000);

  const roomName = $("hud-room-name");
  if (roomName) roomName.textContent = data.room?.name || "A hall";
  const roomCode = $("hud-room-code");
  if (roomCode) roomCode.textContent = data.code;
  const roomTheme = $("hud-room-theme");
  if (roomTheme) {
    const key = data.room?.theme || "ember";
    roomTheme.textContent = {
      ember: "Ember Camp",
      moonlit: "Moonlit Grove",
      frost: "Frostfall Ruins",
    }[key] || key;
  }

  setHudCharacter();
  const log = $("chat-log");
  if (log) log.innerHTML = "";
  lastMessageSeq = 0;
  welcomeShown = false;
  welcomeUI.reset();
  chatTab = "all";
  chatChannel = "ic";
  document.querySelectorAll("#chat-tabs [data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === "all");
  });
  const channel = $("channel-toggle");
  if (channel) { channel.textContent = "IC"; channel.dataset.channel = "ic"; }
  updateFear({ active: false, secondsLeft: 0, by: "" });

  const buildStarted = performance.now();
  world = new World($("world"), {
    settings, theme: data.room?.theme || "ember", language,
  });
  console.info(`[aetherhold] district built in ${Math.round(performance.now() - buildStarted)} ms`);
  // Debug handle: the browser console and the QA scripts use this to inspect
  // the live scene without reaching into module scope.
  window.__world = world;
  world.setSelf(data.playerId);
  world.setCharacter(character);
  world.applyPlayers(data.room?.players || []);
  world.resize(window.innerWidth, window.innerHeight);
  world.onVehicleState = (state) => { vehicleState = state; updateVehicleHud(state); };
  world.onNotice = (text, kind = "") => gameToast(text, kind);
  world.onVehicleExit = (snapshot) => {
    if (!client) return;
    client.fleetAction({
      clientId, action: "save",
      pos: snapshot.pos, heading: snapshot.heading, fuel: snapshot.fuel,
      condition: snapshot.condition, odometer: snapshot.odometer,
    }).then(applyFleetPayload).catch(() => { /* keep driving */ });
  };
  world.onNpc = (npc) => {
    const lines = GOSSIP[language] || GOSSIP.en;
    const line = lines[npc.role] || lines.innkeeper;
    gameToast(`${npc.name} · ${npc.title} — "${line}"`, "");
    audio.chime();
    // Props, not menus in the chat log: traders open the counter, couriers the
    // contract board, mechanics the vehicle bay.
    if (["trader", "attendant"].includes(npc.role)) gameUI?.open("market");
    else if (["courier", "hauler"].includes(npc.role)) gameUI?.open("contracts");
    else if (npc.role === "mechanic") openChest();
  };
  // Street loot: the server owns the stack, the city owns the crate.
  world.onPickup = async (pickup) => {
    if (!pickup) return true;
    if (!client) return true;
    try {
      const result = await client.profile("gather", { key: pickup.key });
      if (result?.profile) {
        profile.apply(result.profile);
        world.setProfile(result.profile);
        world.inventory?.sync(result.profile);
      }
      world.region?.takePickup?.(pickup);
      gameToast(`${pickup.label} alındı`, "good");
      audio.chime();
    } catch (error) {
      gameToast(error?.message || "Toplanamadı", "bad");
    }
    return true;
  };
  // Signage is not decoration: every service board does what it says.
  world.onSite = (site) => {
    const kind = site?.kind;
    if (kind === "subway") {
      const stations = world.region?.stations || [];
      if (stations.length > 1) {
        world._metroIndex = ((world._metroIndex ?? 0) + 1) % stations.length;
        const stop = stations[world._metroIndex];
        world.warpTo(stop.x, stop.z + 6);
        gameToast(`Metro → ${stop.district || stop.label}`, "good");
        audio.chime();
      }
      return true;
    }
    if (["market", "fuel", "diner", "clinic"].includes(kind)) {
      gameUI?.open("market");
      return true;
    }
    if (kind === "police") {
      gameUI?.open("contracts");
      return true;
    }
    if (kind === "garage") {
      openChest();
      return true;
    }
    if (kind === "hotel") {
      if (world.stats.health >= 100) gameToast("Zaten zindesin", "");
      else {
        world.stats.health = 100;
        gameToast("Bir duş, bir yatak — tam sağlık", "good");
        audio.chime();
      }
      return true;
    }
    gameToast(`${site?.label || kind} — ${(site?.services || []).join(", ")}`, "");
    return true;
  };
  world.onAction = (action) => {
    sendChat(action === "draw" ? `/draw ${world?.weapon || "blade"}` : "/sheathe");
  };
  world.onAttack = () => resolveAttack();
  world.onRaidExit = () => gameUI?.hideBoss();
  world.onPlayerDown = () => {
    gameUI?.hideBoss();
    client?.boss("leave").then((data) => {
      if (data?.profile) profile.apply(data.profile);
    }).catch(() => { /* the gate resets either way */ });
    audio.hurt();
  };
  world.onLockChange = (locked) => {
    if (locked) {
      const hint = $("hud-hint");
      if (hint) hint.classList.add("fade");
    } else if (!overlayOpen("pause") && !overlayOpen("sheet") && !overlayOpen("help")) {
      const hint = $("hud-hint");
      if (hint) {
        hint.textContent = t("hud.hint");
        hint.classList.remove("fade");
      }
    }
  };
  world.onViewChange = (firstPerson) => {
    gameToast(firstPerson ? "First person — you are your eyes" : "Over the shoulder");
  };

  // ── controller ──────────────────────────────────────────────────────
  // Same paths as the keyboard: the pad only presses the same keys. A pad
  // module that fails to load must never cost the player the world.
  world.gamepad?.stop();
  try {
    const { GamepadDriver } = await import("./gamepad.js");
    world.gamepad = new GamepadDriver(world, {
      onNotice: (text, kind) => gameToast(text, kind),
      onPause: () => { overlayOpen("pause") ? closeAllOverlays() : showOverlay("pause"); },
      onMap: () => toggleMap(),
      onSheet: () => { overlayOpen("sheet") ? hideOverlay("sheet") : (closeAllOverlays(), showOverlay("sheet")); },
      onInventory: () => { toggleGamePanel("kit"); },
      onTvMode: () => toggleTvMode(),
    });
    world.gamepad.start();
  } catch (error) {
    console.warn("[aetherhold] gamepad support unavailable", error);
  }

  // Telefon, envanter ve load screen sistemlerini başlat
  await world.initSystems(data.playerId);

  // The quick bar speaks to the same server endpoint as the kit panel, so a
  // potion drunk with "2" and one drunk from the panel are the same potion.
  if (world.inventoryUI) {
    world.inventoryUI.setApi(async (action, payload) => {
      if (!client) throw new Error("The hall is not connected");
      const result = await client.profile(action, payload);
      if (result?.profile) profile.apply(result.profile);
      if (result?.profile) world.setProfile(result.profile);
      return result;
    });
    world.inventoryUI.setToast((message, kind) => gameToast(message, kind || ""));
    world.inventoryUI.setOnHeal((amount) => {
      if (!world || !amount) return;
      world.stats.health = Math.min(100, world.stats.health + amount);
      gameToast(`+${amount} health`, "good");
      audio.chime();
    });
    world.inventoryUI.setOnBag(() => toggleGamePanel("kit"));
  }

  // The sheet is server-owned; the UI is rebuilt per session so a stale panel
  // from the previous hall can never address the new room token.
  world.setProfile(null);
  pendingTrade = null;
  setupGameUI();
  profileUnsub?.();
  profileUnsub = profile.onChange((state) => {
    world?.setProfile(state.data);
    world?.inventory?.sync(state.data);
    updateScoreboard();
  });
  try {
    const sheet = await client.profile("get");
    profile.apply(sheet.profile);
    gameUI.offers = sheet.offers || [];
    gameUI.shop = sheet.shop || [];
    world.setProfile(profile.data);
    world.inventory?.sync(profile.data);
    updateScoreboard();
  } catch (error) {
    console.warn("[aetherhold] profile unavailable", error);
    gameToast("Sheet unavailable — gear will not save this session", "bad");
  }

  // Yükleme ekranını güncelle
  if ($("loading-text")) $("loading-text").textContent = "Dünya yükleniyor…";

  world.start();
  showCenterOnJoin();
  // If the welcome mod is not loaded, still greet the player privately.
  setTimeout(() => {
    if (welcomeShown || !session) return;
    welcomeShown = true;
    welcomeUI.show({
      name: character.name,
      cls: `${CLASSES[character.cls]?.icon || "✦"} ${character.cls || "Adventurer"}`,
      tagline: t("welcome.tagline"),
      tip: t("welcome.tip"),
    });
    audio.welcome();
  }, 1600);
  updateParty(data.room?.players || []);
  (data.room?.messages || []).forEach((message) => {
    if (message.seq > lastMessageSeq) lastMessageSeq = message.seq;
    appendMessage(message);
  });
  updateFear(data.room?.fear);

  bindChatOnce();
  loadCodexForSession();
  loadRegionSystems(data.room?.region);
  startFleetSync();
  startSync();
  startActionBar();
  audio.inMenu = false;
  audio.startAmbience();
  audio.startMusic();

  // Telefon ve envanter UI'larını bağla (world'tan sonra). Tek bir UI modülü
  // bozuksa dünya girişi komple düşmesin: hata loglanır, oyun devam eder.
  for (const [label, ui] of [["phoneUI", world.phoneUI], ["inventoryUI", world.inventoryUI]]) {
    try {
      if (typeof ui?.setHost === "function") ui.setHost(world);
      else if (ui) console.warn(`[aetherhold] ${label} has no setHost(), skipped`);
    } catch (error) {
      console.error(`[aetherhold] ${label}.setHost failed`, error);
    }
  }

  const hint = $("hud-hint");
  if (hint) {
    hint.classList.remove("fade");
    setTimeout(() => hint.classList.add("fade"), 12000);
  }
  // The join click is a user gesture, so the browser may allow this immediately.
  setTimeout(() => {
    // A touch screen cannot capture a mouse; mobile looks by dragging instead.
    if (isMobileControlMode()) return;
    if (!overlayOpen("pause") && !overlayOpen("sheet") && !overlayOpen("help")) world?.requestLook();
  }, 250);

  // Touch controls belong to the session: built with the world, torn down on
  // leave. A desktop player never loads touch.js at all.
  syncTouchControls();

  // Hide loading screen once the world is fully built and interactive.
  // The CSS transition owns the fade; the failsafe is cancelled here.
  clearTimeout(loadingFailsafe);
  $("boot")?.classList.add("done");
  setTimeout(hideLoadingScreen, 800);
}

async function leaveRoom(notice = "") {
  welcomeUI.reset();
  welcomeShown = false;
  world?.gamepad?.stop();
  unmountTouchControls();
  stopSync();
  clearInterval(actionBarTimer);
  actionBarTimer = null;
  closeChest();
  showTabList(false);
  pendingTrade = null;
  profileUnsub?.();
  profileUnsub = null;
  gameUI?.destroy();
  gameUI = null;
  profile.reset();
  clearInterval(fleetSyncTimer);
  fleetSyncTimer = null;
  worldMap?.dispose();
  worldMap = null;
  worldData = null;
  fleet = null;
  vehicleState = null;
  mapSelected = null;
  $("map-overlay")?.classList.add("hidden");
  const previous = client;
  const hadCode = Boolean(previous?.code);
  world?.releaseLook();
  client = null;
  session = null;
  world?.dispose();
  world = null;
  window.__world = null;
  fearState = { active: false, secondsLeft: 0, by: "" };
  backdropVisible = true;
  $("game")?.classList.add("hidden");
  $("game")?.classList.remove("fear");
  $("fear-banner")?.classList.add("hidden");
  $("pause")?.classList.add("hidden");
  $("sheet")?.classList.add("hidden");
  $("help")?.classList.add("hidden");
  const log = $("chat-log");
  if (log) log.innerHTML = "";
  const chat = $("chat-input");
  if (chat) chat.value = "";
  menu.show();
  if (notice) gameToast(notice, "bad");
  if (previous && hadCode) await previous.leave();
}

// ── scoreboard (right side) ─────────────────────────────────────────────
function updateScoreboard() {
  const levelEl = $("score-level");
  const moneyEl = $("score-money");
  const killsEl = $("score-kills");
  const serverEl = $("score-server");
  const footEl = $("score-foot");
  if (!levelEl) return;
  if (levelEl) levelEl.textContent = String(profile.ready ? profile.level : (character.stats.luck || 1));
  if (moneyEl) {
    const money = profile.ready ? profile.cash : fleet?.cash ?? 0;
    moneyEl.textContent = `${Math.round(Number(money) || 0)} ${profile.ready ? profile.currency : currentCurrency()}`;
  }
  if (killsEl) killsEl.textContent = String(profile.ready ? profile.kills : (character.kills || 0));
  if (serverEl && session?.code) {
    serverEl.textContent = session.code;
    footEl.textContent = t("hud.score.self") || (language === "tr" ? "Sen buradasın" : "You are here");
  } else if (serverEl) {
    serverEl.textContent = "—";
    footEl.textContent = "";
  }
}

// ── action bar (live location / speed) ─────────────────────────────
function climateLabel(key) {
  if (!key) return "";
  const translated = t(`climate.${key}`);
  return translated === `climate.${key}` ? key : translated;
}

function updateActionBar() {
  const bar = $("action-bar");
  if (!bar || !session) return;
  const pos = world?.position || { x: 0, z: 0 };
  const site = world?.region?.nearestSite?.(pos.x, pos.z, 34) || null;
  const node = nodeById(fleet?.node);
  const place = site ? t(`site.${site.kind}`) : (node?.name || worldData?.name || t("hud.server"));
  const climate = climateLabel(node?.climate || worldData?.climate || "temperate");
  const chunks = [
    `<b>${escapeHtml(place)}</b>`,
    `<span class="sep"></span><span>${escapeHtml(climate)}</span>`,
    `<span class="sep"></span><span>X ${Math.round(pos.x)} · Z ${Math.round(pos.z)}</span>`,
  ];
  if (vehicleState?.inVehicle) {
    chunks.push(`<span class="sep"></span><b>${Math.round(vehicleState.speed || 0)} km/h</b>`);
  }
  if (fleet?.node) {
    chunks.push(`<span class="sep"></span><span>${escapeHtml(t("vehicle.fuel"))} ${Math.round(fleet.fuel || 0)} L</span>`);
  }
  bar.innerHTML = chunks.join(" ");
}

// ── TAB player list ─────────────────────────────────────────────────────
let tabPlayers = [];

function updateTabList(players = tabPlayers) {
  tabPlayers = players || [];
  const rows = $("tab-rows");
  if (!rows) return;
  const online = $("tab-online");
  if (online) online.textContent = `${tabPlayers.length} online`;
  const server = $("tab-server");
  if (server) server.textContent = worldData?.name || "Aetherhold";
  const region = $("tab-region");
  if (region) region.textContent = worldData?.regionName || worldData?.region || "—";
  const foot = $("tab-foot");
  if (foot) foot.textContent = `${t("hud.hint").split("·")[0].trim()} · ${tabPlayers.length}/12 · ${t("hud.server")}: ${session?.code || "—"}`;
  rows.innerHTML = tabPlayers
    .slice()
    .sort((a, b) => (a.id === session?.playerId ? -1 : b.id === session?.playerId ? 1 : String(a.name).localeCompare(String(b.name))))
    .map((player) => {
      const self = player.id === session?.playerId;
      const ping = self ? 12 : 20 + (String(player.id).charCodeAt(0) % 40);
      return `<li class="tab-row${self ? " self" : ""}">
        <span class="who"><i style="background:${escapeHtml(player.color || "#f2c97d")};color:${escapeHtml(player.color || "#f2c97d")}"></i>
          <span>${escapeHtml(player.name || "—")}</span></span>
        <span class="cls">${escapeHtml(player.cls || "—")}</span>
        <span class="ping">${ping} ms</span>
      </li>`;
    })
    .join("");
}

function showTabList(show) {
  const list = $("hud-tablist");
  if (!list) return;
  if (show) updateTabList();
  list.classList.toggle("hidden", !show);
}

// ── chest GUI: the roadside market ──────────────────────────────────────
const CHEST_ICONS = {
  fuel: "⛽", repair: "🔧", tow: "🚚", jerrycan: "🛢️",
  tyre: "◉", engine: "⚙️", brake: "🛑", battery: "🔋", filter: "🧽",
};

function chestSlot({ icon, label, cost, action, disabled = false, note = "" }) {
  const button = document.createElement("button");
  button.className = `chest-slot${action && !disabled ? "" : " empty"}`;
  button.type = "button";
  button.title = [label, cost ? `${cost} ${currentCurrency()}` : "", note].filter(Boolean).join(" — ");
  button.innerHTML = `<span>${icon}</span>
    ${cost ? `<span class="slot-cost">${cost}</span>` : ""}
    <span class="slot-label">${escapeHtml(label || "")}</span>`;
  if (action && !disabled) button.addEventListener("click", action);
  return button;
}

function renderChest() {
  const grid = $("chest-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const node = nodeById(fleet?.node);
  const services = node?.services || [];
  const parts = worldData?.parts || {};
  const currency = currentCurrency();
  const slots = [
    {
      icon: CHEST_ICONS.fuel, label: t("map.refuel"),
      cost: fleet ? Math.round((fleet.tank - fleet.fuel) * (fleet.fuelPrice || 1)) : 0,
      action: () => fleetAction("refuel", {}, t("map.refuel")),
      disabled: !services.includes("fuel"),
      note: services.includes("fuel") ? "" : "This stop has no pumps",
    },
    {
      icon: CHEST_ICONS.repair, label: t("map.repair"),
      action: () => fleetAction("repair", {}, t("map.repair")),
      disabled: !(services.includes("repair") || services.includes("garage")),
      note: "Needs a garage",
    },
    { icon: CHEST_ICONS.tow, label: t("map.tow"), action: () => fleetAction("tow", {}, t("map.tow")) },
    { icon: CHEST_ICONS.jerrycan, label: t("map.pour"), action: () => fleetAction("pour_jerrycan", {}, t("map.pour")) },
    { icon: "🗺", label: t("hud.map"), action: () => { closeChest(); openMap(); } },
    { icon: "🧾", label: t("hud.sheet"), action: () => { closeChest(); showOverlay("sheet"); } },
    { icon: "📖", label: "Codex", action: () => { closeChest(); showOverlay("help"); } },
  ];
  const cargo = fleet?.cargo || {};
  Object.entries(parts).forEach(([key, part]) => {
    const label = part[language] || part.en || key;
    const owned = Number(cargo[key] || 0);
    slots.push({
      icon: CHEST_ICONS[key] || "📦",
      label: `${label}${owned ? ` ×${owned}` : ""}`,
      cost: part.price,
      action: () => fleetAction("buy", { part: key, qty: 1 }, `${label} — ${part.price} ${currency}`),
      disabled: !services.includes("parts"),
      note: "Parts are sold at garages and markets",
    });
  });
  while (slots.length < 27) slots.push({ icon: "", label: "" });
  slots.slice(0, 27).forEach((slot) => grid.appendChild(chestSlot(slot)));
  const cash = $("chest-cash");
  if (cash) cash.textContent = `${t("vehicle.cash")}: ${Math.round(fleet?.cash || 0)} ${currency}`;
  const note = $("chest-note");
  if (note) note.textContent = node ? node.name : "—";
  const kicker = $("chest-kicker");
  if (kicker) kicker.textContent = t("site.market");
  const title = $("chest-title");
  if (title) title.textContent = node ? node.name : t("site.market");
  const sub = $("chest-sub");
  if (sub) sub.innerHTML = `${t("map.services")}: ${services.join(", ") || "—"} · <kbd>I</kbd> ${language === "tr" ? "kapat" : "closes"}`;
}

let chestOpen = false;

function openChest() {
  if (!session || chestOpen) return;
  chestOpen = true;
  renderChest();
  $("chest")?.classList.remove("hidden");
  world?.setInputEnabled(false);
  audio.click();
}

function closeChest() {
  if (!chestOpen) return;
  chestOpen = false;
  $("chest")?.classList.add("hidden");
  if (!overlayOpen("pause") && !overlayOpen("sheet") && !overlayOpen("help") && !overlayOpen("map-overlay")) {
    world?.setInputEnabled(true);
  }
}

// ── overlays & keys ─────────────────────────────────────────────────────
let chatBound = false;

function bindChatOnce() {
  if (chatBound) return;
  chatBound = true;
  bindChat();
}

function overlayOpen(id) {
  return !$(id)?.classList.contains("hidden");
}

function showOverlay(id) {
  $(id)?.classList.remove("hidden");
  world?.setInputEnabled(false);
}

function hideOverlay(id) {
  $(id)?.classList.add("hidden");
  world?.setInputEnabled(true);
}

function closeAllOverlays() {
  if (gameUI?.isOpen()) gameUI.close();
  ["pause", "sheet", "help"].forEach((id) => hideOverlay(id));
  $("map-overlay")?.classList.add("hidden");
  if (session && !overlayOpen("pause") && !overlayOpen("sheet") && !overlayOpen("help")) {
    world?.setInputEnabled(true);
  }
}

// ── big center title + boss-bar strip ──────────────────────────────────
let centerTimer = null;

 function showCenter(title, sub = "", duration = 2600) {
  const root = $("hud-center");
  if (!root) return;
  const titleEl = $("center-title");
  const subEl = $("center-sub");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
  root.classList.remove("hidden");
  if (centerTimer) clearTimeout(centerTimer);
  centerTimer = setTimeout(() => root.classList.add("hidden"), duration);
}

function showTopBar(text, fraction = 0, duration = 2800) {
  const root = $("hud-top-bar");
  const textEl = $("top-bar-text");
  const fillEl = $("top-bar-fill");
  if (!root) return;
  if (textEl) textEl.textContent = text;
  if (fillEl) fillEl.style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
  root.classList.remove("hidden");
  setTimeout(() => {
    root.classList.add("hidden");
    if (fillEl) fillEl.style.width = "0%";
  }, duration);
}


function refreshChatText() {
  const input = $("chat-input");
  if (input) {
    input.placeholder = chatChannel === "ooc" ? t("hud.chat.ooc") : t("hud.chat.placeholder");
  }
  $("chat-send") && ($("chat-send").textContent = t("hud.send"));
  const channel = $("channel-toggle");
  if (channel) channel.textContent = chatChannel.toUpperCase();
}

function showCenterOnJoin() {
  // Big banner when the player actually enters the world.
  showCenter(
    character.name || t("hud.enter"),
    t("hud.enter.sub"),
    3000,
  );
  showTopBar(t("hud.enter.bar"), 0.05, 1400);
}

function loadCodexForSession() {
  if (codex) {
    renderHelpRules();
    return;
  }
  const base = client?.base || location.origin;
  fetch(`${base}/api/codex`, { cache: "no-store" })
    .then((response) => response.json())
    .then((data) => {
      codex = data.codex || null;
      renderHelpRules();
    })
    .catch(() => { /* rules stay as the short static line */ });
}

function renderHelpRules() {
  const container = $("help-rules");
  if (!container || !codex) return;
  container.innerHTML = `<strong class="rules-title">Table law</strong>
    <ul class="help-rules-list">
      ${(codex.conduct || []).map((rule) => `<li><b>${rule.id}. ${escapeHtml(rule.title)}</b>
        <span>${escapeHtml(rule.body)}</span></li>`).join("")}
    </ul>
    <p class="muted small">${escapeHtml(codex.world?.summary || "")}</p>`;
}

function bindOverlays() {
  $("hud-back")?.addEventListener("click", () => showOverlay("pause"));
  $("pause-resume")?.addEventListener("click", closeAllOverlays);
  $("pause-leave")?.addEventListener("click", () => leaveRoom());
  $("pause-character")?.addEventListener("click", () => { hideOverlay("pause"); showOverlay("sheet"); });
  $("pause-settings")?.addEventListener("click", () => {
    hideOverlay("pause");
    leaveRoom().then(() => menu.switchPanel("settings"));
  });
  $("sheet-close")?.addEventListener("click", () => hideOverlay("sheet"));
  $("help-close")?.addEventListener("click", () => hideOverlay("help"));
  $("chest-close")?.addEventListener("click", () => closeChest());
  $("chest")?.addEventListener("click", (event) => {
    if (event.target.id === "chest") closeChest();
  });
  // Clickable /commands inside chat lines.
  $("chat-log")?.addEventListener("click", (event) => {
    const button = event.target.closest(".chat-cmd");
    if (!button) return;
    event.preventDefault();
    runChatCommand(button.dataset.cmd || "");
  });
  ["pause", "sheet", "help"].forEach((id) => {
    $(id)?.addEventListener("click", (event) => {
      if (event.target.id === id) hideOverlay(id);
    });
  });

  $("hud-map")?.addEventListener("click", () => toggleMap());
  $("map-close")?.addEventListener("click", () => closeMap());
  // Delegated, so rebuilt side panels can never orphan a handler.
  $("map-actions")?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.id === "map-travel") travelToSelected();
    else if (button.id === "map-refuel") fleetAction("refuel", {}, t("map.refuel"));
    else if (button.id === "map-repair") fleetAction("repair", {}, t("map.repair"));
    else if (button.id === "map-tow") fleetAction("tow", {}, t("map.tow"));
    else if (button.id === "map-pour") fleetAction("pour_jerrycan", {}, t("map.pour"));
  });
  $("map-overlay")?.addEventListener("click", (event) => {
    if (event.target.id === "map-overlay") closeMap();
  });
  $("hud-full")?.addEventListener("click", () => toggleFullscreen());
  $("hud-view")?.addEventListener("click", () => world?.toggleView());
  $("hud-weapon")?.addEventListener("click", () => world?.toggleWeapon());
  $("hud-codex")?.addEventListener("click", () => {
    if (overlayOpen("help")) hideOverlay("help");
    else { closeAllOverlays(); showOverlay("help"); }
  });

  $("fear-answer")?.addEventListener("click", () => {
    sendChat("/fear freezes where they stand, hands open, and yields");
    audio.click();
  });
  $("fear-defy")?.addEventListener("click", () => {
    sendChat("/fear holds their ground, blade shaking, and does not run");
    audio.click();
  });

  window.addEventListener("keydown", (event) => {
    const tag = (event.target?.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea";
    if (event.key.toLowerCase() === "f" && !typing && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (!session) return;
    if (event.key === "Escape") {
      if (typing) return;
      if (gameUI?.isOpen()) { gameUI.close(); event.preventDefault(); return; }
      if (overlayOpen("map-overlay")) { closeMap(); event.preventDefault(); return; }
      if (world?.locked) { world.releaseLook(); return; }
      if (overlayOpen("sheet") || overlayOpen("help") || overlayOpen("pause")) {
        closeAllOverlays();
      } else {
        showOverlay("pause");
      }
      event.preventDefault();
      return;
    }
    if (typing) return;
    const key = event.key.toLowerCase();
    if (key === "c") {
      event.preventDefault();
      if (overlayOpen("sheet")) hideOverlay("sheet");
      else { closeAllOverlays(); showOverlay("sheet"); }
    } else if (key === "m") {
      event.preventDefault();
      toggleMap();
    } else if (key === "h" || key === "k") {
      event.preventDefault();
      if (overlayOpen("help")) hideOverlay("help");
      else { closeAllOverlays(); showOverlay("help"); }
    } else if (key === "z") {
      event.preventDefault();
      const meters = world?.hud?.cycleZoom?.();
      if (meters) gameToast(`Radar · ${meters} m`, "");
    } else if (key === "tab") {
      event.preventDefault();
      showTabList(true);
    } else if (key === "i") {
      event.preventDefault();
      toggleGamePanel("kit");
    } else if (key === "j") {
      event.preventDefault();
      toggleGamePanel("market");
    } else if (key === "o") {
      event.preventDefault();
      toggleGamePanel("contracts");
    } else if (key === "y") {
      event.preventDefault();
      toggleGamePanel("trade");
    } else if (key >= "1" && key <= "5" && key.length === 1) {
      event.preventDefault();
      world?.inventoryUI?.useSlot(Number(key) - 1);
    } else if (key === "b") {
      event.preventDefault();
      enterBossGate();
    } else if (key === "t") {
      event.preventDefault();
      toggleTvMode();
    } else if (key === "enter" && !overlayOpen("pause") && !overlayOpen("sheet")
      && !overlayOpen("help") && !overlayOpen("map-overlay")) {
      event.preventDefault();
      $("chat-input")?.focus();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      showTabList(false);
    }
  });
  window.addEventListener("blur", () => showTabList(false));
}

// ── boot ────────────────────────────────────────────────────────────────
// ── control mode (PC / mobile) ──────────────────────────────────────────
// The class on <body> is the only switch: every touch-only rule in the
// stylesheet lives under body.mobile-mode, so the desktop view is untouched.
function applyControlMode() {
  const mobile = isMobileControlMode();
  document.body.classList.toggle("mobile-mode", mobile);
  if (!mobile) document.body.classList.remove("touch-chat-open");
  return mobile;
}

function openTouchChat() {
  document.body.classList.add("touch-chat-open");
  const input = $("chat-input");
  if (!input) return;
  setTimeout(() => input.focus({ preventScroll: true }), 60);
}

async function mountTouchControls() {
  if (touchControls || !world || !applyControlMode()) return;
  try {
    const { TouchControls } = await import("./touch.js");
    // The world can be torn down while the module loads.
    if (!world || touchControls || !isMobileControlMode()) return;
    touchControls = new TouchControls(world, {
      onInteract: () => world?.interact(),
      onView: () => world?.toggleView(),
      onWeapon: () => world?.toggleWeapon(),
      onMap: () => toggleMap(),
      onChat: () => openTouchChat(),
      onInventory: () => toggleGamePanel("kit"),
      onAttack: () => world?.attack(),
      onPause: () => { overlayOpen("pause") ? closeAllOverlays() : showOverlay("pause"); },
    });
    touchControls.start();
  } catch (error) {
    console.warn("[aetherhold] touch controls unavailable", error);
  }
}

function unmountTouchControls() {
  touchControls?.stop();
  touchControls = null;
  document.body.classList.remove("touch-chat-open");
}

function syncTouchControls() {
  if (world && isMobileControlMode()) mountTouchControls();
  else unmountTouchControls();
}

function boot() {
  // TV mode is persisted, so a couch session comes back the way it was left.
  if (settings.tv) document.body.classList.add("tv-mode");
  // Phones get the joystick layout before the first menu frame is painted.
  applyControlMode();
  resize();
  frame();
  applyCinematicLook();

  menu = new MenuUI({
    audio,
    onEnter: (activeClient, data) => startSession(activeClient, data),
    onSettings: (payload) => {
      applyCinematicLook();
      applyControlMode();
      syncTouchControls();
      if (payload.settings && world) world.setSettings(settings);
      if (payload.character && world) world.setCharacter(character);
      if (payload.character) setHudCharacter();
      if (payload.settings) {
        resize();
        audio.applySettings(settings);
      }
    },
  });

  bindOverlays();
  bindChatOnce();
  resize();

  onLanguage(() => {
    translateDom();
    worldMap?.setLanguage(language);
    refreshChatText();
    updateVehicleHud();
    refreshMapSide(mapSelected);
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.classList.toggle("active", button.dataset.language === language);
    });
  });
  refreshChatText();

  document.addEventListener("fullscreenchange", () => {
    menu?.toast?.(document.fullscreenElement ? "Fullscreen" : "Windowed");
  });

  // Show boot screen while connecting to server
  $("boot")?.classList.remove("hidden");
  if ($("boot-text")) $("boot-text").textContent = "Sunucuara bağlanılıyor…";

  menu.connectToServer(menu.client.base, true).then(async (ok) => {
    if (!ok) {
      gameToast("Bağlantı sağlanamadı — sunucuyu başlatın veya Join Server'dan bir adres girin", "bad");
      $("boot")?.classList.add("done");
      setTimeout(() => $("boot")?.classList.add("hidden"), 800);
      return;
    }
    // Reclaim a remembered account before the menu is used, so the header
    // chip and the client id are right from the first frame.
    try { await menu.restoreAccount(); } catch { /* stay a guest */ }

    // A Turkish server greets a first-time visitor in Turkish; an explicit
    // choice on the client is never overridden afterwards.
    let saved = null;
    try { saved = localStorage.getItem("aetherhold.language.v1"); } catch { /* private mode */ }
    try {
      const health = await menu.client.health();
      if (!saved && health?.language && ["en", "tr"].includes(health.language)) {
        setLanguage(health.language);
        refreshChatText();
        menu._onLanguage?.();
      }
    } catch { /* the host is allowed to change its mind */ }

    // Hide boot screen after connection established (don't remove - startSession may need it)
    $("boot")?.classList.add("done");
    setTimeout(() => {
      $("boot")?.classList.add("hidden");
    }, 800);
  }).catch(() => {
    $("boot")?.classList.add("done");
    setTimeout(() => $("boot")?.classList.add("hidden"), 800);
  });

  // Remove boot screen after 5 seconds if still showing (timeout safety)
  // Only remove if startSession hasn't been called yet
  setTimeout(() => {
    if ($("boot") && !$("boot")?.classList.contains("done")) {
      $("boot")?.classList.add("hidden");
    }
  }, 5000);
}

window.addEventListener("beforeunload", () => {
  if (client?.code) {
    navigator.sendBeacon?.(
      `${client.base}/api/rooms/${client.code}/leave`,
      new Blob([JSON.stringify({ token: client.token })], { type: "application/json" })
    );
  }
});

window.__aether = {
  get world() { return world; },
  get session() { return session; },
  get client() { return client; },
  get menu() { return menu; },
  get backdrop() { return backdrop; },
  get fear() { return fearState; },
  get map() { return worldMap; },
  get fleet() { return fleet; },
  get region() { return worldData; },
  openMap,
  closeMap,
  travel: () => travelToSelected(),
  get selected() { return mapSelected; },
  enterFullscreen,
};

boot();
