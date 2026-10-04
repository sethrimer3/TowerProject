import { point, type Point, type Tile } from "../entities.ts";
import { getTowerGateEnemy } from "../scaling.ts";
import { tierTile } from "../tiers.ts";
import type { RoomWorld } from "./room-world.ts";

/** A Tower floor's secret: once every torch on it is out, a Greater Boss
 * appears in front of the stairs. Whether `floor` calls one now: it had
 * torches, all are out, and none has appeared on it this run (`summoned`,
 * the run's heights). */
export const callsGreaterBoss = (floor: RoomWorld, summoned: readonly number[] | undefined) =>
  floor.torches.length > 0 && floor.torches.every((t) => !t.active) && !summoned?.includes(floor.room);

/** Where the Greater Boss appears: the plain floor tile nearest the stairs
 * up by walk over every tile but walls, never one in `taken` (the hero, a
 * Gem); null when the floor has no stairs or no such tile. */
export function greaterBossSpot(floor: RoomWorld, taken: readonly Point[]): Point | null {
  let stairs: Point | null = null;
  for (let y = 0; y < floor.height && !stairs; y++)
    for (let x = 0; x < floor.width; x++) if (floor.tile(x, y).kind === "stairs") stairs = { x, y };
  if (!stairs) return null;
  const blocked = new Set(taken.map((t) => point(t.x, t.y)));
  const seen = new Set([point(stairs.x, stairs.y)]), walk = [stairs];
  for (let i = 0; i < walk.length; i++) {
    const from = walk[i]!;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const next = floor.step(from.x, from.y, dx, dy);
      if (!next || seen.has(point(next.x, next.y))) continue;
      seen.add(point(next.x, next.y));
      const kind = floor.tile(next.x, next.y).kind;
      if (kind === "wall") continue;
      if (kind === "floor" && !blocked.has(point(next.x, next.y))) return next;
      walk.push(next);
    }
  }
  return null;
}

/** The Greater Boss of `floor`: its floor's boss with GREATER_BOSS_OVER_BOSS
 * times the HP and ATK (`bossFactor`) and DEF, in the floor's tier. */
export const greaterBoss = (floor: RoomWorld): Tile =>
  tierTile({ kind: "enemy", enemy: getTowerGateEnemy(floor.room, "greaterBoss", "balanced") }, floor.tier);
