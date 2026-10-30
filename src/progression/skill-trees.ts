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
  { id: "inspiration", name: "Inspiration", currency: "inspiration", description: "Earn Inspiration by beating your best Tower climb.", height: 552, unlocks: true, nodes: [
    // A new game's first skills down the middle: Door & Key, Enemy, then
    // Auto-Climb, each a row above the next.
    { id: "cardDoorKey", icon: "⚿", x: 50, y: 12, requires: [] },
    { id: "cardEnemy", icon: "☠", x: 50, y: 30, requires: ["cardDoorKey"] },
    { id: "autoClimb", icon: "»", x: 50, y: 48, requires: ["cardEnemy"] },
    // The hand's skills, down to Breakthrough: Buildout, Trainers, Larger
    // Hand, Shroud, Critical (with Critical Prediction, then Bombs, to its
    // left and Faster Trainers to its right). ATK
    // Up branches left off Trainers, with DEF Up to its left, each with its
    // provision (Vanguard Banner, Aegis Charm) under it, so more can follow
    // down those two columns, and On the Job
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
    { id: "cardAtkUp", icon: "⚔", x: 30, y: 102, requires: ["trainers"], reveal: "trainers" },
    { id: "whetstoneProvision", icon: "⚑", x: 30, y: 120, requires: ["cardAtkUp"] },
    { id: "cardDefUp", icon: "⛨", x: 10, y: 102, requires: ["cardAtkUp"] },
    { id: "aegisProvision", icon: "⛨", x: 10, y: 120, requires: ["cardDefUp"] },
    // The Archives under Breakthrough, and the rest of the tree under them,
    // stay hidden until Quest for Knowledge (in the Breakthrough tree) is
    // owned. Research needs the Archives, so the skills that open it come
    // after them: Pocket Money (then Spare Change, Wishing Well, Free
    // Training and Interest below it) and Greater Heal either side of the
    // core path down the middle (Lifesteal, Buy Quantity, then Thorns, low
    // enough that the paths it leads to clear Pocket Money's side).
    // Recovery and Regen Research (then Parry, then Revive) stand under Greater Heal.
    // Gold Key stands down and right of Buy Quantity, with Blue Key under it.
    // Pocket Money's side waits on Path to Wealth, and Greater Heal's on Physician,
    // both in the Breakthrough tree.
    { id: "archives", icon: "▥", x: 50, y: 196, requires: ["breakthrough"], reveal: "questForKnowledge" },
    { id: "pocketMoney", icon: "¤", x: 20, y: 214, requires: ["archives"], reveal: "pathToWealth" },
    { id: "lifesteal", icon: "♥", x: 50, y: 232, requires: ["archives"] },
    { id: "buyQuantity", icon: "×", x: 50, y: 268, requires: ["lifesteal"] },
    { id: "cardYellowKey", icon: "⚿", x: 70, y: 286, requires: ["buyQuantity"] },
    { id: "cardBlueKey", icon: "⚿", x: 70, y: 304, requires: ["cardYellowKey"] },
    { id: "thorns", icon: "✥", x: 50, y: 376, requires: ["buyQuantity"] },
    { id: "spareChange", icon: "¤", x: 20, y: 232, requires: ["pocketMoney"] },
    { id: "wealthy", icon: "¤", x: 10, y: 250, requires: ["spareChange"] },
    { id: "loot", icon: "☠", x: 30, y: 250, requires: ["spareChange"] },
    { id: "wishingWell", icon: "◎", x: 20, y: 268, requires: ["spareChange"] },
    { id: "freeTraining", icon: "↑", x: 20, y: 286, requires: ["wishingWell"] },
    // Interest under Free Training (More Wealth, in the Breakthrough tree,
    // reveals it), Max Interest and Mug either side under it, Chest under
    // them, and Torch and Floor Skip Reward under Chest.
    { id: "interest", icon: "¤", x: 20, y: 304, requires: ["freeTraining"], reveal: "moreWealth" },
    { id: "maxInterest", icon: "¤", x: 10, y: 322, requires: ["interest"] },
    { id: "mug", icon: "☠", x: 30, y: 322, requires: ["interest"] },
    { id: "cardChest", icon: "▣", x: 20, y: 340, requires: ["interest"] },
    { id: "cardTorch", icon: "☼", x: 10, y: 358, requires: ["cardChest"] },
    { id: "floorSkipReward", icon: "↷", x: 30, y: 358, requires: ["cardChest"] },
    { id: "greaterHeal", icon: "✚", x: 80, y: 214, requires: ["archives"], reveal: "physician" },
    { id: "recovery", icon: "✦", x: 70, y: 232, requires: ["greaterHeal"] },
    { id: "findPotion", icon: "⚗", x: 70, y: 250, requires: ["recovery"] },
    { id: "regenResearch", icon: "♥", x: 90, y: 232, requires: ["greaterHeal"] },
    { id: "parry", icon: "⇋", x: 90, y: 250, requires: ["regenResearch"] },
    // Revive, Angel Wings and Avenging Angel straight down, revealed by Life
    // (in the Breakthrough tree).
    { id: "revive", icon: "☼", x: 90, y: 268, requires: ["parry"], reveal: "life" },
    { id: "angelWings", icon: "⚚", x: 90, y: 286, requires: ["revive"] },
    { id: "avengingAngel", icon: "⚔", x: 90, y: 304, requires: ["angelWings"] },
    // Thorns leads three ways, each revealed by a Mastery in the Breakthrough
    // tree. Down the middle (Door Mastery): Wooden Door, two rows under
    // Thorns, then Gold Door, Heart Door Resilience and Heart Door below it.
    { id: "cardWoodenDoor", icon: "⚿", x: 50, y: 412, requires: ["thorns"], reveal: "doorMastery" },
    { id: "cardYellowDoor", icon: "⚿", x: 50, y: 466, requires: ["cardWoodenDoor"] },
    { id: "heartDoorResilience", icon: "♥", x: 50, y: 484, requires: ["cardYellowDoor"] },
    { id: "cardHeartDoor", icon: "♥", x: 50, y: 502, requires: ["heartDoorResilience"] },
    // To the right (Beast Mastery): Weak Enemy, with Elite, then Boss, then
    // Non-Boss to its right and down; Base under it, with Fast under Base and
    // Strong down and right of it.
    { id: "cardWeakEnemy", icon: "☠", x: 70, y: 394, requires: ["thorns"], reveal: "beastMastery" },
    { id: "cardEliteEnemy", icon: "☠", x: 90, y: 394, requires: ["cardWeakEnemy"] },
    { id: "cardBossEnemy", icon: "☠", x: 90, y: 412, requires: ["cardEliteEnemy"] },
    { id: "cardNonBossEnemy", icon: "☠", x: 90, y: 430, requires: ["cardBossEnemy"] },
    { id: "cardBaseEnemy", icon: "☠", x: 70, y: 430, requires: ["cardWeakEnemy"] },
    { id: "cardFastEnemy", icon: "☠", x: 70, y: 448, requires: ["cardBaseEnemy"] },
    { id: "cardStrongEnemy", icon: "☠", x: 90, y: 448, requires: ["cardBaseEnemy"] },
    // Down to the left: Find Gold Key and Key Efficiency (Key Mastery), then
    // (Card Mastery) GK Siphon, BK Siphon, with Smelt Gold Key, then GK -> BK, Smelt Blue
    // Key, BK -> RK and Smelt Red Key, down its left, and Red Key, RK Siphon,
    // Key < Badges and Key ≥ Badges under it.
    { id: "findYellowKey", icon: "⚿", x: 30, y: 394, requires: ["thorns"], reveal: "keyMastery" },
    { id: "keyEfficiency", icon: "⚿", x: 30, y: 412, requires: ["findYellowKey"], reveal: "keyMastery" },
    { id: "keySiphon", icon: "⚿", x: 30, y: 430, requires: ["keyEfficiency"], reveal: "cardMastery" },
    { id: "blueSiphon", icon: "⚿", x: 30, y: 448, requires: ["keySiphon"], reveal: "cardMastery" },
    { id: "keyToHp", icon: "♥", x: 10, y: 466, requires: ["blueSiphon"] },
    { id: "blueTrader", icon: "⚿", x: 10, y: 484, requires: ["keyToHp"] },
    { id: "smeltBlue", icon: "♥", x: 10, y: 502, requires: ["blueTrader"] },
    { id: "redTrader", icon: "⚿", x: 10, y: 520, requires: ["smeltBlue"] },
    { id: "smeltRed", icon: "♥", x: 10, y: 538, requires: ["redTrader"] },
    { id: "cardRedKey", icon: "⚿", x: 30, y: 466, requires: ["blueSiphon"] },
    { id: "redSiphon", icon: "⚿", x: 30, y: 484, requires: ["cardRedKey"] },
    { id: "keyLessBadges", icon: "⚿", x: 30, y: 502, requires: ["redSiphon"] },
    { id: "keyAtLeastBadges", icon: "⚿", x: 30, y: 520, requires: ["keyLessBadges"] },
  ] },
  { id: "breakthrough", name: "Breakthrough", currency: "breakthrough", gate: "breakthrough", description: "Earn a Breakthrough point for each Tower Goal you claim.", height: 490, unlocks: true, nodes: [
    // Quest for Knowledge first: it reveals the Inspiration tree's Archives
    // and everything under them (but Pocket Money's and Greater Heal's sides,
    // which Path to Wealth and Physician reveal, and the paths More Wealth
    // and the Masteries reveal).
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
    // Golden Floors, then Rehearsed steps and Echoes of time, straight down
    // under More Wealth (under Path to Wealth): the Golden Floors' research
    // and the undos.
    { id: "moreWealth", icon: "¤", x: 18, y: 85, requires: ["pathToWealth"] },
    { id: "goldenFloors", icon: "¤", x: 18, y: 111, requires: ["moreWealth"] },
    { id: "inspirationUndos", icon: "↺", x: 18, y: 137, requires: ["goldenFloors"] },
    { id: "undos", icon: "↺", x: 18, y: 163, requires: ["inspirationUndos"] },
    // Overheal, Life (which reveals Revive and the Angel skills), then Key
    // Mastery, under Physician; Badges stand down and right of Physician.
    // Card Mastery and Beast Mastery split off under Key Mastery, and Door
    // Mastery follows it: they reveal the Inspiration tree's three paths
    // under Thorns.
    { id: "overheal", icon: "♥", x: 50, y: 85, requires: ["physician"] },
    { id: "life", icon: "✚", x: 50, y: 111, requires: ["overheal"] },
    { id: "keyMastery", icon: "⚿", x: 50, y: 137, requires: ["life"] },
    { id: "cardBadges", icon: "◪", x: 70, y: 111, requires: ["physician"] },
    { id: "cardMastery", icon: "▤", x: 38, y: 163, requires: ["keyMastery"] },
    { id: "beastMastery", icon: "☠", x: 62, y: 163, requires: ["keyMastery"] },
    // Manual Hand, the second hand, after Card Mastery: down and left of it,
    // two rows under it to keep clear of Echoes of time and Ignore.
    { id: "manualHand", icon: "⇄", x: 30, y: 215, requires: ["cardMastery"] },
    // Extra Trainer under Key Mastery, with Door Mastery to its right after
    // it, which reveals the Inspiration tree's door path under Thorns. Then
    // the run's charges below Extra Trainer: Ignore, with Target to its
    // right, each with the skill that regains it below.
    { id: "extraTrainer", icon: "⚔", x: 50, y: 189, requires: ["keyMastery"] },
    { id: "doorMastery", icon: "⚿", x: 78, y: 189, requires: ["extraTrainer"] },
    { id: "ignore", icon: "⊘", x: 50, y: 213, requires: ["extraTrainer"] },
    { id: "target", icon: "⌖", x: 78, y: 213, requires: ["ignore"] },
    { id: "ignoreMore", icon: "⊘", x: 50, y: 237, requires: ["ignore"] },
    { id: "targetMore", icon: "⌖", x: 78, y: 237, requires: ["target"] },
    // Limit Break 1 to 10 straight down under Ignore More, each requiring the one before.
    { id: "limitBreak1", icon: "⇑", x: 50, y: 261, requires: ["ignoreMore"] },
    { id: "limitBreak2", icon: "⇑", x: 50, y: 285, requires: ["limitBreak1"] },
    { id: "limitBreak3", icon: "⇑", x: 50, y: 309, requires: ["limitBreak2"] },
    { id: "limitBreak4", icon: "⇑", x: 50, y: 333, requires: ["limitBreak3"] },
    { id: "limitBreak5", icon: "⇑", x: 50, y: 357, requires: ["limitBreak4"] },
    { id: "limitBreak6", icon: "⇑", x: 50, y: 381, requires: ["limitBreak5"] },
    { id: "limitBreak7", icon: "⇑", x: 50, y: 405, requires: ["limitBreak6"] },
    { id: "limitBreak8", icon: "⇑", x: 50, y: 429, requires: ["limitBreak7"] },
    { id: "limitBreak9", icon: "⇑", x: 50, y: 453, requires: ["limitBreak8"] },
    { id: "limitBreak10", icon: "⇑", x: 50, y: 477, requires: ["limitBreak9"] },
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
