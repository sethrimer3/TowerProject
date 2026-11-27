// The Spirit menu's upgrades (docs/CATACOMBS.md): bought with Spirit, each
// level priced in one rarity. More come later.
import type { SpiritRarity } from "./catalog.ts";
import type { CatacombSave } from "./state.ts";

export const SPIRIT_UPGRADE_IDS = ["unlock", "matk"] as const;
export type SpiritUpgradeId = (typeof SPIRIT_UPGRADE_IDS)[number];
export type SpiritPrice = { rarity: SpiritRarity; amount: number };

/** Magic ATK +1's Uncommon Spirit by level: 50 × 1.2^(level − 1), rounded. */
const MATK_COSTS = [50, 60, 72, 86, 104, 124, 149, 179, 215, 258, 310, 372, 446, 535, 642, 770, 924, 1109, 1331, 1597, 1917, 2300, 2760, 3312, 3975];

/** Each upgrade: its name, what a level does, and each level's price. */
export const SPIRIT_UPGRADES: Record<SpiritUpgradeId, { name: string; brief: string; prices: readonly SpiritPrice[] }> = {
  unlock: {
    name: "Unlock Ability", brief: "Unlocks the next ability: Spell Surge, Renewing Rush, then Arcane Barrage.",
    prices: [{ rarity: "uncommon", amount: 10 }, { rarity: "rare", amount: 75 }, { rarity: "epic", amount: 150 }],
  },
  matk: { name: "Magic ATK +1", brief: "+1 MAtk a level.", prices: MATK_COSTS.map((amount) => ({ rarity: "uncommon" as const, amount })) },
};

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
