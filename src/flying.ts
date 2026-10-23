/** Flying and Aggroed enemies (docs/agents/movement-and-combat.md).
 *
 * From the fifth tower and delve up, any enemy but a boss, Greater Boss or
 * Shielded enemy may be Flying, on a tile roll of its own at the Ranged
 * share (`FLYING_SALT`, `rangedShare`), before the Fast and Ranged rolls,
 * which then leave it alone. A Flying enemy hovers over open floor: the
 * board makes its tile a floor tile carrying it (`Tile.flyer`), so the hero
 * walks under it as over any floor, never fighting it, and every card,
 * route and planner passes beneath it. It shoots the hero as a Ranged enemy
 * does, and only the Archer's arrows can hurt it.
 *
 * An arrow that wounds a Flying enemy makes it Aggroed (`woundMore` in
 * ranged.ts): each turn its `stride` charge gains what a Ranged enemy's
 * cooldown does, and each time it is full the enemy takes a step toward the
 * hero along open floor (`aggroTurn`), so it closes in at the rate it
 * fires. Every Aggroed enemy steps by one shared map of the walk to the
 * hero (`walkToHero`), made once a turn. A Flying enemy may hover over the
 * hero; one on the ground stops beside it. */
import type { Board } from "./board.ts";
import { point, type Enemy, type Point, type Tile } from "./entities.ts";
import { tileRandom } from "./random.ts";
import { FOE_GAIN, foeShotCost, rangedShare, type Volleys } from "./ranged.ts";

const FLYING_SALT = 0xf1e5;
/** The first tier with Flying enemies. */
export const FLYING_TIER = 5;

/** The share of enemies that fly on equivalent floor `floor` (from 1) of
 * tier `tier`, in thousandths of a percent: the Ranged share, from the
 * fifth tier. */
export const flyingShare = (tier: number, floor: number) => (tier < FLYING_TIER ? 0 : rangedShare(tier, floor));

/** Whether `enemy` may fly: anything but a boss, a Greater Boss or a
 * Shielded enemy. */
export const mayFly = (enemy: Enemy) => enemy.strength !== "boss" && enemy.strength !== "greaterBoss" && !enemy.shielded;

/** Whether the enemy at (x, y) on equivalent floor `floor` of tier `tier`
 * flies, for a run of seed `seed`. */
export function rollsFlying(seed: number, tier: number, floor: number, x: number, y: number) {
  const share = flyingShare(tier, floor);
  return share > 0 && tileRandom(x, y, (seed ^ FLYING_SALT ^ Math.imul(floor, 0x9e3779b1)) | 0) * 100_000 < share;
}

/** `cells` with each enemy that rolls Flying lifted over its tile, which
 * becomes open floor carrying it; `floorAt` gives each tile's equivalent
 * floor. The same map below the fifth tier. */
export function flyingCells(cells: Map<string, Tile>, tier: number, seed: number, floorAt: (x: number, y: number) => number) {
  if (tier < FLYING_TIER) return cells;
  const out = new Map<string, Tile>();
  for (const [k, t] of cells) {
    const e = t.kind === "enemy" ? t.enemy : undefined;
    if (e && mayFly(e)) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      if (rollsFlying(seed, tier, floorAt(x, y), x, y)) {
        out.set(k, { kind: "floor", flyer: { ...e, flying: true } });
        continue;
      }
    }
    out.set(k, t);
  }
  return out;
}

/** The most tiles the walk to the hero covers: more than a Tower floor or
 * a Delve area holds. */
const MOST_WALKED = 20_000;
const DIRECTIONS = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;

/** How many steps each tile lies from the hero along open floor (by
 * `point`), the map every Aggroed enemy shares: the walk goes over floor
 * tiles only (Flying enemies over them no obstacle), reaching but never
 * crossing anything else, so an enemy standing on the ground has its own
 * distance too. */
export function walkToHero(board: Pick<Board, "tile" | "step" | "floor">, hero: Point) {
  const away = new Map([[point(hero.x, hero.y), 0]]), walk: Point[] = [hero];
  for (let i = 0; i < walk.length && i < MOST_WALKED; i++) {
    const from = walk[i]!, d = away.get(point(from.x, from.y))!;
    for (const [dx, dy] of DIRECTIONS) {
      const next = board.step(from.x, from.y, dx, dy);
      if (!next || next.y < board.floor) continue;
      const k = point(next.x, next.y), tile = board.tile(next.x, next.y);
      if (away.has(k) || tile.kind === "wall") continue;
      away.set(k, d + 1);
      if (tile.kind === "floor") walk.push(next);
    }
  }
  return away;
}

/** What a turn of Aggroed enemies moves on: the board, the run's changes
 * (where every Aggroed enemy is kept, an arrow's wound having written it
 * there), the hero, each tile's equivalent floor, the tiles holding a lit
 * torch (never stepped on, so the torch stays lit) and the Ranged
 * cooldowns by tile, which move with their enemies. */
export type AggroTurn = {
  board: Pick<Board, "tile" | "step" | "floor">;
  changes: Record<string, Tile>;
  hero: Point;
  floorOf: (x: number, y: number) => number;
  lit: ReadonlySet<string>;
  foes?: Volleys["foes"];
};
/** One Aggroed enemy's step: from where to where. */
export type AggroStep = { from: Point; to: Point };

/** The Aggroed enemies of `changes`, by `point`. */
export const aggroed = (changes: Readonly<Record<string, Tile>>) =>
  Object.keys(changes).filter((k) => {
    const t = changes[k]!;
    return !!(t.kind === "enemy" ? t.enemy?.aggro : t.flyer?.aggro);
  });

/** A turn of the Aggroed enemies, closest to the hero first: each one's
 * stride charge gains `FOE_GAIN`, and once it holds `foeShotCost` of its
 * floor (the cost of its shot), it steps to a neighbouring tile nearer the
 * hero by the shared walk (`walkToHero`), spending that much: a Flying
 * enemy onto open floor no other enemy hovers over, or over the hero
 * itself; one on the ground onto open floor beside it, never onto the hero
 * (no fight begins). With no such tile it waits, its charge full. Edits
 * `changes`; returns the steps taken and the cooldowns, moved with them. */
export function aggroTurn(turn: AggroTurn): { steps: AggroStep[]; foes?: Volleys["foes"] } {
  const movers = aggroed(turn.changes);
  if (!movers.length) return { steps: [], ...(turn.foes ? { foes: turn.foes } : {}) };
  const { board, changes, hero, lit } = turn, away = walkToHero(board, hero), heroKey = point(hero.x, hero.y);
  const foes = turn.foes ? { ...turn.foes } : undefined, steps: AggroStep[] = [];
  const order = movers
    .map((k) => ({ k, d: away.get(k) ?? Infinity, at: k.split(",").map(Number) as [number, number] }))
    .sort((a, b) => a.d - b.d || a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  for (const { k, d, at: [x, y] } of order) {
    const raw = changes[k]!, flying = raw.kind !== "enemy", e = (flying ? raw.flyer : raw.enemy)!;
    const cost = foeShotCost(turn.floorOf(x, y)), stride = (e.stride ?? 0) + FOE_GAIN;
    const opens = (n: Point) => {
      const nk = point(n.x, n.y), t = board.tile(n.x, n.y);
      if ((away.get(nk) ?? Infinity) >= d) return false;
      if (nk === heroKey) return flying && t.kind === "floor" && !t.flyer;
      return t.kind === "floor" && !t.flyer && !lit.has(nk);
    };
    const to = stride >= cost ? DIRECTIONS.map(([dx, dy]) => board.step(x, y, dx, dy)).find((n): n is Point => !!n && opens(n)) : undefined;
    if (!to) {
      const kept = { ...e, stride: Math.min(stride, cost) };
      changes[k] = flying ? { ...raw, flyer: kept } : { ...raw, enemy: kept };
      continue;
    }
    const moved: Enemy = { ...e, stride: stride - cost, home: e.home ?? k }, tk = point(to.x, to.y);
    changes[tk] = flying ? { ...raw, flyer: moved } : { ...raw, enemy: moved };
    changes[k] = { kind: "floor" };
    if (foes && k in foes) {
      foes[tk] = foes[k]!;
      delete foes[k];
    }
    steps.push({ from: { x, y }, to });
  }
  return { steps, ...(foes ? { foes } : {}) };
}
