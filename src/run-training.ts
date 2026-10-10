import { RUN_TRAINING_PRICES, schedulePrice, TRAINING, isStatRow, trainingOpen, type TrainingId, type TrainingRow } from "./config.ts";
import type { RunCore, Save } from "./entities.ts";
import { bulkBuy, type BuyQuantity } from "./buy-quantity.ts";
import { critChance, critFactor, floorGold, floorSilver, killGold, percentPotionChance, silverBonus, potionPercent, reviveChance, shownStat } from "./loadout.ts";

/** Run training: Training ranks bought with Silver inside a run, on top of
 * the hero's own, lasting only for that run (`run.training`, so undo takes
 * a purchase back with the rest of the run). */

/** What the rank after `bought` ranks bought this run costs in Silver: the
 * schedule's base, and for the k-th rank after it `step + k` more than the
 * one before, `step` rising by `growth` every five, summed here at once. */
export const silverPrice = (id: TrainingId, bought: number) => schedulePrice(RUN_TRAINING_PRICES[id], bought);

/** The highest level `row` reaches in a run: its `max`, as on the Training tab. */
export const runTrainingMax = (row: TrainingRow) => row.max;

/** Ranks of `id` bought with Silver in `run`. */
export const boughtInRun = (run: Pick<RunCore, "training">, id: TrainingId) => run.training?.[id] ?? 0;

/** Each row's ranks counting toward `run`: the hero's own, and those bought
 * in the run. */
export function ranksInRun(save: Pick<Save, "training">, run: Pick<RunCore, "training">) {
  const ranks = { ...save.training };
  for (const id of Object.keys(ranks) as TrainingId[]) ranks[id] += boughtInRun(run, id);
  return ranks;
}

/** What buying one more rank of `id` in `run` means: the level it stands
 * at and can reach, the Silver it costs, and whether it is open (its
 * upgrade owned) and not yet at its highest. */
/** A row's next rank for the run: its row, ranks bought this run, the
 * level it stands at and its most, its Silver price, and whether it shows
 * and is maxed. */
export type RunTrainingOffer = ReturnType<typeof runTrainingOffer>;

export function runTrainingOffer(save: Pick<Save, "training" | "upgrades">, run: Pick<RunCore, "training">, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!, bought = boughtInRun(run, id);
  const level = save.training[id] + bought, max = runTrainingMax(row);
  return { row, bought, level, max, price: silverPrice(id, bought), open: trainingOpen(row, save.upgrades), maxed: level >= max };
}

/** What one press of `id`'s price buys in `run` at Buy Quantity `q`: the
 * ranks (up to its most) and their Silver, and whether `silver` pays for
 * them. */
export function runTrainingBulk(save: Pick<Save, "training" | "upgrades">, run: Pick<RunCore, "training">, id: TrainingId, q: BuyQuantity, silver: number) {
  const offer = runTrainingOffer(save, run, id);
  return bulkBuy(q, Math.max(0, offer.max - offer.level), (k) => silverPrice(id, offer.bought + k), silver);
}

/** What row `id` stands at in `run` now, as the run's cards show it: the
 * hero's stat for a stat row, the Gold or Silver a new floor pays, a
 * multiplier (unit "×"), or the percentage for the others. */
export function runTrainingValue(save: Pick<Save, "training" | "upgrades">, run: Pick<RunCore, "training" | "player">, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!;
  if (isStatRow(row)) return { value: shownStat(row.stat, run.player[row.stat] ?? 0), unit: row.stat === "lifesteal" ? "%" : "" };
  const now = { upgrades: save.upgrades, training: ranksInRun(save, run) };
  if (id === "critChance") return { value: critChance(now), unit: "%" };
  if (id === "critFactor") return { value: critFactor(now), unit: "×" };
  if (id === "floorGold") return { value: floorGold(now), unit: "" };
  if (id === "floorSilver") return { value: floorSilver(now), unit: "" };
  if (id === "silverBonus") return { value: silverBonus(now) / 100, unit: "×" };
  if (id === "killGold") return { value: killGold(now) / 100, unit: "×" };
  const chance = id === "findPotion" ? percentPotionChance(now) : id === "revive" ? reviveChance(now) : potionPercent(now);
  return { value: chance / 100, unit: "%" };
}
