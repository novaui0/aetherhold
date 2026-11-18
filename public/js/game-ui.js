// game-ui.js — loadout, merchant, contracts, trade and the boss bar.
//
// All four panels share one overlay and one server round-trip per action. The
// Profile mirror decides nothing: after every action the server's full profile
// replaces the local copy, so a stale tab can never spend cash twice.

import { formatCash, itemPresentation, TRADEABLE } from "./profile.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));

const TABS = [
  { id: "kit", label: "Kit", hint: "I" },
  { id: "market", label: "Merchant", hint: "J" },
  { id: "contracts", label: "Contracts", hint: "O" },
  { id: "trade", label: "Trade", hint: "Y" },
];

export class GameUI {
  constructor({ profile, api, toast, getNearby, onOpen, onClose, onHeal, onVehicle }) {
    this.profile = profile;
    this.api = api;
    this.toast = toast || (() => {});
    this.getNearby = getNearby || (() => []);
    this.onOpen = onOpen || (() => {});
    this.onClose = onClose || (() => {});
    this.onHeal = onHeal || (() => {});
    this.onVehicle = onVehicle || (() => {});
    this.tab = "kit";
    this.offerKey = null;
    this.offers = [];
    this.shop = [];
    this.pendingTrade = null;
    this.busy = false;
    this.visible = false;
    this._build();
    this._unsubscribe = profile.onChange(() => this._renderWallet());
  }

  // ── DOM ──────────────────────────────────────────────────────────────
  _build() {
    const host = document.getElementById("game") || document.body;
    const root = document.createElement("div");
    root.id = "pc-overlay";
    root.className = "overlay hidden";
    root.innerHTML = `
      <div class="pc-card" role="dialog" aria-modal="true" aria-label="Character panel">
        <header class="pc-head">
          <div>
            <span class="eyebrow">Aetherhold · loadout</span>
            <h2>Character</h2>
          </div>
          <div class="pc-head-right">
            <div class="pc-wallet" data-wallet>—</div>
            <button class="icon-btn close" data-close aria-label="Close">×</button>
          </div>
        </header>
        <nav class="pc-tabs" role="tablist">
          ${TABS.map((tab) => `<button type="button" data-tab="${tab.id}" role="tab">
            ${tab.label}<kbd>${tab.hint}</kbd></button>`).join("")}
        </nav>
        <div class="pc-body" data-body></div>
        <footer class="pc-foot">
          <span data-foot>Kit, merchant and contracts are server-saved.</span>
          <button class="btn ghost" type="button" data-vehicle>Vehicle &amp; cargo</button>
        </footer>
      </div>`;
    host.appendChild(root);
    this.root = root;
    this.body = root.querySelector("[data-body]");
    this.wallet = root.querySelector("[data-wallet]");
    this.foot = root.querySelector("[data-foot]");

    root.querySelector("[data-close]").addEventListener("click", () => this.close());
    root.addEventListener("click", (event) => {
      if (event.target === root) this.close();
    });
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => this.open(button.dataset.tab));
    });
    root.querySelector("[data-vehicle]").addEventListener("click", () => {
      this.close();
      this.onVehicle();
    });
    this.body.addEventListener("click", (event) => this._onBodyClick(event));

    // Boss bar, hidden until a gate is entered.
    const boss = document.createElement("div");
    boss.id = "boss-hud";
    boss.className = "boss-hud hidden";
    boss.innerHTML = `
      <div class="boss-top"><span class="boss-band" data-band>BAND I</span>
        <span class="boss-place" data-place></span></div>
      <div class="boss-row"><strong data-boss-name>—</strong>
        <span class="boss-hp" data-boss-hp>0 / 0</span></div>
      <div class="boss-track"><i data-boss-fill></i></div>
      <div class="boss-pips" data-boss-pips></div>
      <div class="boss-tip">Click to strike · <kbd>R</kbd> weapon · <kbd>B</kbd> leave the gate</div>`;
    host.appendChild(boss);
    this.bossRoot = boss;
    this.bossName = boss.querySelector("[data-boss-name]");
    this.bossBand = boss.querySelector("[data-band]");
    this.bossPlace = boss.querySelector("[data-place]");
    this.bossHp = boss.querySelector("[data-boss-hp]");
    this.bossFill = boss.querySelector("[data-boss-fill]");
    this.bossPips = boss.querySelector("[data-boss-pips]");

    // A trade offer is too important to hide behind a tab.
    const prompt = document.createElement("div");
    prompt.id = "trade-prompt";
    prompt.className = "trade-prompt hidden";
    host.appendChild(prompt);
    this.prompt = prompt;
    prompt.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.accept) this.acceptTrade(button.dataset.accept);
      if (button.dataset.decline) this.declineTrade(button.dataset.decline);
    });
  }

  destroy() {
    this._unsubscribe?.();
    this.root?.remove();
    this.bossRoot?.remove();
    this.prompt?.remove();
  }

  isOpen() { return this.visible; }

  close() {
    if (!this.visible) return;
    this.visible = false;
    this.root.classList.add("hidden");
    this.onClose();
  }

  // Opening a specific tab (I/J/O/Y) doubles as "switch tab" while open.
  async open(tab = "kit") {
    if (this.visible && !tab) { this.close(); return; }
    this.tab = tab || this.tab;
    if (!this.visible) {
      this.visible = true;
      this.root.classList.remove("hidden");
      this.onOpen();
    }
    this._renderTabs();
    this._renderWallet();
    this.body.innerHTML = `<div class="pc-loading">Reading your kit…</div>`;
    try {
      const data = await this.api("get");
      this._apply(data);
      this._render();
    } catch (error) {
      this.body.innerHTML = `<div class="pc-empty">${esc(error.message || "The counter is closed.")}</div>`;
    }
  }

  toggle(tab = "kit") {
    if (this.visible && this.tab === tab) this.close();
    else this.open(tab);
  }

  // ── server round-trips ───────────────────────────────────────────────
  async _act(action, payload = {}, success = "") {
    if (this.busy) return;
    this.busy = true;
    try {
      const data = await this.api(action, payload);
      this._apply(data);
      this._render();
      if (success) this.toast(typeof success === "function" ? success(data) : success, "good");
      return data;
    } catch (error) {
      this.toast(error.message || "That did not work", "bad");
      return null;
    } finally {
      this.busy = false;
    }
  }

  _apply(data) {
    if (!data) return;
    if (data.profile) this.profile.apply(data.profile);
    if (Array.isArray(data.offers)) this.offers = data.offers;
    if (Array.isArray(data.shop)) this.shop = data.shop;
  }

  // ── render ───────────────────────────────────────────────────────────
  _renderTabs() {
    this.root.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === this.tab);
    });
  }

  _renderWallet() {
    if (!this.wallet) return;
    const p = this.profile;
    this.wallet.innerHTML = p.ready
      ? `<b>${formatCash(p.cash, p.currency)}</b><span>lvl ${p.level} · band ${p.band}/5</span>`
      : `<b>—</b><span>connecting</span>`;
  }

  _render() {
    this._renderTabs();
    this._renderWallet();
    if (!this.visible) return;
    const renderer = {
      kit: () => this._renderKit(),
      market: () => this._renderMarket(),
      contracts: () => this._renderContracts(),
      trade: () => this._renderTrade(),
    }[this.tab] || (() => this._renderKit());
    this.body.innerHTML = renderer();
    this._renderPrompt();
  }

  _renderKit() {
    const p = this.profile;
    if (!p.ready) return `<div class="pc-empty">No kit yet.</div>`;
    const items = [...p.items].sort((a, b) => {
      const order = { weapon: 0, attach: 1, food: 2, drink: 3, metals: 4, textile: 5, documents: 6, keys: 7, misc: 8 };
      return (order[a.category] ?? 9) - (order[b.category] ?? 9);
    });
    if (!this.offerKey || !items.some((item) => item.key === this.offerKey)) {
      this.offerKey = p.equipped || items[0]?.key || null;
    }
    const item = items.find((entry) => entry.key === this.offerKey);
    const selected = item || null;
    const weapon = p.weapon;
    return `
      <div class="pc-kit">
        <div class="pc-grid">
          ${items.map((entry) => `
            <button type="button" class="pc-slot${selected?.key === entry.key ? " selected" : ""}${entry.key === p.equipped ? " equipped" : ""}"
              data-kit="${esc(entry.key)}" title="${esc(entry.name)}">
              <span class="pc-slot-icon">${esc(entry.icon || "📦")}</span>
              <span class="pc-slot-name">${esc(entry.name)}</span>
              <span class="pc-slot-qty">${entry.qty > 1 ? `×${entry.qty}` : ""}</span>
              ${entry.key === p.equipped ? `<span class="pc-slot-tag">IN HAND</span>` : ""}
            </button>`).join("") || `<div class="pc-empty">Your pockets are empty.</div>`}
        </div>
        <aside class="pc-detail">
          ${selected ? `
            <div class="pc-detail-head">
              <span class="pc-detail-icon">${esc(selected.icon || "📦")}</span>
              <div><strong>${esc(selected.name)}</strong>
                <span>${esc(selected.category)}${selected.qty > 1 ? ` · ×${selected.qty}` : ""}</span></div>
            </div>
            <p>${esc(selected.desc || "")}</p>
            <dl>
              ${selected.damage ? `<div><dt>Damage</dt><dd>${selected.damage}</dd></div>` : ""}
              ${selected.range ? `<div><dt>Reach</dt><dd>${selected.range} m</dd></div>` : ""}
              ${selected.heal ? `<div><dt>Heals</dt><dd>+${selected.heal}</dd></div>` : ""}
              ${selected.price ? `<div><dt>Value</dt><dd>${formatCash(selected.price, p.currency)}</dd></div>` : ""}
            </dl>
            <div class="pc-detail-actions">
              ${selected.category === "weapon" ? `<button class="btn" type="button" data-equip="${esc(selected.key)}"
                ${selected.key === p.equipped ? "disabled" : ""}>${selected.key === p.equipped ? "In hand" : "Equip"}</button>` : ""}
              ${selected.heal ? `<button class="btn ghost" type="button" data-use="${esc(selected.key)}">Use</button>` : ""}
            </div>` : `<div class="pc-empty">Pick something from the grid.</div>`}
          <div class="pc-weapon-card">
            <span class="eyebrow">Drawn weapon</span>
            <div><span class="pc-detail-icon">${esc(weapon.icon || "✊")}</span>
              <div><strong>${esc(weapon.name)}</strong>
              <span>${weapon.ammo ? `${p.ammo} rounds` : "no ammo needed"} · ${weapon.damage} dmg</span></div></div>
            <p class="muted small">R draws or holsters. Bands are broken with steel, not words.</p>
          </div>
        </aside>
      </div>`;
  }

  _renderMarket() {
    const p = this.profile;
    const stock = this.shop.length ? this.shop : [];
    const sellable = [...p.items].filter((item) => (item.price || 0) > 0 && !["id_card", "trophy"].includes(item.key));
    return `
      <div class="pc-market">
        <section>
          <h3>Buy <span class="muted small">— ${formatCash(p.cash, p.currency)} on hand</span></h3>
          <div class="pc-rows">
            ${stock.map((entry) => `
              <article class="pc-row">
                <span class="pc-row-icon">${esc(entry.icon || "📦")}</span>
                <div class="pc-row-main"><strong>${esc(entry.name)}</strong>
                  <span>${esc(entry.desc || "")}</span></div>
                <span class="pc-row-owned">${entry.owned ? `×${entry.owned}` : ""}</span>
                <span class="pc-row-price">${formatCash(entry.price, p.currency)}</span>
                <button class="btn small" type="button" data-buy="${esc(entry.key)}"
                  ${p.cash < entry.price ? "disabled" : ""}>Buy</button>
              </article>`).join("") || `<div class="pc-empty">The counter is empty.</div>`}
          </div>
        </section>
        <section>
          <h3>Sell <span class="muted small">— 55% of value</span></h3>
          <div class="pc-rows">
            ${sellable.map((entry) => `
              <article class="pc-row">
                <span class="pc-row-icon">${esc(entry.icon || "📦")}</span>
                <div class="pc-row-main"><strong>${esc(entry.name)}</strong>
                  <span>${entry.qty > 1 ? `You carry ×${entry.qty}` : "Last one"}</span></div>
                <span class="pc-row-owned"></span>
                <span class="pc-row-price">+${formatCash(Math.round((entry.price || 0) * 0.55), p.currency)}</span>
                <button class="btn ghost small" type="button" data-sell="${esc(entry.key)}"
                  ${entry.key === p.equipped && entry.qty <= 1 ? "disabled" : ""}>Sell</button>
              </article>`).join("") || `<div class="pc-empty">Nothing the counter will buy.</div>`}
          </div>
        </section>
      </div>`;
  }

  _renderContracts() {
    const p = this.profile;
    const active = p.contract;
    const offers = this.offers;
    const timeLeft = active ? Math.max(0, Math.floor(((active.deadline || 0) * 1000 - Date.now()) / 60000)) : 0;
    return `
      <div class="pc-contracts">
        ${active ? `
          <section class="pc-contract active">
            <div class="pc-contract-head">
              <div><span class="eyebrow">On the clock · ${timeLeft} min left</span>
                <h3>${esc(active.title)}</h3></div>
              <span class="pc-contract-pay">${formatCash(active.reward, p.currency)}</span>
            </div>
            <p>${esc(active.brief || "")}</p>
            <div class="pc-progress"><i style="width:${Math.min(100, (active.progress / Math.max(1, active.goal)) * 100)}%"></i></div>
            <div class="pc-contract-meta">
              <span>${active.progress} / ${active.goal} ${esc(active.unit)}</span>
              <span>${active.done ? "Ready to claim" : active.expired ? "Expired" : "In progress"}</span>
            </div>
            <div class="pc-detail-actions">
              <button class="btn" type="button" data-claim ${active.done && !active.expired ? "" : "disabled"}>Claim pay</button>
              <button class="btn ghost" type="button" data-abandon>Abandon</button>
            </div>
          </section>` : `<p class="pc-empty">No contract in hand. The board pays by the shift.</p>`}
        <section>
          <h3>Contract board <span class="muted small">— one at a time</span></h3>
          <div class="pc-rows">
            ${offers.map((offer) => `
              <article class="pc-row contract">
                <span class="pc-row-icon">${offer.kind === "hunt" ? "☠" : offer.kind === "haul" ? "🚚" : offer.kind === "shift" ? "⏱" : "👣"}</span>
                <div class="pc-row-main"><strong>${esc(offer.title)}</strong>
                  <span>${esc(offer.brief)}</span></div>
                <span class="pc-row-owned">${offer.goal} ${esc(offer.unit)}</span>
                <span class="pc-row-price">${formatCash(offer.reward, p.currency)}</span>
                <button class="btn small" type="button" data-contract="${esc(offer.id)}"
                  ${active ? "disabled" : ""}>Sign</button>
              </article>`).join("") || `<div class="pc-empty">The board is bare.</div>`}
          </div>
        </section>
      </div>`;
  }

  _renderTrade() {
    const p = this.profile;
    const nearby = this.getNearby();
    const giveables = p.items.filter((entry) => entry.qty > 0 && entry.key !== "trophy");
    const pending = this.pendingTrade;
    if (!this.tradeTarget && nearby.length) this.tradeTarget = nearby[0].id;
    if (this.tradeTarget && !nearby.some((entry) => entry.id === this.tradeTarget)) this.tradeTarget = nearby[0]?.id || null;
    return `
      <div class="pc-trade">
        ${pending ? `
          <section class="pc-contract active trade">
            <div class="pc-contract-head">
              <div><span class="eyebrow">Offer · ${pending.secondsLeft}s left</span>
                <h3>${esc(pending.fromName)}</h3></div>
              <span class="pc-contract-pay">${pending.cash ? formatCash(pending.cash, p.currency) : ""}</span>
            </div>
            <div class="pc-trade-lines">
              <div><span class="eyebrow">They give</span>
                ${pending.items.length ? pending.items.map((entry) => `<span>${esc(entry.icon)} ${esc(entry.name)} ×${entry.qty}</span>`).join("") : `<span class="muted">nothing</span>`}
                ${pending.cash ? `<span>${formatCash(pending.cash, p.currency)}</span>` : ""}
              </div>
              <div><span class="eyebrow">They want</span>
                ${(pending.want || []).length ? pending.want.map((entry) => `<span>${esc(entry.name)} ×${entry.qty}</span>`).join("") : `<span class="muted">nothing</span>`}
                ${pending.wantCash ? `<span>${formatCash(pending.wantCash, p.currency)}</span>` : ""}
              </div>
            </div>
            <div class="pc-detail-actions">
              <button class="btn" type="button" data-trade-accept="${esc(pending.id)}">Shake on it</button>
              <button class="btn ghost" type="button" data-trade-decline="${esc(pending.id)}">Decline</button>
            </div>
          </section>` : ""}
        <div class="pc-trade-grid">
          <section>
            <h3>Who is close</h3>
            <div class="pc-nearby">
              ${nearby.length ? nearby.map((player) => `
                <label class="pc-nearby-row${this.tradeTarget === player.id ? " selected" : ""}">
                  <input type="radio" name="trade-target" value="${esc(player.id)}"
                    ${this.tradeTarget === player.id ? "checked" : ""} data-target="${esc(player.id)}">
                  <span>${esc(player.name)}</span><em>${esc(player.cls || "")}</em>
                </label>`).join("") : `<p class="pc-empty">Nobody within arm's reach. Find a driver in the district.</p>`}
            </div>
            <p class="muted small">Offers expire after two minutes. Both sides are validated on the server before anything moves.</p>
          </section>
          <section>
            <h3>Build an offer</h3>
            <div class="pc-form">
              <label>You give
                <select data-give>
                  <option value="">— nothing —</option>
                  ${giveables.map((entry) => `<option value="${esc(entry.key)}">${esc(entry.name)} (${entry.qty})</option>`).join("")}
                </select>
              </label>
              <label class="pc-qty">Qty <input type="number" data-give-qty value="1" min="1" max="99"></label>
              <label>You want
                <select data-want>
                  <option value="">— nothing —</option>
                  ${TRADEABLE.filter((key) => key !== "id_card").map((key) => {
                    const item = itemPresentation(key);
                    return `<option value="${esc(key)}">${esc(item.name)}</option>`;
                  }).join("")}
                </select>
              </label>
              <label class="pc-qty">Qty <input type="number" data-want-qty value="1" min="1" max="99"></label>
              <label>Cash you pay <input type="number" data-cash value="0" min="0" max="${Math.floor(p.cash)}"></label>
              <label>Cash you ask <input type="number" data-want-cash value="0" min="0" max="100000"></label>
              <button class="btn" type="button" data-trade-send ${nearby.length ? "" : "disabled"}>Send offer</button>
            </div>
          </section>
        </div>
      </div>`;
  }

  _renderPrompt() {
    const pending = this.pendingTrade;
    if (!pending) {
      this.prompt.classList.add("hidden");
      return;
    }
    this.prompt.innerHTML = `
      <span class="eyebrow">Trade offer · ${pending.secondsLeft}s</span>
      <strong>${esc(pending.fromName)}</strong>
      <span class="trade-prompt-line">
        ${pending.items.map((entry) => `${esc(entry.icon)} ${esc(entry.name)} ×${entry.qty}`).join(" · ") || "nothing"}
        ${pending.cash ? ` · ${formatCash(pending.cash, this.profile.currency)}` : ""}
      </span>
      <div class="trade-prompt-actions">
        <button class="btn small" type="button" data-accept="${esc(pending.id)}">Accept</button>
        <button class="btn ghost small" type="button" data-decline="${esc(pending.id)}">Decline</button>
      </div>`;
    this.prompt.classList.remove("hidden");
  }

  // ── events ───────────────────────────────────────────────────────────
  _onBodyClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const data = button.dataset;
    if (data.kit) {
      this.offerKey = data.kit;
      this.body.innerHTML = this._renderKit();
      return;
    }
    if (data.buy) {
      const shop = this.shop.find((entry) => entry.key === data.buy);
      this._act("buy", { key: data.buy, qty: 1 }, () => `${shop?.name || "Item"} bought`);
      return;
    }
    if (data.sell) {
      const item = this.profile.item(data.sell);
      this._act("sell", { key: data.sell, qty: 1 }, () => `${item?.name || "Item"} sold`);
      return;
    }
    if (data.equip) {
      this.offerKey = data.equip;
      this._act("equip", { key: data.equip }, () => `${data.equip} drawn`);
      return;
    }
    if (data.use) {
      const item = this.profile.item(data.use);
      this._act("use", { key: data.use }, (res) => {
        this.onHeal(res?.heal || item?.heal || 0);
        return `${item?.name || "Item"} used`;
      });
      return;
    }
    if (data.contract) {
      this._act("contract_accept", { id: data.contract }, "Contract signed");
      return;
    }
    if (data.claim !== undefined) {
      this._act("contract_claim", {}, (res) => `Paid ${formatCash(res?.paid || 0, this.profile.currency)}`);
      return;
    }
    if (data.abandon !== undefined) {
      this._act("contract_abandon", {}, "Contract abandoned");
      return;
    }
    if (data.tradeSend !== undefined) {
      this._sendOffer();
      return;
    }
    if (data.tradeAccept) {
      this.acceptTrade(data.tradeAccept);
      return;
    }
    if (data.tradeDecline) {
      this.declineTrade(data.tradeDecline);
    }
  }

  async _sendOffer() {
    const target = this.tradeTarget;
    if (!target) {
      this.toast("Pick someone who is close first", "bad");
      return;
    }
    const giveKey = this.body.querySelector("[data-give]")?.value || "";
    const wantKey = this.body.querySelector("[data-want]")?.value || "";
    const qty = Math.max(1, Math.min(99, Number(this.body.querySelector("[data-give-qty]")?.value) || 1));
    const wantQty = Math.max(1, Math.min(99, Number(this.body.querySelector("[data-want-qty]")?.value) || 1));
    const cash = Math.max(0, Math.floor(Number(this.body.querySelector("[data-cash]")?.value) || 0));
    const wantCash = Math.max(0, Math.floor(Number(this.body.querySelector("[data-want-cash]")?.value) || 0));
    if (!giveKey && !wantKey && !cash && !wantCash) {
      this.toast("An empty offer is not a trade", "bad");
      return;
    }
    if (this.busy) return;
    this.busy = true;
    try {
      const data = await this.api("offer", {
        to: target,
        items: giveKey ? [{ key: giveKey, qty }] : [],
        want: wantKey ? [{ key: wantKey, qty: wantQty }] : [],
        cash, wantCash,
      });
      this.toast(`Offer sent to ${data?.offer?.to || "them"}`, "good");
    } catch (error) {
      this.toast(error.message || "The offer did not go through", "bad");
    } finally {
      this.busy = false;
    }
  }

  async acceptTrade(id) {
    if (this.busy) return;
    this.busy = true;
    try {
      const data = await this.api("accept", { id });
      this.pendingTrade = null;
      this._apply(data);
      this._render();
      this.toast("Trade done. Shake hands.", "good");
    } catch (error) {
      this.toast(error.message || "The trade fell through", "bad");
    } finally {
      this.busy = false;
    }
  }

  async declineTrade(id) {
    try {
      await this.api("decline", { id });
      this.pendingTrade = null;
      this._renderPrompt();
      this._render();
      this.toast("Offer declined", "");
    } catch (error) {
      this.toast(error.message || "Already gone", "bad");
    }
  }

  // Called by the sync loop with the server's pending offer (or null).
  setPendingTrade(offer) {
    const previous = this.pendingTrade?.id;
    this.pendingTrade = offer || null;
    if (this.visible && this.tab === "trade") this._render();
    this._renderPrompt();
    if (offer && offer.id !== previous) {
      this.toast(`${offer.fromName} offers a trade`, "good");
    }
  }

  // ── boss HUD ─────────────────────────────────────────────────────────
  showBoss({ band, name, place, hp, maxHp, color }) {
    this.bossRoot.classList.remove("hidden");
    this.bossRoot.style.setProperty("--boss-color", color || "#f2c97d");
    this.bossName.textContent = name || "Unknown";
    this.bossBand.textContent = `BAND ${["I", "II", "III", "IV", "V"][Math.max(0, band - 1)] || band}`;
    this.bossPlace.textContent = place || "";
    this.updateBoss({ hp, maxHp, band });
  }

  updateBoss({ hp = 0, maxHp = 1, band = 1 }) {
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
    this.bossHp.textContent = `${Math.max(0, Math.round(hp))} / ${maxHp}`;
    this.bossFill.style.width = `${pct}%`;
    this.bossPips.innerHTML = Array.from({ length: 5 }, (_, index) =>
      `<i class="${index < band ? "on" : ""}${index === band - 1 ? " here" : ""}"></i>`).join("");
  }

  setBossTip(text) {
    const tip = this.bossRoot.querySelector(".boss-tip");
    if (tip) tip.innerHTML = text;
  }

  flashBoss(crit = false) {
    this.bossRoot.classList.remove("hit", "crit");
    void this.bossRoot.offsetWidth;
    this.bossRoot.classList.add(crit ? "crit" : "hit");
    setTimeout(() => this.bossRoot.classList.remove("hit", "crit"), 260);
  }

  hideBoss() {
    this.bossRoot.classList.add("hidden");
  }
}
