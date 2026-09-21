import type { KeyColor, UpgradeId } from "./config.ts";
export type Kind =
  | "wall"
  | "floor"
  | "enemy"
  | "key"
  | "door"
  | "potion"
  | "attack"
  | "defense"
  | "treasure"
  | "stairs";
export type Enemy = {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  tier: number;
};
export type Tile = { kind: Kind; color?: KeyColor; enemy?: Enemy };
export type Gear = {
  slot: "weapon" | "armor";
  name: string;
  quality: number;
  attack: number;
  defense: number;
};
export type Player = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  keys: Record<KeyColor, number>;
  gear: Gear[];
};
export type Run = {
  layoutVersion?: number;
  seed: number;
  player: Player;
  height: number;
  kills: number;
  treasures: number;
  changes: Record<string, Tile>;
  floor: number;
};
export type MoveSnapshot = { run: Run; best: number };
export type Revival = { snapshot: MoveSnapshot; earned: number };
export type Settings = {
  transition: "smooth" | "fast" | "instant";
  showArrows: boolean;
  density: number;
  speed: number;
  reduceMotion: boolean;
};
export type Mode = "tower" | "delve";
export type ModeSave = {
  history: MoveSnapshot[];
  revival: Revival | null;
  best: number;
  run: Run | null;
};
export type Save = {
  version: 2;
  tower: ModeSave & { shards: number };
  delve: ModeSave & { essence: number };
  gold: number;
  xp: number;
  upgrades: Record<UpgradeId, number>;
  settings: Settings;
};
export const point = (x: number, y: number) => `${x},${y}`;
export const gear = (quality: number): Gear[] => [
  {
    slot: "weapon",
    name: quality ? "Embersteel blade" : "Traveler’s blade",
    quality,
    attack: 2 + quality * 2,
    defense: 0,
  },
  {
    slot: "armor",
    name: quality ? "Runewoven mail" : "Weathered mail",
    quality,
    attack: 0,
    defense: 1 + quality,
  },
];
