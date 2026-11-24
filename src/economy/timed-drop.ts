import type { Mode } from "../entities.ts";
import { time, whole, wholeIn } from "../save/decode.ts";

/** A find that turns up on a run's floors on a wall-clock cooldown, one at
 * a time: the floor Gem (`gems.ts`) and the Golden Scarab (`scarabs.ts`).
 * Once its cooldown is over it appears on the next floor new to the run;
 * missed (its floor left behind), the next comes some new floors on;
 * collected, the cooldown starts again. None of it belongs to a run. */

/** A floor of a mode's run: where a find belongs. */
export type FloorAt = { mode: Mode; seed: number; floor: number };
/** A find lying on a floor, at a tile. */
export type FloorSpot = FloorAt & { x: number; y: number };

export type TimedDrop<S extends FloorSpot = FloorSpot> = {
  /** When the next may appear on a new floor (wall clock, ms): the last
   * one collected, plus the cooldown. */
  readyAt: number;
  /** New floors still to reach, once ready, before the next appears: 0 on
   * the next one; after one is missed, the missed count. */
  wait: number;
  /** The one lying on a floor, if any. */
  out: S | null;
  /** The furthest floor each mode's run has reached, so only a new one
   * counts (not a floor gone back to). */
  reached: Record<Mode, { seed: number; floor: number } | null>;
};

export const defaultTimedDrop = (): TimedDrop => ({ readyAt: 0, wait: 0, out: null, reached: { tower: null, delve: null } });

const modeOf = (m: unknown): m is Mode => m === "tower" || m === "delve";
/** A saved run-and-floor, or null. */
export function reachedOf(r: any) {
  return r && whole(r.seed) && whole(r.floor) ? { seed: r.seed as number, floor: r.floor as number } : null;
}
/** A saved find's place: a mode's run and floor, and a tile. */
export function spotOf(o: any): FloorSpot | null {
  const spot = reachedOf(o);
  if (!spot || !modeOf(o.mode) || !Number.isInteger(o.x) || !Number.isInteger(o.y)) return null;
  return { mode: o.mode, ...spot, x: o.x, y: o.y };
}
/** The saved timer fields onto `d`: anything malformed keeps its default. */
export function decodeTimedFields(raw: any, d: TimedDrop<any>, missed: number) {
  d.readyAt = time(raw.readyAt);
  if (wholeIn(raw.wait, 0, missed)) d.wait = raw.wait;
  d.reached = { tower: reachedOf(raw.reached?.tower), delve: reachedOf(raw.reached?.delve) };
}

/** The find lying on floor `at`, if any. */
export function spotOn<S extends FloorSpot>(drop: TimedDrop<S>, at: FloorAt): S | null {
  const o = drop.out;
  return o && o.mode === at.mode && o.seed === at.seed && o.floor === at.floor ? o : null;
}

/** The find lying out was missed: it is gone, and another is owed `missed` new floors on. */
export function missDrop(drop: TimedDrop<any>, missed: number) {
  drop.out = null;
  drop.wait = missed;
}

/** Whether `at` is higher than the mode's run has reached before. */
export function isNewFloor(drop: TimedDrop<any>, at: FloorAt) {
  const r = drop.reached[at.mode];
  return !r || r.seed !== at.seed || at.floor > r.floor;
}

/** The hero of a run stands on floor `at` at `now`: a find left on another
 * floor of that run (or an earlier one) is missed, `missed` new floors
 * owed for the next, and on a new floor, once the cooldown is over,
 * returns whether one appears here. */
export function reachTimedFloor(drop: TimedDrop<any>, at: FloorAt, now: number, missed: number): boolean {
  if (drop.out?.mode === at.mode && !spotOn(drop, at)) missDrop(drop, missed);
  if (!isNewFloor(drop, at)) return false;
  drop.reached[at.mode] = { seed: at.seed, floor: at.floor };
  if (drop.out || now < drop.readyAt) return false;
  if (drop.wait > 0) drop.wait--;
  return drop.wait === 0;
}

/** The find was collected at `now`: none lies out, and the next waits out `cooldown` ms. */
export function collectedDrop(drop: TimedDrop<any>, now: number, cooldown: number) {
  drop.out = null;
  drop.wait = 0;
  drop.readyAt = now + cooldown;
}
