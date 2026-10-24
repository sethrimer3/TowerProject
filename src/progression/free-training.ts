import { TRAINING, TRAINING_GROUPS, trainedAmount, type TrainingId } from "./training.ts";
import { heldCards, type RunCore } from "../runs.ts";
import type { Save } from "../save/shape.ts";
import { FREE_TRAINING_ROWS, runTrainingOpen } from "./loadout.ts";
import { drawAt } from "../random.ts";
import { ranksInRun, runTrainingMax } from "./run-training.ts";

/** Free Training: each floor passed in a run (a floor new to the run,
 * one Skip climbs past too) may train a stat a level for free, for the run,
 * once for each group whose Free Upgrade row has ranks. A free level is
 * added to the run's training (`run.training`) like a rank bought with
 * Silver, so it raises that row's Silver price a step just the same, and
 * undo takes it back with the run. */

export type FreeGroup = keyof typeof TRAINING_GROUPS;
/** The groups in the order a floor rolls them. */
export const FREE_GROUPS: readonly FreeGroup[] = ["offense", "defense", "utility"];
/** Mixed into the run seed to start the Offense stream; Defense's starts
 * from that seed + 1 and Utility's + 2, so each group rolls apart but all
 * three replay from the run seed. */
const FREE_TRAINING_SALT = 0xf7ee7;
const OFFSET: Record<FreeGroup, number> = { offense: 0, defense: 1, utility: 2 };
/** The seed of `group`'s stream in a run of seed `runSeed`. */
export const freeTrainingSeed = (runSeed: number, group: FreeGroup) => (((runSeed ^ FREE_TRAINING_SALT) >>> 0) + OFFSET[group]) >>> 0;

/** The next number of `group`'s stream in `run`, which moves on (its draws
 * counted in `run.freeRolls`). */
function draw(run: Pick<RunCore, "seed" | "freeRolls">, group: FreeGroup) {
  const n = run.freeRolls?.[group] ?? 0;
  run.freeRolls = { ...run.freeRolls, [group]: n + 1 };
  return drawAt(freeTrainingSeed(run.seed, group), n);
}

/** The rows of `group` a free level can go to in `run`: open for its hand
 * (`runTrainingOpen`), and below their most counting the run's ranks. */
function candidates(save: Pick<Save, "training" | "upgrades" | "goals">, run: Pick<RunCore, "training" | "hand">, group: FreeGroup): TrainingId[] {
  const ranks = ranksInRun(save, run);
  return TRAINING.filter((row) => row.group === group && runTrainingOpen(row, save, heldCards(run)) && ranks[row.id] < runTrainingMax(row, save)).map((row) => row.id);
}

/** One floor passed: each group, in turn, rolls its Free Upgrade chance on
 * its own stream (no draw while that chance is nothing), and on a hit draws
 * again to pick which of its rows gains the level. Returns the rows picked,
 * in order; `run.freeRolls` moves on, and applying the levels is the
 * caller's (`Game`). The chances are read before any level is applied, so
 * Free Utility raising a Free Upgrade row counts from the next floor.
 * `factors` (STAIRS' card tree) multiply each group's chance, and
 * `chances` (HEAL's and DOOR's, in hundredths of a percent) add to it, so a group may
 * give a level with no ranks of its own. */
export function rollFreeTraining(save: Pick<Save, "training" | "upgrades" | "goals">, run: Pick<RunCore, "seed" | "freeRolls" | "training" | "hand">, boonChance = 0, factors?: Record<FreeGroup, number>, chances?: Partial<Record<FreeGroup, number>>): TrainingId[] {
  const now = { upgrades: save.upgrades, training: ranksInRun(save, run) };
  const picked: TrainingId[] = [];
  for (const group of FREE_GROUPS) {
    // A run's Free Up Chance boons add to every group's chance, in hundredths of a percent.
    const chance = (trainedAmount(now, FREE_TRAINING_ROWS[group]) + boonChance) * (factors?.[group] ?? 1) + (chances?.[group] ?? 0);
    if (!chance || draw(run, group) * 10_000 >= chance) continue;
    const rows = candidates(save, run, group);
    if (!rows.length) continue;
    picked.push(rows[Math.floor(draw(run, group) * rows.length)]);
  }
  return picked;
}

/** The lines announcing free levels: "+N name" for each row, in the order
 * first given. */
export function freeTrainingLines(ids: readonly TrainingId[]) {
  const counts = new Map<TrainingId, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => {
    const row = TRAINING.find((t) => t.id === id)!;
    return `+${n} ${"short" in row ? row.short : row.name}`;
  });
}
