// Where equipment comes from: Gem pulls (Unique pieces of a chosen
// category, with pity), boss drops (Standard pieces) and upgrade materials
// from kills. Each takes the randomness it draws from, so tests pass a
// seeded stream; the rates are in balance.ts.
import type { EnemyStrength } from "../entities.ts";
import { random } from "../random.ts";
import { CATEGORY_IDS, materialOf, standardOf, uniquesOf, type CategoryId, type EquipMaterialId } from "./catalog.ts";
import {
  BOSS_DROPS, EQUIP_RARITIES, MATERIAL_DROPS, MATERIAL_FLOORS, PITY, PULL_RATES,
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

/** A beaten boss's equipment: a Standard piece of a random category at a
 * rolled rarity, by its strength's chance raised by `bonus` percentage
 * points, on any floor. Null when it drops none. */
export function rollBossDrop(strength: EnemyStrength, bonus: number, rng: () => number) {
  const table = BOSS_DROPS[strength];
  if (!table) return null;
  if (rng() * 100 >= table.chance + bonus) return null;
  const rarity = rollRarity(table.rarity, rng());
  const category = pick(CATEGORY_IDS, rng());
  return { def: standardOf(category).id, rarity, category };
}

/** Takes a boss drop into the inventory, or, when it is full, salvages it
 * at once into its material. */
export function keepDrop(e: EquipmentSave, drop: { def: string; rarity: EquipRarity; category: CategoryId }) {
  const item = addItem(e, drop.def, drop.rarity);
  if (item) return { item, salvaged: 0 };
  const salvaged = salvageOf(drop);
  e.materials[materialOf(drop.category)] += salvaged;
  return { item: null, salvaged };
}

/** The upgrade materials a kill drops on equivalent floor `floor`: its
 * strength's chance, then its amount times 1 + ⌊floor / 25⌋, raised by
 * `find` percent (rounded down), of one category at random. */
export function rollMaterials(strength: EnemyStrength, floor: number, find: number, rng: () => number): { id: EquipMaterialId; quantity: number } | null {
  const d = MATERIAL_DROPS[strength];
  if (rng() * 100 >= d.chance) return null;
  const base = d.amount * (1 + Math.floor(Math.max(0, floor) / MATERIAL_FLOORS));
  const quantity = Math.max(base, Math.floor((base * (100 + find)) / 100));
  return { id: materialOf(pick(CATEGORY_IDS, rng())), quantity };
}
