import { TOWER_HEIGHT, TOWER_START_X, TOWER_WIDTH, type EnemyArchetype } from "../config.ts";
import { point, type Tile } from "../entities.ts";
import { getTowerEnemy } from "../scaling.ts";
import type { Gate, Reward, StrategicGraph, StrategicNode, Strength } from "./types.ts";

/** Layer B: express a StrategicGraph on the 17x17 grid.
 *
 * The interior is tiled edge-to-edge by rectangular chambers separated by
 * one-tile walls (a guillotine partition with exactly one chamber per
 * region), so there are no corridors at all: every connection is a single
 * doorway tile in a shared wall, and that tile *is* the gate — an enemy, a
 * lock, or an open gap. A backtracking search assigns regions to chambers so
 * that every graph edge becomes a pair of neighbouring chambers, the main
 * route moves away from the entrance, and the stairs chamber reaches the
 * outer wall. Chamber contents are then arranged in deliberate formations
 * (rows of keys, guarded niches, enemy rings) that keep walking lanes clear
 * between doorways. */

type Rect = { x1: number; y1: number; x2: number; y2: number };
type XY = [number, number];
const DIRS: XY[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const INTERIOR: Rect = { x1: 1, y1: 1, x2: TOWER_WIDTH - 2, y2: TOWER_HEIGHT - 2 };
/** First tile inside the tower, directly below the entrance at (START_X, 0). */
export const ENTRY: XY = [TOWER_START_X, 1];
const MIN_SIDE = 2;

export const EMBED_TUNING = {
  /** Preferred chamber area per footprint. */
  idealArea: { pocket: 6, room: 12, hall: 20 },
  /** Partition attempts per graph before giving up on it. */
  partitionAttempts: 40,
  /** Valid embeddings compared per graph (best size fit wins). */
  candidates: 6,
  /** Backtracking steps per partition. */
  searchSteps: 3000,
  /** Chance a split peels off a thin two-tile pocket instead of halving. */
  pocketSplitChance: 0.3,
  /** Chambers are trimmed to about this many tiles per content item. */
  roomsPerItem: 2.4,
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
export type Doorway = { parent: number; child: number; x: number; y: number; shortcut: boolean };
export type Embedding = {
  /** The graph as actually furnished (niche fallbacks may move rewards). */
  graph: StrategicGraph;
  cells: Map<string, Tile>;
  rects: Rect[];
  /** node id → rect index */
  leafOf: number[];
  doorways: Doorway[];
  stairs: XY;
  placements: Placement[];
  dropped: { node: number; reward: Reward }[];
  shortcutsPlaced: number;
};

const area = (r: Rect) => (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1);
const inRect = (r: Rect, x: number, y: number) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
const minSide = (r: Rect) => Math.min(r.x2 - r.x1 + 1, r.y2 - r.y1 + 1);
const centre = (r: Rect): XY => [(r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2];
const distFromEntrance = (r: Rect) => {
  const [cx, cy] = centre(r);
  return Math.abs(cx - TOWER_START_X) + cy;
};
const touchesExitWall = (r: Rect) => r.x1 === INTERIOR.x1 || r.x2 === INTERIOR.x2 || r.y2 === INTERIOR.y2;

// ---------------------------------------------------------------- partition

function splitRect(r: Rect, vertical: boolean, rng: () => number): [Rect, Rect] | null {
  const len = vertical ? r.x2 - r.x1 + 1 : r.y2 - r.y1 + 1;
  if (len < MIN_SIDE * 2 + 1) return null;
  const lo = MIN_SIDE, hi = len - 1 - MIN_SIDE;
  const options: number[] = [];
  if (rng() < EMBED_TUNING.pocketSplitChance && len >= 7) options.push(rng() < 0.5 ? lo : hi);
  // Two uniforms → a soft bias towards balanced halves.
  options.push(Math.round(lo + ((rng() + rng()) / 2) * (hi - lo)));
  for (let a = lo; a <= hi; a++) options.push(a);
  for (const a of options) {
    const wall = (vertical ? r.x1 : r.y1) + a;
    // Never wall off the tile beneath the entrance.
    if (vertical && wall === ENTRY[0] && r.y1 <= ENTRY[1]) continue;
    return vertical
      ? [{ ...r, x2: wall - 1 }, { ...r, x1: wall + 1 }]
      : [{ ...r, y2: wall - 1 }, { ...r, y1: wall + 1 }];
  }
  return null;
}

function partition(n: number, rng: () => number): Rect[] | null {
  const leaves: Rect[] = [{ ...INTERIOR }];
  while (leaves.length < n) {
    const weights = leaves.map((r) => {
      const w = r.x2 - r.x1 + 1, h = r.y2 - r.y1 + 1;
      return Math.max(w, h) >= MIN_SIDE * 2 + 1 ? area(r) ** 1.6 : 0;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total) return null;
    let roll = rng() * total, idx = 0;
    while ((roll -= weights[idx]) >= 0) idx++;
    const r = leaves[idx];
    const w = r.x2 - r.x1 + 1, h = r.y2 - r.y1 + 1;
    const vertical = w > h * 1.25 ? true : h > w * 1.25 ? false : rng() < 0.5;
    const parts = splitRect(r, vertical, rng) ?? splitRect(r, !vertical, rng);
    if (!parts) return null;
    leaves.splice(idx, 1, ...parts);
  }
  return leaves;
}

type Candidate = { x: number; y: number; a: number; b: number; inA: XY; inB: XY };

function doorwayCandidates(rects: Rect[]) {
  const leafAt = (x: number, y: number) => rects.findIndex((r) => inRect(r, x, y));
  const grid: number[][] = [];
  for (let y = 0; y < TOWER_HEIGHT; y++) {
    grid.push([]);
    for (let x = 0; x < TOWER_WIDTH; x++) grid[y].push(leafAt(x, y));
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= TOWER_WIDTH || y >= TOWER_HEIGHT ? -1 : grid[y][x]);
  const pairs = new Map<string, Candidate[]>();
  const add = (c: Candidate) => {
    const k = c.a < c.b ? `${c.a}-${c.b}` : `${c.b}-${c.a}`;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k)!.push(c);
  };
  for (let y = INTERIOR.y1; y <= INTERIOR.y2; y++)
    for (let x = INTERIOR.x1; x <= INTERIOR.x2; x++) {
      if (grid[y][x] !== -1) continue;
      const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
      if (l >= 0 && r >= 0 && l !== r) add({ x, y, a: l, b: r, inA: [x - 1, y], inB: [x + 1, y] });
      if (u >= 0 && d >= 0 && u !== d) add({ x, y, a: u, b: d, inA: [x, y - 1], inB: [x, y + 1] });
    }
  const between = (a: number, b: number) =>
    (pairs.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? []).map((c) =>
      c.a === a ? c : { ...c, a: c.b, b: c.a, inA: c.inB, inB: c.inA });
  const neighbours = rects.map((_, i) =>
    rects.map((_, j) => j).filter((j) => j !== i && between(i, j).length > 0));
  return { grid, between, neighbours };
}

// ---------------------------------------------------------------- embedding

function need(node: StrategicNode) {
  return 1 + node.rewards.length + node.guarded.length * 2 + (node.ringGuard ? 3 : 0) +
    node.children.length + (node.purpose === "stairs" ? 1 : 0);
}

/** Main route first (so it claims the spine), then branches by tree depth. */
function embedOrder(graph: StrategicGraph): number[] {
  const depthOf = (n: StrategicNode) => {
    let d = 0;
    for (let p = n.parent; p !== null; p = graph.nodes[p].parent) d++;
    return d;
  };
  const main = graph.nodes.filter((n) => n.route === "main").map((n) => n.id);
  const rest = graph.nodes.filter((n) => n.route !== "main")
    .sort((a, b) => depthOf(a) - depthOf(b) || a.id - b.id).map((n) => n.id);
  return [...main, ...rest];
}

function assign(graph: StrategicGraph, rects: Rect[], neighbours: number[][], rng: () => number): number[] | null {
  const order = embedOrder(graph);
  const leafOf: number[] = graph.nodes.map(() => -1);
  const used = new Set<number>();
  const startLeaf = rects.findIndex((r) => inRect(r, ...ENTRY));
  // The start hall is the first thing the player sees: never a sliver.
  if (startLeaf < 0 || area(rects[startLeaf]) < need(graph.nodes[0]) || minSide(rects[startLeaf]) < 3) return null;
  let steps = 0;
  const jitter = graph.nodes.map(() => rects.map(() => rng() * 4));

  const score = (node: StrategicNode, leaf: number) => {
    const r = rects[leaf];
    let s = -Math.abs(area(r) - EMBED_TUNING.idealArea[node.footprint]) * 0.35;
    // Hubs are chambers, not corridors.
    if (node.footprint === "hall" && minSide(r) < 3) s -= 8;
    if (node.route === "main") {
      // The main route should travel away from the entrance.
      s += (distFromEntrance(r) - distFromEntrance(rects[leafOf[node.parent!]])) * 0.8;
      if (node.purpose === "stairs") s += distFromEntrance(r) * 0.6;
    }
    return s + jitter[node.id][leaf];
  };
  const fits = (node: StrategicNode, leaf: number) => {
    const r = rects[leaf];
    if (area(r) < need(node) + (node.footprint === "hall" ? 2 : 0)) return false;
    if (node.purpose === "stairs" && !touchesExitWall(r)) return false;
    // Enough free neighbours left for this region's own children.
    return neighbours[leaf].filter((j) => !used.has(j)).length >= node.children.length;
  };

  const place = (i: number): boolean => {
    if (i === order.length) return true;
    if (++steps > EMBED_TUNING.searchSteps) return false;
    const node = graph.nodes[order[i]];
    const options = node.parent === null
      ? [startLeaf]
      : neighbours[leafOf[node.parent]].filter((j) => !used.has(j));
    const ranked = options.filter((j) => fits(node, j)).sort((a, b) => score(node, b) - score(node, a));
    for (const leaf of ranked) {
      leafOf[node.id] = leaf;
      used.add(leaf);
      if (place(i + 1)) return true;
      used.delete(leaf);
      leafOf[node.id] = -1;
    }
    return false;
  };
  return place(0) ? leafOf : null;
}

// ---------------------------------------------------------------- tiles

const ARCHETYPES_FOR: Record<Strength, EnemyArchetype[]> = {
  weak: ["weak"],
  normal: ["balanced", "glassCannon", "tank"],
  strong: ["brute", "guardian", "tank"],
  elite: ["guardian"],
};
/** Strong and elite enemies are drawn from deeper on the scaling curve. */
const DEPTH_OFFSET: Record<Strength, number> = { weak: 0, normal: 0, strong: 2, elite: 5 };

export function enemyTile(strength: Strength, depth: number, rng: () => number): Tile {
  const types = ARCHETYPES_FOR[strength];
  const archetype = types[Math.floor(rng() * types.length)];
  return { kind: "enemy", enemy: getTowerEnemy(depth + DEPTH_OFFSET[strength], rng, archetype) };
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

type Room = {
  node: StrategicNode;
  rect: Rect;
  entry: XY;
  /** Unit vector pointing into the room from its entrance doorway. */
  inward: XY;
  exits: XY[];
};

class Furnisher {
  occupied = new Set<string>();
  protectedCells = new Set<string>();
  placements: Placement[] = [];
  dropped: Embedding["dropped"] = [];
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
  connected(room: Room) {
    const all = this.walkable(room);
    const seen = new Set([point(...room.entry)]);
    const queue: XY[] = [room.entry];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = point(nx, ny);
        if (seen.has(k) || !inRect(room.rect, nx, ny) || this.cells.get(k)?.kind === "wall") continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
    return seen.size === all.length;
  }
  /** Keep a clear walking lane from the entrance to every other doorway. */
  reserveLanes(room: Room) {
    this.protectedCells.add(point(...room.entry));
    for (const exit of room.exits) {
      const prev = new Map<string, string | null>([[point(...room.entry), null]]);
      const queue: XY[] = [room.entry];
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i];
        if (x === exit[0] && y === exit[1]) break;
        // Prefer moving along the room's inward axis first: straighter lanes.
        const dirs = [...DIRS].sort((a, b) =>
          Math.abs(b[0] * room.inward[0] + b[1] * room.inward[1]) - Math.abs(a[0] * room.inward[0] + a[1] * room.inward[1]));
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy, k = point(nx, ny);
          if (prev.has(k) || !inRect(room.rect, nx, ny) || !this.isFloor(nx, ny)) continue;
          prev.set(k, point(x, y));
          queue.push([nx, ny]);
        }
      }
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
    let best: { c: XY; guards: XY[]; s: number } | null = null;
    for (const [x, y] of this.walkable(room)) {
      if (!this.free(room, x, y)) continue;
      const guards: XY[] = [];
      let ok = true;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (this.isWall(nx, ny)) continue;
        // Any other open side (a doorway, an item, a lane) would be a way
        // around the guards.
        if (!this.free(room, nx, ny)) { ok = false; break; }
        guards.push([nx, ny]);
      }
      if (!ok || !guards.length || guards.length > 3) continue;
      const s = this.depthOf(room, x, y) * 2 - this.axisOffset(room, x, y) + guards.length + this.rng();
      if (!best || s > best.s) best = { c: [x, y], guards, s };
    }
    if (!best) return; // falls back to a plain row placement
    this.put(room, ...best.c, rewardTile(node.rewards.shift()!, this.rng), "reward");
    for (const g of best.guards) this.put(room, ...g, enemyTile(node.ringGuard, this.depth, this.rng), "ring");
  }

  /** A one-tile niche in the room's wall: item inside, guard in front,
   * side cells walled so the guard is the only way in. */
  niche(room: Room, reward: Reward, guard: Strength, prefer?: XY): XY | null {
    let best: { n: XY; f: XY; sides: XY[]; s: number } | null = null;
    for (const [x, y] of this.walkable(room)) {
      if (!this.free(room, x, y)) continue;
      for (const [dx, dy] of DIRS) {
        // (dx,dy) points from the niche into the room; behind it must be
        // solid wall (not a doorway), and each side either wall or a free
        // room tile that we can wall up.
        if (inRect(room.rect, x - dx, y - dy) || !this.isWall(x - dx, y - dy)) continue;
        const f: XY = [x + dx, y + dy];
        if (!this.free(room, ...f)) continue;
        const sides: XY[] = [[x + dy, y + dx], [x - dy, y - dx]];
        if (sides.some(([sx, sy]) => !this.isWall(sx, sy) && !this.free(room, sx, sy))) continue;
        let s = this.depthOf(room, x, y) + this.rng() * 2;
        if (dx === -room.inward[0] && dy === -room.inward[1]) s += 3; // back wall
        if (prefer && prefer[0] === x && prefer[1] === y) s += 8;      // mirrored pair
        if (!best || s > best.s) best = { n: [x, y], f, sides, s };
      }
    }
    if (!best) return null;
    const walled = best.sides.filter(([sx, sy]) => !this.isWall(sx, sy));
    for (const s of walled) this.cells.set(point(...s), { kind: "wall" });
    if (!this.connected(room)) {
      for (const s of walled) this.cells.set(point(...s), { kind: "floor" });
      return null;
    }
    this.put(room, ...best.n, rewardTile(reward, this.rng), "reward");
    this.put(room, ...best.f, enemyTile(guard, this.depth, this.rng), "guard");
    return best.n;
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
    if (empty().length < 8 || empty().length / total < EMBED_TUNING.pillarEmptyFraction) return;
    let budget = Math.floor(empty().length / 7);
    // Pillars stand free of every wall so they never seal a corner or
    // narrow a doorway; each one is mirrored for an authored look.
    const standsFree = ([x, y]: XY) => {
      if (!this.free(room, x, y)) return false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (!inRect(room.rect, x + dx, y + dy) || this.isWall(x + dx, y + dy)) return false;
      return true;
    };
    const shuffled = empty().map((c) => ({ c, r: this.rng() })).sort((a, b) => a.r - b.r).map((o) => o.c);
    for (const [x, y] of shuffled) {
      if (budget <= 0) break;
      if (!standsFree([x, y])) continue;
      const m = this.mirror(room, x, y);
      const pair: XY[] = m[0] === x && m[1] === y ? [[x, y]] : standsFree(m) ? [[x, y], m] : [];
      if (!pair.length) continue;
      for (const p of pair) this.cells.set(point(...p), { kind: "wall" });
      if (!this.connected(room)) {
        for (const p of pair) this.cells.set(point(...p), { kind: "floor" });
        continue;
      }
      budget -= pair.length;
    }
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

// ---------------------------------------------------------------- driver

/** Attempts to embed `graph`. Returns null only when no partition could
 * host the graph; the caller then simplifies the graph and retries. */
export function embed(graph: StrategicGraph, rng: () => number): Embedding | null {
  // Several partitions usually host the graph; keep the one whose chamber
  // sizes best match what each region holds (less dead space to trim away).
  let best: { fit: number; result: Embedding } | null = null;
  let found = 0;
  for (let attempt = 0; attempt < EMBED_TUNING.partitionAttempts && found < EMBED_TUNING.candidates; attempt++) {
    const rects = partition(graph.nodes.length, rng);
    if (!rects) continue;
    const { between, neighbours } = doorwayCandidates(rects);
    const leafOf = assign(graph, rects, neighbours, rng);
    if (!leafOf) continue;
    const fit = graph.nodes.reduce((s, n) => {
      const r = rects[leafOf[n.id]];
      return s + Math.abs(area(r) - targetArea(n)) + (n.footprint === "hall" && minSide(r) < 3 ? 10 : 0);
    }, 0);
    if (best && fit >= best.fit) { found++; continue; }
    const result = build(graph, rects, leafOf, between, rng);
    if (!result) continue;
    found++;
    best = { fit, result };
  }
  return best?.result ?? null;
}

function targetArea(node: StrategicNode) {
  return Math.max(EMBED_TUNING.idealArea[node.footprint], need(node) * EMBED_TUNING.roomsPerItem);
}

function build(
  graph: StrategicGraph,
  rects: Rect[],
  leafOf: number[],
  between: (a: number, b: number) => Candidate[],
  rng: () => number,
): Embedding | null {
  // Work on a copy: furnishing mutates reward lists (niche fallbacks).
  graph = structuredClone(graph);
  const cells = new Map<string, Tile>();
  for (let y = 0; y < TOWER_HEIGHT; y++)
    for (let x = 0; x < TOWER_WIDTH; x++)
      cells.set(point(x, y), rects.some((r) => inRect(r, x, y)) ? { kind: "floor" } : { kind: "wall" });

  const doorTiles: XY[] = [];
  const doorways: Doorway[] = [];
  const entryOf = new Map<number, { entry: XY; inward: XY }>();
  const exitsOf = new Map<number, XY[]>(graph.nodes.map((n) => [n.id, []]));
  entryOf.set(0, { entry: ENTRY, inward: [0, 1] });

  const chooseDoorway = (a: number, b: number) => {
    const near = (c: Candidate, d: number) => doorTiles.some(([x, y]) => Math.abs(x - c.x) + Math.abs(y - c.y) <= d);
    const options = between(leafOf[a], leafOf[b]).filter((c) => !near(c, 1));
    if (!options.length) return null;
    // Centred doorways read as authored; a little jitter keeps variety.
    const mid = options.reduce((s, c) => [s[0] + c.x / options.length, s[1] + c.y / options.length], [0, 0]);
    const score = (c: Candidate) =>
      Math.abs(c.x - mid[0]) + Math.abs(c.y - mid[1]) + rng() * 1.5 +
      (c.inA[0] === ENTRY[0] && c.inA[1] === ENTRY[1] ? 3 : 0) + (near(c, 2) ? 4 : 0);
    return options.sort((p, q) => score(p) - score(q))[0];
  };

  for (const node of graph.nodes) {
    if (node.parent === null) continue;
    const c = chooseDoorway(node.parent, node.id);
    if (!c) return null;
    doorTiles.push([c.x, c.y]);
    cells.set(point(c.x, c.y), gateTile(node.gate, graph.depth, rng));
    doorways.push({ parent: node.parent, child: node.id, x: c.x, y: c.y, shortcut: false });
    exitsOf.get(node.parent)!.push(c.inA);
    entryOf.set(node.id, { entry: c.inB, inward: [c.inB[0] - c.x, c.inB[1] - c.y] });
  }

  // Shortcuts: realise each request between the requested regions, or any
  // other pair of main-route chambers that happen to touch.
  let shortcutsPlaced = 0;
  for (const req of graph.shortcuts) {
    const main = graph.nodes.filter((n) => n.route === "main");
    const pairs: [number, number][] = [[req.from, req.to]];
    for (const u of main) for (const v of main) if (u.id < v.id) pairs.push([u.id, v.id]);
    for (const [u, v] of pairs) {
      if (graph.nodes[v].parent === u || graph.nodes[u].parent === v) continue;
      const c = chooseDoorway(u, v);
      if (!c) continue;
      doorTiles.push([c.x, c.y]);
      cells.set(point(c.x, c.y), gateTile(req.gate, graph.depth, rng));
      doorways.push({ parent: u, child: v, x: c.x, y: c.y, shortcut: true });
      exitsOf.get(u)!.push(c.inA);
      exitsOf.get(v)!.push(c.inB);
      shortcutsPlaced++;
      break;
    }
  }

  // Stairs: in the outer wall, far from the entrance, centred on the
  // stairs chamber's outer side.
  const stairsNode = graph.nodes.find((n) => n.purpose === "stairs")!;
  const sr = rects[leafOf[stairsNode.id]];
  const stairOptions: { ring: XY; inner: XY; s: number }[] = [];
  const consider = (ring: XY, inner: XY, offset: number) => {
    const clash = doorTiles.some(([x, y]) => Math.abs(x - inner[0]) + Math.abs(y - inner[1]) <= 1);
    stairOptions.push({
      ring, inner,
      s: Math.abs(ring[0] - TOWER_START_X) + ring[1] - offset * 0.7 - (clash ? 6 : 0) + rng() * 2,
    });
  };
  if (sr.x1 === INTERIOR.x1) for (let y = sr.y1; y <= sr.y2; y++) consider([0, y], [1, y], Math.abs(y - (sr.y1 + sr.y2) / 2));
  if (sr.x2 === INTERIOR.x2) for (let y = sr.y1; y <= sr.y2; y++) consider([TOWER_WIDTH - 1, y], [INTERIOR.x2, y], Math.abs(y - (sr.y1 + sr.y2) / 2));
  if (sr.y2 === INTERIOR.y2) for (let x = sr.x1; x <= sr.x2; x++) consider([x, TOWER_HEIGHT - 1], [x, INTERIOR.y2], Math.abs(x - (sr.x1 + sr.x2) / 2));
  if (!stairOptions.length) return null;
  const stairs = stairOptions.sort((a, b) => b.s - a.s)[0];
  cells.set(point(...stairs.ring), { kind: "stairs" });
  exitsOf.get(stairsNode.id)!.push(stairs.inner);

  // Trim oversized chambers down towards what their content needs, cutting
  // whole rows/columns that hold no doorway so walls stay straight. This is
  // what keeps a two-item pocket from becoming a 40-tile empty hall.
  rects = rects.map((r) => ({ ...r }));
  for (const node of graph.nodes) {
    const r = rects[leafOf[node.id]];
    const anchors = [entryOf.get(node.id)!.entry, ...exitsOf.get(node.id)!];
    const target = targetArea(node);
    while (area(r) > target * 1.2) {
      const w = r.x2 - r.x1 + 1, h = r.y2 - r.y1 + 1;
      const sides = ([
        ["y1", h, (x: number, y: number) => y === r.y1],
        ["y2", h, (x: number, y: number) => y === r.y2],
        ["x1", w, (x: number, y: number) => x === r.x1],
        ["x2", w, (x: number, y: number) => x === r.x2],
      ] as const).filter(([, len, on]) => len > MIN_SIDE && !anchors.some(([x, y]) => on(x, y)));
      if (!sides.length) break;
      // Cut across the longer dimension first so rooms tend towards squares.
      const [side] = sides.sort((a, b) => b[1] - a[1] + (rng() - 0.5) * 0.1)[0];
      const line: XY[] = [];
      for (let y = r.y1; y <= r.y2; y++)
        for (let x = r.x1; x <= r.x2; x++)
          if ((side === "y1" && y === r.y1) || (side === "y2" && y === r.y2) ||
            (side === "x1" && x === r.x1) || (side === "x2" && x === r.x2)) line.push([x, y]);
      for (const c of line) cells.set(point(...c), { kind: "wall" });
      r[side] += side.endsWith("1") ? 1 : -1;
    }
  }

  const f = new Furnisher(cells, graph.depth, rng);
  // Furnish reward rooms before hubs so hub pillars never crowd a doorway.
  const order = [...graph.nodes].sort((a, b) => (a.route === "main" ? 1 : 0) - (b.route === "main" ? 1 : 0));
  for (const node of order) {
    const { entry, inward } = entryOf.get(node.id)!;
    f.furnish({ node, rect: rects[leafOf[node.id]], entry, inward, exits: exitsOf.get(node.id)! });
  }

  return {
    graph, cells, rects, leafOf, doorways, stairs: stairs.ring,
    placements: f.placements, dropped: f.dropped, shortcutsPlaced,
  };
}
