import { region, depthAt, areasBetween, floorFor, ownerAt } from "./delve/labyrinth.ts";
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
export function chooseTorchSpots(cells: Map<string, Tile>, area: TorchArea): [number, number][] {
  const kind: KindAt = (x, y) => cells.get(point(x, y))?.kind ?? "wall";
  let open = 0;
  const candidates: TorchSpot[] = [];
  for (let y = area.yMin; y <= area.yMax; y++)
    for (let x = area.xMin; x <= area.xMax; x++) {
      if (kind(x, y) === "wall") continue;
      open++;
      const score = cornerScore(kind, x, y, area.seed);
      if (score !== null) candidates.push({ x, y, score });
    }
  candidates.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  return spaced(candidates, Math.max(1, Math.round(open / TORCH_PLACEMENT.openTilesPerTorch)));
}

/** The window (inclusive) torches go in, and the seed for their jitter. */
export type TorchArea = { xMin: number; xMax: number; yMin: number; yMax: number; seed: number };
type KindAt = (x: number, y: number) => Tile["kind"];
type TorchSpot = { x: number; y: number; score: number };
const BUSY = new Set<Tile["kind"]>(["door", "stairs", "stairsDown", "oneway"]);

/** How good a torch spot (x, y) is, or null when it can't take one: plain
 * floor in a snug corner with nothing busy beside it. */
function cornerScore(kind: KindAt, x: number, y: number, seed: number): number | null {
  if (kind(x, y) !== "floor" || !snugCorner(kind, x, y)) return null;
  if (directions.some(([dx, dy]) => BUSY.has(kind(x + dx, y + dy)))) return null;
  // Smaller spaces read cozier with a torch: count open tiles nearby.
  let nearby = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (kind(x + dx, y + dy) !== "wall") nearby++;
  return 1 - nearby / 49 + tileRandom(x, y, seed ^ 0x70c4) * TORCH_PLACEMENT.jitter;
}

/** An L-shaped corner: a wall on exactly one vertical and one horizontal
 * side, with the diagonal across the corner open. */
function snugCorner(kind: KindAt, x: number, y: number) {
  const wall = (dx: number, dy: number) => kind(x + dx, y + dy) === "wall";
  const n = wall(0, 1), s = wall(0, -1), e = wall(1, 0), w = wall(-1, 0);
  if (n === s || e === w) return false;
  return !wall(e ? -1 : 1, n ? -1 : 1);
}

/** The best `want` spots, taken greedily at least the minimum spacing apart. */
function spaced(candidates: TorchSpot[], want: number) {
  const picked: [number, number][] = [];
  const crowded = (c: TorchSpot) => picked.some(([px, py]) => Math.hypot(px - c.x, py - c.y) < TORCH_PLACEMENT.minSpacing);
  for (const c of candidates) {
    if (picked.length >= want) break;
    if (!crowded(c)) picked.push([c.x, c.y]);
  }
  return picked;
}

/** Places torches (see chooseTorchSpots), then caches each torch's
 * visibility polygon up front so rendering never recomputes it per frame. */
function placeTorches(cells: Map<string, Tile>, area: TorchArea): Torch[] {
  const isWall = (x: number, y: number) =>
    (cells.get(point(x, y))?.kind ?? "wall") === "wall";
  const torches: Torch[] = chooseTorchSpots(cells, area).map(([x, y]) => ({
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
export const LAYOUT_VERSION = 7;
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
export function validate(cells: Map<string, Tile>, base: number) {
  const entrance = point(START_X, base);
  const all = reachable(cells, entrance);
  if (!all.has(point(START_X, base + CHUNK - 1))) return false;
  if ([...cells].some(([k, t]) => t.kind !== "wall" && !all.has(k))) return false;
  const locks = [...cells].filter(([, t]) => t.kind === "door");
  // Removing any one door must disconnect floor beyond it, even with all others open.
  if (locks.some(([key]) => reachable(cells, entrance, new Set([key])).size >= all.size - 1)) return false;
  return unlocksInTurn(cells, entrance, locks, all.size);
}

/** Opens the doors one at a time with the keys found so far, each one that
 * the reachable area touches and the keys pay for; true when every door
 * opens and the whole chunk (`size` tiles) is reached. */
function unlocksInTurn(cells: Map<string, Tile>, entrance: string, locks: [string, Tile][], size: number) {
  const closed = new Set(locks.map(([k]) => k)), collected = new Set<string>();
  const keys: Record<KeyColor, number> = { yellow: 0, blue: 0, red: 0 };
  const cost = (t: Tile) => doorCost(t, { keys, hp: 1, maxHp: 1 });
  for (let step = 0; step <= locks.length; step++) {
    const area = reachable(cells, entrance, closed);
    pickUpKeys(cells, area, collected, keys);
    if (!closed.size) return area.size === size;
    const next = locks.find(([k, t]) => closed.has(k) && cost(t) !== null && touches(area, k));
    if (!next) return false;
    for (const color of cost(next[1])!) keys[color]--;
    closed.delete(next[0]);
  }
  return false;
}

/** Counts each key in `area` not collected before. */
function pickUpKeys(cells: Map<string, Tile>, area: Set<string>, collected: Set<string>, keys: Record<KeyColor, number>) {
  for (const k of area) {
    const t = cells.get(k)!;
    if (t.kind !== "key" || collected.has(k)) continue;
    keys[t.color!]++;
    collected.add(k);
  }
}

/** Whether tile `k` borders `area`, wrapping round the Delve's sides. */
function touches(area: Set<string>, k: string) {
  const [x, y] = k.split(",").map(Number);
  return directions.some(([dx, dy]) => area.has(point((x + dx + WIDTH) % WIDTH, y + dy)));
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
  for (const a of areasBetween(min, max))
    for (const [k, t] of region(seed, a).cells) {
      const y = Number(k.split(',')[1]);
      if (y >= min && y < max) cells.set(k, t);
    }
  return cells;
}
export function torchesForSeed(seed: number): Torch[] {
  return placeTorches(generateDelveMap(seed, 1), { xMin: 1, xMax: WIDTH - 2, yMin: 0, yMax: 140, seed });
}

export function rollUnguardedLoot(rng: () => number): Tile | null {
  if (rng() >= UNGUARDED_LOOT_CHANCE) return null;
  const choice = Math.floor(rng() * 6);
  if (choice < 3)
    return { kind: "key", color: (["yellow", "blue", "red"] as const)[choice] };
  return { kind: (["attack", "defense", "treasure"] as const)[choice - 3] };
}
/** Puts out the lit torch standing on (x, y); false when there is none. */
function breakTorch(torches: Torch[], x: number, y: number) {
  const torch = torches.find((t) => t.active && t.x === x && t.y === y);
  if (!torch) return false;
  torch.active = false;
  return true;
}

/** A one-way gate only lets the player step up through it. */
const upward = (dx: number, dy: number) => dx === 0 && dy === 1;

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
    if (!this.inside(x, y)) return { kind: "wall" };
    const index = Math.floor(y / CHUNK);
    if (!this.chunks.has(index))
      this.chunks.set(index, generate(this.seed, index));
    return (
      this.changes[point(x, y)] ??
      this.chunks.get(index)!.get(point(x, y)) ?? { kind: "wall" }
    );
  }
  /** On the board and at or above the floor. */
  private inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= this.floor;
  }
  step(x: number, y: number, dx: number, dy: number) {
    let nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= this.width) {
      if (!this.wraps(y)) return null;
      nx = (nx + this.width) % this.width;
    }
    if (this.tile(nx, ny).kind === "oneway" && !upward(dx, dy)) return null;
    return { x: nx, y: ny };
  }
  /** Row `y` opens on both edges, so walking off one side comes back on
   * the other. */
  private wraps(y: number) {
    return this.tile(0, y).kind !== "wall" && this.tile(this.width - 1, y).kind !== "wall";
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
  /** The torches of the current area and the next, placed once each. */
  get torches(): Torch[] {
    for (let a = this.milestone; a <= this.milestone + 1; a++)
      if (!this.torchAreas.has(a)) this.torchAreas.set(a, this.areaTorches(a));
    for (const a of this.torchAreas.keys()) if (a < this.milestone) this.torchAreas.delete(a);
    return [...this.torchAreas.values()].flat();
  }
  /** Wall checks see neighbouring areas too, so a torch never lands on a
   * foreign area's floor; each torch belongs to the area owning its spot. */
  private areaTorches(a: number) {
    const r = region(this.seed, a), cells = new Map(r.cells);
    for (const b of [a - 1, a + 1]) if (b >= 0) for (const [k, t] of region(this.seed, b).cells) cells.set(k, t);
    return placeTorches(cells, { xMin: 1, xMax: WIDTH - 2, yMin: r.minY - 2, yMax: r.maxY + 2, seed: this.seed ^ a })
      .filter((t) => ownerAt(this.seed, t.x, t.y) === a);
  }
  breakTorchAt(x: number, y: number): boolean {
    return breakTorch(this.torches, x, y);
  }
  maintain(y: number) {
    const index = Math.floor(y / CHUNK);
    this.tile(START_X, (index + 2) * CHUNK);
    this.floor = Math.max(this.floor, floorFor(this.seed, this.milestone));
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
    t = placeTorches(cells, { xMin: 1, xMax: TOWER_WIDTH - 2, yMin: 1, yMax: TOWER_HEIGHT - 2, seed: seed ^ Math.imul(room + 1, 0x9e3779b1) });
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
    return breakTorch(this.torches, x, y);
  }
  /** On the 17x17 board. */
  private inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= 0 && y < TOWER_HEIGHT;
  }
  tile(x: number, y: number): Tile {
    if (!this.inside(x, y)) return { kind: "wall" };
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
    return this.inside(nx, ny) ? { x: nx, y: ny } : null;
  }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
}
