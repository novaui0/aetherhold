// inventory.js — Aetherhold inventory (no-UI, data + logic layer)
// Eşyalar 16 kategoriye ayrılır; her eşyada ağırlık, büyüklük, kullanım fonksiyonu ve etiket olabilir.
// Bu dosya sadece veri+logik içerir; render/UI ayrı sırasında eklenir.

export const INV_CATEGORIES = [
  { id: "weapon",  label: i18n => i18n.t("inv.weapon"),  icon: "weapon" },
  { id: "tool",    label: i18n => i18n.t("inv.tool"),    icon: "tool" },
  { id: "food",    label: i18n => i18n.t("inv.food"),    icon: "food" },
  { id: "drink",   label: i18n => i18n.t("inv.drink"),   icon: "drink" },
  { id: "attach",  label: i18n => i18n.t("inv.attach"),  icon: "attach" },
  { id: "metals",  label: i18n => i18n.t("inv.metals"),  icon: "metals" },
  { id: "textile", label: i18n => i18n.t("inv.textile"), icon: "textile" },
  { id: "documents", label: i18n => i18n.t("inv.documents"), icon: "documents" },
  { id: "keys",    label: i18n => i18n.t("inv.keys"),    icon: "keys" },
  { id: "misc",    label: i18n => i18n.t("inv.misc"),    icon: "misc" },
];

export class Inventory {
  constructor(ownerId) {
    this.ownerId = ownerId;
    this.slots = new Map();       // slotKey -> item
    this.nextSlot = 0;
    this.maxSlots = 40;
  }

  // Kanal > kategori > list şemasında kurgulanır. Slot key şablonu: `${category}:${seq}`.
  add(item) {
    if (this.slots.size >= this.maxSlots) return { ok: false, reason: "inv:full" };
    const key = `${item.category}:${this.nextSlot++}`;
    item.slotKey = key;
    item.id = item.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    item.ownerId = this.ownerId;
    item.placer = item.placer || "inventory";
    item.createdAt = Date.now();
    this.slots.set(key, item);
    return { ok: true, slotKey: key };
  }

  remove(slotKey) {
    const item = this.slots.get(slotKey);
    if (!item) return null;
    this.slots.delete(slotKey);
    return item;
  }

  get(slotKey) { return this.slots.get(slotKey) || null; }

  list(category) {
    const out = [];
    for (const item of this.slots.values()) {
      if (item.category === category) out.push(item);
    }
    return out;
  }

  all() {
    return Array.from(this.slots.values());
  }

  count() { return this.slots.size; }

  // Kullanım: eşyanın action fonksiyonunu çalıştırır, gerekirse eşyayı tüketir.
  use(slotKey, ctx) {
    const item = this.slots.get(slotKey);
    if (!item) return { ok: false, reason: "inv:missing" };
    if (!item.action) return { ok: false, reason: "inv:not usable" };
    const result = item.action(item, ctx);
    if (result?.consumed) this.slots.delete(slotKey);
    return { ok: true, result };
  }

  // Şablon eşya üretimi. Gerçek oyunda bu bir cot Shop/Acquire source'dan gelir.
  static make(template) {
    return {
      ...template,
      id: template.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      createdAt: Date.now(),
    };
  }
}

// ── hazır şablonlar ────────────────────────────────────────────────────────
// Bu liste oyunun içeriğini tanımlar; gerçek projede bir JSON/content pack ile beslenir.

export const ITEM_TEMPLATES = {
  // Silahlar
  pistol: {
    name: "Pistol",
    plural: "Pistols",
    category: "weapon",
    weight: 0.9,
    size: "1",
    damage: 18,
    range: "short",
    action: (item, ctx) => {
      if (!ctx.world) return { ok: false, reason: "no world" };
      ctx.world.weapon = item.name;
      ctx.world.stats.armor = Math.max(0, (ctx.world.stats.armor || 0) - 1);
      return { ok: true, log: `${item.name} kullanıma geçildi`, consumed: false };
    },
  },
  knife: {
    name: "Dagger",
    category: "weapon",
    weight: 0.4,
    damage: 14,
    range: "melee",
    action: (item, ctx) => {
      if (!ctx.world) return { ok: false, reason: "no world" };
      ctx.world.weapon = item.name;
      return { ok: true, log: `Huçreye ${item.name} alınd`, consumed: false };
    },
  },
  // Aksesuarlar / Araçlar
  flashlight: {
    name: "Fener",
    category: "tool",
    weight: 0.3,
    action: (item, ctx) => {
      ctx.world && (ctx.world.weapon = "fener");
      return { ok: true, log: "Fener yanıyor", consumed: false };
    },
  },
  lockpick: {
    name: "Kilit Açma Seti",
    category: "tool",
    weight: 0.2,
    action: (item, ctx) => {
      return { ok: true, log: "Kilit açma denemesi...", consumed: true };
    },
  },
  // Yemek / İçecek
  burger: {
    name: "Lonom Burger",
    category: "food",
    weight: 0.3,
    restore: 12,
    action: (item, ctx) => {
      if (!ctx.world) return { ok: false, reason: "no world" };
      ctx.world.stats.health = Math.min(100, (ctx.world.stats.health || 0) + (item.restore || 0));
      return { ok: true, log: "Yemek yedi — sağlık arttı", consumed: true };
    },
  },
  water: {
    name: "Su Şişesi",
    category: "drink",
    weight: 0.5,
    restore: 8,
    action: (item, ctx) => {
      if (!ctx.world) return { ok: false, reason: "no world" };
      ctx.world.stats.health = Math.min(100, (ctx.world.stats.health || 0) + (item.restore || 0));
      return { ok: true, log: "Su içti", consumed: true };
    },
  },
  // Dokümanlar / Anahtarlar
  id_card: {
    name: "Kimlik Kartı",
    category: "documents",
    weight: 0.05,
    description: "Aetherhold Kimlik",
  },
  key_mall: {
    name: "Avm Anahtarı",
    category: "keys",
    weight: 0.05,
    unlocks: ["mall_entrance"],
    description: "Avm giriş anahtarı",
  },
  // Metal / Dokuma
  steel_scrap: {
    name: "Çelik Çöpü",
    category: "metals",
    weight: 2.0,
    description: "Hırdavat için kullanılabilir.",
  },
  leather_strap: {
    name: "Deri Kayış",
    category: "textile",
    weight: 0.15,
    description: "Tamir veya üretim için.",
  },
  // Genel
  wallet: {
    name: "Cüzdan",
    category: "misc",
    weight: 0.1,
    description: "Boş cüzdan.",
  },
  note: {
    name: "Not Kağıdı",
    category: "misc",
    weight: 0.02,
    description: "Bir şeyleri not etmek istersen.",
  },
};
