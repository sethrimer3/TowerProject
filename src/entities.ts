import type { GoldItemId, KeyColor, UpgradeId } from "./config.ts";
import type { MaterialId } from "./materials.ts";
import type { CraftedEquipment, EquipmentSlot } from "./equipment.ts";
import type { ConsumableId } from "./crafting.ts";
export type Kind =
  | "wall"
  | "floor"
  | "enemy"
  | "key"
  | "door"
  | "potion"
  | "attack"
  | "defense"
  | "reward"
  | "treasure"
  | "stairs"
  | "stairsDown"
  | "oneway";
export type Enemy = {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  tier: number;
};
export type ClearTier = "silver" | "gold" | "platinum";
export type RewardChest = { x: number; y: number; tier: ClearTier };
export type FloorRecord = { earned: ClearTier[]; claimed: ClearTier[] };
export type Tile = { kind: Kind; color?: KeyColor; enemy?: Enemy; tier?: ClearTier };
export type Point = { x: number; y: number };
/** A stationary wall-mounted light source, anchored to a walkable floor
 * tile adjacent to a wall. Its visibility polygon is computed once (on
 * creation) and cached; rendering only clips a radial gradient to it. */
export type Torch = {
  x: number;
  y: number;
  lightRadius: number;
  baseIntensity: number;
  active: boolean;
  visibilityPolygon?: Point[];
};
export type Player = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  keys: Record<KeyColor, number>;
};
export type Run = {
  damaged?: boolean;
  keysSpent?: boolean;
  rewards?: RewardChest[];
  outside?: boolean;
  layoutVersion?: number;
  seed: number;
  player: Player;
  height: number;
  kills: number;
  treasures: number;
  changes: Record<string, Tile>;
  floor: number;
  /** Tower only: each visited room's own changes, keyed by height, so
   * descending and re-climbing preserves what was already done there. */
  floors?: Record<number, Record<string, Tile>>;
};
export type MoveSnapshot = { run: Run; best: number };
export type Revival = { snapshot: MoveSnapshot; earned: number };
export type Settings = {
  weatherSound?: boolean;
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
  reached: number;
  run: Run | null;
  /** Keys of `${seed}:${x},${y}` (delve) or `${seed}:${height}:${x},${y}`
   * (tower) for every enemy kill / treasure chest that has already paid out
   * persistent rewards, kept outside `run` so it survives movement undo and
   * blocks the same physical kill/chest from paying out twice. */
  lootedTiles: Record<string, true>;
};
export type Save = {
  version: 3;
  tower: ModeSave & { shards: number; log: Record<string, FloorRecord> };
  delve: ModeSave & { essence: number };
  gold: number;
  provisions: Record<GoldItemId, number>;
  xp: number;
  upgrades: Record<UpgradeId, number>;
  settings: Settings;
  /** Persistent crafting-material inventory. Never part of `Run` — must
   * survive movement undo, death, and new runs. */
  materials: Record<MaterialId, number>;
  equipmentInventory: CraftedEquipment[];
  equipped: Partial<Record<EquipmentSlot, string>>;
  consumables: Record<ConsumableId, number>;
};
export const point = (x: number, y: number) => `${x},${y}`;
