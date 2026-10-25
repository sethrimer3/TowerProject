import type { UpgradeId, Currency } from "./upgrades.ts";
export type TreeId = "wayfinding" | "inspiration" | "breakthrough" | "legacy" | "wisdom" | "renown";
/** A node with `reveal` stays hidden, with every node that requires it,
 * until that upgrade is owned: unseen, it can't be read or bought. */
export type SkillNode = { id: UpgradeId; icon: string; x: number; y: number; requires: UpgradeId[]; reveal?: UpgradeId };
/** A skill tree. Node positions are percentages of the tree's view: x of
 * its width, y of its height, so a tree taller than one screen (`height`,
 * in the same units, 100 by default) scrolls. In a tree of `unlocks`, each
 * skill is bought once (more of it comes from other panels, such as the
 * Archives), so its page shows no ranks. A tree's `gate` is the upgrade
 * that opens it (none: open from the start; null: nothing opens it yet, so
 * only Dev mode shows it, and its skills can't be bought). */
export type SkillTree = { id: TreeId; name: string; currency: Currency; gate?: UpgradeId | null; description: string; height?: number; unlocks?: boolean; nodes: SkillNode[] };
export const TREES: SkillTree[] = [
  { id: "inspiration", name: "Inspiration", currency: "inspiration", description: "Earn Inspiration by beating your best Tower climb.", height: 444, unlocks: true, nodes: [
    // A new game's first skills down the middle: Door & Key, Enemy, then
    // Auto-Climb, each a row above the next.
    { id: "cardDoorKey", icon: "⚿", x: 50, y: 12, requires: [] },
    { id: "cardEnemy", icon: "☠", x: 50, y: 30, requires: ["cardDoorKey"] },
    { id: "autoClimb", icon: "»", x: 50, y: 48, requires: ["cardEnemy"] },
    // The hand's skills, down to Breakthrough: Buildout, Trainers, Larger
    // Hand, Shroud (with Gold Key, then Blue Key, to its left), Critical (with
    // Critical Prediction, then Bombs, to its left and Faster Trainers to its right). ATK
    // Up branches left off Trainers, with DEF Up under it, each with its
    // provision (Vanguard Banner, Aegis Charm) to its left, and On the Job
    // right off Trainers, with Regen below it and Heal and the Traveler's
    // Elixir under that. The skills after Trainers stay hidden until it is
    // owned, so a new game's first skills run in one line.
    { id: "combatStance", icon: "▤", x: 50, y: 66, requires: ["autoClimb"] },
    { id: "buildout", icon: "⚔", x: 50, y: 84, requires: ["combatStance"] },
    { id: "trainers", icon: "⚔", x: 50, y: 102, requires: ["buildout"] },
    { id: "largerHand", icon: "▦", x: 50, y: 120, requires: ["trainers"], reveal: "trainers" },
    { id: "shroud", icon: "◈", x: 50, y: 138, requires: ["largerHand"] },
    { id: "critical", icon: "✸", x: 50, y: 156, requires: ["shroud"] },
    { id: "critPrediction", icon: "✸", x: 30, y: 156, requires: ["critical"] },
    { id: "bombs", icon: "✹", x: 10, y: 156, requires: ["critPrediction"] },
    { id: "fasterTrainers", icon: "»", x: 70, y: 156, requires: ["critical"] },
    { id: "onTheJob", icon: "¤", x: 80, y: 102, requires: ["trainers"], reveal: "trainers" },
    { id: "regen", icon: "♥", x: 80, y: 120, requires: ["onTheJob"] },
    { id: "cardHeal", icon: "♥", x: 70, y: 138, requires: ["regen"] },
    { id: "elixirProvision", icon: "⚗", x: 90, y: 138, requires: ["regen"] },
    { id: "breakthrough", icon: "▼", x: 50, y: 174, requires: ["critical"] },
    { id: "cardYellowKey", icon: "⚿", x: 30, y: 138, requires: ["shroud"] },
    { id: "cardBlueKey", icon: "⚿", x: 10, y: 138, requires: ["cardYellowKey"] },
    { id: "cardAtkUp", icon: "⚔", x: 30, y: 102, requires: ["trainers"], reveal: "trainers" },
    { id: "whetstoneProvision", icon: "⚑", x: 10, y: 102, requires: ["cardAtkUp"] },
    { id: "cardDefUp", icon: "⛨", x: 30, y: 120, requires: ["cardAtkUp"] },
    { id: "aegisProvision", icon: "⛨", x: 10, y: 120, requires: ["cardDefUp"] },
    // The Archives under Breakthrough, and the rest of the tree under them,
    // stay hidden until Quest for Knowledge (in the Breakthrough tree) is
    // owned. Research needs the Archives, so the skills that open it come
    // after them: Pocket Money (then Spare Change, Wishing Well and Free
    // Training below it) and Greater Heal either side of the core path down
    // the middle (Lifesteal, Buy Quantity, Thorns, Find Gold Key, Key Efficiency, then GK Siphon; Key
    // Mastery, in the Breakthrough tree, reveals Find Gold Key and all below it).
    // Recovery and Regen Research (then Parry, then Revive) stand under Greater Heal.
    // Pocket Money's side waits on Path to Wealth, and Greater Heal's on Physician,
    // both in the Breakthrough tree.
    { id: "archives", icon: "▥", x: 50, y: 196, requires: ["breakthrough"], reveal: "questForKnowledge" },
    { id: "pocketMoney", icon: "¤", x: 20, y: 214, requires: ["archives"], reveal: "pathToWealth" },
    { id: "lifesteal", icon: "♥", x: 50, y: 214, requires: ["archives"] },
    { id: "buyQuantity", icon: "×", x: 50, y: 232, requires: ["lifesteal"] },
    { id: "thorns", icon: "✥", x: 50, y: 250, requires: ["buyQuantity"] },
    { id: "findYellowKey", icon: "⚿", x: 50, y: 268, requires: ["thorns"], reveal: "keyMastery" },
    { id: "keyEfficiency", icon: "⚿", x: 50, y: 286, requires: ["findYellowKey"] },
    { id: "keySiphon", icon: "⚿", x: 50, y: 304, requires: ["keyEfficiency"] },
    { id: "spareChange", icon: "¤", x: 20, y: 232, requires: ["pocketMoney"] },
    { id: "wealthy", icon: "¤", x: 10, y: 250, requires: ["spareChange"] },
    { id: "loot", icon: "☠", x: 30, y: 250, requires: ["spareChange"] },
    { id: "wishingWell", icon: "◎", x: 20, y: 268, requires: ["spareChange"] },
    { id: "freeTraining", icon: "↑", x: 20, y: 286, requires: ["wishingWell"] },
    { id: "greaterHeal", icon: "✚", x: 80, y: 214, requires: ["archives"], reveal: "physician" },
    { id: "recovery", icon: "✦", x: 70, y: 232, requires: ["greaterHeal"] },
    { id: "findPotion", icon: "⚗", x: 70, y: 250, requires: ["recovery"] },
    { id: "regenResearch", icon: "♥", x: 90, y: 232, requires: ["greaterHeal"] },
    { id: "parry", icon: "⇋", x: 90, y: 250, requires: ["regenResearch"] },
    { id: "revive", icon: "☼", x: 90, y: 268, requires: ["parry"] },
    // The cards under GK Siphon down the middle: Gold Door (Key < Badges,
    // then Key ≥ Badges, to its right; Heart Door Resilience, then Heart Door, to its
    // left), Weak Enemy (Base, then Strong, to its left, Fast under Base; Elite, then Boss, to its
    // right, Non-Boss under Boss), Chest, BK Siphon (Smelt Gold Key, then GK -> BK, to its left,
    // and under GK -> BK Smelt Blue Key, BK -> RK and Smelt Red Key; Red
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
    { id: "keyToHp", icon: "♥", x: 30, y: 376, requires: ["blueSiphon"] },
    { id: "blueTrader", icon: "⚿", x: 10, y: 376, requires: ["keyToHp"] },
    { id: "smeltBlue", icon: "♥", x: 10, y: 394, requires: ["blueTrader"] },
    { id: "redTrader", icon: "⚿", x: 10, y: 412, requires: ["smeltBlue"] },
    { id: "smeltRed", icon: "♥", x: 10, y: 430, requires: ["redTrader"] },
    { id: "cardRedKey", icon: "⚿", x: 70, y: 376, requires: ["blueSiphon"] },
    { id: "redSiphon", icon: "⚿", x: 90, y: 376, requires: ["cardRedKey"] },
    { id: "floorSkipReward", icon: "↷", x: 50, y: 394, requires: ["blueSiphon"] },
    { id: "cardTorch", icon: "☼", x: 30, y: 394, requires: ["floorSkipReward"] },
    { id: "cardWoodenDoor", icon: "⚿", x: 70, y: 394, requires: ["floorSkipReward"] },
  ] },
  { id: "breakthrough", name: "Breakthrough", currency: "breakthrough", gate: "breakthrough", description: "Earn a Breakthrough point for each Tower Goal you claim.", height: 462, unlocks: true, nodes: [
    // Quest for Knowledge first: it reveals the Inspiration tree's Archives
    // and everything under them (but Pocket Money's and Greater Heal's sides,
    // which Path to Wealth and Physician reveal).
    { id: "questForKnowledge", icon: "▥", x: 50, y: 10, requires: ["breakthrough"] },
    { id: "moveSpeed", icon: "»", x: 50, y: 34, requires: ["questForKnowledge"] },
    { id: "instantCombat", icon: "↯", x: 18, y: 34, requires: ["moveSpeed"] },
    { id: "extraKey", icon: "⚿", x: 82, y: 34, requires: ["moveSpeed"] },
    { id: "pathToWealth", icon: "¤", x: 18, y: 58, requires: ["moveSpeed"] },
    { id: "physician", icon: "✚", x: 50, y: 58, requires: ["moveSpeed"] },
    { id: "dash", icon: "⇶", x: 82, y: 58, requires: ["moveSpeed"] },
    // Dash's own skills down the right edge: End Rush, Dash Regen, then Dash Badge.
    { id: "endRush", icon: "⇶", x: 90, y: 85, requires: ["dash"] },
    { id: "dashRegen", icon: "⇶", x: 90, y: 111, requires: ["endRush"] },
    { id: "dashBadge", icon: "◪", x: 90, y: 135, requires: ["dashRegen", "cardBadges"] },
    // Rehearsed steps, then Echoes of time, then Manual Hand, straight down
    // under Path to Wealth: the undos and the second hand.
    { id: "inspirationUndos", icon: "↺", x: 18, y: 85, requires: ["pathToWealth"] },
    { id: "undos", icon: "↺", x: 18, y: 111, requires: ["inspirationUndos"] },
    { id: "manualHand", icon: "⇄", x: 18, y: 137, requires: ["undos"] },
    // Key Mastery under Physician reveals Find Gold Key and the skills under
    // it in the Inspiration tree; Badges stand down and right of it.
    { id: "keyMastery", icon: "⚿", x: 50, y: 85, requires: ["physician"] },
    { id: "cardBadges", icon: "◪", x: 70, y: 111, requires: ["physician"] },
    // Interest under Key Mastery, with Max Interest to its left and Mug to its right.
    { id: "interest", icon: "¤", x: 50, y: 159, requires: ["keyMastery"] },
    { id: "maxInterest", icon: "¤", x: 22, y: 159, requires: ["interest"] },
    { id: "mug", icon: "☠", x: 78, y: 159, requires: ["interest"] },
    // Overheal under Max Interest, then the run's charges: Ignore and
    // Target, each with the skill that regains it below.
    { id: "overheal", icon: "♥", x: 22, y: 185, requires: ["maxInterest"] },
    { id: "ignore", icon: "⊘", x: 50, y: 185, requires: ["interest"] },
    { id: "target", icon: "⌖", x: 78, y: 185, requires: ["mug"] },
    { id: "ignoreMore", icon: "⊘", x: 50, y: 209, requires: ["ignore"] },
    { id: "targetMore", icon: "⌖", x: 78, y: 209, requires: ["target"] },
    // Limit Break 1 to 10 straight down under Ignore More, each requiring the one before.
    { id: "limitBreak1", icon: "⇑", x: 50, y: 233, requires: ["ignoreMore"] },
    { id: "limitBreak2", icon: "⇑", x: 50, y: 257, requires: ["limitBreak1"] },
    { id: "limitBreak3", icon: "⇑", x: 50, y: 281, requires: ["limitBreak2"] },
    { id: "limitBreak4", icon: "⇑", x: 50, y: 305, requires: ["limitBreak3"] },
    { id: "limitBreak5", icon: "⇑", x: 50, y: 329, requires: ["limitBreak4"] },
    { id: "limitBreak6", icon: "⇑", x: 50, y: 353, requires: ["limitBreak5"] },
    { id: "limitBreak7", icon: "⇑", x: 50, y: 377, requires: ["limitBreak6"] },
    { id: "limitBreak8", icon: "⇑", x: 50, y: 401, requires: ["limitBreak7"] },
    { id: "limitBreak9", icon: "⇑", x: 50, y: 425, requires: ["limitBreak8"] },
    { id: "limitBreak10", icon: "⇑", x: 50, y: 449, requires: ["limitBreak9"] },
  ] },
  { id: "wayfinding", name: "Wayfinding", currency: "breakthrough", gate: null, description: "Teach Delve Automove to explore, compare routes and preserve resources.", nodes: [
    { id: "aiMemory", icon: "◇", x: 50, y: 20, requires: [] },
    { id: "aiEvaluation", icon: "⚖", x: 25, y: 52, requires: ["aiMemory"] },
    { id: "aiLookahead", icon: "✧", x: 75, y: 78, requires: ["aiMemory"] },
  ] },
  { id: "legacy", name: "Legacy", currency: "breakthrough", gate: "legacy", description: "Spend Breakthrough on heirlooms carried into every new climb.", nodes: [
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
  { id: "renown", name: "Renown", currency: "breakthrough", gate: "legacy", description: "A path awaiting its final purpose.", nodes: [
    { id: "renownBanner", icon: "⚑", x: 50, y: 18, requires: ["legacy"] },
    { id: "renownOath", icon: "◆", x: 72, y: 50, requires: ["renownBanner"] },
    { id: "renownCrown", icon: "♛", x: 38, y: 80, requires: ["renownOath"] },
  ] },
];
export function skillAvailable(id: UpgradeId, levels: Record<UpgradeId, number>) {
  const tree = TREES.find(t => t.nodes.some(n => n.id === id));
  const node = tree?.nodes.find(n => n.id === id);
  return !!node && treeOpen(tree!, levels) && !skillHidden(id, levels) && node.requires.every(key => levels[key] > 0);
}
/** Whether skill `id` is hidden: its node waits on a `reveal` not yet owned,
 * or requires a node that is hidden. */
export function skillHidden(id: UpgradeId, levels: Record<UpgradeId, number>): boolean {
  const node = TREES.flatMap(t => t.nodes).find(n => n.id === id);
  if (!node) return false;
  return (node.reveal !== undefined && !(levels[node.reveal] > 0)) || node.requires.some(key => skillHidden(key, levels));
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
