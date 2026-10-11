/** Fast enemies, from the second tower and delve up (docs/ENEMY_SCHEDULE.md):
 * any enemy but a boss or Greater Boss may be Fast. A Fast enemy strikes
 * first in every fight (`bout` in combat.ts), so even an enemy the hero
 * fells in one strike lands a blow, and it strikes with at least `fastCarry`
 * ATK, a share of the last tower's floor-100 enemy, so a hero fresh from
 * that tower's boss still feels the next tower's first floors. Past the
 * floor where the curve outgrows the carry, Fast changes no stats. Each
 * tile's roll is a fixed number of the run seed, the floor and the tile
 * (`FAST_SALT`), so no other part of generation draws differently. */
import type { Enemy, Tile } from "./entities.ts";
import { enemyStats, STEPS_PER_FLOOR, type CurveMode } from "./enemy-curves.ts";
import { snap } from "./exact.ts";
import { tileRandom } from "./random.ts";
import { tierStats } from "./tiers.ts";

/** How many times the last tier's floor-100 normal, balanced enemy's ATK a
 * Fast enemy strikes with at least. */
export const FAST_CARRY = 1.75;
const FAST_SALT = 0xfa57e;

/** The share of enemies that are Fast on equivalent floor `floor` (from 1)
 * of tier `tier`, in thousandths of a percent: 4% on the second tier's floor
 * 1, growing 1% every 200 floors (a little each floor) to 20%, and each
 * tier after starting and stopping half a point higher. None in the first. */
export function fastShare(tier: number, floor: number) {
  if (tier < 2) return 0;
  const later = 500 * (tier - 2);
  return Math.min(20_000 + later, 4_000 + later + 5 * Math.max(0, floor - 1));
}

/** The least ATK a Fast enemy of `mode`'s tier `tier` strikes with: `FAST_CARRY`
 * times the tier below's floor-100 normal, balanced enemy's ATK, in this
 * tier's own units (700 in Tower II, 3,500 in III). */
export const fastCarry = (mode: CurveMode, tier: number) =>
  tier < 2 ? 0 : snap(FAST_CARRY * enemyStats(mode, tier - 1, 99 * STEPS_PER_FLOOR[mode], "normal", "balanced").attack * tierStats(tier - 1));

/** Whether `enemy` may be Fast: anything but a boss or Greater Boss. */
export const mayBeFast = (enemy: Enemy) => enemy.strength !== "boss" && enemy.strength !== "greaterBoss";

/** Whether the enemy at (x, y) on equivalent floor `floor` of tier `tier`
 * is Fast, for a run of seed `seed`. */
export function rollsFast(seed: number, tier: number, floor: number, x: number, y: number) {
  const share = fastShare(tier, floor);
  return share > 0 && tileRandom(x, y, (seed ^ FAST_SALT ^ Math.imul(floor, 0x9e3779b1)) | 0) * 100_000 < share;
}

/** `cells` (as they stand in tier `tier`, `tierCells`) with each enemy that
 * rolls Fast made Fast, its ATK raised to `fastCarry`; `floorAt` gives each
 * tile's equivalent floor. The same map in the first tier. */
export function fastCells(cells: Map<string, Tile>, mode: CurveMode, tier: number, seed: number, floorAt: (x: number, y: number) => number) {
  if (tier < 2) return cells;
  const carry = fastCarry(mode, tier), out = new Map<string, Tile>();
  for (const [k, t] of cells) {
    const e = t.kind === "enemy" ? t.enemy : undefined;
    if (e && mayBeFast(e)) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      if (rollsFast(seed, tier, floorAt(x, y), x, y)) {
        out.set(k, { ...t, enemy: { ...e, fast: true, attack: Math.max(e.attack, carry) } });
        continue;
      }
    }
    out.set(k, t);
  }
  return out;
}
