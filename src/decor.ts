import { CHUNK } from "./config.ts";
import { point, type Tile } from "./entities.ts";
import type { Board, RoomWorld, World } from "./generation.ts";
import { tileRandom } from "./themes.ts";

/** Procedural dungeon dressing — moss, vines, glowing flowers, plants,
 * crates, pools — planned purely from the board and seed. Presentation only:
 * nothing here consumes the generation RNG or changes a tile, and every
 * decision is a pure function of (board, x, y), so a room always looks the
 * same when revisited. Drawing and the live effects are in decor-render.ts.
 *
 * Coordinates: a tile is 24 decor pixels square. Local pixel (i, j) runs
 * right/down inside tile (x, y). World pixels are gx = x*24 + i and
 * gy = -y*24 + j, so gy grows down the screen like j does. */
export const TILE_PX = 24;
const AREA = TILE_PX * TILE_PX;

/** Tuning for how much of each feature appears. */
export const DECOR_CONFIG = {
  /** Moss field thresholds: speckle, moss, dense mat. */
  mossLevels: [0.2, 0.42, 0.7],
  /** Width of the ordered-dither band that fades moss into the stone. */
  mossDither: 0.24,
  /** Tiles this overgrown become walk-through thickets of tall grass. */
  thicketAverage: 0.86,
  thicketMinimum: 0.5,
  /** Chance a wall/floor edge sprouts a vine, scaled by overgrowth. */
  vineChance: 0.5,
  /** Chance a vine's tip carries a glowing flower, scaled by lushness. */
  flowerChance: 0.45,
  /** Crates per candidate tile: tucked in a corner or against one wall. */
  crateCorner: 0.2,
  crateWall: 0.05,
  cobweb: 0.22,
};

export type Kind = Tile["kind"];
/** What the planner needs from a board. `kind` is the tile as generated, so
 * a key picked up later never makes a crate appear where it lay. */
export interface DecorSource {
  key: string;
  seed: number;
  kind(x: number, y: number): Kind;
  torch(x: number, y: number): boolean;
  /** 0..1: how overgrown this part of the dungeon is. */
  lush(x: number, y: number): number;
  /** 0..1: how much standing water collects here. */
  damp(x: number, y: number): number;
  /** 0..1: how much storage clutter (crates, barrels) is left here. */
  clutter(x: number, y: number): number;
}

export type Crate = {
  /** Footprint in tile pixels: top-left and size of the whole box. */
  x: number; y: number; w: number; h: number;
  /** Drawn this many pixels higher: stacked on the crate below it. */
  lift: number;
  kind: "crate" | "barrel";
  tone: number;
};
export type PlantKind = "tuft" | "fern" | "mushrooms" | "sprout" | "pebbles" | "web";
export type Plant = { kind: PlantKind; i: number; j: number; variant: number; glow?: boolean; corner?: number };
export type Blade = { i: number; j: number; h: number; color: number; phase: number; lean: number };
export type Flower = { i: number; j: number; color: number };
/** A pixel of a vine: tile-local position and palette index (see VINE_COLORS). */
export type VinePixel = { i: number; j: number; c: number };
export type Drip = { i: number; j: number; period: number; phase: number };

export type TileDecor = {
  /** Per-pixel moss: level 0..3 in the low bits, tone in bit 2. */
  moss: Uint8Array | null;
  /** Per-pixel water mask (1 = water, 2 = wet shoreline). */
  water: Uint8Array | null;
  waterCount: number;
  thicket: boolean;
  blades: Blade[];
  crates: Crate[];
  plants: Plant[];
  vines: VinePixel[];
  flowers: Flower[];
  drip: Drip | null;
  /** Water pixels that catch a moving glint. */
  glints: [number, number][];
  /** Anything to draw at all. */
  empty: boolean;
};

/** Glowing flower hues: cyan, violet, rose, and pale gold. */
export const FLOWER_COLORS: readonly (readonly [number, number, number])[] = [
  [120, 240, 225], [196, 150, 255], [255, 140, 196], [250, 226, 140],
];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Smooth 2D value noise in 0..1. */
export function valueNoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const s = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);
  const u = s(x - ix), v = s(y - iy);
  const a = tileRandom(ix, iy, seed), b = tileRandom(ix + 1, iy, seed);
  const c = tileRandom(ix, iy + 1, seed), d = tileRandom(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Three octaves of value noise, roughly 0..1 with mean 0.5. */
export function fbm(x: number, y: number, seed: number) {
  return valueNoise(x, y, seed) * 0.6 + valueNoise(x * 2.1, y * 2.1, seed ^ 0x51f) * 0.28 + valueNoise(x * 4.3, y * 4.3, seed ^ 0xa3d) * 0.12;
}

/** Decor source for a dungeon board, or null outside (the forest has its
 * own grass, see outside-grass.ts). */
export function decorSourceFor(world: Board, seed: number): DecorSource | null {
  // Matched by shape rather than instanceof, which breaks across module
  // reloads during development.
  const terrain = "cells" in world && "room" in world ? towerTerrain(world as RoomWorld, seed)
    : "chunks" in world ? delveTerrain(world as World, seed)
    : null;
  return terrain && { ...terrain, seed, torch: torchLookup(world) };
}

type Terrain = Pick<DecorSource, "key" | "kind" | "lush" | "damp" | "clutter">;

function towerTerrain(world: RoomWorld, seed: number): Terrain {
  const { room, cells, width, height } = world;
  // Each Tower room has its own character: some overgrown, some dry and
  // stacked with stores, some flooded.
  const r = (salt: number) => tileRandom(room, salt, seed ^ 0x3ec0);
  const l = 0.08 + 0.84 * Math.pow(r(1), 1.15), d = r(2) < 0.4 ? 0.3 + r(3) * 0.7 : 0, c = 0.25 + r(4) * 0.75;
  const outside = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height;
  return {
    key: `t:${seed}:${room}`,
    kind: (x, y) => (outside(x, y) ? "wall" : cells.get(point(x, y))?.kind ?? "wall"),
    lush: () => l, damp: () => d, clutter: () => c,
  };
}

function delveTerrain(delve: World, seed: number): Terrain {
  return {
    key: `d:${seed}`,
    kind: (x, y) => {
      const beyond = x < 0 || x >= delve.width || y < delve.floor;
      if (beyond) return "wall";
      delve.tile(x, y); // makes sure the chunk exists
      return delve.chunks.get(Math.floor(y / CHUNK))?.get(point(x, y))?.kind ?? "wall";
    },
    // The Delve drifts through lusher and drier stretches as it deepens.
    lush: (x, y) => clamp01(valueNoise(x / 11, y / 17, seed ^ 0x1a5) * 1.5 - 0.2),
    damp: (x, y) => clamp01(valueNoise(x / 9, y / 13, seed ^ 0x2d7) * 1.8 - 0.75),
    clutter: (x, y) => clamp01(valueNoise(x / 8, y / 10, seed ^ 0x3f1) * 1.4 - 0.1),
  };
}

/** Whether a torch stands on a tile. The Delve's torch list grows as new
 * areas open, so the lookup is rebuilt when it changes. */
function torchLookup(world: Board): DecorSource["torch"] {
  let torches = new Set<string>(), seen: unknown = null, count = -1;
  return (x, y) => {
    const list = world.torches ?? [];
    if (list !== seen && list.length !== count) {
      torches = new Set(list.map((t) => point(t.x, t.y)));
      count = list.length;
    }
    seen = list;
    return torches.has(point(x, y));
  };
}

const isWall = (k: Kind) => k === "wall";
/** Doors, stairs and one-way gates: always drawn clean. */
const isFixture = (k: Kind) => k === "door" || k === "stairs" || k === "stairsDown" || k === "oneway";
/** Tiles decor may cover: open ground, including under items and enemies. */
const isGround = (k: Kind) => !isWall(k) && !isFixture(k);

/** A tile's 8 neighbours as [dx, dy, weight]: diagonals count half. */
const NEIGHBORS = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].filter((dx) => dx || dy).map((dx): [number, number, number] => [dx, dy, dx && dy ? 0.5 : 1]),
);
/** The wall tiles among a tile's 8 neighbours, as [dx, dy, weight]. */
function wallNeighbors(src: DecorSource, x: number, y: number) {
  return NEIGHBORS.filter(([dx, dy]) => isWall(src.kind(x + dx, y + dy)));
}
/** Distance-to-wall bonus (0..1.4) at a tile-local pixel: moss creeps out
 * of the joints between wall and floor, and most of all from corners. */
function wallProximity(walls: [number, number, number][], i: number, j: number) {
  let best = 0;
  const px = i + 0.5, py = j + 0.5;
  for (const [dx, dy, w] of walls) {
    // Distance from the pixel center to that neighbouring tile's square
    // (+y is north, which is up the screen).
    const ex = dx < 0 ? px : dx > 0 ? TILE_PX - px : 0;
    const ey = dy > 0 ? py : dy < 0 ? TILE_PX - py : 0;
    best += clamp01(1 - Math.hypot(ex, ey) / 13) * w;
  }
  return Math.min(1.4, best);
}

/** The overgrowth field at a world point (tile units, fy down the screen),
 * before wall proximity. */
function overgrowthBase(src: DecorSource, fx: number, fy: number, lush: number) {
  const n = fbm(fx / 3.1, fy / 3.1, src.seed ^ 0x6d05);
  return (n - (0.8 - lush * 0.36)) * 3;
}

/** Overgrowth (0 bare .. 1+ dense) at a tile-local pixel of a ground tile. */
export function overgrowth(src: DecorSource, x: number, y: number, i: number, j: number, walls = wallNeighbors(src, x, y)) {
  const lush = src.lush(x, y);
  if (lush <= 0.02) return 0;
  const fx = x + (i + 0.5) / TILE_PX, fy = -y + (j + 0.5) / TILE_PX;
  return overgrowthBase(src, fx, fy, lush) + wallProximity(walls, i, j) * (0.25 + lush * 0.45);
}
/** Overgrowth for every pixel of a tile. */
function overgrowthGrid(src: DecorSource, x: number, y: number) {
  const walls = wallNeighbors(src, x, y), grid = new Float32Array(AREA);
  for (let j = 0; j < TILE_PX; j++)
    for (let i = 0; i < TILE_PX; i++) grid[j * TILE_PX + i] = overgrowth(src, x, y, i, j, walls);
  return grid;
}

function waterField(src: DecorSource, fx: number, fy: number) {
  return valueNoise(fx / 2.4, fy / 2.4, src.seed ^ 0x77a1) * 0.72 + valueNoise(fx / 1.1, fy / 1.1, src.seed ^ 0x1b3) * 0.28;
}

/** A small deterministic generator per (source, tile, salt). */
function rngFor(src: DecorSource, x: number, y: number, salt: number) {
  let n = (Math.floor(tileRandom(x * 31 + salt, y * 17 - salt, src.seed ^ 0x5eed) * 4294967296)) >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  { dx: 0, dy: 1, name: "n" }, { dx: 1, dy: 0, name: "e" }, { dx: 0, dy: -1, name: "s" }, { dx: -1, dy: 0, name: "w" },
] as const;

/** A vine rooted on the edge between floor tile (x, y) and its wall
 * neighbour in direction `d`: one arm climbs into the wall, another may
 * creep along the floor. Returned as world pixels. */
function vineFrom(src: DecorSource, x: number, y: number, d: number): { gx: number; gy: number; c: number }[] | null {
  const rng = rngFor(src, x, y, 101 + d);
  const dir = DIRS[d];
  // Outward normal (toward the wall) in screen pixels, and the edge tangent.
  const nx = dir.dx, ny = -dir.dy, tx = ny === 0 ? 0 : 1, ty = ny === 0 ? 1 : 0;
  const along = 4 + Math.floor(rng() * 16);
  // Root: on the floor side of the shared edge.
  const ox = x * TILE_PX, oy = -y * TILE_PX;
  let rx = nx > 0 ? ox + TILE_PX - 1 : nx < 0 ? ox : ox + along;
  let ry = ny > 0 ? oy + TILE_PX - 1 : ny < 0 ? oy : oy + along;
  const out: { gx: number; gy: number; c: number }[] = [];
  const seen = new Set<number>();
  const put = (gx: number, gy: number, c: number) => {
    const k = gx * 65536 + gy;
    if (seen.has(k) && c < 4) return;
    seen.add(k);
    out.push({ gx, gy, c });
  };
  const lush = src.lush(x, y);
  // Climbing arm: into the wall, wandering sideways, with leaves.
  const climb = 10 + Math.floor(rng() * (12 + lush * 14));
  let cx = rx, cy = ry, side = rng() < 0.5 ? -1 : 1, depth = 0;
  for (let k = 0; k < climb; k++) {
    const r = rng();
    // Never deeper than most of a tile: walls are often one tile thick.
    if (r < 0.62 && depth < 17) { cx += nx; cy += ny; depth++; } else if (r < 0.86) { cx += tx * side; cy += ty * side; } else side = -side;
    put(cx, cy, k < 3 ? 0 : 1);
    if (k % 2 === 1 && rng() < 0.85) {
      const ls = rng() < 0.5 ? -1 : 1;
      put(cx + tx * ls, cy + ty * ls, 2);
      if (rng() < 0.5) put(cx + tx * ls + nx, cy + ty * ls + ny, 3);
    }
  }
  // A short side shoot partway up for fuller growth.
  if (climb > 12 && rng() < 0.6) {
    let sx = cx - nx * Math.floor(climb / 2), sy = cy - ny * Math.floor(climb / 2);
    const sd = rng() < 0.5 ? -1 : 1;
    for (let k = 0; k < 5; k++) {
      sx += tx * sd; sy += ty * sd;
      if (rng() < 0.4) { sx += nx; sy += ny; }
      put(sx, sy, 1);
      if (k === 4) put(sx + nx, sy + ny, 2);
    }
  }
  if (rng() < DECOR_CONFIG.flowerChance * (0.35 + lush)) put(cx, cy, 4);
  // Creeping arm: along the floor at the wall's foot.
  if (rng() < 0.55 + lush * 0.3) {
    let fx = rx, fy = ry;
    const dirA = rng() < 0.5 ? -1 : 1, len = 6 + Math.floor(rng() * (8 + lush * 10));
    depth = 0;
    for (let k = 0; k < len; k++) {
      fx += tx * dirA; fy += ty * dirA;
      const r = rng();
      if (r < 0.2 && depth < 4) { fx -= nx; fy -= ny; depth++; } else if (r < 0.34 && depth > 0) { fx += nx; fy += ny; depth--; }
      put(fx, fy, 1);
      if (k % 4 === 3) put(fx - nx, fy - ny, 2);
    }
    if (rng() < DECOR_CONFIG.flowerChance * lush * 0.6) put(fx, fy, 4);
  }
  return out;
}

const vineCache = new Map<string, { gx: number; gy: number; c: number }[] | null>();
/** Vines rooted at floor tile (x, y), by edge. Cached per source. */
function vinesAt(src: DecorSource, x: number, y: number) {
  const all: { gx: number; gy: number; c: number }[] = [];
  if (src.kind(x, y) !== "floor") return all;
  for (let d = 0; d < 4; d++) {
    const v = vineAt(src, x, y, d);
    if (v) all.push(...v);
  }
  return all;
}

/** The vine rooted on floor tile (x, y)'s edge in direction `d`, if that
 * edge meets a wall and a vine grows there. Cached per source. */
function vineAt(src: DecorSource, x: number, y: number, d: number) {
  if (!isWall(src.kind(x + DIRS[d].dx, y + DIRS[d].dy))) return null;
  const key = `${src.key}:${x},${y}:${d}`;
  let v = vineCache.get(key);
  if (v === undefined) {
    v = rollVine(src, x, y, d);
    if (vineCache.size > 20000) vineCache.clear();
    vineCache.set(key, v);
  }
  return v;
}

/** Tile-local pixel at the middle of the edge facing `delta` (-1, 0 or 1). */
const edgeMiddle = (delta: number) => (delta > 0 ? 22 : delta < 0 ? 1 : 12);

/** Vines grow where it's overgrown, sampled at the middle of the edge. */
function rollVine(src: DecorSource, x: number, y: number, d: number) {
  const g = overgrowth(src, x, y, edgeMiddle(DIRS[d].dx), edgeMiddle(-DIRS[d].dy));
  const chance = DECOR_CONFIG.vineChance * clamp01(g * 0.9 + src.lush(x, y) * 0.2 - 0.12);
  return tileRandom(x * 7 + d, y * 13 - d, src.seed ^ 0x71e5) < chance ? vineFrom(src, x, y, d) : null;
}

/** Which of a tile's four sides are walls. */
type Sides = { n: boolean; e: boolean; s: boolean; w: boolean };
function wallSides(src: DecorSource, x: number, y: number): Sides {
  const [n, e, s, w] = DIRS.map((d) => isWall(src.kind(x + d.dx, y + d.dy)));
  return { n, e, s, w };
}

/** Crates need one wall or a corner to lean on, and must keep doorways and
 * stairs clear. */
function crateSpot(src: DecorSource, x: number, y: number, sides: Sides) {
  const walls = Number(sides.n) + Number(sides.e) + Number(sides.s) + Number(sides.w);
  const leans = walls === 1 || (walls === 2 && isCorner(sides));
  if (!leans) return false;
  return !DIRS.some((d) => isFixture(src.kind(x + d.dx, y + d.dy)));
}

/** A crate's left edge: against the west or east wall, else loosely placed. */
function crateX(sides: Sides, sz: number, slot: number, rng: () => number) {
  const row = slot * (sz + 1);
  if (sides.w) return 1 + (sides.n || sides.s ? row : 0);
  if (sides.e) return TILE_PX - 1 - sz - (sides.n || sides.s ? row : 0);
  return 2 + row + Math.floor(rng() * 3);
}

/** A crate's top edge: against the north or south wall, else loosely placed. */
function crateY(sides: Sides, sz: number, slot: number, rng: () => number) {
  if (sides.n) return 2;
  if (sides.s) return TILE_PX - 1 - sz;
  return Math.min(3 + slot * (sz + 1) + Math.floor(rng() * 2), TILE_PX - 1 - sz);
}

const isCorner = (sides: Sides) => (sides.n || sides.s) && (sides.e || sides.w);

/** Whether crates are left here at all: likelier in corners and cluttered stretches. */
function cratesRolled(src: DecorSource, x: number, y: number, corner: boolean) {
  const chance = (corner ? DECOR_CONFIG.crateCorner : DECOR_CONFIG.crateWall) * src.clutter(x, y);
  return tileRandom(x * 3 + 5, y * 5 - 3, src.seed ^ 0xc4a7) < chance;
}

/** Crates stacked against the walls of tile (x, y), or none. */
function cratesFor(src: DecorSource, x: number, y: number, rng: () => number): Crate[] {
  const sides = wallSides(src, x, y);
  if (!crateSpot(src, x, y, sides)) return [];
  const corner = isCorner(sides);
  if (!cratesRolled(src, x, y, corner)) return [];
  // Two or three in a corner, one or two against a wall.
  const count = corner ? 2 + Number(rng() < 0.5) : 1 + Number(rng() < 0.4);
  const out: Crate[] = [];
  for (let slot = 0; slot < Math.min(2, count); slot++) out.push(floorCrate(sides, slot, rng));
  // A third box sits on top of the first.
  if (count > 2 && out[0].kind === "crate") out.push(stackedCrate(out[0], rng));
  return out.map(fitInTile);
}

/** A crate or barrel standing in `slot` along the wall(s). */
function floorCrate(sides: Sides, slot: number, rng: () => number): Crate {
  const sz = 9 + Math.floor(rng() * 3);
  const barrel = rng() < 0.22;
  const x = crateX(sides, sz, slot, rng), y = crateY(sides, sz, slot, rng);
  return { x, y, w: barrel ? sz - 2 : sz, h: sz, lift: 0, kind: barrel ? "barrel" : "crate", tone: Math.floor(rng() * 3) };
}

function stackedCrate(below: Crate, rng: () => number): Crate {
  const sz = below.w - 1;
  return { x: below.x + Math.floor(rng() * 2), y: below.y, w: sz, h: sz, lift: 5, kind: "crate", tone: Math.floor(rng() * 3) };
}

function fitInTile(c: Crate): Crate {
  c.x = Math.max(0, Math.min(TILE_PX - c.w, c.x));
  c.y = Math.max(0, Math.min(TILE_PX - c.h, c.y));
  return c;
}

/** A number naming tile (x, y), for allocation-free map keys (x must lie
 * in -64..191, which every board does, walls included). */
export const tileKey = (x: number, y: number) => (y + 4) * 256 + x + 64;
/** Plans per source, by tile key. */
const decorCache = new Map<string, Map<number, TileDecor>>();
let cachedPlans = 0;
/** The full static plan for one tile. Cached; pure in (source, x, y). */
export function tileDecor(src: DecorSource, x: number, y: number): TileDecor {
  let plans = decorCache.get(src.key);
  if (!plans) decorCache.set(src.key, (plans = new Map()));
  const key = tileKey(x, y);
  let d = plans.get(key);
  if (!d) {
    d = planTile(src, x, y);
    if (++cachedPlans > 12000) {
      decorCache.clear();
      cachedPlans = 1;
      decorCache.set(src.key, (plans = new Map()));
    }
    plans.set(key, d);
  }
  return d;
}
/** Drops cached plans (for tests and when a seed is abandoned). */
export function clearDecorCache() {
  decorCache.clear();
  cachedPlans = 0;
  vineCache.clear();
}

/** A tile being planned. */
type At = { src: DecorSource; x: number; y: number };

const emptyPlan = (): TileDecor => ({
  moss: null, water: null, waterCount: 0, thicket: false, blades: [], crates: [], plants: [],
  vines: [], flowers: [], drip: null, glints: [], empty: true,
});

/** Plans one tile layer by layer. Later layers read earlier ones (water
 * clears moss and thickets, plants avoid crates and water), so the order
 * below is fixed. */
function planTile(src: DecorSource, x: number, y: number): TileDecor {
  const at: At = { src, x, y }, kind = src.kind(x, y), lush = src.lush(x, y);
  const d = emptyPlan();
  const grid = lush > 0.02 ? planMoss(at, kind, d) : null;
  if (isGround(kind)) planWater(at, grid, d);
  if (lush > 0.05 && !isFixture(kind)) planVines(at, d);
  if (kind === "floor" && !src.torch(x, y)) planStanding(at, d);
  d.empty = nothingToDraw(d);
  return d;
}

function nothingToDraw(d: TileDecor) {
  const lists = d.crates.length + d.plants.length + d.vines.length + d.flowers.length;
  return !d.moss && !d.water && !d.thicket && !lists;
}

/** Moss level 0..3 for a field value, ordered-dithered into the stone. */
function mossLevel(m: number, i: number, j: number) {
  const [l1, l2, l3] = DECOR_CONFIG.mossLevels;
  const v = m + (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.5) * DECOR_CONFIG.mossDither;
  return v > l3 ? 3 : v > l2 ? 2 : v > l1 ? 1 : 0;
}
/** Moss tone bit (4 = the lighter tone) at a tile-local pixel. */
function mossTone({ src, x, y }: At, i: number, j: number) {
  return valueNoise((x + i / TILE_PX) / 5, (-y + j / TILE_PX) / 5, src.seed ^ 0x70e) > 0.55 ? 4 : 0;
}

/** Moss on ground or wall. Returns the ground's overgrowth grid, which the
 * water planner uses to keep pools out of dense growth. */
function planMoss(at: At, kind: Kind, d: TileDecor): Float32Array | null {
  if (isGround(kind)) return planGroundMoss(at, kind, d);
  if (isWall(kind)) d.moss = wallMoss(at);
  return null;
}

/** Moss is a continuous field, so it fades across tile seams. Floor this
 * overgrown all over becomes a thicket of tall grass. */
function planGroundMoss(at: At, kind: Kind, d: TileDecor) {
  const { src, x, y } = at;
  const grid = overgrowthGrid(src, x, y), moss = new Uint8Array(AREA);
  let sum = 0, min = Infinity;
  for (let k = 0; k < AREA; k++) {
    const m = grid[k], i = k % TILE_PX, j = (k - i) / TILE_PX;
    sum += m; min = Math.min(min, m);
    const lv = mossLevel(m, i, j);
    if (lv) moss[k] = lv | mossTone(at, i, j);
  }
  if (moss.some(Boolean)) d.moss = moss;
  const overgrown = sum / AREA > DECOR_CONFIG.thicketAverage && min > DECOR_CONFIG.thicketMinimum;
  d.thicket = kind === "floor" && !src.torch(x, y) && overgrown;
  return grid;
}

/** Moss creeps a few pixels up the wall from mossy floor beside it. */
function wallMoss(at: At) {
  const moss = new Uint8Array(AREA);
  for (const dir of DIRS) mossFace(at, dir, moss);
  return moss.some(Boolean) ? moss : null;
}

/** Pixel coordinate `depth` pixels into a tile from the face toward `delta`
 * (-1, 0 or 1); along a face (delta 0) it is the position `t`. */
const fromFace = (delta: number, t: number, depth: number) => (delta > 0 ? depth : delta < 0 ? TILE_PX - 1 - depth : t);
/** The same, wrapped into the tile: depth -1 is the neighbour's facing pixel. */
const wrapPx = (v: number) => (v + TILE_PX) % TILE_PX;

/** Moss on the face of wall tile (x, y) that looks onto the floor in the
 * direction opposite `dir`. */
function mossFace(at: At, dir: (typeof DIRS)[number], moss: Uint8Array) {
  const { src, x, y } = at, fx = x - dir.dx, fy = y - dir.dy;
  if (!isGround(src.kind(fx, fy))) return;
  const floorWalls = wallNeighbors(src, fx, fy);
  for (let t = 0; t < TILE_PX; t++) {
    // The floor pixel just across the face.
    const edge = overgrowth(src, fx, fy, wrapPx(fromFace(dir.dx, t, -1)), wrapPx(fromFace(-dir.dy, t, -1)), floorWalls);
    if (edge < 0.3) continue;
    for (let depth = 0; depth < 5; depth++) {
      const i = fromFace(dir.dx, t, depth), j = fromFace(-dir.dy, t, depth), idx = j * TILE_PX + i;
      const lv = mossLevel(edge - 0.3 - depth * 0.16, i, j);
      if (lv > (moss[idx] & 3)) moss[idx] = lv | mossTone(at, i, j);
    }
  }
}

const POOL_SIDE = TILE_PX + 2;

/** Where pools gather on one tile: hollows of a second noise field, sampled
 * on a 26x26 grid (one pixel of border) so the rim can look across tile
 * seams. Pixels over non-ground neighbours stay dry. */
class PoolField {
  private cells = new Uint8Array(POOL_SIDE * POOL_SIDE);
  private walls: [number, number, number][];
  /** World pixels of each torch on or beside the tile. */
  private torches: [number, number][] = [];
  private threshold: number;

  constructor(private at: At, dampness: number, private grid: Float32Array | null) {
    const { src, x, y } = at;
    this.walls = wallNeighbors(src, x, y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (src.torch(x + dx, y + dy)) this.torches.push([(x + dx) * TILE_PX + 12, -(y + dy) * TILE_PX + 12]);
    this.threshold = 1 - dampness * 0.28;
    for (let j = -1; j <= TILE_PX; j++)
      for (let i = -1; i <= TILE_PX; i++) if (this.collects(i, j)) this.cells[(j + 1) * POOL_SIDE + i + 1] = 1;
  }

  /** The tile's water mask (1 = water, 2 = wet rim) and its water pixel
   * count, or null when the tile stays dry. */
  mask(): { water: Uint8Array; count: number } | null {
    const water = new Uint8Array(AREA);
    let count = 0;
    for (let k = 0; k < AREA; k++)
      if (this.wet(k % TILE_PX, Math.floor(k / TILE_PX))) { water[k] = 1; count++; }
    if (!count) return null;
    for (let k = 0; k < AREA; k++)
      if (!water[k] && this.shore(k % TILE_PX, Math.floor(k / TILE_PX))) water[k] = 2;
    return { water, count };
  }

  private wet(i: number, j: number) {
    return this.cells[(j + 1) * POOL_SIDE + i + 1] === 1;
  }

  /** Dry pixel beside water: darkened wet stone around the rim. */
  private shore(i: number, j: number) {
    return this.wet(i - 1, j) || this.wet(i + 1, j) || this.wet(i, j - 1) || this.wet(i, j + 1);
  }

  private collects(i: number, j: number) {
    const { src, x, y } = this.at;
    if (this.overBlockedNeighbour(i, j)) return false;
    // Pools stop a little short of the walls.
    if (wallProximity(this.walls, clampPx(i), clampPx(j)) > 0.8) return false;
    if (waterField(src, x + (i + 0.5) / TILE_PX, -y + (j + 0.5) / TILE_PX) <= this.threshold) return false;
    return !this.nearTorch(x * TILE_PX + i, -y * TILE_PX + j) && !this.dense(i, j);
  }

  /** A border pixel over a neighbouring tile that isn't ground. */
  private overBlockedNeighbour(i: number, j: number) {
    const { src, x, y } = this.at;
    return !inTile(i, j) && !isGround(src.kind(x + Math.floor(i / TILE_PX), y - Math.floor(j / TILE_PX)));
  }

  /** Torches stand in a dry circle. */
  private nearTorch(gx: number, gy: number) {
    return this.torches.some(([tx, ty]) => Math.hypot(gx - tx, gy - ty) < 17);
  }

  /** Dense overgrowth keeps water out. */
  private dense(i: number, j: number) {
    return inTile(i, j) && !!this.grid && this.grid[j * TILE_PX + i] >= 0.75;
  }
}

const inTile = (i: number, j: number) => i >= 0 && j >= 0 && i < TILE_PX && j < TILE_PX;
const clampPx = (v: number) => Math.max(0, Math.min(TILE_PX - 1, v));

/** Standing water and its wet rim. A pool floods out moss and tall grass,
 * catches glints, and may be fed by a drip. */
function planWater(at: At, grid: Float32Array | null, d: TileDecor) {
  const dampness = at.src.damp(at.x, at.y);
  if (dampness <= 0) return;
  const pool = new PoolField(at, dampness, grid).mask();
  if (!pool) return;
  const { water } = pool;
  flood(d, pool);
  const rng = rngFor(at.src, at.x, at.y, 7);
  d.glints = glints(water, rng);
  // Some pools are fed by a slow drip from the ceiling.
  if (d.waterCount > 60 && rng() < 0.4) d.drip = drip(water, rng);
}

/** Puts a pool on the plan, drowning the moss and tall grass under it. */
function flood(d: TileDecor, { water, count }: { water: Uint8Array; count: number }) {
  d.water = water;
  d.waterCount = count;
  // Tall grass gives way to a pool that floods much of the tile.
  if (count > 40) d.thicket = false;
  if (d.moss) for (let k = 0; k < AREA; k++) if (water[k] === 1) d.moss[k] = 0;
}

/** Water pixels that catch a moving glint: up to five, two pixels wide. */
function glints(water: Uint8Array, rng: () => number) {
  const out: [number, number][] = [];
  for (let k = 0; k < 40 && out.length < 5; k++) {
    const i = Math.floor(rng() * TILE_PX), j = Math.floor(rng() * TILE_PX);
    if (water[j * TILE_PX + i] === 1 && water[j * TILE_PX + Math.min(23, i + 1)] === 1) out.push([i, j]);
  }
  return out;
}

function drip(water: Uint8Array, rng: () => number): Drip | null {
  for (let k = 0; k < 30; k++) {
    const i = 4 + Math.floor(rng() * 16), j = 6 + Math.floor(rng() * 14);
    if (water[j * TILE_PX + i] === 1) return { i, j, period: 5 + rng() * 7, phase: rng() * 12 };
  }
  return null;
}

/** Vines from this tile and nearby roots (they cross tile seams). */
function planVines(at: At, d: TileDecor) {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) addVinesFrom(at, dx, dy, d);
  if (d.water) d.vines = d.vines.filter((v) => d.water![v.j * TILE_PX + v.i] !== 1);
}

/** The pixels of vines rooted at tile (x+dx, y+dy) that fall on this tile. */
function addVinesFrom({ src, x, y }: At, dx: number, dy: number, d: TileDecor) {
  const ox = x * TILE_PX, oy = -y * TILE_PX;
  for (const p of vinesAt(src, x + dx, y + dy)) {
    const i = p.gx - ox, j = p.gy - oy;
    if (!inTile(i, j)) continue;
    if (p.c === 4) d.flowers.push({ i, j, color: Math.floor(valueNoise((x + dx) / 4, (y + dy) / 4, src.seed ^ 0xf10) * FLOWER_COLORS.length * 0.999) });
    else d.vines.push({ i, j, c: p.c });
  }
}

/** Standing things on plain floor: crates, then tall grass or small plants
 * and cobwebs. They share one generator, in that order. */
function planStanding(at: At, d: TileDecor) {
  const rng = rngFor(at.src, at.x, at.y, 3);
  if (!d.thicket && !d.waterCount) d.crates = cratesFor(at.src, at.x, at.y, rng);
  if (d.thicket) {
    d.blades = thicketBlades(rng);
    return;
  }
  d.plants = floorPlants(at, d, rng);
  const web = cobweb(at, rng);
  if (web) d.plants.push(web);
}

/** Dense clumps: a main blade with a shorter one or two beside it. */
function thicketBlades(rng: () => number) {
  const blades: Blade[] = [];
  const clumps = 12 + Math.floor(rng() * 5);
  for (let k = 0; k < clumps; k++) {
    const i = 1 + Math.floor(rng() * 21), j = 5 + Math.floor(rng() * 19), h = 6 + Math.floor(rng() * 5);
    const color = Math.floor(rng() * 4), phase = rng() * Math.PI * 2, lean = (rng() - 0.5) * 1.6;
    blades.push({ i, j, h, color, phase, lean });
    if (rng() < 0.75) blades.push({ i: i + 1, j, h: h - 2 - Math.floor(rng() * 2), color: Math.max(0, color - 1), phase: phase + 0.4, lean: lean + 0.8 });
    if (rng() < 0.4) blades.push({ i: i - 1, j, h: h - 3, color, phase: phase - 0.3, lean: lean - 0.9 });
  }
  return blades.sort((a, b) => a.j - b.j);
}

/** Whether pixel (i, j) is taken by a crate (with a pixel of margin) or water. */
function occupied(d: TileDecor, i: number, j: number) {
  if (d.water && d.water[j * TILE_PX + i] === 1) return true;
  return d.crates.some((c) => i >= c.x - 1 && i <= c.x + c.w && j >= c.y - c.lift - 1 && j <= c.y + c.h);
}

/** A spot tried for a plant, and what grows beneath it. */
type PlantSpot = { i: number; j: number; moss: number; nearWall: boolean };

/** One or two tries at a small plant; mossier tiles get two. */
function floorPlants(at: At, d: TileDecor, rng: () => number) {
  const plants: Plant[] = [];
  const mossAt = (i: number, j: number) => (d.moss ? d.moss[j * TILE_PX + i] & 3 : 0);
  const nearWall = DIRS.some((q) => isWall(at.src.kind(at.x + q.dx, at.y + q.dy)));
  const tries = mossAt(12, 12) >= 2 ? 2 : 1;
  for (let k = 0; k < tries; k++) {
    const i = 3 + Math.floor(rng() * 18), j = 5 + Math.floor(rng() * 16);
    if (occupied(d, i, j)) continue;
    const plant = plantAt(at, { i, j, moss: mossAt(i, j), nearWall }, rng);
    if (plant) plants.push(plant);
  }
  return plants;
}

/** Plants that need moss, tried in order: each grows when the spot's moss
 * level is at least `moss` and the plant roll is below `below`. */
const MOSS_PLANTS: readonly { kind: PlantKind; moss: number; below: number; variants: number }[] = [
  { kind: "tuft", moss: 2, below: 0.25, variants: 3 },
  { kind: "fern", moss: 2, below: 0.33, variants: 2 },
  { kind: "sprout", moss: 1, below: 0.4, variants: 3 },
];

/** What grows at a spot: tufts and ferns on dense moss, sprouts on any
 * moss, mushrooms by damp or mossy walls, and the odd pebble. */
function plantAt(at: At, spot: PlantSpot, rng: () => number): Plant | null {
  const { i, j, moss } = spot, r = rng();
  const mossy = MOSS_PLANTS.find((p) => moss >= p.moss && r < p.below);
  if (mossy) return { kind: mossy.kind, i, j, variant: Math.floor(rng() * mossy.variants) };
  if (mushroomsGrow(at, spot, r))
    return { kind: "mushrooms", i, j, variant: Math.floor(rng() * 3), glow: rng() < 0.3 + at.src.lush(at.x, at.y) * 0.2 };
  if (r > 0.95) return { kind: "pebbles", i, j, variant: Math.floor(rng() * 3) };
  return null;
}

/** Mushrooms take a narrow band of the roll, by a wall that is mossy or damp. */
function mushroomsGrow({ src, x, y }: At, spot: PlantSpot, r: number) {
  const rolled = r > 0.4 && r < 0.45;
  return rolled && spot.nearWall && (spot.moss >= 1 || src.damp(x, y) > 0.3);
}

/** Wall pairs (DIRS indices) forming each cobweb corner: NW, NE, SE, SW. */
const WEB_CORNERS = [[0, 3], [0, 1], [2, 1], [2, 3]] as const;

/** Cobwebs hang in the corner between two walls. */
function cobweb({ src, x, y }: At, rng: () => number): Plant | null {
  const walls = DIRS.map((q) => isWall(src.kind(x + q.dx, y + q.dy)));
  const corner = WEB_CORNERS.findIndex(([a, b]) => walls[a] && walls[b]);
  if (corner < 0) return null;
  if (tileRandom(x * 11, y * 7 + 1, src.seed ^ 0xeb) >= DECOR_CONFIG.cobweb * (1.2 - src.lush(x, y) * 0.6)) return null;
  return { kind: "web", i: 0, j: 0, variant: Math.floor(rng() * 2), corner };
}

/** Tile-local pixel lookup that follows into neighbouring tiles. */
export function waterAt(src: DecorSource, gx: number, gy: number) {
  const x = Math.floor(gx / TILE_PX), y = -Math.floor(gy / TILE_PX);
  const d = tileDecor(src, x, y);
  if (!d.water) return false;
  const i = gx - x * TILE_PX, j = gy + y * TILE_PX;
  return d.water[j * TILE_PX + i] === 1;
}
