// Every Catacomb stat in one table (docs/CATACOMBS.md's Skills menu): what the
// Skills menu's table button shows, as label and value rows.
import { snap } from "../exact.ts";
import { tierNumeral } from "../tiers.ts";
import { DROP_IDS, DROPS, INGOTS, loreBonus, SPIRIT_RARITIES } from "./catalog.ts";
import { magician, magicLevel, mxpForLevel, pointsEarned, pointsSpent } from "./magic.ts";
import { GOLD_CROSSHAIR_FACTOR } from "./taps.ts";
import type { CatacombSave } from "./state.ts";

const n = (v: number) => Math.floor(v).toLocaleString("en-US");
const titled = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** A percent as the table writes it: 0.6%, 12%. */
const pct = (v: number) => `${snap(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** The rows of the Catacomb stats table for `c`, with `lore` Lore held:
 * the Magician's stats and level, the run, each drop's chance and what it
 * gives, the Lore bonus, and every Spirit and Ingot held. */
export function catacombStatRows(c: CatacombSave, lore: number): [string, string][] {
  const hero = magician(c), level = magicLevel(c.mxp), earned = pointsEarned(c.mxp), run = c.run;
  return [
    ["MHP", run ? `${n(run.hero.mhp)} / ${n(hero.mhp)}` : n(hero.mhp)],
    ["MAtk", n(hero.matk)],
    ["MDef", n(hero.mdef)],
    ["MCrit chance", pct(hero.critChance)],
    ["MCrit factor", `×${snap(hero.critFactor)}`],
    ["Armor Penetration", `${n(hero.armorPen)} and ${pct(hero.armorPenPercent)}`],
    ["Spirit gain", `×${snap(hero.spiritGain)}`],
    ["MXP gain", `×${snap(hero.mxpGain)}`],
    ["Speed Drop attacks left", n(c.speed)],
    ...DROP_IDS.map((d): [string, string] => [`${DROPS[d].name} chance`, `${pct(hero.drops[d])}: ${DROPS[d].effect}`]),
    ["Gold Crosshair chance", `${pct(hero.goldCrosshair)}: ×${GOLD_CROSSHAIR_FACTOR} damage`],
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
