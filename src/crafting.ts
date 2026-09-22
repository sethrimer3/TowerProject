// State-mutating crafting/salvage/equip operations over a Save. Pure
// calculation lives in equipment.ts/materials.ts; this module is the only
// place that actually spends or refunds persistent material counts.
// See docs/CRAFTING_AND_EQUIPMENT.md for the design source of truth.
import type { Save } from "./entities.ts";
import { GEMS, RARE_ENHANCEMENTS, type MaterialId, type MaterialStack } from "./materials.ts";
import {
  calculateEquipmentStats,
  EQUIPMENT_SLOTS,
  ENHANCEMENT_CAPS,
  enhancementTotals,
  equipmentName,
  RECIPES,
  type CraftedEquipment,
  type EquipmentSlot,
} from "./equipment.ts";
import { METALS, type MetalId } from "./materials.ts";

function materialCost(slot: EquipmentSlot, metal: MetalId, enhancements: MaterialStack[]): Map<MaterialId, number> {
  const recipe = RECIPES[slot];
  const metalDef = METALS.find((m) => m.id === metal)!;
  const cost = new Map<MaterialId, number>();
  cost.set(metalDef.materialId, (cost.get(metalDef.materialId) ?? 0) + recipe.bars);
  cost.set(recipe.commonMaterial, (cost.get(recipe.commonMaterial) ?? 0) + recipe.commonAmount);
  for (const stack of enhancements) if (stack.quantity > 0) cost.set(stack.id, (cost.get(stack.id) ?? 0) + stack.quantity);
  return cost;
}

export function canCraft(save: Save, slot: EquipmentSlot, metal: MetalId, enhancements: MaterialStack[]): boolean {
  const { gems, rareParts } = enhancementTotals(enhancements);
  if (gems > ENHANCEMENT_CAPS.gems || rareParts > ENHANCEMENT_CAPS.rareParts) return false;
  if (enhancements.some((s) => s.quantity <= 0 || !(GEMS.some((g) => g.id === s.id) || RARE_ENHANCEMENTS[s.id]))) return false;
  const cost = materialCost(slot, metal, enhancements);
  for (const [id, qty] of cost) if ((save.materials[id] ?? 0) < qty) return false;
  return true;
}

export function craftEquipment(
  save: Save,
  slot: EquipmentSlot,
  metal: MetalId,
  enhancements: MaterialStack[],
  makeId: () => string = () => crypto.randomUUID(),
): CraftedEquipment | null {
  if (!canCraft(save, slot, metal, enhancements)) return null;
  const cost = materialCost(slot, metal, enhancements);
  for (const [id, qty] of cost) save.materials[id] = (save.materials[id] ?? 0) - qty;
  const stats = calculateEquipmentStats(slot, metal, enhancements);
  const recipe = RECIPES[slot];
  const metalDef = METALS.find((m) => m.id === metal)!;
  const item: CraftedEquipment = {
    id: makeId(),
    slot,
    name: equipmentName(slot, metal),
    metal,
    ...stats,
    baseRecipe: [
      { id: metalDef.materialId, quantity: recipe.bars },
      { id: recipe.commonMaterial, quantity: recipe.commonAmount },
    ],
    enhancements: enhancements.filter((s) => s.quantity > 0),
    createdAt: Date.now(),
  };
  save.equipmentInventory.push(item);
  return item;
}

const SALVAGE_RETURN_RATE = 0.4;

/** Base recipe materials only — gems and rare parts are never returned
 * until recovery research (not yet implemented) unlocks partial recovery. */
export function getSalvageReturns(item: CraftedEquipment): MaterialStack[] {
  return item.baseRecipe
    .map((s) => ({ id: s.id, quantity: Math.floor(s.quantity * SALVAGE_RETURN_RATE) }))
    .filter((s) => s.quantity > 0);
}

export function isEquipped(save: Save, itemId: string): boolean {
  return Object.values(save.equipped).includes(itemId);
}

/** Refuses to salvage a currently equipped item — the caller must unequip
 * first (or ask for explicit confirmation that also unequips it). */
export function salvageEquipment(save: Save, itemId: string): boolean {
  if (isEquipped(save, itemId)) return false;
  const idx = save.equipmentInventory.findIndex((e) => e.id === itemId);
  if (idx === -1) return false;
  const item = save.equipmentInventory[idx];
  for (const stack of getSalvageReturns(item)) save.materials[stack.id] = (save.materials[stack.id] ?? 0) + stack.quantity;
  save.equipmentInventory.splice(idx, 1);
  return true;
}

/** Equipping into an occupied slot automatically returns the previous item
 * to inventory (it is never removed — equipped items still live in
 * equipmentInventory, referenced by id, not duplicated). */
export function equipItem(save: Save, itemId: string): boolean {
  const item = save.equipmentInventory.find((e) => e.id === itemId);
  if (!item) return false;
  save.equipped[item.slot] = itemId;
  return true;
}

export function unequipSlot(save: Save, slot: EquipmentSlot): void {
  delete save.equipped[slot];
}

export type EquipmentBonuses = {
  flatAttack: number; flatDefense: number; flatMaxHp: number;
  percentAttack: number; percentDefense: number; percentMaxHp: number;
};

/** Aggregates stats purely from the equipped item ids — never mutates
 * permanent stats directly, so equip/unequip is always safe to recompute. */
export function getEquippedBonuses(save: Save): EquipmentBonuses {
  const totals: EquipmentBonuses = {
    flatAttack: 0, flatDefense: 0, flatMaxHp: 0,
    percentAttack: 0, percentDefense: 0, percentMaxHp: 0,
  };
  for (const slot of EQUIPMENT_SLOTS) {
    const id = save.equipped[slot];
    if (!id) continue;
    const item = save.equipmentInventory.find((e) => e.id === id);
    if (!item) continue;
    totals.flatAttack += item.flatAttack;
    totals.flatDefense += item.flatDefense;
    totals.flatMaxHp += item.flatMaxHp;
    totals.percentAttack += item.percentAttack;
    totals.percentDefense += item.percentDefense;
    totals.percentMaxHp += item.percentMaxHp;
  }
  return totals;
}

export function creditMaterials(save: Save, stacks: MaterialStack[]): void {
  for (const stack of stacks) save.materials[stack.id] = (save.materials[stack.id] ?? 0) + stack.quantity;
}

// --- Consumables (minimal follow-up infrastructure) ---

export type ConsumableId = "cinderTonic";

export type ConsumableDef = {
  id: ConsumableId;
  name: string;
  description: string;
  recipe: MaterialStack[];
  healAmount: number;
};

export const CONSUMABLES: ConsumableDef[] = [
  {
    id: "cinderTonic",
    name: "Cinder Tonic",
    description: "Restores 35 HP. Cannot increase Max HP.",
    recipe: [{ id: "emptyVial", quantity: 1 }, { id: "cinderSlimeBlob", quantity: 3 }],
    healAmount: 35,
  },
];

export function canCraftConsumable(save: Save, id: ConsumableId): boolean {
  const def = CONSUMABLES.find((c) => c.id === id)!;
  return def.recipe.every((s) => (save.materials[s.id] ?? 0) >= s.quantity);
}

export function craftConsumable(save: Save, id: ConsumableId): boolean {
  if (!canCraftConsumable(save, id)) return false;
  const def = CONSUMABLES.find((c) => c.id === id)!;
  for (const s of def.recipe) save.materials[s.id] -= s.quantity;
  save.consumables[id] = (save.consumables[id] ?? 0) + 1;
  return true;
}
