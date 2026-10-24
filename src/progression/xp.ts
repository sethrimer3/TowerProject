import { TOWER_SECTION } from "../config.ts";
import type { EnemyStrength } from "../entities.ts";
/** XP a beaten enemy pays per base amount, by its strength (the same
 * proportions as the forks' `GATE_VALUE`). */
export const XP_MULTIPLIER: Record<EnemyStrength, number> = { weak: 2, normal: 3, strong: 5, elite: 8, boss: 12, greaterBoss: 24 };
/** The base XP a kill pays on equivalent floor `floor` (0 is the first): 3,
 * rising with the square root of the floor (×2 by floor 30, ×3.3 by 100,
 * ×10 by 1000). The XP a level needs rises faster, so each floor is worth a
 * smaller share of a level than the one before. */
export const xpBase = (floor: number) => 3 * Math.sqrt(1 + Math.max(0, floor) / TOWER_SECTION);
/** XP a beaten enemy pays on equivalent floor `floor`, in both modes. */
export const xpForKill = (strength: EnemyStrength, floor: number) =>
  Math.round(xpBase(floor) * XP_MULTIPLIER[strength]);
/** The lifetime XP that reaches `level` on the base curve: 20 × level ×
 * (level + 1) × (1 + level / 5), written in whole numbers. It grows with the
 * cube of the level, faster than kills pay more on higher floors, so levels
 * come more slowly the higher the hero climbs, even replaying the floors
 * below. */
const baseXpForLevel = (level: number) => 4 * level * (level + 1) * (level + 5);
/** Levels in each band of the XP curve: a band's levels cost more than the
 * one's below it. */
const XP_BAND = 25;
/** The lifetime XP that reaches `level`: the base curve, each band of
 * `XP_BAND` levels past the first costing more than the band below, 25%
 * more for the second, 50% more again for the third, 75% for the fourth,
 * 100% for the fifth, and 25% more each band after (×1.25, ×1.875, ×3.28,
 * ×6.56, then ×8.2 the base cost past 125, ×10.25 past 150, …), rounded to
 * a whole number. */
export const xpForLevel = (level: number) => {
  let xp = 0, factor = 1;
  for (let band = 0, from = 0; from < level; band++) {
    if (band) factor *= band <= 4 ? 1 + band / 4 : 1.25;
    const to = Math.min(level, from + XP_BAND);
    xp += factor * (baseXpForLevel(to) - baseXpForLevel(from));
    from = to;
  }
  return Math.round(xp);
};
/** The level `xp` lifetime XP reaches, found among the exact whole-number
 * costs (a cube root could differ between engines). */
export function levelForXp(xp: number) {
  let low = 0, high = 1;
  while (xpForLevel(high) <= xp) high *= 2;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (xpForLevel(mid) <= xp) low = mid;
    else high = mid;
  }
  return low;
}
