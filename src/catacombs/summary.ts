// Every Catacomb stat in one table (docs/CATACOMBS.md's Stats menu): what the
// Stats menu's table button shows, as label and value rows.
import { tierNumeral } from "../tiers.ts";
import { INGOTS, loreBonus, SPIRIT_RARITIES } from "./catalog.ts";
import { heroStats, magicLevel, mxpForLevel, pointsEarned, pointsSpent } from "./magic.ts";
import type { CatacombSave } from "./state.ts";

const n = (v: number) => Math.floor(v).toLocaleString("en-US");
const titled = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** The rows of the Catacomb stats table for `c`, with `lore` Lore held:
 * the Magician's stats and level, the run, the Lore bonus, and every Spirit
 * and Ingot held. */
export function catacombStatRows(c: CatacombSave, lore: number): [string, string][] {
  const hero = heroStats(c.points), level = magicLevel(c.mxp), earned = pointsEarned(c.mxp), run = c.run;
  return [
    ["MHP", run ? `${n(run.hero.mhp)} / ${n(hero.mhp)}` : n(hero.mhp)],
    ["MAtk", n(hero.matk)],
    ["MDef", n(hero.mdef)],
    ["Magic level", n(level)],
    ["MXP to next level", `${n(c.mxp - mxpForLevel(level))} / ${n(mxpForLevel(level + 1) - mxpForLevel(level))}`],
    ["Magic skill points", `${n(earned - pointsSpent(c.points))} free of ${n(earned)}`],
    ["Catacomb", tierNumeral(c.number)],
    ["Hall", run ? n(run.hall) : "–"],
    ["Deepest hall", n(c.best[c.number] ?? 0)],
    ["Lore bonus", `×${loreBonus(c.number)}`],
    ["Lore", n(lore)],
    ...SPIRIT_RARITIES.map((r): [string, string] => [`${titled(r)} Spirit`, n(c.spirit[r])]),
    ...INGOTS.map((i): [string, string] => [`${titled(i)} Ingots`, n(c.ingots[i])]),
  ];
}
