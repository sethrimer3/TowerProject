/** Procedural city: turns a fitted layout into a cell map of streets, parks,
 * filler houses, the player's structures and the city wall.
 *
 * Generation order:
 *  1. Structures (fitted by `fitLayout`) and the wall ring are fixed.
 *  2. A plaza rings the keep; avenues run from it to the city edge in each
 *     direction; every structure gets a street to its door.
 *  3. Blocks that are still too deep are cut in half by a straight street
 *     through their middle, repeatedly — a recursive subdivision that reads
 *     as organically grown city blocks.
 *  4. A few whole blocks become parks; the rest is packed with houses of
 *     assorted sizes, each of which must touch a street. Scraps no house can
 *     use become gardens.
 * Decisions use position-keyed hashes rather than a random stream, so
 * editing one corner of the city leaves the rest looking the same. */
import {
  CELL_COUNT,
  ORTHO,
  cellInBounds,
  cellIndex,
  cellX,
  cellY,
  hash,
  hash01,
  rectCells,
  sideCells,
  type Rect,
} from "./grid.ts";
import { MinHeap } from "./heap.ts";
import type { StructureKind } from "./catalog.ts";
import type { FittedStructure } from "./layout.ts";

export const CellType = {
  OUT: 0,
  ROAD: 1,
  PARK: 2,
  HOUSE: 3,
  STRUCT: 4,
  WALL: 5,
  /** Pond water in a larger park: nothing walks through it. */
  WATER: 6,
} as const;
export type CellType = (typeof CellType)[keyof typeof CellType];
const FREE = 9;

export type BuildingKind = "house" | "wall" | StructureKind;
export type Building = {
  id: number;
  kind: BuildingKind;
  cells: number[];
  rect: Rect;
  /** Set for player structures and the keep. */
  structureUid?: number;
  /** Cosmetic variant (roof colour etc). */
  variant: number;
};

export type CityMap = {
  type: Uint8Array;
  /** Building id occupying each cell, or -1. */
  owner: Int32Array;
  buildings: Building[];
  city: Uint8Array;
  wall: Uint8Array;
  structures: FittedStructure[];
};

/** House footprints and how often each is tried first: mostly chunky
 * blocks, with the odd narrow terrace for variety. */
const HOUSE_SHAPES: [number, number, number][] = [
  [2, 2, 6],
  [2, 3, 4],
  [3, 2, 4],
  [3, 3, 2],
  [1, 2, 1.5],
  [2, 1, 1.5],
  [2, 4, 0.6],
  [4, 2, 0.6],
  [1, 3, 0.4],
  [3, 1, 0.4],
];

export function generateCity(
  fit: { structures: FittedStructure[]; city: Uint8Array; wall: Uint8Array },
  seed: number,
): CityMap {
  const { city, wall, structures } = fit;
  const t = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) t[i] = city[i] ? FREE : wall[i] ? CellType.WALL : CellType.OUT;
  for (const s of structures) fillRect(t, s.rect, CellType.STRUCT);

  const keep = structures[0].rect;
  layPlaza(t, keep);
  layAvenues(t, city, keep, seed);
  layDoorStreets(t, structures, seed);
  subdivideBlocks(t, seed);
  connectRoads(t, keep, seed);
  plantParks(t, seed);
  // Buildings are numbered structures first, then houses, then wall stones.
  const lots = new Lots(seed);
  for (const s of structures) lots.add(s.kind, s.rect, { structureUid: s.uid });
  buildHouses(t, lots, seed);
  digPonds(t, seed);
  // Every wall cell is its own stone that can be knocked out.
  for (let i = 0; i < CELL_COUNT; i++) if (t[i] === CellType.WALL) lots.add("wall", { x: cellX(i), y: cellY(i), w: 1, h: 1 });
  return { type: t, owner: lots.owner, buildings: lots.buildings, city, wall, structures };
}

/** The buildings placed so far and which cells each one owns. */
class Lots {
  readonly owner = new Int32Array(CELL_COUNT).fill(-1);
  readonly buildings: Building[] = [];
  constructor(private readonly seed: number) {}

  add(kind: BuildingKind, rect: Rect, extra: Partial<Building> = {}) {
    const b: Building = { id: this.buildings.length, kind, cells: rectCells(rect), rect, variant: hash(this.seed, rect.x, rect.y, 9) % 6, ...extra };
    for (const i of b.cells) this.owner[i] = b.id;
    this.buildings.push(b);
  }
}

const isRoad = (v: number) => v === CellType.ROAD;
/** Whether a street may be laid over a cell. */
const paveable = (v: number) => v === FREE || v === CellType.ROAD;

function neighbours(i: number): number[] {
  const x = cellX(i),
    y = cellY(i);
  const out: number[] = [];
  for (const [dx, dy] of ORTHO) if (cellInBounds(x + dx, y + dy)) out.push(cellIndex(x + dx, y + dy));
  return out;
}

function fillRect(t: Uint8Array, r: Rect, v: number) {
  for (const i of rectCells(r)) t[i] = v;
}

function rectAll(t: Uint8Array, r: Rect, v: number): boolean {
  if (!cellInBounds(r.x, r.y) || !cellInBounds(r.x + r.w - 1, r.y + r.h - 1)) return false;
  return rectCells(r).every((i) => t[i] === v);
}

/** Every cell of the `v` region containing `start`, marking each in `seen`. */
function flood(t: Uint8Array, start: number, v: number, seen: Uint8Array): number[] {
  const out = [start];
  seen[start] = 1;
  for (let h = 0; h < out.length; h++)
    for (const n of neighbours(out[h]))
      if (t[n] === v && !seen[n]) {
        seen[n] = 1;
        out.push(n);
      }
  return out;
}

// ── Streets ──────────────────────────────────────────────────────────────

/** A ring of street around the keep. */
function layPlaza(t: Uint8Array, keep: Rect) {
  for (const i of rectCells({ x: keep.x - 1, y: keep.y - 1, w: keep.w + 2, h: keep.h + 2 })) if (t[i] === FREE) t[i] = CellType.ROAD;
}

/** Avenues from the plaza to the city edge, where the city runs far enough. */
function layAvenues(t: Uint8Array, city: Uint8Array, keep: Rect, seed: number) {
  for (const dir of ORTHO) {
    const end = avenueEnd(city, { x: keep.x + 1, y: keep.y + 1 }, dir);
    if (end >= 0 && paveable(t[end])) carve(t, [end], seed);
  }
}

/** The last city cell walking from `from` along `dir`, or -1 when the city
 * ends within 4 steps. */
function avenueEnd(city: Uint8Array, from: { x: number; y: number }, [dx, dy]: readonly [number, number]): number {
  let { x, y } = from,
    steps = 0;
  while (cellInBounds(x + dx, y + dy) && city[cellIndex(x + dx, y + dy)]) {
    x += dx;
    y += dy;
    steps++;
  }
  return steps < 4 ? -1 : cellIndex(x, y);
}

/** Every structure in the city gets a street to its door. */
function layDoorStreets(t: Uint8Array, structures: FittedStructure[], seed: number) {
  for (const s of structures) {
    if (!s.inside || s.kind === "keep") continue;
    const doors = sideCells(s.rect).filter((i) => paveable(t[i]));
    if (!doors.some((i) => isRoad(t[i]))) carve(t, doors, seed);
  }
}

/** Cut the deepest block in two with a straight street, until no free cell
 * is more than 2 cells from a road. */
function subdivideBlocks(t: Uint8Array, seed: number) {
  for (let guard = 0; guard < 400; guard++) {
    const far = deepestCell(t, roadDistance(t), seed);
    if (far < 0) return;
    cutStreet(t, far, seed);
  }
}

/** The free cell furthest from a road (ties broken by hash), or -1 when
 * none is more than 2 cells away. */
function deepestCell(t: Uint8Array, dist: Int32Array, seed: number): number {
  let far = -1,
    best = -1;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (t[i] !== FREE || dist[i] <= 2) continue;
    // Distance first, hash second: both fit exactly in one double.
    const rank = dist[i] * 4294967296 + hash(seed, i, 7);
    if (rank > best) {
      best = rank;
      far = i;
    }
  }
  return far;
}

/** A straight street through `far` across its block's long axis (near-ties
 * broken by hash), joined to the network if it touches no other road. */
function cutStreet(t: Uint8Array, far: number, seed: number) {
  const horiz = freeLine(t, far, 1, 0);
  const vert = freeLine(t, far, 0, 1);
  const cutVertical = vert.length === horiz.length ? hash01(seed, far, 3) < 0.5 : horiz.length > vert.length;
  const line = cutVertical ? vert : horiz;
  for (const i of line) t[i] = CellType.ROAD;
  if (!line.some((i) => neighbours(i).some((n) => isRoad(t[n]) && !line.includes(n)))) carve(t, line, seed, true);
}

/** The unbroken run of free cells through `at` along (dx, dy), in order. */
function freeLine(t: Uint8Array, at: number, dx: number, dy: number): number[] {
  const back: number[] = [],
    ahead: number[] = [];
  const run = (out: number[], sx: number, sy: number) => {
    for (let x = cellX(at) + sx, y = cellY(at) + sy; cellInBounds(x, y) && t[cellIndex(x, y)] === FREE; x += sx, y += sy) out.push(cellIndex(x, y));
  };
  run(back, -dx, -dy);
  run(ahead, dx, dy);
  return [...back.reverse(), at, ...ahead];
}

/** BFS distance (through free cells) from the nearest road. Free cells no
 * road can reach count as maximally deep. */
function roadDistance(t: Uint8Array): Int32Array {
  const d = new Int32Array(CELL_COUNT).fill(1 << 20);
  const q: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++)
    if (isRoad(t[i])) {
      d[i] = 0;
      q.push(i);
    }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (const n of neighbours(i))
      if (t[n] === FREE && d[n] > d[i] + 1) {
        d[n] = d[i] + 1;
        q.push(n);
      }
  }
  return d;
}

/** Shortest-path search over integer states; `prev` records the way back. */
class Dijkstra {
  private readonly dist: Float64Array;
  private readonly prev: Int32Array;
  private readonly heap = new MinHeap();
  constructor(states: number) {
    this.dist = new Float64Array(states).fill(Infinity);
    this.prev = new Int32Array(states).fill(-1);
  }
  start(s: number) {
    this.dist[s] = 0;
    this.heap.push(s, 0);
  }
  /** The next state to settle, or -1 when the search is exhausted. */
  next(): number {
    while (this.heap.size) {
      const s = this.heap.pop();
      if (this.heap.lastKey <= this.dist[s]) return s;
    }
    return -1;
  }
  relax(from: number, to: number, cost: number) {
    const d = this.dist[from] + cost;
    if (d < this.dist[to]) {
      this.dist[to] = d;
      this.prev[to] = from;
      this.heap.push(to, d);
    }
  }
  /** `s` and the states that led to it, back to a start. */
  path(s: number): number[] {
    const out: number[] = [];
    for (; s >= 0; s = this.prev[s]) out.push(s);
    return out;
  }
}

const TURN = 2.5;

/** Lay a street from the existing road network to any of `targets`, over
 * free cells. Searches over (cell, heading) so turns cost extra and streets
 * run straight instead of staircasing. With `fromTargets`, the search
 * instead starts at the targets and ends on any road not among them. */
function carve(t: Uint8Array, targets: number[], seed: number, fromTargets = false) {
  const targetSet = new Set(targets);
  const isGoal = fromTargets ? (i: number) => isRoad(t[i]) && !targetSet.has(i) : (i: number) => targetSet.has(i);
  const starts = fromTargets ? targets : [...Array(CELL_COUNT).keys()].filter((i) => isRoad(t[i]));
  const search = new Dijkstra(CELL_COUNT * 4);
  for (const i of starts) for (let d = 0; d < 4; d++) search.start(i * 4 + d);
  for (let s = search.next(); s >= 0; s = search.next()) {
    if (isGoal(s >> 2)) return pave(t, search.path(s).map((state) => state >> 2));
    turnSteps(t, search, s, seed);
  }
}

/** Relax the four moves from state `s` (cell × 4 + heading). */
function turnSteps(t: Uint8Array, search: Dijkstra, s: number, seed: number) {
  const i = s >> 2,
    dir = s & 3;
  const x = cellX(i),
    y = cellY(i);
  for (let nd = 0; nd < 4; nd++) {
    const [dx, dy] = ORTHO[nd];
    if (!cellInBounds(x + dx, y + dy)) continue;
    const n = cellIndex(x + dx, y + dy);
    if (!paveable(t[n])) continue;
    const step = (isRoad(t[n]) ? 0.35 : 1 + hash01(seed, n) * 0.4) + (nd === dir ? 0 : TURN);
    search.relax(s, n * 4 + nd, step);
  }
}

function pave(t: Uint8Array, cells: number[]) {
  for (const i of cells) if (t[i] === FREE) t[i] = CellType.ROAD;
}

/** Join every road fragment to the component touching the keep plaza. */
function connectRoads(t: Uint8Array, keep: Rect, seed: number) {
  for (let guard = 0; guard < 50; guard++) {
    const plaza = sideCells(keep).find((i) => isRoad(t[i]));
    if (plaza === undefined) return;
    const main = new Uint8Array(CELL_COUNT);
    flood(t, plaza, CellType.ROAD, main);
    const stray = t.findIndex((v, i) => isRoad(v) && !main[i]);
    if (stray < 0) return;
    const frag = flood(t, stray, CellType.ROAD, new Uint8Array(CELL_COUNT));
    const path = pathToNetwork(t, frag, main, seed);
    // Unreachable fragment (walled in by structures): let it be a lane.
    if (path) pave(t, path);
    else for (const i of frag) t[i] = CellType.PARK;
  }
}

/** The cheapest way from a road fragment to the main network, or null. */
function pathToNetwork(t: Uint8Array, frag: number[], main: Uint8Array, seed: number): number[] | null {
  const search = new Dijkstra(CELL_COUNT);
  for (const i of frag) search.start(i);
  for (let i = search.next(); i >= 0; i = search.next()) {
    if (main[i]) return search.path(i);
    for (const n of neighbours(i)) if (paveable(t[n])) search.relax(i, n, isRoad(t[n]) ? 0.2 : 1 + hash01(seed, n, 1) * 0.3);
  }
  return null;
}

// ── Blocks ───────────────────────────────────────────────────────────────

/** Whole blocks become parks by hash: small ones often (gardens), the odd
 * mid-sized one a proper park. */
function plantParks(t: Uint8Array, seed: number) {
  const seen = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    if (t[i] !== FREE || seen[i]) continue;
    const cells = flood(t, i, FREE, seen);
    if (becomesPark(cells.length, hash01(seed, Math.min(...cells), 5))) for (const c of cells) t[c] = CellType.PARK;
  }
}

const becomesPark = (size: number, roll: number) => (size <= 16 ? roll < 0.16 : size <= 42 && roll < 0.14);

/** Pack the remaining free cells with houses, each touching a street. */
function buildHouses(t: Uint8Array, lots: Lots, seed: number) {
  for (let i = 0; i < CELL_COUNT; i++) if (t[i] === FREE) buildHouse(t, lots, i, seed);
}

/** The first house shape (in a hashed, weighted order) that fits with its
 * corner at cell `i`; a one-cell cottage if only that fits beside a
 * street; otherwise a garden. */
function buildHouse(t: Uint8Array, lots: Lots, i: number, seed: number) {
  const x = cellX(i),
    y = cellY(i);
  const rect = houseOrder(seed, i)
    .map(([w, h]) => ({ x, y, w, h }))
    .find((r) => rectAll(t, r, FREE) && sideCells(r).some((n) => isRoad(t[n])));
  if (rect) {
    fillRect(t, rect, CellType.HOUSE);
    lots.add("house", rect);
  } else if (neighbours(i).some((n) => isRoad(t[n]))) {
    t[i] = CellType.HOUSE;
    lots.add("house", { x, y, w: 1, h: 1 });
  } else t[i] = CellType.PARK;
}

/** House shapes in a weighted random order (Efraimidis–Spirakis keys). */
function houseOrder(seed: number, i: number) {
  const key = (sh: [number, number, number]) => Math.pow(hash01(seed, i, sh[0], sh[1]), 1 / sh[2]);
  return [...HOUSE_SHAPES].sort((a, b) => key(b) - key(a));
}

/** Larger parks get a pond in their middle: every park cell whose eight
 * neighbours are all park, so a grassy bank always rings the water. */
function digPonds(t: Uint8Array, seed: number) {
  const seen = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    if (t[i] !== CellType.PARK || seen[i]) continue;
    const cells = flood(t, i, CellType.PARK, seen);
    if (!hasPond(cells, seed)) continue;
    const inner = cells.filter((c) => ringedByPark(t, c));
    if (inner.length >= 2) for (const c of inner) t[c] = CellType.WATER;
  }
}

const hasPond = (cells: number[], seed: number) => cells.length >= 9 && hash01(seed, Math.min(...cells), 41) <= 0.8;

function ringedByPark(t: Uint8Array, c: number): boolean {
  const ring = rectCells({ x: cellX(c) - 1, y: cellY(c) - 1, w: 3, h: 3 });
  return ring.length === 9 && ring.every((i) => t[i] === CellType.PARK);
}
