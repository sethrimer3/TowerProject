/** Card rarities: how rare a card buy's draw is (cards/buys.ts), which
 * rarity of a card tree's nodes it opens (cards/trees.ts), and how a card
 * looks once it holds a node of that rarity. Common is the base every new
 * card starts with; legendary is the rarest and strongest. */
export type CardRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** The rarities, commonest first. */
export const CARD_RARITIES: readonly CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

/** How often a card buy draws each rarity, in hundredths of a percent
 * (60%, 32%, 6%, 1.5% and 0.5%: 10,000 in all). */
export const CARD_RARITY_WEIGHTS: Record<CardRarity, number> = { common: 6000, uncommon: 3200, rare: 600, epic: 150, legendary: 50 };

/** Each rarity's name, as the player reads it. */
export const CARD_RARITY_NAMES: Record<CardRarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };

/** The stars each rarity wears: gold ones from uncommon to epic, and one
 * purple star for legendary (none for common). */
export const CARD_RARITY_STARS: Record<CardRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 1 };

/** Where `rarity` stands, commonest 0. */
export const rarityRank = (rarity: CardRarity) => CARD_RARITIES.indexOf(rarity);
