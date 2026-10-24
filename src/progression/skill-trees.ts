import type { UpgradeId, Currency } from "./upgrades.ts";
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
  { id: "inspiration", name: "Inspiration", currency: "inspiration", description: "Earn Inspiration by beating your best Tower climb.", height: 588, unlocks: true, nodes: [
    // A new game's first skills down the middle: Door & Key, Enemy, then
    // Auto-Climb, each a row above the next.
    { id: "cardDoorKey", icon: "⚿", x: 50, y: 12, requires: [] },
    { id: "cardEnemy", icon: "☠", x: 50, y: 30, requires: ["cardDoorKey"] },
    { id: "autoClimb", icon: "»", x: 50, y: 48, requires: ["cardEnemy"] },
    // The hand's skills, down to the Archives: Buildout, Trainers (two rows
    // lower), Shroud, Critical (with Critical Prediction to its left). Gold Key and On the Job branch off
    // Buildout: ATK Up, then DEF Up, under Gold Key, each with its provision
    // (Whetstone, Aegis Charm) to its right, and Regen below On the Job, with
    // Heal and the Traveler's Elixir under it.
    { id: "combatStance", icon: "▤", x: 50, y: 66, requires: ["autoClimb"] },
    { id: "buildout", icon: "⚔", x: 50, y: 84, requires: ["combatStance"] },
    { id: "trainers", icon: "⚔", x: 50, y: 120, requires: ["buildout"] },
    { id: "shroud", icon: "◈", x: 50, y: 138, requires: ["trainers"] },
    { id: "critical", icon: "✸", x: 50, y: 156, requires: ["shroud"] },
    { id: "critPrediction", icon: "✸", x: 30, y: 156, requires: ["critical"] },
    { id: "largerHand", icon: "▦", x: 80, y: 138, requires: ["trainers"] },
    { id: "onTheJob", icon: "¤", x: 80, y: 84, requires: ["buildout"] },
    { id: "regen", icon: "♥", x: 80, y: 102, requires: ["onTheJob"] },
    { id: "cardHeal", icon: "♥", x: 70, y: 120, requires: ["regen"] },
    { id: "elixirProvision", icon: "⚗", x: 90, y: 120, requires: ["regen"] },
    { id: "archives", icon: "▥", x: 50, y: 174, requires: ["critical"] },
    { id: "cardYellowKey", icon: "⚿", x: 20, y: 84, requires: ["buildout"] },
    { id: "cardAtkUp", icon: "⚔", x: 10, y: 102, requires: ["cardYellowKey"] },
    { id: "whetstoneProvision", icon: "⚔", x: 30, y: 102, requires: ["cardAtkUp"] },
    { id: "cardDefUp", icon: "⛨", x: 10, y: 120, requires: ["cardAtkUp"] },
    { id: "aegisProvision", icon: "⛨", x: 30, y: 120, requires: ["cardDefUp"] },
    // Research needs the Archives, so the skills that open it come after them:
    // Blue Key and Faster Trainers either side of the Archives, Rehearsed steps
    // left of Into the depths, and Pocket Money (then Spare Change, Wishing
    // Well and Free Training below it) and Greater Heal after it,
    // either side of the core path down the middle (Lifesteal, Buy Quantity, Thorns, then GK Siphon).
    // Recovery and Regen Research (then Parry, then Revive) stand under Greater Heal.
    { id: "cardBlueKey", icon: "⚿", x: 20, y: 174, requires: ["archives"] },
    { id: "inspirationUndos", icon: "↺", x: 20, y: 196, requires: ["archives"] },
    { id: "delve", icon: "▼", x: 50, y: 196, requires: ["archives"] },
    { id: "fasterTrainers", icon: "»", x: 80, y: 174, requires: ["archives"] },
    { id: "pocketMoney", icon: "¤", x: 20, y: 214, requires: ["delve"] },
    { id: "lifesteal", icon: "♥", x: 50, y: 214, requires: ["delve"] },
    { id: "buyQuantity", icon: "×", x: 50, y: 232, requires: ["lifesteal"] },
    { id: "thorns", icon: "✥", x: 50, y: 250, requires: ["buyQuantity"] },
    { id: "keySiphon", icon: "⚿", x: 50, y: 268, requires: ["thorns"] },
    { id: "spareChange", icon: "¤", x: 20, y: 232, requires: ["pocketMoney"] },
    { id: "wealthy", icon: "¤", x: 10, y: 250, requires: ["spareChange"] },
    { id: "loot", icon: "☠", x: 30, y: 250, requires: ["spareChange"] },
    { id: "wishingWell", icon: "◎", x: 20, y: 268, requires: ["spareChange"] },
    { id: "freeTraining", icon: "↑", x: 20, y: 286, requires: ["wishingWell"] },
    { id: "greaterHeal", icon: "✚", x: 80, y: 214, requires: ["delve"] },
    { id: "recovery", icon: "✦", x: 70, y: 232, requires: ["greaterHeal"] },
    { id: "findPotion", icon: "⚗", x: 70, y: 250, requires: ["recovery"] },
    { id: "regenResearch", icon: "♥", x: 90, y: 232, requires: ["greaterHeal"] },
    { id: "parry", icon: "⇋", x: 90, y: 250, requires: ["regenResearch"] },
    { id: "revive", icon: "☼", x: 90, y: 268, requires: ["parry"] },
    // The cards down the middle, a row clear of GK Siphon: Gold Door (Key < Badges,
    // then Key ≥ Badges, to its right; Heart Door Resilience, then Heart Door, to its
    // left), Weak Enemy (Base, then Strong, to its left, Fast under Base; Elite, then Boss, to its
    // right, Non-Boss under Boss), Chest, BK Siphon (BK Trader, then GK to HP, to its left; Red
    // Key, then RK Siphon, to its right) and Floor Skip Reward (Torch to its
    // left, Steel Door to its right).
    { id: "cardYellowDoor", icon: "⚿", x: 50, y: 322, requires: ["keySiphon"] },
    { id: "keyLessBadges", icon: "⚿", x: 70, y: 322, requires: ["cardYellowDoor"] },
    { id: "keyAtLeastBadges", icon: "⚿", x: 90, y: 322, requires: ["keyLessBadges"] },
    { id: "heartDoorResilience", icon: "♥", x: 30, y: 322, requires: ["cardYellowDoor"] },
    { id: "cardHeartDoor", icon: "♥", x: 10, y: 322, requires: ["heartDoorResilience"] },
    { id: "cardWeakEnemy", icon: "☠", x: 50, y: 340, requires: ["cardYellowDoor"] },
    { id: "cardBaseEnemy", icon: "☠", x: 30, y: 340, requires: ["cardWeakEnemy"] },
    { id: "cardStrongEnemy", icon: "☠", x: 10, y: 340, requires: ["cardBaseEnemy"] },
    { id: "cardEliteEnemy", icon: "☠", x: 70, y: 340, requires: ["cardWeakEnemy"] },
    { id: "cardBossEnemy", icon: "☠", x: 90, y: 340, requires: ["cardEliteEnemy"] },
    { id: "cardNonBossEnemy", icon: "☠", x: 90, y: 358, requires: ["cardBossEnemy"] },
    { id: "cardFastEnemy", icon: "☠", x: 30, y: 358, requires: ["cardBaseEnemy"] },
    { id: "cardChest", icon: "▣", x: 50, y: 358, requires: ["cardWeakEnemy"] },
    { id: "blueSiphon", icon: "⚿", x: 50, y: 376, requires: ["cardChest"] },
    { id: "blueTrader", icon: "⚿", x: 30, y: 376, requires: ["blueSiphon"] },
    { id: "keyToHp", icon: "♥", x: 10, y: 376, requires: ["blueTrader"] },
    { id: "cardRedKey", icon: "⚿", x: 70, y: 376, requires: ["blueSiphon"] },
    { id: "redSiphon", icon: "⚿", x: 90, y: 376, requires: ["cardRedKey"] },
    { id: "floorSkipReward", icon: "↷", x: 50, y: 394, requires: ["blueSiphon"] },
    { id: "cardTorch", icon: "☼", x: 30, y: 394, requires: ["floorSkipReward"] },
    { id: "cardWoodenDoor", icon: "⚿", x: 70, y: 394, requires: ["floorSkipReward"] },
    // Limit Break 1 to 10 straight down under Torch, each requiring the one before.
    { id: "limitBreak1", icon: "⇑", x: 30, y: 412, requires: ["cardTorch"] },
    { id: "limitBreak2", icon: "⇑", x: 30, y: 430, requires: ["limitBreak1"] },
    { id: "limitBreak3", icon: "⇑", x: 30, y: 448, requires: ["limitBreak2"] },
    { id: "limitBreak4", icon: "⇑", x: 30, y: 466, requires: ["limitBreak3"] },
    { id: "limitBreak5", icon: "⇑", x: 30, y: 484, requires: ["limitBreak4"] },
    { id: "limitBreak6", icon: "⇑", x: 30, y: 502, requires: ["limitBreak5"] },
    { id: "limitBreak7", icon: "⇑", x: 30, y: 520, requires: ["limitBreak6"] },
    { id: "limitBreak8", icon: "⇑", x: 30, y: 538, requires: ["limitBreak7"] },
    { id: "limitBreak9", icon: "⇑", x: 30, y: 556, requires: ["limitBreak8"] },
    { id: "limitBreak10", icon: "⇑", x: 30, y: 574, requires: ["limitBreak9"] },
  ] },
  { id: "courage", name: "Courage", currency: "courage", gate: "delve", description: "Earn Courage by beating your best Delve depth.", height: 198, nodes: [
    { id: "moveSpeed", icon: "»", x: 50, y: 10, requires: ["delve"] },
    { id: "instantCombat", icon: "↯", x: 18, y: 10, requires: ["moveSpeed"] },
    { id: "extraKey", icon: "⚿", x: 82, y: 10, requires: ["moveSpeed"] },
    { id: "pathfinder", icon: "⌖", x: 18, y: 34, requires: ["moveSpeed"] },
    { id: "bombs", icon: "✹", x: 50, y: 34, requires: ["moveSpeed"] },
    { id: "dash", icon: "⇶", x: 82, y: 34, requires: ["moveSpeed"] },
    // Dash's own skills down the right edge: End Rush, Dash Regen, then Dash Badge.
    { id: "endRush", icon: "⇶", x: 90, y: 61, requires: ["dash"] },
    { id: "dashRegen", icon: "⇶", x: 90, y: 87, requires: ["endRush"] },
    { id: "dashBadge", icon: "◪", x: 90, y: 111, requires: ["dashRegen", "cardBadges"] },
    { id: "undos", icon: "↺", x: 23, y: 61, requires: ["pathfinder"] },
    { id: "cardBadges", icon: "◪", x: 56, y: 61, requires: ["bombs"] },
    // The research skills down the middle under Bombs: Find Gold Key, Key
    // Efficiency, then Interest, with Max Interest to its left and Mug to its right.
    { id: "findYellowKey", icon: "⚿", x: 50, y: 87, requires: ["bombs"] },
    { id: "keyEfficiency", icon: "⚿", x: 50, y: 111, requires: ["findYellowKey"] },
    { id: "interest", icon: "¤", x: 50, y: 135, requires: ["keyEfficiency"] },
    { id: "maxInterest", icon: "¤", x: 22, y: 135, requires: ["interest"] },
    { id: "mug", icon: "☠", x: 78, y: 135, requires: ["interest"] },
    // Overheal under Max Interest, then the run's charges: Ignore and
    // Target, each with the skill that regains it below.
    { id: "overheal", icon: "♥", x: 22, y: 161, requires: ["maxInterest"] },
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
