import type { UpgradeId, Currency } from "./config.ts";
export type TreeId = "wayfinding" | "inspiration" | "courage" | "legacy" | "wisdom" | "renown";
export type SkillNode = { id: UpgradeId; icon: string; x: number; y: number; requires: UpgradeId[] };
/** A skill tree. Node positions are percentages of the tree's view: x of
 * its width, y of its height, so a tree taller than one screen (`height`,
 * in the same units, 100 by default) scrolls. In a tree of `unlocks`, each
 * skill is bought once (more of it comes from other panels, such as the
 * Archives), so its page shows no ranks. A tree's `gate` is the upgrade
 * that opens it (none: open from the start; null: nothing opens it yet, so
 * only Dev mode shows it, and its skills can't be bought). */
export type SkillTree = { id: TreeId; name: string; currency: Currency; gate?: UpgradeId | null; description: string; height?: number; unlocks?: boolean; nodes: SkillNode[] };
export const TREES: SkillTree[] = [
  { id: "inspiration", name: "Inspiration", currency: "inspiration", description: "Earn Inspiration by beating your best Tower climb.", height: 280, unlocks: true, nodes: [
    // The hand's skills, down to the Archives: Buildout, Training, Critical. Gear and
    // On the Job branch off Buildout, ATK Up and DEF Up under Gear, and Regen, then Heal,
    // below On the Job.
    { id: "combatStance", icon: "▤", x: 50, y: 12, requires: [] },
    { id: "buildout", icon: "⚔", x: 50, y: 30, requires: ["combatStance"] },
    { id: "trainers", icon: "⚔", x: 50, y: 48, requires: ["buildout"] },
    { id: "critical", icon: "✸", x: 50, y: 66, requires: ["trainers"] },
    { id: "largerHand", icon: "▦", x: 80, y: 84, requires: ["trainers"] },
    { id: "gear", icon: "⚒", x: 20, y: 30, requires: ["buildout"] },
    { id: "onTheJob", icon: "¤", x: 80, y: 30, requires: ["buildout"] },
    { id: "regen", icon: "♥", x: 80, y: 48, requires: ["onTheJob"] },
    { id: "cardHeal", icon: "♥", x: 80, y: 66, requires: ["regen"] },
    { id: "archives", icon: "▥", x: 50, y: 84, requires: ["critical"] },
    { id: "cardAtkUp", icon: "⚔", x: 20, y: 48, requires: ["gear"] },
    { id: "cardDefUp", icon: "⛨", x: 20, y: 66, requires: ["cardAtkUp"] },
    // Research needs the Archives, so the skills that open it come after them:
    // Blue Key below DEF Up, Rehearsed steps and Faster Trainers either side of
    // Into the depths, and Pocket Money (then Spare Change) and Shroud after it,
    // either side of the core path down the middle (Key Siphon, then Buy Quantity). Greater
    // Heal stands under Shroud, Recovery and Regen Research (then Revive) under it.
    { id: "cardBlueKey", icon: "⚿", x: 20, y: 84, requires: ["archives"] },
    { id: "inspirationUndos", icon: "↺", x: 20, y: 106, requires: ["archives"] },
    { id: "delve", icon: "▼", x: 50, y: 106, requires: ["archives"] },
    { id: "fasterTrainers", icon: "»", x: 80, y: 106, requires: ["archives"] },
    { id: "pocketMoney", icon: "¤", x: 26, y: 124, requires: ["delve"] },
    { id: "shroud", icon: "◈", x: 74, y: 124, requires: ["delve"] },
    { id: "keySiphon", icon: "⚿", x: 50, y: 124, requires: ["delve"] },
    { id: "buyQuantity", icon: "×", x: 50, y: 142, requires: ["keySiphon"] },
    { id: "spareChange", icon: "¤", x: 26, y: 142, requires: ["pocketMoney"] },
    { id: "wealthy", icon: "¤", x: 14, y: 160, requires: ["spareChange"] },
    { id: "loot", icon: "☠", x: 38, y: 160, requires: ["spareChange"] },
    { id: "wishingWell", icon: "◎", x: 26, y: 178, requires: ["spareChange"] },
    { id: "greaterHeal", icon: "✚", x: 80, y: 142, requires: ["shroud"] },
    { id: "recovery", icon: "✦", x: 70, y: 160, requires: ["greaterHeal"] },
    { id: "findPotion", icon: "⚗", x: 70, y: 178, requires: ["recovery"] },
    { id: "regenResearch", icon: "♥", x: 90, y: 160, requires: ["greaterHeal"] },
    { id: "revive", icon: "☼", x: 90, y: 178, requires: ["regenResearch"] },
    // The cards down the middle under Buy Quantity: Yellow Door, Heart Door
    // Resilience (Heart Door to its left), Weak Enemy (Base, then Strong, to its left; Elite, then Boss, to its
    // right), Chest, BK Siphon (BK Trader, then YK to HP, to its left; Red
    // Key, then RK Siphon, to its right) and Floor Skip Reward (Torch to its
    // left, Steel Door to its right).
    { id: "cardYellowDoor", icon: "⚿", x: 50, y: 178, requires: ["buyQuantity"] },
    { id: "heartDoorResilience", icon: "♥", x: 50, y: 196, requires: ["cardYellowDoor"] },
    { id: "cardHeartDoor", icon: "♥", x: 30, y: 196, requires: ["heartDoorResilience"] },
    { id: "cardWeakEnemy", icon: "☠", x: 50, y: 214, requires: ["heartDoorResilience"] },
    { id: "cardBaseEnemy", icon: "☠", x: 30, y: 214, requires: ["cardWeakEnemy"] },
    { id: "cardStrongEnemy", icon: "☠", x: 10, y: 214, requires: ["cardBaseEnemy"] },
    { id: "cardEliteEnemy", icon: "☠", x: 70, y: 214, requires: ["cardWeakEnemy"] },
    { id: "cardBossEnemy", icon: "☠", x: 90, y: 214, requires: ["cardEliteEnemy"] },
    { id: "cardChest", icon: "▣", x: 50, y: 232, requires: ["cardWeakEnemy"] },
    { id: "blueSiphon", icon: "⚿", x: 50, y: 250, requires: ["cardChest"] },
    { id: "blueTrader", icon: "⚿", x: 30, y: 250, requires: ["blueSiphon"] },
    { id: "keyToHp", icon: "♥", x: 10, y: 250, requires: ["blueTrader"] },
    { id: "cardRedKey", icon: "⚿", x: 70, y: 250, requires: ["blueSiphon"] },
    { id: "redSiphon", icon: "⚿", x: 90, y: 250, requires: ["cardRedKey"] },
    { id: "floorSkipReward", icon: "↷", x: 50, y: 268, requires: ["blueSiphon"] },
    { id: "cardTorch", icon: "☼", x: 30, y: 268, requires: ["floorSkipReward"] },
    { id: "cardWoodenDoor", icon: "⚿", x: 70, y: 268, requires: ["floorSkipReward"] },
  ] },
  { id: "courage", name: "Courage", currency: "courage", gate: "delve", description: "Earn Courage by beating your best Delve depth.", height: 198, nodes: [
    { id: "moveSpeed", icon: "»", x: 50, y: 10, requires: ["delve"] },
    { id: "instantCombat", icon: "↯", x: 18, y: 10, requires: ["moveSpeed"] },
    { id: "extraKey", icon: "⚿", x: 82, y: 10, requires: ["moveSpeed"] },
    { id: "pathfinder", icon: "⌖", x: 18, y: 34, requires: ["moveSpeed"] },
    { id: "focus", icon: "ϟ", x: 50, y: 34, requires: ["moveSpeed"] },
    { id: "rush", icon: "⇶", x: 82, y: 34, requires: ["moveSpeed"] },
    { id: "undos", icon: "↺", x: 23, y: 61, requires: ["pathfinder"] },
    { id: "cardBadges", icon: "◪", x: 70, y: 61, requires: ["focus"] },
    // The research skills down the middle under Focus: Find Yellow Key, Key
    // Efficiency, then Interest, with Max Interest to its left and Mug to its right.
    { id: "findYellowKey", icon: "⚿", x: 50, y: 87, requires: ["focus"] },
    { id: "keyEfficiency", icon: "⚿", x: 50, y: 111, requires: ["findYellowKey"] },
    { id: "interest", icon: "¤", x: 50, y: 135, requires: ["keyEfficiency"] },
    { id: "maxInterest", icon: "¤", x: 22, y: 135, requires: ["interest"] },
    { id: "mug", icon: "☠", x: 78, y: 135, requires: ["interest"] },
    // The run's charges under them: Refocus, Ignore and Target, each
    // Ignore and Target with the skill that regains it below.
    { id: "refocus", icon: "ϟ", x: 22, y: 161, requires: ["maxInterest"] },
    { id: "ignore", icon: "⊘", x: 50, y: 161, requires: ["interest"] },
    { id: "target", icon: "⌖", x: 78, y: 161, requires: ["mug"] },
    { id: "ignoreMore", icon: "⊘", x: 50, y: 185, requires: ["ignore"] },
    { id: "targetMore", icon: "⌖", x: 78, y: 185, requires: ["target"] },
  ] },
  { id: "wayfinding", name: "Wayfinding", currency: "courage", gate: null, description: "Teach Delve Automove to explore, compare routes and preserve resources.", nodes: [
    { id: "aiMemory", icon: "◇", x: 50, y: 20, requires: [] },
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
  return !!node && treeOpen(tree!, levels) && node.requires.every(key => levels[key] > 0);
}
/** Whether `tree`'s gate is owned (or it has none). */
export function treeOpen(tree: SkillTree, levels: Record<UpgradeId, number>) {
  return tree.gate === undefined || (tree.gate !== null && levels[tree.gate] > 0);
}
/** How tall `tree` is, in view heights × 100. */
export const treeHeight = (tree: SkillTree) => tree.height ?? 100;
/** The least distance across, in percent of the width, between two of
 * `tree`'s nodes in one row (100 when no row holds two): how wide a node's
 * name may be. */
export function columnGap(tree: SkillTree) {
  let gap = 100;
  for (const a of tree.nodes) for (const b of tree.nodes)
    if (a !== b && a.y === b.y) gap = Math.min(gap, Math.abs(a.x - b.x));
  return gap;
}
/** `tree`'s nodes placed on its map: y as a percentage of the map's height. */
export const mapNodes = (tree: SkillTree): SkillNode[] =>
  tree.nodes.map((n) => ({ ...n, y: (n.y * 100) / treeHeight(tree) }));
