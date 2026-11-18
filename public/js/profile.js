// profile.js — the server-owned character sheet.
//
// Cash, gear, contract progress and the boss bands all live in server.py. This
// module is a thin mirror: the UI reads it, every mutation goes through
// GameClient.profile(), and the authoritative reply is applied back here.
// Nothing in this file decides what the player owns.

export const ITEM_CATALOGUE = {
  fists: { name: "Bare hands", category: "weapon", icon: "✊", desc: "Better than nothing." },
  knife: { name: "Dagger", category: "weapon", icon: "🔪", desc: "Close and quiet." },
  pistol: { name: "Pistol", category: "weapon", icon: "🔫", desc: "A reliable sidearm." },
  shotgun: { name: "Shotgun", category: "weapon", icon: "💥", desc: "Twelve-gauge persuasion." },
  carbine: { name: "Carbine", category: "weapon", icon: "🎯", desc: "Longer reach, faster cycle." },
  ammo: { name: "Ammo box", category: "attach", icon: "🧨", desc: "Rounds for your guns." },
  medkit: { name: "Medkit", category: "food", icon: "🩹", desc: "Stops the bleeding." },
  burger: { name: "Lonom Burger", category: "food", icon: "🍔", desc: "Technically food." },
  water: { name: "Water bottle", category: "drink", icon: "💧", desc: "The city is thirsty." },
  scrap: { name: "Steel scrap", category: "metals", icon: "⚙️", desc: "Sold by the kilo." },
  leather: { name: "Leather strap", category: "textile", icon: "🪢", desc: "Tanned and useful." },
  id_card: { name: "Aetherhold ID", category: "documents", icon: "🪪", desc: "Your name, your face." },
  trophy: { name: "Pale Warden's signet", category: "misc", icon: "💠", desc: "The fifth band fell to you." },
};

export const TRADEABLE = Object.keys(ITEM_CATALOGUE).filter((key) => key !== "fists");

export function itemPresentation(key) {
  return ITEM_CATALOGUE[key] || { name: key, category: "misc", icon: "📦", desc: "" };
}

export function formatCash(value, currency = "₺") {
  const number = Math.round(Number(value) || 0);
  return `${number.toLocaleString("en-US")} ${currency}`;
}

export class Profile {
  constructor() {
    this.data = null;
    this._listeners = new Set();
  }

  apply(payload) {
    if (!payload || typeof payload !== "object") return;
    this.data = payload;
    this.emit();
  }

  reset() {
    this.data = null;
    this.emit();
  }

  onChange(fn) {
    if (typeof fn !== "function") return () => {};
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit() {
    for (const fn of [...this._listeners]) {
      try { fn(this); } catch (error) { console.error("[aetherhold] profile listener failed", error); }
    }
  }

  get ready() { return Boolean(this.data); }
  get cash() { return Number(this.data?.cash) || 0; }
  get currency() { return this.data?.currency || "₺"; }
  get level() { return Number(this.data?.level) || 1; }
  get xp() { return Number(this.data?.xp) || 0; }
  get xpNext() { return Number(this.data?.xpNext) || 220; }
  get kills() { return Number(this.data?.kills) || 0; }
  get band() { return Number(this.data?.band) || 1; }
  get equipped() { return this.data?.equipped || "fists"; }
  get weapon() { return this.data?.weapon || { key: "fists", name: "Bare hands", damage: 5, range: 2, rate: 0.55, ammo: false }; }
  get ammo() { return Number(this.data?.ammo) || 0; }
  get items() { return Array.isArray(this.data?.items) ? this.data.items : []; }
  get contract() { return this.data?.contract || null; }
  get boss() { return this.data?.boss || { active: false, hp: 0, maxHp: 0, band: 0 }; }
  get bands() { return Array.isArray(this.data?.bands) ? this.data.bands : []; }

  item(key) {
    return this.items.find((entry) => entry.key === key) || null;
  }

  count(key) {
    return this.item(key)?.qty || 0;
  }

  canUse(key) {
    return Boolean(this.item(key)?.heal);
  }
}
