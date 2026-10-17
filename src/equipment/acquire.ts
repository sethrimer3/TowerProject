// Where equipment comes from: Gem pulls (Unique pieces of a chosen
// category, with pity), and the CHEST card's Equipment Chests (Standard
// pieces) and Supply Chests (upgrade materials). Each takes the randomness it draws from, so tests pass a
// seeded stream; the rates are in balance.ts.
import { random } from "../random.ts";
import { CATEGORY_IDS, materialOf, standardOf, uniquesOf, type CategoryId, type EquipMaterialId } from "./catalog.ts";
import {
  EQUIP_RARITIES, EQUIPMENT_CHEST_RARITY, MATERIAL_FLOORS, PITY, PULL_RATES, SUPPLY_CHEST_MATERIALS,
  type EquipRarity,
} from "./balance.ts";
import { addItem, salvageOf, type EquipItem, type EquipmentSave } from "./inventory.ts";

/** Picks a rarity by percent weights with one number in [0, 1). */
export function rollRarity(weights: Partial<Record<EquipRarity, number>>, roll: number): EquipRarity {
  const listed = EQUIP_RARITIES.filter((r) => weights[r]);
  let left = roll * listed.reduce((n, r) => n + weights[r]!, 0);
  return listed.find((r) => (left -= weights[r]!) < 0) ?? listed[listed.length - 1];
}
const pick = <T>(list: readonly T[], roll: number) => list[Math.min(list.length - 1, Math.floor(roll * list.length))];

/** One Gem pull in `category`: its pity first (the pull that would make
 * `PITY` in a row without a Rare is a Rare), else the rarity rates, then
 * one of the category's Uniques evenly. A Rare resets the category's pity;
 * anything else adds one. */
export function pullOne(e: EquipmentSave, category: CategoryId, rng: () => number) {
  const pity = e.pity[category] + 1 >= PITY;
  const rarity = pity ? "rare" : rollRarity(PULL_RATES, rng());
  const def = pick(uniquesOf(category), rng());
  e.pity[category] = rarity === "rare" ? 0 : e.pity[category] + 1;
  return { item: addItem(e, def.id, rarity)!, pity };
}

/** mulberry32's step: each draw moves the state on by this much. */
const STEP = 0x6d2b79f5;
/** Runs `draw` on Equipment's saved stream (seeded from `seed` the first
 * time) and saves where it stopped, so nothing it rolls (pulls, effect
 * candidates) can be rolled again by reloading. */
export function withSavedStream<T>(e: EquipmentSave, seed: () => number, draw: (rng: () => number) => T): T {
  const state = e.rng ?? Math.floor(seed() * 4294967296);
  const rng = random(state);
  let used = 0;
  const result = draw(() => (used++, rng()));
  e.rng = (state + Math.imul(used, STEP)) >>> 0;
  return result;
}
/** `count` pulls in `category`, or of all categories (`"all"`: each
 * pull's category drawn evenly first), resolved in order (pity counts
 * through them, each category its own), carrying on the saved stream. The
 * caller makes sure there is room and has taken the Gems. */
export function pull(e: EquipmentSave, category: CategoryId | "all", count: number, seed: () => number) {
  return withSavedStream(e, seed, (rng) => {
    const results: { item: EquipItem; pity: boolean }[] = [];
    for (let i = 0; i < count; i++) results.push(pullOne(e, category === "all" ? pick(CATEGORY_IDS, rng()) : category, rng));
    return results;
  });
}

/** An Equipment Chest's piece: a Standard piece of a random category at a
 * rarity rolled by `EQUIPMENT_CHEST_RARITY`. */
export function rollChestPiece(rng: () => number) {
  const rarity = rollRarity(EQUIPMENT_CHEST_RARITY, rng());
  const category = pick(CATEGORY_IDS, rng());
  return { def: standardOf(category).id, rarity, category };
}

/** Takes an Equipment Chest's piece into the inventory, or salvages it at
 * once into its material: a Common one while the player has Auto-salvage on
 * (`auto`), any one when the inventory is full. */
export function keepDrop(e: EquipmentSave, drop: { def: string; rarity: EquipRarity; category: CategoryId }) {
  const auto = e.autoSalvage && drop.rarity === "common";
  const item = auto ? null : addItem(e, drop.def, drop.rarity);
  if (item) return { item, salvaged: 0, auto };
  const salvaged = salvageOf(drop);
  e.materials[materialOf(drop.category)] += salvaged;
  return { item: null, salvaged, auto };
}

/** A Supply Chest's upgrade materials on equivalent floor `floor`:
 * `SUPPLY_CHEST_MATERIALS`, scaled by the floor and `find`, of one category at random. */
export const rollSupplies = (floor: number, find: number, rng: () => number) => materialStack(SUPPLY_CHEST_MATERIALS, floor, find, rng);

/** `amount` upgrade materials times 1 + ⌊floor / 25⌋, raised by `find`
 * percent (rounded down), of one category at random. */
function materialStack(amount: number, floor: number, find: number, rng: () => number): { id: EquipMaterialId; quantity: number } {
  const base = amount * (1 + Math.floor(Math.max(0, floor) / MATERIAL_FLOORS));
  const quantity = Math.max(base, Math.floor((base * (100 + find)) / 100));
  return { id: materialOf(pick(CATEGORY_IDS, rng())), quantity };
}
