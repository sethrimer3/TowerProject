import type { Enemy, Tile } from "../entities.ts";
import { snap } from "../exact.ts";
import { drawAt } from "../random.ts";
import type { RunCore } from "../runs.ts";
import type { TrainingId } from "../progression/training.ts";
import { enemyStats, STEPS_PER_FLOOR, type CurveMode, type EnemyStats } from "./curves.ts";

/** Enemy Level Skips: each floor new to a run, the Enemy HP and Enemy Combat
 * Level Skip rows may each skip it, so enemies stand one floor lower on the
 * enemy curve in that row's stats for the rest of the run. Only their stats
 * change, as a tile is read: floors, layouts and saved maps stay as they are. */

export type LevelSkipKind = "hp" | "combat";
export const LEVEL_SKIP_KINDS: readonly LevelSkipKind[] = ["hp", "combat"];
/** The Training row that gives each kind its chance. */
export const LEVEL_SKIP_ROWS = { hp: "enemyHpSkip", combat: "enemyCombatSkip" } as const satisfies Record<LevelSkipKind, TrainingId>;
/** A kind's part of a run: the floors it has skipped, the draws it has taken
 * from its stream, and its chance added up, in hundredths of a percent. */
export type LevelSkip = { skips: number; draws: number; tally: number };
/** A run's skips, each kind absent until it first draws. */
export type LevelSkips = Partial<Record<LevelSkipKind, LevelSkip>>;

/** What a chance adds up to, in hundredths of a percent, before a skip comes
 * by itself: 100%, which every skip takes off the tally again. */
export const LEVEL_SKIP_SURE = 10_000;
/** The chance, in hundredths of a percent, from which a skip is left to its
 * roll alone: at 10%, chance alone doesn't leave long gaps. */
export const LEVEL_SKIP_PLAIN_FROM = 1_000;

/** Mixed into the run seed to start each kind's stream, so each rolls apart
 * but both replay from the run seed. */
const SALT: Record<LevelSkipKind, number> = { hp: 0x51c1b9, combat: 0xc0b47a };
/** The seed of `kind`'s stream in a run of seed `runSeed`. */
export const levelSkipSeed = (runSeed: number, kind: LevelSkipKind) => (runSeed ^ SALT[kind]) >>> 0;

/** One floor new to `run`, at a chance of `chance` hundredths of a percent:
 * whether `kind` skips it. No chance draws nothing. Below
 * `LEVEL_SKIP_PLAIN_FROM` the chance also adds up on the tally: its reaching
 * 100% skips the floor by itself, and any skip takes 100% off, so an early
 * one leaves the tally below zero and the next sure one that much further
 * off. From there on only the draw counts. */
export function rollLevelSkip(run: Pick<RunCore, "seed" | "levelSkips">, kind: LevelSkipKind, chance: number) {
  if (!chance) return false;
  const was = run.levelSkips?.[kind] ?? { skips: 0, draws: 0, tally: 0 };
  const drawn = drawAt(levelSkipSeed(run.seed, kind), was.draws) * LEVEL_SKIP_SURE < chance;
  const smoothed = chance < LEVEL_SKIP_PLAIN_FROM, tally = smoothed ? was.tally + chance : 0;
  const skip = drawn || tally >= LEVEL_SKIP_SURE;
  run.levelSkips = { ...run.levelSkips, [kind]: { skips: was.skips + (skip ? 1 : 0), draws: was.draws + 1, tally: skip && smoothed ? tally - LEVEL_SKIP_SURE : tally } };
  return skip;
}

/** The floors training row `id` has skipped in `run`, or null for a row that
 * isn't a Level Skip. */
export function levelSkipsOf(run: Pick<RunCore, "levelSkips">, id: TrainingId) {
  const kind = LEVEL_SKIP_KINDS.find((k) => LEVEL_SKIP_ROWS[k] === id);
  return kind ? run.levelSkips?.[kind]?.skips ?? 0 : null;
}

/** What skips multiply stats by, by enemy and floor: read for every enemy tile, every frame. */
const factors = new Map<string, EnemyStats>();
const FACTORS_KEPT = 4096;
function skipFactors(mode: CurveMode, tier: number, step: number, e: Enemy, hpSkips: number, combatSkips: number) {
  const key = `${mode}|${tier}|${step}|${e.strength}|${e.profile}|${hpSkips}|${combatSkips}`;
  let found = factors.get(key);
  if (!found) {
    const stats = (skips: number) => enemyStats(mode, tier, step - skips * STEPS_PER_FLOOR[mode], e.strength, e.profile ?? "balanced");
    const here = stats(0), hp = stats(hpSkips), combat = stats(combatSkips);
    found = { hp: hp.hp / here.hp, attack: combat.attack / here.attack, defense: combat.defense / here.defense };
    if (factors.size >= FACTORS_KEPT) factors.clear();
    factors.set(key, found);
  }
  return found;
}

/** `e`, standing at `step` of `mode`'s tier `tier`, as `skips` leave it: each
 * stat what the enemy curve gives that many floors lower over what it gives
 * here, so what else scales it (the tier, Armored, a league) stays in proportion. */
export function skippedEnemy(e: Enemy, mode: CurveMode, tier: number, step: number, skips: LevelSkips): Enemy {
  const f = skipFactors(mode, tier, step, e, skips.hp?.skips ?? 0, skips.combat?.skips ?? 0);
  return { ...e, hp: Math.max(1, snap(e.hp * f.hp)), attack: snap(e.attack * f.attack), defense: snap(e.defense * f.defense) };
}

/** `t` as `skips` leave its enemy, a Flying one over open floor too; every
 * other tile as it is. */
export function skippedTile(t: Tile, mode: CurveMode, tier: number, step: number, skips: LevelSkips | undefined): Tile {
  if (!skips || !(skips.hp?.skips || skips.combat?.skips)) return t;
  if (t.flyer) return { ...t, flyer: skippedEnemy(t.flyer, mode, tier, step, skips) };
  return t.kind === "enemy" && t.enemy ? { ...t, enemy: skippedEnemy(t.enemy, mode, tier, step, skips) } : t;
}
