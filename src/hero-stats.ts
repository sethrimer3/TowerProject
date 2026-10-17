import type { Run } from "./runs.ts";
import type { Save } from "./save-shape.ts";
import { snap } from "./exact.ts";
import { statFactor, type Loadout, type Stat } from "./loadout.ts";
import { boonFactor } from "./shrines.ts";

/** The stats the loadout carries into a run's hero, which a change to the
 * loadout moves mid-run. */
export const HERO_STATS = ["attack", "defense", "maxHp", "shroud", "regen", "lifesteal", "thorns", "parry", "bossAttack", "pierce"] as const;
export type HeroStat = (typeof HERO_STATS)[number];
/** How far each hero stat moves (on the loadout's scale, before boons). */
export type StatShift = Partial<Record<HeroStat, number>>;

/** What going from loadout `before` to `after` moves each hero stat by. */
export function loadoutShift(before: Loadout, after: Loadout): StatShift {
  const shift: StatShift = {};
  for (const stat of HERO_STATS) {
    const change = snap(after[stat] - before[stat]);
    if (change) shift[stat] = change;
  }
  return shift;
}

/** What a flat `amount` of `stat` given for the run (the Max HP badge)
 * moves the loadout by: as a provision counts, times the stat's research. */
export const flatShift = (save: Pick<Save, "archives">, stat: Stat & HeroStat, amount: number) => snap(amount * statFactor(save, stat));

/** Moves `run`'s hero, and the loadout it keeps, by `shift`, each stat
 * times what the run's boons multiply it by (as the hero's stats already
 * were). More max HP comes with the HP to fill it, less leaves HP no higher
 * than the new max, and a fallen hero (0 HP) stays down. Returns how far
 * the hero's stats moved. */
export function shiftHero(run: Run, shift: StatShift): StatShift {
  const p = run.player, moved: StatShift = {};
  for (const stat of HERO_STATS) {
    const change = snap((shift[stat] ?? 0) * boonFactor(run, stat));
    if (!change) continue;
    moved[stat] = change;
    p[stat] = snap((p[stat] ?? 0) + change);
    if (run.loadout) run.loadout[stat] = snap((run.loadout[stat] ?? 0) + change);
  }
  if (p.hp > 0) p.hp = Math.max(1, Math.min(p.maxHp, snap(p.hp + Math.max(0, moved.maxHp ?? 0))));
  return moved;
}
