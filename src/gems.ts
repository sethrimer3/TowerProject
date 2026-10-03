import type { Board } from "./board.ts";
import type { Mode, Tile } from "./entities.ts";
import { time, whole, wholeIn } from "./decode.ts";

/** Gems: the premium currency, kept between runs like Gold. A Gem turns up
 * on a run's floors now and then, the ad button pays some, and they buy
 * hand slots (with Larger Hand) and Training resets. The Shop (src/shop/)
 * gives 25 free each day and sells packs of them for real money. */

/** How long after a Gem is collected before another can appear (ms). */
export const GEM_COOLDOWN_MS = 30 * 60 * 1000;
/** A Gem missed (its floor left behind) comes back this many new floors on. */
export const GEM_MISSED_FLOORS = 3;
/** What the ad button pays, and how long after a claim before it is back. */
export const AD_GEMS = 7;
export const AD_COOLDOWN_MS = 10 * 60 * 1000;
/** What resetting one Training stat costs. */
export const TRAINING_RESET_GEMS = 2;

/** A Gem lying on a floor: the run (by mode and seed) and the floor it lies
 * on, and its tile. */
export type GemSpot = { mode: Mode; seed: number; floor: number; x: number; y: number };
/** Where the Gems found in runs stand. None of it belongs to a run, so undo
 * never brings a collected Gem back or takes one away. */
export type GemDrop = {
  /** When a Gem may next appear on a new floor (wall clock, ms): the last
   * one collected, plus the cooldown. */
  readyAt: number;
  /** New floors still to reach, once ready, before the next Gem appears: 0
   * on the next one; after one is missed, `GEM_MISSED_FLOORS`. */
  wait: number;
  /** The Gem lying on a floor, if any; one at a time. */
  out: GemSpot | null;
  /** The furthest floor each mode's run has reached, so only a new one
   * counts (not a floor gone back to, nor one reached again after undo). */
  reached: Record<Mode, { seed: number; floor: number } | null>;
  /** When the ad button may next be claimed (wall clock, ms). */
  adReadyAt: number;
};

export const defaultGemDrop = (): GemDrop => ({ readyAt: 0, wait: 0, out: null, reached: { tower: null, delve: null }, adReadyAt: 0 });

const modeOf = (m: unknown): m is Mode => m === "tower" || m === "delve";
function reachedOf(r: any) {
  return r && whole(r.seed) && whole(r.floor) ? { seed: r.seed as number, floor: r.floor as number } : null;
}
/** A saved GemDrop, field by field; anything malformed starts afresh. */
export function decodeGemDrop(raw: any): GemDrop {
  const d = defaultGemDrop();
  if (!raw || typeof raw !== "object") return d;
  d.readyAt = time(raw.readyAt);
  d.adReadyAt = time(raw.adReadyAt);
  if (wholeIn(raw.wait, 0, GEM_MISSED_FLOORS)) d.wait = raw.wait;
  d.out = gemOut(raw.out);
  d.reached = { tower: reachedOf(raw.reached?.tower), delve: reachedOf(raw.reached?.delve) };
  return d;
}
/** The Gem lying out: on a mode's run and floor, at a tile. */
function gemOut(o: any): GemDrop["out"] {
  const spot = reachedOf(o);
  return spot && modeOf(o.mode) && Number.isInteger(o.x) && Number.isInteger(o.y) ? { mode: o.mode, ...spot, x: o.x, y: o.y } : null;
}

/** A floor of a mode's run: where a Gem belongs. */
export type GemFloor = { mode: Mode; seed: number; floor: number };

/** The Gem lying on floor `at`, if any. */
export function gemOn(drop: GemDrop, at: GemFloor): GemSpot | null {
  const o = drop.out;
  return o && o.mode === at.mode && o.seed === at.seed && o.floor === at.floor ? o : null;
}

/** The Gem lying out was missed: it is gone, and another is owed
 * `GEM_MISSED_FLOORS` new floors on. */
export function missGem(drop: GemDrop) {
  drop.out = null;
  drop.wait = GEM_MISSED_FLOORS;
}

/** The hero of a run stands on floor `at` at `now`: a Gem left on another
 * floor of that run (or an earlier one) is missed, and on a new floor, once
 * the cooldown is over, returns whether a Gem appears here. */
export function reachFloor(drop: GemDrop, at: GemFloor, now: number): boolean {
  if (drop.out?.mode === at.mode && !gemOn(drop, at)) missGem(drop);
  if (!isNewFloor(drop, at)) return false;
  drop.reached[at.mode] = { seed: at.seed, floor: at.floor };
  if (drop.out || now < drop.readyAt) return false;
  if (drop.wait > 0) drop.wait--;
  return drop.wait === 0;
}

/** Whether `at` is higher than the mode's run has reached before. */
function isNewFloor(drop: GemDrop, at: GemFloor) {
  const r = drop.reached[at.mode];
  return !r || r.seed !== at.seed || at.floor > r.floor;
}

/** The Gem was collected: none lies out, and the next waits out the cooldown. */
export function collectedGem(drop: GemDrop, now: number) {
  drop.out = null;
  drop.wait = 0;
  drop.readyAt = now + GEM_COOLDOWN_MS;
}

/** Tiles a hero can walk through to reach the Gem's tile. */
const CROSSABLE = new Set<Tile["kind"]>(["floor", "openedChest", "oneway", "key", "potion", "attack", "defense", "treasure", "reward"]);
/** Tiles the hand's cards head for, where their paths end. */
const TARGETS = new Set<Tile["kind"]>(["key", "potion", "attack", "defense", "treasure", "reward", "door", "enemy", "stairs"]);
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
type Spot = { x: number; y: number };
/** The rows a Gem may lie in, `minY` to `maxY`. */
export type GemRows = { minY: number; maxY: number };

/** The area the hero at `from` can reach in `rows` without passing a door,
 * monster or stairs: its tiles numbered in the order found (the hero's is
 * 0), each one's neighbours, and the targets at its edge. */
class ReachArea {
  readonly tiles: Spot[];
  readonly neighbours: number[][] = [[]];
  readonly targets: number[] = [];
  private readonly index: Map<string, number>;

  constructor(private readonly board: Board, from: Spot, private readonly rows: GemRows) {
    this.tiles = [from];
    this.index = new Map([[`${from.x},${from.y}`, 0]]);
    for (let i = 0; i < this.tiles.length; i++) if (this.crossable(i)) this.expand(i);
  }

  kind(i: number) {
    const t = this.tiles[i];
    return this.board.tile(t.x, t.y).kind;
  }

  /** Whether the hero walks on through tile `i` (the hero's own always). */
  crossable(i: number) {
    return i === 0 || CROSSABLE.has(this.kind(i));
  }

  private expand(i: number) {
    const at = this.tiles[i];
    for (const [dx, dy] of DIRECTIONS) {
      const next = this.board.step(at.x, at.y, dx, dy);
      if (next && this.inRows(next)) this.link(i, next);
    }
  }

  private inRows(at: Spot) {
    return at.y >= this.rows.minY && at.y <= this.rows.maxY;
  }

  /** Each walkable tile lists its own neighbours; a target, never walked on
   * from, lists the tiles beside it here. */
  private link(i: number, next: Spot) {
    const kind = this.board.tile(next.x, next.y).kind, n = this.indexOf(next, kind);
    if (n === undefined) return;
    this.neighbours[i].push(n);
    if (!CROSSABLE.has(kind)) this.neighbours[n].push(i);
  }

  /** The number of the tile at `at`, numbering it when it is new and the
   * hero can walk on it or head for it; undefined otherwise. */
  private indexOf(at: Spot, kind: Tile["kind"]) {
    const key = `${at.x},${at.y}`, known = this.index.get(key);
    if (known !== undefined || (!CROSSABLE.has(kind) && !TARGETS.has(kind))) return known;
    const n = this.tiles.length;
    this.index.set(key, n);
    this.tiles.push(at);
    this.neighbours.push([]);
    if (TARGETS.has(kind)) this.targets.push(n);
    return n;
  }

  /** Walking distances from `start` over the area (-1 where unreached): a
   * target is walked from, but nothing walks on through a door, monster or
   * the stairs. */
  distances(start: number) {
    const d = new Int32Array(this.tiles.length).fill(-1), queue = [start];
    d[start] = 0;
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q];
      if (at === start || this.crossable(at)) this.reach(at, d, queue);
    }
    return d;
  }

  private reach(at: number, d: Int32Array, queue: number[]) {
    for (const n of this.neighbours[at]) {
      if (d[n] >= 0) continue;
      d[n] = d[at] + 1;
      queue.push(n);
    }
  }

  /** How many of the walls (or the board's edge) border tile `v`. */
  walls(v: number) {
    const t = this.tiles[v];
    return DIRECTIONS.filter(([dx, dy]) => {
      const next = this.board.step(t.x, t.y, dx, dy);
      return !next || this.board.tile(next.x, next.y).kind === "wall";
    }).length;
  }
}

/** A source of trips (the hero or a target) and its walking distances. */
type Source = { s: number; d: Int32Array };

/** Whether tile `v` lies on a shortest path from `a` to `b`. */
const onShortestPath = (a: Source, b: Source, v: number) =>
  a.s !== b.s && a.d[b.s] > 0 && a.d[v] >= 0 && b.d[v] >= 0 && a.d[v] + b.d[v] === a.d[b.s];

/** How many hero-or-target to target trips have a shortest path through `v`. */
function traffic(sources: Source[], ends: Source[], v: number) {
  let n = 0;
  for (const a of sources) n += ends.filter((b) => onShortestPath(a, b, v)).length;
  return n;
}

/** A plain floor tile for a Gem, out of the way where it can be, from those
 * the hero at `from` can walk to without passing a door, monster or stairs:
 * in `rows` (the view, in the Delve, preferring rows above the hero), never
 * the hero's own tile. Null when there is none.
 *
 * Out of the way means on as few shortest paths as possible between the
 * hero and the floor's targets, and between one target and the next, so
 * the hand's cards seldom walk the hero over it; then tucked against the
 * most walls (a corner or nook). `rng` picks among the tiles left. */
export function gemSpot(board: Board, from: Spot, rows: GemRows, rng: () => number): Spot | null {
  const area = new ReachArea(board, from, rows), tiles = area.tiles;
  const plain = tiles.map((t, i) => i).filter((i) => i > 0 && area.kind(i) === "floor");
  const ahead = plain.filter((i) => tiles[i].y > from.y), pool = ahead.length ? ahead : plain;
  if (!pool.length) return null;
  const sources = [0, ...area.targets].map((s) => ({ s, d: area.distances(s) }));
  const ends = sources.slice(1);
  const scored = pool.map((v) => ({ v, score: traffic(sources, ends, v) * 8 - area.walls(v) }));
  const best = Math.min(...scored.map((t) => t.score));
  const quiet = scored.filter((t) => t.score === best);
  return { ...tiles[quiet[Math.floor(rng() * quiet.length)].v] };
}
