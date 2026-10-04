// The Equipment system's balance, in one place: rarity tiers (power, level
// caps, merging, salvage), the upgrade cost curve, boss and material drops,
// and the Gem pull's price, rates and pity. Every number here is a tunable
// starting value (docs/EQUIPMENT.md explains each). Costs and rates are
// whole numbers or exact sums, never `Math.pow`, so they are the same in
// every engine.
import type { EnemyStrength } from "../entities.ts";
import { RARITIES as SHOP_RARITIES } from "../shop/rarity.ts";

/** The rarities equipment comes in, lowest first. Adding one is a row here
 * (and its `next` on the one below). */
export type EquipRarity = "common" | "uncommon" | "rare";
export const EQUIP_RARITIES: readonly EquipRarity[] = ["common", "uncommon", "rare"];

export type RarityTier = {
  /** Shown beside the colour, so rarity never depends on colour alone. */
  name: string;
  /** A one-letter mark for small spaces (C, U, R). */
  mark: string;
  color: string;
  /** What every scaling effect line is multiplied by. */
  power: number;
  /** The highest level an item of this rarity reaches. */
  maxLevel: number;
  /** What merging `merge` copies of this rarity makes; null at the top. */
  next: EquipRarity | null;
  merge: number;
  /** Upgrade material a dismantled piece of this rarity returns. */
  salvage: number;
};
const tier = (id: EquipRarity, mark: string, maxLevel: number, next: EquipRarity | null, salvage: number): RarityTier => ({
  name: SHOP_RARITIES[id].displayName, mark, color: SHOP_RARITIES[id].color, power: SHOP_RARITIES[id].powerMultiplier,
  maxLevel, next, merge: 3, salvage,
});
export const RARITY_TIERS: Record<EquipRarity, RarityTier> = {
  common: tier("common", "C", 20, "uncommon", 5),
  uncommon: tier("uncommon", "U", 40, "rare", 20),
  rare: tier("rare", "R", 60, null, 75),
};
export const rarityRank = (r: EquipRarity) => EQUIP_RARITIES.indexOf(r);
/** Whether `r` is `from` or above. */
export const atLeast = (r: EquipRarity, from: EquipRarity) => rarityRank(r) >= rarityRank(from);

/** The floor whose first visit opens Equipment (and the lowest boss floor
 * that drops it): Tower floor 60, or Delve depth 590 (equivalent floor 60). */
export const EQUIPMENT_FLOOR = 60;
/** The most pieces the inventory holds (materials are currencies apart). */
export const EQUIPMENT_CAPACITY = 500;
/** A Unique piece, bought with Gems, salvages for this many times a Standard's. */
export const UNIQUE_SALVAGE = 2;

/** What raising an item from `level` to the next costs: Gold
 * 5 × L × (L + 9) and its category's material ⌈L × (L + 10) / 20⌉, both
 * rising smoothly with the square of the level (50 Gold and 1 material at
 * level 1, 950 and 10 at 10, 20,700 and 210 at 60). */
export const upgradeGold = (level: number) => 5 * level * (level + 9);
export const upgradeMaterial = (level: number) => Math.ceil((level * (level + 10)) / 20);

/** Boss drops (Standard pieces only), from the boss of floor `EQUIPMENT_FLOOR`
 * up: the chance in percent a boss drops one, then its rarity's weights.
 * A Greater Boss always drops one. Unique pieces never drop. */
export const BOSS_DROPS: Partial<Record<EnemyStrength, { chance: number; rarity: Partial<Record<EquipRarity, number>> }>> = {
  boss: { chance: 60, rarity: { common: 78, uncommon: 22 } },
  greaterBoss: { chance: 100, rarity: { common: 55, uncommon: 45 } },
};

/** Upgrade materials from kills, once Equipment is open: the chance in
 * percent each enemy strength drops some (of one category, at random), and
 * how many, times one more for every `MATERIAL_FLOORS` equivalent floors. */
export const MATERIAL_DROPS: Record<EnemyStrength, { chance: number; amount: number }> = {
  weak: { chance: 10, amount: 1 },
  normal: { chance: 15, amount: 1 },
  strong: { chance: 30, amount: 2 },
  elite: { chance: 50, amount: 3 },
  boss: { chance: 100, amount: 8 },
  greaterBoss: { chance: 100, amount: 20 },
};
export const MATERIAL_FLOORS = 25;

/** The Gem pull: its price for one and for ten (ten resolve one by one),
 * the rarity weights in percent, and pity: the pull that would make
 * `PITY` in a row without a Rare in its category is a Rare. */
export const PULL_GEMS = { 1: 20, 10: 200 } as const;
export type PullCount = keyof typeof PULL_GEMS;
export const PULL_RATES: Record<EquipRarity, number> = { common: 72, uncommon: 25, rare: 3 };
export const PITY = 100;
