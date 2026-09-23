import { COLORS, type KeyColor } from "./config.ts";
import type { DoorRule, Player, Tile } from "./entities.ts";

export const KEY_ORDER: KeyColor[] = ["yellow", "blue", "red"];
export const KEY_NAMES: Record<KeyColor, string> = { yellow: "Amber", blue: "Azure", red: "Crimson" };
export type DoorId = "a" | "b" | "c" | "ab" | "ac" | "bc" | "abc" | "steel" | "heart";

export function doorRule(tile: Tile): DoorRule {
  return tile.door ?? { type: "keys", keys: [tile.color ?? "yellow"], mode: "all" };
}
export function requiredKeys(rule: DoorRule): KeyColor[] {
  return rule.type === "keys" ? [...rule.keys] : [];
}
/** Returns the exact keys that would be consumed. Any-key steel locks use a
 * stable amber/azure/crimson priority so their behavior is predictable. */
export function doorCost(tile: Tile, player: Pick<Player, "keys" | "hp" | "maxHp">): KeyColor[] | null {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return player.hp === player.maxHp ? [] : null;
  if (rule.mode === "any") {
    const key = KEY_ORDER.find((color) => rule.keys.includes(color) && player.keys[color] > 0);
    return key ? [key] : null;
  }
  return rule.keys.every((color) => player.keys[color] > 0) ? [...rule.keys] : null;
}
export function doorId(tile: Tile): DoorId {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return "heart";
  if (rule.mode === "any") return "steel";
  const letters = KEY_ORDER.filter((key) => rule.keys.includes(key)).map((key) => ({ yellow: "a", blue: "b", red: "c" })[key]).join("");
  return (letters || "a") as DoorId;
}
export function doorName(tile: Tile) {
  const id = doorId(tile);
  return ({ a: "Amber Door", b: "Azure Door", c: "Crimson Door", ab: "Amber + Azure Door", ac: "Amber + Crimson Door", bc: "Azure + Crimson Door", abc: "Triune Door", steel: "Steel Door", heart: "Heart Door" } as const)[id];
}
export function doorDescription(tile: Tile) {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return "Opens freely while HP is full.";
  if (rule.mode === "any") return "Consumes one available key (amber, then azure, then crimson).";
  const names = rule.keys.map((key) => KEY_NAMES[key].toLowerCase());
  return `Requires ${names.join(" + ")} ${names.length === 1 ? "key" : "keys"}.`;
}
export function doorColor(tile: Tile) {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return "#d98591";
  if (rule.mode === "any" || rule.keys.length !== 1) return "#aeb8c4";
  return COLORS[rule.keys[0]];
}
export function doorBlockedMessage(tile: Tile) {
  const rule = doorRule(tile);
  if (rule.type === "fullHp") return "Requires full HP.";
  if (rule.mode === "any") return "Requires any one key.";
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
