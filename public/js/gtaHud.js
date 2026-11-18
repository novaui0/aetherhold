// Aetherhold — GTA-style HUD.
//
// A rotating radar that is drawn from the city's own road and blip data, a
// segmented health/armour pair, a cash counter, a wanted-level strip, and a
// speedometer with a needle. All of it is canvas + a little DOM so it stays
// sharp at any resolution.

const TAU = Math.PI * 2;

export class GtaHud {
  constructor(options = {}) {
    this.radarSize = options.radarSize || 188;
    this.visible = false;
    this.time = 0;
    this.areaName = "";
    this.areaUntil = 0;
    this.cashShown = 0;
    this.cashTarget = 0;

    this.root = document.createElement("div");
    this.root.id = "gta-hud";
    this.root.className = "gta-hud";
    this.root.innerHTML = `
      <div class="gta-topbar">
        <div class="gta-wanted" id="gta-wanted"></div>
        <div class="gta-money"><span class="gta-cash" id="gta-cash">$0</span></div>
      </div>
      <div class="gta-area" id="gta-area"></div>
      <div class="gta-left">
        <div class="gta-bars">
          <div class="gta-bar gta-health"><i id="gta-health-fill"></i></div>
          <div class="gta-bar gta-armor"><i id="gta-armor-fill"></i></div>
        </div>
        <div class="gta-radar-wrap">
          <canvas id="gta-radar" width="${this.radarSize * 2}" height="${this.radarSize * 2}"></canvas>
          <span class="gta-north" id="gta-north">N</span>
        </div>
      </div>
      <div class="gta-vehicle" id="gta-vehicle">
        <canvas id="gta-speedo" width="260" height="260"></canvas>
        <div class="gta-speed-text"><b id="gta-speed">0</b><span>KM/H</span></div>
        <div class="gta-gear" id="gta-gear">N</div>
        <div class="gta-fuel"><i id="gta-fuel-fill"></i></div>
      </div>
      <div class="gta-hintline" id="gta-hintline"></div>
    `;
    document.body.appendChild(this.root);

    this.radar = this.root.querySelector("#gta-radar");
    this.radarCtx = this.radar.getContext("2d");
    this.speedo = this.root.querySelector("#gta-speedo");
    this.speedoCtx = this.speedo.getContext("2d");
    this.cashEl = this.root.querySelector("#gta-cash");
    this.healthFill = this.root.querySelector("#gta-health-fill");
    this.armorFill = this.root.querySelector("#gta-armor-fill");
    this.wantedEl = this.root.querySelector("#gta-wanted");
    this.areaEl = this.root.querySelector("#gta-area");
    this.northEl = this.root.querySelector("#gta-north");
    this.vehicleEl = this.root.querySelector("#gta-vehicle");
    this.speedEl = this.root.querySelector("#gta-speed");
    this.gearEl = this.root.querySelector("#gta-gear");
    this.fuelFill = this.root.querySelector("#gta-fuel-fill");
    this.hintEl = this.root.querySelector("#gta-hintline");

    this.map = null;
    this.wanted = 0;
    // How much ground the radar shows around the player, in metres.
    this.zoomLevels = [120, 200, 300];
    this.zoomIndex = 1;
    this.radarWrap = this.root.querySelector(".gta-radar-wrap");
    if (this.radarWrap) {
      this.radarWrap.title = "Radar zoom (Z)";
      this.radarWrap.addEventListener("click", () => this.cycleZoom());
    }
  }

  cycleZoom() {
    this.zoomIndex = (this.zoomIndex + 1) % this.zoomLevels.length;
    return this.zoomLevels[this.zoomIndex];
  }

  setMap(radarData) {
    this.map = radarData || null;
  }

  show() {
    this.visible = true;
    this.root.classList.remove("hidden");
    this.root.classList.add("live");
  }

  hide() {
    this.visible = false;
    this.root.classList.add("hidden");
    this.root.classList.remove("live");
  }

  destroy() {
    this.root.remove();
  }

  setHint(text) {
    if (!this.hintEl) return;
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
  }

  update(state, dt = 0.016) {
    if (!this.visible || !state) return;
    this.time += dt;
    const { x = 0, z = 0, heading = 0, inVehicle = false, cash = 0 } = state;

    // Money counts up rather than snapping, the way a game cheats at it.
    this.cashTarget = cash;
    if (Math.abs(this.cashShown - this.cashTarget) > 1) {
      this.cashShown += (this.cashTarget - this.cashShown) * Math.min(1, dt * 6);
    } else {
      this.cashShown = this.cashTarget;
    }
    this.cashEl.textContent = `$${Math.round(this.cashShown).toLocaleString("en-US")}`;

    this.healthFill.style.width = `${Math.max(0, Math.min(100, state.health ?? 100))}%`;
    this.armorFill.style.width = `${Math.max(0, Math.min(100, state.armor ?? 0))}%`;

    this._drawWanted(state.wanted || 0);
    this._drawRadar(x, z, heading, state.location || "");
    if (state.prompt) this.setHint(state.prompt);
    this.vehicleEl.classList.toggle("on", Boolean(inVehicle));
    if (inVehicle) {
      this._drawSpeedo(state);
      this.speedEl.textContent = String(Math.round(state.speedKmh || 0));
      this.gearEl.textContent = state.gear || "N";
      this.fuelFill.style.width = `${Math.max(0, Math.min(100, state.fuel ?? 0))}%`;
    }

    if (state.area && state.area !== this.areaName) {
      this.areaName = state.area;
      this.areaEl.textContent = state.area;
      this.areaEl.classList.add("show");
      this.areaUntil = this.time + 3.4;
    }
    if (this.time > this.areaUntil) this.areaEl.classList.remove("show");
  }

  _drawWanted(stars) {
    const count = Math.max(0, Math.min(5, Math.round(stars)));
    if (count === this.wanted) return;
    this.wanted = count;
    this.wantedEl.innerHTML = Array.from({ length: 5 }, (_, index) => (
      `<span class="gta-star${index < count ? " on" : ""}">★</span>`
    )).join("");
  }

  _drawRadar(px, pz, heading, location) {
    const ctx = this.radarCtx;
    const size = this.radar.width;
    const center = size / 2;
    const scale = (center - 8) / this.zoomLevels[this.zoomIndex];
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 4, 0, TAU);
    ctx.clip();
    ctx.fillStyle = "rgba(8,14,12,0.82)";
    ctx.fillRect(0, 0, size, size);

    const project = (wx, wz) => {
      const dx = wx - px;
      const dz = wz - pz;
      const forward = dx * Math.sin(heading) + dz * Math.cos(heading);
      const right = dx * Math.cos(heading) - dz * Math.sin(heading);
      return [center + right * scale, center - forward * scale];
    };

    const map = this.map;
    if (map) {
      // Blocks first: dark plates, then the roads drawn on top. The city has
      // over a thousand blocks now, so anything outside the radar circle is
      // rejected by its centre before a single corner is projected.
      ctx.fillStyle = "rgba(38,52,46,0.85)";
      const reach = this.zoomLevels[this.zoomIndex] * 1.15 + 80;
      for (const block of map.blocks) {
        const bx = (block.x0 + block.x1) / 2;
        const bz = (block.z0 + block.z1) / 2;
        if (Math.abs(bx - px) > reach || Math.abs(bz - pz) > reach) continue;
        const corners = [
          project(block.x0, block.z0), project(block.x1, block.z0),
          project(block.x1, block.z1), project(block.x0, block.z1),
        ];
        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i][0], corners[i][1]);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(186,204,196,0.55)";
      ctx.lineCap = "butt";
      for (const road of map.roads) {
        const from = project(road.x1, road.z1);
        const to = project(road.x2, road.z2);
        ctx.lineWidth = Math.max(2, road.w * scale);
        ctx.beginPath();
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
        ctx.stroke();
      }
      // Centre line of the boulevard.
      const a = project(-180, 0);
      const b = project(180, 0);
      ctx.strokeStyle = "rgba(240,210,120,0.4)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();

      for (const blip of map.blips) {
        const [bx, by] = project(blip.x, blip.z);
        if (Math.hypot(bx - center, by - center) > center + 8) continue;
        ctx.fillStyle = blip.color || "#ffd166";
        ctx.beginPath();
        ctx.arc(bx, by, 3.6, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // Scanner sweep.
    const sweep = (this.time * 0.6) % TAU;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, "rgba(120,220,180,0.10)");
    gradient.addColorStop(1, "rgba(120,220,180,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, center, sweep, sweep + 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Player arrow.
    ctx.save();
    ctx.translate(center, center);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = "#f7f4ea";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();

    // Compass: north is -Z in world space.
    const northRight = -Math.sin(heading) * -1;
    const northForward = -Math.cos(heading);
    const angle = Math.atan2(northRight, northForward);
    this.northEl.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;

    ctx.strokeStyle = "rgba(240,238,228,0.75)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(center, center, center - 5, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, center - 1.5, 0, TAU);
    ctx.stroke();

    if (location) this.setHint(location);
  }

  _drawSpeedo(state) {
    const ctx = this.speedoCtx;
    const size = this.speedo.width;
    const center = size / 2;
    const radius = center - 22;
    const speed = Math.max(0, Math.min(240, state.speedKmh || 0));
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;
    const t = speed / 240;

    ctx.clearRect(0, 0, size, size);
    // Track.
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(center, center, radius, start, end);
    ctx.stroke();

    // Filled arc.
    const gradient = ctx.createLinearGradient(0, size, size, 0);
    gradient.addColorStop(0, "#8ee6c8");
    gradient.addColorStop(0.6, "#f2d06b");
    gradient.addColorStop(1, "#ff6b5c");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(center, center, radius, start, start + (end - start) * t);
    ctx.stroke();

    // Ticks.
    for (let i = 0; i <= 12; i += 1) {
      const angle = start + ((end - start) * i) / 12;
      const inner = radius - 16;
      const outer = radius - 8;
      ctx.strokeStyle = i % 3 === 0 ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = i % 3 === 0 ? 3 : 1.6;
      ctx.beginPath();
      ctx.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
      ctx.lineTo(center + Math.cos(angle) * outer, center + Math.sin(angle) * outer);
      ctx.stroke();
    }

    // Needle.
    const needleAngle = start + (end - start) * t;
    ctx.strokeStyle = "#ffe8b8";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(255,190,110,0.8)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(center - Math.cos(needleAngle) * 16, center - Math.sin(needleAngle) * 16);
    ctx.lineTo(center + Math.cos(needleAngle) * (radius - 24), center + Math.sin(needleAngle) * (radius - 24));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffe8b8";
    ctx.beginPath();
    ctx.arc(center, center, 6, 0, TAU);
    ctx.fill();
  }
}
