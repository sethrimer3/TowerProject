import { relicCut, type RelicHolder } from "../economy/relic-effects.ts";
import { schedulePrice } from "../economy/prices.ts";
import { trainingDef, TRAINING, trainingCap, type TrainingId, type TrainingRow } from "./training.ts";
import type { Mode } from "../entities.ts";
import { heldCards, type RunCore } from "../runs.ts";
import type { Save } from "../save/shape.ts";
import { bulkBuy, type BuyQuantity } from "./buy-quantity.ts";
import { rowValue, runTrainingOpen } from "./loadout.ts";

/** Run training: Training ranks bought with Silver inside a run, on top of
 * the hero's own, lasting only for that run (`run.training`). */

/** What the rank after `bought` ranks bought this run costs in Silver, on
 * the row's `silver` schedule: its base, and for the k-th rank after it `step + k` more than the
 * one before, `step` rising by `growth` every five, summed here at once. */
/** Row `id`'s Silver price for its next rank in a run, after `bought`,
 * less relics' Training cost cut (`cut`, rounded up). */
export const silverPrice = (id: TrainingId, bought: number, cut = 1) => {
  const price = schedulePrice(trainingDef(id).silver, bought);
  return cut === 1 ? price : Math.ceil(price * cut);
};

/** The highest level `row` reaches in a run: its cap with the Limit Breaks
 * owned, as on the Training tab. */
export const runTrainingMax = (row: TrainingRow, save: Pick<Save, "upgrades">) => trainingCap(row, save.upgrades);

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

export function runTrainingOffer(save: Pick<Save, "training" | "upgrades" | "goals"> & RelicHolder, run: Pick<RunCore, "training" | "hand">, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!, bought = boughtInRun(run, id);
  const level = save.training[id] + bought, max = runTrainingMax(row, save);
  return { row, bought, level, max, price: silverPrice(id, bought, relicCut(save, "trainingCost")), open: runTrainingOpen(row, save, heldCards(run)), maxed: level >= max };
}

/** What one press of `id`'s price buys in `run` at Buy Quantity `q`: the
 * ranks (up to its most) and their Silver, and whether `silver` pays for
 * them. */
export function runTrainingBulk(save: Pick<Save, "training" | "upgrades" | "goals"> & RelicHolder, run: Pick<RunCore, "training" | "hand">, id: TrainingId, q: BuyQuantity, silver: number) {
  const offer = runTrainingOffer(save, run, id);
  return bulkBuy(q, Math.max(0, offer.max - offer.level), (k) => silverPrice(id, offer.bought + k, relicCut(save, "trainingCost")), silver);
}

/** What row `id` stands at in `run` now, as the run's cards show it: the
 * Training tab's value (`rowValue`) for the run, so its hero's stats, the
 * ranks it bought with Silver and its boons count, as do the equipment
 * worn in `mode` and research. */
export function runTrainingValue(save: Save, run: Pick<RunCore, "training" | "player" | "maxHpBoost" | "lifespring">, id: TrainingId, mode: Mode = "tower") {
  return rowValue(save, id, 0, { mode, run });
}

/** The save's parts Auto-Train reads: the skill and its switches, and what
 * a row's offer reads. */
type AutoTrainSave = Pick<Save, "training" | "upgrades" | "goals" | "runAutoTrain" | "runAutoTrainGroups"> & RelicHolder;

/** Whether Auto-Train buys row `id` as a floor begins: the skill owned,
 * the row switched on, and its Training group switched on too. */
export function autoTrains(save: AutoTrainSave, id: TrainingId) {
  return !!save.upgrades.autoTrain && save.runAutoTrain.includes(id) && save.runAutoTrainGroups.includes(trainingDef(id).group);
}

/** Auto-Train's purchases as a floor begins, in order: the cheapest next
 * rank of the rows it buys (open, not at their highest; the Training
 * table's order breaks a tie), one after another, each with the Silver
 * left, until none is affordable. */
export function autoTrainPicks(save: AutoTrainSave, run: Pick<RunCore, "training" | "hand">, silver: number) {
  const picks: { id: TrainingId; price: number }[] = [], training = { ...run.training };
  const sim = { ...run, training }, rows = TRAINING.filter((t) => autoTrains(save, t.id));
  for (;;) {
    let best: { id: TrainingId; price: number } | null = null;
    for (const row of rows) {
      const offer = runTrainingOffer(save, sim, row.id);
      if (offer.open && !offer.maxed && (!best || offer.price < best.price)) best = { id: row.id, price: offer.price };
    }
    if (!best || best.price > silver) return picks;
    picks.push(best);
    silver -= best.price;
    training[best.id] = (training[best.id] ?? 0) + 1;
  }
}
