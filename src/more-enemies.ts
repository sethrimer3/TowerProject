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

/** Where the next enemy stands on `floor`, with `placed` already standing
 * (each a wall to the search, since the hero must never have to fight one):
 * corners of reward rooms behind a gate, then of other rooms behind a gate,
 * then corners and then edges of the core (what the way in reaches without
 * passing a gate), then any tile that cuts nothing off, and only then one
 * that does; tiles off the shortest walk from the way in to the target
 * first, ties broken on `rng`. Null when no tile is free. */
function nextSpot(floor: ExtraFloor, placed: ReadonlyMap<string, Tile>, onPath: ReadonlySet<string>, rng: () => number): Point | null {
  const { cells, width, wraps } = floor;
  const open = (x: number, y: number) => walkable(cells.get(point(x, y)));
  const neighbours = (x: number, y: number): Point[] => {
    const out: Point[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      let nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width) {
        if (!wraps || !open(0, y) || !open(width - 1, y)) continue;
        nx = (nx + width) % width;
      }
      out.push({ x: nx, y: ny });
    }
    return out;
  };
  const passable = (k: string) => walkable(cells.get(k)) && !placed.has(k);
  const rootKey = point(floor.root.x, floor.root.y);
  const cuts = cutTiles(rootKey, passable, neighbours);
  // The core: reached from the way in without passing a gate.
  const plain = (k: string) => passable(k) && !GATES.has(cells.get(k)!.kind);
  const core = flood([rootKey], plain, neighbours);
  // Each room behind a gate, and whether it holds a reward.
  const room = new Map<string, boolean>();
  for (const p of floor.band) {
    const k = point(p.x, p.y);
    if (room.has(k) || core.has(k) || !plain(k)) continue;
    const tiles = flood([k], (j) => plain(j) && !core.has(j), neighbours);
    const reward = [...tiles].some((j) => REWARDS.has(cells.get(j)!.kind));
    for (const j of tiles) room.set(j, reward);
  }
  let best: Point | null = null, bestRank = Infinity, bestRoll = Infinity;
  for (const p of floor.band) {
    const k = point(p.x, p.y);
    if (cells.get(k)?.kind !== "floor" || placed.has(k) || floor.avoid.has(k) || !cuts.reached.has(k)) continue;
    const wall = (dx: number, dy: number) => {
      let nx = p.x + dx;
      if (nx < 0 || nx >= width) {
        if (!wraps || !open(0, p.y) || !open(width - 1, p.y)) return true;
        nx = (nx + width) % width;
      }
      return !open(nx, p.y + dy);
    };
    const ns = wall(0, 1) || wall(0, -1), ew = wall(1, 0) || wall(-1, 0);
    const corner = ns && ew, edge = ns || ew;
    const tier = cuts.cut.has(k) ? 5
      : corner && room.get(k) === true ? 0
      : corner && room.has(k) ? 1
      : corner && core.has(k) ? 2
      : edge && core.has(k) ? 3
      : 4;
    const rank = tier * 2 + (onPath.has(k) ? 1 : 0), roll = rng();
    if (rank < bestRank || (rank === bestRank && roll < bestRoll)) [best, bestRank, bestRoll] = [p, rank, roll];
  }
  return best;
}

/** Every tile reached from `from` through tiles `pass` lets through. */
function flood(from: string[], pass: (k: string) => boolean, neighbours: (x: number, y: number) => Point[]) {
  const seen = new Set(from.filter(pass)), queue = [...seen];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!.split(",").map(Number);
    for (const n of neighbours(x!, y!)) {
      const k = point(n.x, n.y);
      if (!seen.has(k) && pass(k)) (seen.add(k), queue.push(k));
    }
  }
  return seen;
}

/** Steps from `from` to every tile `pass` lets through. */
function distances(from: string, pass: (k: string) => boolean, neighbours: (x: number, y: number) => Point[]) {
  const dist = new Map<string, number>([[from, 0]]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!.split(",").map(Number), d = dist.get(queue[i]!)! + 1;
    for (const n of neighbours(x!, y!)) {
      const k = point(n.x, n.y);
      if (!dist.has(k) && pass(k)) (dist.set(k, d), queue.push(k));
    }
  }
  return dist;
}

/** The tiles reached from `root`, and those among them whose loss would cut
 * some other tile off from it (Tarjan's articulation points, iteratively). */
function cutTiles(root: string, pass: (k: string) => boolean, neighbours: (x: number, y: number) => Point[]) {
  const order = new Map<string, number>(), low = new Map<string, number>(), cut = new Set<string>();
  if (!pass(root)) return { reached: order, cut };
  const next = (k: string) => {
    const [x, y] = k.split(",").map(Number);
    return neighbours(x!, y!).map((n) => point(n.x, n.y)).filter(pass);
  };
  order.set(root, 0), low.set(root, 0);
  const stack: { k: string; parent: string | null; ns: string[]; i: number }[] = [{ k: root, parent: null, ns: next(root), i: 0 }];
  let time = 1, rootChildren = 0;
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    if (top.i < top.ns.length) {
      const n = top.ns[top.i++]!;
      if (!order.has(n)) {
        order.set(n, time), low.set(n, time++);
        if (top.k === root) rootChildren++;
        stack.push({ k: n, parent: top.k, ns: next(n), i: 0 });
      } else if (n !== top.parent) low.set(top.k, Math.min(low.get(top.k)!, order.get(n)!));
      continue;
    }
    stack.pop();
    if (top.parent === null) continue;
    low.set(top.parent, Math.min(low.get(top.parent)!, low.get(top.k)!));
    if (top.parent !== root && low.get(top.k)! >= order.get(top.parent)!) cut.add(top.parent);
  }
  if (rootChildren > 1) cut.add(root);
  return { reached: order, cut };
}

/** Adds `floor`'s extra enemies to `placed` (by tile), each a copy of one of
 * the floor's generated enemies of its strength, drawing everything from
 * a stream seeded by `seed`. */
export function addEnemies(floor: ExtraFloor, extras: ExtraEnemies, seed: number, placed: Map<string, Tile>) {
  const rng = random(seed);
  const counts = extraCounts(floor, extras, rng);
  if (!counts.length) return;
  const { cells, width, wraps } = floor;
  // The shortest walk from the way in to the target, as generated.
  const open = (k: string) => walkable(cells.get(k));
  const near = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dx, dy]) => {
    let nx = x + dx!;
    if (nx < 0 || nx >= width) {
      if (!wraps || !open(point(0, y)) || !open(point(width - 1, y))) return [];
      nx = (nx + width) % width;
    }
    return [{ x: nx, y: y + dy! }];
  });
  const onPath = new Set<string>();
  if (floor.target) {
    const from = distances(point(floor.root.x, floor.root.y), open, near), to = distances(point(floor.target.x, floor.target.y), open, near);
    const length = from.get(point(floor.target.x, floor.target.y));
    if (length !== undefined) for (const [k, d] of from) if (d + (to.get(k) ?? Infinity) === length) onPath.add(k);
  }
  for (const { sources, count } of counts)
    for (let i = 0; i < count; i++) {
      const enemy = sources[Math.min(sources.length - 1, Math.floor(rng() * sources.length))]!;
      const spot = nextSpot(floor, placed, onPath, rng);
      if (!spot) return;
      placed.set(point(spot.x, spot.y), { kind: "enemy", enemy: { ...enemy } });
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
