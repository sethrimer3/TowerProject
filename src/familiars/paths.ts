import { TOWER_HEIGHT, TOWER_WIDTH } from "../config.ts";
import type { Point } from "../entities.ts";
import { pointing } from "../exact.ts";
import { tileRandom } from "../random.ts";
import type { FamiliarId } from "./catalog.ts";

// Where familiars are (docs/agents/familiars.md): each path is worked out from
// the turns that familiar has moved alone, as an offset from the middle of the
// room, rows rising. Where a familiar is decides play, so it is exact in every
// engine: `pointing`'s sines and cosines, never Math's. A fraction of a turn
// gives the place between two turns, for drawing.

/** The familiars that fly a path; the Wolf follows the hero instead. */
export type Roamer = Exclude<FamiliarId, "wolf">;

/** Half the room, to its outer edge. The Delve's is a room of the Tower's size round the hero. */
export const HALF_ROOM = Math.min(TOWER_WIDTH, TOWER_HEIGHT) / 2;
/** A Tower room's middle, by tile centers. */
export const ROOM_MIDDLE: Point = { x: (TOWER_WIDTH - 1) / 2, y: (TOWER_HEIGHT - 1) / 2 };

/** The turns each takes to come round. */
export const CIRCUIT: Readonly<Record<Roamer, number>> = { dragon: 100, slime: 60, falcon: 50, wisp: 80 };
/** How near the room's edge each comes, at its path's farthest. */
export const EDGE_GAP: Readonly<Record<FamiliarId, number>> = { dragon: 4, slime: 3, wolf: 4, falcon: 4, wisp: 4 };
/** How far each reaches from the middle. */
const tip = (id: FamiliarId) => HALF_ROOM - EDGE_GAP[id];
/** How far the middle of the Falcon's circle stands from the room's. */
export const FALCON_OFFSET = 2;

/** A path's whole shape turns a degree a turn. */
const orientation = (turns: number) => turns % 360;
function turned(p: Point, degrees: number): Point {
  const { x: sin, y: cos } = pointing(degrees);
  return { x: p.x * cos + p.y * sin, y: p.y * cos - p.x * sin };
}

/** The Dragon's five petals: the hypotrochoid of R 5, r 3 and d 2, which
 * passes through the middle and closes over three of the rolling circle's turns. */
function petals(done: number, reach: number): Point {
  const around = pointing(done * 1080), rolled = pointing(done * 720);
  return { x: (reach * (around.y + rolled.y)) / 2, y: (reach * (around.x - rolled.x)) / 2 };
}

/** The Slime's triangle, at an even pace along each side. */
function triangle(done: number, reach: number): Point {
  const along = done * 3, side = Math.floor(along), t = along - side;
  const from = pointing(side * 120), to = pointing((side + 1) * 120);
  return { x: reach * (from.x + (to.x - from.x) * t), y: reach * (from.y + (to.y - from.y) * t) };
}

/** The Wisp's figure-eight through the middle. */
function eight(done: number, reach: number): Point {
  const { x: sin, y: cos } = pointing(done * 360);
  return { x: reach * sin, y: reach * sin * cos };
}

/** Where `id` is from the room's middle, `turns` along its path. */
export function pathOffset(id: Roamer, turns: number): Point {
  const done = (turns % CIRCUIT[id]) / CIRCUIT[id], angle = orientation(turns), reach = tip(id);
  if (id === "dragon") return turned(petals(done, reach), angle);
  if (id === "slime") return turned(triangle(done, reach), angle);
  if (id === "wisp") return turned(eight(done, reach), angle);
  // The Falcon's circle, its middle on a circle of its own.
  const middle = pointing(angle), round = pointing(done * 360), radius = reach - FALCON_OFFSET;
  return { x: middle.x * FALCON_OFFSET + round.x * radius, y: middle.y * FALCON_OFFSET + round.y * radius };
}

/** Salts the run seed for the Wolf's angles. */
const WOLF_SALT = 0x3017f;
/** The angle of the Wolf's dash number `cast`, in degrees, fixed by the run's seed. */
export const wolfAngle = (seed: number, cast: number) => Math.floor(tileRandom(cast, 0, (seed ^ WOLF_SALT) | 0) * 36_000) / 100;

/** Where the Wolf dashes to from the middle: where a ray at `degrees` meets
 * the square four tiles in from the room's edge. */
export function wolfOffset(degrees: number): Point {
  const { x, y } = pointing(degrees), scale = tip("wolf") / Math.max(Math.abs(x), Math.abs(y));
  return { x: x * scale, y: y * scale };
}
