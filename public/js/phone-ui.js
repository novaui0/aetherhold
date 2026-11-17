// phone-ui.js — Aetherhold telefon UI (DOM tabanlı panel)
// Bu dosya telefon.js sistem katmanını, inventory.js'i kullanır.
// Telefon ekranı ana HUD'un üzerine bind edilir.

import { PhoneSystem } from "./phone.js";
import { t } from "./i18n.js";

export class PhoneUI {
  constructor(host, { phone, inventory } = {}) {
    this.host = host; // World veya benzeri bir bağlanabilir sayaç
    this.phone = phone || new PhoneSystem(host?.playerId || "local");
    this.inventory = inventory;
    this.phone.bindInventory(inventory);
    this.panel = null;
    this.activeApp = null;
    this.visible = false;
    this._build();
  }

  _build() {
    if (!this.host?.element) return;
    const root = this.host.element;

    this.panel = document.createElement("div");
    this.panel.className = "phone-panel";
    this.panel.innerHTML = `
      <div class="phone-screen">
        <div class="phone-notch"></div>
        <div class="phone-header">
          <span class="phone-time">--:--</span>
          <button class="phone-close" title="Kapat">×</button>
        </div>
        <div class="phone-apps">
          ${this._appGridHTML()}
        </div>
        <div class="phone-content" data-app-area>
          <div class="phone-empty">Uygulama seçin</div>
        </div>
        <div class="phone-notifications" data-notif-area></div>
      </div>
    `;

    root.appendChild(this.panel);
    this._bindEvents();
  }

  _appGridHTML() {
    const apps = this.phone.appList();
    return apps.map(app => `
      <button class="phone-app-btn" data-app="${app.id}">
        <span class="phone-app-icon">${app.icon}</span>
        <span class="phone-app-label">${app.label}</span>
      </button>
    `).join("");
  }

  _bindEvents() {
    if (!this.panel) return;
    const panel = this.panel;

    panel.querySelector(".phone-close").addEventListener("click", () => this.close());

    panel.querySelector("[data-app-area]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-app]");
      if (!btn) return;
      this.openApp(btn.getAttribute("data-app"));
    });

    // Uygulama butonlarını dinle (bu, panel oluşturulduktan sonra eklenen event.)
    panel.querySelectorAll(".phone-app-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.openApp(btn.getAttribute("data-app"));
      });
    });
  }

  open() {
    if (!this.panel) this._build();
    if (!this.panel) return;
    this.visible = true;
    this.panel.classList.remove("phone-hidden");
    this.phone.unlock();
    this._updateTime();
  }

  close() {
    this.visible = false;
    if (this.panel) this.panel.classList.add("phone-hidden");
    this.phone.lock();
  }

  toggle() {
    this.visible ? this.close() : this.open();
  }

  isOpen() { return this.visible; }

  openApp(appId) {
    const app = this.phone.apps.get(appId);
    if (!app) return;
    this.activeApp = appId;
    const area = this.panel?.querySelector("[data-app-area]");
    if (!area) return;
    if (typeof app.render === "function") {
      area.innerHTML = app.render({
        t: (key) => t(key),
        phone: this.phone,
        inventory: this.inventory,
      });
    } else {
      area.innerHTML = `<div class="phone-empty">Uygulama yükleniyor…</div>`;
    }
    this._refreshNotifications();
  }

  _updateTime() {
    const el = this.panel?.querySelector(".phone-time");
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  _refreshNotifications() {
    const area = this.panel?.querySelector("[data-notif-area]");
    if (!area) return;
    const notifs = this.phone.notifications.slice(0, 8);
    area.innerHTML = notifs.length === 0
      ? `<div class="phone-empty">Bildirim yok</div>`
      : notifs.map(n => `
        <div class="phone-notif ${n.kind}">
          <div class="phone-notif-title">${n.title}</div>
          <div class="phone-notif-body">${n.body}</div>
        </div>
      `).join("");
  }

  setHost(host) {
    this.host = host;
    if (!this.panel) this._build();
  }
}

// Telefon bildirimleri için helper event adı (ana oyunun kullanımı için)
export function notifyPhone(phone, opts) {
  phone.notify(opts);
}
