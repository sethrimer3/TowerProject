// Where equipment comes from: Gem pulls (Standard pieces at Common to Rare,
// Unique pieces at Epic and Legendary, with pity), and the CHEST card's
// Equipment Chests (Standard pieces) and Supply Chests (upgrade materials).
// Each takes the randomness it draws from, so tests pass a seeded stream; the
// rates are in balance.ts.
import { random } from "../random.ts";
import { EQUIP_MATERIAL_IDS, STARTER_CATEGORIES, materialOf, standardsOf, uniquesOf, type CategoryId, type EquipMaterialId, type ItemDef } from "./catalog.ts";
import {
  atLeast, EQUIP_RARITIES, EQUIPMENT_CHEST_RARITY, PITY, PITY_RARITY, PULL_RATES, SUPPLY_CHEST_MATERIALS, UNIQUE_PULL_FROM, WELCOME_RARITY,
  type EquipRarity,
} from "./balance.ts";
import { addItem, availableCategories, salvageOf, type EquipItem, type EquipmentSave, type PullKey, type StreamKey } from "./inventory.ts";

/** Picks a rarity by percent weights with one number in [0, 1). */
export function rollRarity(weights: Partial<Record<EquipRarity, number>>, roll: number): EquipRarity {
  const listed = EQUIP_RARITIES.filter((r) => weights[r]);
  let left = roll * listed.reduce((n, r) => n + weights[r]!, 0);
  return listed.find((r) => (left -= weights[r]!) < 0) ?? listed[listed.length - 1];
}
const pick = <T>(list: readonly T[], roll: number) => list[Math.min(list.length - 1, Math.floor(roll * list.length))];

/** The Uniques of `category` future Gem pulls may bring: all but those the
 * player has left out of draws (`drawOff`). */
export const drawnUniques = (e: EquipmentSave, category: CategoryId) => uniquesOf(category).filter((d) => !e.drawOff.includes(d.id));
/** The categories pulls of `key` may land in: the one, or every open one
 * (for an Epic or Legendary, only those with a Unique left in draws). */
const landsIn = (e: EquipmentSave, key: PullKey, unique: boolean) =>
  (key === "all" ? availableCategories(e) : [key]).filter((c) => !unique || drawnUniques(e, c).length);
/** Whether pulls of `key` can bring anything: some Unique of theirs is left
 * in draws (with every one left out, buying is refused). */
export const canPull = (e: EquipmentSave, key: PullKey) => landsIn(e, key, true).length > 0;
/** Whether the draw toggles show: once the player owns a five-Star piece. */
export const drawTogglesOpen = (e: EquipmentSave) => e.items.some((i) => i.stars === 5);

/** The rates `rareMore` (relics') moves from Common to Epic. */
const ratesWith = (more: number) => (more ? { ...PULL_RATES, common: PULL_RATES.common! - more, epic: PULL_RATES.epic! + more } : PULL_RATES);

/** One Gem pull of `key` (a category, or `all`): its pity first (the pull
 * that would make `PITY` in a row without an Epic or better is an Epic),
 * else the rarity rates; then, for all categories, its category evenly
 * (for an Epic or Legendary, among those with a Unique left in draws); then
 * a Standard piece of it evenly at Common to Rare, or a Unique left in
 * draws at Epic and Legendary. An Epic or better resets the pull's pity;
 * anything else adds one. `sure` makes it an Epic Unique however it rolls
 * (the welcome's ticket pull). */
export function pullOne(e: EquipmentSave, key: PullKey, rng: () => number, epicMore = 0, sure = false) {
  const pity = !sure && e.pity[key] + 1 >= PITY;
  const rarity = sure ? WELCOME_RARITY : pity ? PITY_RARITY : rollRarity(ratesWith(epicMore), rng());
  const unique = atLeast(rarity, UNIQUE_PULL_FROM);
  const categories = landsIn(e, key, unique), category = pick(categories.length ? categories : landsIn(e, key, false), rng());
  const choices: ItemDef[] = unique ? drawnUniques(e, category) : standardsOf(category);
  const def = pick(choices.length ? choices : uniquesOf(category), rng());
  e.pity[key] = unique ? 0 : e.pity[key] + 1;
  return { item: addItem(e, def.id, rarity)!, pity };
}

/** One rarity's line of the rates: its chance, and each piece's share of it. */
export type RateRow = { rarity: EquipRarity; chance: number; pieces: { def: string; chance: number }[] };
/** What a pull of `key` may bring, rarity by rarity, and each named piece's
 * chance (in percent; a Unique left out of draws at 0), pity aside. */
export function pullRates(e: EquipmentSave, key: PullKey, epicMore = 0): RateRow[] {
  const rates = ratesWith(epicMore);
  return EQUIP_RARITIES.filter((r) => rates[r]).map((rarity) => {
    const chance = rates[rarity]!, unique = atLeast(rarity, UNIQUE_PULL_FROM), cats = landsIn(e, key, unique);
    const pieces = (key === "all" ? availableCategories(e) : [key]).flatMap((c) => {
      const all = unique ? uniquesOf(c) : standardsOf(c), drawn = unique ? drawnUniques(e, c) : all;
      return all.map((d) => ({ def: d.id, chance: cats.includes(c) && drawn.includes(d) ? chance / cats.length / drawn.length : 0 }));
    });
    return { rarity, chance, pieces };
  });
}

/** mulberry32's step: each draw moves the state on by this much. */
const STEP = 0x6d2b79f5;
/** Runs `draw` on Equipment's saved stream `key` (seeded from `seed` the
 * first time) and saves where it stopped, so nothing it rolls can be rolled
 * again by reloading: each category's Gem pulls, pulls of all categories and
 * substat rolls each keep a stream of their own, for the profile's life. */
export function withSavedStream<T>(e: EquipmentSave, key: StreamKey, seed: () => number, draw: (rng: () => number) => T): T {
  const state = e.streams[key] ?? Math.floor(seed() * 4294967296);
  const rng = random(state);
  let used = 0;
  const result = draw(() => (used++, rng()));
  e.streams[key] = (state + Math.imul(used, STEP)) >>> 0;
  return result;
}
/** `count` pulls of `key` (a category, or all open categories), resolved in
 * order (pity counting through them), carrying on that key's saved stream.
 * The first `tickets` are paid with Equipment Tickets: while the welcome's
 * ticket pulls last, the one it lands on is a sure Epic Unique (`sure`),
 * each left as likely as any other to be it. The caller makes sure there is
 * room, that the pulls can bring something (`canPull`), and has taken the
 * tickets and Gems. */
export function pull(e: EquipmentSave, key: PullKey, count: number, seed: () => number, epicMore = 0, tickets = 0) {
  return withSavedStream(e, key, seed, (rng) => {
    const results: { item: EquipItem; pity: boolean; sure?: true }[] = [];
    for (let i = 0; i < count; i++) {
      const welcome = i < tickets && e.welcome.left > 0;
      const sure = welcome && e.welcome.epic && (e.welcome.left === 1 || rng() * e.welcome.left < 1);
      if (welcome) e.welcome = { left: e.welcome.left - 1, epic: e.welcome.epic && !sure };
      const result = pullOne(e, key, rng, epicMore, sure);
      results.push(sure ? { ...result, sure: true } : result);
    }
    return results;
  });
}

/** An Equipment Chest's piece: one of a random category's Standard pieces,
 * evenly, at a rarity rolled by `EQUIPMENT_CHEST_RARITY`. */
export function rollChestPiece(rng: () => number, categories: readonly CategoryId[] = STARTER_CATEGORIES) {
  const rarity = rollRarity(EQUIPMENT_CHEST_RARITY, rng());
  const category = pick(categories, rng());
  return { def: pick(standardsOf(category), rng()).id, rarity, category };
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

/** A Supply Chest's upgrade materials in tower `tier`: 5 in tower I and 2
 * more each tower after (`SUPPLY_CHEST_MATERIALS`), raised by `find`
 * percent (rounded down), of one base resource at random. */
export function rollSupplies(tier: number, find: number, rng: () => number): { id: EquipMaterialId; quantity: number } {
  const base = SUPPLY_CHEST_MATERIALS.base + SUPPLY_CHEST_MATERIALS.perTower * (Math.max(1, tier) - 1);
  const quantity = Math.max(base, Math.floor((base * (100 + find)) / 100));
  return { id: pick(EQUIP_MATERIAL_IDS, rng()), quantity };
}
