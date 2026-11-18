// Aetherhold — persistent settings, character and shared look-up tables.

export const CLASSES = {
  Warrior: { icon: "⚔", bonus: "might", blurb: "Front of the line, first to the fire.", base: { might: 9, wits: 4, charm: 5, luck: 4 } },
  Mage:    { icon: "✦", bonus: "wits",  blurb: "Reads the stars like a menu.",        base: { might: 3, wits: 10, charm: 5, luck: 4 } },
  Rogue:   { icon: "🗝", bonus: "luck",  blurb: "Knows a shortcut through the mist.",  base: { might: 5, wits: 6, charm: 5, luck: 9 } },
  Scholar: { icon: "📖", bonus: "wits",  blurb: "Has a footnote for every omen.",      base: { might: 3, wits: 9, charm: 6, luck: 5 } },
  Bard:    { icon: "♪",  bonus: "charm", blurb: "Talks the dragon out of the cave.",  base: { might: 4, wits: 5, charm: 10, luck: 5 } },
  Ranger:  { icon: "➶",  bonus: "luck",  blurb: "Hears the forest breathe.",          base: { might: 6, wits: 6, charm: 4, luck: 8 } },
};

export const STAT_KEYS = ["might", "wits", "charm", "luck"];
export const STAT_LABELS = { might: "Might", wits: "Wits", charm: "Charm", luck: "Luck" };
export const STAT_BUDGET = 26;
export const STAT_MIN = 2;
export const STAT_MAX = 12;

export const CLOAK_COLORS = [
  "#8fb8ff", "#7dd3fc", "#a5f3d0", "#86efac", "#f2c97d", "#fbbf7d",
  "#fb923c", "#ff8a8a", "#f0abfc", "#c4b5fd", "#e8e6f2", "#8b8fa8",
];

export const ACCENTS = ["#f0abfc", "#f2c97d", "#7dd3fc", "#86efac", "#ff8a8a", "#c4b5fd"];

export const SKIN_TONES = ["#f2d3b3", "#e8c3a0", "#d8a97f", "#bf8a5f", "#9a6544", "#6f4530", "#4d2f22"];
export const HAIR_COLORS = ["#2b1f1a", "#3a2a22", "#5a3a26", "#7d4b2a", "#a8743f", "#c9a05b", "#d9d3c4", "#8b8b95", "#7a2e2e"];
export const HAIR_STYLES = ["short", "long", "braid", "curls", "shaved"];
export const BUILDS = ["slight", "average", "tall", "broad"];
export const EYE_COLORS = ["#4a2f1d", "#6b4a2a", "#8a6a3c", "#5c7b52", "#4d7a8c", "#3f5f8f", "#6a6f78", "#2f2a2a"];
export const FACE_SHAPES = ["oval", "square", "heart", "long", "round"];
export const NOSES = ["straight", "broad", "hooked", "small"];
// Skin-level detail sells the face more than any extra polygon: an unshaven
// jaw, sun lines, a scar that healed badly, freckles across the nose.
export const DETAILS = ["clean", "stubble", "beard", "freckled", "scarred", "weathered"];

// Full driver templates. Picking one fills the identity, the history and the
// body together, so a character is a person rather than a bag of sliders.
export const CHARACTER_PRESETS = [
  {
    id: "hauler", name: "Emre Kaya", preset: "hauler",
    en: { title: "Anatolian Hauler", blurb: "Twenty years of freight, coffee, and a bad left knee." },
    tr: { title: "Anadolu Şoförü", blurb: "Yirmi yıllık kamyon, kahve ve bozuk bir sol diz." },
    cls: "Warrior", age: 41, pronouns: "he/him", occupation: "long-haul driver",
    origin: "Ember Marches — the freight yard by the old weighbridge",
    appearance: "Broad, sun-dark, forearms scarred from ratchet straps. Grey creeping in at the temples; a moustache he trims with the truck's cigarette lighter.",
    weakness: "his left knee gives out on stairs, and he is too proud to use the rail",
    fear: "black ice on a mountain pass, after the winter of the overturned trailer",
    dream: "to buy the truck outright and stop owing the yard",
    backstory: "Emre has run the hold's northern freight since the weighbridge was still open. He knows every pothole between the coast and the pass, and he will tell you about all of them whether you ask or not. The debt on the rig is his, not the yard's, and it is the only thing that keeps him moving.",
    color: "#b08968", accent: "#f2c97d", skin: "#bf8a5f", hair: "#3a2a22", hairStyle: "short",
    build: "broad", eyeColor: "#4a2f1d", face: "square", nose: "broad", detail: "stubble",
    stats: { might: 10, wits: 6, charm: 5, luck: 5 },
  },
  {
    id: "courier", name: "Selin Arat", preset: "courier",
    en: { title: "Aegean Courier", blurb: "Fast van, empty tank fund, three unpaid parking tickets." },
    tr: { title: "Ege Kurye", blurb: "Hızlı panelvan, boş depo fonu, üç ödenmemiş park cezası." },
    cls: "Rogue", age: 27, pronouns: "she/her", occupation: "courier",
    origin: "the Salt Road — a depot town that only exists on delivery routes",
    appearance: "Lean and quick, hair cut short with a knife, a chipped tooth she refuses to fix. Wears a courier vest two sizes too big and a watch that stopped a year ago.",
    weakness: "cannot resist a shortcut, even when the map is right and she is not",
    fear: "being stopped with an unmarked parcel in the back",
    dream: "a route of her own, with her name on the manifest",
    backstory: "Selin delivers for whoever pays at the counter, which is how she learned every service road and back gate in the region. She has never had a licence long enough to lose it. The van is hers, technically, if the yard does not check the paperwork too closely.",
    color: "#7dd3fc", accent: "#f0abfc", skin: "#d8a97f", hair: "#2b1f1a", hairStyle: "short",
    build: "slight", eyeColor: "#5c7b52", face: "heart", nose: "small", detail: "scarred",
    stats: { might: 4, wits: 7, charm: 7, luck: 8 },
  },
  {
    id: "mechanic", name: "Derya Usta", preset: "mechanic",
    en: { title: "Steppe Mechanic", blurb: "Fixes anything with a diesel engine and a bad attitude." },
    tr: { title: "Bozkır Tamircisi", blurb: "Dizel motorlu ve huysuz ne varsa tamir eder." },
    cls: "Scholar", age: 35, pronouns: "she/her", occupation: "mechanic",
    origin: "the Ash Chapel — raised by the Wardens, apprenticed to the garage",
    appearance: "Square-faced, grease under the nails, a burn scar on the right wrist shaped like a crescent. Keeps her hair braided tight enough to survive a gearbox job.",
    weakness: "trusts machines more than people, and says so at the worst moment",
    fear: "a repair she cannot diagnose — the silence before the engine turns over",
    dream: "a workshop with a lift, a door that closes, and her name over it",
    backstory: "Derya learned engines in the hold's garage and stayed when the last master left for the coast. She can hear a failing bearing from the cab. She keeps a ledger of every repair she has done and every one she refused, and the second list is shorter than she admits.",
    color: "#86efac", accent: "#f2c97d", skin: "#e8c3a0", hair: "#5a3a26", hairStyle: "braid",
    build: "average", eyeColor: "#6b4a2a", face: "square", nose: "straight", detail: "clean",
    stats: { might: 7, wits: 10, charm: 4, luck: 5 },
  },
  {
    id: "trader", name: "Vey Ardath", preset: "trader",
    en: { title: "Caravan Trader", blurb: "Sells spare parts, gossip, and one genuine secret per season." },
    tr: { title: "Kervan Tüccarı", blurb: "Yedek parça, dedikodu ve sezon başına bir gerçek sır satar." },
    cls: "Bard", age: 52, pronouns: "he/him", occupation: "parts trader",
    origin: "the drowned orchards of Vane — a village now under the reservoir",
    appearance: "Tall and stooped, a nose like a hawk's, rings on three fingers that do not match. A voice that carries across a forecourt without being raised.",
    weakness: "cannot leave a bargain on the table, even a losing one",
    fear: "deep water — will not cross a bridge he cannot see the bottom of",
    dream: "to find the caravan that never arrived, or at least its manifest",
    backstory: "Vey has traded along the hold's roads since before the reservoir was filled. He remembers Vane when it was a village and not a rumour. Everything he owns fits in a caravan truck, and everything he knows is for sale except the one thing people keep asking about.",
    color: "#fbbf7d", accent: "#c4b5fd", skin: "#9a6544", hair: "#8b8b95", hairStyle: "long",
    build: "tall", eyeColor: "#2f2a2a", face: "long", nose: "hooked", detail: "beard",
    stats: { might: 5, wits: 8, charm: 10, luck: 4 },
  },
  {
    id: "northerner", name: "Runa Voss", preset: "northerner",
    en: { title: "Northern Driver", blurb: "Snow chains, a thermos, and no patience for a warm cab." },
    tr: { title: "Kuzey Sürücüsü", blurb: "Kar zinciri, termos ve sıcak kabine hiç sabrı yok." },
    cls: "Ranger", age: 30, pronouns: "they/them", occupation: "pass driver",
    origin: "Frostfall Reaches — north, past the last milestone",
    appearance: "Pale, wind-burned, with a nose that has been broken and set badly. Cropped hair, a scarf that never comes off, and eyes that check the sky before they check you.",
    weakness: "answers a challenge before thinking, and thinks about it for days after",
    fear: "the mist at the edge of the ring, and what it does to voices",
    dream: "one winter with no one stranded on the pass",
    backstory: "Runa drove the Frostfall supply run for six seasons and buried two friends on it. They know the pass the way a surgeon knows a rib. The hold hired them to keep the northern road open; nobody asked what it costs, and Runa has not offered.",
    color: "#c4b5fd", accent: "#7dd3fc", skin: "#f2d3b3", hair: "#d9d3c4", hairStyle: "short",
    build: "slight", eyeColor: "#6a6f78", face: "oval", nose: "straight", detail: "weathered",
    stats: { might: 6, wits: 7, charm: 5, luck: 8 },
  },
  {
    id: "runaway", name: "Nell Harrow", preset: "runaway",
    en: { title: "Harbour Runaway", blurb: "A stolen toolbox, a good ear for engines, a worse ear for advice." },
    tr: { title: "Liman Kaçkını", blurb: "Çalıntı bir takım çantası, iyi bir motor kulağı, berbat bir nasihat kulağı." },
    cls: "Mage", age: 23, pronouns: "she/they", occupation: "electrician's mate",
    origin: "Grey Harbour — a port that stopped answering letters",
    appearance: "Round-faced, freckled, wide-eyed in a way that makes people underestimate her. Curls she cuts herself. Sleeves permanently rolled to the elbow.",
    weakness: "freezes when shouted at, then apologises for freezing",
    fear: "enclosed rooms with one door",
    dream: "to hear her own name spoken without a price attached",
    backstory: "Nell left Grey Harbour with a toolbox that was not hers and a debt that is. She can rewire a truck's whole loom from memory and has done it twice at knifepoint. The hold is the first place nobody has asked where she came from; she is waiting for that to change.",
    color: "#8fb8ff", accent: "#a5f3d0", skin: "#f2d3b3", hair: "#7d4b2a", hairStyle: "curls",
    build: "average", eyeColor: "#4d7a8c", face: "round", nose: "small", detail: "freckled",
    stats: { might: 4, wits: 9, charm: 6, luck: 7 },
  },
];

export const GRAPHICS_PRESETS = {
  low: { label: "Low", scale: 72, shadows: false, fov: 62, pixelRatio: 1.0, renderer: "fast" },
  medium: { label: "Medium", scale: 100, shadows: true, fov: 62, pixelRatio: 1.5, renderer: "standard" },
  high: { label: "High", scale: 115, shadows: true, fov: 64, pixelRatio: 2.0, renderer: "standard" },
  ultra: { label: "Ultra", scale: 130, shadows: true, fov: 66, pixelRatio: 2.0, renderer: "cinematic" },
  cinematic: { label: "GTA-6 Cinematic", scale: 150, shadows: true, fov: 70, pixelRatio: 2.5, renderer: "cinematic" },
  };

// Everything below is written to fit the hold described in the Codex: a neutral
// waystation on a dead caravan road, run by the Wardens of the Ash. Nobody here
// is a tourist who wandered in from another genre.
export const ORIGINS = [
  { name: "Ember Marches", note: "the orchard country, three weeks east" },
  { name: "Frostfall Reaches", note: "north, past the last milestone" },
  { name: "the Salt Road", note: "a caravan route that no longer runs" },
  { name: "the Gilded Flagon", note: "born upstairs, in the room with the loose shutter" },
  { name: "the Ash Chapel", note: "raised by the Wardens and never quite left" },
  { name: "the drowned orchards of Vane", note: "a village now under the reservoir" },
  { name: "Grey Harbour", note: "a port that stopped answering letters" },
  { name: "the Lantern Quarter", note: "the old city, before the second fire" },
];

export const TRADES = [
  "lantern-keeper", "caravan guard", "ledger-clerk", "bone-setter", "bell-founder",
  "ferryman", "map-copyist", "kennelmaster", "rook-watcher", "salt-factor",
  "sword-for-hire", "herb-gatherer", "stone-cutter", "letter-writer",
];

export const WEAKNESSES = [
  "a bad knee from the Frostfall road — it gives out when they run",
  "cannot leave a debt unrecorded, even when silence would save them",
  "drinks to be liked, and is liked most when drunk",
  "freezes when shouted at, then apologises for freezing",
  "trusts anyone who quotes a ledger",
  "will not draw first, even when drawing first is the only sense",
  "hoards candle-ends and cannot explain why",
  "reads people badly and knows it too late",
  "owes the wrong person a favour and cannot say no to them",
];

export const FEARS = [
  "open water — will not board anything that floats",
  "the sound of a bowstring being drawn",
  "being forgotten: no name, no record, no one asking",
  "fire that spreads: they count exits before they sit down",
  "the mist at the edge of the ring, and what it does to voices",
  "horses, after what happened on the Salt Road",
  "being believed — the last time someone believed them, it cost a life",
  "enclosed rooms with one door",
];

export const DREAMS = [
  "to buy back their father's forge before the year turns",
  "to be written into the Wardens' ledger as something other than a debt",
  "a house with two doors and no one else's name on it",
  "to see the Ember Marches green again",
  "to teach one apprentice who outlives them",
  "one season of no one needing anything from them",
  "to find the caravan that never arrived, or its bones",
  "to hear their own name spoken without a price attached",
];

const BACKSTORIES = [
  "{name} came in with the last caravan of the season and stayed when it left without them. The Wardens took the debt on as a favour; {first} has been {trade} ever since, and pays it down a coin at a time.",
  "{name} was born upstairs and has never lived outside the ring. {first} took up {trade} because the hold needed one, not because {first} wanted it, and is only now admitting that might have been a mistake.",
  "Something went wrong on the road from {origin}, and {name} does not tell it the same way twice. What is certain: {first} arrived with nothing, took work as {trade}, and now knows the hold's gossip better than its history.",
  "{name} keeps the hold's small accounts. The ledgers say {first} is owed more than the hold admits, which is why nobody asks {first} to leave and why {first} never quite relaxes.",
  "{name} left {origin} owing the wrong person a favour. The hold is neutral ground, so {first} is safe here — as long as {first} never leaves, and {first} has begun to notice the shape of that bargain.",
  "A fire took {name}'s trade and half their face-worth of pride. {first} came to the hold to be useful as a {trade} and to be somewhere the neighbours did not know the story already.",
];

const NAMES = [
  "Aria Vell", "Bram Hollow", "Sable Quinn", "Orin Thale", "Wren Ash",
  "Ilya Morn", "Cass Vayne", "Dune Rook", "Tamsin Cray", "Emeric Slate",
  "Nell Harrow", "Vey Ardath", "Bettany Quill", "Rooke Adair", "Maud Sallow",
];

export const THEMES = {
  ember:   { key: "ember",   name: "Ember Camp",    sky: "#2a1630", ground: "#3a2a2c", fog: "#1b1220", fire: "#ff8a3c" },
  moonlit: { key: "moonlit", name: "Moonlit Grove", sky: "#0d1733", ground: "#22333a", fog: "#0a1226", fire: "#7fb0ff" },
  frost:   { key: "frost",   name: "Frostfall Ruins", sky: "#26364a", ground: "#5a6b74", fog: "#1c2a36", fire: "#bfe6ff" },
};

export const DEFAULT_SETTINGS = {
  quality: "medium",
  scale: 100,
  fov: 62,
  nameplates: true,
  shadows: true,
  shake: true,
  sensitivity: 100,
  master: 60,
  ambience: 45,
  music: 55,
  sfx: true,
  muted: false,
  bloom: true,
  motion: true,
  // Couch play: bigger HUD, larger text, controller-first prompts.
  tv: false,
  // Input device: "auto" sniffs for a touch screen, "pc" forces keyboard +
  // mouse, "mobile" forces the on-screen joystick and touch buttons.
  controlMode: "auto",
};

export const DEFAULT_CHARACTER = {
  name: "Aria Vell",
  age: 29,
  pronouns: "she/her",
  occupation: "map-copyist",
  origin: "Ember Marches",
  appearance: "Weathered olive coat, ink-stained cuffs, a burn scar along the left jaw. Tall, thin-shouldered, and always cold.",
  weakness: "cannot leave a debt unrecorded, even when silence would save her",
  fear: "the mist at the edge of the ring, and what it does to voices",
  dream: "to see the Ember Marches green again",
  backstory: "Aria came in with the last caravan of the season and stayed when it left without her. The Wardens took the debt on as a favour; she has copied maps for them ever since, and pays it down a coin at a time.",
  cls: "Mage",
  color: "#8fb8ff",
  accent: "#f0abfc",
  skin: "#e8c3a0",
  hair: "#5a3a26",
  hairStyle: "braid",
  build: "average",
  eyeColor: "#6b4a2a",
  face: "oval",
  nose: "straight",
  detail: "clean",
  preset: "cartographer",
  stats: { might: 4, wits: 9, charm: 7, luck: 6 },
};

const SETTINGS_KEY = "aetherhold.settings.v1";
const CHARACTER_KEY = "aetherhold.character.v2";
const CLIENT_KEY = "aetherhold.client.v1";
const SESSION_KEY = "aetherhold.session.v1";

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.token !== "string" || !parsed.token) return null;
    return {
      token: parsed.token,
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : "",
      username: typeof parsed.username === "string" ? parsed.username : "",
    };
  } catch {
    return null;
  }
}

/** The signed-in account kept on this device, or null for a guest. */
export function getAccountSession() {
  return readSession();
}

/**
 * Remember a login. The account id becomes the game's client id, so cash and
 * gear follow the account instead of this browser's random id.
 */
export function setAccountSession(account) {
  if (!account?.token) return null;
  const session = {
    token: String(account.token),
    clientId: String(account.clientId || ""),
    username: String(account.username || ""),
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* private mode */ }
  if (session.clientId) setClientId(session.clientId);
  return session;
}

export function clearAccountSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    // The account id was copied into the client key on sign-in; forgetting the
    // account should not leave a signed-out browser holding it.
    if (parsed?.clientId && localStorage.getItem(CLIENT_KEY) === parsed.clientId) {
      localStorage.removeItem(CLIENT_KEY);
    }
    localStorage.removeItem(SESSION_KEY);
  } catch { /* private mode */ }
}

export function setClientId(value) {
  const clean = String(value || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 64);
  if (!clean) return "";
  try { localStorage.setItem(CLIENT_KEY, clean); } catch { /* private mode */ }
  return clean;
}

export function getClientId() {
  const account = readSession();
  if (account?.clientId) return account.clientId;
  try {
    let value = localStorage.getItem(CLIENT_KEY);
    if (!value) {
      value = (crypto.randomUUID?.() || `c${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`)
        .replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
      localStorage.setItem(CLIENT_KEY, value);
    }
    return value;
  } catch {
    return "anon-client";
  }
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(fallback), ...parsed };
  } catch {
    return structuredClone(fallback);
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

export const settings = read(SETTINGS_KEY, DEFAULT_SETTINGS);
// Older builds stored a boolean here; make sure the mixer always gets a number.
if (typeof settings.music !== "number" || Number.isNaN(settings.music)) {
  settings.music = DEFAULT_SETTINGS.music;
}
export const character = read(CHARACTER_KEY, DEFAULT_CHARACTER);
if (!CLASSES[character.cls]) character.cls = "Adventurer";

export function isMobileControlMode() {
  const mode = settings.controlMode || "auto";
  if (mode === "mobile") return true;
  if (mode === "pc") return false;
  try {
    return ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}

export function saveSettings(patch = {}) {
  Object.assign(settings, patch);
  write(SETTINGS_KEY, settings);
  if (window && window.audioEngine) window.audioEngine.refreshFromSettings();
  return settings;
}

export function saveCharacter(patch = {}) {
  Object.assign(character, patch);
  write(CHARACTER_KEY, character);
  return character;
}

export function clampStats(stats) {
  const out = {};
  let total = 0;
  for (const key of STAT_KEYS) {
    const value = Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(Number(stats?.[key]) || STAT_MIN)));
    out[key] = value;
    total += value;
  }
  return { stats: out, total };
}

export function statsLeft(stats) {
  return STAT_BUDGET - STAT_KEYS.reduce((sum, k) => sum + (Number(stats?.[k]) || 0), 0);
}

export function applyClassBase(cls) {
  const base = CLASSES[cls]?.base || { might: 5, wits: 5, charm: 5, luck: 5 };
  return { ...base };
}

export function characterPayload() {
  return {
    clientId: getClientId(),
    name: character.name,
    cls: character.cls,
    color: character.color,
    accent: character.accent,
    stats: { ...character.stats },
    sheet: {
      age: character.age,
      pronouns: character.pronouns,
      occupation: character.occupation,
      origin: character.origin,
      appearance: character.appearance,
      weakness: character.weakness,
      fear: character.fear,
      dream: character.dream,
      backstory: character.backstory,
      skin: character.skin,
      hair: character.hair,
      hairStyle: character.hairStyle,
      build: character.build,
      eyeColor: character.eyeColor,
      face: character.face,
      nose: character.nose,
      detail: character.detail,
      preset: character.preset,
    },
  };
}

export function sheetRows(value) {
  const age = Number(value?.age) || 0;
  return [
    ["Age", age ? `${age}` : "unspoken"],
    ["Pronouns", value?.pronouns || "—"],
    ["Trade", value?.occupation || "—"],
    ["Origin", value?.origin || "—"],
    ["Appearance", value?.appearance || "—"],
    ["Weakness", value?.weakness || "—"],
    ["Fear", value?.fear || "—"],
    ["Dream", value?.dream || "—"],
    ["History", value?.backstory || "—"],
  ];
}

export function serverBaseFromQuery() {
  const params = new URLSearchParams(location.search);
  const server = params.get("server");
  if (server) return server.replace(/\/$/, "");
  const saved = sessionStorage.getItem("aetherhold.server");
  if (saved) return saved;
  if (location.protocol.startsWith("http")) return location.origin;
  return "http://localhost:8080";
}

export function rememberServer(base) {
  try { sessionStorage.setItem("aetherhold.server", base); } catch { /* ignore */ }
}

export function fullscreenSupported() {
  return Boolean(document.documentElement.requestFullscreen);
}

export function enterFullscreen() {
  if (!fullscreenSupported() || document.fullscreenElement) return false;
  document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => { /* refused */ });
  return true;
}

export function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* ignore */ });
}

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    exitFullscreen();
    return false;
  }
  enterFullscreen();
  return true;
}

export function randomCharacter() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const classes = Object.keys(CLASSES);
  const cls = pick(classes);
  const stats = applyClassBase(cls);
  let pool = STAT_BUDGET - STAT_KEYS.reduce((s, k) => s + stats[k], 0);
  while (pool > 0) {
    const key = pick(STAT_KEYS);
    if (stats[key] < STAT_MAX) { stats[key] += 1; pool -= 1; }
  }

  const name = pick(NAMES);
  const first = name.split(" ")[0];
  const origin = pick(ORIGINS);
  const trade = pick(TRADES);
  const backstory = pick(BACKSTORIES)
    .replaceAll("{name}", name)
    .replaceAll("{first}", first)
    .replaceAll("{trade}", trade)
    .replaceAll("{origin}", origin.name);

  return {
    name,
    age: 19 + Math.floor(Math.random() * 33),
    pronouns: pick(["she/her", "he/him", "they/them", "she/they", "he/they"]),
    occupation: trade,
    origin: `${origin.name} — ${origin.note}`,
    appearance: pick([
      "Sun-dark, knife-sharp, with a chipped front tooth and a coat cut for someone broader.",
      "Grey at the temples, shoulders rolled forward, hands never quite still.",
      "Broad and slow-moving, freckled across the nose, one ear notched like a coin.",
      "Slight, quick-eyed, hair cut short with a blade rather than a comb.",
      "Tall, stooped from years under low beams, with a burn scar mapped across one forearm.",
      "Round-faced and tired, wearing three rings that do not belong to them.",
    ]),
    weakness: pick(WEAKNESSES),
    fear: pick(FEARS),
    dream: pick(DREAMS),
    backstory,
    cls,
    color: pick(CLOAK_COLORS),
    accent: pick(ACCENTS),
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_COLORS),
    hairStyle: pick(HAIR_STYLES),
    build: pick(BUILDS),
    eyeColor: pick(EYE_COLORS),
    face: pick(FACE_SHAPES),
    nose: pick(NOSES),
    detail: pick(DETAILS),
    preset: "",
    stats,
  };
}

export function applyPreset(presetId) {
  const preset = CHARACTER_PRESETS.find((item) => item.id === presetId);
  if (!preset) return null;
  const copy = structuredClone(preset);
  delete copy.en;
  delete copy.tr;
  return copy;
}
