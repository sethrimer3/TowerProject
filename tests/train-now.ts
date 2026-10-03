import type { Game } from "../src/state.ts";
import type { TrainingId } from "../src/config.ts";

/** Trains one rank and lets its time pass, so tests see the rank at once
 * (owning the Training skill that opens it). */
export function trainNow(g: Game, id: TrainingId) {
  g.save.upgrades.training = 1;
  if (!g.training.train(id)) return false;
  const job = g.save.trainingJobs.find((j) => j.id === id);
  if (job) job.completesAt = 0;
  g.training.settle();
  return true;
}
