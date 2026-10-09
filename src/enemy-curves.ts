/** Every enemy's stats, in both modes, from one enemy curve per mode and
 * tier: a normal, balanced enemy's HP, ATK and DEF on each floor, which each
 * strength and profile then multiply (see docs/PROGRESSION_AND_DIFFICULTY.md).
 * Tune difficulty here: the anchors, the strength and profile tables, or a
 * tier's own curve in `ENEMY_CURVES`. The tier's ×3 factor (`tierStats`)
 * still applies on top, as the boards pass their cells through `tierCells`. */
import type { EnemyStrength } from "./entities.ts";
import { intPow, root } from "./exact.ts";

export type EnemyProfile = "attackHeavy" | "balanced" | "defenseHeavy";
export type EnemyStats = { hp: number; attack: number; defense: number };
/** The modes whose enemies come from a curve. */
export type CurveMode = "tower" | "delve";

/** `[floor, value]` pairs, floors counted from 1 (the Delve's equivalent
 * floors: depth / 10 + 1), in rising order. Between two anchors the value
 * changes by one constant rate a step. */
export type Anchors = readonly (readonly [floor: number, value: number])[];

/** What a strength multiplies the floor's balanced enemy by, read `ahead`
 * floors further along the curve (an elite: a visitor from the next zone). */
export type StrengthShape = EnemyStats & { ahead?: number };

export type EnemyCurve = {
  /** A normal, balanced enemy's HP and ATK: growth curves, whose last rate
   * carries on past the last anchor. */
  hp: Anchors;
  attack: Anchors;
  /** Its DEF as a share of its ATK: a multiplier curve, which holds its
   * last value past the last anchor, so DEF never outgrows ATK. */
  defenseOfAttack: Anchors;
  /** Each strength but the Greater Boss, which is twice the boss. */
  strength: Record<Exclude<EnemyStrength, "greaterBoss">, StrengthShape>;
  profile: Record<EnemyProfile, EnemyStats>;
};

/** How many times a boss's HP, ATK and DEF a Greater Boss has. */
export const GREATER_BOSS_OVER_BOSS = 2;

const SAME: EnemyStats = { hp: 1, attack: 1, defense: 1 };
const all = (k: number): EnemyStats => ({ hp: k, attack: k, defense: k });

/** The Tower's: strong is a hardened local, elite the next zone's enemy, and
 * a boss an endurance fight: four times a normal one's HP but only 1.75
 * times its ATK, so DEF beats it more than burst does. Profiles keep the
 * old zone rosters' ratios. */
const TOWER_SHAPES = {
  strength: {
    weak: all(0.75),
    normal: SAME,
    strong: all(1.25),
    elite: { ...SAME, ahead: 10 },
    boss: { hp: 4, attack: 1.75, defense: 1.3 },
  },
  profile: {
    attackHeavy: { hp: 15 / 16, attack: 4 / 3, defense: 1 / 2 },
    balanced: SAME,
    defenseHeavy: { hp: 9 / 8, attack: 5 / 6, defense: 3 / 2 },
  },
} satisfies Pick<EnemyCurve, "strength" | "profile">;

/** The Delve's: a strong enemy is half again as tough, an elite three times,
 * and a boss twice a strong one's HP and ATK. */
const DELVE_SHAPES = {
  strength: {
    weak: all(0.75),
    normal: SAME,
    strong: all(1.5),
    elite: all(3),
    boss: { hp: 3, attack: 3, defense: 1.5 },
  },
  profile: {
    attackHeavy: { hp: 0.85, attack: 1.4, defense: 1 },
    balanced: SAME,
    defenseHeavy: { hp: 1.1, attack: 0.7, defense: 1.5 },
  },
} satisfies Pick<EnemyCurve, "strength" | "profile">;

/** The normal, balanced enemy every tower and delve starts from: weaker on
 * floor 1, the old first zone's 32 HP / 12 ATK on floor 10, then growth that
 * slows past floor 100 (ATK) and 200 (HP); DEF from 0.17 of ATK to 0.21. */
const DEFAULT_BALANCED = {
  hp: [[1, 22], [10, 32], [100, 1300], [200, 55_000], [300, 323_000], [1000, 742_000_000]],
  attack: [[1, 8.4], [10, 12], [100, 400], [200, 3000], [300, 7700], [1000, 483_000]],
  defenseOfAttack: [[1, 0.17], [1000, 0.21]],
} satisfies Pick<EnemyCurve, "hp" | "attack" | "defenseOfAttack">;

/** Each mode's curve for every tier not given its own. */
export const DEFAULT_CURVE: Record<CurveMode, EnemyCurve> = {
  tower: { ...DEFAULT_BALANCED, ...TOWER_SHAPES },
  delve: { ...DEFAULT_BALANCED, ...DELVE_SHAPES },
};

/** A tier's own curve, by mode and tier number; a tier not listed here
 * uses its mode's `DEFAULT_CURVE`. */
export const ENEMY_CURVES: Record<CurveMode, Partial<Record<number, EnemyCurve>>> = { tower: {}, delve: {} };

export const enemyCurve = (mode: CurveMode, tier = 1): EnemyCurve => ENEMY_CURVES[mode][tier] ?? DEFAULT_CURVE[mode];

/** Steps a floor: the Tower climbs floors, the Delve depth (ten a floor). */
export const STEPS_PER_FLOOR: Record<CurveMode, number> = { tower: 1, delve: 10 };

/** Each band's rate a step, by anchors and steps a floor, worked out once. */
const rates = new WeakMap<Anchors, Map<number, number[]>>();
function bandRates(anchors: Anchors, perFloor: number) {
  let byStep = rates.get(anchors);
  if (!byStep) rates.set(anchors, (byStep = new Map()));
  let r = byStep.get(perFloor);
  if (!r) {
    r = anchors.slice(1).map(([floor, value], i) => root(value / anchors[i][1], (floor - anchors[i][0]) * perFloor));
    byStep.set(perFloor, r);
  }
  return r;
}

/** `anchors`' value at `step` (0 on floor 1), `perFloor` steps a floor.
 * Past the last anchor a growth curve carries on at its last rate and a
 * multiplier curve (`hold`) keeps its last value. */
export function curveAt(anchors: Anchors, step: number, perFloor: number, hold = false): number {
  const stepOf = (i: number) => (anchors[i][0] - 1) * perFloor;
  if (anchors.length === 1 || step <= 0) return anchors[0][1];
  const last = anchors.length - 1;
  if (hold && step >= stepOf(last)) return anchors[last][1];
  let i = 0;
  while (i < last - 1 && step > stepOf(i + 1)) i++;
  return anchors[i][1] * intPow(bandRates(anchors, perFloor)[i], step - stepOf(i));
}

const hundredths = (n: number) => Math.round(n * 100) / 100;

/** An enemy of `strength` and `profile` at `step` (a Tower floor counted
 * from 0, or a Delve depth) of `mode`'s tier `tier`, before the tier's
 * factor, rounded to hundredths. */
export function enemyStats(mode: CurveMode, tier: number, step: number, strength: EnemyStrength, profile: EnemyProfile): EnemyStats {
  if (strength === "greaterBoss") {
    const boss = enemyStats(mode, tier, step, "boss", profile);
    return { hp: boss.hp * GREATER_BOSS_OVER_BOSS, attack: boss.attack * GREATER_BOSS_OVER_BOSS, defense: boss.defense * GREATER_BOSS_OVER_BOSS };
  }
  const curve = enemyCurve(mode, tier), perFloor = STEPS_PER_FLOOR[mode];
  const shape = curve.strength[strength], look = curve.profile[profile];
  const at = Math.max(0, step) + (shape.ahead ?? 0) * perFloor;
  const attack = curveAt(curve.attack, at, perFloor);
  return {
    hp: hundredths(curveAt(curve.hp, at, perFloor) * shape.hp * look.hp),
    attack: hundredths(attack * shape.attack * look.attack),
    defense: hundredths(attack * curveAt(curve.defenseOfAttack, at, perFloor, true) * shape.defense * look.defense),
  };
}

/** How many of the floor's normal, balanced enemy's ATK a Wooden Door's
 * durability is. */
export const WOOD_DURABILITY_ATTACKS = 2;
/** A Wooden Door's durability at `step` of `mode`'s tier `tier`, before the
 * tier's factor (which `tierTile` applies, as to enemies). */
export const woodDurability = (mode: CurveMode, tier: number, step: number) =>
  hundredths(WOOD_DURABILITY_ATTACKS * enemyStats(mode, tier, step, "normal", "balanced").attack);

/** How many floors further along the curve `strength` reads its stats. */
export const floorsAhead = (mode: CurveMode, tier: number, strength: EnemyStrength) =>
  strength === "greaterBoss" ? 0 : (enemyCurve(mode, tier).strength[strength].ahead ?? 0);
