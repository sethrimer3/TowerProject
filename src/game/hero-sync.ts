import type { Mode, Player } from "../entities.ts";
import type { Run } from "../runs.ts";
import type { Save } from "../save/shape.ts";
import { loadout, rankShift } from "../progression/loadout.ts";
import { MODES } from "../modes.ts";
import { loadoutShift, shiftHero, type StatShift } from "../progression/hero-stats.ts";
import { isStatRow, TRAINING, trainedAmount, trainingCap } from "../progression/training.ts";
import { snap } from "../exact.ts";
import { wornEffects } from "../equipment/effects.ts";
import { powerOf, TETHER_ROWS } from "../equipment/powers.ts";
import { ranksInRun } from "../progression/run-training.ts";
import { powerBonus, powerOverheal } from "../cards/powers.ts";
import { shieldCapacity, syncShield } from "../hero-shield.ts";

const BOTH_MODES = ["tower", "delve"] as const;
const KEY_COLORS = ["yellow", "blue", "red"] as const;

/** The hero a run in `mode` gets with everything owned now, at full HP,
 * standing at the entrance's row, and the loadout it keeps. */
export function startingHero(save: Save, mode: Mode) {
  const { attack, defense, maxHp, shroud, regen, lifesteal, thorns, parry, armorBreak, shieldThorns, bossAttack, pierce, keys: owned, startKeys } = loadout(save, mode);
  const keys = { ...owned, yellow: owned.yellow + startKeys.yellow, blue: owned.blue + startKeys.blue };
  // Only a hero with a shroud, Regen, Lifesteal, Thorn Damage, Parry %, Armor Break, Shield Thorns, a boss bonus or Piercing carries one.
  const extras = { ...(shroud ? { shroud } : {}), ...(regen ? { regen } : {}), ...(lifesteal ? { lifesteal } : {}), ...(thorns ? { thorns } : {}), ...(parry ? { parry } : {}), ...(armorBreak ? { armorBreak } : {}), ...(shieldThorns ? { shieldThorns } : {}), ...(bossAttack ? { bossAttack } : {}), ...(pierce ? { pierce } : {}) };
  // A hero with the Shield starts every run with it full.
  const shieldMax = save.upgrades.heroShield ? shieldCapacity(save, save.training, maxHp, mode) : undefined;
  return {
    player: { x: MODES[mode].entranceX, y: 0, hp: maxHp, maxHp, attack, defense, ...extras, ...(shieldMax === undefined ? {} : { shield: shieldMax, shieldMax }), keys } as Player,
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
 * follows its own loadout (its hero's equipment). Ranks the run bought with
 * Silver that the hero's own ranks now leave past a row's cap come off
 * (`trimRunTraining`). `change` returning false changes nothing;
 * returns whether it went through. */
export function changeLoadout(save: Save, change: () => boolean | void) {
  const before = BOTH_MODES.map((mode) => loadout(save, mode)), ranks = { ...save.training };
  if (change() === false) return false;
  BOTH_MODES.forEach((mode, i) => {
    const run = save[mode].run;
    if (!run || run.outside) return;
    const after = loadout(save, mode), shift = loadoutShift(before[i], after);
    for (const [stat, n] of Object.entries(trimRunTraining(save, mode, run, ranks)) as [keyof StatShift, number][]) shift[stat] = snap((shift[stat] ?? 0) + n);
    shiftHero(run, shift, powerOverheal(trainedAmount({ upgrades: save.upgrades, training: ranksInRun(save, run) }, "overheal"), powerBonus(run.handLevels)));
    // Keys the loadout adds come into the hand at once.
    const keys = run.player.keys;
    for (const color of KEY_COLORS) keys[color] = Math.max(0, keys[color] + after.keys[color] - before[i].keys[color]);
    syncShield(save, run, mode);
  });
  readyForestRuns(save);
  return true;
}

/** A row's level in a run (the hero's ranks and the run's Silver ranks)
 * never passes its cap: once the hero's own ranks have risen from `was`,
 * the Silver ranks past the cap come off `run`, no Silver back. Returns
 * what that moves the hero's stats: from what its Silver ranks gave on top
 * of the old ranks to what those kept give on top of the new. Under
 * Equilibrium Tether its rows' Silver ranks raised the shared pool, not
 * their own stat, so only the count comes off. */
function trimRunTraining(save: Save, mode: Mode, run: Run, was: Save["training"]): StatShift {
  const shift: StatShift = {}, training = run.training;
  if (!training) return shift;
  const tethered = !!powerOf(wornEffects(save, mode), "equilibriumTether", "perRank");
  for (const row of TRAINING) {
    const bought = training[row.id] ?? 0, now = save.training[row.id], room = Math.max(0, trainingCap(row, save.upgrades) - now);
    if (bought <= room) continue;
    if (room) training[row.id] = room;
    else delete training[row.id];
    if (!isStatRow(row) || (tethered && (TETHER_ROWS as readonly string[]).includes(row.id))) continue;
    const moved = snap(rankShift(save, mode, row, now, now + room) - rankShift(save, mode, row, was[row.id], was[row.id] + bought));
    shift[row.stat] = snap((shift[row.stat] ?? 0) + moved);
  }
  return shift;
}
