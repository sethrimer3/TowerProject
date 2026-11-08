// The Equipment system's balance, in one place: rarity tiers (level caps,
// merge recipes, salvage), Stars, the level-up cost curves, substat slots and
// rarities, chest contents, and the Gem pull's price, rates and pity. Every
// number here is a tunable starting value (docs/EQUIPMENT.md explains each).
// Costs and rates are whole numbers or exact sums, never `Math.pow`, so they
// are the same in every engine.
import { snap } from "../exact.ts";
import { RARITIES as SHOP_RARITIES } from "../shop/rarity.ts";

/** The rarities equipment comes in, lowest first. */
export type EquipRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "ancestral";
export const EQUIP_RARITIES: readonly EquipRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "ancestral"];

/** What merging makes of a rarity: `same` pieces of one definition (the
 * piece kept among them) and `any` more of its category, all at this
 * rarity, make one piece of `next`. */
export type MergeRecipe = { next: EquipRarity; same: number; any: number };
export type RarityTier = {
  /** Shown beside the colour, so rarity never depends on colour alone. */
  name: string;
  /** A one-letter mark for small spaces (C, U, R, E, L, M, A). */
  mark: string;
  color: string;
  /** The highest level an item of this rarity reaches (before Stars). */
  maxLevel: number;
  /** How this rarity merges up; null where it never does: Common (only worn
   * as it is or salvaged) and Ancestral (which takes Stars instead). */
  merge: MergeRecipe | null;
  /** Upgrade material a dismantled piece of this rarity returns. */
  salvage: number;
};
const tier = (id: EquipRarity, mark: string, maxLevel: number, merge: MergeRecipe | null, salvage: number): RarityTier => ({
  name: SHOP_RARITIES[id].displayName, mark, color: SHOP_RARITIES[id].color, maxLevel, merge, salvage,
});
export const RARITY_TIERS: Record<EquipRarity, RarityTier> = {
  common: tier("common", "C", 20, null, 5),
  uncommon: tier("uncommon", "U", 40, { next: "rare", same: 3, any: 0 }, 20),
  rare: tier("rare", "R", 60, { next: "epic", same: 3, any: 0 }, 75),
  epic: tier("epic", "E", 80, { next: "legendary", same: 2, any: 1 }, 250),
  legendary: tier("legendary", "L", 120, { next: "mythic", same: 2, any: 1 }, 900),
  mythic: tier("mythic", "M", 160, { next: "ancestral", same: 2, any: 0 }, 3000),
  ancestral: tier("ancestral", "A", 200, null, 10000),
};
export const rarityRank = (r: EquipRarity) => EQUIP_RARITIES.indexOf(r);
/** Whether `r` is `from` or above. */
export const atLeast = (r: EquipRarity, from: EquipRarity) => rarityRank(r) >= rarityRank(from);

/** The rarest a Standard piece becomes: chests drop them up to Rare, and
 * merging takes them no higher than Legendary. */
export const STANDARD_DROP_TOP: EquipRarity = "rare";
export const STANDARD_TOP: EquipRarity = "legendary";

/** Stars, on Ancestral pieces only: each one is a merge with a Legendary
 * copy of the same piece, raises the level cap by `levels` and the main
 * effect by `boost` percent of itself (×1.04 at one Star, ×1.20 at five). */
export const STARS = { most: 5, fodder: "legendary" as EquipRarity, levels: 20, boost: 4 };

/** The most pieces the inventory holds (materials are currencies apart). */
export const EQUIPMENT_CAPACITY = 500;
/** A Unique piece, bought with Gems, salvages for this many times a Standard's. */
export const UNIQUE_SALVAGE = 2;

/** A cost that runs linearly between listed (level, cost) points, rounded
 * to whole units; the points are in level order. */
function between(points: readonly (readonly [number, number])[], level: number) {
  for (let i = 1; i < points.length; i++) {
    const [a, x] = points[i - 1], [b, y] = points[i];
    if (level <= b) return Math.round(x + ((y - x) * (level - a)) / (b - a));
  }
  return points[points.length - 1][1];
}
const K = 1e3, M = 1e6, B = 1e9, T = 1e12, Q = 1e15, QI = 1e18;
/** The Gold reaching each level costs: 2,000 a level to 10, then each band
 * of ten from its first price to its last, and past 160 through the listed
 * levels (docs/EQUIPMENT.md has the table). */
const GOLD_POINTS: readonly (readonly [number, number])[] = [
  [1, 2 * K], [10, 20 * K], [11, 25 * K], [20, 70 * K], [21, 80 * K], [30, 170 * K], [31, 200 * K], [40, 515 * K],
  [41, 590 * K], [50, 1.4 * M], [51, 2.2 * M], [60, 4 * M], [61, 6 * M], [70, 42 * M], [71, 50 * M], [80, 140 * M],
  [81, 160 * M], [90, 300 * M], [91, 320 * M], [100, 500 * M], [101, 1 * B], [110, 2.8 * B], [111, 3 * B], [120, 12 * B],
  [121, 14 * B], [130, 23 * B], [131, 24 * B], [140, 42 * B], [141, 50 * B], [150, 500 * B], [151, 550 * B], [160, 1 * T],
  [161, 10 * T], [162, 60 * T], [171, 510 * T], [181, 1.01 * Q], [191, 1.51 * Q], [201, 2.5 * Q], [221, 265 * Q],
  [241, 1 * QI], [261, 106 * QI], [281, 411 * QI], [300, 886 * QI],
];
/** The upgrade material reaching a level costs, of each recipe input:
 * ⌈L × (L + 10) / 20⌉ to level 60, then bending upward through the listed
 * levels. */
const MATERIAL_POINTS: readonly (readonly [number, number])[] = [
  [60, 210], [101, 1000], [161, 5000], [201, 10000], [221, 15000], [241, 20000], [261, 30000], [281, 40000], [300, 49500],
];
/** The highest level any piece reaches: Ancestral with every Star. */
export const TOP_LEVEL = RARITY_TIERS.ancestral.maxLevel + STARS.most * STARS.levels;

/** What raising an item to `level` (from the level below) costs: Gold, and
 * each of its category's recipe inputs. Pieces start at level 0. */
export const upgradeGold = (level: number) => between(GOLD_POINTS, level);
export const upgradeMaterial = (level: number) => (level <= 60 ? Math.ceil((level * (level + 10)) / 20) : between(MATERIAL_POINTS, level));

/** The levels at which a piece's substat slots open, one each: a piece
 * at level 0 has none, and the eighth opens at 241. */
export const SUBSTAT_SLOT_LEVELS: readonly number[] = [1, 41, 61, 81, 121, 161, 201, 241];
/** How many substat slots a piece at `level` has open. */
export const openSlots = (level: number) => SUBSTAT_SLOT_LEVELS.filter((l) => l <= level).length;
/** The rarities a substat comes in: every one but Common. */
export const SUBSTAT_RARITIES: readonly EquipRarity[] = EQUIP_RARITIES.filter((r) => r !== "common");
/** What a substat's value is multiplied by at each rarity. */
export const SUBSTAT_POWER: Record<EquipRarity, number> = { common: 1, uncommon: 1, rare: 1.5, epic: 2.25, legendary: 3.5, mythic: 5, ancestral: 7.5 };
/** A substat's rarity weights, in tenths of a percent (61.2% Uncommon …
 * 0.3% Ancestral), never above the piece's rarity (the weights allowed are
 * rescaled). */
export const SUBSTAT_RARITY_WEIGHTS: Partial<Record<EquipRarity, number>> = { uncommon: 612, rare: 250, epic: 100, legendary: 25, mythic: 10, ancestral: 3 };
/** The rarest substat a piece of `rarity` may hold: its own (a Common
 * piece's are Uncommon, since substats have no Common). */
export const substatCap = (rarity: EquipRarity): EquipRarity => (rarity === "common" ? "uncommon" : rarity);

/** What the CHEST card's special chests hold, once Equipment is open: a
 * Supply Chest's upgrade materials (of one category at random, `base` in
 * tower I and `perTower` more in each tower after),
 * and an Equipment Chest's Standard piece, of a random category at these
 * rarity weights. */
export const SUPPLY_CHEST_MATERIALS = { base: 5, perTower: 2 };
export const EQUIPMENT_CHEST_RARITY: Partial<Record<EquipRarity, number>> = { common: 67, uncommon: 30, rare: 3 };
/** A boss's or Greater Boss's kill, once Equipment is open: the percent
 * chances it drops a Supply Chest's materials and an Equipment Chest's
 * piece, each rolled as those chests' contents are. */
export const BOSS_DROPS = { material: 1.5, equipment: 0.5 };

/** The Gem pull: its price for one and for ten (ten resolve one by one),
 * the rarity weights in percent (Common to Rare bring a Standard piece,
 * `UNIQUE_PULL_FROM` and up a Unique), and pity: the pull that would make
 * `PITY` in a row without an Epic or better, in its category or in pulls of
 * all categories (each counted apart), is an Epic Unique. */
export const PULL_GEMS = { 1: 20, 10: 200 } as const;
export type PullCount = keyof typeof PULL_GEMS;
/** Pulls of all categories at once (each pull's category drawn evenly) cost
 * this many percent less. */
export const PULL_ALL_DISCOUNT = 10;
/** What `count` pulls cost: in one category, or of all (`all`), less
 * `PULL_ALL_DISCOUNT`. */
export const pullGems = (count: PullCount, all = false) =>
  all ? (PULL_GEMS[count] * (100 - PULL_ALL_DISCOUNT)) / 100 : PULL_GEMS[count];
/** Equipment Tickets: opening Equipment gives `WELCOME_TICKETS`, and one of
 * the first that many ticket pulls is sure to be an Epic Unique. */
export const WELCOME_TICKETS = 10;
export const WELCOME_RARITY: EquipRarity = "epic";
/** What `count` pulls take when `held` Equipment Tickets are held: a ticket
 * each, as far as they go, in place of that pull's share of the Gems. */
export function pullPrice(count: PullCount, all: boolean, held: number) {
  const tickets = Math.max(0, Math.min(held, count));
  return { tickets, gems: (pullGems(count, all) * (count - tickets)) / count };
}
export const PULL_RATES: Partial<Record<EquipRarity, number>> = { common: 60, uncommon: 29, rare: 8, epic: 2.5, legendary: 0.5 };
export const UNIQUE_PULL_FROM: EquipRarity = "epic";
export const PITY = 120;
export const PITY_RARITY: EquipRarity = "epic";

/** Substat slots: how many candidates each roll offers. */
export const EFFECT_CANDIDATES = 3;

/** What one paid Refine of a slot costs, by the item's rarity: Gold and its
 * category's recipe inputs. A slot's first roll is free. */
export const REFINE_COST: Record<EquipRarity, { gold: number; material: number }> = {
  common: { gold: 1000, material: 10 },
  uncommon: { gold: 5000, material: 40 },
  rare: { gold: 20000, material: 120 },
  epic: { gold: 2 * M, material: 400 },
  legendary: { gold: 100 * M, material: 1200 },
  mythic: { gold: 10 * B, material: 4000 },
  ancestral: { gold: 1 * T, material: 12000 },
};
/** Improving a slot's effect one rarity costs this many Refines' worth. */
export const IMPROVE_COST_FACTOR = 3;
/** Refinement milestones: every `REFINE_GUARANTEE_EVERY`th Refine of a slot
 * offers at least one candidate at the item's highest effect rarity, and
 * every `REFINE_CHOICE_EVERY`th earns a Choice: any effect of the
 * category's pool, at that rarity, picked outright. */
export const REFINE_GUARANTEE_EVERY = 5;
export const REFINE_CHOICE_EVERY = 10;

/** The most of an enemy's DEF the hero's strikes can ignore (Piercing). */
export const PIERCE_CAP = 50;

/** A Common Standard piece: no Gold or Gems, this much of every recipe input. */
export const CRAFT_MATERIAL = 25;

/** A star count's factor on the main effect, as a percent: 100 + 4 a Star. */
export const starPercent = (stars: number) => 100 + STARS.boost * stars;
/** `value` raised by `stars` Stars. */
export const starred = (value: number, stars: number) => (stars ? snap((value * starPercent(stars)) / 100) : value);
