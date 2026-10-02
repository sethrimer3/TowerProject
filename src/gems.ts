import type { Board } from "./board.ts";
import type { Mode, Tile } from "./entities.ts";

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

const time = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
const whole = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
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
  if (whole(raw.wait) && raw.wait <= GEM_MISSED_FLOORS) d.wait = raw.wait;
  const o = raw.out;
  if (o && modeOf(o.mode) && whole(o.seed) && whole(o.floor) && Number.isInteger(o.x) && Number.isInteger(o.y))
    d.out = { mode: o.mode, seed: o.seed, floor: o.floor, x: o.x, y: o.y };
  d.reached = { tower: reachedOf(raw.reached?.tower), delve: reachedOf(raw.reached?.delve) };
  return d;
}

/** The Gem lying on the floor `mode`'s run `seed` stands on, if any. */
export function gemOn(drop: GemDrop, mode: Mode, seed: number, floor: number): GemSpot | null {
  const o = drop.out;
  return o && o.mode === mode && o.seed === seed && o.floor === floor ? o : null;
}

/** The Gem lying out was missed: it is gone, and another is owed
 * `GEM_MISSED_FLOORS` new floors on. */
export function missGem(drop: GemDrop) {
  drop.out = null;
  drop.wait = GEM_MISSED_FLOORS;
}

/** The hero of `mode`'s run `seed` stands on `floor` at `now`: a Gem left on
 * another floor of that run (or an earlier one) is missed, and on a new
 * floor, once the cooldown is over, returns whether a Gem appears here. */
export function reachFloor(drop: GemDrop, mode: Mode, seed: number, floor: number, now: number): boolean {
  if (drop.out?.mode === mode && !gemOn(drop, mode, seed, floor)) missGem(drop);
  const r = drop.reached[mode];
  if (r && r.seed === seed && floor <= r.floor) return false;
  drop.reached[mode] = { seed, floor };
  if (drop.out || now < drop.readyAt) return false;
  if (drop.wait > 0) drop.wait--;
  return drop.wait === 0;
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

/** A plain floor tile for a Gem, out of the way where it can be, from those
 * the hero at `from` can walk to without passing a door, monster or stairs:
 * in rows `minY` to `maxY` (the view, in the Delve, preferring rows above
 * the hero), never the hero's own tile. Null when there is none.
 *
 * Out of the way means on as few shortest paths as possible between the
 * hero and the floor's targets, and between one target and the next, so
 * the hand's cards seldom walk the hero over it; then tucked against the
 * most walls (a corner or nook). `rng` picks among the tiles left. */
export function gemSpot(board: Board, from: Spot, minY: number, maxY: number, rng: () => number): Spot | null {
  // The area the hero can reach, each tile numbered, and the targets at its edge.
  const index = new Map<string, number>([[`${from.x},${from.y}`, 0]]), tiles: Spot[] = [from];
  const targets: number[] = [];
  const neighbours: number[][] = [[]];
  for (let i = 0; i < tiles.length; i++) {
    const at = tiles[i];
    if (i > 0 && !CROSSABLE.has(board.tile(at.x, at.y).kind)) continue;
    for (const [dx, dy] of DIRECTIONS) {
      const next = board.step(at.x, at.y, dx, dy);
      if (!next || next.y < minY || next.y > maxY) continue;
      const key = `${next.x},${next.y}`, kind = board.tile(next.x, next.y).kind;
      let n = index.get(key);
      if (n === undefined) {
        if (!CROSSABLE.has(kind) && !TARGETS.has(kind)) continue;
        n = tiles.length;
        index.set(key, n);
        tiles.push(next);
        neighbours.push([]);
        if (TARGETS.has(kind)) targets.push(n);
      }
      // Each walkable tile lists its own neighbours; a target, never walked
      // on from, lists the tiles beside it here.
      neighbours[i].push(n);
      if (!CROSSABLE.has(kind)) neighbours[n].push(i);
    }
  }
  const plain = tiles.map((t, i) => i).filter((i) => i > 0 && board.tile(tiles[i].x, tiles[i].y).kind === "floor");
  const ahead = plain.filter((i) => tiles[i].y > from.y), pool = ahead.length ? ahead : plain;
  if (!pool.length) return null;
  // Walking distances from each source over the area: a target is walked
  // from, but nothing walks on through a door, monster or the stairs.
  const crossable = tiles.map((t, i) => i === 0 || CROSSABLE.has(board.tile(t.x, t.y).kind));
  const distances = (start: number) => {
    const d = new Int32Array(tiles.length).fill(-1), queue = [start];
    d[start] = 0;
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q];
      if (at !== start && !crossable[at]) continue;
      for (const n of neighbours[at])
        if (d[n] < 0) {
          d[n] = d[at] + 1;
          queue.push(n);
        }
    }
    return d;
  };
  const sources = [0, ...targets].map((s) => ({ s, d: distances(s) }));
  const ends = sources.slice(1);
  /** How many hero-or-target to target trips have a shortest path through `v`. */
  const traffic = (v: number) => {
    let n = 0;
    for (const a of sources)
      for (const b of ends)
        if (a.s !== b.s && a.d[b.s] > 0 && a.d[v] >= 0 && b.d[v] >= 0 && a.d[v] + b.d[v] === a.d[b.s]) n++;
    return n;
  };
  const walls = (v: number) => DIRECTIONS.filter(([dx, dy]) => {
    const next = board.step(tiles[v].x, tiles[v].y, dx, dy);
    return !next || board.tile(next.x, next.y).kind === "wall";
  }).length;
  const scored = pool.map((v) => ({ v, score: traffic(v) * 8 - walls(v) }));
  const best = Math.min(...scored.map((t) => t.score));
  const quiet = scored.filter((t) => t.score === best);
  return { ...tiles[quiet[Math.floor(rng() * quiet.length)].v] };
}
