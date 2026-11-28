// The Spirit menu's upgrades (docs/CATACOMBS.md): bought with Spirit, each
// level priced in one rarity. What each level adds is `SPIRIT_PER`, read by
// `magician` (magic.ts) and, for the Loot Drop's range, by `lootFactor`.
import type { SpiritRarity } from "./catalog.ts";
import type { CatacombSave } from "./state.ts";

/** The upgrades, in the order the Spirit menu shows them. */
export const SPIRIT_UPGRADE_IDS = ["unlock", "mhp", "matk", "pierce", "mxp", "crit", "vitality", "matk2", "loot"] as const;
export type SpiritUpgradeId = (typeof SPIRIT_UPGRADE_IDS)[number];
export type SpiritPrice = { rarity: SpiritRarity; amount: number };

/** What a level of each upgrade adds: MHP +10; Magic ATK +1; Magic Armor
 * Pierce's MDef ignored; MXP Gain's percent; MCrit chance (percentage
 * points) and MCrit damage (percent of a hit, onto the MCrit factor);
 * Max MHP and the MHP Drop's chance (percentage points); Magic ATK +2;
 * and the Loot Drop's range (onto both ends). */
export const SPIRIT_PER = {
  mhp: 10, matk: 1, pierce: 1, mxp: 2, critChance: 0.25, critDamage: 1, vitalityMhp: 20, mhpDrop: 0.05, matk2: 2, loot: 0.3,
} as const;

const prices = (rarity: SpiritRarity, amounts: readonly number[]) => amounts.map((amount) => ({ rarity, amount }));

/** Magic ATK +1's Uncommon Spirit by level: 50 × 1.2^(level − 1), rounded. */
const MATK_COSTS = [50, 60, 72, 86, 104, 124, 149, 179, 215, 258, 310, 372, 446, 535, 642, 770, 924, 1109, 1331, 1597, 1917, 2300, 2760, 3312, 3975];
/** MHP +10's Common Spirit by level. */
const MHP_COSTS = [25, 30, 72, 86, 103, 124, 149, 179, 214, 257, 309, 371, 445, 534, 641, 770, 924, 1109, 1331, 1597, 1916, 2300, 2760, 3312, 3974, 4769, 5723, 6868, 8242, 9890, 11868, 14242, 17091, 20509, 24611];
/** Magic Armor Pierce +1's Uncommon Spirit by level. */
const PIERCE_COSTS = [75, 90, 108, 130, 156, 187, 224, 269, 322, 387, 464, 557, 669, 802, 963, 1156, 1387, 1664, 1997, 2396, 2875, 3450, 4140, 4969, 5962];
/** MXP Gain +2%'s Uncommon Spirit by level. */
const MXP_COSTS = [100, 120, 144, 173, 207, 249, 296, 358, 430, 516, 619, 743, 892, 1070, 1284, 1541, 1849, 2219, 2662, 3195, 3834, 4601, 5521, 6625, 7950];
/** MCrit Chance and Damage's Uncommon Spirit by level. */
const CRIT_COSTS = [200, 240, 288, 346, 415, 498, 597, 717, 860, 1032, 1238, 1486, 1783, 2140, 2568, 3081, 3698, 4437, 5325, 6390, 7668, 9201, 11041, 13249, 15899];
/** Max MHP and MHP Drop Chance's Rare Spirit by level. */
const VITALITY_COSTS = [200, 240, 288, 346, 415, 498, 597, 717, 860, 1032, 1238, 1486, 1783, 2140, 2568, 3081, 3698, 4437, 5325, 6390];
/** Magic ATK +2's Rare Spirit by level. */
const MATK2_COSTS = [300, 360, 432, 518, 622, 746, 896, 1075, 1290, 1548, 1858, 2229, 2675, 3210, 3852, 4622, 5547, 6656, 7987, 9584];
/** Loot Drop Gain's Rare Spirit by level. */
const LOOT_COSTS = [450, 540, 648, 778, 933, 1120, 1344, 1612, 1935, 2322];

/** Each upgrade: its name, what a level does, and each level's price. */
export const SPIRIT_UPGRADES: Record<SpiritUpgradeId, { name: string; brief: string; prices: readonly SpiritPrice[] }> = {
  unlock: {
    name: "Unlock Ability", brief: "Unlocks the next ability: Spirit Potion, Spell Surge, Zap, Renewing Rush, then Arcane Barrage.",
    prices: [{ rarity: "common", amount: 10 }, { rarity: "uncommon", amount: 20 }, { rarity: "common", amount: 100 }, { rarity: "rare", amount: 75 }, { rarity: "epic", amount: 150 }],
  },
  mhp: { name: "MHP +10", brief: "+10 Max MHP a level.", prices: prices("common", MHP_COSTS) },
  matk: { name: "Magic ATK +1", brief: "+1 MAtk a level.", prices: prices("uncommon", MATK_COSTS) },
  pierce: { name: "Magic Armor Pierce +1", brief: "The undead you strike have 1 less MDef a level.", prices: prices("uncommon", PIERCE_COSTS) },
  mxp: { name: "MXP Gain +2%", brief: "+2% MXP from every undead a level.", prices: prices("uncommon", MXP_COSTS) },
  crit: { name: "MCrit Chance +0.25% / MCrit Damage +1%", brief: "+0.25% MCrit chance and +1% MCrit damage a level.", prices: prices("uncommon", CRIT_COSTS) },
  vitality: { name: "Max MHP +20 / MHP Drop Chance +0.05%", brief: "+20 Max MHP and +0.05% MHP Drop chance a level.", prices: prices("rare", VITALITY_COSTS) },
  matk2: { name: "Magic ATK +2", brief: "+2 MAtk a level.", prices: prices("rare", MATK2_COSTS) },
  loot: { name: "Loot Drop Gain +0.30×", brief: "Each Loot Drop gives ×0.30 more Spirit a level.", prices: prices("rare", LOOT_COSTS) },
};

/** No Spirit upgrade bought. */
export const noUpgrades = (): Record<SpiritUpgradeId, number> =>
  Object.fromEntries(SPIRIT_UPGRADE_IDS.map((id) => [id, 0])) as Record<SpiritUpgradeId, number>;

/** The price of upgrade `id`'s next level, or null once it is maxed. */
export const upgradePrice = (c: CatacombSave, id: SpiritUpgradeId): SpiritPrice | null => SPIRIT_UPGRADES[id].prices[c.upgrades[id]] ?? null;

/** Buys upgrade `id`'s next level with Spirit. Whether it was bought. */
export function buyUpgrade(c: CatacombSave, id: SpiritUpgradeId) {
  const price = upgradePrice(c, id);
  if (!price || c.spirit[price.rarity] < price.amount) return false;
  c.spirit[price.rarity] -= price.amount;
  c.upgrades[id]++;
  return true;
}
