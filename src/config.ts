export const UNGUARDED_LOOT_CHANCE = 1 / 1000;
export const WIDTH = 30;
export const CHUNK = 20;
export const TOWER_CHUNK = 20;
export const DELVE_MAX_DEPTH = 5000;
export const START_X = 15;
export const TOWER_WIDTH = 20;
export const TOWER_START_X = 10;
export const SAVE_KEY = "towerincramental.v1";
export const COLORS = { yellow: "#eac16b", blue: "#6dbdf1", red: "#df797e" };
export type KeyColor = keyof typeof COLORS;
export type Currency = "essence" | "shards";
export const UPGRADES = [
  { id: "delve", name: "Into the depths", description: "Unlock Delve and the Courage skill tree", base: 3, max: 1, currency: "shards" },
  { id: "legacy", name: "An enduring legacy", description: "Unlock the Legacy skill tree", base: 8, max: 1, currency: "essence" },
  {
    id: "revive",
    name: "Revive",
    description: "Undo a fatal move before moving in the new run",
    base: 12,
    max: 1,
    currency: "essence",
  },
  {
    id: "undos",
    name: "Echoes of time",
    description: "Store one additional undo (up to 5)",
    base: 5,
    max: 4,
    currency: "essence",
  },
  {
    id: "hp",
    name: "Vital ember",
    description: "+20 starting maximum HP",
    base: 3,
    max: 50,
    currency: "essence",
  },
  {
    id: "attack",
    name: "Tempered edge",
    description: "+2 starting attack",
    base: 4,
    max: 50,
    currency: "essence",
  },
  {
    id: "defense",
    name: "Stone skin",
    description: "+1 starting defense",
    base: 4,
    max: 50,
    currency: "essence",
  },
  {
    id: "yellow",
    name: "Gilded passage",
    description: "+1 starting amber key",
    base: 3,
    max: 10,
    currency: "essence",
  },
  {
    id: "blue",
    name: "Azure passage",
    description: "+1 starting azure key",
    base: 5,
    max: 10,
    currency: "essence",
  },
  {
    id: "red",
    name: "Crimson passage",
    description: "+1 starting crimson key",
    base: 7,
    max: 10,
    currency: "essence",
  },
  {
    id: "quality",
    name: "Heirloom steel",
    description: "+2 weapon attack and +1 armor defense",
    base: 6,
    max: 20,
    currency: "essence",
  },
  {
    id: "auto",
    name: "Automove",
    description: "Unlock automatic movement in both Tower and Delve",
    base: 3,
    max: 1,
    currency: "essence",
  },
  {
    id: "shardHp",
    name: "Battle-tested",
    description: "+15 starting maximum HP",
    base: 4,
    max: 40,
    currency: "shards",
  },
  {
    id: "shardAttack",
    name: "Keen instinct",
    description: "+1 starting attack",
    base: 5,
    max: 40,
    currency: "shards",
  },
  {
    id: "shardDefense",
    name: "Iron resolve",
    description: "+1 starting defense",
    base: 5,
    max: 40,
    currency: "shards",
  },
  {
    id: "shardUndos",
    name: "Rehearsed steps",
    description: "Store one additional undo (up to 5)",
    base: 6,
    max: 4,
    currency: "shards",
  },
] as const;
export type UpgradeId = (typeof UPGRADES)[number]["id"];
export const cost = (id: UpgradeId, level: number) =>
  Math.ceil(UPGRADES.find((u) => u.id === id)!.base * 1.65 ** level);
export const essenceReward = (
  depth: number,
  kills: number,
  treasures: number,
) =>
  Math.max(
    1,
    Math.floor(depth / 8) + Math.floor(kills / 5) + Math.min(5, treasures),
  );
export const shardReward = (rooms: number, kills: number, treasures: number) =>
  Math.max(
    1,
    Math.floor(rooms / 2) + Math.floor(kills / 5) + Math.min(5, treasures),
  );
export const goldReward = (kills: number, treasures: number) =>
  Math.floor(kills / 3) + treasures;
export const xpForKill = (tier: number, attack: number) =>
  3 + tier * 4 + Math.floor(attack / 5);
export const levelForXp = (xp: number) =>
  Math.floor((Math.sqrt(1 + xp / 5) - 1) / 2);
export const levelBonus = (level: number) => ({
  hp: level * 2,
  attack: Math.floor(level / 3),
  defense: Math.floor(level / 5),
});
export const GOLD_SHOP = [
  {
    id: "heal",
    name: "Traveler's elixir",
    description: "Restore your HP to full",
    cost: 6,
  },
  {
    id: "edge",
    name: "Whetstone",
    description: "+3 attack for this ascent",
    cost: 10,
  },
  {
    id: "guard",
    name: "Aegis charm",
    description: "+3 defense for this ascent",
    cost: 10,
  },
] as const;
export type GoldItemId = (typeof GOLD_SHOP)[number]["id"];
