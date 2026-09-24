import { region, depthAt } from "./delve/labyrinth.ts";
import {
  CHUNK,
  WIDTH,
  START_X,
  TOWER_WIDTH,
  TOWER_HEIGHT,
  TOWER_START_X,
  UNGUARDED_LOOT_CHANCE,
  type KeyColor,
} from "./config.ts";
import { point, type Tile, type Torch } from "./entities.ts";
import { computeVisibilityPolygon, LIGHTING_CONFIG } from "./lighting.ts";
import { doorCost } from "./doors.ts";
import { tileRandom } from "./themes.ts";
import { generateTowerFloor } from "./tower/index.ts";
export type Board = {
  width: number;
  floor: number;
  tile(x: number, y: number): Tile;
  step(
    x: number,
    y: number,
    dx: number,
    dy: number,
  ): { x: number; y: number } | null;
  clear(x: number, y: number): void;
  /** Present on boards that carry torches (dungeon boards; the forest
   * exterior has none). */
  torches?: Torch[];
  /** Deactivates the torch standing on (x, y), if any, and reports whether
   * one was destroyed. Used for player-torch collision. */
  breakTorchAt?(x: number, y: number): boolean;
};
/** Torch placement tuning: roughly one torch per this many open tiles,
 * never closer together than `minSpacing` tiles. */
export const TORCH_PLACEMENT = { openTilesPerTorch: 30, minSpacing: 4.5, jitter: 0.35 };

/** Picks out-of-the-way torch spots: plain floor tiles tucked into an
 * L-shaped corner (a wall on one vertical and one horizontal side), never in
 * a corridor, never beside a door or stairs, and never pinching a path (the
 * diagonal across the corner stays open). Corners of small rooms score
 * highest; spots are then taken greedily with a minimum spacing. */
export function chooseTorchSpots(
  cells: Map<string, Tile>,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  seed: number,
): [number, number][] {
  const kind = (x: number, y: number) => cells.get(point(x, y))?.kind ?? "wall";
  const isWall = (x: number, y: number) => kind(x, y) === "wall";
  let open = 0;
  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = yMin; y <= yMax; y++)
    for (let x = xMin; x <= xMax; x++) {
      if (isWall(x, y)) continue;
      open++;
      if (kind(x, y) !== "floor") continue;
      const n = isWall(x, y + 1), s = isWall(x, y - 1), e = isWall(x + 1, y), w = isWall(x - 1, y);
      if ((n && s) || (e && w) || !(n || s) || !(e || w)) continue;
      const vx = e ? -1 : 1, vy = n ? -1 : 1;
      if (isWall(x + vx, y + vy)) continue;
      let busy = false;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const k = kind(x + dx, y + dy);
        if (k === "door" || k === "stairs" || k === "stairsDown" || k === "oneway") busy = true;
      }
      if (busy) continue;
      // Smaller spaces read cozier with a torch: count open tiles nearby.
      let nearby = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!isWall(x + dx, y + dy)) nearby++;
      const score = 1 - nearby / 49 + tileRandom(x, y, seed ^ 0x70c4) * TORCH_PLACEMENT.jitter;
      candidates.push({ x, y, score });
    }
  candidates.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  const want = Math.max(1, Math.round(open / TORCH_PLACEMENT.openTilesPerTorch));
  const picked: [number, number][] = [];
  for (const c of candidates) {
    if (picked.length >= want) break;
    if (picked.some(([px, py]) => Math.hypot(px - c.x, py - c.y) < TORCH_PLACEMENT.minSpacing)) continue;
    picked.push([c.x, c.y]);
  }
  return picked;
}

/** Places torches (see chooseTorchSpots), then caches each torch's
 * visibility polygon up front so rendering never recomputes it per frame. */
function placeTorches(
  cells: Map<string, Tile>,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  seed: number,
): Torch[] {
  const isWall = (x: number, y: number) =>
    (cells.get(point(x, y))?.kind ?? "wall") === "wall";
  const torches: Torch[] = chooseTorchSpots(cells, xMin, xMax, yMin, yMax, seed).map(([x, y]) => ({
    x,
    y,
    lightRadius: LIGHTING_CONFIG.torch.defaultRadius,
    baseIntensity: LIGHTING_CONFIG.torch.defaultIntensity,
    active: true,
  }));
  for (const torch of torches)
    torch.visibilityPolygon = computeVisibilityPolygon(torch, isWall);
  return torches;
}
export const LAYOUT_VERSION = 6;
// v3 adds declarative multi-key/condition doors and places their prerequisite
// keys differently; old per-room coordinate mutations must not overlay it.
// v4 replaces the maze generator with strategic chamber layouts.
export const TOWER_LAYOUT_VERSION = 4;
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Flood fill used for structural checks. Enemies are traversable here:
 * combat difficulty is separate from topology and key solvability. */
export function reachable(
  cells: Map<string, Tile>,
  start: string,
  blocked: Set<string> = new Set(),
) {
  const seen = new Set<string>(),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i],
      t = cells.get(k);
    if (seen.has(k) || !t || t.kind === "wall" || blocked.has(k)) continue;
    seen.add(k);
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of directions) {
      const xx = x + dx;
      queue.push(point(xx < 0 ? WIDTH - 1 : xx >= WIDTH ? 0 : xx, y + dy));
    }
  }
  return seen;
}
/** Validate all floor space, actual separating locks, and a consuming-key traversal.
 * No starting keys are assumed; enemies may gate otherwise connected spaces. Each child chamber gets its key in its parent. */

export function bspRooms(x: number, y: number, w: number, h: number, rng: () => number, minSize = 4) {
  const regions = [{ x, y, w, h }];
  const rooms: any[] = [];
  while (regions.length > 0) {
    const r = regions.pop()!;
    const canSplitH = r.h > minSize * 2;
    const canSplitV = r.w > minSize * 2;
    if (canSplitH && canSplitV) {
      if (rng() < 0.5) splitH(r); else splitV(r);
    } else if (canSplitH) {
      splitH(r);
    } else if (canSplitV) {
      splitV(r);
    } else {
      rooms.push(r);
    }
    function splitH(r: any) {
      const wallThick = rng() < 0.25 ? 2 : 1; 
      const split = Math.floor(rng() * (r.h - minSize * 2 - wallThick + 1)) + minSize;
      regions.push({ x: r.x, y: r.y, w: r.w, h: split });
      regions.push({ x: r.x, y: r.y + split + wallThick, w: r.w, h: r.h - split - wallThick });
    }
    function splitV(r: any) {
      const wallThick = rng() < 0.25 ? 2 : 1; 
      const split = Math.floor(rng() * (r.w - minSize * 2 - wallThick + 1)) + minSize;
      regions.push({ x: r.x, y: r.y, w: split, h: r.h });
      regions.push({ x: r.x + split + wallThick, y: r.y, w: r.w - split - wallThick, h: r.h });
    }
  }
  return rooms;
}

/** Carves a meandering 1-wide corridor and returns every cell it touched
 * (in walk order) so callers can place a choke-point gate exactly on the
 * corridor rather than guessing at coordinates. */
export function carvePath(cells: Map<string, Tile>, pointFn: (x: number, y: number) => string, x1: number, y1: number, x2: number, y2: number, rng: () => number): [number, number][] {
  const path: [number, number][] = [];
  let cx = x1, cy = y1;
  while(cx !== x2 || cy !== y2) {
    cells.set(pointFn(cx, cy), { kind: 'floor' });
    path.push([cx, cy]);
    if (cx === x2) { cy += Math.sign(y2 - cy); continue; }
    if (cy === y2) { cx += Math.sign(x2 - cx); continue; }
    if (rng() < 0.5) cx += Math.sign(x2 - cx); else cy += Math.sign(y2 - cy);
  }
  cells.set(pointFn(x2, y2), { kind: 'floor' });
  path.push([x2, y2]);
  return path;
}

export function validate(cells: Map<string, Tile>, base: number) {
  const entrance = point(START_X, base);
  const all = reachable(cells, entrance);
  if (!all.has(point(START_X, base + CHUNK - 1))) return false;
  if ([...cells].some(([k, t]) => t.kind !== "wall" && !all.has(k)))
    return false;
  const locks = [...cells].filter(([, t]) => t.kind === "door");
  // Removing any one door must disconnect floor beyond it, even with all others open.
  for (const [key] of locks)
    if (reachable(cells, entrance, new Set([key])).size >= all.size - 1)
      return false;
  const closed = new Set(locks.map(([k]) => k)),
    collected = new Set<string>();
  const keys: Record<KeyColor, number> = { yellow: 0, blue: 0, red: 0 };
  for (let step = 0; step <= locks.length; step++) {
    const area = reachable(cells, entrance, closed);
    for (const k of area) {
      const t = cells.get(k)!;
      if (t.kind === "key" && !collected.has(k)) {
        keys[t.color!]++;
        collected.add(k);
      }
    }
    if (!closed.size) return area.size === all.size;
    const next = locks.find(([k, t]) => {
      if (!closed.has(k) || doorCost(t, { keys, hp: 1, maxHp: 1 }) === null) return false;
      const [x, y] = k.split(",").map(Number);
      return directions.some(([dx, dy]) =>
        area.has(point((x + dx + WIDTH) % WIDTH, y + dy)),
      );
    });
    if (!next) return false;
    for (const color of doorCost(next[1], { keys, hp: 1, maxHp: 1 })!) keys[color]--;
    closed.delete(next[0]);
  }
  return false;
}
type Room = {
  id: number;
  col: number;
  row: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

/** Compatibility snapshot for diagnostics; runtime generation is lazy and endless. */
export function generateDelveMap(seed: number, areas = 4): Map<string, Tile> {
  const cells = new Map<string, Tile>();
  for (let a = 0; a < areas; a++) for (const [k, t] of region(seed, a).cells) cells.set(k, t);
  return cells;
}
export function generate(seed: number, index: number): Map<string, Tile> {
  const cells = new Map<string, Tile>();
  const min = index * CHUNK, max = min + CHUNK;
  for (let a = Math.max(0, Math.floor((min - 35) / 108)); a <= Math.floor(max / 108); a++)
    for (const [k, t] of region(seed, a).cells) {
      const y = Number(k.split(',')[1]);
      if (y >= min && y < max) cells.set(k, t);
    }
  return cells;
}
export function torchesForSeed(seed: number): Torch[] {
  return placeTorches(generateDelveMap(seed, 1), 1, WIDTH - 2, 0, 140, seed);
}

export function rollUnguardedLoot(rng: () => number): Tile | null {
  if (rng() >= UNGUARDED_LOOT_CHANCE) return null;
  const choice = Math.floor(rng() * 6);
  if (choice < 3)
    return { kind: "key", color: (["yellow", "blue", "red"] as const)[choice] };
  return { kind: (["attack", "defense", "treasure"] as const)[choice - 3] };
}
export class World implements Board {
  width = WIDTH;
  chunks = new Map<number, Map<string, Tile>>();
  constructor(
    public seed: number,
    public changes: Record<string, Tile>,
    public floor = 0,
    public milestone = 0,
  ) {}
  tile(x: number, y: number): Tile {
    if (x < 0 || x >= this.width || y < this.floor) return { kind: "wall" };
    const index = Math.floor(y / CHUNK);
    if (!this.chunks.has(index))
      this.chunks.set(index, generate(this.seed, index));
    return (
      this.changes[point(x, y)] ??
      this.chunks.get(index)!.get(point(x, y)) ?? { kind: "wall" }
    );
  }
  step(x: number, y: number, dx: number, dy: number) {
    let nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= this.width) {
      if (
        this.tile(0, y).kind === "wall" ||
        this.tile(this.width - 1, y).kind === "wall"
      )
        return null;
      nx = (nx + this.width) % this.width;
    }
    if (this.tile(nx, ny).kind === 'oneway' && (dy !== 1 || dx !== 0)) return null;
    return { x: nx, y: ny };
  }
  cross(x: number, y: number) {
    const gate = region(this.seed, this.milestone).gate;
    if (x !== gate.x || y !== gate.y) return false;
    this.changes[point(x, y - 1)] = { kind: 'wall' };
    this.milestone++;
    return true;
  }
  depth(x: number, y: number) { return depthAt(this.seed, x, y, this.milestone); }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
  private torchAreas = new Map<number, Torch[]>();
  get torches(): Torch[] {
    for (let a = this.milestone; a <= this.milestone + 1; a++) if (!this.torchAreas.has(a)) {
      const r = region(this.seed, a);
      this.torchAreas.set(a, placeTorches(r.cells, 1, WIDTH - 2, a * 108, (a + 1) * 108 + 34, this.seed ^ a));
    }
    for (const a of this.torchAreas.keys()) if (a < this.milestone) this.torchAreas.delete(a);
    return [...this.torchAreas.values()].flat();
  }
  breakTorchAt(x: number, y: number): boolean {
    const torch = this.torches.find((t) => t.active && t.x === x && t.y === y);
    if (!torch) return false;
    torch.active = false;
    return true;
  }
  maintain(y: number) {
    const index = Math.floor(y / CHUNK);
    this.tile(START_X, (index + 2) * CHUNK);
    this.floor = Math.max(this.floor, this.milestone * 108);
    for (const i of this.chunks.keys())
      if ((i + 1) * CHUNK <= this.floor || Math.abs(i - index) > 3) this.chunks.delete(i);
    for (const k of Object.keys(this.changes))
      if (Number(k.split(",")[1]) < this.floor) delete this.changes[k];
  }
}
/** A self-contained 17x17 Tower floor. Generation is strategy-first (see
 * src/tower/index.ts): an abstract graph of gates, keys and rewards is
 * planned, then embedded as chambers joined by single-tile doorways.
 * Geometry is always valid; the key/HP economy is deliberately allowed to
 * be harsh or occasionally unwinnable. Deterministic for (seed, room). */
export function generateTowerRoom(
  seed: number,
  room: number,
): Map<string, Tile> {
  return generateTowerFloor(seed, room).cells;
}
const towerTorchCaches = new Map<string, Torch[]>();
/** Torches for one tower room, computed once when that room is first
 * entered this session and cached by seed+room number. */
function torchesForRoom(seed: number, room: number, cells: Map<string, Tile>): Torch[] {
  const key = `${seed}:${room}`;
  let t = towerTorchCaches.get(key);
  if (!t) {
    t = placeTorches(cells, 1, TOWER_WIDTH - 2, 1, TOWER_HEIGHT - 2, seed ^ Math.imul(room + 1, 0x9e3779b1));
    towerTorchCaches.set(key, t);
  }
  return t;
}
export class RoomWorld implements Board {
  rewards: import("./entities.ts").RewardChest[] = [];
  width = TOWER_WIDTH;
  height = TOWER_HEIGHT;
  floor = 0;
  cells: Map<string, Tile>;
  torches: Torch[];
  constructor(
    public seed: number,
    public room: number,
    public changes: Record<string, Tile>,
  ) {
    this.cells = generateTowerRoom(seed, room);
    this.torches = torchesForRoom(seed, room, this.cells);
  }
  breakTorchAt(x: number, y: number): boolean {
    const torch = this.torches.find((t) => t.active && t.x === x && t.y === y);
    if (!torch) return false;
    torch.active = false;
    return true;
  }
  tile(x: number, y: number): Tile {
    if (x < 0 || x >= this.width || y < 0 || y >= TOWER_HEIGHT)
      return { kind: "wall" };
    const changed = this.changes[point(x, y)];
    if (changed) return changed;
    const chest = this.rewards.find(c => c.x === x && c.y === y);
    if (chest) return { kind: "reward", tier: chest.tier };
    return (
      this.cells.get(point(x, y)) ?? {
        kind: "wall",
      }
    );
  }
  step(x: number, y: number, dx: number, dy: number) {
    const nx = x + dx,
      ny = y + dy;
    if (nx < 0 || nx >= this.width || ny < 0 || ny >= TOWER_HEIGHT) return null;
    return { x: nx, y: ny };
  }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
}
