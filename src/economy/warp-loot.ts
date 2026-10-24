import { TOWER_SECTION, silverForKill, trainedAmount } from "../config.ts";
import { enemyCountPercent, enemyShare, RANKED_STRENGTHS } from "../enemies/schedule.ts";
import { researched } from "../progression/archives.ts";
import { silverFound } from "./gold-multipliers.ts";
import { snap } from "../exact.ts";
import type { Save } from "../save-shape.ts";

// Warp Loot: a Warp run starts with a share (the research's percent) of the
// Silver the floors it skips would have paid. The floors aren't generated
// (a warp to floor 4,501 would build 4,500 of them); their Silver is
// estimated from the enemy schedule, the hero's starting training and the
// research owned.

/** The enemies a Tower floor holds on average, bosses left out, as
 * generated floors hold them: about 7.5 on the first 20 floors, 10.8
 * after, and 8 times the schedule's count percent once that is more
 * (13.3 on floor 2,001, 18.7 on floor 4,001). */
export function enemiesOnFloor(depth: number) {
  return depth < 20 ? 7.5 : Math.max(10.8, (8 * enemyCountPercent(depth)) / 100);
}

/** The Silver kills pay on floor `depth` (0 is the first) of tower
 * `tower`, before Silver found's multiplier: its enemies by the
 * schedule's strength shares, and the boss on every tenth floor. */
export function floorKillSilver(depth: number, tower: number) {
  const n = enemiesOnFloor(depth);
  let silver = RANKED_STRENGTHS.reduce((s, k) => s + ((n * enemyShare(k, depth, tower)) / 100) * silverForKill(k, depth), 0);
  if (depth % TOWER_SECTION === TOWER_SECTION - 1) silver += silverForKill("boss", depth);
  return silver;
}

/** The Silver a run starting on floor `floors` + 1 of tower `tower` would
 * have found on the floors below, with the training the hero starts with
 * and the research owned: each floor's kills times Silver found, then on
 * climbing it its Wishing Well Silver (Silver / Floor, raised by its
 * research, times Silver found) and Interest on the Silver held from
 * `held` (the Pocket Money the run starts with), up to Max Interest.
 * Shrine boons are left out: a run starts with none. */
export function skippedSilver(save: Pick<Save, "upgrades" | "training" | "archives" | "equipment">, tower: number, floors: number, held = 0) {
  const found = silverFound(save, "tower", save.training.silverBonus ?? 0);
  const perFloor = (trainedAmount(save, "floorSilver") * researched(save.archives, "floorSilver")) / 100;
  const rate = researched(save.archives, "interestRate"), cap = researched(save.archives, "interestCap");
  let silver = held;
  for (let depth = 0; depth < floors; depth++) {
    silver += floorKillSilver(depth, tower) * found + perFloor * found;
    if (rate) silver += Math.min(cap, (silver * rate) / 1000);
  }
  return snap(silver - held);
}

/** The Silver Warp Loot adds to a run starting on floor `floors` + 1: its
 * research's percent of `skippedSilver`, in whole Silver. */
export function warpLootSilver(save: Pick<Save, "upgrades" | "training" | "archives" | "equipment">, tower: number, floors: number, held = 0) {
  const percent = researched(save.archives, "warpLoot");
  return percent && floors > 0 ? Math.floor((skippedSilver(save, tower, floors, held) * percent) / 100) : 0;
}
