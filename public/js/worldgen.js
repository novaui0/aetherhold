// worldgen.js — the city plan.
//
// city.js still hand-builds the historic core (the boulevard, the garage, the
// market row); everything outside it is planned here as plain data. Keeping the
// plan free of THREE objects means the layout can be checked, scaled or dumped
// without touching a renderer, and the city builder stays one file of recipes.
//
// The grid is deliberately city-sized: 2640 × 2240 world units — roughly 5 km
// of ring road — split into six named districts around the old core. Blocks are
// 44 × 70 with 16-unit streets between them, so a pedestrian crossing the map
// walks for half an hour and a car needs a couple of minutes.

export const CITY_GRID = {
  edge: { x: 1320, z: 1120 },
  core: { x: 176, z: 104 },
  avenueHalf: 12,
  block: { w: 44, d: 70 },
  street: 16,
};

export const DISTRICTS = [
  { name: "DOWNTOWN", x0: -176, x1: 176, z0: -104, z1: 104, core: true },
  { name: "HARBOR POINT", x0: 176, x1: 1320, z0: 0, z1: 1120 },
  { name: "SOUTHPORT", x0: 176, x1: 1320, z0: -1120, z1: 0 },
  { name: "OLD TOWN", x0: -1320, x1: -176, z0: 0, z1: 1120 },
  { name: "WESTGATE", x0: -1320, x1: -176, z0: -1120, z1: 0 },
  { name: "AURELIA HEIGHTS", x0: -176, x1: 176, z0: 104, z1: 1120 },
  { name: "IRONWORKS", x0: -176, x1: 176, z0: -1120, z1: -104 },
];

// Zoning names used by the block picker. Every block carries the district it
// belongs to so the HUD, the map and the street signs can name the place.
const ZONE_OF_DISTRICT = {
  "HARBOR POINT": "east",
  SOUTHPORT: "southPort",
  "OLD TOWN": "west",
  WESTGATE: "southWest",
  "AURELIA HEIGHTS": "north",
  IRONWORKS: "south",
};

// Column origins. Blocks are `block.w` wide; the numbers are spaced by
// block width + street width so the generated streets line up with the grid.
const EAST_X = [];
for (let x = 186, i = 0; i < 18; i += 1, x += 60) EAST_X.push(x);
const WEST_X = EAST_X.map((x) => -x - CITY_GRID.block.w);
const INNER_X = [-176, -132, -88, -44, 0, 44, 88, 132];
const ROWS_Z = [];
for (let z = -1072, i = 0; i < 25; i += 1, z += 86) ROWS_Z.push(z);

// Named services. Each entry becomes a block with a sign, a blip, an NPC and a
// working counter; the counts decide how many of them the map gets.
const SERVICE_QUEUE = [
  ...Array(10).fill({ kind: "subway", label: "METRO", color: "#9fd0ff", npc: null }),
  ...Array(7).fill({ kind: "fuel", label: "GO-GO FUEL", color: "#ffd166", npc: "attendant" }),
  ...Array(6).fill({ kind: "market", label: "NIGHT MARKET", color: "#a9f0c0", npc: "trader" }),
  ...Array(5).fill({ kind: "garage", label: "REDLINE GARAGE", color: "#ff8a5c", npc: "mechanic" }),
  ...Array(5).fill({ kind: "diner", label: "THE SPOON", color: "#ff70a6", npc: "gossip" }),
  ...Array(4).fill({ kind: "clinic", label: "ST. ELGIN CLINIC", color: "#9ff2c9", npc: "innkeeper" }),
  ...Array(3).fill({ kind: "police", label: "9TH PRECINCT", color: "#9fd0ff", npc: null }),
  ...Array(4).fill({ kind: "plaza", label: "PIONEER PLAZA", color: "#ffe9b8", npc: "gossip" }),
  ...Array(2).fill({ kind: "hotel", label: "THE MERIDIAN", color: "#c9b6ff", npc: "innkeeper" }),
];

function makeRng(seed = 20261118) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function districtAt(x, z) {
  for (const district of DISTRICTS) {
    if (x >= district.x0 && x <= district.x1 && z >= district.z0 && z <= district.z1) {
      return district.name;
    }
  }
  return "OUTSKIRTS";
}

export function districtNameAt(x, z) {
  return districtAt(x, z);
}

// `depth` is how many blocks the cell sits from the core: downtown towers give
// way to rowhouses and freight yards as the number grows.
function pickKind(zone, depth, rng) {
  const roll = rng();
  if (zone === "east") {
    if (depth <= 1) return roll < 0.5 ? "tower" : roll < 0.78 ? "apartment" : "shops";
    if (depth <= 4) return roll < 0.3 ? "tower" : roll < 0.6 ? "apartment" : roll < 0.82 ? "shops" : "park";
    if (depth <= 9) return roll < 0.34 ? "apartment" : roll < 0.62 ? "shops" : roll < 0.8 ? "brick" : "park";
    return roll < 0.36 ? "warehouse" : roll < 0.6 ? "lot" : roll < 0.82 ? "house" : "park";
  }
  if (zone === "southPort") {
    if (depth <= 3) return roll < 0.34 ? "warehouse" : roll < 0.56 ? "lot" : roll < 0.78 ? "shops" : "apartment";
    return roll < 0.46 ? "warehouse" : roll < 0.74 ? "lot" : roll < 0.9 ? "house" : "park";
  }
  if (zone === "west") {
    if (depth <= 2) return roll < 0.4 ? "apartment" : roll < 0.66 ? "shops" : "brick";
    if (depth <= 6) return roll < 0.3 ? "apartment" : roll < 0.56 ? "house" : roll < 0.8 ? "shops" : "park";
    return roll < 0.5 ? "house" : roll < 0.72 ? "park" : roll < 0.9 ? "lot" : "apartment";
  }
  if (zone === "southWest") {
    if (depth <= 4) return roll < 0.36 ? "house" : roll < 0.58 ? "apartment" : roll < 0.8 ? "shops" : "park";
    return roll < 0.52 ? "house" : roll < 0.72 ? "park" : roll < 0.88 ? "lot" : "warehouse";
  }
  if (zone === "north") {
    if (depth <= 2) return roll < 0.34 ? "apartment" : roll < 0.58 ? "tower" : roll < 0.8 ? "shops" : "park";
    if (depth <= 7) return roll < 0.42 ? "house" : roll < 0.62 ? "apartment" : roll < 0.82 ? "park" : "shops";
    return roll < 0.5 ? "house" : roll < 0.78 ? "park" : roll < 0.92 ? "lot" : "apartment";
  }
  // south — docks, works and freight yards
  if (depth <= 4) return roll < 0.4 ? "warehouse" : roll < 0.62 ? "lot" : roll < 0.8 ? "apartment" : "shops";
  return roll < 0.5 ? "warehouse" : roll < 0.78 ? "lot" : roll < 0.9 ? "brick" : "park";
}

function pushBlock(blocks, x0, z0, width, zone, rng) {
  const x1 = x0 + width;
  const z1 = z0 + CITY_GRID.block.d;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // The boulevard cuts the map in half: no block may sit on it, and the old
  // core keeps its hand-built cell layout.
  if (z0 < CITY_GRID.avenueHalf && z1 > -CITY_GRID.avenueHalf) return null;
  const district = districtAt(cx, cz);
  // The south half of each outer band is a different neighbourhood: docks to
  // the east, terraces to the west.
  const area = zone === "east" && cz < 0 ? "southPort"
    : zone === "west" && cz < 0 ? "southWest" : zone;
  const distance = Math.max(
    Math.abs(cx) - CITY_GRID.core.x,
    Math.abs(cz) - CITY_GRID.core.z,
  );
  const level = Math.max(0, Math.round(distance / 120));
  const block = {
    x0, x1, z0, z1,
    kind: pickKind(area, level, rng),
    zone: area,
    district,
    depth: level,
  };
  blocks.push(block);
  return block;
}

function overlapsCore(block) {
  const core = CITY_GRID.core;
  return block.x0 < core.x && block.x1 > -core.x
    && block.z0 < core.z && block.z1 > -core.z;
}

// Lay the named services out over the map: shuffle the candidate blocks once and
// take the first cell that is far enough from everything already placed, so the
// fuel station on the far west side is not next door to the one in the east.
function assignServices(blocks, rng) {
  const candidates = blocks
    .filter((block) => !overlapsCore(block))
    .map((block) => ({ block, roll: rng() }))
    .sort((a, b) => a.roll - b.roll)
    .map((entry) => entry.block);
  const placed = [];
  let cursor = 0;
  for (const service of SERVICE_QUEUE) {
    for (let tries = 0; tries < candidates.length; tries += 1) {
      const block = candidates[(cursor + tries) % candidates.length];
      if (block.service) continue;
      const cx = (block.x0 + block.x1) / 2;
      const cz = (block.z0 + block.z1) / 2;
      const tooClose = placed.some((other) => Math.hypot(
        cx - (other.x0 + other.x1) / 2,
        cz - (other.z0 + other.z1) / 2,
      ) < 210);
      if (tooClose) continue;
      block.kind = service.kind;
      block.service = true;
      block.siteLabel = service.label;
      block.siteColor = service.color;
      block.services = service.kind === "subway"
        ? ["fast travel"]
        : service.kind === "fuel" ? ["fuel", "snacks"]
          : service.kind === "garage" ? ["repair", "vehicles"]
            : service.kind === "clinic" ? ["heal", "medkits"]
              : service.kind === "market" ? ["buy", "sell"]
                : service.kind === "police" ? ["bounty", "records"]
                  : service.kind === "diner" ? ["food", "rumours"]
                    : service.kind === "hotel" ? ["rest", "save"]
                      : ["meet"];
      if (service.npc) block.npc = service.npc;
      placed.push(block);
      cursor = (cursor + tries + 17) % candidates.length;
      break;
    }
  }
  return placed;
}

// The stadium is a superblock: four cells carved out and replaced by one big
// rectangle so the bowl, the floodlights and the concourse fit inside it.
function carveStadium(blocks) {
  const x0 = EAST_X[7];
  const z0 = ROWS_Z[16];
  const width = CITY_GRID.block.w * 2 + CITY_GRID.street;
  const depth = CITY_GRID.block.d * 2 + CITY_GRID.street;
  const remove = new Set([`${EAST_X[7]}:${ROWS_Z[16]}`, `${EAST_X[8]}:${ROWS_Z[16]}`,
    `${EAST_X[7]}:${ROWS_Z[17]}`, `${EAST_X[8]}:${ROWS_Z[17]}`]);
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (remove.has(`${block.x0}:${block.z0}`)) blocks.splice(i, 1);
  }
  const stadium = {
    x0, x1: x0 + width, z0, z1: z0 + depth,
    kind: "stadium",
    zone: "east",
    district: districtAt(x0 + width / 2, z0 + depth / 2),
    service: true,
    siteLabel: "ELGIN BOWL",
    siteColor: "#9fd0ff",
    services: ["arena", "crowd"],
    depth: 0,
    superblock: true,
  };
  blocks.push(stadium);
  return stadium;
}

// Every street the plan paints, plus the street list the radar and the map use.
function buildRoads() {
  const roads = [];
  const edge = CITY_GRID.edge;
  const street = (x1, z1, x2, z2, w, name, major = false) => {
    roads.push({ x1, z1, x2, z2, w, name, major, paint: major });
  };

  // The boulevard: the old spine of the city, now running the full width.
  street(-edge.x, 0, edge.x, 0, CITY_GRID.avenueHalf * 2, "VINEWOOD BLVD", true);

  // Ring road around the whole grid, the one every driver eventually uses.
  street(-edge.x + 20, -edge.z + 20, edge.x - 20, -edge.z + 20, 22, "RING ROAD", true);
  street(-edge.x + 20, edge.z - 20, edge.x - 20, edge.z - 20, 22, "RING ROAD", true);
  street(-edge.x + 20, -edge.z + 20, -edge.x + 20, edge.z - 20, 22, "RING ROAD", true);
  street(edge.x - 20, -edge.z + 20, edge.x - 20, edge.z - 20, 22, "RING ROAD", true);

  // Column streets: one between every pair of blocks, both bands.
  EAST_X.forEach((x, index) => {
    const lineX = x - CITY_GRID.street / 2;
    street(lineX, -edge.z, lineX, edge.z, 16, index % 3 === 0 ? "HARBOR AVE" : "EAST SIDE", index === 5);
    street(-lineX, -edge.z, -lineX, edge.z, 16, index % 3 === 0 ? "OLD TOWN AVE" : "WEST SIDE", index === 5);
  });
  INNER_X.forEach((x, index) => {
    const lineX = x - 6;
    street(lineX, CITY_GRID.core.z, lineX, edge.z, 12, "HEIGHTS AVE", index % 2 === 0);
    street(lineX, -edge.z, lineX, -CITY_GRID.core.z, 12, "FOUNDRY LN", index % 2 === 0);
  });

  // Row streets: the cross streets of the whole grid.
  ROWS_Z.forEach((z, index) => {
    const lineZ = z - CITY_GRID.street / 2;
    street(-edge.x, lineZ, edge.x, lineZ, 16, index % 4 === 0 ? "TERMINAL WAY" : "CROSSTOWN", index % 4 === 0);
  });

  // Parkway: the green cut between downtown and the north district.
  street(-edge.x, 134, edge.x, 134, 14, "PARKWAY", true);
  street(-edge.x, -134, edge.x, -134, 14, "PARKWAY", true);
  return roads;
}

/**
 * Plan every block outside the hand-built core.
 * Returns `{ blocks, roads, districts, services, parkwayTrees }`; blocks carry
 * world-space bounds, a district name and a `kind` the city builder turns into
 * geometry.
 */
export function planCity() {
  const rng = makeRng();
  const blocks = [];

  // East and west bands (harbour side, old town side).
  EAST_X.forEach((x0) => {
    ROWS_Z.forEach((z0) => {
      pushBlock(blocks, x0, z0, CITY_GRID.block.w, "east", rng);
      pushBlock(blocks, -x0 - CITY_GRID.block.w, z0, CITY_GRID.block.w, "west", rng);
    });
  });

  // Heights north of the core and the industrial south, on the finer grid.
  INNER_X.forEach((x0) => {
    ROWS_Z.forEach((z0) => {
      const zone = z0 > 0 ? "north" : "south";
      const block = pushBlock(blocks, x0, z0, 32, zone, rng);
      if (block && overlapsCore(block)) blocks.pop();
    });
  });

  // Superblock landmarks first: they need their cells before services snap.
  carveStadium(blocks);

  // A wide green belt either side of the parkway, outside the block grid.
  const belt = [];
  for (let x = -CITY_GRID.edge.x + 24; x <= CITY_GRID.edge.x - 24; x += 30) {
    belt.push({ x, z: 149 }, { x, z: -149 });
  }

  const roads = buildRoads();
  const services = assignServices(blocks, rng);

  return {
    blocks,
    roads,
    districts: DISTRICTS,
    services,
    parkwayTrees: belt,
  };
}


