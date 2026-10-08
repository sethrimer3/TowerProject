// The effects an item's effect slots can hold: static data only (saves name
// an effect by id and keep its rarity). Each effect belongs to a family, and
// each category rolls from its families' effects, so a chestplate rolls
// defence and a pair of boots movement. An effect's value grows with the
// item's level and is multiplied by the effect's own rarity's power, never
// above the item's (`maxEffect`). Slot effects are deliberately smaller than
// an item's intrinsic lines (catalog.ts), so a Unique keeps its identity.
// See docs/EQUIPMENT.md.
import type { Mode } from "../entities.ts";
import { snap } from "../exact.ts";
import { EFFECTS, type CategoryId, type EffectKind } from "./catalog.ts";
import { rarityRank, RARITY_TIERS, type EquipRarity } from "./balance.ts";

export type FamilyId = "might" | "guard" | "vitality" | "recovery" | "mobility" | "fortune" | "lore";
export const FAMILIES: Record<FamilyId, { name: string; theme: string }> = {
  might: { name: "Might", theme: "ATK, bosses and armor" },
  guard: { name: "Guard", theme: "DEF and the shroud" },
  vitality: { name: "Vitality", theme: "max HP and Regen" },
  recovery: { name: "Recovery", theme: "healing after fights, on new floors and from potions" },
  mobility: { name: "Mobility", theme: "movement speed" },
  fortune: { name: "Fortune", theme: "Gold, Silver, materials and drops" },
  lore: { name: "Lore", theme: "XP from kills" },
};

/** The families each category's slots roll from. */
export const CATEGORY_FAMILIES: Record<CategoryId, readonly FamilyId[]> = {
  weapon: ["might", "lore"],
  chestplate: ["guard", "vitality"],
  helmet: ["guard", "vitality", "lore"],
  gloves: ["might", "recovery"],
  boots: ["mobility", "recovery", "guard"],
  cape: ["fortune", "guard"],
  belt: ["vitality", "recovery", "fortune"],
  ring: ["might", "guard", "vitality"],
  amulet: ["vitality", "recovery", "lore"],
};

/** One slot effect: `base` at level 1 and `perLevel` more each level
 * after, times its rarity's power. With `mode`, it counts only in that
 * mode's loadout (and is a little stronger for it). */
export type SlotEffectDef = { id: string; name: string; family: FamilyId; kind: EffectKind; base: number; perLevel: number; mode?: Mode };
const fx = (id: string, name: string, family: FamilyId, kind: EffectKind, base: number, perLevel: number, mode?: Mode): SlotEffectDef =>
  ({ id, name, family, kind, base, perLevel, ...(mode ? { mode } : {}) });

export const SLOT_EFFECTS: readonly SlotEffectDef[] = [
  fx("keenEdge", "Keen Edge", "might", "attack", 1.5, 0.25),
  fx("ferocity", "Ferocity", "might", "attackPct", 1, 0.04),
  fx("piercing", "Piercing", "might", "pierce", 2, 0.05),
  fx("giantslayer", "Giantslayer", "might", "bossAttack", 4, 0.12),
  fx("bulwark", "Bulwark", "guard", "defense", 1, 0.2),
  fx("fortitude", "Fortitude", "guard", "defensePct", 1, 0.04),
  fx("warding", "Warding", "guard", "shroud", 3, 0.5),
  fx("vigor", "Vigor", "vitality", "maxHp", 50, 10),
  fx("constitution", "Constitution", "vitality", "maxHpPct", 1, 0.04),
  fx("mending", "Mending", "vitality", "regen", 0.2, 0.02),
  fx("secondWind", "Second Wind", "recovery", "victoryHeal", 0.3, 0.01),
  fx("freshAir", "Fresh Air", "recovery", "floorHeal", 1, 0.03),
  fx("tonic", "Tonic", "recovery", "potionHeal", 4, 0.15),
  fx("fleetness", "Fleetness", "mobility", "moveSpeed", 3, 0.1),
  fx("spireStride", "Spire Stride", "mobility", "moveSpeed", 5, 0.15, "tower"),
  fx("deepStride", "Deep Stride", "mobility", "moveSpeed", 5, 0.15, "delve"),
  fx("prospector", "Prospector", "fortune", "goldFind", 2, 0.08),
  fx("silverTongue", "Silver Tongue", "fortune", "silverFind", 2, 0.08),
  fx("scavenger", "Scavenger", "fortune", "materialFind", 3, 0.12),
  fx("bounty", "Bounty", "fortune", "bossDrops", 1, 0.03),
  fx("purseStrings", "Purse Strings", "fortune", "startSilver", 3, 0.3),
  fx("studious", "Studious", "lore", "xpGain", 2, 0.08),
  fx("spireScholar", "Spire Scholar", "lore", "xpGain", 3.5, 0.12, "tower"),
  fx("deepScholar", "Deep Scholar", "lore", "xpGain", 3.5, 0.12, "delve"),
];

const BY_ID = new Map(SLOT_EFFECTS.map((d) => [d.id, d]));
export const slotEffectDef = (id: string) => BY_ID.get(id);
/** The effects `category`'s slots roll from, in catalogue order. */
export const effectPool = (category: CategoryId) => SLOT_EFFECTS.filter((d) => CATEGORY_FAMILIES[category].includes(d.family));
/** Whether `category`'s slots may hold effect `id`. */
export const inPool = (category: CategoryId, id: string) => {
  const d = slotEffectDef(id);
  return !!d && CATEGORY_FAMILIES[category].includes(d.family);
};

/** An effect's value at its `rarity` on an item at `level`, on the snap
 * grid (whole kinds round down). */
export function slotValue(def: SlotEffectDef, rarity: EquipRarity, level: number) {
  const raw = snap((def.base + def.perLevel * (level - 1)) * RARITY_TIERS[rarity].power);
  return EFFECTS[def.kind].whole ? Math.floor(raw) : raw;
}
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
/** "Fleetness II": the effect's name and its rarity as a numeral. */
export const slotEffectName = (def: SlotEffectDef, rarity: EquipRarity) => `${def.name} ${NUMERALS[rarityRank(rarity)]}`;
