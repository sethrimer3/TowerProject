import { snap } from "./exact.ts";
import { tileRandom } from "./random.ts";
import { COLORS } from "./config.ts";
import { KEY_GOLD, PICKUP_GOLD } from "./economy/kill-pay.ts";
import type { DoorOdds, DoorRule, Player, Tile, KeyColor } from "./entities.ts";
import { wholeChange } from "./whole.ts";

export const KEY_ORDER: KeyColor[] = ["yellow", "blue", "red"];
export const KEY_NAMES: Record<KeyColor, string> = { yellow: "Gold", blue: "Blue", red: "Red" };
/** A key of `color` in text: "gold key". */
export const keyWord = (color: KeyColor) => `${KEY_NAMES[color].toLowerCase()} key`;
type KeyId = "a" | "b" | "c" | "ab" | "ac" | "bc" | "abc";
/** Each door's art: its keys' letters (a yellow, b blue, c red), with `h`
 * after them on a door that also drains HP to 1. */
export type DoorId = KeyId | `${KeyId}h` | "steel" | "heart" | "wood";

/** What a door asks for, opened or broken by `player`. */
type Opener = Pick<Player, "keys"> & { hp?: number };

export function doorRule(tile: Tile): DoorRule {
  return tile.door ?? { type: "keys", keys: [tile.color ?? "yellow"], mode: "all" };
}
/** What each key a door takes costs: one amount for every colour, or each
 * colour's own (a key colour's tree cutting its colour's key, `doorKeyScale`). */
export type KeyScale = number | Readonly<Record<KeyColor, number>>;
/** The part of a key of `color` that `scale` makes a door take. */
export const keyNeed = (scale: KeyScale, color: KeyColor) => snap(typeof scale === "number" ? scale : scale[color]);
/** The cheapest key held, at its `scale` of a key: gold, then blue, then red. */
const cheapestKey = (keys: KeyColor[], player: Opener, scale: KeyScale) =>
  KEY_ORDER.find((color) => keys.includes(color) && player.keys[color] >= keyNeed(scale, color));
/** The HP breaking a Wooden Door takes, under a badge's `scale`. */
export const woodToll = (rule: { durability: number }, scale = 1) => snap(rule.durability * scale);

/** Returns the exact keys that would be consumed, or null when the door won't
 * open. Any-key steel locks use a stable gold/blue/red priority so their
 * behavior is predictable. A Heart Door takes no keys and always opens: it
 * drains HP instead (`resolveStep`). A Wooden Door takes the cheapest key
 * held, or none when the hero has none and would survive breaking it
 * (`tollScale` scaling its durability); a caller that passes no HP (the
 * floor analyzer) counts it as breakable. */
export function doorCost(tile: Tile, player: Opener, scale: KeyScale = 1, tollScale = typeof scale === "number" ? scale : 1): KeyColor[] | null {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return [];
  // Keys may be fractional (Effective, Dampen): each colour the door takes
  // needs a whole key, or its `scale` of one, held.
  if (rule.type === "wood") {
    const key = cheapestKey(KEY_ORDER, player, scale);
    if (key) return [key];
    return player.hp === undefined || player.hp > woodToll(rule, tollScale) ? [] : null;
  }
  if (rule.mode === "any") {
    const key = cheapestKey(rule.keys, player, scale);
    return key ? [key] : null;
  }
  return rule.keys.every((color) => player.keys[color] >= keyNeed(scale, color)) ? [...rule.keys] : null;
}
/** Whether opening the door drains the hero's HP to 1: a Heart Door, or a
 * keyed door that is also one. */
export const drainsHp = (rule: DoorRule) => rule.type === "fullHp" || (rule.type === "keys" && !!rule.heart);

/** The colour of a single-lock door: one key of one colour, a Heart Door's drain or not; undefined for any other door. */
export function singleLock(tile: Tile): KeyColor | undefined {
  const rule = doorRule(tile);
  return rule.type === "keys" && rule.mode === "all" && rule.keys.length === 1 ? rule.keys[0] : undefined;
}
/** Whether the door `t` has a gold lock among the colours it needs (not a
 * Steel Door, which takes any key): GOLD DOOR's tree's doors. */
export function goldLocked(t: Tile) {
  const rule = doorRule(t);
  return rule.type === "keys" && rule.mode === "all" && rule.keys.includes("yellow");
}
/** Whether the door `t` is one of a door card's `kind` (its tree's doors):
 * a door with a gold lock (GOLD DOOR), one draining HP (HEART DOOR), a
 * Wooden Door (WOODEN DOOR). */
export function hasLock(t: Tile, kind: DoorKind) {
  const rule = doorRule(t);
  return kind === "yellow" ? goldLocked(t) : kind === "heart" ? drainsHp(rule) : rule.type === "wood";
}
/** A single gold door, GOLD DOOR's. */
export const isYellowDoor = (tile: Tile) => singleLock(tile) === "yellow";
/** The doors the door cards make cheaper while held (`CardBonus.door`), and
 * the percent less each costs: a single gold door's key (GOLD DOOR), the
 * HP a door draining HP takes (HEART DOOR), and a Wooden Door's key and the
 * HP breaking it takes (WOODEN DOOR). */
export type DoorKind = "yellow" | "heart" | "wood";
/** The percent less each kind costs; `all`, the percent less of each key
 * every door takes (DOOR's tree; it leaves HP alone); `plain`, the percent
 * less of the key and the HP a Wooden or Steel Door takes, and `hearts`,
 * of the keys and the drain a door draining HP takes (KEY's tree);
 * `woodKeys` and `woodToll`, of a Wooden Door's key and of the HP breaking
 * it takes (WOODEN DOOR's tree). Each adds into a kind's own as one card
 * factor. */
export type DoorDiscounts = Partial<Record<DoorKind | "all" | "plain" | "hearts" | "woodKeys" | "woodToll" | `${KeyColor}Key`, number>>;
/** What `off` multiplies the door `tile`'s keys and its HP toll by: 1 for
 * each it leaves alone. */
export function doorDiscount(tile: Tile, off?: DoorDiscounts): { keys: number; toll: number } {
  return off ? discountOf(tile, off) : { keys: 1, toll: 1 };
}
/** What each key the door `tile` takes costs: `base` (a badge's scale times
 * Key Efficiency, as a fraction of a key) times `off`'s cut, and a key
 * colour's tree's cut (`yellowKey`, `blueKey`, `redKey`) its own factor on
 * that colour's key, on any door that takes it. One amount when every
 * colour costs alike. */
export function doorKeyScale(tile: Tile, base: number, off?: DoorDiscounts): KeyScale {
  const keys = base * doorDiscount(tile, off).keys;
  if (!off || !KEY_ORDER.some((color) => off[`${color}Key`])) return snap(keys);
  const cut = (color: KeyColor) => (100 - Math.min(100, off[`${color}Key`] ?? 0)) / 100;
  return { yellow: snap(keys * cut("yellow")), blue: snap(keys * cut("blue")), red: snap(keys * cut("red")) };
}
function discountOf(tile: Tile, off: DoorDiscounts): { keys: number; toll: number } {
  const rule = doorRule(tile), all = off.all ?? 0, less = (...percents: (number | undefined)[]) => (100 - percents.reduce<number>((sum, n) => sum + (n ?? 0), 0)) / 100;
  if (rule.type === "wood") return { keys: less(off.wood, all, off.plain, off.woodKeys), toll: less(off.wood, off.plain, off.woodToll) };
  if (drainsHp(rule)) return { keys: less(isYellowDoor(tile) ? off.yellow : 0, all, off.hearts), toll: less(off.heart, off.hearts) };
  return { keys: less(isYellowDoor(tile) ? off.yellow : 0, all, rule.type === "keys" && rule.mode === "any" ? off.plain : 0), toll: 1 };
}

export function doorId(tile: Tile): DoorId {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return "heart";
  if (rule.type === "wood") return "wood";
  if (rule.mode === "any") return "steel";
  const letters = (KEY_ORDER.filter((key) => rule.keys.includes(key)).map((key) => ({ yellow: "a", blue: "b", red: "c" })[key]).join("") || "a") as KeyId;
  return rule.heart ? `${letters}h` : letters;
}
const KEY_DOOR_NAMES: Record<KeyId, string> = {
  a: "Gold Door", b: "Blue Door", c: "Red Door", ab: "Gold + Blue Door", ac: "Gold + Red Door", bc: "Blue + Red Door", abc: "Triune Door",
};
export function doorName(tile: Tile) {
  const id = doorId(tile);
  if (id === "steel") return "Steel Door";
  if (id === "heart") return "Heart Door";
  if (id === "wood") return "Wooden Door";
  // A keyed door that also drains HP: "Blue Heart Door".
  return id.endsWith("h") ? KEY_DOOR_NAMES[id.slice(0, -1) as KeyId].replace(/ Door$/, " Heart Door") : KEY_DOOR_NAMES[id as KeyId];
}
export function doorDescription(tile: Tile) {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return "Opens freely, but drains your HP to 1.";
  if (rule.type === "wood") return `Consumes one available key (gold, then blue, then red). With none, break it down for ${wholeChange(rule.durability)} HP; DEF doesn't help.`;
  if (rule.mode === "any") return "Consumes one available key (gold, then blue, then red).";
  const names = rule.keys.map((key) => KEY_NAMES[key].toLowerCase());
  const keys = `Requires ${names.join(" + ")} ${names.length === 1 ? "key" : "keys"}`;
  return rule.heart ? `${keys}, and drains your HP to 1.` : `${keys}.`;
}
/** The Gold a door opened pays before Gold Bonus: a keyed door its colours'
 * `KEY_GOLD` summed, any other `PICKUP_GOLD`. */
export function doorGold(tile: Tile) {
  const rule = doorRule(tile);
  return rule.type === "keys" && rule.mode === "all" ? rule.keys.reduce((sum, key) => sum + KEY_GOLD[key], 0) : PICKUP_GOLD;
}
/** The Gold an item taken off the floor (`tile`, a torch when null) pays
 * before Gold Bonus: a key or door by its colours, anything else
 * `PICKUP_GOLD`. */
export function pickupGold(tile: Tile | null) {
  if (tile?.kind === "key") return KEY_GOLD[tile.color ?? "yellow"];
  if (tile?.kind === "door") return doorGold(tile);
  return PICKUP_GOLD;
}
/** A Wooden Door's timber. */
export const WOOD_COLOR = "#9a6a3c";
export function doorColor(tile: Tile) {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return "#d98591";
  if (rule.type === "wood") return WOOD_COLOR;
  if (rule.mode === "any" || rule.keys.length !== 1) return "#aeb8c4";
  return COLORS[rule.keys[0]];
}
/** Why a door won't open (a Heart Door always does). */
export function doorBlockedMessage(tile: Tile) {
  const rule = doorRule(tile);
  if (rule.type === "wood") return `Requires any one key, or more than ${wholeChange(rule.durability)} HP to break it down.`;
  if (rule.type === "keys" && rule.mode === "any") return "Requires any one key.";
  return doorDescription(tile).replace(/\.$/, ".");
}
export function area1DoorRule(room: number): DoorRule {
  const rules: DoorRule[] = [
    { type: "keys", keys: ["yellow"], mode: "all" },
    { type: "keys", keys: ["blue"], mode: "all" },
    { type: "keys", keys: ["red"], mode: "all" },
    { type: "keys", keys: ["yellow", "blue"], mode: "all" },
    { type: "keys", keys: ["yellow", "red"], mode: "all" },
    { type: "keys", keys: ["blue", "red"], mode: "all" },
    { type: "keys", keys: KEY_ORDER, mode: "all" },
    { type: "keys", keys: KEY_ORDER, mode: "any" },
    { type: "fullHp" },
  ];
  return rules[Math.max(0, room) % rules.length];
}

const SKELETON_SALT = 0x5c3e7, LOCK_PICK_SALT = 0x10c45, TRANSMUTE_SALT = 0x7a2e5, WOOD_TRANSMUTE_SALT = 0x3d0e1, HEART_PICK_SALT = 0x4ea27;
/** The generated tile `t` at (x, y) on a board generated from `seed`, as a
 * run with `odds` sees it: a Heart Door taking no keys whose tile's fixed
 * number falls under the Wooden Door Transmute chance is a Wooden Door of
 * `durability()` HP; a door taking keys and draining HP under the Heart
 * Lock Pick chance loses its drain, and is remade as below; a Wooden or Steel Door whose tile's fixed number
 * falls under the Gold Door Transmute chance is a Gold Door, keeping any
 * Heart Door's drain; a colour door (keyed, every colour needed)
 * whose tile's fixed number falls under the Skeleton Key chance is a
 * Wooden Door of `durability()` HP, the step's own; else one of two or
 * three colours under the Lock Pick chance loses its rarest colour (red,
 * then blue), keeping any Heart Door's drain. Both by the tile's fixed
 * number, so a higher chance only ever remakes more doors. */
export function withDoorOdds(t: Tile, x: number, y: number, seed: number, odds: DoorOdds | undefined, durability: () => number): Tile {
  if (!odds || t.kind !== "door") return t;
  const rolls = (salt: number, chance = 0) => !!chance && tileRandom(x, y, seed ^ salt) * 100 < chance;
  if (t.door?.type === "fullHp" && rolls(WOOD_TRANSMUTE_SALT, odds.wood)) return { kind: "door", door: { type: "wood", durability: durability() } };
  if (t.door?.type === "keys" && t.door.heart && rolls(HEART_PICK_SALT, odds.heartPick)) t = { ...t, door: { type: "keys", keys: t.door.keys, mode: t.door.mode } };
  const rule = t.door;
  if (odds.transmute && (rule?.type === "wood" || (rule?.type === "keys" && rule.mode === "any")) && tileRandom(x, y, seed ^ TRANSMUTE_SALT) * 100 < odds.transmute)
    return { kind: "door", color: "yellow", door: { type: "keys", keys: ["yellow"], mode: "all", ...(rule.type === "keys" && rule.heart ? { heart: true } : {}) } };
  if (rule?.type !== "keys" || rule.mode !== "all") return t;
  if (odds.skeleton && tileRandom(x, y, seed ^ SKELETON_SALT) * 100 < odds.skeleton) return { kind: "door", door: { type: "wood", durability: durability() } };
  if (rule.keys.length < 2 || !odds.lockPick || tileRandom(x, y, seed ^ LOCK_PICK_SALT) * 100 >= odds.lockPick) return t;
  const rarest = [...KEY_ORDER].reverse().find((key) => rule.keys.includes(key))!, keys = rule.keys.filter((key) => key !== rarest);
  return { ...t, color: t.color && keys.includes(t.color) ? t.color : keys[0], door: { ...rule, keys } };
}
/** `cells` with DOOR's and GOLD DOOR's trees' `odds` remaking their doors (`withDoorOdds`),
 * a Wooden Door made of `durability()` HP; the same map without odds. */
export function withRunDoors(cells: Map<string, Tile>, seed: number, odds: DoorOdds | undefined, durability: (x: number, y: number) => number) {
  if (!odds) return cells;
  const out = new Map<string, Tile>();
  for (const [k, t] of cells) {
    const [x, y] = k.split(",").map(Number);
    out.set(k, withDoorOdds(t, x, y, seed, odds, () => durability(x, y)));
  }
  return out;
}
