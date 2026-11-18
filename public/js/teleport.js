// teleport.js — the /tp chat command.
//
// Teleporting is a local move: the driver's position is what the sync loop
// already reports to the host, so a warp here is seen by everyone in the hall
// on the next tick. /tp boss is the one exception — the raid is server-owned,
// so the caller starts the gate through the normal boss endpoint.

import { t } from "./i18n.js";

const BOSS_WORDS = new Set(["boss", "bosses", "raid", "gate", "arena", "patron", "kapi", "kapı"]);
const SPAWN_WORDS = new Set(["spawn", "start", "plaza", "center", "centre", "home", "merkez", "meydan", "ev"]);

// Every place the district knows, in both languages plus the usual shorthand.
const PLACES = {
  garage: ["garage", "garaj", "mechanic", "tamirci"],
  fuel: ["fuel", "benzin", "petrol", "station", "istasyon"],
  scrapyard: ["scrapyard", "scrap", "hurda", "junk"],
  camp: ["camp", "market", "kamp", "shop", "pazar", "trading"],
  warehouse: ["warehouse", "depot", "depo", "cargo"],
  tower: ["tower", "kule", "viewpoint", "manzara"],
  inn: ["inn", "tavern", "han", "rest", "otel"],
};

const SPAWN = { x: -5, z: 9.6, heading: Math.PI };

function fold(value) {
  return String(value || "")
    .toLowerCase()
    // Turkish dotless i and the dotted capital do not decompose under NFD.
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fail(text) {
  return { ok: false, text };
}

function go(world, x, z, heading, text) {
  if (!world.warpTo(x, z, { heading })) return fail(t("tp.blocked"));
  return { ok: true, text };
}

function usage() {
  return { ok: false, text: t("tp.usage") };
}

function findPlayer(world, wanted) {
  if (!world?.players) return null;
  let partial = null;
  for (const record of world.players.values()) {
    if (!record?.data || record.id === world.selfId) continue;
    const name = fold(record.data.name);
    if (!name) continue;
    if (name === wanted) return record;
    if (!partial && name.startsWith(wanted)) partial = record;
  }
  return partial;
}

function findSite(world, wanted) {
  const sites = world?.region?.sites || [];
  for (const site of sites) {
    const keys = [site.id, site.kind, ...(PLACES[site.id] || []), ...(PLACES[site.kind] || [])];
    if (keys.some((key) => fold(key) === wanted)) return site;
  }
  return null;
}

/**
 * Run `/tp <target>`. Returns `{ ok, text, run }`; `run: "boss"` means the
 * caller should open the gate through the server instead of warping.
 */
export function teleportCommand(world, raw) {
  if (!world) return fail(t("tp.noworld"));
  const args = String(raw || "").trim().split(/\s+/).filter(Boolean);
  if (!args.length) return usage();

  const joined = fold(args.join(" "));
  const first = fold(args[0]);

  if (BOSS_WORDS.has(first) || joined === "boss world" || joined === "boss arena") {
    if (world.zone === "raid") return fail(t("tp.bosshere"));
    return { ok: true, run: "boss", text: t("tp.boss") };
  }

  if (SPAWN_WORDS.has(first)) {
    const sp = world.region?.spawnPoint || SPAWN;
    return go(world, sp.x, sp.z, sp.heading ?? SPAWN.heading, t("tp.spawn"));
  }

  // /tp 42 -18 — map coordinates, clamped to the district by the world.
  if (args.length === 2) {
    const x = Number(args[0].replace(",", "."));
    const z = Number(args[1].replace(",", "."));
    if (Number.isFinite(x) && Number.isFinite(z)) {
      // Report where the driver actually lands — the district clamps to its edge.
      const spot = world.region?.clamp ? world.region.clamp(x, z) : { x, z };
      return go(world, spot.x, spot.z, null, t("tp.coords", {
        x: Math.round(spot.x), z: Math.round(spot.z),
      }));
    }
  }

  const wanted = fold(args.join(" "));
  if (!wanted || wanted === "me" || wanted === "self" || wanted === "ben") {
    return fail(t("tp.me"));
  }

  const site = findSite(world, wanted);
  if (site) {
    const label = t(`site.${site.kind}`);
    return go(world, site.x, site.z, null, t("tp.site", {
      name: label === `site.${site.kind}` ? site.kind : label,
    }));
  }

  const target = findPlayer(world, wanted);
  if (target) {
    const pose = target.data.pos || [0, 0, 0];
    const heading = Number(target.data.rot) || 0;
    // Land just behind them, close enough to talk without standing inside.
    const x = pose[0] - Math.sin(heading) * 1.6;
    const z = pose[2] - Math.cos(heading) * 1.6;
    return go(world, x, z, heading, t("tp.player", { name: target.data.name }));
  }

  return fail(t("tp.unknown", { name: args.join(" ") }));
}
