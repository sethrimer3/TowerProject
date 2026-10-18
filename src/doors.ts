import { snap } from "./exact.ts";
import { COLORS, KEY_GOLD, PICKUP_GOLD } from "./config.ts";
import type { DoorRule, Player, Tile, KeyColor } from "./entities.ts";
import { wholeChange } from "./whole.ts";

export const KEY_ORDER: KeyColor[] = ["yellow", "blue", "red"];
export const KEY_NAMES: Record<KeyColor, string> = { yellow: "Gold", blue: "Azure", red: "Crimson" };
type KeyId = "a" | "b" | "c" | "ab" | "ac" | "bc" | "abc";
/** Each door's art: its keys' letters (a yellow, b blue, c red), with `h`
 * after them on a door that also drains HP to 1. */
export type DoorId = KeyId | `${KeyId}h` | "steel" | "heart" | "wood";

/** What a door asks for, opened or broken by `player`. */
type Opener = Pick<Player, "keys"> & { hp?: number };

export function doorRule(tile: Tile): DoorRule {
  return tile.door ?? { type: "keys", keys: [tile.color ?? "yellow"], mode: "all" };
}
/** The cheapest key held, at `need` of a key: gold, then azure, then crimson. */
const cheapestKey = (keys: KeyColor[], player: Opener, need: number) =>
  KEY_ORDER.find((color) => keys.includes(color) && player.keys[color] >= need);
/** The HP breaking a Wooden Door takes, under a badge's `scale`. */
export const woodToll = (rule: { durability: number }, scale = 1) => snap(rule.durability * scale);

/** Returns the exact keys that would be consumed, or null when the door won't
 * open. Any-key steel locks use a stable gold/azure/crimson priority so their
 * behavior is predictable. A Heart Door takes no keys and always opens: it
 * drains HP instead (`resolveStep`). A Wooden Door takes the cheapest key
 * held, or none when the hero has none and would survive breaking it
 * (`tollScale` scaling its durability); a caller that passes no HP (the
 * floor analyzer) counts it as breakable. */
export function doorCost(tile: Tile, player: Opener, scale = 1, tollScale = scale): KeyColor[] | null {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return [];
  // Keys may be fractional (Effective, Dampen): each colour the door takes
  // needs a whole key, or `scale` of one, held.
  const need = scale === 1 ? 1 : snap(scale);
  if (rule.type === "wood") {
    const key = cheapestKey(KEY_ORDER, player, need);
    if (key) return [key];
    return player.hp === undefined || player.hp > woodToll(rule, tollScale) ? [] : null;
  }
  if (rule.mode === "any") {
    const key = cheapestKey(rule.keys, player, need);
    return key ? [key] : null;
  }
  return rule.keys.every((color) => player.keys[color] >= need) ? [...rule.keys] : null;
}
/** Whether opening the door drains the hero's HP to 1: a Heart Door, or a
 * keyed door that is also one. */
export const drainsHp = (rule: DoorRule) => rule.type === "fullHp" || (rule.type === "keys" && !!rule.heart);

/** A single yellow door, YELLOW DOOR's: one yellow key, a Heart Door's drain or not. */
export function isYellowDoor(tile: Tile) {
  const rule = doorRule(tile);
  return rule.type === "keys" && rule.mode === "all" && rule.keys.length === 1 && rule.keys[0] === "yellow";
}
/** The doors the door cards make cheaper while held (`CardBonus.door`), and
 * the percent less each costs: a single yellow door's key (YELLOW DOOR), the
 * HP a door draining HP takes (HEART DOOR), and a Wooden Door's key and the
 * HP breaking it takes (WOODEN DOOR). */
export type DoorKind = "yellow" | "heart" | "wood";
/** The percent less each kind costs, and `all`, the percent less every door
 * costs (DOOR's tree: its keys and any HP it takes), which adds into a
 * kind's own as one card factor. */
export type DoorDiscounts = Partial<Record<DoorKind | "all", number>>;
/** What `off` multiplies the door `tile`'s keys and its HP toll by: 1 for
 * each it leaves alone. */
export function doorDiscount(tile: Tile, off?: DoorDiscounts): { keys: number; toll: number } {
  if (!off) return { keys: 1, toll: 1 };
  const rule = doorRule(tile), all = off.all ?? 0, less = (percent = 0) => (100 - percent - all) / 100;
  if (rule.type === "wood") return { keys: less(off.wood), toll: less(off.wood) };
  return { keys: less(isYellowDoor(tile) ? off.yellow : 0), toll: drainsHp(rule) ? less(off.heart) : 1 };
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
  a: "Gold Door", b: "Azure Door", c: "Crimson Door", ab: "Gold + Azure Door", ac: "Gold + Crimson Door", bc: "Azure + Crimson Door", abc: "Triune Door",
};
export function doorName(tile: Tile) {
  const id = doorId(tile);
  if (id === "steel") return "Steel Door";
  if (id === "heart") return "Heart Door";
  if (id === "wood") return "Wooden Door";
  // A keyed door that also drains HP: "Azure Heart Door".
  return id.endsWith("h") ? KEY_DOOR_NAMES[id.slice(0, -1) as KeyId].replace(/ Door$/, " Heart Door") : KEY_DOOR_NAMES[id as KeyId];
}
export function doorDescription(tile: Tile) {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return "Opens freely, but drains your HP to 1.";
  if (rule.type === "wood") return `Consumes one available key (gold, then azure, then crimson). With none, break it down for ${wholeChange(rule.durability)} HP; DEF doesn't help.`;
  if (rule.mode === "any") return "Consumes one available key (gold, then azure, then crimson).";
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
