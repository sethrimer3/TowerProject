import type { KeyColor } from "./config.ts";

/** The key colours a floor's generation may use: no door or key of a
 * closed colour appears on it. */
export type KeyColors = Readonly<Record<KeyColor, boolean>>;
export const ALL_KEY_COLORS: KeyColors = { yellow: true, blue: true, red: true };
/** In the first delve, the equivalent floor (counting from 1) each key
 * colour first appears on: the first floor of a section, past the boss
 * before it. Later delves use every colour from their first floor. The
 * Tower follows its own door schedule (`towerKeyColorsOn`, below); the
 * Delve is to adopt it once it has been checked in the Tower. */
export const FIRST_TIER_KEY_FLOORS: Record<KeyColor, number> = { yellow: 1, blue: 21, red: 51 };
/** The colours open on the Delve's equivalent floor `floor` (0 is the first) of tier `tier`. */
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
/** Every key colour a door gate takes: its `color`, and on a combined door
 * each colour in `also`. */
export const doorKeys = (g: { color: KeyColor; also?: KeyColor[] }): KeyColor[] => [g.color, ...(g.also ?? [])];
/** Whether `thing` (a gate, reward, pattern step or fork, however deeply
 * nested) holds no key or door of a closed colour. A potion's colour names
 * its kind, not a key, so only keys and doors count. */
export function onlyOpenKeys(thing: unknown, colors: KeyColors): boolean {
  if (Array.isArray(thing)) return thing.every((v) => onlyOpenKeys(v, colors));
  if (!thing || typeof thing !== "object") return true;
  const o = thing as Record<string, unknown>;
  if ((o.kind === "key" || o.kind === "door") && typeof o.color === "string" && !colors[o.color as KeyColor]) return false;
  if (o.kind === "door" && Array.isArray(o.also) && o.also.some((c) => !colors[c as KeyColor])) return false;
  return Object.values(o).every((v) => onlyOpenKeys(v, colors));
}

/** The equivalent floor (counting from 1) the Delve's Heart Doors first
 * appear on from the second tier on (the Tower's: `towerDoorFirstFloor`). */
export const HEART_DOOR_FLOOR = 31;
/** The same in the first delve: past floor 100, so a new hero has time to
 * prepare for them. */
export const FIRST_TIER_HEART_DOOR_FLOOR = 101;
/** Whether equivalent floor `floor` (0 is the first; the Delve's may be
 * fractional) of tier `tier` may hold a Heart Door. */
export const heartDoorsOn = (floor: number, tier = 1) =>
  Math.floor(floor) + 1 >= (tier > 1 ? HEART_DOOR_FLOOR : FIRST_TIER_HEART_DOOR_FLOOR);
/** Whether a fork holds no Heart Door. */
export const withoutHeart = (f: { lanes: { kind: string }[][] }) => !f.lanes.some((lane) => lane.some((s) => s.kind === "heart"));

// ---------------------------------------------------------------- the Tower's door schedule

/** The doors the Tower places by quota (docs/DOOR_AND_KEY_SCHEDULE.md):
 * each floor rolls how many of each it holds (`towerDoorRate`), and only
 * the door stage (`tower/door-quota.ts`) places them; every other table
 * offers only yellow doors (`withoutQuotaDoors`). */
export type QuotaDoor = "blue" | "red" | "heart";
export const QUOTA_DOORS: readonly QuotaDoor[] = ["red", "blue", "heart"];

/** When each quota door first appears in the Tower, and how fast it grows. */
export const TOWER_DOOR_SCHEDULE = {
  /** The first floor (counting from 1) in tower 1, and how many floors
   * earlier it comes in each later tower. */
  first: { blue: [51, 5], red: [101, 10], heart: [201, 10] } as Record<QuotaDoor, readonly [floor: number, earlierEachTower: number]>,
  /** Doors per floor, in hundredths: `start` on the first floor, and `step`
   * more every `every` floors after. Blue grows twice as fast as red, so red
   * stays the rarer key and door. */
  growth: {
    blue: { start: 10, step: 1, every: 5 },
    red: { start: 10, step: 1, every: 10 },
    heart: { start: 10, step: 1, every: 10 },
  } as Record<QuotaDoor, { start: number; step: number; every: number }>,
  /** Blue and red doors stop growing at this floor; Heart Doors at
   * `heartMaxHundredths` a floor, however high. */
  colorsGrowUntil: 1000,
  heartMaxHundredths: 100,
};

/** The first floor (counting from 1) door `door` appears on in tower `tower`. */
export function towerDoorFirstFloor(door: QuotaDoor, tower: number) {
  const [floor, earlier] = TOWER_DOOR_SCHEDULE.first[door];
  return floor - earlier * (tower - 1);
}

/** How many doors of `door` floor `depth` (0 is the first) of tower `tower`
 * holds on average, in hundredths: whole numbers, so every engine rolls
 * the same quota. */
export function towerDoorHundredths(door: QuotaDoor, depth: number, tower: number) {
  const s = TOWER_DOOR_SCHEDULE, first = towerDoorFirstFloor(door, tower);
  let floor = depth + 1;
  if (floor < first) return 0;
  if (door !== "heart") floor = Math.min(floor, s.colorsGrowUntil);
  const g = s.growth[door];
  const h = g.start + g.step * Math.floor((floor - first) / g.every);
  return door === "heart" ? Math.min(h, s.heartMaxHundredths) : h;
}

/** The same as doors per floor (0.06, 0.95 …), for reports. */
export const towerDoorRate = (door: QuotaDoor, depth: number, tower: number) => towerDoorHundredths(door, depth, tower) / 100;

/** The key colours open on floor `depth` (0 is the first) of tower `tower`:
 * yellow always, blue and red from their doors' first floors, so a key
 * never comes before a door it opens. */
export function towerKeyColorsOn(depth: number, tower: number): KeyColors {
  const open = (door: QuotaDoor) => depth + 1 >= towerDoorFirstFloor(door, tower);
  return { yellow: true, blue: open("blue"), red: open("red") };
}

/** The share of a Tower floor's yellow locks made Wooden Doors, in
 * percent: all of them on Tower I's first floor, 10 points fewer each later
 * tower and one fewer every `everyFloors` floors, down to none. */
export const TOWER_WOOD_SCHEDULE = { start: 100, lessEachTower: 10, everyFloors: 10 };
export function towerWoodPercent(depth: number, tower: number) {
  const s = TOWER_WOOD_SCHEDULE;
  return Math.max(0, s.start - s.lessEachTower * (tower - 1) - Math.floor(depth / s.everyFloors));
}

/** The Tower's key supply (docs/DOOR_AND_KEY_SCHEDULE.md, section 4): for
 * each key colour, the keys per lock a floor aims for, in ten-thousandths so
 * every engine rolls the same. Each colour starts at `start` on its first
 * floor (yellow on floor 1, blue and red with their doors), with a surplus,
 * and falls `lessEachTower` each later tower and `lessEvery10` every ten
 * floors after its first, never below `min`; on the way to the stairs it
 * falls half as fast. The resource planner works toward it by chance
 * (`thinToAim`, `coverDoor` in tower/resource-planner.ts): each floor keeps
 * its pattern keys of a colour at the chance that leaves the ratio's worth
 * for its doors, and rolls to add keys while short, at the chance of how
 * short it is. */
export const TOWER_KEY_RATIO = {
  start: { yellow: 13000, blue: 12000, red: 11000 } as Record<KeyColor, number>,
  min: { yellow: 5000, blue: 4000, red: 3000 } as Record<KeyColor, number>,
  lessEachTower: 1000,
  lessEvery10: 50,
};
/** The first floor (counting from 1) keys of `color` appear on in tower `tower`. */
export const keyFirstFloor = (color: KeyColor, tower: number) => (color === "yellow" ? 1 : towerDoorFirstFloor(color, tower));
/** The keys per lock of `color` floor `depth` (0 is the first) of tower
 * `tower` aims for, in ten-thousandths. */
export function towerKeyRatio(color: KeyColor, depth: number, tower: number, main = false) {
  const s = TOWER_KEY_RATIO, since = Math.max(0, depth + 1 - keyFirstFloor(color, tower));
  const fall = s.lessEachTower * (tower - 1) + s.lessEvery10 * Math.floor(since / 10);
  return Math.max(s.min[color], s.start[color] - (main ? fall / 2 : fall));
}
/** Whether to keep one unguarded key of `color` on floor `depth` of tower
 * `tower`: always while the colour's ratio is 1 or more, else at the
 * ratio's chance, drawing from `rng` only then. */
export function keepsKey(color: KeyColor, depth: number, tower: number, rng: () => number) {
  const ratio = towerKeyRatio(color, depth, tower);
  return ratio >= 10000 || rng() * 10000 < ratio;
}

/** Whether `thing` (a gate, pattern step, lane or fork, however deeply
 * nested) holds no blue, red or Heart Door: what every Tower table but the
 * door stage may offer. */
export function withoutQuotaDoors(thing: unknown): boolean {
  if (Array.isArray(thing)) return thing.every(withoutQuotaDoors);
  if (!thing || typeof thing !== "object") return true;
  const o = thing as Record<string, unknown>;
  if (o.kind === "heart" || (o.kind === "door" && (o.heart || doorKeys(o as { color: KeyColor; also?: KeyColor[] }).some((c) => c !== "yellow")))) return false;
  return Object.values(o).every(withoutQuotaDoors);
}

/** How many of each quota door `thing` holds. */
export function quotaDoorsIn(thing: unknown, out: Record<QuotaDoor, number> = { blue: 0, red: 0, heart: 0 }) {
  if (Array.isArray(thing)) for (const v of thing) quotaDoorsIn(v, out);
  else if (thing && typeof thing === "object") {
    const o = thing as Record<string, unknown>;
    if (o.kind === "heart") out.heart++;
    else if (o.kind === "door") {
      for (const c of doorKeys(o as { color: KeyColor; also?: KeyColor[] })) if (c === "blue" || c === "red") out[c]++;
      if (o.heart) out.heart++;
    } else for (const v of Object.values(o)) quotaDoorsIn(v, out);
  }
  return out;
}
