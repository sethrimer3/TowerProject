/** Shielded enemies, from the fourth tower and delve up (docs/ENEMY_SCHEDULE.md).
 *
 * A floor may hold one Shielded enemy: the enemy but a boss or Greater Boss
 * nearest the way up. It casts a bubble round itself, and while it stands,
 * the hero's strikes and arrows do `SHIELD_CUT` percent less (after DEF) to
 * every enemy whose tile lies within the bubble, itself included. When no
 * other enemy stands in the bubble, the floor may add standard enemies in
 * front of it, closer to the way in.
 *
 * Every roll is a fixed number of the run seed, the floor and (for where an
 * extra stands) the tile, so no other part of generation draws differently,
 * and everything stays whole numbers, the same in every engine. */
import { point, type Enemy, type Point, type Tile } from "../entities.ts";
import { tileRandom } from "../random.ts";

/** The percent a bubble cuts what the hero's strikes do, after DEF. */
export const SHIELD_CUT = 60;
const SHIELD_SALT = 0x5e1d0;
const EXTRA_SALT = 0x5e1d1;
const PLACE_SALT = 0x5e1d2;
/** The floor the bubble and the share stop growing. */
const SHIELD_TOP = 4000;

/** The chance a floor holds a Shielded enemy on equivalent floor `floor`
 * (from 1) of tier `tier`, in thousandths of a percent: 1% a tier (4% in
 * the fourth), and 1% more every 250 floors (a little each floor) to floor
 * 4,000 (20% there in the fourth). None below the fourth tier. */
export const shieldShare = (tier: number, floor: number) => (tier < 4 ? 0 : 1000 * tier + 4 * Math.min(floor, SHIELD_TOP));

/** The chance of a standard enemy added in front of a Shielded enemy alone
 * in its bubble, in thousandths of a percent: none on the fourth tier's
 * floor 1, 5% more a tier after, and 0.05% more a floor, without end. Each
 * whole 100% is one certain extra. */
export const extraShare = (tier: number, floor: number) => (tier < 4 ? 0 : 5000 * (tier - 4) + 50 * Math.max(0, floor - 1));

/** A bubble's reach squared, in two-thousandths of a tile: its radius is a
 * tile, half a tile more every 1,000 floors, 3 from floor 4,000. */
export const bubbleReach = (floor: number) => {
  const r = 2000 + Math.min(Math.max(floor, 0), SHIELD_TOP);
  return r * r;
};
/** A bubble's radius in tiles, for drawing. */
export const bubbleRadius = (floor: number) => Math.sqrt(bubbleReach(floor)) / 2000;
/** Whether a tile `dx`, `dy` away from a Shielded enemy on `floor` lies in its bubble. */
export const inBubble = (dx: number, dy: number, floor: number) => (dx * dx + dy * dy) * 4_000_000 <= bubbleReach(floor);
/** The most whole tiles a bubble reaches along a row or column. */
const BUBBLE_SPAN = 3;

/** A Shielded enemy's tile and the equivalent floor it stands on. */
export type Shield = { x: number; y: number; floor: number };

/** How far apart two columns are on a board `width` wide that wraps round
 * (no width: one that doesn't). */
const across = (x: number, at: number, width?: number) => {
  const d = Math.abs(x - at);
  return width ? Math.min(d, width - d) : d;
};

/** `tile` as the hero meets it: an enemy within the bubble of a Shielded
 * enemy still standing (`holds`) carries the bubble's `guard`. `width` is
 * given on a board that wraps round (the Delve). */
export function guardedTile(tile: Tile, x: number, y: number, shields: readonly Shield[], holds: (s: Shield) => boolean, width?: number): Tile {
  if (tile.kind !== "enemy" || !tile.enemy || !shields.length) return tile;
  for (const s of shields)
    if (inBubble(across(x, s.x, width), y - s.y, s.floor) && holds(s)) return { ...tile, enemy: { ...tile.enemy, guard: SHIELD_CUT } };
  return tile;
}
/** Whether `tile` as generated (or wounded) still holds a Shielded enemy. */
export const holdsShield = (tile: Tile | undefined) => tile?.kind === "enemy" && !!tile.enemy?.shielded;

/** One floor to give a Shielded enemy. */
export type ShieldFloor = {
  /** The generated tiles (a missing one is wall). */
  cells: ReadonlyMap<string, Tile>;
  width: number;
  /** Whether a row open at both edges wraps round (the Delve). */
  wraps: boolean;
  /** The floor's own tiles: whose enemies may be Shielded, and where extras may stand. */
  band: readonly Point[];
  /** How far a tile is from the way up (smaller is nearer; Infinity: no way). */
  toExit: (p: Point) => number;
  /** How far a tile is from the way in (smaller is nearer). */
  toEntrance: (p: Point) => number;
  /** Tiles never given an extra (round the way in, beside the stairs, torches). */
  avoid: ReadonlySet<string>;
  seed: number;
  tier: number;
  /** The equivalent floor (from 1). */
  floor: number;
  /** A standard enemy for a floor with no normal enemy to copy. */
  normal: (at: Point) => Enemy;
};

/** The ground a walk crosses. */
type Grid = Pick<ShieldFloor, "cells" | "width" | "wraps">;
const isBoss = (e: Enemy) => e.strength === "boss" || e.strength === "greaterBoss";
const floorSalt = (seed: number, salt: number, floor: number) => (seed ^ salt ^ Math.imul(floor, 0x9e3779b1)) | 0;

/** The four tiles beside `p` on `f`, a row open at both edges wrapping round. */
function neighbours(f: Grid, p: Point): Point[] {
  const out: Point[] = [];
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
    let x = p.x + dx;
    if (x < 0 || x >= f.width) {
      const open = (c: number) => (f.cells.get(point(c, p.y))?.kind ?? "wall") !== "wall";
      if (!f.wraps || !open(0) || !open(f.width - 1)) continue;
      x = (x + f.width) % f.width;
    }
    out.push({ x, y: p.y + dy });
  }
  return out;
}

/** Walking distances over `cells`' open tiles from `from` (doors and
 * enemies passable), by tile. */
export function walkDistances(cells: ReadonlyMap<string, Tile>, width: number, from: readonly Point[], wraps = false) {
  const f: Grid = { cells, width, wraps }, dist = new Map<string, number>(), queue: Point[] = [];
  for (const p of from) if (!dist.has(point(p.x, p.y))) dist.set(point(p.x, p.y), 0), queue.push(p);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!, d = dist.get(point(p.x, p.y))!;
    for (const n of neighbours(f, p)) {
      const k = point(n.x, n.y);
      if (dist.has(k) || (cells.get(k)?.kind ?? "wall") === "wall") continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

/** Rolls floor `f` for a Shielded enemy and, when it has one, marks it and
 * adds its extras into `placed` (by tile, over `f.cells`). Returns the
 * shield, or null. */
export function placeShield(f: ShieldFloor, placed: Map<string, Tile>): Shield | null {
  const share = shieldShare(f.tier, f.floor);
  if (share <= 0 || tileRandom(f.floor, f.tier, floorSalt(f.seed, SHIELD_SALT, f.floor)) * 100_000 >= share) return null;
  const at = (p: Point) => placed.get(point(p.x, p.y)) ?? f.cells.get(point(p.x, p.y));
  // The enemy nearest the way up, then the lowest row and column.
  let shielder: Point | null = null, best = Infinity;
  for (const p of f.band) {
    const e = at(p)?.enemy;
    if (at(p)?.kind !== "enemy" || !e || isBoss(e)) continue;
    const d = f.toExit(p);
    if (d < best || (d === best && shielder && (p.y < shielder.y || (p.y === shielder.y && p.x < shielder.x)))) shielder = p, best = d;
  }
  if (!shielder || best === Infinity) return null;
  const tile = at(shielder)!;
  placed.set(point(shielder.x, shielder.y), { ...tile, enemy: { ...tile.enemy!, shielded: true } });
  const shield: Shield = { x: shielder.x, y: shielder.y, floor: f.floor };

  const inBand = new Set(f.band.map((p) => point(p.x, p.y)));
  const bubble: Point[] = [];
  for (let dy = -BUBBLE_SPAN; dy <= BUBBLE_SPAN; dy++)
    for (let dx = -BUBBLE_SPAN; dx <= BUBBLE_SPAN; dx++) {
      if ((!dx && !dy) || !inBubble(dx, dy, f.floor)) continue;
      let x = shielder.x + dx;
      if (x < 0 || x >= f.width) {
        if (!f.wraps) continue;
        x = (x + f.width) % f.width;
      }
      bubble.push({ x, y: shielder.y + dy });
    }
  if (bubble.some((p) => at(p)?.kind === "enemy")) return shield;

  const chance = extraShare(f.tier, f.floor);
  let count = Math.floor(chance / 100_000);
  if (chance % 100_000 > 0 && tileRandom(f.tier, f.floor, floorSalt(f.seed, EXTRA_SALT, f.floor)) * 100_000 < chance % 100_000) count++;
  if (!count) return shield;

  // A copy of the floor's normal enemy nearest the Shielded one, or a standard enemy.
  let template: Enemy | null = null, near = Infinity;
  for (const p of f.band) {
    const e = at(p)?.enemy;
    if (at(p)?.kind !== "enemy" || e?.strength !== "normal" || e.shielded) continue;
    const dx = across(p.x, shielder.x, f.wraps ? f.width : undefined), dy = p.y - shielder.y, d = dx * dx + dy * dy;
    if (d < near) template = e, near = d;
  }
  const extra: Enemy = template ? { ...template } : f.normal(shielder);
  const ahead = f.toEntrance(shielder);
  const free = (p: Point) => {
    const k = point(p.x, p.y);
    return inBand.has(k) && !f.avoid.has(k) && at(p)?.kind === "floor" && f.toEntrance(p) < ahead;
  };
  for (let i = 0; i < count; i++) {
    // Inside the bubble, the open tile with the lowest roll; else the
    // nearest open tile on the way back toward the way in.
    let spot: Point | null = null, low = Infinity;
    for (const p of bubble) {
      if (!free(p)) continue;
      const roll = tileRandom(p.x, p.y, floorSalt(f.seed, PLACE_SALT, f.floor));
      if (roll < low) spot = p, low = roll;
    }
    spot ??= nearestBehind(f, shielder, free);
    if (!spot) break;
    placed.set(point(spot.x, spot.y), { kind: "enemy", enemy: { ...extra } });
  }
  return shield;
}

/** The open tile nearest `from` by walking (over the floor's own tiles,
 * through doors and enemies) that `free` accepts, or null. */
function nearestBehind(f: ShieldFloor, from: Point, free: (p: Point) => boolean): Point | null {
  const inBand = new Set(f.band.map((p) => point(p.x, p.y))), seen = new Set([point(from.x, from.y)]), queue = [from];
  for (let i = 0; i < queue.length; i++)
    for (const n of neighbours(f, queue[i]!)) {
      const k = point(n.x, n.y);
      if (seen.has(k) || !inBand.has(k) || (f.cells.get(k)?.kind ?? "wall") === "wall") continue;
      if (free(n)) return n;
      seen.add(k);
      queue.push(n);
    }
  return null;
}
