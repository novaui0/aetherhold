// inventory-ui.js — Aetherhold envanter UI (DOM tabanlı panel)
// Bu dosya inventory.js veri katmanını kullanır ve envanterin yan panel olarak görünürlüğünü yönetir.
// Oyunun HUD'u ile uyumlu olacak şekilde tasarlanmıştır (GTA-benzeri yan çerçeve).

import { Inventory, INV_CATEGORIES } from "./inventory.js";
import { t } from "./i18n.js";

export class InventoryUI {
  constructor(host, { inventory, phone } = {}) {
    this.host = host;
    this.inventory = inventory;
    this.phone = phone;
    this.panel = null;
    this.visible = false;
    this.selectedSlot = null;
    this.selectedCategory = "weapon";
    this._build();
  }

  _build() {
    if (!this.host?.element) return;
    const root = this.host.element;

    this.panel = document.createElement("div");
    this.panel.className = "inv-panel";
    this.panel.innerHTML = `
      <div class="inv-header">
        <span class="inv-title">Envanter</span>
        <span class="inv-count" data-count>0 / ${40}</span>
        <button class="inv-close" title="Kapat">×</button>
      </div>
      <div class="inv-tabs" data-tabs>
        ${INV_CATEGORIES.map(cat => `
          <button class="inv-tab" data-cat="${cat.id}">${cat.icon}</button>
        `).join("")}
      </div>
      <div class="inv-grid" data-grid></div>
      <div class="inv-detail" data-detail>
        <div class="inv-empty">Eşya seçin</div>
      </div>
      <div class="inv-footer">
        <button class="inv-use btn" data-action="use">Kullan</button>
        <button class="btn" data-action="drop">Bırak</button>
      </div>
    `;

    root.appendChild(this.panel);
    this._bindEvents();
  }

  _bindEvents() {
    if (!this.panel) return;
    const panel = this.panel;

    panel.querySelector(".inv-close").addEventListener("click", () => this.close());

    panel.querySelector("[data-tabs]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      this.selectedCategory = btn.getAttribute("data-cat");
      this._renderGrid();
    });

    panel.querySelector("[data-grid]").addEventListener("click", (e) => {
      const card = e.target.closest("[data-slot]");
      if (!card) return;
      const slotKey = card.getAttribute("data-slot");
      this.selectedSlot = slotKey;
      this._renderGrid();
      this._renderDetail();
    });

    panel.querySelector("[data-detail]").addEventListener("click", (e) => {
      // Detay panelinden de kullanabilir.
      if (e.target.closest("[data-action='use']")) this._doUse();
      if (e.target.closest("[data-action='drop']")) this._doDrop();
    });

    panel.querySelector(".inv-footer").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.getAttribute("data-action") === "use") this._doUse();
      if (btn.getAttribute("data-action") === "drop") this._doDrop();
    });
  }

  open() {
    if (!this.panel) this._build();
    if (!this.panel) return;
    this.visible = true;
    this.panel.classList.remove("inv-hidden");
    this._renderGrid();
    if (this.selectedSlot) this._renderDetail();
  }

  close() {
    this.visible = false;
    if (this.panel) this.panel.classList.add("inv-hidden");
    this.selectedSlot = null;
  }

  toggle() { this.visible ? this.close() : this.open(); }

  isOpen() { return this.visible; }

  _renderGrid() {
    const grid = this.panel?.querySelector("[data-grid]");
    if (!grid) return;
    const items = this.inventory.list(this.selectedCategory);
    if (items.length === 0) {
      grid.innerHTML = `<div class="inv-empty">Bu kategoride eşya yok</div>`;
      return;
    }
    grid.innerHTML = items.map(item => `
      <div class="inv-card ${this.selectedSlot === item.slotKey ? "selected" : ""}" data-slot="${item.slotKey}">
        <div class="inv-card-icon">${item.icon || item.category?.icon || "📦"}</div>
        <div class="inv-card-name">${item.name}</div>
        <div class="inv-card-meta">
          ${item.weight ? `${item.weight} kg` : ""}
          ${item.damage ? `· ${item.damage} hasar` : ""}
        </div>
      </div>
    `).join("");

    // Slot kartlarına tıklama yeniden bağla (yeni DOM için)
    grid.querySelectorAll("[data-slot]").forEach(card => {
      card.addEventListener("click", () => {
        const slotKey = card.getAttribute("data-slot");
        this.selectedSlot = slotKey;
        this._renderGrid();
        this._renderDetail();
      });
    });

    // Sayacı güncelle
    const countEl = this.panel?.querySelector("[data-count]");
    if (countEl) countEl.textContent = `${this.inventory.count()} / ${this.inventory.maxSlots}`;
  }

  _renderDetail() {
    const detail = this.panel?.querySelector("[data-detail]");
    if (!detail) return;
    if (!this.selectedSlot) {
      detail.innerHTML = `<div class="inv-empty">Eşya seçin</div>`;
      return;
    }
    const item = this.inventory.get(this.selectedSlot);
    if (!item) {
      detail.innerHTML = `<div class="inv-empty">Eşya bulunamadı</div>`;
      this.selectedSlot = null;
      return;
    }

    const canUse = typeof item.action === "function";
    detail.innerHTML = `
      <div class="inv-detail-inner">
        <div class="inv-detail-icon">${item.icon || item.category?.icon || "📦"}</div>
        <div class="inv-detail-info">
          <div class="inv-detail-name">${item.name}</div>
          <div class="inv-detail-desc">${item.description || item.category?.label?.(t) || ""}</div>
          <div class="inv-detail-stats">
            ${item.weight ? `<div>Ağırlık: ${item.weight} kg</div>` : ""}
            ${item.damage ? `<div>Hasar: ${item.damage}</div>` : ""}
            ${item.restore ? `<div>Sağlık: +${item.restore}</div>` : ""}
            ${item.range ? `<div>Menzil: ${item.range}</div>` : ""}
          </div>
        </div>
      </div>
    `;
    const useBtn = detail.querySelector("[data-action='use']");
    if (useBtn) useBtn.disabled = !canUse;
  }

  _doUse() {
    if (!this.selectedSlot) return;
    const ctx = this._buildCtx();
    const res = this.inventory.use(this.selectedSlot, ctx);
    if (res.ok) {
      if (res.result?.log) this._toast(res.result.log);
      if (res.result?.consumed) {
        this.selectedSlot = null;
        this._renderGrid();
        this._renderDetail();
      }
    }
  }

  _doDrop() {
    if (!this.selectedSlot) return;
    const item = this.inventory.remove(this.selectedSlot);
    if (item) {
      this.selectedSlot = null;
      this._renderGrid();
      this._renderDetail();
      this._toast(`${item.name} bırakıldı`);
    }
  }

  _buildCtx() {
    return {
      world: this.host?.world || null,
      phone: this.phone,
      inventory: this.inventory,
      player: this.host,
    };
  }

  _toast(msg) {
    if (typeof this.host?.toast === "function") {
      this.host.toast(msg);
    } else if (typeof window !== "undefined" && window.gameToast) {
      window.gameToast(msg);
    }
  }

  // Envantere eşya eklemek için dışarıdan erişim.
  addItem(template) {
    const res = this.inventory.add(template);
    if (res.ok) {
      this._renderGrid();
      if (this.phone) {
        this.phone.notify({
          title: "Yeni eşya",
          body: template.name,
          kind: "item",
        });
      }
    }
    return res;
  }

  // World (veya benzeri bir host) sonradan bağlanabilsin. PhoneUI ile aynı
  // sözleşme: main.js girişte world.envanterUI.setHost(world) çağırıyor.
  setHost(host) {
    this.host = host;
    if (!this.panel) this._build();
  }

  // Telefon sistemine envanter bağla (eğer daha önce bağlanmamışsa)
  attachToPhone(phone) {
    if (!this.phone) {
      this.phone = phone;
    }
    this.phone.bindInventory(this.inventory);
  }
}
