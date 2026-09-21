import { sculptRoom } from "./room-shapes.ts";
import {
  CHUNK,
  WIDTH,
  START_X,
  TOWER_WIDTH,
  TOWER_START_X,
  UNGUARDED_LOOT_CHANCE,
  type KeyColor,
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
export function generate(seed: number, index: number): Map<string, Tile> {
  const rng = random(seed ^ Math.imul(index + 1, 2654435761));
  const int = (lo: number, hi: number) =>
    lo + Math.floor(rng() * (hi - lo + 1));
  const base = index * CHUNK,
    cells = new Map<string, Tile>();
  const set = (x: number, y: number, t: Tile) =>
    cells.set(point(x, y + base), t);
  const floor = (x: number, y: number) => set(x, y, { kind: "floor" });
  for (let y = 0; y < CHUNK; y++)
    for (let x = 0; x < WIDTH; x++) set(x, y, { kind: "wall" });
  const rooms: Room[] = [];
  const bands = [
    [1, 5],
    [8, 12],
    [15, 18],
  ];
  const columns = [
    [1, 9],
    [12, 19],
    [22, 28],
  ];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const [a, b] = columns[col],
        [c, d] = bands[row];
      const room = {
        id: row * 3 + col,
        col,
        row,
        x1: a + int(0, 1),
        x2: b - int(0, 1),
        y1: c,
        y2: d,
      };
      rooms.push(room);
      for (let y = room.y1; y <= room.y2; y++)
        for (let x = room.x1; x <= room.x2; x++) floor(x, y);
      // Clipped corners make alcoves without interfering with centered doorways.
      if (rng() < 0.55) {
        set(room.x1, room.y1, { kind: "wall" });
        set(room.x2, room.y2, { kind: "wall" });
      }
    }
  floor(START_X, 0);
  floor(START_X, CHUNK - 1);
  const reserved = new Set([
    point(START_X, 0),
    point(START_X, 1),
    point(START_X, CHUNK - 2),
    point(START_X, CHUNK - 1),
  ]);
  const reserve = (x: number, y: number) => reserved.add(point(x, y));
  const edges: {
    parent: Room;
    child: Room;
    door: [number, number];
    locked: boolean;
    color: KeyColor;
  }[] = [];
  // Build the ascent first. Optional branches may never reconnect to it,
  // so their locked entrances remain genuine cut points.
  const visited = new Set<number>([1, 4, 7]);
  for (let y = 0; y < CHUNK; y++) reserve(START_X, y);
  function link(parent: Room, child: Room, main = false) {
    let door: [number, number];
    if (parent.row === child.row && Math.abs(parent.col - child.col) === 2) {
      const left = parent.col === 0 ? parent : child,
        right = parent.col === 2 ? parent : child;
      const y = int(left.y1 + 1, left.y2 - 1);
      for (let x = 0; x <= left.x1; x++) {
        floor(x, y);
        reserve(x, y);
      }
      for (let x = right.x2; x < WIDTH; x++) {
        floor(x, y);
        reserve(x, y);
      }
      door = [0, y];
    } else if (parent.row === child.row) {
      const left = parent.col < child.col ? parent : child;
      const right = left === parent ? child : parent;
      const y =
        parent.id === 1 || child.id === 1 ? 4 : int(left.y1 + 1, left.y2 - 1);
      for (let x = left.x2; x <= right.x1; x++) {
        floor(x, y);
        reserve(x, y);
      }
      door = [left.x2 + 1, y];
    } else {
      const lower = parent.row < child.row ? parent : child;
      const upper = lower === parent ? child : parent;
      const x = main
        ? START_X
        : int(
            Math.max(lower.x1, upper.x1) + 1,
            Math.min(lower.x2, upper.x2) - 1,
          );
      for (let y = lower.y2; y <= upper.y1; y++) {
        floor(x, y);
        reserve(x, y);
      }
      door = [x, lower.y2 + 1];
    }
    const color: KeyColor = main
      ? parent.row === 0
        ? "yellow"
        : "blue"
      : (["yellow", "blue", "red"] as const)[int(0, 2)];
    edges.push({ parent, child, door, locked: main || rng() < 0.8, color });
  }
  link(rooms[1], rooms[4], true);
  link(rooms[4], rooms[7], true);
  // Grow branches from a randomized frontier, leaving varied side chains
  // while guaranteeing that all three central chambers connect upward.
  while (visited.size < rooms.length) {
    const frontier = rooms
      .filter((r) => visited.has(r.id))
      .flatMap((parent) =>
        rooms
          .filter(
            (r) =>
              !visited.has(r.id) &&
              (Math.abs(r.col - parent.col) + Math.abs(r.row - parent.row) ===
                1 ||
                (r.row === parent.row && Math.abs(r.col - parent.col) === 2)),
          )
          .map((child) => ({ parent, child })),
      );
    const { parent, child } = frontier[int(0, frontier.length - 1)];
    link(parent, child);
    visited.add(child.id);
  }
  for (const room of rooms) {
    if (room.id !== 1) sculptRoom(cells, room, base, rng, reserved);
  }
  // A small entrance vestibule leads through exactly one guardian into the
  // first chamber. No essential key is a free pickup or depends on a rare roll.
  const entranceRoom = rooms[1];
  for (let x = entranceRoom.x1; x <= entranceRoom.x2; x++) {
    floor(x, 1);
    set(x, 2, { kind: "wall" });
    floor(x, 3);
    reserve(x, 1);
    reserve(x, 2);
  }
  floor(START_X, 2);
  function enemy(height: number): Tile {
    const tier = Math.min(3, Math.floor(height / 35));
    return {
      kind: "enemy",
      enemy: {
        name: ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"][
          tier
        ],
        hp: 10 + tier * 12 + Math.floor(height * 0.25),
        attack: 5 + tier * 3 + Math.floor(height / 16),
        defense: tier,
        tier,
      },
    };
  }
  set(START_X, 2, enemy(base));
  function place(room: Room, tile: Tile) {
    const candidates: [number, number][] = [];
    for (let y = room.y1; y <= room.y2; y++)
      for (let x = room.x1; x <= room.x2; x++)
        if (
          !reserved.has(point(x, y)) &&
          cells.get(point(x, y + base))?.kind === "floor"
        )
          candidates.push([x, y]);
    if (!candidates.length) throw new Error("Room has no free item positions");
    const [x, y] = candidates[int(0, candidates.length - 1)];
    set(x, y, tile);
    reserve(x, y);
  }
  for (const edge of edges)
    if (edge.locked) {
      set(...edge.door, { kind: "door", color: edge.color });
      if (edge.parent.col === 1 && edge.child.col === 1) {
        // Placed after the parent guardian, before its lock; never behind itself.
        set(START_X, edge.parent.y1 + 2, { kind: "key", color: edge.color });
      } else place(edge.parent, { kind: "key", color: edge.color });
    } else set(...edge.door, enemy(base + edge.parent.y1));
  for (const room of rooms) {
    const height = base + room.y1,
      tier = Math.min(3, Math.floor(height / 35));
    const names = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];
    // Room roles make rewards intentional rather than sprinkling every item everywhere.
    const role = (room.id + int(0, 3)) % 4;
    if (room.id !== 1 || index > 0)
      place(room, {
        kind: "enemy",
        enemy: {
          name: names[tier],
          hp: 12 + tier * 16 + Math.floor(height * 0.5),
          attack: 6 + tier * 4 + Math.floor(height / 12),
          defense: 1 + tier * 2,
          tier,
        },
      });
    if (role === 0) {
      place(room, { kind: "potion" });
      place(room, { kind: "potion" });
    }
    if (role === 1) {
      place(room, { kind: "attack" });
      place(room, { kind: "defense" });
    }
    if (role === 2) place(room, { kind: "treasure" });
    if (role === 3) {
      place(room, { kind: "potion" });
      place(room, { kind: rng() < 0.5 ? "attack" : "defense" });
    }
  }
  set(START_X, 0, { kind: "stairs" });
  set(START_X, CHUNK - 1, { kind: "stairs" });
  // One deterministic 1/1000 roll per genuinely unguarded floor tile.
  // "Equipment" includes stat gear pickups and treasure, which improves the loadout.
  const blockers = new Set(
    [...cells]
      .filter(([, t]) => t.kind === "door" || t.kind === "enemy")
      .map(([k]) => k),
  );
  const free = reachable(cells, point(START_X, base), blockers);
  for (const k of free)
    if (cells.get(k)?.kind === "floor") {
      const loot = rollUnguardedLoot(rng);
      if (loot) cells.set(k, loot);
    }
  if (!validate(cells, base))
    throw new Error("Invalid tower room topology or key progression");
  return cells;
}
/** A successful space roll selects one key or equipment pickup, not one roll per item type. */
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
  floor(...entrance);
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
  sculptRoom(cells, bounds, 0, rng, reserved);
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
  place({ kind: "potion" });
  place({ kind: "potion" });
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
