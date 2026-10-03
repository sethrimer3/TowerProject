import type { KeyColor } from "./config.ts";

/** The key colours a floor's generation may use: no door or key of a
 * closed colour appears on it. */
export type KeyColors = Readonly<Record<KeyColor, boolean>>;
export const ALL_KEY_COLORS: KeyColors = { yellow: true, blue: true, red: true };
/** In the first tower and delve, the equivalent floor (counting from 1)
 * each key colour first appears on: the first floor of a section, past the
 * boss before it. Later tiers use every colour from their first floor, as
 * before: a hero who reaches them already has what the blue and red keys
 * ask for. */
export const FIRST_TIER_KEY_FLOORS: Record<KeyColor, number> = { yellow: 1, blue: 21, red: 51 };
/** The colours open on equivalent floor `floor` (0 is the first) of tier `tier`. */
export function keyColorsOn(floor: number, tier = 1): KeyColors {
  if (tier > 1) return ALL_KEY_COLORS;
  const open = (c: KeyColor) => floor + 1 >= FIRST_TIER_KEY_FLOORS[c];
  return { yellow: open("yellow"), blue: open("blue"), red: open("red") };
}
/** Only yellow keys: what a first-tower floor's way to the stairs may ask
 * for without another way round (`bypassesRareKeys`). */
export const YELLOW_ONLY: KeyColors = { yellow: true, blue: false, red: false };
/** Whether tier `tier`'s Tower floors keep every blue and red door off the
 * single way to the stairs: a main-route gate is never one, and a fork
 * there offers one only beside a lane that needs neither colour. In the
 * first tower a hero meeting them may not have the key yet; from the
 * second on, upgrades carry it past such a bottleneck. */
export const bypassesRareKeys = (tier: number) => tier <= 1;
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
