/** The Tower's enemy schedule (docs/ENEMY_SCHEDULE.md): how many enemies a
 * floor holds and how strong they are, by tower and floor, as the door and
 * key schedule (`key-schedule.ts`) sets its doors and keys. Every number is a
 * whole percent, so every engine rolls the same. The Delve follows the tower
 * of its number by equivalent floor. Stats themselves come from the enemy
 * curves (`enemy-curves.ts`); this decides only who stands on a floor. */
import type { EnemyStrength } from "./entities.ts";
import type { EnemyProfile } from "./enemy-curves.ts";

/** The strengths the schedule shares out: every enemy but the bosses, which
 * stand where their floors put them. */
export type RankedStrength = "weak" | "normal" | "strong" | "elite";
export const RANKED_STRENGTHS: readonly RankedStrength[] = ["weak", "normal", "strong", "elite"];
/** The profiles the schedule shares out, in the order their shares list. */
export const PROFILES: readonly EnemyProfile[] = ["attackHeavy", "balanced", "defenseHeavy"];

export const ENEMY_SCHEDULE = {
  /** The first floor (counting from 1) strong and elite enemies stand on in
   * tower 1, and how many floors earlier each comes in each later tower. */
  first: { strong: [11, 1], elite: [41, 4] } as Record<"strong" | "elite", readonly [floor: number, earlierEachTower: number]>,
  /** Each strength's share of a floor's enemies, in percent; normal
   * enemies take what is left. Weak starts at `start` and falls by
   * `lessEachTower` each later tower and `less` every `every` floors; strong
   * and elite start at `start` on their first floor and rise `step` every
   * `every` floors after, up to `max`. */
  weak: { start: 40, lessEachTower: 3, less: 4, every: 100 },
  strong: { start: 20, step: 2, every: 100, max: 45 },
  elite: { start: 3, step: 1, every: 50, max: 20 },
  /** A floor's enemy count, in percent of what its generation places (the
   * baseline): one point more every `every` floors, up to `max` (three
   * times the baseline from floor 6,000). The same in every tower. */
  count: { every: 30, max: 300 },
  /** Each profile's share of a floor's enemies, in percent, whatever their
   * strength: balanced starts at `start` and falls by `lessEachTower` each
   * later tower and `less` every `every` floors, down to `min`; attack-heavy
   * and defense-heavy split the rest evenly (attack-heavy rounded down). */
  balanced: { start: 60, lessEachTower: 3, less: 2, every: 100, min: 20 },
};

/** The first floor (counting from 1) enemies of `strength` stand on in tower
 * `tower`: floor 1 for weak and normal ones. */
export function enemyFirstFloor(strength: RankedStrength, tower: number) {
  if (strength === "weak" || strength === "normal") return 1;
  const [floor, earlier] = ENEMY_SCHEDULE.first[strength];
  return Math.max(1, floor - earlier * (tower - 1));
}

/** The percent of floor `depth`'s (0 is the first) enemies of tower `tower`
 * that are of `strength`, bosses left out. The four add up to 100. */
export function enemyShare(strength: RankedStrength, depth: number, tower: number): number {
  if (strength === "normal") return 100 - (["weak", "strong", "elite"] as const).reduce((s, k) => s + enemyShare(k, depth, tower), 0);
  const s = ENEMY_SCHEDULE, floor = depth + 1;
  if (strength === "weak")
    return Math.max(0, s.weak.start - s.weak.lessEachTower * (tower - 1) - s.weak.less * Math.floor(depth / s.weak.every));
  const first = enemyFirstFloor(strength, tower);
  if (floor < first) return 0;
  const g = s[strength];
  return Math.min(g.max, g.start + g.step * Math.floor((floor - first) / g.every));
}

/** The percent of floor `depth`'s (0 is the first) enemies of tower `tower`
 * that wear `profile`, bosses left out. The three add up to 100. */
export function profileShare(profile: EnemyProfile, depth: number, tower: number): number {
  const b = ENEMY_SCHEDULE.balanced;
  const balanced = Math.max(b.min, b.start - b.lessEachTower * (tower - 1) - b.less * Math.floor(depth / b.every));
  if (profile === "balanced") return balanced;
  const attack = Math.floor((100 - balanced) / 2);
  return profile === "attackHeavy" ? attack : 100 - balanced - attack;
}

/** Floor `depth`'s (0 is the first) enemy count in percent of its baseline,
 * in every tower. */
export const enemyCountPercent = (depth: number) =>
  Math.min(ENEMY_SCHEDULE.count.max, 100 + Math.floor((depth + 1) / ENEMY_SCHEDULE.count.every));

/** Whether `strength` is one the schedule shares out. */
export const isRanked = (strength: EnemyStrength): strength is RankedStrength => (RANKED_STRENGTHS as readonly string[]).includes(strength);
