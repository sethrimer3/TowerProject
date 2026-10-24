import type { KeyColor } from "./entities.ts";
export const UNGUARDED_LOOT_CHANCE = 1 / 1000;
export const WIDTH = 30;
export const CHUNK = 20;
export const START_X = 15;
export const VIEWPORT_TILES = 17;
export const TOWER_WIDTH = 17;
export const TOWER_HEIGHT = 17;
export const TOWER_START_X = 8;
/** Tower floors come in isolated sections of this many rooms. */
export const TOWER_SECTION = 10;
export const SAVE_KEY = "towerdelve.v1";
export const COLORS: Record<KeyColor, string> = { yellow: "#eac16b", blue: "#6dbdf1", red: "#df797e" };
/** Ignore and Target uses a run starts with, once each skill is owned. */
export const IGNORE_PER_RUN = 1;
export const TARGET_PER_RUN = 1;
/** New floors a run climbs to regain one Ignore or Target use (Ignore
 * More, Target More), before research shortens it. */
export const REGAIN_FLOORS = 100;
