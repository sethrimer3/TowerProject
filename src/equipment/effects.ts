// What equipment does, worked out from what is worn now: never written into
// the hero's stats, so equipping, unequipping, reloading or switching mode
// can never count a bonus twice. Each effect kind is read in one place (see
// `EffectKind` in catalog.ts).
import type { Mode } from "../entities.ts";
import type { Save } from "../save/shape.ts";
import { snap } from "../exact.ts";
import { EFFECTS, type EffectKind } from "./catalog.ts";
import { categoryOf, findItem, type EquipItem, type EquipmentSave } from "./inventory.ts";
import { efficiency, mainEffect, withEfficiency } from "./main-effect.ts";
import { slotValue } from "./slot-effects.ts";
import { slotEffects } from "./slots.ts";

export type EffectTotals = Record<EffectKind, number>;
const KINDS = Object.keys(EFFECTS) as EffectKind[];
export const noEffects = (): EffectTotals => Object.fromEntries(KINDS.map((k) => [k, 0])) as EffectTotals;

/** A piece's main effect as worn beside a Chestplate of `eff` efficiency
 * (its own Chestplate's efficiency never raises its own max HP). */
export function pieceMain(item: EquipItem, eff = 0) {
  const category = categoryOf(item), main = mainEffect({ category, rarity: item.rarity, level: item.level, stars: item.stars });
  if (!main) return null;
  return { kind: main.kind, value: category === "chestplate" ? main.value : withEfficiency(main.value, eff) };
}
/** A piece's efficiency, if it is a Chestplate. */
export const pieceEfficiency = (item: EquipItem) => efficiency({ category: categoryOf(item), rarity: item.rarity, level: item.level, stars: item.stars });

/** The pieces `mode`'s loadout wears. */
export const wornPieces = (e: EquipmentSave, mode: Mode) =>
  Object.values(e.equipped[mode]).map((id) => (id ? findItem(e, id) : undefined)).filter((i): i is EquipItem => !!i);

/** Everything `mode`'s loadout does, each kind summed: each piece's main
 * effect (the worn Chestplate's efficiency raising the others') and the
 * effects its open slots hold, each for that mode (a Tower-only one adds
 * nothing in the Delve). */
export function equipmentEffects(e: EquipmentSave, mode: Mode): EffectTotals {
  const totals = noEffects();
  if (!e.unlocked) return totals;
  const worn = wornPieces(e, mode), eff = worn.reduce((n, i) => n + pieceEfficiency(i), 0);
  for (const item of worn) {
    const main = pieceMain(item, eff);
    if (main) totals[main.kind] = snap(totals[main.kind] + main.value);
    for (const { def, rarity } of slotEffects(item))
      if (!def.mode || def.mode === mode) totals[def.kind] = snap(totals[def.kind] + slotValue(def, rarity));
  }
  return totals;
}
/** The worn equipment's effects in `mode`, read from the save. */
export const wornEffects = (save: Pick<Save, "equipment">, mode: Mode) => equipmentEffects(save.equipment, mode);

/** `base` raised by `percent` (5 is +5%), on the snap grid. */
export const raised = (base: number, percent: number) => (percent ? snap((base * (100 + percent)) / 100) : base);

/** A number as the Equipment screen shows it: up to two decimals. */
export const shortNumber = (n: number) => String(Math.round(n * 100) / 100);
/** One effect as words: "+3.5 ATK", "+5% Gold found", "−10% max HP",
 * "1.5% of max HP healed after each victory". */
export function effectText(kind: EffectKind, value: number, mode?: Mode) {
  const t = EFFECTS[kind], sign = value < 0 ? "−" : t.lead ?? "+";
  const number = `${sign}${shortNumber(Math.abs(value))}${t.percent ? "%" : ""}`;
  const words = t.plural && Math.abs(value) !== 1 ? t.plural : t.words;
  return `${number} ${words}${mode ? ` (${mode === "tower" ? "Tower" : "Delve"} only)` : ""}`;
}
