import { point, type Enemy, type EnemyStrength, type Kind, type Point, type Tile } from "./entities.ts";
import type { CardId } from "./cards.ts";
import type { RunBadge } from "./badges.ts";
import { random } from "./random.ts";

// More Enemies (a card badge, badges.ts): a last stage after a floor is
// generated that adds copies of its enemies, so the hero has more to fight
// and more loot to win. Runs without the badge never come here, so their
// floors, saved maps and goldens are unchanged. Everything it decides comes
// from its own stream, seeded by the run seed and the floor, so a floor
// comes out the same whenever it is rebuilt (reload, undo, climbing back).

/** The strengths a floor can hold more of (a Greater Boss is summoned, never generated). */
export type ExtraStrength = Exclude<EnemyStrength, "greaterBoss">;
/** The order the strengths are rolled and placed in. */
export const EXTRA_ORDER: readonly ExtraStrength[] = ["weak", "normal", "strong", "elite", "boss"];
/** The percent more of each strength a floor holds. */
export type ExtraEnemies = Partial<Record<ExtraStrength, number>>;

export const hasExtras = (e: ExtraEnemies | undefined): e is ExtraEnemies => !!e && EXTRA_ORDER.some((s) => (e[s] ?? 0) > 0);
/** A cache key for `e`. */
export const extrasKey = (e: ExtraEnemies) => EXTRA_ORDER.map((s) => e[s] ?? 0).join(",");

/** Whether the hero walks on (or through) a tile of this kind. */
const walkable = (t: Tile | undefined) => !!t && t.kind !== "wall";
/** The tiles a room is gated by: past one, the room is "behind a gate". */
const GATES = new Set<Kind>(["door", "enemy"]);
/** What makes a room behind a gate a reward room. */
const REWARDS = new Set<Kind>(["key", "potion", "attack", "defense", "treasure", "reward"]);

/** One floor to add enemies to. */
export type ExtraFloor = {
  /** The generated tiles (a missing one is wall): the whole area in the Delve. */
  cells: Map<string, Tile>;
  width: number;
  /** Whether a row open at both edges wraps round (the Delve). */
  wraps: boolean;
  /** Where the hero comes in, and where the floor leads (stairs, or the area's boss). */
  root: Point;
  target: Point | null;
  /** The floor's own tiles, bottom row first: whose enemies are counted
   * and where new ones may stand. */
  band: Point[];
  /** Tiles never given an enemy (the way in, beside the stairs, torches). */
  avoid: ReadonlySet<string>;
};

/** How many more of each strength `floor` gets, rolled on `rng`: the
 * generated count times the percent, a fraction being the chance of one more. */
function extraCounts(floor: ExtraFloor, extras: ExtraEnemies, rng: () => number) {
  const sources = new Map<ExtraStrength, Enemy[]>();
  for (const p of floor.band) {
    const t = floor.cells.get(point(p.x, p.y));
    const s = t?.kind === "enemy" ? t.enemy?.strength : undefined;
    if (t?.enemy && s && s !== "greaterBoss") (sources.get(s) ?? sources.set(s, []).get(s)!).push(t.enemy);
  }
  const out: { strength: ExtraStrength; sources: Enemy[]; count: number }[] = [];
  for (const strength of EXTRA_ORDER) {
    const percent = extras[strength] ?? 0, from = sources.get(strength) ?? [];
    if (percent <= 0 || !from.length) continue;
    const total = from.length * percent;
    let count = Math.floor(total / 100);
    const fraction = total - count * 100;
    if (fraction > 0 && rng() * 100 < fraction) count++;
    if (count) out.push({ strength, sources: from, count });
  }
  return out;
}

/** A floor's ground as a grid of tile indices (`(y - minY) * width + x`),
 * worked out once: what each tile is, its neighbours, which of its sides
 * are walls, and the tiles on the shortest walk from the way in to the
 * target. The searches below run on it, so placing each extra never parses
 * a tile's key. */
export type ExtraGround = {
  width: number;
  minY: number;
  size: number;
  /** Each tile's flags (`OPEN`, `GATE`, `REWARD`, `FLOOR`, `AVOID`). */
  flags: Uint8Array;
  /** Each tile's four neighbours (right, left, below, above), -1 for none:
   * off the board, or past a row's edge that doesn't wrap. */
  near: Int32Array;
  /** Whether a wall (or the board's edge) stands below or above the tile,
   * and right or left of it, as generated. */
  walledNs: Uint8Array;
  walledEw: Uint8Array;
  /** The way in's index (-1: off the board). */
  root: number;
  onPath: Uint8Array;
};
const OPEN = 1, GATE = 2, REWARD = 4, FLOOR = 8, AVOID = 16;

/** `floor`'s ground for `addEnemies` (its band aside): the Delve works it
 * out once for all ten of an area's floors. */
export function extraGround(floor: Omit<ExtraFloor, "band">): ExtraGround {
  const { cells, width, wraps } = floor;
  let minY = Infinity, maxY = -Infinity;
  for (const k of cells.keys()) {
    const y = Number(k.slice(k.indexOf(",") + 1));
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (minY > maxY) minY = maxY = 0;
  const size = width * (maxY - minY + 1), flags = new Uint8Array(size);
  const at = (x: number, y: number) => (x < 0 || x >= width || y < minY || y > maxY ? -1 : (y - minY) * width + x);
  const keyAt = (k: string) => {
    const comma = k.indexOf(",");
    return at(Number(k.slice(0, comma)), Number(k.slice(comma + 1)));
  };
  for (const [k, t] of cells) {
    const i = keyAt(k);
    if (i < 0 || !walkable(t)) continue;
    flags[i] = OPEN | (GATES.has(t.kind) ? GATE : 0) | (REWARDS.has(t.kind) ? REWARD : 0) | (t.kind === "floor" ? FLOOR : 0);
  }
  for (const k of floor.avoid) {
    const i = keyAt(k);
    if (i >= 0) flags[i]! |= AVOID;
  }
  const open = (x: number, y: number) => {
    const i = at(x, y);
    return i >= 0 && (flags[i]! & OPEN) !== 0;
  };
  // A step off a row's edge comes back on the other only where both edges are open.
  const across = (x: number, y: number) => (x >= 0 && x < width ? x : wraps && open(0, y) && open(width - 1, y) ? (x + width) % width : -1);
  const near = new Int32Array(size * 4), walledNs = new Uint8Array(size), walledEw = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const x = i % width, y = minY + (i - x) / width;
    DIRS.forEach(([dx, dy], d) => {
      const nx = across(x + dx, y);
      near[i * 4 + d] = nx < 0 ? -1 : at(nx, y + dy);
    });
    const wall = (d: number) => near[i * 4 + d]! < 0 || !(flags[near[i * 4 + d]!]! & OPEN);
    walledEw[i] = wall(0) || wall(1) ? 1 : 0;
    walledNs[i] = wall(2) || wall(3) ? 1 : 0;
  }
  const root = at(floor.root.x, floor.root.y);
  // The shortest walk from the way in to the target, as generated.
  const onPath = new Uint8Array(size), target = floor.target ? at(floor.target.x, floor.target.y) : -1;
  if (root >= 0 && target >= 0) {
    const pass = (i: number) => (flags[i]! & OPEN) !== 0;
    const from = distances(root, pass, near, size), to = distances(target, pass, near, size), length = from[target]!;
    if (length >= 0) for (let i = 0; i < size; i++) if (from[i]! >= 0 && to[i]! >= 0 && from[i]! + to[i]! === length) onPath[i] = 1;
  }
  return { width, minY, size, flags, near, walledNs, walledEw, root, onPath };
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Where the next enemy stands on `ground`, among `band`'s tiles, with
 * those `placed` already standing (each a wall to the search, since the
 * hero must never have to fight one): corners of reward rooms behind a
 * gate, then of other rooms behind a gate, then corners and then edges of
 * the core (what the way in reaches without passing a gate), then any tile
 * that cuts nothing off, and only then one that does; tiles off the
 * shortest walk from the way in to the target first, ties broken on `rng`.
 * -1 when no tile is free. */
function nextSpot(ground: ExtraGround, band: Int32Array, placed: Uint8Array, rng: () => number): number {
  const { flags, near, size, root } = ground;
  const passable = (i: number) => (flags[i]! & OPEN) !== 0 && !placed[i];
  const cuts = cutTiles(root, passable, near, size);
  // The core: reached from the way in without passing a gate.
  const plain = (i: number) => passable(i) && !(flags[i]! & GATE);
  const core = new Uint8Array(size);
  for (const i of flood(root, plain, near, size)) core[i] = 1;
  // Each room behind a gate (holding a band tile): 1 if it holds a reward, 0 if not.
  const room = new Int8Array(size).fill(-1);
  for (const i of band) {
    if (room[i]! >= 0 || core[i] || !plain(i)) continue;
    const tiles = flood(i, (j) => plain(j) && !core[j], near, size);
    const reward = tiles.some((j) => (flags[j]! & REWARD) !== 0) ? 1 : 0;
    for (const j of tiles) room[j] = reward;
  }
  let best = -1, bestRank = Infinity, bestRoll = Infinity;
  for (const i of band) {
    if (!(flags[i]! & FLOOR) || flags[i]! & AVOID || placed[i] || cuts.order[i]! < 0) continue;
    const ns = ground.walledNs[i] === 1, ew = ground.walledEw[i] === 1;
    const corner = ns && ew, edge = ns || ew;
    const tier = cuts.cut[i] ? 5
      : corner && room[i] === 1 ? 0
      : corner && room[i]! >= 0 ? 1
      : corner && core[i] ? 2
      : edge && core[i] ? 3
      : 4;
    const rank = tier * 2 + ground.onPath[i]!, roll = rng();
    if (rank < bestRank || (rank === bestRank && roll < bestRoll)) [best, bestRank, bestRoll] = [i, rank, roll];
  }
  return best;
}

/** Every tile reached from `from` through tiles `pass` lets through (none
 * unless it lets `from` through). */
function flood(from: number, pass: (i: number) => boolean, near: Int32Array, size: number) {
  const out: number[] = [];
  if (from < 0 || !pass(from)) return out;
  const seen = new Uint8Array(size);
  seen[from] = 1;
  out.push(from);
  for (let q = 0; q < out.length; q++)
    for (let d = 0; d < 4; d++) {
      const n = near[out[q]! * 4 + d]!;
      if (n >= 0 && !seen[n] && pass(n)) (seen[n] = 1), out.push(n);
    }
  return out;
}

/** Steps from `from` to every tile `pass` lets through (-1: not reached). */
function distances(from: number, pass: (i: number) => boolean, near: Int32Array, size: number) {
  const dist = new Int32Array(size).fill(-1), queue = [from];
  dist[from] = 0;
  for (let q = 0; q < queue.length; q++) {
    const at = queue[q]!, d = dist[at]! + 1;
    for (let k = 0; k < 4; k++) {
      const n = near[at * 4 + k]!;
      if (n >= 0 && dist[n]! < 0 && pass(n)) (dist[n] = d), queue.push(n);
    }
  }
  return dist;
}

/** The tiles reached from `root` (`order` 0 or more), and those among them
 * whose loss would cut some other tile off from it (`cut`: Tarjan's
 * articulation points, iteratively). */
function cutTiles(root: number, pass: (i: number) => boolean, near: Int32Array, size: number) {
  const order = new Int32Array(size).fill(-1), cut = new Uint8Array(size);
  if (root < 0 || !pass(root)) return { order, cut };
  const low = new Int32Array(size), parent = new Int32Array(size).fill(-1), tried = new Uint8Array(size);
  const stack = [root];
  order[root] = 0;
  let time = 1, rootChildren = 0;
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    if (tried[top]! < 4) {
      const n = near[top * 4 + tried[top]!++]!;
      if (n < 0 || !pass(n)) continue;
      if (order[n]! < 0) {
        order[n] = low[n] = time++;
        parent[n] = top;
        if (top === root) rootChildren++;
        stack.push(n);
      } else if (n !== parent[top]) low[top] = Math.min(low[top]!, order[n]!);
      continue;
    }
    stack.pop();
    const up = parent[top]!;
    if (up < 0) continue;
    low[up] = Math.min(low[up]!, low[top]!);
    if (up !== root && low[top]! >= order[up]!) cut[up] = 1;
  }
  if (rootChildren > 1) cut[root] = 1;
  return { order, cut };
}

/** Adds `floor`'s extra enemies to `placed` (by tile), each a copy of one of
 * the floor's generated enemies of its strength, drawing everything from
 * a stream seeded by `seed`. `ground` is `extraGround(floor)`, worked out
 * here unless given. */
export function addEnemies(floor: ExtraFloor, extras: ExtraEnemies, seed: number, placed: Map<string, Tile>, ground?: ExtraGround) {
  const rng = random(seed);
  const counts = extraCounts(floor, extras, rng);
  if (!counts.length) return;
  const g = ground ?? extraGround(floor);
  const rows = g.size / g.width;
  const index = (x: number, y: number) => (x < 0 || x >= g.width || y < g.minY || y >= g.minY + rows ? -1 : (y - g.minY) * g.width + x);
  const band = Int32Array.from(floor.band.map((p) => index(p.x, p.y)).filter((i) => i >= 0));
  const taken = new Uint8Array(g.size);
  for (const k of placed.keys()) {
    const comma = k.indexOf(","), i = index(Number(k.slice(0, comma)), Number(k.slice(comma + 1)));
    if (i >= 0) taken[i] = 1;
  }
  for (const { sources, count } of counts)
    for (let n = 0; n < count; n++) {
      const enemy = sources[Math.min(sources.length - 1, Math.floor(rng() * sources.length))]!;
      const spot = nextSpot(g, band, taken, rng);
      if (spot < 0) return;
      taken[spot] = 1;
      placed.set(point(spot % g.width, g.minY + (spot - (spot % g.width)) / g.width), { kind: "enemy", enemy: { ...enemy } });
    }
}

/** The stream seed for a floor's extras: the run seed and the floor's
 * number, salted apart from every other stream drawn from them. */
export const extrasSeed = (runSeed: number, floor: number) => (runSeed ^ Math.imul(floor + 1, 0x2c1b3c6d) ^ 0x6d0e7e1) >>> 0;

/** The badge's percent at each level, 1 to 7. */
export const MORE_ENEMIES_PERCENTS = [30, 40, 50, 60, 70, 80, 90] as const;
/** The cards More Enemies can sit on, and the strengths each multiplies:
 * MONSTER every strength, each from its own count. */
export const MORE_ENEMIES_CARDS = {
  monster: EXTRA_ORDER,
  weakEnemy: ["weak"],
  baseEnemy: ["normal"],
  strongEnemy: ["strong"],
  eliteEnemy: ["elite"],
  bossEnemy: ["boss"],
} as const satisfies Partial<Record<CardId, readonly ExtraStrength[]>>;

/** What a run's More Enemies badges add to each floor: each strength's
 * percents, summed over the cards that cover it. None without the badge. */
export function extraEnemies(badges: Partial<Record<CardId, RunBadge>> | undefined): ExtraEnemies | undefined {
  const out: ExtraEnemies = {};
  for (const [card, badge] of Object.entries(badges ?? {})) {
    const strengths = (MORE_ENEMIES_CARDS as Partial<Record<string, readonly ExtraStrength[]>>)[card];
    if (badge?.id !== "moreEnemies" || !strengths) continue;
    const percent = MORE_ENEMIES_PERCENTS[Math.max(1, Math.min(badge.level, MORE_ENEMIES_PERCENTS.length)) - 1]!;
    for (const s of strengths) out[s] = (out[s] ?? 0) + percent;
  }
  return hasExtras(out) ? out : undefined;
}
