// What equipment does, worked out from what is worn now: never written into
// the hero's stats, so equipping, unequipping, reloading or switching mode
// can never count a bonus twice. Each effect kind is read in one place (see
// `EffectKind` in catalog.ts).
import type { Mode, Save } from "../entities.ts";
import { snap } from "../exact.ts";
import { EFFECTS, itemDef, type EffectKind, type EffectLine } from "./catalog.ts";
import { atLeast, RARITY_TIERS, type EquipRarity } from "./balance.ts";
import { findItem, type EquipItem, type EquipmentSave } from "./inventory.ts";
import { slotValue } from "./slot-effects.ts";
import { slotEffects } from "./slots.ts";

export type EffectTotals = Record<EffectKind, number>;
const KINDS = Object.keys(EFFECTS) as EffectKind[];
export const noEffects = (): EffectTotals => Object.fromEntries(KINDS.map((k) => [k, 0])) as EffectTotals;

/** A line's value at `rarity` and `level`: (base + perLevel × (level − 1))
 * × the rarity's power, on the snap grid; whole kinds round down. A fixed
 * line is its base. */
export function lineValue(line: EffectLine, rarity: EquipRarity, level: number) {
  const raw = line.fixed ? line.base : snap((line.base + (line.perLevel ?? 0) * (level - 1)) * RARITY_TIERS[rarity].power);
  return EFFECTS[line.kind].whole ? Math.floor(raw) : raw;
}
/** Whether `line` is active at `rarity`. */
export const lineOpen = (line: EffectLine, rarity: EquipRarity) => atLeast(rarity, line.from ?? "common");

/** An item's lines at its rarity and level: each with its value and
 * whether its rarity has opened it yet. */
export function itemLines(item: Pick<EquipItem, "def" | "rarity" | "level">) {
  return itemDef(item.def)!.effects.map((line) => ({ line, open: lineOpen(line, item.rarity), value: lineValue(line, item.rarity, item.level) }));
}

/** Everything `mode`'s loadout does, each kind summed: lines open at their
 * piece's rarity and the effects its open slots hold, each for that mode
 * (a Tower-only one adds nothing in the Delve). */
export function equipmentEffects(e: EquipmentSave, mode: Mode): EffectTotals {
  const totals = noEffects();
  if (!e.unlocked) return totals;
  for (const id of Object.values(e.equipped[mode])) {
    const item = id && findItem(e, id);
    if (!item) continue;
    for (const { line, open, value } of itemLines(item))
      if (open && (!line.mode || line.mode === mode)) totals[line.kind] = snap(totals[line.kind] + value);
    for (const { def, rarity } of slotEffects(item))
      if (!def.mode || def.mode === mode) totals[def.kind] = snap(totals[def.kind] + slotValue(def, rarity, item.level));
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
