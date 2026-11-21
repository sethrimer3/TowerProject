/** Card rarities: what a card's level makes it. Base at level 0, then
 * common through mythic, ten levels each (common 1 to 10, uncommon 11 to
 * 20, … mythic 51 to 60). Each rarity past base holds one power
 * (cards/powers.ts), and every rarity past common is reached by ascending
 * (cards/levels.ts), paid in Rubies. */
export type CardRarity = "base" | "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

/** The rarities, base first. */
export const CARD_RARITIES: readonly CardRarity[] = ["base", "common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** The levels each rarity past base spans. */
export const LEVELS_PER_RARITY = 10;

/** Each rarity's name, as the player reads it. */
export const CARD_RARITY_NAMES: Record<CardRarity, string> = {
  base: "Base", common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic",
};

/** The stars each rarity wears: a hollow green one for uncommon, one to
 * three gold ones from rare to legendary, and one purple star for mythic
 * (none for base and common). */
export const CARD_RARITY_STARS: Record<CardRarity, number> = { base: 0, common: 0, uncommon: 1, rare: 1, epic: 2, legendary: 3, mythic: 1 };

/** Where `rarity` stands, base 0. */
export const rarityRank = (rarity: CardRarity) => CARD_RARITIES.indexOf(rarity);

/** The first level of `rarity` (0 for base, 1 for common, 11 for uncommon, …). */
export const firstLevelOf = (rarity: CardRarity) => Math.max(0, (rarityRank(rarity) - 1) * LEVELS_PER_RARITY + 1);

/** The rarity of a card at `level`. */
export const rarityAt = (level: number): CardRarity =>
  CARD_RARITIES[Math.min(CARD_RARITIES.length - 1, Math.ceil(Math.max(0, level) / LEVELS_PER_RARITY))]!;

/** The Rubies ascending to each rarity costs (common needs none: every
 * card levels into it). */
export const ASCEND_RUBIES: Partial<Record<CardRarity, number>> = { uncommon: 10, rare: 100, epic: 1_000, legendary: 10_000, mythic: 100_000 };
