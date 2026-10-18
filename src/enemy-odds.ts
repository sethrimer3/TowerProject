/** What enemies a floor can roll, as the enemy stats box shows them
 * (`ui/enemy-odds-box.ts`): each strength's chance and a balanced one's
 * stats and Gold, and each trait's chance with its speeds. Read from the
 * same schedules generation rolls by (docs/ENEMY_SCHEDULE.md). */
import type { Enemy, EnemyStrength } from "./entities.ts";
import { enemyShare, RANKED_STRENGTHS } from "./enemy-schedule.ts";
import { fastShare } from "./fast-enemies.ts";
import { FOE_GAIN, foeShotCost, rangedShare } from "./ranged.ts";
import { flyingShare } from "./flying.ts";
import { shieldShare } from "./shielded.ts";
import { isBossFloor } from "./tower/index.ts";
import { snap } from "./exact.ts";

/** A strength's row: its chance in percent (for the shared-out strengths,
 * its share of the floor's enemies; a boss's, whether the floor is one a
 * boss guards; a Greater Boss's, 100 once it has appeared), and a
 * balanced enemy of it as the board makes it, with the Gold its kill pays. */
export type StrengthOdds = { strength: EnemyStrength; chance: number; hp: number; attack: number; defense: number; gold: number };
export type Trait = "fast" | "ranged" | "shielded" | "flying" | "aggroed";
/** A trait's row: its chance in percent (an enemy's, but Shielded's, which
 * is the floor's chance of holding one), and the shots (Ranged, Flying) or
 * steps (Aggroed) it takes every 10 turns. */
export type TraitOdds = { trait: Trait; chance: number; attackSpeed?: number; moveSpeed?: number };

/** What the odds are read from: the tier, the equivalent floor (from 0),
 * a balanced enemy of each strength as the board makes it there, the Gold
 * its kill pays, and whether a Greater Boss has appeared on the floor. */
export type OddsSource = {
  tier: number;
  floor: number;
  enemy: (strength: EnemyStrength) => Enemy;
  gold: (enemy: Enemy) => number;
  greaterBoss: boolean;
};

/** Each strength the floor can roll, weakest first, those it can't left
 * out but the boss, kept at 0%; the Greater Boss after it once it has appeared. */
export function strengthOdds(s: OddsSource): StrengthOdds[] {
  const row = (strength: EnemyStrength, chance: number): StrengthOdds => {
    const e = s.enemy(strength);
    return { strength, chance, hp: e.hp, attack: e.attack, defense: e.defense, gold: s.gold(e) };
  };
  const ranked = RANKED_STRENGTHS.map((k) => ({ k, chance: enemyShare(k, s.floor, s.tier) })).filter((r) => r.chance > 0);
  return [
    ...ranked.map((r) => row(r.k, r.chance)),
    row("boss", isBossFloor(s.floor) ? 100 : 0),
    ...(s.greaterBoss ? [row("greaterBoss", 100)] : []),
  ];
}

/** Shots or steps every 10 turns, for a cooldown of `cost` charge units
 * gaining `FOE_GAIN` a turn. */
const per10Turns = (cost: number) => snap((10 * FOE_GAIN) / cost);

/** The traits the floor can roll, those at 0% left out, but Aggroed, shown
 * at 0% wherever an enemy can become Aggroed (a Flying one, once an arrow
 * wounds it), since none appears so. A Flying roll comes first and the Fast
 * and Ranged rolls pass Flying enemies by, so theirs are of the rest. */
export function traitOdds(tier: number, floor: number): TraitOdds[] {
  const f = floor + 1, flying = flyingShare(tier, f) / 1000, rest = 1 - flying / 100;
  const speed = per10Turns(foeShotCost(f));
  const rows: TraitOdds[] = [
    { trait: "fast", chance: snap((fastShare(tier, f) / 1000) * rest) },
    { trait: "ranged", chance: snap((rangedShare(tier, f) / 1000) * rest), attackSpeed: speed },
    { trait: "shielded", chance: snap(shieldShare(tier, f) / 1000) },
    { trait: "flying", chance: snap(flying), attackSpeed: speed },
  ];
  return [...rows.filter((r) => r.chance > 0), ...(flying > 0 ? [{ trait: "aggroed" as const, chance: 0, moveSpeed: speed }] : [])];
}
