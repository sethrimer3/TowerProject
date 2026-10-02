// Rarity is data: offers, and later equipment, name a rarity, and the UI
// reads its colour from here rather than knowing the tiers itself.

export type RarityId = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "ancestral";
export type Rarity = {
  displayName: string;
  color: string;
  /** How much stronger generated items of this rarity are (future equipment). */
  powerMultiplier: number;
  /** How often generated offers or drops roll it, against the others (future). */
  dropWeight: number;
};

export const RARITIES: Record<RarityId, Rarity> = {
  common: { displayName: "Common", color: "#b8bcc4", powerMultiplier: 1, dropWeight: 600 },
  uncommon: { displayName: "Uncommon", color: "#6fd36a", powerMultiplier: 1.25, dropWeight: 250 },
  rare: { displayName: "Rare", color: "#4aa8ff", powerMultiplier: 1.6, dropWeight: 100 },
  epic: { displayName: "Epic", color: "#b46cff", powerMultiplier: 2, dropWeight: 35 },
  legendary: { displayName: "Legendary", color: "#ffb43a", powerMultiplier: 2.5, dropWeight: 12 },
  mythic: { displayName: "Mythic", color: "#ff5a5a", powerMultiplier: 3.2, dropWeight: 2.5 },
  ancestral: { displayName: "Ancestral", color: "#5ef0e0", powerMultiplier: 4, dropWeight: 0.5 },
};
