// Aetherhold — the road map: highways, secondary roads and trails, fog of war,
// service icons, legend, scale bar and the regional clock.

import { t, language as activeLanguage } from "./i18n.js";

const KIND_LABEL = {
  metropolis: "site.metropolis",
  town: "site.town",
  fuel: "site.fuel",
  garage: "site.garage",
  scrapyard: "site.scrapyard",
  camp: "site.camp",
  viewpoint: "site.viewpoint",
  historic: "site.historic",
  pass: "site.pass",
  inn: "site.inn",
};

const ROAD_STYLE = {
  highway: { width: 4.4, color: "#e8c477", dash: [] },
  secondary: { width: 2.4, color: "#9ec4d8", dash: [] },
  trail: { width: 1.6, color: "#b99e7c", dash: [5, 6] },
};

const CLIMATE_COLOR = {
  coastal: "#6fb3b8", temperate: "#8fbf7a", continental: "#c2a86a",
  alpine: "#cfe4ee", desert: "#d9a55e",
};

export class WorldMap {
  constructor(canvas, { onSelect = null, onTravel = null, onAction = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext("2d") || null;
    this.onSelect = onSelect;
    this.onTravel = onTravel;
    this.onAction = onAction;
    this.world = null;
    this.fleet = null;
    this.discovered = new Set();
    this.selected = null;
    this.hover = null;
    this.language = activeLanguage;
    this._hits = [];
    this._bounds = null;
    this._pointerHandler = (event) => this._handleMove(event);
    this._clickHandler = (event) => this._handleClick(event);
    canvas?.addEventListener("pointermove", this._pointerHandler);
    canvas?.addEventListener("pointerleave", () => { this.hover = null; this.render(); });
    canvas?.addEventListener("click", this._clickHandler);
  }

  setWorld(world) {
    this.world = world || null;
    this._bounds = null;
    this.render();
  }

  setFleet(fleet) {
    this.fleet = fleet || null;
    if (fleet?.discovered) this.discovered = new Set(fleet.discovered);
    const current = this.fleet?.node;
    if (this.selected && !this._isDiscovered(this.selected)) this.selected = null;
    this.render();
    if (this.onSelect) this.onSelect(this.selected ? this._node(this.selected) : null);
    return current;
  }

  setLanguage(language) {
    this.language = language;
    this.render();
  }

  resize() {
    const canvas = this.canvas;
    if (!canvas) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 900;
    const height = canvas.clientHeight || 560;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    this._ratio = ratio;
    this._width = width;
    this._height = height;
    this.render();
  }

  show() {
    this.resize();
    this.render();
  }

  select(nodeId) {
    this.selected = nodeId && this._isDiscovered(nodeId) ? nodeId : null;
    this.render();
    if (this.onSelect) this.onSelect(this.selected ? this._node(this.selected) : null);
  }

  isAdjacent(nodeId) {
    if (!this.world || !this.fleet?.node || !nodeId) return false;
    return this.world.roads.some((road) =>
      (road.from === this.fleet.node && road.to === nodeId)
      || (road.to === this.fleet.node && road.from === nodeId));
  }

  roadTo(nodeId) {
    if (!this.world || !this.fleet?.node || !nodeId) return null;
    return this.world.roads.find((road) =>
      (road.from === this.fleet.node && road.to === nodeId)
      || (road.to === this.fleet.node && road.from === nodeId)) || null;
  }

  _node(id) {
    return this.world?.nodes.find((node) => node.id === id) || null;
  }

  _isDiscovered(id) {
    return this.discovered.has(id);
  }

  _project(x, z) {
    if (!this._bounds) return { x: 0, y: 0 };
    const pad = 54;
    const width = (this._width || 900) - pad * 2;
    const height = (this._height || 560) - pad * 2 - 30;
    const { minX, maxX, minZ, maxZ } = this._bounds;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const scale = Math.min(width / spanX, height / spanZ);
    return {
      x: pad + (x - minX) * scale + (width - spanX * scale) / 2,
      y: pad + 10 + (z - minZ) * scale + (height - spanZ * scale) / 2,
    };
  }

  _computeBounds() {
    const nodes = this.world?.nodes || [];
    if (!nodes.length) {
      this._bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
      return;
    }
    // Only discovered land shapes the drawn extent until travel widens it.
    const visible = nodes.filter((node) => this._isDiscovered(node.id));
    const pool = visible.length >= 2 ? visible : nodes;
    const xs = pool.map((node) => node.x);
    const zs = pool.map((node) => node.z);
    const minX = Math.min(...xs) - 70;
    const maxX = Math.max(...xs) + 70;
    const minZ = Math.min(...zs) - 70;
    const maxZ = Math.max(...zs) + 70;
    this._bounds = { minX, maxX, minZ, maxZ };
  }

  render() {
    const ctx = this.ctx;
    if (!ctx || !this.world) return;
    if (!this._width) this.resize();
    if (!this._width) return;
    this._computeBounds();
    const width = this._width;
    const height = this._height;
    ctx.setTransform(this._ratio || 1, 0, 0, this._ratio || 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Parchment-dark backdrop.
    const gradient = ctx.createRadialGradient(width * 0.45, height * 0.4, 30, width * 0.5, height * 0.5, width * 0.8);
    gradient.addColorStop(0, "#1c2330");
    gradient.addColorStop(1, "#0a0c12");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Grid, in kilometres.
    ctx.strokeStyle = "rgba(160,190,210,0.07)";
    ctx.lineWidth = 1;
    const grid = 100;
    const step = (this._bounds.maxX - this._bounds.minX) / 10;
    void grid;
    for (let i = 0; i <= 10; i += 1) {
      const x = (this._project(this._bounds.minX + step * i, 0)).x;
      ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, height - 26); ctx.stroke();
    }
    for (let i = 0; i <= 7; i += 1) {
      const y = (this._project(0, this._bounds.minZ + (this._bounds.maxZ - this._bounds.minZ) / 7 * i)).y;
      ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(width - 16, y); ctx.stroke();
    }

    // Roads — fog hides any road with an unexplored end.
    const roads = this.world.roads
      .filter((road) => this._isDiscovered(road.from) && this._isDiscovered(road.to))
      .sort((a, b) => (a.kind === "highway" ? -1 : 1) - (b.kind === "highway" ? -1 : 1));
    const route = this.selected && this.isAdjacent(this.selected) ? this.roadTo(this.selected) : null;
    for (const road of roads) {
      const from = this._node(road.from);
      const to = this._node(road.to);
      if (!from || !to) continue;
      const a = this._project(from.x, from.z);
      const b = this._project(to.x, to.z);
      const style = ROAD_STYLE[road.kind] || ROAD_STYLE.secondary;
      ctx.save();
      ctx.strokeStyle = route && route.id === road.id ? "#ffd98a" : style.color;
      ctx.globalAlpha = route && route.id === road.id ? 0.95 : 0.42;
      ctx.lineWidth = style.width + (route && route.id === road.id ? 1.6 : 0);
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const midpointX = (a.x + b.x) / 2 + Math.sin((a.y - b.y) * 0.01) * 12;
      const midpointY = (a.y + b.y) / 2 + Math.cos((a.x - b.x) * 0.01) * 12;
      ctx.quadraticCurveTo(midpointX, midpointY, b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }

    // Undiscovered masses are drawn as fog banks, not roads.
    for (const node of this.world.nodes) {
      if (this._isDiscovered(node.id)) continue;
      const point = this._project(node.x, node.z);
      const radius = 46;
      const fog = ctx.createRadialGradient(point.x, point.y, 2, point.x, point.y, radius);
      fog.addColorStop(0, "rgba(18,22,30,0.55)");
      fog.addColorStop(1, "rgba(10,12,18,0)");
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(150,160,178,0.22)";
      ctx.font = "600 13px Inter, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("?", point.x, point.y + 4);
    }

    // Stops and services.
    this._hits = [];
    for (const node of this.world.nodes) {
      if (!this._isDiscovered(node.id)) continue;
      const point = this._project(node.x, node.z);
      const isCurrent = this.fleet?.node === node.id;
      const isSelected = this.selected === node.id;
      this._hits.push({ id: node.id, x: point.x, y: point.y, r: 18 });
      if (isSelected) {
        ctx.strokeStyle = "#ffd98a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      this._drawNode(ctx, node, point, isCurrent);
      const label = node.name;
      ctx.font = isCurrent ? "600 12.5px Inter, Segoe UI, sans-serif" : "500 11.5px Inter, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = isCurrent ? "#ffe9bd" : "rgba(236,233,247,0.82)";
      ctx.fillText(label, point.x, point.y - 18);
      if (isCurrent) {
        ctx.fillStyle = "rgba(255,217,138,0.9)";
        ctx.font = "600 9.5px Inter, Segoe UI, sans-serif";
        ctx.fillText(t("map.vehicleAt").toUpperCase(), point.x, point.y + 28);
      }
    }

    this._drawLegend(ctx, width, height);
    this._drawClock(ctx, width);
    this._drawScale(ctx, width, height);
  }

  _drawNode(ctx, node, point, isCurrent) {
    const color = CLIMATE_COLOR[node.climate] || "#9ab";
    ctx.save();
    ctx.translate(point.x, point.y);
    // Climate collar.
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = isCurrent ? "#ffd98a" : "#dfe8f0";

    if (node.kind === "metropolis") {
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = "rgba(10,12,18,0.9)";
      ctx.fillRect(-1, -1, 2, 2);
    } else if (node.kind === "fuel") {
      ctx.fillRect(-2.5, -4, 5, 8);
      ctx.fillRect(2.5, -2, 2.5, 1.6);
    } else if (node.kind === "garage") {
      ctx.beginPath();
      ctx.moveTo(-4.5, 3.5); ctx.lineTo(0, -4.5); ctx.lineTo(4.5, 3.5); ctx.closePath();
      ctx.fill();
    } else if (node.kind === "scrapyard") {
      ctx.beginPath();
      ctx.moveTo(-5, 4); ctx.lineTo(-2, -2); ctx.lineTo(0, 2); ctx.lineTo(2.5, -3.5); ctx.lineTo(5, 4);
      ctx.closePath(); ctx.fill();
    } else if (node.kind === "camp") {
      ctx.beginPath();
      ctx.moveTo(0, -4.5); ctx.lineTo(5, 4); ctx.lineTo(-5, 4); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(10,12,18,0.8)";
      ctx.beginPath();
      ctx.moveTo(0, -1); ctx.lineTo(2, 4); ctx.lineTo(-2, 4); ctx.closePath();
      ctx.fill();
    } else if (node.kind === "viewpoint") {
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (node.kind === "historic") {
      ctx.fillRect(-4.5, -4, 9, 2);
      ctx.fillRect(-3.5, -2, 1.6, 6);
      ctx.fillRect(2, -2, 1.6, 6);
    } else if (node.kind === "pass") {
      ctx.beginPath();
      ctx.moveTo(-5, 4); ctx.lineTo(-1, -5); ctx.lineTo(2, 0); ctx.lineTo(5, 4);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawLegend(ctx, width, height) {
    const rows = [
      ["highway", t("map.highway")],
      ["secondary", t("map.secondary")],
      ["trail", t("map.trail")],
    ];
    const x = 22;
    let y = height - 96;
    ctx.save();
    ctx.fillStyle = "rgba(8,10,16,0.62)";
    ctx.strokeStyle = "rgba(242,201,125,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 20, 208, 96, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(242,201,125,0.8)";
    ctx.font = "600 9.5px Inter, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(t("map.legend").toUpperCase(), x, y - 6);
    ctx.font = "500 10.5px Inter, Segoe UI, sans-serif";
    rows.forEach(([kind, label], index) => {
      const rowY = y + 12 + index * 18;
      const style = ROAD_STYLE[kind];
      ctx.strokeStyle = style.color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = style.width;
      ctx.setLineDash(style.dash);
      ctx.beginPath(); ctx.moveTo(x, rowY); ctx.lineTo(x + 26, rowY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(236,233,247,0.72)";
      ctx.fillText(label, x + 36, rowY + 3.5);
    });
    ctx.restore();
    void width;
  }

  _drawScale(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = "rgba(236,233,247,0.55)";
    ctx.fillStyle = "rgba(236,233,247,0.6)";
    ctx.lineWidth = 1.4;
    const x = width - 150;
    const y = height - 28;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 110, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 110, y - 4); ctx.lineTo(x + 110, y + 4); ctx.stroke();
    ctx.font = "500 10px Inter, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("200 km", x + 55, y - 8);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(236,233,247,0.4)";
    ctx.fillText(t("map.scale"), x + 110, y + 16);
    ctx.restore();
  }

  _drawClock(ctx, width) {
    const utc = this.world?.utc ?? 0;
    const now = new Date(Date.now() + (utc * 60 + new Date().getTimezoneOffset()) * 60000);
    const text = now.toLocaleTimeString(this.language === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
    ctx.save();
    ctx.fillStyle = "rgba(8,10,16,0.55)";
    ctx.beginPath();
    ctx.roundRect(width - 168, 18, 148, 40, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(242,201,125,0.9)";
    ctx.font = "600 15px Inter, Segoe UI, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(text, width - 28, 36);
    ctx.fillStyle = "rgba(236,233,247,0.5)";
    ctx.font = "500 8.5px Inter, Segoe UI, sans-serif";
    ctx.fillText(`${t("map.clock").toUpperCase()} · ${this.world?.timezone || ""}`, width - 28, 50);
    ctx.restore();
  }

  _hitTest(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestDistance = 22;
    for (const hit of this._hits) {
      const distance = Math.hypot(x - hit.x, y - hit.y);
      if (distance < bestDistance) {
        best = hit.id;
        bestDistance = distance;
      }
    }
    return best;
  }

  _handleMove(event) {
    const hit = this._hitTest(event);
    if (hit === this.hover) return;
    this.hover = hit;
    this.canvas.style.cursor = hit ? "pointer" : "default";
  }

  _handleClick(event) {
    const hit = this._hitTest(event);
    if (!hit) {
      this.select(null);
      return;
    }
    this.select(hit);
  }

  dispose() {
    this.canvas?.removeEventListener("pointermove", this._pointerHandler);
    this.canvas?.removeEventListener("click", this._clickHandler);
  }
}
