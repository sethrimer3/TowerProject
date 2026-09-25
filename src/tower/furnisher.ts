import { point, type Tile } from "../entities.ts";
import { getTowerEnemy, type TowerEnemyProfile } from "../scaling.ts";
import type { Gate, Reward, StrategicNode, Strength } from "./types.ts";
import { centre, DIRS, inRect, type Rect, type XY } from "./grid.ts";

/** Arranges each chamber's contents once embedder.ts has laid out the
 * floor: walking lanes kept clear between doorways, then deliberate
 * formations (an enemy ring round a centrepiece, guarded niches in mirrored
 * pairs, rows of keys from the back wall inwards) and mirrored pillars in
 * large empty halls. Also turns gates and rewards into tiles. */

export const FURNISH_TUNING = {
  /** A hall with more empty tiles than this fraction gets pillars. */
  pillarEmptyFraction: 0.45,
};

export type Placement = {
  node: number;
  x: number;
  y: number;
  role: "reward" | "guard" | "ring" | "stairsGuard";
  tile: Tile;
};
/** Rewards that found no place in their chamber. */
export type Dropped = { node: number; reward: Reward }[];

// ---------------------------------------------------------------- tiles

const PROFILES_FOR: Record<Strength, TowerEnemyProfile[]> = {
  weak: ["balanced"],
  normal: ["attackHeavy", "balanced", "defenseHeavy"],
  strong: ["attackHeavy", "defenseHeavy"],
  elite: ["defenseHeavy"],
};

export function enemyTile(strength: Strength, depth: number, rng: () => number): Tile {
  const profiles = PROFILES_FOR[strength];
  const profile = profiles[Math.floor(rng() * profiles.length)];
  return { kind: "enemy", enemy: getTowerEnemy(depth, rng, profile) };
}

export function gateTile(gate: Gate, depth: number, rng: () => number): Tile {
  switch (gate.kind) {
    case "open": return { kind: "floor" };
    case "enemy": return enemyTile(gate.strength, depth, rng);
    case "door": return { kind: "door", color: gate.color, door: { type: "keys", keys: [gate.color], mode: "all" } };
    case "steel": return { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" } };
    case "heart": return { kind: "door", door: { type: "fullHp" } };
  }
}

export function rewardTile(r: Reward, rng: () => number): Tile {
  if (r.kind === "key") return { kind: "key", color: r.color };
  if (r.kind === "potion") return { kind: "potion", color: rng() < 0.5 ? "red" : "blue" };
  return { kind: r.kind };
}

// ---------------------------------------------------------------- furnishing

export type Room = {
  node: StrategicNode;
  rect: Rect;
  entry: XY;
  /** Unit vector pointing into the room from its entrance doorway. */
  inward: XY;
  exits: XY[];
};

/** A candidate niche: the item's tile, the guard's tile in front of it,
 * the side tiles to wall up, the direction into the room, and its score. */
type Niche = { n: XY; f: XY; sides: XY[]; dir: XY; s: number };

/** Niches in the back wall score higher, and most of all the mirror image
 * of the previous niche, so guarded pairs look deliberate. */
function nicheScore(room: Room, { n, dir }: Niche, base: number, prefer?: XY) {
  let s = base;
  if (sameXY(dir, [-room.inward[0], -room.inward[1]])) s += 3;
  if (prefer && sameXY(prefer, n)) s += 8;
  return s;
}

const sameXY = (a: XY, b: XY) => a[0] === b[0] && a[1] === b[1];

export class Furnisher {
  occupied = new Set<string>();
  protectedCells = new Set<string>();
  placements: Placement[] = [];
  dropped: Dropped = [];
  constructor(public cells: Map<string, Tile>, public depth: number, public rng: () => number) {}

  isFloor(x: number, y: number) {
    return this.cells.get(point(x, y))?.kind === "floor";
  }
  isWall(x: number, y: number) {
    return (this.cells.get(point(x, y))?.kind ?? "wall") === "wall";
  }
  put(room: Room, x: number, y: number, tile: Tile, role: Placement["role"]) {
    this.cells.set(point(x, y), tile);
    this.occupied.add(point(x, y));
    this.placements.push({ node: room.node.id, x, y, role, tile });
  }
  free(room: Room, x: number, y: number) {
    const k = point(x, y);
    return inRect(room.rect, x, y) && this.isFloor(x, y) && !this.occupied.has(k) && !this.protectedCells.has(k);
  }
  /** Walkable cells of the room (items and enemies count as walkable). */
  walkable(room: Room) {
    const out: XY[] = [];
    for (let y = room.rect.y1; y <= room.rect.y2; y++)
      for (let x = room.rect.x1; x <= room.rect.x2; x++)
        if (this.cells.get(point(x, y))?.kind !== "wall") out.push([x, y]);
    return out;
  }
  /** Whether every walkable tile of the room is reachable from its entrance. */
  connected(room: Room) {
    const all = this.walkable(room);
    return this.search(room, DIRS, (x, y) => !this.isWall(x, y)).size === all.length;
  }

  /** Breadth-first search inside the room from its entrance over tiles
   * where `open` holds, trying `dirs` in order, until it dequeues `goal`.
   * Returns each reached tile's predecessor. */
  private search(room: Room, dirs: XY[], open: (x: number, y: number) => boolean, goal?: XY) {
    const prev = new Map<string, string | null>([[point(...room.entry), null]]);
    const queue: XY[] = [room.entry];
    const enterable = ([x, y]: XY) => !prev.has(point(x, y)) && inRect(room.rect, x, y) && open(x, y);
    for (let i = 0; i < queue.length && !(goal && sameXY(queue[i], goal)); i++) {
      const [x, y] = queue[i];
      for (const next of dirs.map(([dx, dy]): XY => [x + dx, y + dy]).filter(enterable)) {
        prev.set(point(...next), point(x, y));
        queue.push(next);
      }
    }
    return prev;
  }
  /** Keep a clear walking lane from the entrance to every other doorway. */
  reserveLanes(room: Room) {
    this.protectedCells.add(point(...room.entry));
    // Prefer moving along the room's inward axis first: straighter lanes.
    const along = ([dx, dy]: XY) => Math.abs(dx * room.inward[0] + dy * room.inward[1]);
    const dirs = [...DIRS].sort((a, b) => along(b) - along(a));
    for (const exit of room.exits) {
      const prev = this.search(room, dirs, (x, y) => this.isFloor(x, y), exit);
      for (let k: string | null | undefined = point(...exit); k; k = prev.get(k)) this.protectedCells.add(k);
    }
  }

  /** Signed distance along the inward axis and offset from the room's
   * mirror axis — used to lay items out in rows, back wall first. */
  depthOf(room: Room, x: number, y: number) {
    return (x - room.entry[0]) * room.inward[0] + (y - room.entry[1]) * room.inward[1];
  }
  axisOffset(room: Room, x: number, y: number) {
    const [cx, cy] = centre(room.rect);
    return room.inward[0] === 0 ? Math.abs(x - cx) : Math.abs(y - cy);
  }
  mirror(room: Room, x: number, y: number): XY {
    return room.inward[0] === 0 ? [room.rect.x1 + room.rect.x2 - x, y] : [x, room.rect.y1 + room.rect.y2 - y];
  }

  /** PATTERN 10: a centrepiece with enemies on every open side. */
  ring(room: Room) {
    const node = room.node;
    if (!node.ringGuard || !node.rewards.length) return;
    const best = this.ringSpot(room);
    if (!best) return; // falls back to a plain row placement
    this.put(room, ...best.c, rewardTile(node.rewards.shift()!, this.rng), "reward");
    for (const g of best.guards) this.put(room, ...g, enemyTile(node.ringGuard, this.depth, this.rng), "ring");
  }

  /** The best centrepiece for a ring: deep in the room, on its mirror axis. */
  private ringSpot(room: Room) {
    let best: { c: XY; guards: XY[]; s: number } | null = null;
    for (const [x, y] of this.walkable(room)) {
      const guards = this.free(room, x, y) ? this.ringGuards(room, x, y) : null;
      if (!guards) continue;
      const s = this.depthOf(room, x, y) * 2 - this.axisOffset(room, x, y) + guards.length + this.rng();
      if (!best || s > best.s) best = { c: [x, y], guards, s };
    }
    return best;
  }

  /** The guard spots around a centrepiece at (x, y): every open side, one
   * to three of them, or null when an open side can't hold a guard (a
   * doorway, an item or a lane would be a way around them). */
  private ringGuards(room: Room, x: number, y: number): XY[] | null {
    const open = DIRS.map(([dx, dy]): XY => [x + dx, y + dy]).filter(([nx, ny]) => !this.isWall(nx, ny));
    const guardable = open.length >= 1 && open.length <= 3;
    return guardable && open.every(([nx, ny]) => this.free(room, nx, ny)) ? open : null;
  }

  /** A one-tile niche in the room's wall: item inside, guard in front,
   * side cells walled so the guard is the only way in. */
  niche(room: Room, reward: Reward, guard: Strength, prefer?: XY): XY | null {
    const best = this.bestNiche(room, prefer);
    if (!best) return null;
    if (!this.wallUp(room, best.sides.filter(([sx, sy]) => !this.isWall(sx, sy)))) return null;
    this.put(room, ...best.n, rewardTile(reward, this.rng), "reward");
    this.put(room, ...best.f, enemyTile(guard, this.depth, this.rng), "guard");
    return best.n;
  }

  private bestNiche(room: Room, prefer?: XY) {
    let best: Niche | null = null;
    for (const [x, y] of this.walkable(room).filter(([x, y]) => this.free(room, x, y)))
      for (const dir of DIRS) {
        const n = this.nicheAt(room, [x, y], dir);
        if (!n) continue;
        n.s = nicheScore(room, n, this.depthOf(room, x, y) + this.rng() * 2, prefer);
        if (!best || n.s > best.s) best = n;
      }
    return best;
  }

  /** A niche at `n` opening into the room along `dir`, or null when it
   * can't be one: behind it must be solid wall (not a doorway), in front a
   * free tile for the guard, and each side either wall or a free room tile
   * that can be walled up. */
  private nicheAt(room: Room, [x, y]: XY, [dx, dy]: XY): Niche | null {
    if (inRect(room.rect, x - dx, y - dy) || !this.isWall(x - dx, y - dy)) return null;
    const f: XY = [x + dx, y + dy];
    if (!this.free(room, ...f)) return null;
    const sides: XY[] = [[x + dy, y + dx], [x - dy, y - dx]];
    if (sides.some(([sx, sy]) => !this.isWall(sx, sy) && !this.free(room, sx, sy))) return null;
    return { n: [x, y], f, sides, dir: [dx, dy], s: 0 };
  }

  /** Open items: `row` fills from the back wall inwards, centred on the
   * mirror axis (K K K); `cluster` gathers around the room centre. */
  items(room: Room) {
    const node = room.node;
    const [cx, cy] = centre(room.rect);
    for (const reward of node.rewards) {
      let options = this.walkable(room).filter(([x, y]) => this.free(room, x, y));
      // A cramped room may put an item on its walking lane (it is simply
      // picked up in passing) but never on a doorway's threshold.
      if (!options.length)
        options = this.walkable(room).filter(([x, y]) =>
          this.isFloor(x, y) && !this.occupied.has(point(x, y)) &&
          ![room.entry, ...room.exits].some(([ex, ey]) => ex === x && ey === y));
      if (!options.length) { this.dropped.push({ node: node.id, reward }); continue; }
      const key = ([x, y]: XY) => node.formation === "cluster"
        ? -(Math.abs(x - cx) + Math.abs(y - cy))
        : this.depthOf(room, x, y) * 10 - this.axisOffset(room, x, y);
      options.sort((a, b) => key(b) - key(a));
      this.put(room, ...options[0], rewardTile(reward, this.rng), "reward");
    }
  }

  /** Break up large empty halls with mirrored pillars so the space reads
   * as a deliberate chamber rather than an empty rectangle. */
  pillars(room: Room) {
    const empty = () => this.walkable(room).filter(([x, y]) => this.free(room, x, y));
    const total = this.walkable(room).length;
    if (empty().length < 8 || empty().length / total < FURNISH_TUNING.pillarEmptyFraction) return;
    let budget = Math.floor(empty().length / 7);
    const shuffled = empty().map((c) => ({ c, r: this.rng() })).sort((a, b) => a.r - b.r).map((o) => o.c);
    for (const c of shuffled) {
      if (budget <= 0) break;
      const pair = this.pillarPair(room, c);
      if (pair.length && this.wallUp(room, pair)) budget -= pair.length;
    }
  }

  /** A pillar at `c` and its mirror image (one tile on the mirror axis),
   * or none. Pillars stand free of every wall so they never seal a corner
   * or narrow a doorway; each one is mirrored for an authored look. */
  private pillarPair(room: Room, c: XY): XY[] {
    if (!this.standsFree(room, c)) return [];
    const m = this.mirror(room, ...c);
    if (m[0] === c[0] && m[1] === c[1]) return [c];
    return this.standsFree(room, m) ? [c, m] : [];
  }

  private standsFree(room: Room, [x, y]: XY) {
    if (!this.free(room, x, y)) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (!this.isRoomFloorOrItem(room, x + dx, y + dy)) return false;
    return true;
  }

  private isRoomFloorOrItem(room: Room, x: number, y: number) {
    return inRect(room.rect, x, y) && !this.isWall(x, y);
  }

  /** Walls up `tiles` unless that would cut the room in two. */
  private wallUp(room: Room, tiles: XY[]) {
    for (const p of tiles) this.cells.set(point(...p), { kind: "wall" });
    if (this.connected(room)) return true;
    for (const p of tiles) this.cells.set(point(...p), { kind: "floor" });
    return false;
  }

  furnish(room: Room) {
    const node = room.node;
    this.reserveLanes(room);
    if (node.stairsGuard && room.exits.length) {
      const s = room.exits[room.exits.length - 1];
      this.put(room, ...s, enemyTile(node.stairsGuard, this.depth, this.rng), "stairsGuard");
    }
    this.ring(room);
    let last: XY | null = null;
    for (const g of node.guarded) {
      const at = this.niche(room, g.reward, g.guard, last ? this.mirror(room, ...last) : undefined);
      if (at) last = at;
      else node.rewards.push(g.reward); // no niche fits: leave it in the open
    }
    this.items(room);
    if (node.footprint === "hall" || node.purpose === "start") this.pillars(room);
  }
}
