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
    description: "+20 max HP next run",
    cost: 6,
  },
  {
    id: "edge",
    name: "Whetstone",
    description: "+3 attack next run",
    cost: 10,
  },
  {
    id: "guard",
    name: "Aegis charm",
    description: "+3 defense next run",
    cost: 10,
  },
] as const;
export type GoldItemId = (typeof GOLD_SHOP)[number]["id"];


export type EnemyArchetype = "weak" | "balanced" | "tank" | "brute" | "glassCannon" | "guardian";
export const ENEMY_ARCHETYPES: Record<EnemyArchetype, { hp: number, attack: number, defense: number }> = {
  weak: { hp: 0.7, attack: 0.75, defense: 0.7 },
  balanced: { hp: 1.0, attack: 1.0, defense: 1.0 },
  tank: { hp: 1.2, attack: 0.8, defense: 1.3 },
  brute: { hp: 1.1, attack: 1.3, defense: 0.75 },
  glassCannon: { hp: 0.75, attack: 1.45, defense: 0.55 },
  guardian: { hp: 1.25, attack: 1.1, defense: 1.1 },
};

export const TOWER_SCALING = {
  hp: (r: number) => 20 + 3.0 * r + 0.12 * r * r,
  attack: (r: number) => 6 + 0.95 * r + 0.006 * r * r,
  defense: (r: number) => 2 + 1.35 * r + 0.012 * r * r,
};
