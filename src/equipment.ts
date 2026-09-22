// Persistent crafted-equipment model: slots, recipes, and stat formulas.
// See docs/CRAFTING_AND_EQUIPMENT.md for the design source of truth.
import { GEMS, METALS, RARE_ENHANCEMENTS, type MaterialId, type MaterialStack, type MetalId } from "./materials.ts";

export type EquipmentSlot =
  | "weapon"
  | "shield"
  | "helmet"
  | "chestplate"
  | "leggings"
  | "boots"
  | "gloves"
  | "necklace"
  | "ring";

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "weapon", "shield", "helmet", "chestplate", "leggings", "boots", "gloves", "necklace", "ring",
];

export const SLOT_NAMES: Record<EquipmentSlot, string> = {
  weapon: "Sword",
  shield: "Shield",
  helmet: "Helmet",
  chestplate: "Chestplate",
  leggings: "Leggings",
  boots: "Boots",
  gloves: "Gloves",
  necklace: "Necklace",
  ring: "Ring",
};

/** Every crafted item is its own persistent object — two Iron Shields with
 * different enhancements are distinct inventory entries. Finalized stats are
 * stored on the item at craft time and never silently recomputed later. */
export type CraftedEquipment = {
  id: string;
  slot: EquipmentSlot;
  name: string;
  metal: MetalId;
  flatAttack: number;
  flatDefense: number;
  flatMaxHp: number;
  /** Fractions, e.g. 0.05 === +5%. */
  percentAttack: number;
  percentDefense: number;
  percentMaxHp: number;
  baseRecipe: MaterialStack[];
  enhancements: MaterialStack[];
  createdAt: number;
};

export const RECIPES: Record<EquipmentSlot, { bars: number; commonMaterial: MaterialId; commonAmount: number }> = {
  weapon: { bars: 40, commonMaterial: "cinderSlimeBlob", commonAmount: 12 },
  shield: { bars: 50, commonMaterial: "sentinelBone", commonAmount: 15 },
  helmet: { bars: 30, commonMaterial: "sentinelBone", commonAmount: 8 },
  chestplate: { bars: 70, commonMaterial: "ashenPlateShard", commonAmount: 20 },
  leggings: { bars: 55, commonMaterial: "ashenPlateShard", commonAmount: 15 },
  boots: { bars: 25, commonMaterial: "duskFeather", commonAmount: 8 },
  gloves: { bars: 20, commonMaterial: "cinderSlimeBlob", commonAmount: 6 },
  necklace: { bars: 15, commonMaterial: "duskFeather", commonAmount: 5 },
  ring: { bars: 10, commonMaterial: "sentinelBone", commonAmount: 4 },
};

/** Round to the nearest whole number, minimum 1 for any non-zero input. */
function roundStat(v: number): number {
  if (v === 0) return 0;
  return Math.max(1, Math.round(v));
}

type BaseStats = { attack: number; defense: number; maxHp: number };

const SLOT_FORMULAS: Record<EquipmentSlot, (P: number) => BaseStats> = {
  weapon: (P) => ({ attack: roundStat(4 * P), defense: 0, maxHp: 0 }),
  shield: (P) => ({ attack: 0, defense: roundStat(3 * P), maxHp: 0 }),
  helmet: (P) => ({ attack: 0, defense: roundStat(1.5 * P), maxHp: roundStat(5 * P) }),
  chestplate: (P) => ({ attack: 0, defense: roundStat(3 * P), maxHp: roundStat(10 * P) }),
  leggings: (P) => ({ attack: 0, defense: roundStat(2 * P), maxHp: roundStat(7 * P) }),
  boots: (P) => ({ attack: 0, defense: roundStat(1 * P), maxHp: roundStat(4 * P) }),
  gloves: (P) => ({ attack: roundStat(1.5 * P), defense: roundStat(0.5 * P), maxHp: 0 }),
  necklace: (P) => ({ attack: roundStat(0.5 * P), defense: 0, maxHp: roundStat(8 * P) }),
  ring: (P) => ({ attack: roundStat(1 * P), defense: roundStat(0.5 * P), maxHp: 0 }),
};

export function getEquipmentBaseStats(slot: EquipmentSlot, metal: MetalId): BaseStats {
  const power = METALS.find((m) => m.id === metal)!.power;
  return SLOT_FORMULAS[slot](power);
}

export type EnhancementCaps = { gems: number; rareParts: number };
export const ENHANCEMENT_CAPS: EnhancementCaps = { gems: 10, rareParts: 10 };

export function enhancementTotals(enhancements: MaterialStack[]): { gems: number; rareParts: number } {
  let gems = 0, rareParts = 0;
  for (const stack of enhancements) {
    if (GEMS.some((g) => g.id === stack.id)) gems += stack.quantity;
    if (RARE_ENHANCEMENTS[stack.id]) rareParts += stack.quantity;
  }
  return { gems, rareParts };
}

type FinalizedStats = {
  flatAttack: number; flatDefense: number; flatMaxHp: number;
  percentAttack: number; percentDefense: number; percentMaxHp: number;
};

/** Base metal stats + flat rare-part bonuses + summed percentage gem bonuses,
 * finalized once at craft time (see docs/CRAFTING_AND_EQUIPMENT.md #9). */
export function calculateEquipmentStats(slot: EquipmentSlot, metal: MetalId, enhancements: MaterialStack[]): FinalizedStats {
  const base = getEquipmentBaseStats(slot, metal);
  let flatAttack = base.attack, flatDefense = base.defense, flatMaxHp = base.maxHp;
  let percentAttack = 0, percentDefense = 0, percentMaxHp = 0;
  for (const stack of enhancements) {
    const rare = RARE_ENHANCEMENTS[stack.id];
    if (rare) {
      flatAttack += (rare.flatAttack ?? 0) * stack.quantity;
      flatDefense += (rare.flatDefense ?? 0) * stack.quantity;
      flatMaxHp += (rare.flatMaxHp ?? 0) * stack.quantity;
    }
    const gem = GEMS.find((g) => g.id === stack.id);
    if (gem) {
      const amount = gem.enhancement.percent * stack.quantity;
      if (gem.enhancement.stat === "attack") percentAttack += amount;
      if (gem.enhancement.stat === "defense") percentDefense += amount;
      if (gem.enhancement.stat === "maxHp") percentMaxHp += amount;
    }
  }
  return { flatAttack, flatDefense, flatMaxHp, percentAttack, percentDefense, percentMaxHp };
}

export function equipmentName(slot: EquipmentSlot, metal: MetalId): string {
  return `${METALS.find((m) => m.id === metal)!.name} ${SLOT_NAMES[slot]}`;
}
