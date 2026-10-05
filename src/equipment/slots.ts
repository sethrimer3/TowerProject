// Effect slots and Refinement: what an item's slots hold and every change to
// them. A slot opens as the item's rarity and level allow (`openSlots`), and
// its first roll is free: a few candidates from the category's pool, one of
// which the player takes. After that, a paid Refine rolls new candidates
// beside the effect held, which stays unless the player takes one, and
// always adds to the slot's Refinement: every fifth Refine guarantees a
// candidate at the item's highest effect rarity, and every tenth earns a
// Choice, any effect of the pool at that rarity, taken outright. Improve
// raises the effect held one rarity, as far as the item allows. So luck
// decides how soon a slot is perfect, and spending decides that it will be.
// Pure functions over the save; the game's EquipmentDesk wraps them.
import { snap } from "../exact.ts";
import {
  EFFECT_CANDIDATES, EFFECT_RARITY_WEIGHTS, EQUIP_RARITIES, IMPROVE_COST_FACTOR, RARITY_TIERS, rarityRank, REFINE_CHOICE_EVERY,
  REFINE_COST, REFINE_GUARANTEE_EVERY, type EquipRarity,
} from "./balance.ts";
import { effectPool, inPool, slotEffectDef } from "./slot-effects.ts";
import { categoryOf, findItem, openSlotCount, type EffectChoice, type EffectSlot, type EquipItem, type EquipmentSave } from "./inventory.ts";
import { materialOf } from "./catalog.ts";
import { rollRarity, withSavedStream } from "./acquire.ts";

/** The rarest effect `item`'s slots may hold. */
export const effectCap = (item: Pick<EquipItem, "rarity">) => RARITY_TIERS[item.rarity].maxEffect;

/** Each slot `item` will ever have, in order: open or not, the level it
 * opens at and the rarity it needs. */
export function slotPlan(item: EquipItem) {
  const open = openSlotCount(item);
  return EQUIP_RARITIES.map((rarity, index) => ({
    index, rarity, level: RARITY_TIERS[rarity].slotLevel, open: index < open,
    slot: index < open ? item.slots[index] : undefined,
  }));
}

/** A slot's Choices earned and not yet spent. */
export const choicesLeft = (slot: EffectSlot) => Math.floor((slot.refinement ?? 0) / REFINE_CHOICE_EVERY) - (slot.choicesUsed ?? 0);
/** The next Refinement milestone a slot reaches: the count it comes at and
 * what it brings (a Choice, or a guaranteed top-rarity candidate). */
export function nextMilestone(slot: EffectSlot) {
  const at = (Math.floor((slot.refinement ?? 0) / REFINE_GUARANTEE_EVERY) + 1) * REFINE_GUARANTEE_EVERY;
  return { at, reward: at % REFINE_CHOICE_EVERY === 0 ? ("choice" as const) : ("guarantee" as const) };
}

/** What one Refine of `item`'s slot costs: Gold and its category's material. */
export function refineCost(item: EquipItem) {
  const c = REFINE_COST[item.rarity];
  return { gold: c.gold, material: c.material, materialId: materialOf(categoryOf(item)) };
}
/** What improving a slot's effect one rarity costs. */
export function improveCost(item: EquipItem) {
  const c = refineCost(item);
  return { ...c, gold: c.gold * IMPROVE_COST_FACTOR, material: c.material * IMPROVE_COST_FACTOR };
}

/** The effects slot `index` may be offered: the category's pool less those
 * the item's other open slots hold. */
export function slotPool(item: EquipItem, index: number) {
  const others = new Set(item.slots.slice(0, openSlotCount(item)).filter((_, i) => i !== index).map((s) => s.effect));
  return effectPool(categoryOf(item)).filter((d) => !others.has(d.id));
}

/** `EFFECT_CANDIDATES` different effects for slot `index`, each at a
 * rarity rolled by `EFFECT_RARITY_WEIGHTS` up to the item's cap; with
 * `guaranteed`, the first is at the cap. */
export function rollCandidates(item: EquipItem, index: number, guaranteed: boolean, rng: () => number): EffectChoice[] {
  const cap = effectCap(item), left = slotPool(item, index);
  const weights = Object.fromEntries(EQUIP_RARITIES.filter((r) => rarityRank(r) <= rarityRank(cap)).map((r) => [r, EFFECT_RARITY_WEIGHTS[r]]));
  const offer: EffectChoice[] = [];
  while (offer.length < EFFECT_CANDIDATES && left.length) {
    const [def] = left.splice(Math.min(left.length - 1, Math.floor(rng() * left.length)), 1);
    const rarity = guaranteed && !offer.length ? cap : rollRarity(weights, rng());
    offer.push({ effect: def.id, rarity });
  }
  return offer;
}

/** Why a slot command was refused. */
export type SlotRefusal = "missing" | "closed" | "chosen" | "empty" | "offered" | "none" | "pick" | "top" | "gold" | "material" | "choice";

/** Finds `index`'s open slot on item `id`, or why it can't be used. */
function openSlot(e: EquipmentSave, id: string, index: number): { item: EquipItem; slot: EffectSlot } | SlotRefusal {
  const item = findItem(e, id);
  if (!item) return "missing";
  if (!Number.isInteger(index) || index < 0 || index >= openSlotCount(item) || !item.slots[index]) return "closed";
  return { item, slot: item.slots[index] };
}
/** Pays `cost` from `purse` and the item's material balance, unless `free`. */
function pay(e: EquipmentSave, purse: { gold: number }, cost: ReturnType<typeof refineCost>, free: boolean): SlotRefusal | null {
  if (free) return null;
  if (purse.gold < cost.gold) return "gold";
  if (e.materials[cost.materialId] < cost.material) return "material";
  purse.gold = snap(purse.gold - cost.gold);
  e.materials[cost.materialId] -= cost.material;
  return null;
}

/** A newly opened slot's first roll, free: candidates to choose among. A
 * slot already holding an effect, or already offered, rolls nothing. */
export function firstRoll(e: EquipmentSave, id: string, index: number, seed: () => number): EffectChoice[] | SlotRefusal {
  const found = openSlot(e, id, index);
  if (typeof found === "string") return found;
  const { item, slot } = found;
  if (slot.effect) return "chosen";
  if (slot.offer) return "offered";
  slot.offer = withSavedStream(e, seed, (rng) => rollCandidates(item, index, false, rng));
  return slot.offer;
}

/** A paid Refine of a slot holding an effect: one more Refinement, and new
 * candidates beside the effect held, which stays unless one is taken (the
 * milestone guarantee on every `REFINE_GUARANTEE_EVERY`th). Refused while
 * candidates are still on offer. */
export function refine(e: EquipmentSave, purse: { gold: number }, id: string, index: number, free: boolean, seed: () => number): EffectChoice[] | SlotRefusal {
  const found = openSlot(e, id, index);
  if (typeof found === "string") return found;
  const { item, slot } = found;
  if (!slot.effect) return "empty";
  if (slot.offer) return "offered";
  const unpaid = pay(e, purse, refineCost(item), free);
  if (unpaid) return unpaid;
  slot.refinement = (slot.refinement ?? 0) + 1;
  const guaranteed = slot.refinement % REFINE_GUARANTEE_EVERY === 0;
  slot.offer = withSavedStream(e, seed, (rng) => rollCandidates(item, index, guaranteed, rng));
  return slot.offer;
}

/** Takes candidate `pick` of the slot's offer in place of its effect. */
export function takeCandidate(e: EquipmentSave, id: string, index: number, pick: number): EffectChoice | SlotRefusal {
  const found = openSlot(e, id, index);
  if (typeof found === "string") return found;
  const { item, slot } = found;
  const chosen = slot.offer?.[pick];
  if (!slot.offer) return "none";
  // Never the same effect in two slots (an offer kept from an older save).
  if (!chosen || !slotPool(item, index).some((d) => d.id === chosen.effect)) return "pick";
  slot.effect = chosen.effect;
  slot.rarity = chosen.rarity;
  delete slot.offer;
  return chosen;
}
/** Keeps the slot's effect and lets the candidates go (its Refinement stays). */
export function keepCurrent(e: EquipmentSave, id: string, index: number): true | SlotRefusal {
  const found = openSlot(e, id, index);
  if (typeof found === "string") return found;
  if (!found.slot.offer) return "none";
  if (!found.slot.effect) return "empty";
  delete found.slot.offer;
  return true;
}

/** Spends one of the slot's Choices on `effect`, from the pool its other
 * slots leave, at the item's highest effect rarity. Any candidates on
 * offer go. */
export function spendChoice(e: EquipmentSave, id: string, index: number, effect: string): EffectChoice | SlotRefusal {
  const found = openSlot(e, id, index);
  if (typeof found === "string") return found;
  const { item, slot } = found;
  if (choicesLeft(slot) <= 0) return "choice";
  if (!inPool(categoryOf(item), effect) || !slotPool(item, index).some((d) => d.id === effect)) return "pick";
  slot.choicesUsed = (slot.choicesUsed ?? 0) + 1;
  slot.effect = effect;
  slot.rarity = effectCap(item);
  delete slot.offer;
  return { effect, rarity: slot.rarity };
}

/** Raises the slot's effect one rarity, up to the item's cap, for
 * `improveCost`: the same effect, stronger. */
export function improve(e: EquipmentSave, purse: { gold: number }, id: string, index: number, free: boolean): EquipRarity | SlotRefusal {
  const found = openSlot(e, id, index);
  if (typeof found === "string") return found;
  const { item, slot } = found;
  if (!slot.effect || !slot.rarity) return "empty";
  if (rarityRank(slot.rarity) >= rarityRank(effectCap(item))) return "top";
  const unpaid = pay(e, purse, improveCost(item), free);
  if (unpaid) return unpaid;
  slot.rarity = EQUIP_RARITIES[rarityRank(slot.rarity) + 1];
  return slot.rarity;
}

/** The effects `item`'s open slots hold, each with its definition. */
export function slotEffects(item: EquipItem) {
  return item.slots.slice(0, openSlotCount(item)).flatMap((slot) => {
    const def = slot.effect ? slotEffectDef(slot.effect) : undefined;
    return def && slot.rarity ? [{ def, rarity: slot.rarity }] : [];
  });
}