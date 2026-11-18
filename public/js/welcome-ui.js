// welcome-ui.js — the private arrival card.
//
// The server sends a `welcome` message with `to: <playerId>`, so this card is
// only ever painted for the player who just walked in. The sound is synthesised
// locally by the audio engine and follows the same rule.

import { t } from "./i18n.js";

const CREST = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3l6.8 20.4L60 30l-21.2 6.6L32 61l-6.8-24.4L4 30l21.2-6.6z"/></svg>`;

export class WelcomeUI {
  constructor() {
    this.shown = false;
    this.timer = null;
    this._build();
  }

  _build() {
    if (document.getElementById("welcome-overlay")) {
      this.root = document.getElementById("welcome-overlay");
      return;
    }
    const root = document.createElement("div");
    root.id = "welcome-overlay";
    root.className = "welcome-overlay hidden";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = `
      <div class="welcome-card">
        <div class="welcome-crest">${CREST}</div>
        <div class="welcome-kicker" data-kicker>${t("welcome.kicker")}</div>
        <h2 class="welcome-name" data-name>${t("welcome.name")}</h2>
        <p class="welcome-sub" data-sub></p>
        <div class="welcome-rule"></div>
        <p class="welcome-tagline" data-tagline></p>
        <p class="welcome-tip" data-tip>${t("welcome.tip")}</p>
        <button class="welcome-skip" type="button" data-skip>${t("welcome.enter")}</button>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    root.querySelector("[data-skip]")?.addEventListener("click", () => this.hide());
    root.addEventListener("click", (event) => {
      if (event.target === root) this.hide();
    });
  }

  /**
   * @param {{name?:string, cls?:string, tagline?:string, tip?:string, kicker?:string}} data
   */
  show(data = {}) {
    if (!this.root) this._build();
    if (!this.root) return;
    this.shown = true;
    const card = this.root.querySelector(".welcome-card");
    // Restart the entrance animation for the next arrival.
    this.root.classList.remove("hidden", "leaving");
    if (card) {
      card.style.animation = "none";
      void card.offsetWidth;
      card.style.animation = "";
    }
    const set = (selector, value) => {
      const node = this.root.querySelector(selector);
      if (node) node.textContent = value || "";
    };
    set("[data-name]", data.name || t("welcome.name"));
    set("[data-sub]", data.cls || "");
    set("[data-tagline]", data.tagline || "");
    set("[data-tip]", data.tip || t("welcome.tip"));
    const kicker = this.root.querySelector("[data-kicker]");
    if (kicker) kicker.textContent = data.kicker || t("welcome.kicker");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), 5200);
  }

  hide() {
    if (!this.root || this.root.classList.contains("hidden")) return;
    clearTimeout(this.timer);
    this.root.classList.add("leaving");
    setTimeout(() => {
      this.root.classList.add("hidden");
      this.root.classList.remove("leaving");
      this.shown = false;
    }, 620);
  }

  reset() {
    clearTimeout(this.timer);
    this.shown = false;
    this.root?.classList.add("hidden");
    this.root?.classList.remove("leaving");
  }
}
