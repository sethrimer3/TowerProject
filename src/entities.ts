import type { GoldItemId, KeyColor, UpgradeId } from "./config.ts";
import type { MaterialId } from "./materials.ts";
import type { CraftedEquipment, EquipmentSlot } from "./equipment.ts";
import type { ConsumableId } from "./crafting.ts";
import type { DefendSave } from "./defend.ts";
import type { DefendWaveSave } from "./defend-enemies.ts";
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
/** Declarative lock rules. `color` remains on Tile for legacy single-key
 * doors and keys; new doors use this rule so every gameplay system shares
 * the same requirements and consumption behavior. */
export type DoorRule =
  | { type: "keys"; keys: KeyColor[]; mode: "all" | "any" }
  | { type: "fullHp" };
export type Tile = { kind: Kind; color?: KeyColor; door?: DoorRule; enemy?: Enemy; tier?: ClearTier };
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
  maxHeight?: number;
  kills: number;
  treasures: number;
  changes: Record<string, Tile>;
  floor: number;
  /** Tower only: each visited room's own changes, keyed by height, so
   * descending and re-climbing preserves what was already done there. */
  floors?: Record<number, Record<string, Tile>>;
  /** Tower only: the ATK/DEF the run started with (base + gear +
   * provisions), restored whenever the climb crosses into a new section. */
  baseStats?: { attack: number; defense: number };
};
export type MoveSnapshot = { run: Run; best: number };
export type Revival = { snapshot: MoveSnapshot; earned: number };
export type Settings = {
  /** Use the original procedural renderers instead of bitmap art. */
  spritesOff?: boolean;
  weatherSound?: boolean;
  transition: "smooth" | "fast" | "instant";
  showArrows: boolean;
  speed: number;
  reduceMotion: boolean;
  /** Dungeon brightness, 20 (very dark) to 100 (default look). */
  brightness?: number;
  /** Requires the autoPersist upgrade to configure; otherwise Automove
   * always turns off on death. */
  autoOffOnDeath?: boolean;
  /** Delve: tapping a tile walks there immediately instead of requiring a
   * second tap to confirm. The info box still appears either way. */
  oneTapMove?: boolean;
  /** Delve: which tile-inspection surfaces appear on tap. "none" makes a
   * single tap always walk there directly, same as the old showInfoBoxes
   * off state. */
  infoDisplay?: "both" | "popup" | "status" | "none";
  /** Unlimited currency, every floor section and game mode unlocked. */
  devMode?: boolean;
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
  tower: ModeSave & {
    shards: number;
    log: Record<string, FloorRecord>;
    /** Which 10-floor section new ascents begin in (0 = floors 1–10). */
    startSection: number;
    /** Highest HP the player has arrived at each section's first floor
     * with, keyed by section index (1+). Doubles as that section's
     * starting HP and as the record of which sections are unlocked. */
    sectionHp: Record<string, number>;
  };
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
  /** DEFEND mini-game city layout, persisted independently of a run. */
  defend: DefendSave;
  /** DEFEND mini-game enemy wave progress. */
  defendWaves: DefendWaveSave;
};
export const point = (x: number, y: number) => `${x},${y}`;
