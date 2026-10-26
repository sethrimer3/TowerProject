import type { Save } from "../save/shape.ts";
import { loadout } from "../progression/loadout.ts";
import { loadoutShift, shiftHero } from "../progression/hero-stats.ts";
import { RunTimeline } from "../run-timeline.ts";
import { ranksInRun } from "../progression/run-training.ts";
import { trainedAmount } from "../progression/training.ts";
import { treeBonus, treeOverheal } from "../cards/trees.ts";
import { equipmentEffects } from "./effects.ts";

/** Before shared recipes, chestplate intrinsic values were half as strong.
 * Move saved heroes and every undo/fall copy by exactly the loadout change,
 * retaining damage, pickups, run training, boosts and each copy's boons.
 * The decoder calls this only when the old save has no category list;
 * its decoded category list prevents applying the conversion twice. */
export function upgradeLegacyChestplateRuns(save: Save) {
  for (const mode of ["tower", "delve"] as const) {
    if (!save.equipment.unlocked || !save.equipment.equipped[mode].chestplate) continue;
    const before = loadout(save, mode, equipmentEffects(save.equipment, mode, true));
    const shift = loadoutShift(before, loadout(save, mode));
    if (!Object.keys(shift).length) continue;
    for (const copy of new RunTimeline(save, mode).runs()) {
      const overheal = treeOverheal(trainedAmount({upgrades:save.upgrades,training:ranksInRun(save,copy)}, "overheal"), treeBonus(copy.cardTrees));
      shiftHero(copy, shift, overheal);
    }
  }
}
