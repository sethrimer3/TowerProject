import { validatePhysicalLayout } from "./validation.ts";
import {
  CHUNK,
  WIDTH,
  START_X,
  TOWER_WIDTH,
  TOWER_START_X,
  UNGUARDED_LOOT_CHANCE,
  TOWER_SCALING,
  type KeyColor,
  DELVE_MAX_DEPTH,
} from "./config.ts";
import { point, type Tile, type Torch, type Player } from "./entities.ts";
import { computeVisibilityPolygon, LIGHTING_CONFIG } from "./lighting.ts";
import { getTowerEnemy } from "./scaling.ts";
import { generatePuzzleGraph } from "./puzzle.ts";
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
/** Places torches on walkable floor tiles that sit next to a wall (never on
 * a wall tile itself), at roughly the same density/spacing the old purely
 * decorative wall pattern used, then caches each torch's visibility
 * polygon up front so rendering never recomputes it per frame. */
function placeTorches(
  cells: Map<string, Tile>,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): Torch[] {
  const isWall = (x: number, y: number) =>
    (cells.get(point(x, y))?.kind ?? "wall") === "wall";
  const torches: Torch[] = [];
  const taken = new Set<string>();
  for (let y = yMin; y <= yMax; y++)
    for (let x = xMin; x <= xMax; x++) {
      if (x % 6 !== 0 || y % 7 !== 3) continue;
      const candidates: [number, number][] = [
        [x, y], [x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1],
      ];
      for (const [cx, cy] of candidates) {
        const key = point(cx, cy);
        if (taken.has(key) || cx < xMin || cx > xMax || cy < yMin || cy > yMax) continue;
        if (cells.get(key)?.kind !== "floor") continue;
        const adjWall =
          isWall(cx + 1, cy) || isWall(cx - 1, cy) || isWall(cx, cy + 1) || isWall(cx, cy - 1);
        if (!adjWall) continue;
        taken.add(key);
        torches.push({
          x: cx,
          y: cy,
          lightRadius: LIGHTING_CONFIG.torch.defaultRadius,
          baseIntensity: LIGHTING_CONFIG.torch.defaultIntensity,
          active: true,
        });
        break;
      }
    }
  for (const torch of torches)
    torch.visibilityPolygon = computeVisibilityPolygon(torch, isWall);
  return torches;
}
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
const delveTorchCaches = new Map<number, Torch[]>();

export function generateDelveMap(seed: number): Map<string, Tile> {
  const rng = random(seed);
  const cells = new Map<string, Tile>();
  const set = (x: number, y: number, t: Tile) => cells.set(point(x, y), t);
  const floor = (x: number, y: number) => set(x, y, { kind: "floor" });
  for (let y = 0; y < DELVE_MAX_DEPTH; y++)
    for (let x = 0; x < WIDTH; x++) set(x, y, { kind: "wall" });

  floor(START_X, 0);

  const rooms = bspRooms(1, 1, WIDTH - 2, DELVE_MAX_DEPTH - 2, rng, 4);

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
  if (rooms.length)
    carvePath(cells, point, START_X, 0, Math.floor(rooms[0].x + rooms[0].w / 2), Math.floor(rooms[0].y + rooms[0].h / 2), rng);
  for (let i = 0; i < rooms.length - 1; i++) {
    const r1 = rooms[i];
    const r2 = rooms[i + 1];
    carvePath(cells, point, Math.floor(r1.x + r1.w / 2), Math.floor(r1.y + r1.h / 2), Math.floor(r2.x + r2.w / 2), Math.floor(r2.y + r2.h / 2), rng);
  }

  // Occasional wraparound openings link the west and east edges directly,
  // carved outward from existing floor so they never disconnect anything.
  for (let y = 3; y < DELVE_MAX_DEPTH - 3; y += 17) {
    if (rng() >= 0.6) continue;
    let minX = -1, maxX = -1;
    for (let x = 1; x < WIDTH - 1; x++)
      if (cells.get(point(x, y))?.kind === "floor") {
        if (minX === -1) minX = x;
        maxX = x;
      }
    if (minX === -1) continue;
    for (let x = 0; x <= minX; x++) floor(x, y);
    for (let x = maxX; x < WIDTH; x++) floor(x, y);
  }

  // Oneway passages every ~40 tiles. Rooms are at most 8 tall, so a chosen
  // row can still fall inside a room's own rectangle; walling the rest of
  // that row would bisect the room into a top and bottom half connected
  // only at the choke column, stranding whichever half's own corridor entry
  // isn't there. Skip any row a room's body overlaps (a corridor-only row's
  // one floor tile is always the real connecting spine); the single
  // whole-map reachability pass below prunes anything this still manages
  // to strand, rather than re-flooding the whole map at every checkpoint.
  for (let y = 40; y < DELVE_MAX_DEPTH; y += 40) {
    if (rooms.some(r => r.y <= y && y < r.y + r.h)) continue;
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

  // Prune any floor left structurally unreachable from the entrance (a rare
  // BSP/corridor edge case) back to wall, so the map is always exactly one
  // connected component — never a silent island of dead, inaccessible space.
  const liveFloor = reachable(cells, point(START_X, 0));
  for (const [k, t] of cells)
    if (t.kind !== "wall" && !liveFloor.has(k)) set(...(k.split(",").map(Number) as [number, number]), { kind: "wall" });

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
    delveTorchCaches.set(seed, placeTorches(fullMap, 1, WIDTH - 2, 0, DELVE_MAX_DEPTH - 2));
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
/** Torches for a delve seed, computed once (on first generation of that
 * seed) and cached for the process lifetime. */
export function torchesForSeed(seed: number): Torch[] {
  if (!delveTorchCaches.has(seed)) generate(seed, 0);
  return delveTorchCaches.get(seed) ?? [];
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
  get torches(): Torch[] {
    return torchesForSeed(this.seed);
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
    this.floor = Math.max(this.floor, (index - 3) * CHUNK);
    for (const i of this.chunks.keys())
      if (i * CHUNK < this.floor) this.chunks.delete(i);
    for (const k of Object.keys(this.changes))
      if (Number(k.split(",")[1]) < this.floor) delete this.changes[k];
  }
}
/** A conservative "kept pace with the climb" player used only to prove a
 * generated room is solvable: attack/defense comfortably clear this room's
 * own polynomial enemy scaling (including the toughest archetype
 * multipliers), so the check verifies topology, key ordering and pickup
 * accounting rather than fine combat balance — that's a separate, live
 * tuning concern the player's real upgrades and gear handle at runtime. */
function nominalTowerPlayer(room: number): Player {
  const attack = Math.ceil(TOWER_SCALING.defense(room) * 1.4) + 6;
  const defense = Math.ceil(TOWER_SCALING.attack(room) * 0.5);
  const hp = Math.ceil(TOWER_SCALING.hp(room) * 5) + 300;
  return { x: 0, y: 0, hp, maxHp: hp, attack, defense, keys: { yellow: 0, blue: 0, red: 0 } };
}
/** One attempt at a self-contained 20x20 challenge room. BSP-carved rooms
 * are assigned, in order, to the abstract puzzle graph's main-path nodes
 * (see puzzle.ts): each inter-room corridor becomes one gate (an enemy or a
 * locked door) placed at the corridor's own midpoint, a genuine choke point
 * since these rooms are otherwise only reachable through that one carved
 * path. A door's key is always placed in an earlier room on that same path.
 * Returns null (never throws) when either the structural choke-point check
 * or the full state-space solvability check fails, so the caller can retry
 * with a new derived seed. */
function tryGenerateTowerRoom(derivedSeed: number, room: number): Map<string, Tile> | null {
  const rng = random(derivedSeed);
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

  const rooms = bspRooms(bounds.x1, bounds.y1, bounds.x2 - bounds.x1 + 1, bounds.y2 - bounds.y1 + 1, rng, 4);
  if (rooms.length < 2) return null;
  for (const r of rooms)
    for (let yy = r.y; yy < r.y + r.h; yy++)
      for (let xx = r.x; xx < r.x + r.w; xx++) floor(xx, yy);
  const centerOf = (r: { x: number; y: number; w: number; h: number }): [number, number] =>
    [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];

  // Entrance guardian: an immediate, unavoidable first fight before the
  // graph-mapped rooms begin.
  set(TOWER_START_X, 1, { kind: "enemy", enemy: getTowerEnemy(room, rng, "balanced") });
  carvePath(cells, point, TOWER_START_X, 1, ...centerOf(rooms[0]), rng);

  // Map the abstract puzzle graph's mandatory route onto the BSP rooms in
  // generation order: one main-path edge per inter-room corridor.
  const graph = generatePuzzleGraph(derivedSeed, room);
  // Only door gates need a strict structural choke-point check below: a
  // locked door consumes a finite key, so a bypass would trivialize it.
  // Enemy gates stay topologically soft by design (reachable()'s flood fill
  // already treats enemies as passable — combat difficulty, not physical
  // blocking, is what makes them a gate), so an alternate route around one
  // is not a validation failure.
  const doorGatePositions: [number, number][] = [];
  const edgeCount = Math.min(graph.mainPath.length, rooms.length - 1);
  for (let i = 0; i < rooms.length - 1; i++) {
    const path = carvePath(cells, point, ...centerOf(rooms[i]), ...centerOf(rooms[i + 1]), rng);
    if (i >= edgeCount || path.length < 3) continue;
    const edge = graph.mainPath[i];
    const [gx, gy] = path[Math.floor(path.length / 2)];
    if (edge.gate === "enemy" && edge.enemy) {
      set(gx, gy, { kind: "enemy", enemy: edge.enemy });
    } else if (edge.gate === "door" && edge.doorColor) {
      set(gx, gy, { kind: "door", color: edge.doorColor });
      doorGatePositions.push([gx, gy]);
      // The key always lives in an earlier room on the mandatory path (or
      // the entrance room itself), so it is reachable before this door.
      const keyRoom = rooms[i];
      const kx = int(keyRoom.x, keyRoom.x + keyRoom.w - 1),
        ky = int(keyRoom.y, keyRoom.y + keyRoom.h - 1),
        kp = point(kx, ky);
      if (!reserved.has(kp) && cells.get(kp)?.kind === "floor") {
        set(kx, ky, { kind: "key", color: edge.doorColor });
        reserved.add(kp);
      }
    }
  }
  // The exit always sits in the final room on the mapped path, so it is
  // provably behind every gate placed above rather than reachable by
  // whatever BSP room happened to be picked at random.
  const exitRoom = rooms[rooms.length - 1];
  function placeIn(room_: { x: number; y: number; w: number; h: number }, tile: Tile) {
    const candidates: [number, number][] = [];
    for (let y = room_.y; y < room_.y + room_.h; y++)
      for (let x = room_.x; x < room_.x + room_.w; x++)
        if (!reserved.has(point(x, y)) && cells.get(point(x, y))?.kind === "floor")
          candidates.push([x, y]);
    if (!candidates.length) return null;
    const [x, y] = candidates[int(0, candidates.length - 1)];
    set(x, y, tile);
    reserved.add(point(x, y));
    return [x, y] as [number, number];
  }
  const exit = placeIn(exitRoom, { kind: "stairs" });
  if (!exit) return null;

  function place(tile: Tile) {
    const candidates: [number, number][] = [];
    for (let y = bounds.y1; y <= bounds.y2; y++)
      for (let x = bounds.x1; x <= bounds.x2; x++)
        if (!reserved.has(point(x, y)) && cells.get(point(x, y))?.kind === "floor")
          candidates.push([x, y]);
    if (!candidates.length) return null;
    const [x, y] = candidates[int(0, candidates.length - 1)];
    set(x, y, tile);
    reserved.add(point(x, y));
    return [x, y] as [number, number];
  }
  const enemyCount = Math.min(6, 2 + Math.floor(room / 4));
  for (let i = 0; i < enemyCount; i++)
    place({ kind: "enemy", enemy: getTowerEnemy(room, rng, "brute") });
  // Optional reward branches from the graph become extra guarded pickups —
  // genuine resource competition (an extra fight for an extra stat point)
  // even though they share the room's open floor rather than a separately
  // carved dead-end alcove.
  for (const n of graph.nodes)
    if (n.type === "reward" && n.reward !== "key") {
      const guard = graph.nodes.flatMap(p => p.edges).find(e => e.target === n.id)?.enemy;
      if (guard) place({ kind: "enemy", enemy: guard });
      place({ kind: n.reward === "attack" ? "attack" : "defense" });
    }
  place({ kind: "potion", color: "blue" });
  place({ kind: "potion", color: "red" });
  place({ kind: "attack" });
  place({ kind: "defense" });
  if (room % 3 === 0) place({ kind: "treasure" });

  const blockers = new Set([...cells].filter(([, t]) => t.kind === "enemy").map(([k]) => k));
  const free = reachable(cells, point(...entrance), blockers);
  for (const k of free)
    if (cells.get(k)?.kind === "floor") {
      const loot = rollUnguardedLoot(rng);
      if (loot) cells.set(k, loot);
    }

  const fullReach = reachable(cells, point(...entrance));
  if (!fullReach.has(point(...exit))) return null;
  // Every door must be a real structural cut point: blocking it must
  // disconnect floor space beyond it, or the BSP carving accidentally left
  // a bypass that would let a player reach the far side without its key.
  for (const [gx, gy] of doorGatePositions)
    if (reachable(cells, point(...entrance), new Set([point(gx, gy)])).size >= fullReach.size - 1)
      return null;
  if (!validatePhysicalLayout(cells, entrance[0], entrance[1], exit[0], exit[1], nominalTowerPlayer(room)))
    return null;
  return cells;
}
/** A self-contained 20x20 challenge room whose logical progression (the
 * puzzle graph) is guaranteed solvable and whose physical layout is
 * validated before it is ever handed to the player. Retries with
 * deterministic derived seeds — never Math.random() — on any invalid
 * attempt, and fails loudly rather than silently serving a broken room. */
export function generateTowerRoom(
  seed: number,
  room: number,
): Map<string, Tile> {
  const MAX_ATTEMPTS = 40;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const derivedSeed =
      seed ^ Math.imul(room + 1, 2654435761) ^ Math.imul(attempt + 1, 40503);
    const result = tryGenerateTowerRoom(derivedSeed, room);
    if (result) return result;
  }
  throw new Error(
    `Tower room ${room} failed to generate a valid layout after ${MAX_ATTEMPTS} attempts`,
  );
}
const towerTorchCaches = new Map<string, Torch[]>();
/** Torches for one tower room, computed once when that room is first
 * entered this session and cached by seed+room number. */
function torchesForRoom(seed: number, room: number, cells: Map<string, Tile>): Torch[] {
  const key = `${seed}:${room}`;
  let t = towerTorchCaches.get(key);
  if (!t) {
    t = placeTorches(cells, 1, TOWER_WIDTH - 2, 1, CHUNK - 2);
    towerTorchCaches.set(key, t);
  }
  return t;
}
export class RoomWorld implements Board {
  rewards: import("./entities.ts").RewardChest[] = [];
  width = TOWER_WIDTH;
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
