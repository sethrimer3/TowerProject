/** Armored enemies, from the sixth tower and delve up (docs/ENEMY_SCHEDULE.md):
 * any enemy but a boss or Greater Boss may be Armored, on a tile roll of its
 * own, so it may be Fast, Ranged, Flying or Shielded as well. An Armored
 * enemy has `ARMORED_DEF` times its DEF, multiplying its strength, profile
 * and tier. A boss never is: it stands on the only way up, where a DEF past
 * the hero's ATK would end the climb. Each tile's roll is a fixed number of
 * the run seed, the floor and the tile (`ARMORED_SALT`). */
import { ARMORED_DEF } from "../combat.ts";
import type { Tile } from "../entities.ts";
import { snap } from "../exact.ts";
import { tileRandom } from "../random.ts";
import { mayBeFast } from "./fast.ts";
import { flyingShare } from "./flying.ts";

const ARMORED_SALT = 0xa53c0;
/** The first tier with Armored enemies. */
export const ARMORED_TIER = 6;

/** The share of enemies that are Armored on equivalent floor `floor` (from 1)
 * of tier `tier`, in thousandths of a percent: the Flying share of the tier
 * below (12.75% on the sixth tier's floor 1), growing as it does. */
export const armoredShare = (tier: number, floor: number) => (tier < ARMORED_TIER ? 0 : flyingShare(tier - 1, floor));

/** Whether an enemy may be Armored: anything but a boss or Greater Boss. */
export const mayBeArmored = mayBeFast;

/** Whether the enemy at (x, y) on equivalent floor `floor` of tier `tier`
 * is Armored, for a run of seed `seed`. */
export function rollsArmored(seed: number, tier: number, floor: number, x: number, y: number) {
  const share = armoredShare(tier, floor);
  return share > 0 && tileRandom(x, y, (seed ^ ARMORED_SALT ^ Math.imul(floor, 0x9e3779b1)) | 0) * 100_000 < share;
}

/** `cells` (as they stand in tier `tier`, `tierCells`) with each enemy that
 * rolls Armored made Armored, its DEF multiplied; `floorAt` gives each tile's
 * equivalent floor. The same map below the sixth tier. */
export function armoredCells(cells: Map<string, Tile>, tier: number, seed: number, floorAt: (x: number, y: number) => number) {
  if (tier < ARMORED_TIER) return cells;
  const out = new Map<string, Tile>();
  for (const [k, t] of cells) {
    const e = t.kind === "enemy" ? t.enemy : undefined;
    if (e && mayBeArmored(e)) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      if (rollsArmored(seed, tier, floorAt(x, y), x, y)) {
        out.set(k, { ...t, enemy: { ...e, armored: true, defense: snap(e.defense * ARMORED_DEF) } });
        continue;
      }
    }
    out.set(k, t);
  }
  return out;
}
