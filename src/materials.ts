// Central data-driven tables for the persistent crafting-materials economy.
// See docs/CRAFTING_AND_EQUIPMENT.md for the design source of truth.
import type { Mode } from "./entities.ts";

export type MetalId =
  | "iron"
  | "steel"
  | "silversteel"
  | "embersteel"
  | "starsteel"
  | "voidsteel";

export type GemId =
  | "garnet"
  | "sapphire"
  | "emerald"
  | "ruby"
  | "amethyst"
  | "diamond";

export type EnemySpeciesId =
  | "cinderSlime"
  | "boneSentinel"
  | "duskWing"
  | "ashWarden";

export type MaterialId =
  | "ironBar"
  | "steelBar"
  | "silversteelBar"
  | "embersteelBar"
  | "starsteelBar"
  | "voidsteelBar"
  | GemId
  | "cinderSlimeBlob"
  | "emberNucleus"
  | "sentinelBone"
  | "gildedMarrow"
  | "duskFeather"
  | "eclipsePinion"
  | "ashenPlateShard"
  | "wardenSigil"
  | "emptyVial";

export type MaterialCategory = "metal" | "gem" | "monster-common" | "monster-rare" | "utility";

export type MaterialDef = {
  id: MaterialId;
  name: string;
  category: MaterialCategory;
  description: string;
  icon: string;
};

export type MaterialStack = { id: MaterialId; quantity: number };

/** `equivalentFloor = towerFloor` in Tower, `floor(delveDepth / 10)` in Delve.
 * The single shared progression scale every loot table is gated on. */
export function getEquivalentFloor(mode: Mode, height: number): number {
  return mode === "tower" ? height : Math.floor(height / 10);
}

export const METALS: { id: MetalId; name: string; materialId: MaterialId; unlockFloor: number; power: number }[] = [
  { id: "iron", name: "Iron", materialId: "ironBar", unlockFloor: 0, power: 1.0 },
  { id: "steel", name: "Steel", materialId: "steelBar", unlockFloor: 15, power: 1.6 },
  { id: "silversteel", name: "Silversteel", materialId: "silversteelBar", unlockFloor: 30, power: 2.4 },
  { id: "embersteel", name: "Embersteel", materialId: "embersteelBar", unlockFloor: 50, power: 3.5 },
  { id: "starsteel", name: "Starsteel", materialId: "starsteelBar", unlockFloor: 75, power: 5.0 },
  { id: "voidsteel", name: "Voidsteel", materialId: "voidsteelBar", unlockFloor: 100, power: 7.0 },
];

/** Weighting brackets applied once the base 28% chest metal roll succeeds. */
const METAL_WEIGHT_BRACKETS: { min: number; max: number; weights: Partial<Record<MetalId, number>> }[] = [
  { min: 0, max: 14, weights: { iron: 1.0 } },
  { min: 15, max: 29, weights: { iron: 0.7, steel: 0.3 } },
  { min: 30, max: 49, weights: { iron: 0.35, steel: 0.45, silversteel: 0.2 } },
  { min: 50, max: 74, weights: { iron: 0.15, steel: 0.25, silversteel: 0.4, embersteel: 0.2 } },
  { min: 75, max: 99, weights: { steel: 0.1, silversteel: 0.2, embersteel: 0.4, starsteel: 0.3 } },
  { min: 100, max: Infinity, weights: { silversteel: 0.1, embersteel: 0.2, starsteel: 0.4, voidsteel: 0.3 } },
];

export function metalWeightsForFloor(E: number): Partial<Record<MetalId, number>> {
  return (METAL_WEIGHT_BRACKETS.find((b) => E >= b.min && E <= b.max) ?? METAL_WEIGHT_BRACKETS[0]).weights;
}

/** Stack size 2-5, +1 to both bounds every 40 equivalent floors. */
export function metalStackRange(E: number): { min: number; max: number } {
  const bonus = Math.floor(E / 40);
  return { min: 2 + bonus, max: 5 + bonus };
}

export function metalUnlocked(id: MetalId, E: number): boolean {
  return E >= METALS.find((m) => m.id === id)!.unlockFloor;
}

export type GemDef = {
  id: GemId;
  name: string;
  unlockFloor: number;
  chance: (E: number) => number;
  enhancement: { stat: "attack" | "defense" | "maxHp"; percent: number };
};

export const GEMS: GemDef[] = [
  {
    id: "garnet", name: "Garnet", unlockFloor: 0,
    chance: (E) => Math.min(0.04, 0.015 + 0.0005 * E),
    enhancement: { stat: "attack", percent: 0.005 },
  },
  {
    id: "sapphire", name: "Sapphire", unlockFloor: 20,
    chance: (E) => (E < 20 ? 0 : Math.min(0.03, 0.005 + 0.0005 * (E - 20))),
    enhancement: { stat: "defense", percent: 0.005 },
  },
  {
    id: "emerald", name: "Emerald", unlockFloor: 40,
    chance: (E) => (E < 40 ? 0 : Math.min(0.025, 0.003 + 0.0005 * (E - 40))),
    enhancement: { stat: "maxHp", percent: 0.005 },
  },
  {
    id: "ruby", name: "Ruby", unlockFloor: 55,
    chance: (E) => (E < 55 ? 0 : Math.min(0.02, 0.002 + 0.0005 * (E - 55))),
    enhancement: { stat: "attack", percent: 0.01 },
  },
  {
    id: "amethyst", name: "Amethyst", unlockFloor: 70,
    chance: (E) => (E < 70 ? 0 : Math.min(0.015, 0.001 + 0.001 * (E - 70))),
    enhancement: { stat: "defense", percent: 0.01 },
  },
  {
    id: "diamond", name: "Diamond", unlockFloor: 90,
    chance: (E) => (E < 90 ? 0 : Math.min(0.01, 0.0005 + 0.0005 * (E - 90))),
    enhancement: { stat: "maxHp", percent: 0.01 },
  },
];

export const ENEMY_SPECIES: Record<EnemySpeciesId, { name: string; common: MaterialId; rare: MaterialId }> = {
  cinderSlime: { name: "Cinder slime", common: "cinderSlimeBlob", rare: "emberNucleus" },
  boneSentinel: { name: "Bone sentinel", common: "sentinelBone", rare: "gildedMarrow" },
  duskWing: { name: "Dusk wing", common: "duskFeather", rare: "eclipsePinion" },
  ashWarden: { name: "Ash warden", common: "ashenPlateShard", rare: "wardenSigil" },
};

export function speciesByName(name: string) {
  return Object.values(ENEMY_SPECIES).find((s) => s.name === name) ?? null;
}

/** +1 flat Attack, +1 flat Defense, +3 Max HP, or Attack+Defense, per unit added while crafting. */
export const RARE_ENHANCEMENTS: Partial<Record<MaterialId, { flatAttack?: number; flatDefense?: number; flatMaxHp?: number }>> = {
  emberNucleus: { flatAttack: 1 },
  gildedMarrow: { flatDefense: 1 },
  eclipsePinion: { flatMaxHp: 3 },
  wardenSigil: { flatAttack: 1, flatDefense: 1 },
};

export const MATERIALS: MaterialDef[] = [
  { id: "ironBar", name: "Iron Bar", category: "metal", description: "The common backbone of every tier's equipment recipe.", icon: "▮" },
  { id: "steelBar", name: "Steel Bar", category: "metal", description: "Refined and dependable.", icon: "▮" },
  { id: "silversteelBar", name: "Silversteel Bar", category: "metal", description: "Streaked with pale silver veins.", icon: "▮" },
  { id: "embersteelBar", name: "Embersteel Bar", category: "metal", description: "Warm to the touch, faintly glowing.", icon: "▮" },
  { id: "starsteelBar", name: "Starsteel Bar", category: "metal", description: "Impossibly light, flecked with starlight.", icon: "▮" },
  { id: "voidsteelBar", name: "Voidsteel Bar", category: "metal", description: "Drinks in the light around it.", icon: "▮" },
  { id: "garnet", name: "Garnet", category: "gem", description: "A deep red enhancement stone. +0.5% Attack.", icon: "◆" },
  { id: "sapphire", name: "Sapphire", category: "gem", description: "A cool blue enhancement stone. +0.5% Defense.", icon: "◆" },
  { id: "emerald", name: "Emerald", category: "gem", description: "A verdant enhancement stone. +0.5% Max HP.", icon: "◆" },
  { id: "ruby", name: "Ruby", category: "gem", description: "A fierce enhancement stone. +1% Attack.", icon: "◆" },
  { id: "amethyst", name: "Amethyst", category: "gem", description: "A violet enhancement stone. +1% Defense.", icon: "◆" },
  { id: "diamond", name: "Diamond", category: "gem", description: "A flawless enhancement stone. +1% Max HP.", icon: "◆" },
  { id: "cinderSlimeBlob", name: "Cinder Slime Blob", category: "monster-common", description: "Still faintly warm.", icon: "●" },
  { id: "emberNucleus", name: "Ember Nucleus", category: "monster-rare", description: "A hardened core of trapped heat. +1 flat Attack.", icon: "✦" },
  { id: "sentinelBone", name: "Sentinel Bone", category: "monster-common", description: "Dense and unnaturally cold.", icon: "●" },
  { id: "gildedMarrow", name: "Gilded Marrow", category: "monster-rare", description: "Marrow laced with precious metal. +1 flat Defense.", icon: "✦" },
  { id: "duskFeather", name: "Dusk Feather", category: "monster-common", description: "Impossibly light.", icon: "●" },
  { id: "eclipsePinion", name: "Eclipse Pinion", category: "monster-rare", description: "A feather that swallows the light. +3 Max HP.", icon: "✦" },
  { id: "ashenPlateShard", name: "Ashen Plate Shard", category: "monster-common", description: "A chip of scorched armor.", icon: "●" },
  { id: "wardenSigil", name: "Warden Sigil", category: "monster-rare", description: "A glowing rune of protection. +1 flat Attack, +1 flat Defense.", icon: "✦" },
  { id: "emptyVial", name: "Empty Vial", category: "utility", description: "A small glass vial for brewing consumables.", icon: "○" },
];

export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

export function materialDef(id: MaterialId): MaterialDef {
  return MATERIALS.find((m) => m.id === id)!;
}

export function emptyMaterials(): Record<MaterialId, number> {
  return Object.fromEntries(MATERIAL_IDS.map((id) => [id, 0])) as Record<MaterialId, number>;
}
