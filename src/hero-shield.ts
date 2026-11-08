import { snap } from "./exact.ts";
import { relicCut } from "./economy/relic-effects.ts";
import { researched } from "./progression/archives.ts";
import { ranksInRun } from "./progression/run-training.ts";
import { regrowTurns, trainedAmount, type TrainingId } from "./progression/training.ts";
import type { Run } from "./runs.ts";
import type { Save } from "./save/shape.ts";
import type { Mode } from "./entities.ts";
import { wornEffects } from "./equipment/effects.ts";

type Ranks = Partial<Record<TrainingId, number>>;

/** The most HP the Aether Shield holds for `mode`'s hero of `maxHp`: Shield
 * HP's share of it (kept in tenths of a percent, raised by what the hero
 * wears), times its research. */
export const shieldCapacity = (save: Pick<Save, "upgrades" | "archives" | "relics" | "equipment">, ranks: Ranks, maxHp: number, mode: Mode) =>
  snap((maxHp * trainedAmount({ upgrades: save.upgrades, training: ranks, relics: save.relics, gear: wornEffects(save, mode) }, "shieldHp") * researched(save.archives, "shieldHpPercent")) / 100_000);

/** The turns a shield breaking now would take to regrow, `mode`'s hero's
 * Rebuild substats cutting them. */
export const regrowNow = (save: Pick<Save, "upgrades" | "archives" | "relics" | "equipment">, ranks: Ranks, mode: Mode) =>
  Math.max(1, Math.round(regrowTurns(trainedAmount({ upgrades: save.upgrades, training: ranks, gear: wornEffects(save, mode) }, "regrowShield"), researched(save.archives, "regrowTurns")) * relicCut(save, "shieldRegrow")));

/** Brings `run`'s shield up to what is owned now: its first shield comes full,
 * more capacity comes with the shield to fill it (unless it is down), and less
 * leaves what it holds, above max. Works from the capacity `run.player`
 * last had, so a run undo brings back catches up the same way. */
export function syncShield(save: Save, run: Run, mode: Mode) {
  const p = run.player;
  if (!save.upgrades.heroShield) return;
  const max = shieldCapacity(save, ranksInRun(save, run), p.maxHp, mode), before = p.shieldMax;
  if (max === before) return;
  p.shieldMax = max;
  if (before === undefined) p.shield = max;
  else if (max > before && !run.shieldRegrow) p.shield = snap((p.shield ?? 0) + max - before);
}

/** A shield just spent starts its regrow, by the turns it takes as it breaks. */
export function startRegrow(save: Save, run: Run, mode: Mode) {
  const p = run.player;
  if (p.shield !== 0 || !p.shieldMax || run.shieldRegrow) return;
  const of = regrowNow(save, ranksInRun(save, run), mode);
  run.shieldRegrow = { left: of, of };
}

/** A turn of `run`'s regrow. Returns whether the shield reformed, full. */
export function tickRegrow(run: Run) {
  const regrow = run.shieldRegrow;
  if (!regrow) return false;
  if (regrow.left > 1) {
    run.shieldRegrow = { ...regrow, left: regrow.left - 1 };
    return false;
  }
  delete run.shieldRegrow;
  run.player.shield = run.player.shieldMax ?? 0;
  return true;
}
