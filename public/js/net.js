// Aetherhold — thin HTTP client for the room API in server.py.

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function normalizeBase(url) {
  let base = String(url || "").trim();
  if (!base) return "";
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  return base.replace(/\/+$/, "");
}

async function request(base, path, { method = "GET", body, timeout = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      mode: "cors",
      cache: "no-store",
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || (payload && payload.ok === false)) {
      const message = payload?.error || `Request failed (${response.status})`;
      throw new ApiError(message, response.status);
    }
    return payload || {};
  } catch (error) {
    if (error.name === "AbortError") throw new ApiError("The realm did not answer in time", 0);
    if (error instanceof ApiError) throw error;
    throw new ApiError("Could not reach that host — is the server running?", 0);
  } finally {
    clearTimeout(timer);
  }
}

export class GameClient {
  constructor(base) {
    this.base = normalizeBase(base);
    this.code = null;
    this.token = null;
    this.playerId = null;
    this.seq = 0;
  }

  async health() {
    return request(this.base, "/api/health", { timeout: 5000 });
  }

  // ── accounts ────────────────────────────────────────────────────────
  // The password is only ever sent to the host that owns the account; the
  // returned session token is what joins a room.
  async register(username, password, base = this.base) {
    return request(normalizeBase(base), "/api/register", {
      method: "POST", body: { username, password }, timeout: 12000,
    });
  }

  async login(username, password, base = this.base) {
    return request(normalizeBase(base), "/api/login", {
      method: "POST", body: { username, password }, timeout: 12000,
    });
  }

  async accountSession(token, base = this.base) {
    return request(normalizeBase(base), "/api/session", {
      method: "POST", body: { token }, timeout: 7000,
    });
  }

  async logout(token, base = this.base) {
    return request(normalizeBase(base), "/api/logout", {
      method: "POST", body: { token }, timeout: 5000,
    });
  }

  // The driver sheet is read and written with the account session, so it
  // follows the login rather than this browser's storage.
  async character(token, action = "get", character = null, base = this.base) {
    return request(normalizeBase(base), "/api/character", {
      method: "POST", body: { session: token, action, character }, timeout: 8000,
    });
  }

  async rooms() {
    const data = await request(this.base, "/api/rooms", { timeout: 6000 });
    return data.rooms || [];
  }

  async createRoom({ name, maxPlayers, password, theme, player, session = "" }) {
    const data = await request(this.base, "/api/rooms", {
      method: "POST",
      body: { name, maxPlayers, password, theme, player, session },
    });
    this._adopt(data);
    return data;
  }

  async join(code, { password = "", player, session = "" }) {
    const data = await request(this.base, `/api/rooms/${encodeURIComponent(code.toUpperCase())}/join`, {
      method: "POST",
      body: { password, player, session },
    });
    this._adopt(data);
    return data;
  }

  _adopt(data) {
    this.code = data.code;
    this.token = data.token;
    this.playerId = data.playerId;
    this.seq = 0;
  }

  async codex() {
    return request(this.base, "/api/codex", { timeout: 7000 });
  }

  async world(region = "") {
    const query = region ? `?region=${encodeURIComponent(region)}` : "";
    return request(this.base, `/api/world${query}`, { timeout: 8000 });
  }

  async fleet(clientId) {
    return request(this.base, `/api/fleet?client=${encodeURIComponent(clientId)}`, { timeout: 7000 });
  }

  async fleetAction(payload) {
    return request(this.base, "/api/fleet", { method: "POST", body: payload, timeout: 8000 });
  }

  async sync(state = {}) {
    const data = await request(this.base, `/api/rooms/${this.code}/sync`, {
      method: "POST",
      body: { token: this.token, since: this.seq, ...state },
      timeout: 6000,
    });
    if (typeof data.seq === "number") this.seq = data.seq;
    return data;
  }

  async chat(text) {
    return request(this.base, `/api/rooms/${this.code}/chat`, {
      method: "POST",
      body: { token: this.token, text },
      timeout: 6000,
    });
  }

  // The profile, boss and trade endpoints all authenticate with the room token;
  // clientId alone is never enough to spend another player's cash.
  async profile(action = "get", payload = {}) {
    return request(this.base, `/api/rooms/${this.code}/profile`, {
      method: "POST",
      body: { token: this.token, action, ...payload },
      timeout: 8000,
    });
  }

  async boss(action = "start", payload = {}) {
    return request(this.base, `/api/rooms/${this.code}/boss`, {
      method: "POST",
      body: { token: this.token, action, ...payload },
      timeout: 6000,
    });
  }

  async trade(action, payload = {}) {
    return request(this.base, `/api/rooms/${this.code}/trade`, {
      method: "POST",
      body: { token: this.token, action, ...payload },
      timeout: 7000,
    });
  }

  async leave() {
    if (!this.code || !this.token) return;
    try {
      await request(this.base, `/api/rooms/${this.code}/leave`, {
        method: "POST",
        body: { token: this.token },
        timeout: 3000,
      });
    } catch { /* leaving is best-effort */ }
    this.code = null;
    this.token = null;
    this.playerId = null;
    this.seq = 0;
  }
}
