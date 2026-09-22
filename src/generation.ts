import { sculptRoom } from "./room-shapes.ts";
import {
  CHUNK,
  WIDTH,
  START_X,
  TOWER_WIDTH,
  TOWER_START_X,
  UNGUARDED_LOOT_CHANCE,
  type KeyColor,
  DELVE_MAX_DEPTH,
} from "./config.ts";
import { point, type Tile } from "./entities.ts";
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
};
export const LAYOUT_VERSION = 5;
export const TOWER_LAYOUT_VERSION = 1;
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

export function carvePath(cells: Map<string, Tile>, pointFn: (x: number, y: number) => string, x1: number, y1: number, x2: number, y2: number, rng: () => number) {
  let cx = x1, cy = y1;
  while(cx !== x2 || cy !== y2) {
    cells.set(pointFn(cx, cy), { kind: 'floor' });
    if (cx === x2) { cy += Math.sign(y2 - cy); continue; }
    if (cy === y2) { cx += Math.sign(x2 - cx); continue; }
    if (rng() < 0.5) cx += Math.sign(x2 - cx); else cy += Math.sign(y2 - cy);
  }
  cells.set(pointFn(x2, y2), { kind: 'floor' });
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
      if (!closed.has(k) || !keys[t.color!]) return false;
      const [x, y] = k.split(",").map(Number);
      return directions.some(([dx, dy]) =>
        area.has(point((x + dx + WIDTH) % WIDTH, y + dy)),
      );
    });
    if (!next) return false;
    keys[next[1].color!]--;
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

const delveCaches = new Map<number, Map<string, Tile>>();

export function generateDelveMap(seed: number): Map<string, Tile> {
  const rng = random(seed);
  const cells = new Map<string, Tile>();
  const set = (x: number, y: number, t: Tile) => cells.set(point(x, y), t);
  const floor = (x: number, y: number) => set(x, y, { kind: "floor" });
  for (let y = 0; y < DELVE_MAX_DEPTH; y++)
    for (let x = 0; x < WIDTH; x++) set(x, y, { kind: "wall" });

  floor(START_X, 0);

  const rooms = bspRooms(1, 1, WIDTH - 2, DELVE_MAX_DEPTH - 2, rng, 4);
  const edges: {x: number, y: number}[] = [];
  
  for (let r of rooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        floor(xx, yy);
      }
    }
  }

  // We connect rooms by finding neighbors and carving
  // Simple heuristic: connect each room to one below it
  rooms.sort((a, b) => a.y - b.y);
  for (let i = 0; i < rooms.length - 1; i++) {
    const r1 = rooms[i];
    const r2 = rooms[i + 1];
    carvePath(cells, point, Math.floor(r1.x + r1.w / 2), Math.floor(r1.y + r1.h / 2), Math.floor(r2.x + r2.w / 2), Math.floor(r2.y + r2.h / 2), rng);
  }

  // Oneway passages every ~40 tiles
  for (let y = 40; y < DELVE_MAX_DEPTH; y += 40) {
    // Find a floor tile at this y
    let floorX = -1;
    for (let x = 1; x < WIDTH - 1; x++) {
      if (cells.get(point(x, y))?.kind === 'floor') {
        floorX = x;
        break;
      }
    }
    if (floorX !== -1) {
      set(floorX, y, { kind: "oneway" });
      // block other paths at this y
      for (let x = 1; x < WIDTH - 1; x++) {
        if (x !== floorX) set(x, y, { kind: "wall" });
      }
      // ensure path above and below
      floor(floorX, y - 1);
      floor(floorX, y + 1);
    }
  }

  // Place enemies and loot in rooms
  for (let room of rooms) {
    const height = room.y;
    if (height < 2) continue; // skip entrance
    const tier = Math.min(3, Math.floor(height / 35));
    const names = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];
    const cx = Math.floor(room.x + room.w / 2);
    const cy = Math.floor(room.y + room.h / 2);
    if (rng() < 0.3) {
      set(cx, cy, {
        kind: "enemy",
        enemy: {
          name: names[tier],
          hp: 12 + tier * 16 + Math.floor(height * 0.5),
          attack: 6 + tier * 4 + Math.floor(height / 12),
          defense: 1 + tier * 2,
          tier,
        }
      });
    } else if (rng() < 0.2) {
      set(cx, cy, { kind: "potion", color: rng() < 0.5 ? "red" : "blue" });
    } else if (rng() < 0.1) {
      set(cx, cy, { kind: "treasure" });
    }
  }

  return cells;
}

export function generate(seed: number, index: number): Map<string, Tile> {
  let fullMap = delveCaches.get(seed);
  if (!fullMap) {
    fullMap = generateDelveMap(seed);
    delveCaches.set(seed, fullMap);
  }
  const chunk = new Map<string, Tile>();
  for (let y = index * CHUNK; y < (index + 1) * CHUNK; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const t = fullMap.get(point(x, y));
      if (t) chunk.set(point(x, y), t);
    }
  }
  return chunk;
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
    return { x: nx, y: ny };
  }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
  maintain(y: number) {
    const index = Math.floor(y / CHUNK);
    this.tile(START_X, (index + 2) * CHUNK);
    this.floor = Math.max(this.floor, (index - 3) * CHUNK);
    for (const i of this.chunks.keys())
      if (i * CHUNK < this.floor) this.chunks.delete(i);
    for (const k of Object.keys(this.changes))
      if (Number(k.split(",")[1]) < this.floor) delete this.changes[k];
  }
}
/** A single self-contained 20x20 challenge room: no locks or keys, one
 * guardian at the entrance, scattered enemies/loot scaled by room number,
 * and one exit stairway. Coordinates are local (no chunk offset). */
export function generateTowerRoom(
  seed: number,
  room: number,
): Map<string, Tile> {
  const rng = random(seed ^ Math.imul(room + 1, 2654435761));
  const int = (lo: number, hi: number) =>
    lo + Math.floor(rng() * (hi - lo + 1));
  const cells = new Map<string, Tile>();
  const set = (x: number, y: number, t: Tile) => cells.set(point(x, y), t);
  const floor = (x: number, y: number) => set(x, y, { kind: "floor" });
  for (let y = 0; y < CHUNK; y++)
    for (let x = 0; x < TOWER_WIDTH; x++) set(x, y, { kind: "wall" });
  const bounds = { x1: 1, x2: TOWER_WIDTH - 2, y1: 1, y2: CHUNK - 2 };
  for (let y = bounds.y1; y <= bounds.y2; y++)
    for (let x = bounds.x1; x <= bounds.x2; x++) floor(x, y);
  const entrance: [number, number] = [TOWER_START_X, 0];
  // Room 0 opens onto the forest; every later room keeps a way back down.
  set(...entrance, room > 0 ? { kind: "stairsDown" } : { kind: "floor" });
  const reserved = new Set([point(...entrance), point(TOWER_START_X, 1)]);
  function tier(): number {
    return Math.min(3, Math.floor(room / 5));
  }
  function towerEnemy(tough = false): Tile {
    const t = tier();
    const names = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];
    return {
      kind: "enemy",
      enemy: {
        name: names[t],
        hp: tough
          ? 12 + t * 16 + Math.floor(room * 1.6)
          : 8 + t * 10 + Math.floor(room * 1.1),
        attack: tough
          ? 6 + t * 4 + Math.floor(room / 3)
          : 4 + t * 3 + Math.floor(room / 4),
        defense: tough ? 1 + t * 2 : t,
        tier: t,
      },
    };
  }
  
  const rooms = bspRooms(bounds.x1, bounds.y1, bounds.x2 - bounds.x1 + 1, bounds.y2 - bounds.y1 + 1, rng, 4);
  for (let r of rooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        floor(xx, yy);
      }
    }
  }
  for (let i = 0; i < rooms.length - 1; i++) {
    const r1 = rooms[i];
    const r2 = rooms[i + 1];
    const cx1 = Math.floor(r1.x + r1.w / 2);
    const cy1 = Math.floor(r1.y + r1.h / 2);
    const cx2 = Math.floor(r2.x + r2.w / 2);
    const cy2 = Math.floor(r2.y + r2.h / 2);
    carvePath(cells, point, cx1, cy1, cx2, cy2, rng);
  }
  carvePath(cells, point, TOWER_START_X, 1, Math.floor(rooms[0].x + rooms[0].w / 2), Math.floor(rooms[0].y + rooms[0].h / 2), rng);

  // Placed after sculpting so the guardian's cell still reads as floor for
  // sculptRoom's own connectivity check (it doesn't treat enemies as passable).
  set(TOWER_START_X, 1, towerEnemy());
  function place(tile: Tile) {
    const candidates: [number, number][] = [];
    for (let y = bounds.y1; y <= bounds.y2; y++)
      for (let x = bounds.x1; x <= bounds.x2; x++)
        if (!reserved.has(point(x, y)) && cells.get(point(x, y))?.kind === "floor")
          candidates.push([x, y]);
    if (!candidates.length) throw new Error("Tower room has no free positions");
    const [x, y] = candidates[int(0, candidates.length - 1)];
    set(x, y, tile);
    reserved.add(point(x, y));
    return [x, y] as [number, number];
  }
  const enemyCount = Math.min(6, 2 + Math.floor(room / 4));
  for (let i = 0; i < enemyCount; i++) place(towerEnemy(true));
  place({ kind: "potion", color: "blue" });
  place({ kind: "potion", color: "red" });
  place({ kind: "attack" });
  place({ kind: "defense" });
  if (room % 3 === 0) place({ kind: "treasure" });
  const exit = place({ kind: "stairs" });
  const blockers = new Set(
    [...cells]
      .filter(([, t]) => t.kind === "enemy")
      .map(([k]) => k),
  );
  const free = reachable(cells, point(...entrance), blockers);
  for (const k of free)
    if (cells.get(k)?.kind === "floor") {
      const loot = rollUnguardedLoot(rng);
      if (loot) cells.set(k, loot);
    }
  if (!reachable(cells, point(...entrance)).has(point(...exit)))
    throw new Error("Invalid tower room topology");
  return cells;
}
export class RoomWorld implements Board {
  rewards: import("./entities.ts").RewardChest[] = [];
  width = TOWER_WIDTH;
  floor = 0;
  cells: Map<string, Tile>;
  constructor(
    public seed: number,
    public room: number,
    public changes: Record<string, Tile>,
  ) {
    this.cells = generateTowerRoom(seed, room);
  }
  tile(x: number, y: number): Tile {
    if (x < 0 || x >= this.width || y < 0 || y >= CHUNK)
      return { kind: "wall" };
    const chest = this.rewards.find(c => c.x === x && c.y === y);
    if (chest) return { kind: "reward", tier: chest.tier };
    return (
      this.changes[point(x, y)] ?? this.cells.get(point(x, y)) ?? {
        kind: "wall",
      }
    );
  }
  step(x: number, y: number, dx: number, dy: number) {
    const nx = x + dx,
      ny = y + dy;
    if (nx < 0 || nx >= this.width || ny < 0 || ny >= CHUNK) return null;
    return { x: nx, y: ny };
  }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
}
