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
  CELLS_H,
  CELLS_W,
  ORTHO,
  cellIndex,
  hash,
  hash01,
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
  // 1. Plaza around the keep.
  for (let y = keep.y - 1; y <= keep.y + keep.h; y++)
    for (let x = keep.x - 1; x <= keep.x + keep.w; x++) if (inB(x, y) && t[cellIndex(x, y)] === FREE) t[cellIndex(x, y)] = CellType.ROAD;

  // 2. Avenues from the plaza to the city edge.
  const kcx = keep.x + 1,
    kcy = keep.y + 1;
  for (const [dx, dy] of ORTHO) {
    let x = kcx,
      y = kcy,
      steps = 0;
    while (inB(x + dx, y + dy) && city[cellIndex(x + dx, y + dy)]) {
      x += dx;
      y += dy;
      steps++;
    }
    if (steps < 4) continue;
    const end = cellIndex(x, y);
    if (t[end] === FREE || t[end] === CellType.ROAD) carve(t, [end], seed);
  }
  // 3. Every structure gets a street to its door.
  for (const s of structures) {
    if (!s.inside || s.kind === "keep") continue;
    const doors = sideCells(s.rect).filter((i) => t[i] === FREE || t[i] === CellType.ROAD);
    if (doors.some((i) => t[i] === CellType.ROAD)) continue;
    carve(t, doors, seed);
  }
  // 4. Subdivide deep blocks with straight streets.
  for (let guard = 0; guard < 400; guard++) {
    const dist = roadDistance(t);
    let far = -1,
      farD = 2,
      farH = 0;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (t[i] !== FREE) continue;
      const h = hash(seed, i, 7);
      if (dist[i] > farD || (dist[i] === farD && far >= 0 && h > farH)) {
        if (dist[i] > 2) {
          far = i;
          farD = dist[i];
          farH = h;
        }
      }
    }
    if (far < 0) break;
    const fx = far % CELLS_W,
      fy = (far - fx) / CELLS_W;
    const run = (dx: number, dy: number) => {
      const out: number[] = [];
      let x = fx,
        y = fy;
      while (inB(x, y) && t[cellIndex(x, y)] === FREE) {
        out.push(cellIndex(x, y));
        x += dx;
        y += dy;
      }
      return out;
    };
    const horiz = [...run(-1, 0).reverse(), ...run(1, 0).slice(1)];
    const vert = [...run(0, -1).reverse(), ...run(0, 1).slice(1)];
    // Cut across the block's long axis; break near-ties by hash.
    const cutVertical = vert.length === horiz.length ? hash01(seed, far, 3) < 0.5 : horiz.length > vert.length;
    const line = cutVertical ? vert : horiz;
    for (const i of line) t[i] = CellType.ROAD;
    if (!line.some((i) => neighbours(i).some((n) => t[n] === CellType.ROAD && !line.includes(n)))) carve(t, line, seed, true);
  }
  // 5. Stitch any street fragments onto the network that reaches the keep.
  connectRoads(t, keep, seed);
  // 6. Parks: whole small blocks, chosen by hash.
  const block = new Int32Array(CELL_COUNT).fill(-1);
  let blocks = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (t[i] !== FREE || block[i] >= 0) continue;
    const cells = flood(t, i, FREE, block, blocks++);
    // Small blocks often become gardens; the odd big block a proper park.
    const roll = hash01(seed, Math.min(...cells), 5);
    if ((cells.length <= 16 && roll < 0.16) || (cells.length > 16 && cells.length <= 42 && roll < 0.14)) for (const c of cells) t[c] = CellType.PARK;
  }
  // 7. Houses.
  const owner = new Int32Array(CELL_COUNT).fill(-1);
  const buildings: Building[] = [];
  const add = (kind: BuildingKind, rect: Rect, extra: Partial<Building> = {}) => {
    const b: Building = { id: buildings.length, kind, cells: [], rect, variant: hash(seed, rect.x, rect.y, 9) % 6, ...extra };
    for (let y = rect.y; y < rect.y + rect.h; y++)
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = cellIndex(x, y);
        b.cells.push(i);
        owner[i] = b.id;
      }
    buildings.push(b);
    return b;
  };
  for (const s of structures) add(s.kind, s.rect, { structureUid: s.uid });
  for (let i = 0; i < CELL_COUNT; i++) {
    if (t[i] !== FREE) continue;
    const x = i % CELLS_W,
      y = (i - x) / CELLS_W;
    // Weighted random order (Efraimidis–Spirakis keys).
    const key = (sh: [number, number, number]) => Math.pow(hash01(seed, i, sh[0], sh[1]), 1 / sh[2]);
    const order = [...HOUSE_SHAPES].sort((a, b) => key(b) - key(a));
    let placed = false;
    for (const [w, h] of order) {
      const r = { x, y, w, h };
      if (!rectAll(t, r, FREE) || !sideCells(r).some((n) => t[n] === CellType.ROAD)) continue;
      fillRect(t, r, CellType.HOUSE);
      add("house", r);
      placed = true;
      break;
    }
    if (!placed) {
      if (neighbours(i).some((n) => t[n] === CellType.ROAD)) {
        t[i] = CellType.HOUSE;
        add("house", { x, y, w: 1, h: 1 });
      } else t[i] = CellType.PARK;
    }
  }
  // 8. Larger parks get a pond in their middle: every park cell whose eight
  // neighbours are all park, so a grassy bank always rings the water.
  const parkMark = new Int32Array(CELL_COUNT).fill(-1);
  let parks = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (t[i] !== CellType.PARK || parkMark[i] >= 0) continue;
    const cells = flood(t, i, CellType.PARK, parkMark, parks++);
    if (cells.length < 9 || hash01(seed, Math.min(...cells), 41) > 0.8) continue;
    const inner = cells.filter((c) => {
      const x = c % CELLS_W,
        y = (c - x) / CELLS_W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (!inB(x + dx, y + dy) || t[cellIndex(x + dx, y + dy)] !== CellType.PARK) return false;
      return true;
    });
    if (inner.length >= 2) for (const c of inner) t[c] = CellType.WATER;
  }
  // 9. Every wall cell is its own stone that can be knocked out.
  for (let i = 0; i < CELL_COUNT; i++)
    if (t[i] === CellType.WALL) {
      const x = i % CELLS_W,
        y = (i - x) / CELLS_W;
      add("wall", { x, y, w: 1, h: 1 });
    }
  return { type: t, owner, buildings, city, wall, structures };
}

const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < CELLS_W && y < CELLS_H;

function neighbours(i: number): number[] {
  const x = i % CELLS_W,
    y = (i - x) / CELLS_W;
  const out: number[] = [];
  for (const [dx, dy] of ORTHO) if (inB(x + dx, y + dy)) out.push(cellIndex(x + dx, y + dy));
  return out;
}

function fillRect(t: Uint8Array, r: Rect, v: number) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) t[cellIndex(x, y)] = v;
}

function rectAll(t: Uint8Array, r: Rect, v: number): boolean {
  if (!inB(r.x, r.y) || !inB(r.x + r.w - 1, r.y + r.h - 1)) return false;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (t[cellIndex(x, y)] !== v) return false;
  return true;
}

/** Cells orthogonally touching a rect's outside edge. */
export function sideCells(r: Rect): number[] {
  const out: number[] = [];
  for (let x = r.x; x < r.x + r.w; x++) {
    if (inB(x, r.y - 1)) out.push(cellIndex(x, r.y - 1));
    if (inB(x, r.y + r.h)) out.push(cellIndex(x, r.y + r.h));
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    if (inB(r.x - 1, y)) out.push(cellIndex(r.x - 1, y));
    if (inB(r.x + r.w, y)) out.push(cellIndex(r.x + r.w, y));
  }
  return out;
}

/** BFS distance (through free cells) from the nearest road. */
function roadDistance(t: Uint8Array): Int32Array {
  const d = new Int32Array(CELL_COUNT).fill(1 << 20);
  const q: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++)
    if (t[i] === CellType.ROAD) {
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
  // Free cells no road can reach count as maximally deep.
  return d;
}

function flood(t: Uint8Array, start: number, v: number, mark: Int32Array, id: number): number[] {
  const out = [start];
  mark[start] = id;
  for (let h = 0; h < out.length; h++)
    for (const n of neighbours(out[h]))
      if (t[n] === v && mark[n] < 0) {
        mark[n] = id;
        out.push(n);
      }
  return out;
}

/** Lay a street from the existing road network to any of `targets`, over
 * free cells. Uses Dijkstra over (cell, heading) so turns cost extra and
 * streets run straight instead of staircasing. With `fromTargets`, the
 * search instead starts at the targets and ends on any road not among them. */
function carve(t: Uint8Array, targets: number[], seed: number, fromTargets = false): boolean {
  const TURN = 2.5;
  const S = CELL_COUNT * 4;
  const dist = new Float64Array(S).fill(Infinity);
  const prev = new Int32Array(S).fill(-1);
  const heap = new MinHeap();
  const targetSet = new Set(targets);
  const isGoal = (i: number) => (fromTargets ? t[i] === CellType.ROAD && !targetSet.has(i) : targetSet.has(i));
  const starts = fromTargets ? targets : [...Array(CELL_COUNT).keys()].filter((i) => t[i] === CellType.ROAD);
  if (!starts.length) return false;
  for (const i of starts)
    for (let d = 0; d < 4; d++) {
      dist[i * 4 + d] = 0;
      heap.push(i * 4 + d, 0);
    }
  let goal = -1;
  while (heap.size) {
    const s = heap.pop();
    const k = heap.lastKey;
    if (k > dist[s]) continue;
    const i = s >> 2,
      dir = s & 3;
    if (isGoal(i) && !(fromTargets && k === 0)) {
      goal = s;
      break;
    }
    const x = i % CELLS_W,
      y = (i - x) / CELLS_W;
    for (let nd = 0; nd < 4; nd++) {
      const [dx, dy] = ORTHO[nd];
      const nx = x + dx,
        ny = y + dy;
      if (!inB(nx, ny)) continue;
      const n = cellIndex(nx, ny);
      if (t[n] !== FREE && t[n] !== CellType.ROAD) continue;
      const step = (t[n] === CellType.ROAD ? 0.35 : 1 + hash01(seed, n) * 0.4) + (nd === dir ? 0 : TURN);
      const ns = n * 4 + nd;
      if (k + step < dist[ns]) {
        dist[ns] = k + step;
        prev[ns] = s;
        heap.push(ns, k + step);
      }
    }
  }
  if (goal < 0) return false;
  for (let s = goal; s >= 0; s = prev[s]) {
    const i = s >> 2;
    if (t[i] === FREE) t[i] = CellType.ROAD;
  }
  return true;
}

/** Join every road fragment to the component touching the keep plaza. */
function connectRoads(t: Uint8Array, keep: Rect, seed: number) {
  for (let guard = 0; guard < 50; guard++) {
    const mark = new Int32Array(CELL_COUNT).fill(-1);
    const plaza = sideCells(keep).find((i) => t[i] === CellType.ROAD);
    if (plaza === undefined) return;
    flood(t, plaza, CellType.ROAD, mark, 0);
    let stray = -1;
    for (let i = 0; i < CELL_COUNT; i++)
      if (t[i] === CellType.ROAD && mark[i] < 0) {
        stray = i;
        break;
      }
    if (stray < 0) return;
    const frag = flood(t, stray, CellType.ROAD, mark, 1);
    // Search from the fragment to the main network (mark 0) over free cells.
    const heap = new MinHeap();
    const dist = new Float64Array(CELL_COUNT).fill(Infinity);
    const prev = new Int32Array(CELL_COUNT).fill(-1);
    for (const i of frag) {
      dist[i] = 0;
      heap.push(i, 0);
    }
    let goal = -1;
    while (heap.size) {
      const i = heap.pop();
      const k = heap.lastKey;
      if (k > dist[i]) continue;
      if (mark[i] === 0) {
        goal = i;
        break;
      }
      for (const n of neighbours(i)) {
        if (t[n] !== FREE && t[n] !== CellType.ROAD) continue;
        const step = t[n] === CellType.ROAD ? 0.2 : 1 + hash01(seed, n, 1) * 0.3;
        if (k + step < dist[n]) {
          dist[n] = k + step;
          prev[n] = i;
          heap.push(n, k + step);
        }
      }
    }
    if (goal < 0) {
      // Unreachable fragment (walled in by structures): let it be a lane.
      for (const i of frag) mark[i] = 0;
      for (const i of frag) t[i] = CellType.PARK;
      continue;
    }
    for (let i = goal; i >= 0; i = prev[i]) if (t[i] === FREE) t[i] = CellType.ROAD;
  }
}
