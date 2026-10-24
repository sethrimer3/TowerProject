import type { Tile } from "../entities.ts";

export const ITEM_KIT = { key_yellow: "key-yellow", key_blue: "key-blue", key_red: "key-red", potion_flat: "potion-red", potion_percent: "potion-blue", upgrade_attack: "sword", upgrade_defense: "shield", chest_treasure: "chest-wood", chest_silver: "chest-silver", chest_gold: "chest-gold", chest_treasure_open: "chest-open", chest_silver_open: "chest-open", chest_gold_open: "chest-open" };
export type ItemSpriteId = keyof typeof ITEM_KIT;
export function itemSpriteId(t: Tile): ItemSpriteId | null {
  switch (t.kind) {
    case "key": return `key_${t.color ?? "yellow"}`;
    case "potion": return t.color === "red" ? "potion_percent" : "potion_flat";
    case "attack": return "upgrade_attack";
    case "defense": return "upgrade_defense";
    case "treasure": return "chest_treasure";
    case "reward": return `chest_${t.tier ?? "silver"}`;
    case "openedChest": return `chest_${t.tier ?? "treasure"}_open`;
    default: return null;
  }
}
