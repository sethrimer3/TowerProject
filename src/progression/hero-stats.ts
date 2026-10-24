import type { Run } from "../runs.ts";
import { snap } from "../exact.ts";
import type { Loadout } from "./loadout.ts";
import { boonFactor } from "../shrines.ts";
import { badgeFactor } from "../cards/badges.ts";
import { treeHeroFactor } from "../cards/trees.ts";

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

/** What the run's boons and Max HP badge boosts multiply hero stat
 * `stat` by now. */
export const heroFactor = (run: Run, stat: HeroStat) => boonFactor(run, stat) * badgeFactor(run, stat) * treeHeroFactor(run, stat);

/** Moves `run`'s hero, and the loadout it keeps, by `shift`, each stat
 * times what the run's boons and Max HP badge boosts multiply it by (as
 * the hero's stats already were, `heroFactor`). More max HP comes with the HP to fill it, less leaves HP no higher
 * than the new max (or, for HP Overheal held above max, the new Overheal
 * ceiling: `overheal`, in thousandths), and a fallen hero (0 HP) stays
 * down. Returns how far the hero's stats moved. */
export function shiftHero(run: Run, shift: StatShift, overheal = 1000): StatShift {
  const p = run.player, moved: StatShift = {}, over = p.hp > p.maxHp;
  for (const stat of HERO_STATS) {
    const change = snap((shift[stat] ?? 0) * heroFactor(run, stat));
    if (!change) continue;
    moved[stat] = change;
    p[stat] = snap((p[stat] ?? 0) + change);
    if (run.loadout) run.loadout[stat] = snap((run.loadout[stat] ?? 0) + change);
  }
  const ceiling = over && overheal > 1000 ? snap((p.maxHp * overheal) / 1000) : p.maxHp;
  if (p.hp > 0) p.hp = Math.max(1, Math.min(Math.max(p.maxHp, ceiling), snap(p.hp + Math.max(0, moved.maxHp ?? 0))));
  return moved;
}

/** The Max HP badge boosts `run`'s max HP by `percent`: the run's boosts
 * add up (`maxHpBoost`) into one multiplier on the hero's max HP (and the
 * run's loadout's), so max HP moves by the ratio of the new multiplier to
 * the old, and HP with it, keeping its share; a fallen hero (0 HP) stays
 * down. Returns how far max HP moved. */
export function boostMaxHp(run: Run, percent: number) {
  const p = run.player, before = badgeFactor(run, "maxHp");
  run.maxHpBoost = snap((run.maxHpBoost ?? 0) + percent);
  const after = badgeFactor(run, "maxHp"), max = p.maxHp;
  p.maxHp = snap((p.maxHp * after) / before);
  // HP Overheal holds above max keeps its share too.
  if (p.hp > 0) p.hp = Math.max(1, p.hp > max ? snap((p.hp * after) / before) : Math.min(p.maxHp, snap((p.hp * after) / before)));
  if (run.loadout) run.loadout.maxHp = snap((run.loadout.maxHp * after) / before);
  return snap(p.maxHp - max);
}
