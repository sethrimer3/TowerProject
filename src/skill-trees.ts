import type { UpgradeId, Currency } from "./config.ts";
export type TreeId = "wayfinding" | "inspiration" | "courage" | "legacy" | "wisdom" | "renown";
export type SkillNode = { id: UpgradeId; icon: string; x: number; y: number; requires: UpgradeId[] };
/** A skill tree. Node positions are percentages of the tree's view: x of
 * its width, y of its height, so a tree taller than one screen (`height`,
 * in the same units, 100 by default) scrolls. In a tree of `unlocks`, each
 * skill is bought once (more of it comes from other panels, such as the
 * Archives), so its page shows no ranks. */
export type SkillTree = { id: TreeId; name: string; currency: Currency; gate?: UpgradeId; description: string; height?: number; unlocks?: boolean; nodes: SkillNode[] };
export const TREES: SkillTree[] = [
  { id: "inspiration", name: "Inspiration", currency: "inspiration", description: "Earn Inspiration by beating your best Tower climb.", height: 172, unlocks: true, nodes: [
    // The hand's skills, down to Focus; Gear and Heal branch off Buildout,
    // Training off Larger Hand.
    { id: "handOrdering", icon: "▤", x: 50, y: 12, requires: [] },
    { id: "combatStance", icon: "⚔", x: 50, y: 30, requires: ["handOrdering"] },
    { id: "largerHand", icon: "▦", x: 50, y: 48, requires: ["combatStance"] },
    { id: "gear", icon: "⚒", x: 20, y: 48, requires: ["combatStance"] },
    { id: "cardHeal", icon: "♥", x: 80, y: 48, requires: ["combatStance"] },
    { id: "focus", icon: "ϟ", x: 50, y: 66, requires: ["largerHand"] },
    { id: "training", icon: "⚔", x: 78, y: 66, requires: ["largerHand"] },
    { id: "cardGear", icon: "⛨", x: 14, y: 88, requires: ["focus"] },
    { id: "inspirationUndos", icon: "↺", x: 38, y: 88, requires: ["focus"] },
    { id: "archives", icon: "▥", x: 62, y: 88, requires: ["focus"] },
    { id: "delve", icon: "▼", x: 86, y: 88, requires: ["focus"] },
    // Research needs the Archives, so the skills that open it come after them.
    { id: "spareChange", icon: "¤", x: 14, y: 106, requires: ["archives"] },
    { id: "blueKey", icon: "⚿", x: 38, y: 106, requires: ["archives"] },
    { id: "fasterTrainers", icon: "»", x: 62, y: 106, requires: ["archives"] },
    { id: "greaterHeal", icon: "✚", x: 86, y: 106, requires: ["archives"] },
    { id: "wealthy", icon: "¤", x: 9, y: 124, requires: ["spareChange"] },
    { id: "loot", icon: "☠", x: 27, y: 124, requires: ["spareChange"] },
    { id: "wishingWell", icon: "◎", x: 18, y: 142, requires: ["spareChange"] },
    { id: "recovery", icon: "✦", x: 74, y: 124, requires: ["greaterHeal"] },
    { id: "findPotion", icon: "⚗", x: 74, y: 142, requires: ["recovery"] },
    { id: "shroud", icon: "◈", x: 92, y: 124, requires: ["greaterHeal"] },
    { id: "revive", icon: "☼", x: 92, y: 142, requires: ["shroud"] },
  ] },
  { id: "courage", name: "Courage", currency: "courage", gate: "delve", description: "Earn Courage by beating your best Delve depth.", nodes: [
    { id: "moveSpeed", icon: "»", x: 50, y: 10, requires: ["delve"] },
    { id: "extraKey", icon: "⚿", x: 82, y: 10, requires: ["moveSpeed"] },
    { id: "hp", icon: "♥", x: 18, y: 34, requires: ["moveSpeed"] },
    { id: "attack", icon: "⚔", x: 50, y: 34, requires: ["moveSpeed"] },
    { id: "defense", icon: "⛨", x: 82, y: 34, requires: ["moveSpeed"] },
    { id: "undos", icon: "↺", x: 23, y: 61, requires: ["hp"] },
    { id: "legacy", icon: "♜", x: 50, y: 87, requires: ["attack", "undos"] },
  ] },
  { id: "wayfinding", name: "Wayfinding", currency: "courage", gate: "moveSpeed", description: "Teach Delve Automove to explore, compare routes and preserve resources.", nodes: [
    { id: "aiMemory", icon: "◇", x: 50, y: 20, requires: ["moveSpeed"] },
    { id: "aiEvaluation", icon: "⚖", x: 25, y: 52, requires: ["aiMemory"] },
    { id: "aiLookahead", icon: "✧", x: 75, y: 78, requires: ["aiMemory"] },
  ] },
  { id: "legacy", name: "Legacy", currency: "courage", gate: "legacy", description: "Spend Courage on heirlooms carried into every new run.", nodes: [
    { id: "quality", icon: "♜", x: 50, y: 15, requires: ["legacy"] },
    { id: "yellow", icon: "⚿", x: 23, y: 40, requires: ["quality"] },
    { id: "blue", icon: "⚿", x: 77, y: 65, requires: ["yellow"] },
    { id: "red", icon: "⚿", x: 50, y: 87, requires: ["blue"] },
  ] },
  { id: "wisdom", name: "Wisdom", currency: "inspiration", gate: "legacy", description: "A path awaiting its final purpose.", nodes: [
    { id: "wisdomFocus", icon: "◈", x: 50, y: 20, requires: ["legacy"] },
    { id: "wisdomMemory", icon: "◇", x: 28, y: 52, requires: ["wisdomFocus"] },
    { id: "wisdomSight", icon: "✧", x: 72, y: 78, requires: ["wisdomMemory"] },
  ] },
  { id: "renown", name: "Renown", currency: "courage", gate: "legacy", description: "A path awaiting its final purpose.", nodes: [
    { id: "renownBanner", icon: "⚑", x: 50, y: 18, requires: ["legacy"] },
    { id: "renownOath", icon: "◆", x: 72, y: 50, requires: ["renownBanner"] },
    { id: "renownCrown", icon: "♛", x: 38, y: 80, requires: ["renownOath"] },
  ] },
];
export function skillAvailable(id: UpgradeId, levels: Record<UpgradeId, number>) {
  const tree = TREES.find(t => t.nodes.some(n => n.id === id));
  const node = tree?.nodes.find(n => n.id === id);
  return !!node && (!tree?.gate || levels[tree.gate] > 0) && node.requires.every(key => levels[key] > 0);
}
/** How tall `tree` is, in view heights × 100. */
export const treeHeight = (tree: SkillTree) => tree.height ?? 100;
/** `tree`'s nodes placed on its map: y as a percentage of the map's height. */
export const mapNodes = (tree: SkillTree): SkillNode[] =>
  tree.nodes.map((n) => ({ ...n, y: (n.y * 100) / treeHeight(tree) }));
