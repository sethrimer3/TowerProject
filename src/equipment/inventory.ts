// What the save keeps of Equipment, and every change to it: the unlock,
// items (each an instance naming its definition, rarity and level), the two
// loadouts, the nine material balances, each category's pity and the pull
// stream. Pure functions over the save, so tests drive them directly; the
// game's EquipmentDesk wraps them with the loadout sync and the Gems.
import type { Mode } from "../entities.ts";
import { isRecord, wholeIn } from "../decode.ts";
import { snap } from "../exact.ts";
import { CATEGORY_IDS, EQUIP_MATERIAL_IDS, itemDef, materialOf, type CategoryId, type EquipMaterialId } from "./catalog.ts";
import {
  EFFECT_CANDIDATES, EQUIP_RARITIES, EQUIPMENT_CAPACITY, openSlots, PITY, RARITY_TIERS, rarityRank, REFINE_CHOICE_EVERY, UNIQUE_SALVAGE,
  upgradeGold, upgradeMaterial, type EquipRarity,
} from "./balance.ts";
import { inPool } from "./slot-effects.ts";

/** An effect a slot holds or is offered: its id (slot-effects.ts) and rarity. */
export type EffectChoice = { effect: string; rarity: EquipRarity };
/** One effect slot of an item, only what is the item's own: the effect
 * chosen and its rarity (none until its first choice), the paid Refines
 * made of it (`refinement`, which only ever rises), the Choices it has
 * spent, and the candidates on offer (kept until one is taken or the
 * current effect kept, so reloading never rolls them again). */
export type EffectSlot = {
  effect?: string;
  rarity?: EquipRarity;
  refinement?: number;
  choicesUsed?: number;
  offer?: EffectChoice[];
};
/** One piece owned. `spent` is what leveling it has cost (Gold and its
 * material), so a later reset can return exactly that; consumed copies'
 * investment is lost with them. `slots` holds an entry for each effect slot
 * opened so far (`openSlots`). */
export type EquipItem = {
  id: string;
  def: string;
  rarity: EquipRarity;
  level: number;
  locked?: true;
  spent?: { gold: number; material: number };
  slots: EffectSlot[];
};
export type Loadout = Partial<Record<CategoryId, string>>;
export type EquipmentSave = {
  /** Set by claiming Tower I's floor-60 Goal (goals.ts). */
  unlocked: boolean;
  /** Set once the Equipment tab has been opened after the unlock (its dot). */
  seen: boolean;
  items: EquipItem[];
  /** What each mode's hero wears, by category: the inventory is shared,
   * and one piece may be worn in both. */
  equipped: Record<Mode, Loadout>;
  materials: Record<EquipMaterialId, number>;
  /** Gem pulls in a row without a Rare, by category. */
  pity: Record<CategoryId, number>;
  /** The number the next item's id takes. */
  nextId: number;
  /** Where the Gem pulls' stream stands (null until the first pull). */
  rng: number | null;
};

const zeroes = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
export const defaultEquipment = (): EquipmentSave => ({
  unlocked: false, seen: false, items: [], equipped: { tower: {}, delve: {} },
  materials: zeroes(EQUIP_MATERIAL_IDS), pity: zeroes(CATEGORY_IDS), nextId: 1, rng: null,
});

// --- Reading ---

export const findItem = (e: EquipmentSave, id: string) => e.items.find((i) => i.id === id);
export const categoryOf = (item: EquipItem) => itemDef(item.def)!.category;
export const maxLevel = (item: EquipItem) => RARITY_TIERS[item.rarity].maxLevel;
/** The effect slots open on `item` now. */
export const openSlotCount = (item: Pick<EquipItem, "rarity" | "level">) => openSlots(item.rarity, item.level);
/** Gives `item` an empty entry for each slot its rarity and level have
 * opened; one already there is never taken away. */
export function fillSlots(item: EquipItem) {
  while (item.slots.length < openSlotCount(item)) item.slots.push({});
}
/** The modes whose loadout wears `id`. */
export const wornIn = (e: EquipmentSave, id: string) => (["tower", "delve"] as const).filter((m) => Object.values(e.equipped[m]).includes(id));
export const isEquipped = (e: EquipmentSave, id: string) => wornIn(e, id).length > 0;
/** Locked or worn: never consumed by a merge or dismantled, until the
 * player unlocks or takes it off. */
export const isProtected = (e: EquipmentSave, item: EquipItem) => !!item.locked || isEquipped(e, item.id);
export const roomLeft = (e: EquipmentSave) => EQUIPMENT_CAPACITY - e.items.length;

/** What raising `item` one level costs, or null at its rarity's cap. */
export function levelCost(item: EquipItem) {
  if (item.level >= maxLevel(item)) return null;
  return { gold: upgradeGold(item.level), material: upgradeMaterial(item.level), materialId: materialOf(categoryOf(item)) };
}
/** What leveling `item` from 1 to its level cost in all (Gold and
 * material), on today's curve. */
export function curveCost(level: number) {
  let gold = 0, material = 0;
  for (let l = 1; l < level; l++) { gold += upgradeGold(l); material += upgradeMaterial(l); }
  return { gold, material };
}
/** The material a dismantled `item` returns: its rarity's salvage (twice
 * for a Unique), never what leveling it cost. */
export const salvageOf = (item: Pick<EquipItem, "def" | "rarity">) => RARITY_TIERS[item.rarity].salvage * (itemDef(item.def)!.class === "unique" ? UNIQUE_SALVAGE : 1);

// --- Changing ---

/** Adds a new level-1 piece of `def` at `rarity`, or null when the
 * inventory is full. */
export function addItem(e: EquipmentSave, def: string, rarity: EquipRarity): EquipItem | null {
  if (roomLeft(e) <= 0 || !itemDef(def)) return null;
  const item: EquipItem = { id: `e${e.nextId++}`, def, rarity, level: 1, slots: [] };
  fillSlots(item);
  e.items.push(item);
  return item;
}

/** Why a level-up was refused. */
export type LevelRefusal = "missing" | "maxed" | "gold" | "material";
/** Raises `id` by up to `levels`, paying Gold from `purse` and its material
 * for each (unless `free`), stopping at its cap or what can be paid for.
 * Returns the levels gained, or why none were. */
export function levelUp(e: EquipmentSave, purse: { gold: number }, id: string, levels: number, free: boolean): number | LevelRefusal {
  const item = findItem(e, id);
  if (!item) return "missing";
  let gained = 0, refusal: LevelRefusal = "maxed";
  while (gained < levels) {
    const cost = levelCost(item);
    if (!cost) { refusal = "maxed"; break; }
    if (!free && purse.gold < cost.gold) { refusal = "gold"; break; }
    if (!free && e.materials[cost.materialId] < cost.material) { refusal = "material"; break; }
    if (!free) {
      purse.gold = snap(purse.gold - cost.gold);
      e.materials[cost.materialId] -= cost.material;
      const spent = item.spent ?? { gold: 0, material: 0 };
      item.spent = { gold: spent.gold + cost.gold, material: spent.material + cost.material };
    }
    item.level++;
    gained++;
  }
  fillSlots(item);
  return gained || refusal;
}

/** The pieces that can join `target` in a merge: the same definition and
 * rarity, below the top rarity, not protected, lowest level first. */
export function mergeFodder(e: EquipmentSave, target: EquipItem) {
  if (!RARITY_TIERS[target.rarity].next) return [];
  return e.items
    .filter((i) => i.id !== target.id && i.def === target.def && i.rarity === target.rarity && !isProtected(e, i))
    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id, "en", { numeric: true }));
}
/** Why a merge was refused. */
export type MergeRefusal = "missing" | "top" | "count" | "mismatch" | "protected";
/** Merges `fodder` into `targetId`: exactly `merge − 1` other copies of the
 * same definition and rarity, none locked or worn. The target moves up one
 * rarity keeping its level, lock, loadouts, investment and effect slots
 * (their effects and Refinement untouched: the new rarity only lets them
 * rise higher, and opens the next slot once leveled past the old cap); the
 * copies are gone, with what leveling them cost. */
export function merge(e: EquipmentSave, targetId: string, fodder: string[]): EquipItem | MergeRefusal {
  const target = findItem(e, targetId);
  if (!target) return "missing";
  const t = RARITY_TIERS[target.rarity];
  if (!t.next) return "top";
  const unique = new Set(fodder);
  if (unique.size !== fodder.length || fodder.length !== t.merge - 1 || unique.has(targetId)) return "count";
  const copies = fodder.map((id) => findItem(e, id));
  if (copies.some((c) => !c)) return "missing";
  if (copies.some((c) => c!.def !== target.def || c!.rarity !== target.rarity)) return "mismatch";
  if (copies.some((c) => isProtected(e, c!))) return "protected";
  e.items = e.items.filter((i) => !unique.has(i.id));
  target.rarity = t.next;
  return target;
}

/** Why a dismantle was refused. */
export type DismantleRefusal = "missing" | "protected" | "empty";
/** What dismantling `ids` returns, by material. */
export function salvageTotals(e: EquipmentSave, ids: string[]) {
  const totals: Partial<Record<EquipMaterialId, number>> = {};
  for (const id of ids) {
    const item = findItem(e, id);
    if (!item) continue;
    const m = materialOf(categoryOf(item));
    totals[m] = (totals[m] ?? 0) + salvageOf(item);
  }
  return totals;
}
/** Breaks down every piece in `ids` (none locked or worn) for its salvage. */
export function dismantle(e: EquipmentSave, ids: string[]): Partial<Record<EquipMaterialId, number>> | DismantleRefusal {
  const unique = [...new Set(ids)];
  if (!unique.length) return "empty";
  const items = unique.map((id) => findItem(e, id));
  if (items.some((i) => !i)) return "missing";
  if (items.some((i) => isProtected(e, i!))) return "protected";
  const totals = salvageTotals(e, unique);
  for (const [m, n] of Object.entries(totals) as [EquipMaterialId, number][]) e.materials[m] += n;
  const gone = new Set(unique);
  e.items = e.items.filter((i) => !gone.has(i.id));
  return totals;
}

export function setLocked(e: EquipmentSave, id: string, locked: boolean) {
  const item = findItem(e, id);
  if (!item) return false;
  if (locked) item.locked = true;
  else delete item.locked;
  return true;
}

/** Wears `id` in `mode`'s loadout, replacing what its category wore. */
export function equip(e: EquipmentSave, mode: Mode, id: string) {
  const item = findItem(e, id);
  if (!item) return false;
  e.equipped[mode][categoryOf(item)] = id;
  return true;
}
export function unequip(e: EquipmentSave, mode: Mode, category: CategoryId) {
  if (!e.equipped[mode][category]) return false;
  delete e.equipped[mode][category];
  return true;
}

// --- Decoding ---

const validItem = (i: any): i is EquipItem =>
  isRecord(i) && typeof i.id === "string" && /^e\d{1,9}$/.test(i.id) && typeof i.def === "string" && !!itemDef(i.def) &&
  EQUIP_RARITIES.includes(i.rarity) && wholeIn(i.level, 1, Number.MAX_SAFE_INTEGER);
const decodeChoice = (c: any, cap: EquipRarity, category: CategoryId): EffectChoice | null =>
  isRecord(c) && typeof c.effect === "string" && inPool(category, c.effect) && EQUIP_RARITIES.includes(c.rarity)
    ? { effect: c.effect, rarity: rarityRank(c.rarity) > rarityRank(cap) ? cap : c.rarity } : null;
/** An item's saved slots: an effect still in its category's pool, at a
 * rarity no higher than the item allows, never the same effect in two
 * slots; Refinement and Choices spent as whole counts; an offer of known
 * effects. A save from before effect slots gets empty ones, ready for
 * their free first choice. */
function decodeSlots(raw: unknown, item: EquipItem): EffectSlot[] {
  const cap = RARITY_TIERS[item.rarity].maxEffect, category = itemDef(item.def)!.category;
  const slots: EffectSlot[] = [], held = new Set<string>();
  for (const r of Array.isArray(raw) ? raw.slice(0, EQUIP_RARITIES.length) : []) {
    const slot: EffectSlot = {};
    if (isRecord(r)) {
      const chosen = decodeChoice(r, cap, category);
      if (chosen && !held.has(chosen.effect)) { held.add(chosen.effect); slot.effect = chosen.effect; slot.rarity = chosen.rarity; }
      if (wholeIn(r.refinement, 1, Number.MAX_SAFE_INTEGER)) slot.refinement = r.refinement;
      const earned = Math.floor((slot.refinement ?? 0) / REFINE_CHOICE_EVERY);
      if (wholeIn(r.choicesUsed, 1, earned)) slot.choicesUsed = r.choicesUsed;
      const offer = Array.isArray(r.offer) ? r.offer.slice(0, EFFECT_CANDIDATES).map((c) => decodeChoice(c, cap, category)).filter((c): c is EffectChoice => !!c) : [];
      if (offer.length) slot.offer = offer;
    }
    slots.push(slot);
  }
  return slots;
}
const decodeSpent = (s: any) =>
  isRecord(s) && wholeIn(s.gold, 0, Number.MAX_SAFE_INTEGER) && wholeIn(s.material, 0, Number.MAX_SAFE_INTEGER) && (s.gold || s.material)
    ? { gold: s.gold, material: s.material } : undefined;

/** The saved Equipment: known items only (each id once, up to the
 * capacity, levels within their rarity's cap), loadouts naming owned items of the right category, whole
 * material balances and pity below its threshold. */
export function decodeEquipment(raw: unknown): EquipmentSave {
  const e = defaultEquipment();
  if (!isRecord(raw)) return e;
  e.unlocked = raw.unlocked === true;
  e.seen = e.unlocked && raw.seen === true;
  const ids = new Set<string>();
  if (Array.isArray(raw.items))
    for (const i of raw.items) {
      if (e.items.length >= EQUIPMENT_CAPACITY || !validItem(i) || ids.has(i.id)) continue;
      ids.add(i.id);
      const spent = decodeSpent(i.spent);
      // A level over its rarity's cap (a cap lowered since) comes down to it.
      const item: EquipItem = { id: i.id, def: i.def, rarity: i.rarity, level: Math.min(i.level, RARITY_TIERS[i.rarity as EquipRarity].maxLevel), ...(i.locked === true ? { locked: true as const } : {}), ...(spent ? { spent } : {}), slots: [] };
      item.slots = decodeSlots((i as { slots?: unknown }).slots, item);
      fillSlots(item);
      e.items.push(item);
    }
  for (const mode of ["tower", "delve"] as const) {
    const worn = isRecord(raw.equipped) ? raw.equipped[mode] : undefined;
    if (!isRecord(worn)) continue;
    for (const c of CATEGORY_IDS) {
      const item = typeof worn[c] === "string" ? findItem(e, worn[c]) : undefined;
      if (item && categoryOf(item) === c) e.equipped[mode][c] = item.id;
    }
  }
  for (const m of EQUIP_MATERIAL_IDS) if (isRecord(raw.materials) && wholeIn(raw.materials[m], 0, Number.MAX_SAFE_INTEGER)) e.materials[m] = raw.materials[m];
  for (const c of CATEGORY_IDS) if (isRecord(raw.pity) && wholeIn(raw.pity[c], 0, PITY - 1)) e.pity[c] = raw.pity[c];
  const highest = e.items.reduce((n, i) => Math.max(n, Number(i.id.slice(1))), 0);
  e.nextId = Math.max(highest + 1, wholeIn(raw.nextId, 1, 1e9) ? raw.nextId : 1);
  if (wholeIn(raw.rng, 0, 4294967295)) e.rng = raw.rng;
  return e;
}

/** Whether the Gear tab shows its dot for Equipment: open, and its screen
 * not yet seen. */
export const equipmentWaiting = (save: { equipment: EquipmentSave }) => save.equipment.unlocked && !save.equipment.seen;
