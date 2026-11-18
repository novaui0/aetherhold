// inventory.js — the bag the HUD and the hotbar read.
//
// The authoritative list of what the player owns lives on the server
// (profile.items, saved in server.py). This module is the mirror: it resolves
// icons and stacks, totals the weight, and picks the five items the hotbar
// offers. Nothing here decides ownership — every equip, use or sale goes back
// through GameClient.profile() and the reply is applied over the top.
//
// The Turkish screen that used to live here never rendered: it asked its host
// for `host.element`, which the world does not have. This version keeps the
// name and the constructor shape so world.initSystems() keeps working, and
// draws the hotbar the old one was supposed to draw.

import { ITEM_CATALOGUE, itemPresentation } from "./profile.js";

export const HOTBAR_SLOTS = 5;
export const BAG_CAPACITY = 24;

// Rough carry weights, by category. The server does not track mass, so the
// figure is presentation only — but it gives the bag a shape.
const CATEGORY_WEIGHT = {
  weapon: 2.6, attach: 0.8, food: 0.4, drink: 0.6, metals: 2.2,
  textile: 0.2, documents: 0.05, keys: 0.05, misc: 0.15,
};

// What the hotbar will offer, in this order: something to shoot, something to
// eat, something to drink, and the rest of the consumables.
const QUICK_ORDER = ["weapon", "food", "drink", "attach", "misc"];

export class Inventory {
  constructor(ownerId) {
    this.ownerId = ownerId || "local";
    this.items = [];
    this.equipped = "fists";
    this.weapon = null;
    this.ammo = 0;
    this.cash = 0;
    this.currency = "₺";
    this.hotbar = new Array(HOTBAR_SLOTS).fill(null);
    this.listeners = new Set();
    this.updatedAt = 0;
  }

  /** Mirror a server profile payload into the bag. */
  sync(profileData) {
    const data = profileData || null;
    const rawItems = Array.isArray(data?.items) ? data.items : [];
    this.items = rawItems
      .filter((entry) => entry && entry.key && Number(entry.qty) > 0)
      .map((entry) => {
        const fallback = itemPresentation(entry.key);
        const category = entry.category || fallback.category || "misc";
        return {
          key: entry.key,
          qty: Number(entry.qty) || 1,
          name: entry.name || fallback.name,
          category,
          icon: entry.icon || fallback.icon || "📦",
          desc: entry.desc || fallback.desc || "",
          price: Number(entry.price) || 0,
          damage: Number(entry.damage) || 0,
          range: Number(entry.range) || 0,
          heal: Number(entry.heal) || 0,
          ammo: Boolean(entry.ammo),
          weight: CATEGORY_WEIGHT[category] ?? 0.1,
        };
      });
    this.equipped = data?.equipped || "fists";
    this.weapon = data?.weapon || null;
    this.ammo = Number(data?.ammo) || 0;
    this.cash = Number(data?.cash) || 0;
    this.currency = data?.currency || "₺";
    this.updatedAt = Date.now();
    this._buildHotbar();
    this.emit();
    return this;
  }

  /** Fill the five quick slots: weapon first, then consumables by priority. */
  _buildHotbar() {
    const slots = new Array(HOTBAR_SLOTS).fill(null);
    const used = new Set();

    // Slot 1 is always the weapon in hand (or bare hands).
    const weapon = this.items.find((item) => item.category === "weapon" && item.key === this.equipped)
      || this.items.find((item) => item.category === "weapon");
    if (weapon) {
      slots[0] = { ...weapon, slot: "weapon" };
      used.add(weapon.key);
    } else {
      slots[0] = {
        key: "fists", qty: 1, name: this.weapon?.name || "Bare hands",
        category: "weapon", icon: this.weapon?.icon || "✊", weight: 0, damage: this.weapon?.damage || 5,
      };
    }

    // Slots 2..5: the first items of each quick category, then anything left
    // that can be used, then the rest of the kit so the bar is never empty
    // while the pockets are not.
    const usable = this.items.filter((item) => !used.has(item.key));
    const ordered = [];
    for (const category of QUICK_ORDER) {
      for (const item of usable) {
        if (item.category === category && !ordered.includes(item)) ordered.push(item);
      }
    }
    for (const item of usable) if (!ordered.includes(item)) ordered.push(item);

    for (let i = 1; i < HOTBAR_SLOTS && ordered.length; i += 1) {
      const item = ordered.shift();
      if (!item) break;
      slots[i] = { ...item, slot: "quick" };
    }
    this.hotbar = slots;
  }

  onChange(fn) {
    if (typeof fn !== "function") return () => {};
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of [...this.listeners]) {
      try { fn(this); } catch (error) { console.error("[aetherhold] inventory listener failed", error); }
    }
  }

  all() { return this.items.slice(); }

  count() { return this.items.length; }

  find(key) { return this.items.find((item) => item.key === key) || null; }

  qty(key) { return this.find(key)?.qty || 0; }

  get free() { return Math.max(0, BAG_CAPACITY - this.items.length); }

  get weight() {
    return this.items.reduce((sum, item) => sum + item.weight * item.qty, 0);
  }

  /** The item behind a hotbar slot (0-based), or null. */
  slot(index) {
    return this.hotbar[index] || null;
  }

  // PhoneSystem proxies item use through this name; the hotbar is the real
  // caller, so keep it working for the phone screen too.
  use(slotKey, ctx) {
    const item = this.find(slotKey);
    if (!item) return { ok: false, reason: "inv:missing" };
    return { ok: false, reason: "inv:server", item, ctx };
  }
}

export { ITEM_CATALOGUE };
