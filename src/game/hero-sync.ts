import type { Mode, Player, Run, Save } from "../entities.ts";
import { snap } from "../exact.ts";
import { loadout, type Loadout } from "../loadout.ts";
import { MODES } from "../modes.ts";

/** The stats the loadout carries into a run's hero. */
type HeroStats = { attack: number; defense: number; maxHp: number; shroud?: number; regen?: number };

const BOTH_MODES = ["tower", "delve"] as const;
const SHIFTED_STATS = ["attack", "defense", "maxHp", "shroud", "regen"] as const;
const KEY_COLORS = ["yellow", "blue", "red"] as const;

/** The hero a run in `mode` gets with everything owned now, at full HP,
 * standing at the entrance's row, and the loadout it keeps. */
export function startingHero(save: Save, mode: Mode) {
  const { attack, defense, maxHp, shroud, regen, keys } = loadout(save);
  // Only a hero with a shroud, or Regen, carries one.
  const extras = { ...(shroud ? { shroud } : {}), ...(regen ? { regen } : {}) };
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
 * ATK/DEF gathered from items and the provisions it started with are kept,
 * and a run still in the forest takes everything owned now. `change`
 * returning false changes nothing; returns whether it went through. */
export function changeLoadout(save: Save, change: () => boolean | void) {
  const before = loadout(save);
  if (change() === false) return false;
  const after = loadout(save);
  for (const mode of BOTH_MODES) {
    const run = save[mode].run;
    if (run && !run.outside) shiftRun(run, before, after);
  }
  readyForestRuns(save);
  return true;
}

/** Shifts a run inside by what the loadout gained or lost. */
function shiftRun(run: Run, before: Loadout, after: Loadout) {
  shiftStats(run.player, before, after);
  if (run.loadout) shiftStats(run.loadout, before, after);
  const p = run.player;
  p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
  // Keys a provision adds come into the hand at once.
  for (const color of KEY_COLORS) p.keys[color] = Math.max(0, p.keys[color] + after.keys[color] - before.keys[color]);
}

function shiftStats(stats: HeroStats, before: Loadout, after: Loadout) {
  for (const stat of SHIFTED_STATS) {
    const change = snap(after[stat] - before[stat]);
    if (change) stats[stat] = snap((stats[stat] ?? 0) + change);
  }
}
