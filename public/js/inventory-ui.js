// inventory-ui.js — the quick bar you actually see while playing.
//
// The full bag is the server-saved kit panel (GameUI, "I"). This file draws the
// five-slot bar that sits in the HUD: weapon in hand, then whatever else your
// pockets offer, each with a count and a number key. Every action round-trips
// through the profile endpoint, so the bar can never disagree with the sheet
// for long.

import { HOTBAR_SLOTS } from "./inventory.js";

const DIGITS = ["1", "2", "3", "4", "5"];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]
  ));
}

export class InventoryUI {
  constructor(host, { inventory, phone } = {}) {
    this.host = host;
    this.inventory = inventory;
    this.phone = phone;
    this.api = null;
    this.toast = (message) => {
      if (typeof this.host?.toast === "function") this.host.toast(message);
    };
    this.onHeal = () => {};
    this.onBag = () => {};
    this.visible = false;
    this.busy = false;
    this.root = null;
    this.hotbar = null;
    this._build();
    this._unsubscribe = this.inventory?.onChange?.(() => this.render()) || null;
  }

  _build() {
    const parent = document.getElementById("game") || document.body;
    if (!parent) return;
    this.root = document.createElement("div");
    this.root.className = "inv-hotbar";
    this.root.innerHTML = `
      <div class="inv-hot" data-hotbar>
        ${DIGITS.map((digit, index) => `
          <button type="button" class="inv-slot" data-slot="${index}" title="Slot ${digit}">
            <span class="inv-slot-key">${digit}</span>
            <span class="inv-slot-icon" data-icon>·</span>
            <span class="inv-slot-qty" data-qty></span>
            <span class="inv-slot-name" data-name>—</span>
          </button>`).join("")}
      </div>
      <button type="button" class="inv-bag-btn" data-open-bag>
        <span data-bag-label>BAG</span>
        <span class="inv-bag-count" data-bag-count>0/24</span>
        <kbd>I</kbd>
      </button>
    `;
    parent.appendChild(this.root);
    this.hotbar = this.root.querySelector("[data-hotbar]");

    this.hotbar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-slot]");
      if (!button) return;
      this.useSlot(Number(button.dataset.slot));
    });
    this.root.querySelector("[data-open-bag]").addEventListener("click", () => {
      this.open();
    });
    this.render();
  }

  // ── wiring, done by main.js once the client is connected ──────────────
  // main.js walks the UI modules and hands each one the world; the hotbar
  // keeps it for toasts and for the phone screen that proxies item use.
  setHost(host) {
    this.host = host || this.host;
    if (this.host?.toast && !this._toastBound) this._toastBound = true;
  }

  // world.dispose() removes `panel` if the UI owns one; the hotbar lives in
  // #game and its root is the panel.
  get panel() { return this.root; }

  setApi(api) { this.api = api; }

  setToast(toast) { this.toast = toast || this.toast; }

  setOnHeal(handler) { this.onHeal = handler || (() => {}); }

  setOnBag(handler) { this.onBag = handler || (() => {}); }

  // ── rendering ─────────────────────────────────────────────────────────
  render() {
    if (!this.hotbar) return;
    for (let index = 0; index < HOTBAR_SLOTS; index += 1) {
      const button = this.hotbar.querySelector(`[data-slot="${index}"]`);
      if (!button) continue;
      const item = this.inventory?.slot(index) || null;
      button.classList.toggle("filled", Boolean(item));
      button.classList.toggle("equipped", Boolean(item) && item.category === "weapon"
        && item.key === this.inventory?.equipped);
      button.classList.toggle("empty", !item);
      button.querySelector("[data-icon]").textContent = item?.icon || "·";
      button.querySelector("[data-qty]").textContent = item && item.qty > 1 ? `×${item.qty}` : "";
      button.querySelector("[data-name]").textContent = item?.name || "—";
      button.title = item
        ? `${item.name}${item.qty > 1 ? ` ×${item.qty}` : ""} · press ${DIGITS[index]}`
        : `Empty slot ${DIGITS[index]}`;
    }
    const bagButton = this.root?.querySelector("[data-bag-label]");
    if (bagButton) {
      const count = this.inventory?.count?.() || 0;
      const weight = this.inventory?.weight || 0;
      bagButton.textContent = `BAG · ${weight.toFixed(1)} kg`;
      const badge = this.root?.querySelector("[data-bag-count]");
      if (badge) badge.textContent = `${count}/24`;
    }
  }

  // ── actions ───────────────────────────────────────────────────────────
  async useSlot(index) {
    const item = this.inventory?.slot(index);
    if (!item) {
      this.toast(`Slot ${DIGITS[index]} is empty`);
      return;
    }
    if (this.busy) return;

    // Bare hands are a fact, not a server call.
    if (item.key === "fists") {
      this.open();
      return;
    }
    if (!this.api) {
      this.toast("Not connected — the counter is closed");
      return;
    }

    this.busy = true;
    try {
      if (item.category === "weapon") {
        if (item.key === this.inventory.equipped) {
          this.toast(`${item.name} is already in hand`);
          return;
        }
        await this.api("equip", { key: item.key });
        this.toast(`${item.name} in hand`, "good");
        return;
      }
      if (item.heal > 0) {
        const data = await this.api("use", { key: item.key });
        const heal = Number(data?.heal) || item.heal;
        this.onHeal(heal);
        this.toast(`+${heal} health`, "good");
        return;
      }
      this.toast(`${item.name} — open the bag to handle it`);
      this.open();
    } catch (error) {
      this.toast(error?.message || "That did not work", "bad");
    } finally {
      this.busy = false;
    }
  }

  // "I" and the bag button open the full kit, which is the server-side bag.
  open() {
    this.visible = true;
    this.onBag();
  }

  close() { this.visible = false; }

  toggle() {
    if (this.visible) this.close();
    else this.open();
  }

  isOpen() { return this.visible; }

  destroy() {
    this._unsubscribe?.();
    this.root?.remove();
    this.root = null;
    this.hotbar = null;
  }
}
