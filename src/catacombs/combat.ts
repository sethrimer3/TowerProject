// The Magician's strikes (docs/CATACOMBS.md): MCrits, Armor Penetration,
// Spell Surge, and what beating an undead pays. Shared by a turn's round,
// Arcane Barrage and the crosshairs' taps.
import { snap } from "../exact.ts";
import { INGOTS, SPIRIT_RARITIES, undeadRewards, type IngotId, type SpiritRarity } from "./catalog.ts";
import { magician, type Magician } from "./magic.ts";
import { SURGE_CRIT, SURGE_MATK } from "./abilities.ts";
import { drawing, type CatacombSave } from "./state.ts";

/** What turns and taps earned, summed: MXP, Lore (for `save.cells`), Spirit
 * and Ingots, the Speed Drop attacks, and the kills, falls, restarts and
 * halls descended. */
export type CatacombGains = {
  turns: number; mxp: number; lore: number; kills: number; falls: number; restarts: number; halls: number; speed: number;
  spirit: Record<SpiritRarity, number>; ingots: Record<IngotId, number>;
};
export const noGains = (): CatacombGains => ({
  turns: 0, mxp: 0, lore: 0, kills: 0, falls: 0, restarts: 0, halls: 0, speed: 0,
  spirit: Object.fromEntries(SPIRIT_RARITIES.map((r) => [r, 0])) as Record<SpiritRarity, number>,
  ingots: Object.fromEntries(INGOTS.map((i) => [i, 0])) as Record<IngotId, number>,
});

/** The Magician as it strikes now: Spell Surge's MAtk and MCrit damage
 * while its buff lasts. */
export function striking(c: CatacombSave): Magician {
  const m = magician(c);
  return c.buffs.surge > 0 ? { ...m, matk: snap(m.matk * SURGE_MATK), critFactor: snap(m.critFactor + SURGE_CRIT) } : m;
}

/** An undead's MDef past the Magician's Armor Penetration: the percent
 * first, then the flat. */
export const pierced = (mdef: number, m: Magician) => Math.max(0, snap((mdef * (100 - m.armorPenPercent)) / 100 - m.armorPen));

/** A strike's damage on MDef `mdef`: MAtk, times the MCrit factor if it
 * crits (before MDef, as the Tower's crits), less the MDef left. */
export const hitFor = (m: Magician, mdef: number, crit: boolean, share = 1) =>
  Math.max(0, snap(m.matk * share * (crit ? m.critFactor : 1) - pierced(mdef, m)));

/** Rolls whether a strike crits, on the saved MCrit stream (no draw at 0%). */
export const rollCrit = (c: CatacombSave, m: Magician) => m.critChance > 0 && drawing(c, "crits", (rng) => rng() * 100 < m.critChance);

/** Slot `i`'s undead is beaten: it pays its MXP and Spirit (times its
 * strength, the Magician's gains and its MXP and Loot Drops), its Speed
 * Drop's attacks and its MHP Drop, and leaves its slot. Its slot is never
 * before the run's next target, so the target index still holds. */
export function defeat(c: CatacombSave, i: number, gains: CatacombGains) {
  const run = c.run!, slot = run.slots[i]!, r = undeadRewards(slot.id, slot.strength), m = magician(c), d = slot.drops ?? {};
  const mxp = snap(r.mxp * m.mxpGain * (d.mxp ?? 1)), spirit = snap(r.spirit * m.spiritGain * (d.loot ?? 1));
  c.mxp = snap(c.mxp + mxp);
  gains.mxp = snap(gains.mxp + mxp);
  c.spirit[r.rarity] = snap(c.spirit[r.rarity] + spirit);
  gains.spirit[r.rarity] = snap(gains.spirit[r.rarity] + spirit);
  if (d.speed) { c.speed += d.speed; gains.speed += d.speed; }
  if (d.mhp) run.hero.mhp = Math.min(m.mhp, snap(run.hero.mhp + d.mhp));
  gains.kills++;
  run.slots[i] = null;
}
