// phone.js — Aetherhold telefon (veri+logik katmanı, DOM yok)
// Telefon üç katmandan oluşur: sistem (bildirimler), uygulamalar (harita, mesaj, çalma listesi, ayarlar)
// ve envanter entegrasyonu (eşyaların telefon üzerinden de görünüp kullanılması).

export class PhoneSystem {
  constructor(ownerId) {
    this.ownerId = ownerId;
    this.apps = new Map();
    this.notifications = [];
    this.calls = [];
    this.messages = [];
    this.musicQueue = [];
    this.musicNow = null;
    this.volume = 1;
    this.muted = false;
    this.battery = 100;
    this.screenOn = true;
    this.locked = false;
    this._initApps();
  }

  _initApps() {
    this.apps.set("dialer", {
      id: "dialer",
      label: "Arama",
      icon: "dialer",
      order: 1,
      render: (ctx) => ctx.t("phone.app.dialer"),
    });
    this.apps.set("contacts", {
      id: "contacts",
      label: "Kişiler",
      icon: "contacts",
      order: 2,
      render: (ctx) => ctx.t("phone.app.contacts"),
    });
    this.apps.set("messages", {
      id: "messages",
      label: "Mesajlar",
      icon: "messages",
      order: 3,
      render: (ctx) => ctx.t("phone.app.messages"),
    });
    this.apps.set("map", {
      id: "map",
      label: "Harita",
      icon: "map",
      order: 4,
      render: (ctx) => ctx.t("phone.app.map"),
    });
    this.apps.set("music", {
      id: "music",
      label: "Müzik",
      icon: "music",
      order: 5,
      render: (ctx) => ctx.t("phone.app.music"),
    });
    this.apps.set("settings", {
      id: "settings",
      label: "Ayarlar",
      icon: "settings",
      order: 9,
      render: (ctx) => ctx.t("phone.app.settings"),
    });
  }

  // Bildirim ekleme. Bildirimler ana menüden değil, telefon içinde listelenir.
  notify({ title, body, kind = "info", action = null }) {
    const n = {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      title,
      body,
      kind,
      action,
      at: Date.now(),
    };
    this.notifications.unshift(n);
    if (this.notifications.length > 50) this.notifications.pop();
    return n;
  }

  // Bildirimleri kategorize etme yardımcı.
  notificationsFor(kind) {
    return this.notifications.filter(n => n.kind === kind);
  }

  // Arama geçmişi basit.
  call(contactId, durationSec = 0) {
    const call = {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      contactId,
      startedAt: Date.now(),
      durationSec,
      endedAt: null,
      status: "active",
    };
    this.calls.unshift(call);
    if (this.calls.length > 100) this.calls.pop();
    return call;
  }

  endCall(callId) {
    const call = this.calls.find(c => c.id === callId);
    if (!call) return null;
    call.endedAt = Date.now();
    call.status = "ended";
    call.durationSec = Math.max(0, (call.endedAt - call.startedAt) / 1000);
    return call;
  }

  // Mesaj greedisi.
  sendMessage(to, text) {
    const msg = {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      from: this.ownerId,
      to,
      text,
      at: Date.now(),
      read: false,
    };
    this.messages.unshift(msg);
    if (this.messages.length > 200) this.messages.pop();
    return msg;
  }

  unreadCount() {
    return this.messages.filter(m => !m.read).length;
  }

  // Müzik kuyruk yönetimi.
  enqueueTrack(track) {
    this.musicQueue.push(track);
  }

  playNext() {
    if (this.musicQueue.length === 0) { this.musicNow = null; return null; }
    this.musicNow = this.musicQueue.shift();
    return this.musicNow;
  }

  stop() {
    this.musicNow = null;
  }

  // Telefon ekranı kilidi / açma.
  lock() { this.locked = true; this.screenOn = false; }
  unlock() { this.locked = false; this.screenOn = true; }
  togglePower() { this.screenOn = !this.screenOn; if (!this.screenOn) this.locked = true; }

  // Akü süresi simüle.
  tick(dtSec) {
    if (!this.screenOn) {
      this.battery = Math.max(0, this.battery - dtSec * 0.05);
    } else {
      this.battery = Math.max(0, this.battery - dtSec * 0.4);
    }
    if (this.battery === 0) this.screenOn = false;
  }

  // Telefon ile envanter birleştirme: eşyaya telefon üzerinden erişmek için
  // envanter referansını ekler. UI katmanı bu referansı kullanır.
  bindInventory(inventory) {
    this.inventory = inventory;
  }

  // Telefon üzerinden eşya kullanımı (envanterin use yöntemini proxy eder).
  useItem(slotKey, ctx) {
    if (!this.inventory) return { ok: false, reason: "phone:no inventory" };
    return this.inventory.use(slotKey, ctx);
  }

  // Uygulama listesini sıralı döndürür.
  appList() {
    return Array.from(this.apps.values()).sort((a, b) => a.order - b.order);
  }
}
