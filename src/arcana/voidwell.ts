import { isBoss } from "../combat.ts";
import { pointing } from "../exact.ts";
import type { Point, Tile } from "../entities.ts";
import { tileRandom } from "../random.ts";
import { isRecord, wholeIn } from "../save/decode.ts";

// Voidwell (docs/agents/arcana.md): its cooldown opens a vortex out on the floor, at
// the hero's shot range and a random angle, which stands where it opened for a number
// of turns and stuns the enemies within it. Where it lies decides play, so its place is
// exact arithmetic in every engine. This module is its rules: it reads nothing of the
// game but what it is given.

/** A vortex standing: its center in tiles, not bound to whole tiles, and its turns
 * left, which a new floor doesn't interrupt; with Extra Voidwell, its `twin`'s
 * center, opposite it across the hero as they opened, lasting as long. */
export type Vortex = { x: number; y: number; left: number; twin?: Point };
/** What a run keeps of Voidwell, in the run so undo takes it back with what it stunned:
 * the cooldown's turns left, the activations so far, and the vortex (absent with none). */
export type VoidwellRun = { timer?: number; casts?: number; vortex?: Vortex };
/** A vortex as the board reads it: its center, radius in tiles, the width the
 * board's columns wrap by (0: none), and its twin's center, if it has one. */
export type VortexZone = { x: number; y: number; radius: number; wrap: number; twin?: Point };
/** The tiles a floor spans, by their centers. */
export type FloorBounds = { left: number; right: number; bottom: number; top: number };

/** Salts the run seed for each vortex's roll. */
const VOIDWELL_SALT = 0x701d;
/** The angles a vortex can open at, evenly spread. */
const ANGLES = 720;
/** How far the distance changes at a time, in tiles, when no angle fits. */
const DISTANCE_STEP = 0.25;
/** The narrowest angle a vortex and its twin may lie apart, seen from the hero, in
 * `ANGLES`' steps: 30 degrees. */
const NARROWEST_PAIR = ANGLES / 12;
/** The unit vectors of `ANGLES`, in the same bits in every engine. */
const UNITS = Array.from({ length: ANGLES }, (_, i) => pointing((i * 360) / ANGLES));

/** The number that fixes activation `cast`'s angle, by the run's seed. */
export const voidwellRoll = (seed: number, cast: number) => tileRandom(cast, 0, (seed ^ VOIDWELL_SALT) | 0);

/** The smallest bounds of `tiles`, if there are any. */
export function boundsOf(tiles: readonly Point[]): FloorBounds | undefined {
  if (!tiles.length) return undefined;
  const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
}

/** Where a vortex opens: `distance` tiles from `hero`, at the `roll`'s pick of the
 * angles that keep it on the floor, its edge at most a tile past the floor's in any
 * direction (and, given `fits`, anywhere it says). If no angle does, the distance
 * shrinks until one does, or, if the hero stands too far from any place it fits, grows
 * to the nearest. A vortex too wide for the floor lies across its middle. */
export function placeVortex({ hero, distance, radius, bounds, roll, fits }: Placing): Point {
  const { minX, maxX, minY, maxY, allowed } = allowedCenters(radius, bounds, fits);
  const at = (d: number) => openAt(hero, d, roll, allowed);
  const farX = Math.max(Math.abs(minX - hero.x), Math.abs(maxX - hero.x)), farY = Math.max(Math.abs(minY - hero.y), Math.abs(maxY - hero.y));
  const farthest = Math.sqrt(farX * farX + farY * farY);
  for (let d = Math.min(distance, farthest); d > 0; d -= DISTANCE_STEP) {
    const found = at(d);
    if (found) return found;
  }
  for (let d = distance + DISTANCE_STEP; d <= farthest; d += DISTANCE_STEP) {
    const found = at(d);
    if (found) return found;
  }
  // Nothing on the steps: the place that fits nearest the hero.
  return { x: Math.min(maxX, Math.max(minX, hero.x)), y: Math.min(maxY, Math.max(minY, hero.y)) };
}

/** What placing a vortex goes by. */
type Placing = { hero: Point; distance: number; radius: number; bounds: FloorBounds; roll: number; fits?: (x: number, y: number) => boolean };

/** Where a vortex's center may lie: its edge at most a tile past the floor's (a tile's
 * center lies half a tile inside the floor's edge), across the middle of an axis it is
 * too wide for, and wherever `fits` says. */
function allowedCenters(radius: number, bounds: FloorBounds, fits?: (x: number, y: number) => boolean) {
  const span = (low: number, high: number) => {
    const min = low - 1.5 + radius, max = high + 1.5 - radius;
    return min <= max ? [min, max] as const : [(low + high) / 2, (low + high) / 2] as const;
  };
  const [minX, maxX] = span(bounds.left, bounds.right), [minY, maxY] = span(bounds.bottom, bounds.top);
  const allowed = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY && (!fits || fits(x, y));
  return { minX, maxX, minY, maxY, allowed };
}

/** The `roll`'s pick of the places `d` tiles from `hero`, at the angles `allowed` keeps. */
function openAt(hero: Point, d: number, roll: number, allowed: (x: number, y: number) => boolean): Point | undefined {
  const open = UNITS.filter((u) => allowed(hero.x + u.x * d, hero.y + u.y * d));
  if (!open.length) return undefined;
  const u = open[Math.floor(roll * open.length)]!;
  return { x: hero.x + u.x * d, y: hero.y + u.y * d };
}

/** The `roll`'s pick of the pairs of places `d` tiles from `hero`, at angles `allowed`
 * keeps, that lie the widest apart, seen from the hero, if that is at least
 * `NARROWEST_PAIR`: opposite each other where the floor allows it, else the two ends
 * of the arc that fits (beside a wall, along it; in a corner, the corner's arc). */
function widestPair(hero: Point, d: number, roll: number, allowed: (x: number, y: number) => boolean): (Point & { twin: Point }) | undefined {
  const open = UNITS.flatMap((u, i) => (allowed(hero.x + u.x * d, hero.y + u.y * d) ? [i] : []));
  let widest = NARROWEST_PAIR, pairs: [number, number][] = [];
  for (let a = 0; a < open.length; a++)
    for (let b = a + 1; b < open.length; b++) {
      const apart = open[b]! - open[a]!, angle = Math.min(apart, ANGLES - apart);
      if (angle > widest) [widest, pairs] = [angle, [[open[a]!, open[b]!]]];
      else if (angle === widest) pairs.push([open[a]!, open[b]!]);
    }
  if (!pairs.length) return undefined;
  const [a, b] = pairs[Math.floor(roll * pairs.length)]!, at = (i: number) => ({ x: hero.x + UNITS[i]!.x * d, y: hero.y + UNITS[i]!.y * d });
  return { ...at(a), twin: at(b) };
}

/** Where Voidwell opens: one vortex as `placeVortex` places it, and with `twin` (Extra
 * Voidwell) a second at the point opposite it across the hero. If that point isn't
 * allowed (the hero beside a wall or in a corner), the two lie at the same distance
 * as wide apart as the floor allows, at least 30 degrees, the hero between them (the
 * distance shrinking until they can); failing that, the first stays and its twin lies
 * opposite it all the same, past the floor's edge. */
export function placeVortices({ twin, ...placing }: Placing & { twin?: boolean }): Point & { twin?: Point } {
  const first = placeVortex(placing);
  if (!twin) return first;
  const { hero, radius, bounds, roll, fits } = placing, { allowed } = allowedCenters(radius, bounds, fits);
  const mirror = { x: hero.x * 2 - first.x, y: hero.y * 2 - first.y };
  if (allowed(mirror.x, mirror.y)) return { ...first, twin: mirror };
  const dx = first.x - hero.x, dy = first.y - hero.y;
  for (let d = Math.sqrt(dx * dx + dy * dy); d > 0; d -= DISTANCE_STEP) {
    const pair = widestPair(hero, d, roll, allowed);
    if (pair) return pair;
  }
  return { ...first, twin: mirror };
}

/** Whether the tile at (x, y) lies in `zone`, by Euclidean distance from the vortex's
 * center (or its twin's) to the tile's, round the wrap. */
export function inVortex({ x: cx, y: cy, radius, wrap, twin }: VortexZone, x: number, y: number) {
  const near = (px: number, py: number) => {
    const across = x - px, dx = wrap && Math.abs(across) > wrap / 2 ? across - Math.sign(across) * wrap : across, dy = y - py;
    return dx * dx + dy * dy <= radius * radius;
  };
  return near(cx, cy) || (!!twin && near(twin.x, twin.y));
}

/** `t` at (x, y) as a vortex makes it: an enemy in it is marked `stunned`, and a Flying
 * one comes down to its tile, where the hero can fight it; a boss or Greater Boss is
 * immune. Read as the board reads the tile and never saved, so the enemy is itself again
 * once the vortex ends. */
export function stunnedTile(t: Tile, x: number, y: number, vortex: (() => VortexZone | undefined) | undefined): Tile {
  if (!t.enemy && !t.flyer) return t;
  const zone = vortex?.();
  if (!zone || !inVortex(zone, x, y) || isBoss((t.enemy ?? t.flyer)!)) return t;
  if (t.enemy) return { ...t, enemy: { ...t.enemy, stunned: true } };
  const { flyer, ...floor } = t;
  return { ...floor, kind: "enemy", enemy: { ...flyer!, stunned: true } };
}

/** One turn of Voidwell: the vortex's turns run out, and the cooldown runs, restarting
 * the moment it runs out, which opens a new one in its place at where `place` says.
 * Returns whether it did. */
export function stepVoidwell(s: VoidwellRun, { duration, turns }: { duration: number; turns: number }, place: (cast: number) => Point & { twin?: Point }) {
  if (s.vortex) {
    if (s.vortex.left > 1) s.vortex.left--;
    else delete s.vortex;
  }
  const left = Math.min(s.timer ?? turns, turns) - 1;
  s.timer = left <= 0 ? turns : left;
  if (left > 0) return false;
  const cast = (s.casts = (s.casts ?? 0) + 1);
  s.vortex = { ...place(cast), left: duration };
  return true;
}

/** Switched off: the cooldown and the vortex are gone. */
export function clearVoidwell(s: VoidwellRun | undefined) {
  if (!s) return;
  delete s.timer;
  delete s.vortex;
}

const whole = (v: unknown) => v === undefined || wholeIn(v, 1, 1e12);
const validPoint = (v: unknown) => isRecord(v) && Number.isFinite(v.x) && Number.isFinite(v.y);
const validVortex = (v: unknown) => isRecord(v) && validPoint(v) && wholeIn(v.left, 1, 1e9) && (v.twin === undefined || validPoint(v.twin));
export const validVoidwell = (v: unknown): v is VoidwellRun => isRecord(v) && whole(v.timer) && whole(v.casts) && (v.vortex === undefined || validVortex(v.vortex));
