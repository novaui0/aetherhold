// auth.js — accounts on the host.
//
// The realm keeps every driver on the server: cash, gear, contracts and boss
// bands belong to an account, not to this browser. Signing in returns a session
// token which is sent when joining a room; the password itself is only ever
// posted to the host that owns the account.

import { GameClient, normalizeBase } from "./net.js";
import { t } from "./i18n.js";
import {
  character, characterPayload, clearAccountSession, getAccountSession,
  saveCharacter, setAccountSession,
} from "./store.js";

export const account = {
  token: "",
  clientId: "",
  username: "",
  ready: false,
  base: "",
};

const listeners = new Set();

export function onAccount(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of [...listeners]) {
    try { fn(account); } catch (error) { console.error("[aetherhold] account listener failed", error); }
  }
}

function apply(payload, base) {
  if (!payload?.token) return account;
  const session = setAccountSession(payload);
  account.token = session?.token || "";
  account.clientId = session?.clientId || "";
  account.username = session?.username || "";
  account.ready = Boolean(account.token && account.clientId);
  if (base) account.base = normalizeBase(base);
  emit();
  return account;
}

/** Restore a remembered login and let the host confirm it is still valid. */
export async function resume(base) {
  const stored = getAccountSession();
  if (!stored?.token) return account;
  const target = normalizeBase(base) || account.base;
  if (!target) {
    // No host yet: trust the stored copy so the menu can show the name, and
    // let the first join surface an expired session.
    account.token = stored.token;
    account.clientId = stored.clientId;
    account.username = stored.username;
    account.ready = Boolean(stored.token && stored.clientId);
    account.base = "";
    emit();
    return account;
  }
  try {
    const data = await new GameClient(target).accountSession(stored.token);
    apply({ ...data, token: stored.token }, target);
  } catch (error) {
    if (error?.status === 401) {
      clearAccountSession();
      forget();
    }
  }
  return account;
}

export function forget() {
  account.token = "";
  account.clientId = "";
  account.username = "";
  account.ready = false;
  emit();
}

export async function signIn(base, username, password) {
  const target = normalizeBase(base);
  if (!target) throw new Error(t("auth.nohost"));
  const data = await new GameClient(target).login(username, password);
  return apply(data, target);
}

export async function signUp(base, username, password) {
  const target = normalizeBase(base);
  if (!target) throw new Error(t("auth.nohost"));
  const data = await new GameClient(target).register(username, password);
  return apply(data, target);
}

/** Flatten the stored payload back into the shape the editor expects. */
export function flattenDriver(payload) {
  if (!payload || typeof payload !== "object" || !payload.name) return null;
  const sheet = payload.sheet && typeof payload.sheet === "object" ? payload.sheet : {};
  return {
    ...sheet,
    name: payload.name,
    cls: payload.cls || character.cls,
    color: payload.color || character.color,
    accent: payload.accent || character.accent,
    stats: payload.stats && typeof payload.stats === "object" ? payload.stats : { ...character.stats },
  };
}

/**
 * Adopt the account's driver. The host wins when it already knows this
 * account; a brand-new account inherits the sheet built on this device.
 * Returns "server", "local" or null.
 */
export async function syncDriver(base = account.base) {
  const target = normalizeBase(base || account.base);
  if (!account.token || !target) return null;
  const client = new GameClient(target);
  try {
    const data = await client.character(account.token, "get");
    const saved = flattenDriver(data?.character);
    if (saved) {
      saveCharacter(saved);
      return "server";
    }
    await client.character(account.token, "save", characterPayload());
    return "local";
  } catch {
    return null;
  }
}

/** Push the sheet on this device to the account (best effort). */
export async function pushDriver(base = account.base) {
  const target = normalizeBase(base || account.base);
  if (!account.token || !target) return null;
  try {
    return await new GameClient(target).character(account.token, "save", characterPayload());
  } catch {
    return null;
  }
}

export async function signOut(base = account.base) {
  const token = account.token;
  forget();
  clearAccountSession();
  if (!token || !base) return;
  try {
    await new GameClient(base).logout(token);
  } catch {
    // The local token is already gone; a dead host must not block sign-out.
  }
}

/**
 * The sign-in / create-account overlay. It is intentionally a single dialog
 * used both from the header chip and as a gate in front of joining a room, so
 * there is exactly one place where a password is typed.
 */
export class AuthUI {
  constructor({ audio = null, onNotice = null, getBase = () => "" } = {}) {
    this.audio = audio;
    this.onNotice = onNotice;
    this.getBase = getBase;
    this.mode = "login";
    this.waiters = new Set();
    this.busy = false;
    this.bound = false;
    this.overlay = null;
    this._onKey = null;
  }

  get isOpen() {
    return Boolean(this.overlay && !this.overlay.classList.contains("hidden"));
  }

  bind() {
    if (this.bound) return this;
    const overlay = document.getElementById("auth-overlay");
    if (!overlay) return this;
    this.overlay = overlay;
    this.bound = true;

    document.getElementById("auth-close")?.addEventListener("click", () => this.close(false));
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === overlay) this.close(false);
    });
    document.querySelectorAll("#auth-tabs [data-auth-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.setMode(button.dataset.authTab || "login");
        this.audio?.click?.();
      });
    });
    document.getElementById("auth-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submit();
    });
    this._onKey = (event) => {
      if (event.key === "Escape" && this.isOpen) {
        event.preventDefault();
        this.close(false);
      }
    };
    document.addEventListener("keydown", this._onKey);
    this.setMode("login");
    return this;
  }

  setMode(mode) {
    this.mode = mode === "register" ? "register" : "login";
    const register = this.mode === "register";
    document.getElementById("auth-confirm-row")?.classList.toggle("hidden", !register);
    document.querySelectorAll("#auth-tabs [data-auth-tab]").forEach((button) => {
      button.classList.toggle("active", (button.dataset.authTab || "login") === this.mode);
    });
    const submit = document.getElementById("auth-submit");
    if (submit) submit.textContent = t(register ? "auth.create" : "auth.signin");
    const title = document.getElementById("auth-title");
    if (title) title.textContent = t(register ? "auth.registerTitle" : "auth.loginTitle");
    const lede = document.getElementById("auth-lede");
    if (lede) lede.textContent = t(register ? "auth.registerLede" : "auth.loginLede");
    this._error("");
  }

  _error(text) {
    const node = document.getElementById("auth-error");
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("hidden", !text);
  }

  _setBusy(busy) {
    this.busy = busy;
    const submit = document.getElementById("auth-submit");
    const form = document.getElementById("auth-form");
    if (submit) {
      submit.disabled = busy;
      submit.classList.toggle("busy", busy);
      submit.textContent = busy
        ? t("auth.working")
        : t(this.mode === "register" ? "auth.create" : "auth.signin");
    }
    if (form) form.setAttribute("aria-busy", busy ? "true" : "false");
  }

  open({ reason = "", mode = "login" } = {}) {
    if (!this.bind().overlay) return this;
    this.overlay.classList.remove("hidden");
    document.body.classList.add("auth-open");
    const reasonEl = document.getElementById("auth-reason");
    if (reasonEl) {
      reasonEl.textContent = reason || "";
      reasonEl.classList.toggle("hidden", !reason);
    }
    this.setMode(mode);
    document.getElementById("auth-pass").value = "";
    const confirm = document.getElementById("auth-confirm");
    if (confirm) confirm.value = "";
    this._error("");
    setTimeout(() => document.getElementById("auth-user")?.focus(), 80);
    return this;
  }

  close(result = false) {
    if (!this.overlay) return;
    this.overlay.classList.add("hidden");
    document.body.classList.remove("auth-open");
    this._error("");
    const signedIn = Boolean(result && account.ready);
    for (const resolve of [...this.waiters]) resolve(signedIn);
    this.waiters.clear();
  }

  /** Resolve true once the visitor is signed in; opens the gate otherwise. */
  require(reason = "") {
    if (account.ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      this.waiters.add(resolve);
      this.open({ reason, mode: this.mode });
    });
  }

  async handleSuccess() {
    try { await this.onSignedIn?.(); } catch { /* the host copy is optional */ }
  }

  async submit() {
    if (this.busy) return;
    const username = (document.getElementById("auth-user")?.value || "").trim();
    const password = document.getElementById("auth-pass")?.value || "";
    const confirm = document.getElementById("auth-confirm")?.value || "";
    if (!username || !password) {
      this._error(t("auth.missing"));
      return;
    }
    if (this.mode === "register") {
      if (password.length < 6) {
        this._error(t("auth.short"));
        return;
      }
      if (confirm && confirm !== password) {
        this._error(t("auth.mismatch"));
        return;
      }
    }
    this._setBusy(true);
    try {
      if (this.mode === "register") await signUp(this.getBase(), username, password);
      else await signIn(this.getBase(), username, password);
      this.audio?.chime?.();
      await this.handleSuccess();
      this.onNotice?.(t("auth.welcome", { name: account.username }), "good");
      this.close(true);
    } catch (error) {
      this._error(error?.message || t("auth.failed"));
      this.audio?.error?.();
    } finally {
      this._setBusy(false);
    }
  }

  /** Refresh the header chip that shows who is signed in. */
  paintChip() {
    const chip = document.getElementById("account-chip");
    if (!chip) return;
    const label = chip.querySelector(".account-name");
    const sub = chip.querySelector(".account-sub");
    chip.classList.toggle("signed-in", account.ready);
    if (account.ready) {
      if (label) label.textContent = account.username || t("auth.driver");
      if (sub) sub.textContent = t("auth.signoutHint");
      chip.title = `${account.username} — ${t("auth.signoutHint")}`;
    } else {
      if (label) label.textContent = t("auth.signin");
      if (sub) sub.textContent = t("auth.chipHint");
      chip.title = t("auth.signin");
    }
  }
}
