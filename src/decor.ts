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
  let kind: (x: number, y: number) => Kind;
  let key: string;
  let lush: DecorSource["lush"], damp: DecorSource["damp"], clutter: DecorSource["clutter"];
  // Matched by shape rather than instanceof, which breaks across module
  // reloads during development.
  if ("cells" in world && "room" in world) {
    const room = (world as RoomWorld).room, cells = (world as RoomWorld).cells, height = (world as RoomWorld).height;
    key = `t:${seed}:${room}`;
    kind = (x, y) => (x < 0 || y < 0 || x >= world.width || y >= height ? "wall" : cells.get(point(x, y))?.kind ?? "wall");
    // Each Tower room has its own character: some overgrown, some dry and
    // stacked with stores, some flooded.
    const r = (salt: number) => tileRandom(room, salt, seed ^ 0x3ec0);
    const l = 0.08 + 0.84 * Math.pow(r(1), 1.15), d = r(2) < 0.4 ? 0.3 + r(3) * 0.7 : 0, c = 0.25 + r(4) * 0.75;
    lush = () => l; damp = () => d; clutter = () => c;
  } else if ("chunks" in world) {
    const delve = world as World;
    key = `d:${seed}`;
    kind = (x, y) => {
      if (x < 0 || x >= delve.width || y < delve.floor) return "wall";
      delve.tile(x, y); // makes sure the chunk exists
      return delve.chunks.get(Math.floor(y / CHUNK))?.get(point(x, y))?.kind ?? "wall";
    };
    // The Delve drifts through lusher and drier stretches as it deepens.
    lush = (x, y) => clamp01(valueNoise(x / 11, y / 17, seed ^ 0x1a5) * 1.5 - 0.2);
    damp = (x, y) => clamp01(valueNoise(x / 9, y / 13, seed ^ 0x2d7) * 1.8 - 0.75);
    clutter = (x, y) => clamp01(valueNoise(x / 8, y / 10, seed ^ 0x3f1) * 1.4 - 0.1);
  } else return null;
  // The Delve's torch list grows as new areas open; rebuild when it changes.
  let torches = new Set<string>(), seen: unknown = null, count = -1;
  return {
    key, seed, kind, lush, damp, clutter,
    torch(x, y) {
      const list = world.torches ?? [];
      if (list !== seen && list.length !== count) {
        torches = new Set(list.map((t) => point(t.x, t.y)));
        count = list.length;
      }
      seen = list;
      return torches.has(point(x, y));
    },
  };
}

const isWall = (k: Kind) => k === "wall";
/** Tiles decor may cover: open ground, including under items and enemies. */
const isGround = (k: Kind) => k !== "wall" && k !== "door" && k !== "stairs" && k !== "stairsDown" && k !== "oneway";

/** The wall tiles among a tile's 8 neighbours, as [dx, dy, weight]. */
function wallNeighbors(src: DecorSource, x: number, y: number) {
  const out: [number, number, number][] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if ((dx || dy) && isWall(src.kind(x + dx, y + dy))) out.push([dx, dy, dx && dy ? 0.5 : 1]);
  return out;
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
  const k = src.kind(x, y);
  if (!isGround(k) || k !== "floor") return all;
  for (let d = 0; d < 4; d++) {
    const nk = src.kind(x + DIRS[d].dx, y + DIRS[d].dy);
    if (!isWall(nk)) continue;
    const key = `${src.key}:${x},${y}:${d}`;
    let v = vineCache.get(key);
    if (v === undefined) {
      // Vines grow where it's overgrown, sampled at the middle of the edge.
      const mi = DIRS[d].dx > 0 ? 22 : DIRS[d].dx < 0 ? 1 : 12, mj = DIRS[d].dy > 0 ? 1 : DIRS[d].dy < 0 ? 22 : 12;
      const g = overgrowth(src, x, y, mi, mj);
      const chance = DECOR_CONFIG.vineChance * clamp01(g * 0.9 + src.lush(x, y) * 0.2 - 0.12);
      v = tileRandom(x * 7 + d, y * 13 - d, src.seed ^ 0x71e5) < chance ? vineFrom(src, x, y, d) : null;
      if (vineCache.size > 20000) vineCache.clear();
      vineCache.set(key, v);
    }
    if (v) all.push(...v);
  }
  return all;
}

/** Crates stacked against the walls of tile (x, y), or none. */
function cratesFor(src: DecorSource, x: number, y: number, rng: () => number): Crate[] {
  const w = DIRS.map((d) => isWall(src.kind(x + d.dx, y + d.dy)));
  const [n, e, s, wst] = w;
  const walls = w.filter(Boolean).length;
  if (!walls || walls > 2 || (n && s) || (e && wst)) return [];
  // Keep doorways, stairs, and torch corners clear.
  for (const d of DIRS) {
    const k = src.kind(x + d.dx, y + d.dy);
    if (k === "door" || k === "stairs" || k === "stairsDown" || k === "oneway") return [];
  }
  const clutter = src.clutter(x, y);
  const chance = (walls === 2 ? DECOR_CONFIG.crateCorner : DECOR_CONFIG.crateWall) * clutter;
  if (tileRandom(x * 3 + 5, y * 5 - 3, src.seed ^ 0xc4a7) >= chance) return [];
  const out: Crate[] = [];
  const size = () => 9 + Math.floor(rng() * 3);
  const tone = () => Math.floor(rng() * 3);
  // Anchor against the wall(s): west/east decide x, north/south decide y.
  const place = (sz: number, slot: number) => {
    let cx: number, cy: number;
    if (wst) cx = 1 + (e || !n && !s ? 0 : slot * (sz + 1));
    else if (e) cx = TILE_PX - 1 - sz - (n || s ? slot * (sz + 1) : 0);
    else cx = 2 + slot * (sz + 1) + Math.floor(rng() * 3);
    if (n) cy = 2;
    else if (s) cy = TILE_PX - 1 - sz;
    else cy = 3 + slot * (sz + 1) + Math.floor(rng() * 2);
    if (!n && !s && !(wst && e)) cy = Math.min(cy, TILE_PX - 1 - sz);
    return { cx, cy };
  };
  const count = walls === 2 ? 2 + (rng() < 0.5 ? 1 : 0) : 1 + (rng() < 0.4 ? 1 : 0);
  const base = Math.min(2, count);
  for (let slot = 0; slot < base; slot++) {
    const sz = size();
    const barrel = rng() < 0.22;
    const { cx, cy } = place(sz, slot);
    out.push({ x: cx, y: cy, w: barrel ? sz - 2 : sz, h: sz, lift: 0, kind: barrel ? "barrel" : "crate", tone: tone() });
  }
  // A third box sits on top of the first.
  if (count > 2 && out[0].kind === "crate") {
    const b = out[0], sz = b.w - 1;
    out.push({ x: b.x + Math.floor(rng() * 2), y: b.y, w: sz, h: sz, lift: 5, kind: "crate", tone: tone() });
  }
  for (const c of out) {
    c.x = Math.max(0, Math.min(TILE_PX - c.w, c.x));
    c.y = Math.max(0, Math.min(TILE_PX - c.h, c.y));
  }
  return out;
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

function planTile(src: DecorSource, x: number, y: number): TileDecor {
  const kind = src.kind(x, y);
  const wall = isWall(kind), ground = isGround(kind);
  const d: TileDecor = {
    moss: null, water: null, waterCount: 0, thicket: false, blades: [], crates: [], plants: [],
    vines: [], flowers: [], drip: null, glints: [], empty: true,
  };
  const lush = src.lush(x, y);
  const [l1, l2, l3] = DECOR_CONFIG.mossLevels;
  const level = (m: number, i: number, j: number) => {
    const v = m + (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.5) * DECOR_CONFIG.mossDither;
    return v > l3 ? 3 : v > l2 ? 2 : v > l1 ? 1 : 0;
  };
  let grid: Float32Array | null = null;
  const toneAt = (i: number, j: number) =>
    valueNoise((x + i / TILE_PX) / 5, (-y + j / TILE_PX) / 5, src.seed ^ 0x70e) > 0.55 ? 4 : 0;

  // --- Moss: a continuous field, so it fades across tile seams. ---
  if (ground && lush > 0.02) {
    const moss = new Uint8Array(AREA);
    grid = overgrowthGrid(src, x, y);
    let any = false, sum = 0, min = Infinity;
    for (let j = 0; j < TILE_PX; j++)
      for (let i = 0; i < TILE_PX; i++) {
        const m = grid[j * TILE_PX + i];
        sum += m; min = Math.min(min, m);
        const lv = level(m, i, j);
        if (lv) { moss[j * TILE_PX + i] = lv | toneAt(i, j); any = true; }
      }
    if (any) d.moss = moss;
    const avg = sum / AREA;
    d.thicket = kind === "floor" && !src.torch(x, y) && avg > DECOR_CONFIG.thicketAverage && min > DECOR_CONFIG.thicketMinimum;
  } else if (wall && lush > 0.02) {
    // Moss creeps a few pixels up the wall from mossy floor beside it.
    const moss = new Uint8Array(AREA);
    let any = false;
    for (let dI = 0; dI < 4; dI++) {
      const dir = DIRS[dI];
      const fxT = x - dir.dx, fyT = y - dir.dy; // the floor tile this face looks onto
      // Face: the side of this wall tile nearest that floor tile.
      if (!isGround(src.kind(fxT, fyT))) continue;
      const floorWalls = wallNeighbors(src, fxT, fyT);
      for (let t = 0; t < TILE_PX; t++) {
        // Matching floor pixel just across the face.
        const fi = dir.dx > 0 ? TILE_PX - 1 : dir.dx < 0 ? 0 : t;
        const fj = dir.dy > 0 ? 0 : dir.dy < 0 ? TILE_PX - 1 : t;
        const edge = overgrowth(src, fxT, fyT, fi, fj, floorWalls);
        if (edge < 0.3) continue;
        for (let depth = 0; depth < 5; depth++) {
          // Pixel in this wall tile at `depth` from the face.
          const i = dir.dx > 0 ? depth : dir.dx < 0 ? TILE_PX - 1 - depth : t;
          const j = dir.dy > 0 ? TILE_PX - 1 - depth : dir.dy < 0 ? depth : t;
          const m = edge - 0.3 - depth * 0.16;
          const lv = level(m, i, j);
          const idx = j * TILE_PX + i;
          if (lv > (moss[idx] & 3)) { moss[idx] = lv | toneAt(i, j); any = true; }
        }
      }
    }
    if (any) d.moss = moss;
  }

  // --- Water: pools gather in hollows of a second field. ---
  if (ground) {
    const dampness = src.damp(x, y);
    if (dampness > 0) {
      const walls = wallNeighbors(src, x, y);
      // Torches stand in a dry circle (world pixels of each nearby torch).
      const torches: [number, number][] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (src.torch(x + dx, y + dy)) torches.push([(x + dx) * TILE_PX + 12, -(y + dy) * TILE_PX + 12]);
      const th = 1 - dampness * 0.28;
      const water = new Uint8Array(AREA);
      // The field on a 26x26 grid (one pixel of border) so the rim can look
      // across tile seams; pixels over non-ground neighbours stay dry.
      const P = TILE_PX + 2, wetGrid = new Uint8Array(P * P);
      for (let j = -1; j <= TILE_PX; j++)
        for (let i = -1; i <= TILE_PX; i++) {
          const inside = i >= 0 && j >= 0 && i < TILE_PX && j < TILE_PX;
          if (!inside && !isGround(src.kind(x + Math.floor(i / TILE_PX), y - Math.floor(j / TILE_PX)))) continue;
          // Pools stop a little short of the walls.
          if (wallProximity(walls, Math.max(0, Math.min(TILE_PX - 1, i)), Math.max(0, Math.min(TILE_PX - 1, j))) > 0.8) continue;
          const fx = x + (i + 0.5) / TILE_PX, fy = -y + (j + 0.5) / TILE_PX;
          if (waterField(src, fx, fy) <= th) continue;
          const gx = x * TILE_PX + i, gy = -y * TILE_PX + j;
          if (torches.some(([tx, ty]) => Math.hypot(gx - tx, gy - ty) < 17)) continue;
          if (inside && grid && grid[j * TILE_PX + i] >= 0.75) continue;
          wetGrid[(j + 1) * P + i + 1] = 1;
        }
      const wet = (i: number, j: number) => wetGrid[(j + 1) * P + i + 1] === 1;
      for (let j = 0; j < TILE_PX; j++)
        for (let i = 0; i < TILE_PX; i++) {
          if (wet(i, j)) { water[j * TILE_PX + i] = 1; d.waterCount++; }
        }
      if (d.waterCount) {
        // Darkened wet stone around the pool's rim.
        for (let j = 0; j < TILE_PX; j++)
          for (let i = 0; i < TILE_PX; i++) {
            if (water[j * TILE_PX + i]) continue;
            if (wet(i - 1, j) || wet(i + 1, j) || wet(i, j - 1) || wet(i, j + 1)) water[j * TILE_PX + i] = 2;
          }
        d.water = water;
        // Tall grass gives way to a pool that floods much of the tile.
        if (d.waterCount > 40) d.thicket = false;
        if (d.moss) for (let k = 0; k < AREA; k++) if (water[k] === 1) d.moss[k] = 0;
        const rng = rngFor(src, x, y, 7);
        for (let k = 0; k < 40 && d.glints.length < 5; k++) {
          const i = Math.floor(rng() * TILE_PX), j = Math.floor(rng() * TILE_PX);
          if (water[j * TILE_PX + i] === 1 && water[j * TILE_PX + Math.min(23, i + 1)] === 1) d.glints.push([i, j]);
        }
        // Some pools are fed by a slow drip from the ceiling.
        if (d.waterCount > 60 && rng() < 0.4) {
          for (let k = 0; k < 30; k++) {
            const i = 4 + Math.floor(rng() * 16), j = 6 + Math.floor(rng() * 14);
            if (water[j * TILE_PX + i] === 1) { d.drip = { i, j, period: 5 + rng() * 7, phase: rng() * 12 }; break; }
          }
        }
      }
    }
  }

  // --- Vines, from this tile and nearby roots (they cross tile seams). ---
  if (lush > 0.05 && (ground || wall)) {
    const ox = x * TILE_PX, oy = -y * TILE_PX;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        for (const p of vinesAt(src, x + dx, y + dy)) {
          const i = p.gx - ox, j = p.gy - oy;
          if (i < 0 || j < 0 || i >= TILE_PX || j >= TILE_PX) continue;
          if (p.c === 4) d.flowers.push({ i, j, color: Math.floor(valueNoise((x + dx) / 4, (y + dy) / 4, src.seed ^ 0xf10) * FLOWER_COLORS.length * 0.999) });
          else d.vines.push({ i, j, c: p.c });
        }
    if (d.water) d.vines = d.vines.filter((v) => d.water![v.j * TILE_PX + v.i] !== 1);
  }

  // --- Standing things on plain floor. ---
  if (kind === "floor" && !src.torch(x, y)) {
    const rng = rngFor(src, x, y, 3);
    if (!d.thicket && !d.waterCount) d.crates = cratesFor(src, x, y, rng);
    const busy = (i: number, j: number) =>
      d.crates.some((c) => i >= c.x - 1 && i <= c.x + c.w && j >= c.y - c.lift - 1 && j <= c.y + c.h) ||
      (d.water && d.water[j * TILE_PX + i] === 1);
    if (d.thicket) {
      // Dense clumps: a main blade with a shorter one or two beside it.
      const clumps = 12 + Math.floor(rng() * 5);
      for (let k = 0; k < clumps; k++) {
        const i = 1 + Math.floor(rng() * 21), j = 5 + Math.floor(rng() * 19), h = 6 + Math.floor(rng() * 5);
        const color = Math.floor(rng() * 4), phase = rng() * Math.PI * 2, lean = (rng() - 0.5) * 1.6;
        d.blades.push({ i, j, h, color, phase, lean });
        if (rng() < 0.75) d.blades.push({ i: i + 1, j, h: h - 2 - Math.floor(rng() * 2), color: Math.max(0, color - 1), phase: phase + 0.4, lean: lean + 0.8 });
        if (rng() < 0.4) d.blades.push({ i: i - 1, j, h: h - 3, color, phase: phase - 0.3, lean: lean - 0.9 });
      }
      d.blades.sort((a, b) => a.j - b.j);
    } else {
      const mid = d.moss ? d.moss[12 * TILE_PX + 12] & 3 : 0;
      const nearWall = DIRS.some((q) => isWall(src.kind(x + q.dx, y + q.dy)));
      const tries = mid >= 2 ? 2 : 1;
      for (let k = 0; k < tries; k++) {
        const i = 3 + Math.floor(rng() * 18), j = 5 + Math.floor(rng() * 16);
        if (busy(i, j)) continue;
        const lv = d.moss ? d.moss[j * TILE_PX + i] & 3 : 0;
        const r = rng();
        if (lv >= 2 && r < 0.25) d.plants.push({ kind: "tuft", i, j, variant: Math.floor(rng() * 3) });
        else if (lv >= 2 && r < 0.33) d.plants.push({ kind: "fern", i, j, variant: Math.floor(rng() * 2) });
        else if (lv >= 1 && r < 0.4) d.plants.push({ kind: "sprout", i, j, variant: Math.floor(rng() * 3) });
        else if (nearWall && (lv >= 1 || src.damp(x, y) > 0.3) && r > 0.4 && r < 0.45)
          d.plants.push({ kind: "mushrooms", i, j, variant: Math.floor(rng() * 3), glow: rng() < 0.3 + lush * 0.2 });
        else if (r > 0.95) d.plants.push({ kind: "pebbles", i, j, variant: Math.floor(rng() * 3) });
      }
      // Cobwebs hang in the corner between two walls.
      const [n, e, s, w] = DIRS.map((q) => isWall(src.kind(x + q.dx, y + q.dy)));
      const corner = n && w ? 0 : n && e ? 1 : s && e ? 2 : s && w ? 3 : -1;
      if (corner >= 0 && tileRandom(x * 11, y * 7 + 1, src.seed ^ 0xeb) < DECOR_CONFIG.cobweb * (1.2 - lush * 0.6))
        d.plants.push({ kind: "web", i: 0, j: 0, variant: Math.floor(rng() * 2), corner });
    }
  }
  d.empty = !d.moss && !d.water && !d.thicket && !d.crates.length && !d.plants.length && !d.vines.length && !d.flowers.length;
  return d;
}

/** Tile-local pixel lookup that follows into neighbouring tiles. */
export function waterAt(src: DecorSource, gx: number, gy: number) {
  const x = Math.floor(gx / TILE_PX), y = -Math.floor(gy / TILE_PX);
  const d = tileDecor(src, x, y);
  if (!d.water) return false;
  const i = gx - x * TILE_PX, j = gy + y * TILE_PX;
  return d.water[j * TILE_PX + i] === 1;
}
