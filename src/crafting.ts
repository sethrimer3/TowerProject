// State-mutating crafting operations over a Save: crediting materials and
// brewing consumables. Pure calculation lives in materials.ts; this module
// is the only place that actually spends or refunds persistent material
// counts. (Equipment, its own system, lives in equipment/.)
// See docs/CRAFTING_AND_EQUIPMENT.md for the design source of truth.
import type { Save } from "./entities.ts";
import type { MaterialStack } from "./materials.ts";
import { potionHeal, type StepRules } from "./step-effects.ts";

export function creditMaterials(save: Save, stacks: MaterialStack[]): void {
  for (const stack of stacks) save.materials[stack.id] = (save.materials[stack.id] ?? 0) + stack.quantity;
}

// --- Consumables (minimal follow-up infrastructure) ---

export type ConsumableId = "cinderTonic";

export type ConsumableDef = {
  id: ConsumableId;
  name: string;
  recipe: MaterialStack[];
  /** HP it restores before Potion HP research (see `consumableText`). */
  healAmount: number;
};

export const CONSUMABLES: ConsumableDef[] = [
  {
    id: "cinderTonic",
    name: "Cinder Tonic",
    recipe: [{ id: "emptyVial", quantity: 1 }, { id: "cinderSlimeBlob", quantity: 3 }],
    healAmount: 35,
  },
];

/** A consumable's description, with the HP it restores under `rules`. */
export const consumableText = (def: ConsumableDef, rules: StepRules) =>
  `Restores ${potionHeal(def.healAmount, rules)} HP. Cannot increase Max HP.`;

export function canCraftConsumable(save: Save, id: ConsumableId): boolean {
  const def = CONSUMABLES.find((c) => c.id === id)!;
  return save.settings.freePurchases || def.recipe.every((s) => (save.materials[s.id] ?? 0) >= s.quantity);
}

export function craftConsumable(save: Save, id: ConsumableId): boolean {
  if (!canCraftConsumable(save, id)) return false;
  const def = CONSUMABLES.find((c) => c.id === id)!;
  if (!save.settings.freePurchases) for (const s of def.recipe) save.materials[s.id] -= s.quantity;
  save.consumables[id] = (save.consumables[id] ?? 0) + 1;
  return true;
}
