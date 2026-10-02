import type { KeyColor } from "./config.ts";

/** The key colours a floor's generation may use: no door or key of a
 * closed colour appears on it. */
export type KeyColors = Readonly<Record<KeyColor, boolean>>;
export const ALL_KEY_COLORS: KeyColors = { yellow: true, blue: true, red: true };
/** In the first tower and delve, the equivalent floor (counting from 1)
 * each key colour first appears on. Later tiers use every colour from their
 * first floor, as before: a hero who reaches them already has what the
 * blue and red keys ask for. */
export const FIRST_TIER_KEY_FLOORS: Record<KeyColor, number> = { yellow: 1, blue: 20, red: 50 };
/** The colours open on equivalent floor `floor` (0 is the first) of tier `tier`. */
export function keyColorsOn(floor: number, tier = 1): KeyColors {
  if (tier > 1) return ALL_KEY_COLORS;
  const open = (c: KeyColor) => floor + 1 >= FIRST_TIER_KEY_FLOORS[c];
  return { yellow: open("yellow"), blue: open("blue"), red: open("red") };
}
/** Whether `thing` (a gate, reward, pattern step or fork, however deeply
 * nested) holds no key or door of a closed colour. A potion's colour names
 * its kind, not a key, so only keys and doors count. */
export function onlyOpenKeys(thing: unknown, colors: KeyColors): boolean {
  if (Array.isArray(thing)) return thing.every((v) => onlyOpenKeys(v, colors));
  if (!thing || typeof thing !== "object") return true;
  const o = thing as Record<string, unknown>;
  if ((o.kind === "key" || o.kind === "door") && typeof o.color === "string" && !colors[o.color as KeyColor]) return false;
  return Object.values(o).every((v) => onlyOpenKeys(v, colors));
}

/** The equivalent floor (counting from 1) Heart Doors first appear on, in
 * every tier. */
export const HEART_DOOR_FLOOR = 31;
/** Whether equivalent floor `floor` (0 is the first; the Delve's may be
 * fractional) may hold a Heart Door. */
export const heartDoorsOn = (floor: number) => Math.floor(floor) + 1 >= HEART_DOOR_FLOOR;
/** Whether a fork holds no Heart Door. */
export const withoutHeart = (f: { lanes: { kind: string }[][] }) => !f.lanes.some((lane) => lane.some((s) => s.kind === "heart"));
