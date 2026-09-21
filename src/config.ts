export const UNGUARDED_LOOT_CHANCE = 1 / 1000;
export const WIDTH = 30;
export const CHUNK = 20;
export const START_X = 15;
export const SAVE_KEY = "towerincramental.v1";
export const COLORS = { yellow: "#eac16b", blue: "#6dbdf1", red: "#df797e" };
export type KeyColor = keyof typeof COLORS;
export const UPGRADES = [
  {
    id: "hp",
    name: "Vital ember",
    description: "+20 starting maximum HP",
    base: 3,
    max: 50,
  },
  {
    id: "attack",
    name: "Tempered edge",
    description: "+2 starting attack",
    base: 4,
    max: 50,
  },
  {
    id: "defense",
    name: "Stone skin",
    description: "+1 starting defense",
    base: 4,
    max: 50,
  },
  {
    id: "yellow",
    name: "Gilded passage",
    description: "+1 starting amber key",
    base: 3,
    max: 10,
  },
  {
    id: "blue",
    name: "Azure passage",
    description: "+1 starting azure key",
    base: 5,
    max: 10,
  },
  {
    id: "red",
    name: "Crimson passage",
    description: "+1 starting crimson key",
    base: 7,
    max: 10,
  },
  {
    id: "quality",
    name: "Heirloom steel",
    description: "+2 weapon attack and +1 armor defense",
    base: 6,
    max: 20,
  },
  {
    id: "auto",
    name: "Wayfinder",
    description: "Unlock purposeful automatic climbing",
    base: 3,
    max: 1,
  },
] as const;
export type UpgradeId = (typeof UPGRADES)[number]["id"];
export const cost = (id: UpgradeId, level: number) =>
  Math.ceil(UPGRADES.find((u) => u.id === id)!.base * 1.65 ** level);
export const reward = (height: number, kills: number, treasures: number) =>
  Math.max(
    1,
    Math.floor(height / 8) + Math.floor(kills / 5) + Math.min(5, treasures),
  );
