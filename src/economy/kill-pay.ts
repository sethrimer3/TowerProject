import { TOWER_SECTION } from "../config.ts";
import type { EnemyStrength, KeyColor } from "../entities.ts";
import { snap } from "../exact.ts";
/** Gold a beaten enemy pays, by its strength, in both modes: every victory
 * pays some, beside its Silver. A Greater Boss pays twice a boss's Gold,
 * Silver and XP. */
export const ENEMY_GOLD: Record<EnemyStrength, number> = { weak: 1, normal: 1, strong: 2, elite: 4, boss: 5, greaterBoss: 10 };
/** The Gold a Fast enemy pays more than its strength's (enemies/fast.ts). */
export const FAST_GOLD = 1;
/** The Gold a Ranged enemy pays more than its strength's (enemies/ranged.ts). */
export const RANGED_GOLD = 1;
/** The Gold a Shielded enemy pays more than its strength's (enemies/shielded.ts). */
export const SHIELDED_GOLD = 1;
/** The Gold an Armored enemy pays over its strength's. */
export const ARMORED_GOLD = 1;
/** Gold every item a run takes off the floor pays, before Gold Bonus and
 * the tier's bonus: a potion, a shard, a torch put out, a treasure chest
 * opened (not an area reward chest), a door without a colour (Heart,
 * Wooden, Steel) opened. */
export const PICKUP_GOLD = 1;
/** Gold a key of each colour pays when picked up, and a keyed door opened
 * the sum of its colours' (a Triune Door 6). */
export const KEY_GOLD: Record<KeyColor, number> = { yellow: 1, blue: 2, red: 3 };
/** Silver, the currency spent inside a run, that a beaten enemy pays per
 * base amount, by its strength. */
export const SILVER_MULTIPLIER: Record<EnemyStrength, number> = { weak: 1, normal: 2, strong: 3, elite: 4, boss: 5, greaterBoss: 10 };
/** The floor index (0 is the first) from which a kill's Silver rises half
 * as fast: floor 201. */
export const SILVER_SLOWDOWN_FLOOR = 200;
/** Silver a beaten weak enemy pays on equivalent floor `floor` (0 is the
 * first), rising smoothly with fractions kept: 2 on floor 1, 0.2 more a
 * floor (4 on floor 11, 42 on floor 201), then 0.1 more a floor. */
export const silverBase = (floor: number) => {
  const f = Math.max(0, floor), slow = SILVER_SLOWDOWN_FLOOR;
  return 2 * (f <= slow ? 1 + f / TOWER_SECTION : 1 + slow / TOWER_SECTION + (f - slow) / (2 * TOWER_SECTION));
};
/** Silver a beaten enemy pays on equivalent floor `floor`: the base,
 * times its strength's multiplier. */
export const silverForKill = (strength: EnemyStrength, floor: number) =>
  snap(silverBase(floor) * SILVER_MULTIPLIER[strength]);
/** Gold the Delve pays at a run's end: one for each treasure opened. */
export const goldReward = (treasures: number) => treasures;
