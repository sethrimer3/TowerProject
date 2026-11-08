// What the save keeps of Equipment, and every change to it: the unlock,
// items (each an instance naming its definition, rarity, Stars and level),
// the two loadouts, the four material balances, each category's pity and the
// pull stream. Pure functions over the save, so tests drive them directly;
// the game's EquipmentDesk wraps them with the loadout sync and the Gems.
import type { Mode } from "../entities.ts";
import { isRecord, wholeIn } from "../save/decode.ts";
import { snap } from "../exact.ts";
import { CATEGORIES, CATEGORY_IDS, EQUIP_MATERIAL_IDS, itemDef, materialOf, hasMaterials, spendMaterials, STARTER_CATEGORIES, type CategoryId, type EquipMaterialId } from "./catalog.ts";
import {
  EFFECT_CANDIDATES, EQUIP_RARITIES, EQUIPMENT_CAPACITY, openSlots, PITY, RARITY_TIERS, rarityRank, REFINE_CHOICE_EVERY, STANDARD_TOP, STARS,
  SUBSTAT_SLOT_LEVELS, substatCap, UNIQUE_SALVAGE, upgradeGold, upgradeMaterial, type EquipRarity,
} from "./balance.ts";
import { inPool, rollsAt, slotEffectDef } from "./slot-effects.ts";

/** An effect a slot holds or is offered: its id (slot-effects.ts) and rarity. */
export type EffectChoice = { effect: string; rarity: EquipRarity };
/** One substat slot of an item, only what is the item's own: the effect
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
 * materials in total), so a later reset can return exactly that; consumed copies'
 * investment is lost with them. `stars` (1 to 5) only on an Ancestral
 * piece. `slots` holds an entry for each substat slot its level has
 * opened (`openSlots`). */
export type EquipItem = {
  id: string;
  def: string;
  rarity: EquipRarity;
  stars?: number;
  level: number;
  locked?: true;
  spent?: { gold: number; material: number };
  slots: EffectSlot[];
};
export type Loadout = Partial<Record<CategoryId, string>>;
/** What a Gem pull is made in: one category, or all open categories. */
export type PullKey = CategoryId | "all";
/** Equipment's saved random streams: each pull key's, and the substat rolls'. */
export type StreamKey = PullKey | "substats";
export const PULL_KEYS: readonly PullKey[] = [...CATEGORY_IDS, "all"];
export const STREAM_KEYS: readonly StreamKey[] = [...PULL_KEYS, "substats"];
export type EquipmentSave = {
  /** Set by claiming Tower II's floor-60 Goal (goals.ts). */
  unlocked: boolean;
  /** Set once the Equipment tab has been opened after the unlock (its dot). */
  seen: boolean;
  /** Extra categories have no automatic unlock schedule yet. */
  categories: CategoryId[];
  items: EquipItem[];
  /** What each mode's hero wears, by category: the inventory is shared,
   * and one piece may be worn in both. */
  equipped: Record<Mode, Loadout>;
  materials: Record<EquipMaterialId, number>;
  /** Gem pulls in a row without an Epic or better, by category, and pulls of all categories apart. */
  pity: Record<PullKey, number>;
  /** The number the next item's id takes. */
  nextId: number;
  /** Where each saved stream stands (each category's pulls, pulls of all
   * categories, the substat rolls), absent until it is first drawn from. */
  streams: Partial<Record<StreamKey, number>>;
  /** The Uniques the player has left out of future Gem pulls. */
  drawOff: string[];
  /** The Uniques a five-Star copy has been made of, once each: the first
   * leaves its piece out of draws. */
  maxed: string[];
  /** The player's choice to salvage Common chest pieces into their material
   * as they drop, instead of keeping them (the Salvage section's toggle). */
  autoSalvage: boolean;
};

const zeroes = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
export const defaultEquipment = (): EquipmentSave => ({
  unlocked: false, seen: false, categories: CATEGORY_IDS.filter(c => STARTER_CATEGORIES.includes(c)), items: [], equipped: { tower: {}, delve: {} },
  materials: zeroes(EQUIP_MATERIAL_IDS), pity: zeroes(PULL_KEYS), nextId: 1, streams: {}, drawOff: [], maxed: [], autoSalvage: false,
});

// --- Reading ---

export const categoryOpen = (e: EquipmentSave, category: CategoryId) => e.categories.includes(category);
export const availableCategories = (e: EquipmentSave) => CATEGORY_IDS.filter(c => categoryOpen(e, c));

export const findItem = (e: EquipmentSave, id: string) => e.items.find((i) => i.id === id);
export const categoryOf = (item: Pick<EquipItem, "def">) => itemDef(item.def)!.category;
export const isUnique = (item: Pick<EquipItem, "def">) => itemDef(item.def)!.class === "unique";
/** The highest level a piece of `rarity` with `stars` reaches. */
export const levelCap = (rarity: EquipRarity, stars = 0) => RARITY_TIERS[rarity].maxLevel + (rarity === "ancestral" ? stars * STARS.levels : 0);
export const maxLevel = (item: Pick<EquipItem, "rarity" | "stars">) => levelCap(item.rarity, item.stars);
/** The highest level `item` can ever reach, by merging on: a Common
 * piece's own cap (it never merges), a Standard's at Legendary, a Unique's
 * at five Stars. */
export function reachableLevel(item: Pick<EquipItem, "def" | "rarity">) {
  if (item.rarity === "common") return levelCap("common");
  return isUnique(item) ? levelCap("ancestral", STARS.most) : Math.max(levelCap(item.rarity), levelCap(STANDARD_TOP));
}
/** The substat slots open on `item` now. */
export const openSlotCount = (item: Pick<EquipItem, "level">) => openSlots(item.level);
/** The lowest rarity (and Stars) whose cap reaches `level`, for "needs" hints. */
export function rarityFor(level: number): { rarity: EquipRarity; stars: number } {
  const rarity = EQUIP_RARITIES.find((r) => RARITY_TIERS[r].maxLevel >= level);
  if (rarity) return { rarity, stars: 0 };
  return { rarity: "ancestral", stars: Math.min(STARS.most, Math.ceil((level - RARITY_TIERS.ancestral.maxLevel) / STARS.levels)) };
}
/** Gives `item` an empty entry for each slot its level has opened; one
 * already there is never taken away. */
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

/** What raising `item` one level costs, or null at its cap. */
export function levelCost(item: EquipItem) {
  if (item.level >= maxLevel(item)) return null;
  return { gold: upgradeGold(item.level + 1), material: upgradeMaterial(item.level + 1), materialId: materialOf(categoryOf(item)), category: categoryOf(item) };
}
/** What leveling a piece from 0 to `level` costs in all (Gold and each
 * recipe input), on today's curve. */
export function curveCost(level: number) {
  let gold = 0, material = 0;
  for (let l = 1; l <= level; l++) { gold += upgradeGold(l); material += upgradeMaterial(l); }
  return { gold, material };
}
/** The material a dismantled `item` returns: its rarity's salvage (twice
 * for a Unique), never what leveling it cost. */
export const salvageOf = (item: Pick<EquipItem, "def" | "rarity">) => RARITY_TIERS[item.rarity].salvage * (isUnique(item) ? UNIQUE_SALVAGE : 1);

// --- Merging ---

/** What merging `target` makes: a rarity up (`same` pieces of its
 * definition, the target among them, and `any` more of its category, all at
 * its rarity), or, for an Ancestral piece, a Star (one Legendary copy of the
 * same definition). Null where it can go no higher: Common, a Standard at
 * Legendary, an Ancestral at five Stars. */
export type MergePlan =
  | { kind: "rarity"; next: EquipRarity; same: number; any: number; need: number }
  | { kind: "star"; stars: number; need: 1 };
export function mergePlan(target: Pick<EquipItem, "def" | "rarity" | "stars">): MergePlan | null {
  if (target.rarity === "ancestral") {
    const stars = target.stars ?? 0;
    return stars < STARS.most && isUnique(target) ? { kind: "star", stars: stars + 1, need: 1 } : null;
  }
  const recipe = RARITY_TIERS[target.rarity].merge;
  if (!recipe || (!isUnique(target) && rarityRank(target.rarity) >= rarityRank(STANDARD_TOP))) return null;
  return { kind: "rarity", next: recipe.next, same: recipe.same, any: recipe.any, need: recipe.same - 1 + recipe.any };
}
/** Whether `piece` matches `target`'s definition (and so fills a `same` place). */
const sameDef = (target: EquipItem, piece: EquipItem) => piece.def === target.def;
/** Whether `piece` may go into `target`'s merge at all: at the rarity the
 * plan takes (the target's, or Legendary for a Star), of the definition or,
 * where the recipe takes `any`, the category. */
function fits(target: EquipItem, plan: MergePlan, piece: EquipItem) {
  if (plan.kind === "star") return sameDef(target, piece) && piece.rarity === STARS.fodder;
  return piece.rarity === target.rarity && (plan.any ? categoryOf(piece) === categoryOf(target) : sameDef(target, piece));
}
/** The pieces that can join `target` in a merge, not protected: its own
 * definition's copies first, then (where the recipe takes `any`) its
 * category's others, Standard before Unique, each lowest level first. */
export function mergeFodder(e: EquipmentSave, target: EquipItem) {
  const plan = mergePlan(target);
  if (!plan) return [];
  const byId = (a: EquipItem, b: EquipItem) => a.id.localeCompare(b.id, "en", { numeric: true });
  return e.items
    .filter((i) => i.id !== target.id && !isProtected(e, i) && fits(target, plan, i))
    .sort((a, b) => Number(!sameDef(target, a)) - Number(!sameDef(target, b)) || Number(isUnique(a)) - Number(isUnique(b)) || a.level - b.level || byId(a, b));
}
/** The fodder `merge` takes by default for `target`: its `same − 1`
 * lowest-level copies, then the `any` cheapest others of its category
 * (Standard first). Fewer than the plan needs when there aren't enough. */
export function defaultFodder(e: EquipmentSave, target: EquipItem, skip: ReadonlySet<string> = new Set()) {
  const plan = mergePlan(target);
  if (!plan) return [];
  const pool = mergeFodder(e, target).filter((i) => !skip.has(i.id) && !i.locked);
  if (plan.kind === "star") return pool.slice(0, 1);
  const copies = pool.filter((i) => sameDef(target, i)).slice(0, plan.same - 1);
  const taken = new Set(copies.map((i) => i.id));
  const others = pool.filter((i) => !taken.has(i.id))
    .sort((a, b) => Number(isUnique(a)) - Number(isUnique(b)) || Number(sameDef(target, a)) - Number(sameDef(target, b)) || a.level - b.level)
    .slice(0, plan.any);
  return copies.length < plan.same - 1 ? copies : [...copies, ...others];
}
/** Whether `fodder` makes `target`'s merge: as many as the plan needs, at
 * least `same − 1` of the target's definition, all fitting. */
export function fodderFits(target: EquipItem, plan: MergePlan, fodder: EquipItem[]) {
  if (fodder.length !== plan.need || !fodder.every((i) => fits(target, plan, i))) return false;
  return plan.kind === "star" || fodder.filter((i) => sameDef(target, i)).length >= plan.same - 1;
}

/** One merge Auto-assemble offers: the piece kept and the pieces used up. */
export interface AutoMerge { target: string; fodder: string[] }
/** Every rarity merge the inventory makes at once, none sharing a piece,
 * for Auto-assemble (Stars are the player's own choice: never offered
 * here). Worn pieces take no part. A locked piece may be kept but never
 * used up. Each merge keeps the best piece left (locked first, then the
 * highest level, then the oldest) and uses up `defaultFodder`'s pieces.
 * Best rarity first, then the order the pieces were found. */
export function autoMerges(e: EquipmentSave): AutoMerge[] {
  const byId = (a: EquipItem, b: EquipItem) => a.id.localeCompare(b.id, "en", { numeric: true });
  const keepers = e.items.filter((i) => mergePlan(i)?.kind === "rarity" && !isEquipped(e, i.id))
    .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || Number(!!b.locked) - Number(!!a.locked) || b.level - a.level || byId(a, b));
  const used = new Set<string>(), merges: AutoMerge[] = [];
  for (const keeper of keepers) {
    if (used.has(keeper.id)) continue;
    const plan = mergePlan(keeper)!, fodder = defaultFodder(e, keeper, new Set([...used, keeper.id]));
    if (!fodderFits(keeper, plan, fodder)) continue;
    for (const i of [keeper, ...fodder]) used.add(i.id);
    merges.push({ target: keeper.id, fodder: fodder.map((i) => i.id) });
  }
  return merges;
}
/** Why a merge was refused. */
export type MergeRefusal = "missing" | "unmergeable" | "count" | "mismatch" | "protected";
/** Merges `fodder` into `targetId` (`mergePlan`): none locked or worn. The
 * target moves up one rarity, or gains a Star, keeping its level, lock,
 * loadouts, investment and substat slots (their effects and Refinement
 * untouched: the new rarity only raises its cap, so leveling on opens more
 * slots); the fodder is gone, with what leveling it cost. */
export function merge(e: EquipmentSave, targetId: string, fodder: string[]): EquipItem | MergeRefusal {
  const target = findItem(e, targetId);
  if (!target) return "missing";
  const plan = mergePlan(target);
  if (!plan) return "unmergeable";
  const unique = new Set(fodder);
  if (unique.size !== fodder.length || fodder.length !== plan.need || unique.has(targetId)) return "count";
  const pieces = fodder.map((id) => findItem(e, id));
  if (pieces.some((c) => !c)) return "missing";
  if (!fodderFits(target, plan, pieces as EquipItem[])) return "mismatch";
  if (pieces.some((c) => isProtected(e, c!))) return "protected";
  e.items = e.items.filter((i) => !unique.has(i.id));
  if (plan.kind === "star") target.stars = plan.stars;
  else target.rarity = plan.next;
  // The first five-Star copy of a piece leaves it out of future Gem pulls.
  if (target.stars === STARS.most && !e.maxed.includes(target.def)) {
    e.maxed.push(target.def);
    if (!e.drawOff.includes(target.def)) e.drawOff.push(target.def);
  }
  return target;
}

// --- Changing ---

/** Adds a new level-0 piece of `def` at `rarity`, or null when the
 * inventory is full. */
export function addItem(e: EquipmentSave, def: string, rarity: EquipRarity): EquipItem | null {
  if (roomLeft(e) <= 0 || !itemDef(def)) return null;
  const item: EquipItem = { id: `e${e.nextId++}`, def, rarity, level: 0, slots: [] };
  e.items.push(item);
  if (!categoryOpen(e, categoryOf(item))) e.categories = CATEGORY_IDS.filter(c => categoryOpen(e, c) || c === categoryOf(item));
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
    if (!free && !hasMaterials(e.materials, cost.category, cost.material)) { refusal = "material"; break; }
    if (!free) {
      purse.gold = snap(purse.gold - cost.gold);
      spendMaterials(e.materials, cost.category, cost.material);
      const spent = item.spent ?? { gold: 0, material: 0 };
      item.spent = { gold: spent.gold + cost.gold, material: spent.material + cost.material * CATEGORIES[cost.category].materials.length };
    }
    item.level++;
    gained++;
  }
  fillSlots(item);
  return gained || refusal;
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
  EQUIP_RARITIES.includes(i.rarity) && wholeIn(i.level, 0, Number.MAX_SAFE_INTEGER);
/** A saved substat: one of the category's pool that the piece's rarity
 * allows, at a rarity no higher than the piece's and no lower than the
 * substat's own lowest (a Common one, from before substats had no
 * Common, comes back Uncommon). */
function decodeChoice(c: any, cap: EquipRarity, category: CategoryId): EffectChoice | null {
  if (!isRecord(c) || typeof c.effect !== "string" || !inPool(category, c.effect) || !EQUIP_RARITIES.includes(c.rarity)) return null;
  const def = slotEffectDef(c.effect)!;
  if (!rollsAt(def, cap)) return null;
  const rarity: EquipRarity = rarityRank(c.rarity) > rarityRank(cap) ? cap : rollsAt(def, c.rarity) ? c.rarity : (def.from ?? "uncommon");
  return { effect: c.effect, rarity };
}
/** An item's saved slots: an effect still in its category's pool, at a
 * rarity no higher than the item allows, never the same effect in two
 * slots; Refinement and Choices spent as whole counts; an offer of known
 * effects. */
function decodeSlots(raw: unknown, item: EquipItem): EffectSlot[] {
  const cap = substatCap(item.rarity), category = categoryOf(item);
  const slots: EffectSlot[] = [], held = new Set<string>();
  for (const r of Array.isArray(raw) ? raw.slice(0, Math.min(SUBSTAT_SLOT_LEVELS.length, openSlotCount(item))) : []) {
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
/** What leveling a piece has cost: Gold may run past whole-number
 * precision, so any finite amount from 0 is kept. */
const decodeSpent = (s: any) =>
  isRecord(s) && typeof s.gold === "number" && Number.isFinite(s.gold) && s.gold >= 0 && wholeIn(s.material, 0, Number.MAX_SAFE_INTEGER) && (s.gold || s.material)
    ? { gold: s.gold, material: s.material } : undefined;

/** The saved Equipment: known items only (each id once, up to the
 * capacity, Stars only on Ancestral pieces, levels within their cap),
 * loadouts naming owned items of the right category, whole material
 * balances and pity below its threshold. */
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
      const spent = decodeSpent(i.spent), rarity = i.rarity as EquipRarity;
      const savedStars = (i as { stars?: unknown }).stars;
      const stars = rarity === "ancestral" && wholeIn(savedStars, 1, STARS.most) ? (savedStars as number) : 0;
      // A level over its cap (a cap lowered since) comes down to it.
      const item: EquipItem = {
        id: i.id, def: i.def, rarity, ...(stars ? { stars } : {}), level: Math.min(i.level, levelCap(rarity, stars)),
        ...(i.locked === true ? { locked: true as const } : {}), ...(spent ? { spent } : {}), slots: [],
      };
      item.slots = decodeSlots((i as { slots?: unknown }).slots, item);
      fillSlots(item);
      e.items.push(item);
    }
  // TODO: remove the inferred unlocks when pre-recipe saves are retired.
  // Retain categories already owned, without opening any unowned future slot.
  e.categories = CATEGORY_IDS.filter(c => STARTER_CATEGORIES.includes(c) ||
    (Array.isArray(raw.categories) && raw.categories.includes(c)) || e.items.some(i => categoryOf(i) === c));
  for (const mode of ["tower", "delve"] as const) {
    const worn = isRecord(raw.equipped) ? raw.equipped[mode] : undefined;
    if (!isRecord(worn)) continue;
    for (const c of CATEGORY_IDS) {
      const item = typeof worn[c] === "string" ? findItem(e, worn[c]) : undefined;
      if (item && categoryOf(item) === c) e.equipped[mode][c] = item.id;
    }
  }
  for (const m of EQUIP_MATERIAL_IDS) if (isRecord(raw.materials) && wholeIn(raw.materials[m], 0, Number.MAX_SAFE_INTEGER)) e.materials[m] = raw.materials[m];
  // TODO: remove this conversion when nine-material saves are retired.
  // Split old balances without losing a unit; the next save contains only four.
  const legacy: Record<string, readonly EquipMaterialId[]> = {
    leather: ["padding", "whetstone"], silk: ["rivets", "padding"],
    buckles: ["rivets", "hobnails"], moonstone: ["whetstone", "padding"], amber: ["whetstone", "hobnails"],
  };
  if (isRecord(raw.materials)) for (const [old, inputs] of Object.entries(legacy)) {
    const amount = raw.materials[old];
    if (!wholeIn(amount, 0, Number.MAX_SAFE_INTEGER)) continue;
    inputs.forEach((m, i) => { e.materials[m] = Math.min(Number.MAX_SAFE_INTEGER, e.materials[m] + Math.floor(amount / inputs.length) + (i < amount % inputs.length ? 1 : 0)); });
  }
  for (const k of PULL_KEYS) if (isRecord(raw.pity) && wholeIn(raw.pity[k], 0, PITY - 1)) e.pity[k] = raw.pity[k];
  const highest = e.items.reduce((n, i) => Math.max(n, Number(i.id.slice(1))), 0);
  e.nextId = Math.max(highest + 1, wholeIn(raw.nextId, 1, 1e9) ? raw.nextId : 1);
  for (const k of STREAM_KEYS) if (isRecord(raw.streams) && wholeIn(raw.streams[k], 0, 4294967295)) e.streams[k] = raw.streams[k];
  const uniques = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === "string" && itemDef(id)?.class === "unique"))] : [];
  e.drawOff = uniques(raw.drawOff);
  e.maxed = uniques(raw.maxed);
  e.autoSalvage = raw.autoSalvage === true;
  return e;
}

/** Whether the Gear tab shows its dot for Equipment: open, and its screen
 * not yet seen. */
export const equipmentWaiting = (save: { equipment: EquipmentSave }) => save.equipment.unlocked && !save.equipment.seen;
