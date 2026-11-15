import type { Board } from "../board.ts";
import type { Mode, Tile } from "../entities.ts";
import { finite, time, whole, wholeIn } from "../save/decode.ts";
import { snap } from "../exact.ts";

/** Gems: the premium currency, kept between runs like Gold. A Gem turns up
 * on a run's floors now and then, the ad button pays some, and they buy
 * hand slots (with Larger Hand) and Training resets. The Shop (src/shop/)
 * gives 25 free each day and sells packs of them for real money. */

/** How long after a Gem is collected before another can appear (ms). */
export const GEM_COOLDOWN_MS = 30 * 60 * 1000;
/** A Gem missed (its floor left behind) comes back this many new floors on. */
export const GEM_MISSED_FLOORS = 3;
/** What the ad button pays for each reward it holds, and how long after a
 * claim before it is back (before the GEM card's Gem Bank Speed). */
export const AD_GEMS = 6;
export const AD_COOLDOWN_MS = 10 * 60 * 1000;
/** What resetting one Training stat costs. */
export const TRAINING_RESET_GEMS = 2;

/** A Gem's kind: a plain one, a Golden Gem (the GEM card's Golden Gem
 * turns one golden) or a Stellar Gem (its Stellar Gem Chance turns a
 * golden one stellar). */
export type GemKind = "plain" | "golden" | "stellar";
/** The Gems each kind pays, and the GEM card XP it gives before Gem XP. */
export const GEM_VALUE: Record<GemKind, number> = { plain: 1, golden: 5, stellar: 25 };
/** The most extra Gems kept lying out at once: far more than a floor rolls. */
const MOST_EXTRA = 32;

/** A Gem lying on a floor: the run (by mode and seed) and the floor it lies
 * on, its tile, and its kind (plain when absent). */
export type GemSpot = { mode: Mode; seed: number; floor: number; x: number; y: number; kind?: Exclude<GemKind, "plain"> };
/** Where the Gems found in runs stand. None of it belongs to a run. */
export type GemDrop = {
  /** When a Gem may next appear on a new floor (wall clock, ms): the last
   * one collected, plus the cooldown. */
  readyAt: number;
  /** New floors still to reach, once ready, before the next Gem appears: 0
   * on the next one; after one is missed, `GEM_MISSED_FLOORS`. */
  wait: number;
  /** The cooldown's Gem lying on a floor, if any; one at a time. */
  out: GemSpot | null;
  /** The GEM card's Gems lying out besides it (Gem Chance's, a boss's
   * drop): gone, never owed again, once the hero leaves their floor. */
  extra: GemSpot[];
  /** The furthest floor each mode's run has reached, so only a new one
   * counts (not a floor gone back to). */
  reached: Record<Mode, { seed: number; floor: number } | null>;
  /** When the ad button's next reward is banked (wall clock, ms): it shows
   * once one is. */
  adReadyAt: number;
  /** The ad button's rewards banked as of `adReadyAt`'s last settling: at
   * most one without the GEM card's Gem Bank (`adBank` settles the rest). */
  adBanked: number;
  /** The part of a Gem found but not yet whole (a badge scaling a Gem), in
   * [0, 1): it rides onto the next Gem found, and is never shown. */
  fraction: number;
};

export const defaultGemDrop = (): GemDrop => ({ readyAt: 0, wait: 0, out: null, extra: [], reached: { tower: null, delve: null }, adReadyAt: 0, adBanked: 0, fraction: 0 });

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
  if (wholeIn(raw.adBanked, 0, 1000)) d.adBanked = raw.adBanked;
  if (finite(raw.fraction, 1) && raw.fraction < 1) d.fraction = snap(raw.fraction);
  if (wholeIn(raw.wait, 0, GEM_MISSED_FLOORS)) d.wait = raw.wait;
  d.out = gemOut(raw.out);
  if (Array.isArray(raw.extra)) d.extra = raw.extra.map(gemOut).filter((g: GemSpot | null): g is GemSpot => !!g).slice(0, MOST_EXTRA);
  d.reached = { tower: reachedOf(raw.reached?.tower), delve: reachedOf(raw.reached?.delve) };
  return d;
}
/** A Gem lying out: on a mode's run and floor, at a tile, of a kind. */
function gemOut(o: any): GemSpot | null {
  const spot = reachedOf(o);
  if (!spot || !modeOf(o.mode) || !Number.isInteger(o.x) || !Number.isInteger(o.y)) return null;
  return { mode: o.mode, ...spot, x: o.x, y: o.y, ...(o.kind === "golden" || o.kind === "stellar" ? { kind: o.kind } : {}) };
}

/** The Gems a Gem lying out pays. */
export const gemValue = (gem: Pick<GemSpot, "kind">) => GEM_VALUE[gem.kind ?? "plain"];

/** A Gem's kind, rolled as it appears: golden at `golden` percent (from
 * `goldenRng`), then a golden one stellar at `stellar` percent (from
 * `stellarRng`), each its own sequence. */
export function rollGemKind(golden: number, stellar: number, goldenRng: () => number, stellarRng: () => number): GemKind {
  if (!(golden > 0) || goldenRng() * 100 >= golden) return "plain";
  return stellar > 0 && stellarRng() * 100 < stellar ? "stellar" : "golden";
}
/** `spot` as it lies, of kind `kind`. */
export const ofKind = <T extends object>(spot: T, kind: GemKind): T & Pick<GemSpot, "kind"> => (kind === "plain" ? spot : { ...spot, kind });

/** `amount` Gems found, a fraction and all: the whole Gems it makes with
 * the fraction kept from before, which the purse takes, and the rest kept
 * for the next. */
export function wholeGems(drop: GemDrop, amount: number) {
  const total = snap(drop.fraction + Math.max(0, amount)), gems = Math.floor(total);
  drop.fraction = snap(total - gems);
  return gems;
}

/** The ad button's bank at `now`: how many rewards it holds (`banked`, at
 * most `cap` unless a smaller cap came after them), when the next is
 * banked (`readyAt`, while not full), whether it is full, and how far its
 * fill meter has filled, from empty as the first reward is banked to full
 * as the last is (0 without a bank to fill, `cap` 1). Time is tallied
 * toward the next reward while the bank has room, claimed or not, and
 * stops while it is full. Nothing changes. */
export function adBank(drop: GemDrop, now: number, cap: number, cooldown: number) {
  let banked = drop.adBanked, readyAt = drop.adReadyAt;
  // A button never claimed shows its first reward at once.
  if (readyAt <= 0 && banked < cap) {
    banked++;
    readyAt = now + cooldown;
  }
  if (banked < cap && now >= readyAt) {
    const more = Math.min(cap - banked, 1 + Math.floor((now - readyAt) / cooldown));
    banked += more;
    readyAt += more * cooldown;
  }
  const full = banked >= cap, part = Math.min(1, Math.max(0, 1 - (readyAt - now) / cooldown));
  const fill = cap <= 1 || !banked ? 0 : full ? 1 : (banked - 1 + part) / (cap - 1);
  return { banked, readyAt, full, fill, cap };
}
export type AdBank = ReturnType<typeof adBank>;

/** Claims every reward the ad button's bank holds at `now`, returning how
 * many (0 when none). The time tallied toward the next stays, so a claim
 * between bankings doesn't reset it; a full bank starts tallying again now. */
export function claimAdBank(drop: GemDrop, now: number, cap: number, cooldown: number) {
  const bank = adBank(drop, now, cap, cooldown);
  if (!bank.banked) return 0;
  drop.adBanked = 0;
  drop.adReadyAt = bank.full ? now + cooldown : bank.readyAt;
  return bank.banked;
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

/** The extra Gems lying on floor `at`. */
export const extraOn = (drop: GemDrop, at: GemFloor) => drop.extra.filter((o) => o.mode === at.mode && o.seed === at.seed && o.floor === at.floor);

/** The hero of a run stands on floor `at` at `now`: a Gem left on another
 * floor of that run (or an earlier one) is missed (an extra one gone for
 * good), and on a new floor, once the cooldown is over, returns whether a
 * Gem appears here. */
export function reachFloor(drop: GemDrop, at: GemFloor, now: number): boolean {
  if (drop.out?.mode === at.mode && !gemOn(drop, at)) missGem(drop);
  drop.extra = drop.extra.filter((o) => o.mode !== at.mode || (o.seed === at.seed && o.floor === at.floor));
  if (!isNewFloor(drop, at)) return false;
  drop.reached[at.mode] = { seed: at.seed, floor: at.floor };
  if (drop.out || now < drop.readyAt) return false;
  if (drop.wait > 0) drop.wait--;
  return drop.wait === 0;
}

/** Whether `at` is higher than the mode's run has reached before. */
export function isNewFloor(drop: GemDrop, at: GemFloor) {
  const r = drop.reached[at.mode];
  return !r || r.seed !== at.seed || at.floor > r.floor;
}

/** The Gem was collected: none lies out, and the next waits out the cooldown. */
export function collectedGem(drop: GemDrop, now: number, often = 1) {
  drop.out = null;
  drop.wait = 0;
  // Gems appearing `often` times as often wait that much less.
  drop.readyAt = now + Math.round(GEM_COOLDOWN_MS / often);
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

/** A plain floor tile for a Gem Chance Gem, in a side room where there is
 * one: of the tiles the hero at `from` can walk to in `rows` through doors
 * and monsters (as if every one were open), the plain floor tiles furthest
 * off the main way, the shortest walk from the hero to the stairs (in the
 * Delve, to the furthest row ahead), never the hero's own tile nor one in
 * `taken`. With every tile on the main way, any plain tile. `rng` picks
 * among the ties. Null when there is none. */
export function sideSpot(board: Board, from: Spot, rows: GemRows, rng: () => number, taken: readonly Spot[] = []): Spot | null {
  const key = (s: Spot) => `${s.x},${s.y}`, index = new Map([[key(from), 0]]), tiles: Spot[] = [from], parent = [-1];
  for (let i = 0; i < tiles.length; i++) {
    // Nothing walks on through the stairs.
    if (i > 0 && board.tile(tiles[i].x, tiles[i].y).kind === "stairs") continue;
    for (const [dx, dy] of DIRECTIONS) {
      const next = board.step(tiles[i].x, tiles[i].y, dx, dy);
      if (!next || next.y < rows.minY || next.y > rows.maxY || index.has(key(next)) || board.tile(next.x, next.y).kind === "wall") continue;
      index.set(key(next), tiles.length);
      tiles.push(next);
      parent.push(i);
    }
  }
  // The main way ends at the stairs, or the furthest row ahead (the first such found).
  let end = tiles.findIndex((t, i) => i > 0 && board.tile(t.x, t.y).kind === "stairs");
  if (end < 0) end = tiles.reduce((best, t, i) => (t.y > tiles[best].y ? i : best), 0);
  const off = new Int32Array(tiles.length).fill(-1), queue: number[] = [];
  for (let i = end; i >= 0; i = parent[i]) {
    off[i] = 0;
    queue.push(i);
  }
  // How far each tile lies off the main way, walking.
  for (let q = 0; q < queue.length; q++) {
    const at = tiles[queue[q]];
    for (const [dx, dy] of DIRECTIONS) {
      const next = board.step(at.x, at.y, dx, dy), n = next ? index.get(key(next)) : undefined;
      if (n === undefined || off[n] >= 0) continue;
      off[n] = off[queue[q]] + 1;
      queue.push(n);
    }
  }
  const used = new Set(taken.map(key));
  const plain = tiles.map((_, i) => i).filter((i) => i > 0 && board.tile(tiles[i].x, tiles[i].y).kind === "floor" && !used.has(key(tiles[i])));
  if (!plain.length) return null;
  const furthest = Math.max(...plain.map((i) => off[i]));
  const best = plain.filter((i) => off[i] === furthest);
  return { ...tiles[best[Math.floor(rng() * best.length)]] };
}
