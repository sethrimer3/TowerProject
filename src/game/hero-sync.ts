import type { Mode, Player } from "../entities.ts";
import type { Run } from "../runs.ts";
import type { Save } from "../save/shape.ts";
import { loadout } from "../progression/loadout.ts";
import { MODES } from "../modes.ts";
import { loadoutShift, shiftHero } from "../progression/hero-stats.ts";
import { RunTimeline } from "../run-timeline.ts";
import { trainedAmount } from "../progression/training.ts";
import { ranksInRun } from "../progression/run-training.ts";
import { treeBonus, treeOverheal } from "../cards/trees.ts";

const BOTH_MODES = ["tower", "delve"] as const;
const KEY_COLORS = ["yellow", "blue", "red"] as const;

/** The hero a run in `mode` gets with everything owned now, at full HP,
 * standing at the entrance's row, and the loadout it keeps. */
export function startingHero(save: Save, mode: Mode) {
  const { attack, defense, maxHp, shroud, regen, lifesteal, thorns, parry, bossAttack, pierce, keys: owned, startKeys } = loadout(save, mode);
  const keys = { ...owned, yellow: owned.yellow + startKeys.yellow, blue: owned.blue + startKeys.blue };
  // Only a hero with a shroud, Regen, Lifesteal, Thorn Damage, Parry %, a boss bonus or Piercing carries one.
  const extras = { ...(shroud ? { shroud } : {}), ...(regen ? { regen } : {}), ...(lifesteal ? { lifesteal } : {}), ...(thorns ? { thorns } : {}), ...(parry ? { parry } : {}), ...(bossAttack ? { bossAttack } : {}), ...(pierce ? { pierce } : {}) };
  return {
    player: { x: MODES[mode].entranceX, y: 0, hp: maxHp, maxHp, attack, defense, ...extras, keys } as Player,
    loadout: { attack, defense, maxHp, ...extras },
  };
}

/** A run still in the forest hasn't started: after anything bought,
 * unlocked, trained or equipped, it takes everything owned now, as if it
 * had just begun. */
export function readyForestRuns(save: Save) {
  for (const mode of BOTH_MODES) {
    const run = save[mode].run;
    if (!run?.outside) continue;
    const { player, loadout } = startingHero(save, mode);
    run.player = { ...player, x: run.player.x, y: run.player.y };
    run.loadout = loadout;
  }
}

/** A gear change or training applies at once to the runs of both modes: a
 * run inside gains or loses exactly what `change` did to the loadout, so
 * ATK/DEF gathered from items and boosts going on are kept,
 * and a run still in the forest takes everything owned now. More max HP
 * comes with the HP to fill it (`shiftHero`). Each mode's run
 * follows its own loadout (its hero's equipment). The run's undo history
 * (and a fall's snapshot) shifts with it, so undo never takes back what was
 * bought, only the steps. `change` returning false changes nothing;
 * returns whether it went through. */
export function changeLoadout(save: Save, change: () => boolean | void) {
  const before = BOTH_MODES.map((mode) => loadout(save, mode));
  if (change() === false) return false;
  BOTH_MODES.forEach((mode, i) => {
    const run = save[mode].run;
    if (!run || run.outside) return;
    const after = loadout(save, mode), shift = loadoutShift(before[i], after);
    for (const copy of new RunTimeline(save, mode).runs()) {
      shiftHero(copy, shift, treeOverheal(trainedAmount({ upgrades: save.upgrades, training: ranksInRun(save, copy) }, "overheal"), treeBonus(copy.cardTrees)));
      // Keys the loadout adds come into the hand at once.
      const keys = copy.player.keys;
      for (const color of KEY_COLORS) keys[color] = Math.max(0, keys[color] + after.keys[color] - before[i].keys[color]);
    }
  });
  readyForestRuns(save);
  return true;
}
