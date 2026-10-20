/** Card trees: each card's upgrade tree, which its card points
 * (card-levels.ts) are spent on, one level of a node a point. A node's
 * levels raise the stats it names (`TreeStat`) for as long as the run's hand
 * holds the card, summed with every other card in the hand that raises the
 * same stat into one card factor. */
import { CARD_IDS, type CardId } from "./cards.ts";
import { cardPoints } from "./card-levels.ts";
import { isRecord, wholeIn } from "./decode.ts";
import { snap } from "./exact.ts";
import { extraEnemies } from "./more-enemies.ts";
import type { RunCore } from "./runs.ts";

/** What a node's levels raise, a level's worth each. Most are percents
 * that add into one card factor (×(100 + sum) / 100) on their stat; the
 * rest (`FLAT_STATS`) add their amount as it is. */
export type TreeStat =
  /** Spare Change's Gold and Wishing Well's Silver for each floor new to the run. */
  | "floorGold" | "floorSilver"
  /** Gold Bonus (a kill's, a chest's and Pickup Gold) and all Silver a run finds. */
  | "goldBonus" | "silverBonus"
  /** Each Free Upgrade group's chance a floor. */
  | "freeOffense" | "freeDefense" | "freeUtility"
  /** Flat: the percent of max HP healed on each floor new to the run, up to the Overheal ceiling. */
  | "floorHeal"
  /** The Overheal ceiling, once the Overheal skill is owned. */
  | "overheal"
  /** The chance each potion is a percent potion, and the HP every potion restores. */
  | "percentPotions" | "potionHeal"
  /** Flat: the percent of max HP each potion HEAL reaches boosts it by, for the run (as the Max HP badge does). */
  | "potionMaxHp"
  /** Less each door of every kind costs, and more each door's Pickup Gold. */
  | "doorCost" | "doorGold"
  /** More each key of every colour is worth, and more each key's Pickup Gold. */
  | "keyFind" | "keyGold"
  /** ATK and DEF in fights with every enemy, and every kill's Gold. */
  | "foeAttack" | "foeDefense" | "foeGold"
  /** More enemies generated on each floor, of every strength (as More Enemies adds them). */
  | "moreEnemies"
  /** What each ATK or DEF shard raises its stat by. */
  | "attackShard" | "defenseShard"
  /** Flat: Pickup Gold more for each ATK or DEF shard taken. */
  | "attackShardGold" | "defenseShardGold"
  /** ATK, DEF and the shroud in fights with a Greater Boss, and its kill's Gold. */
  | "bossAttack" | "bossDefense" | "bossShroud" | "bossGold"
  /** Flat: Cells more from each Greater Boss, before a badge's scale. */
  | "bossCells"
  /** Each treasure chest's Gold. */
  | "chestGold"
  /** Flat: percentage points more chance of a Supply or an Equipment Chest. */
  | "supplyChance" | "equipmentChance";

/** The stats added as they are, not as percents of a factor. */
export const FLAT_STATS: ReadonlySet<TreeStat> = new Set<TreeStat>(["floorHeal", "potionMaxHp", "attackShardGold", "defenseShardGold", "bossCells", "supplyChance", "equipmentChance"]);

/** One node of a card's tree: the stats each of its levels raises, how
 * many levels it holds, and the node whose levels must all be filled
 * first (`after`; none for a track's first node, open from level 0). */
export type CardTreeNode = { id: string; stats: Partial<Record<TreeStat, number>>; levels: number; after?: string };

/** Each card's tree, its nodes parents first. Every tree spends exactly a
 * card's 25 points (`MAX_CARD_LEVEL`). */
export const CARD_TREES: Partial<Record<CardId, readonly CardTreeNode[]>> = {
  stairs: [
    { id: "floorPay", stats: { floorGold: 10, floorSilver: 10 }, levels: 5 },
    { id: "goldBonus", stats: { goldBonus: 10 }, levels: 1, after: "floorPay" },
    { id: "silverBonus", stats: { silverBonus: 10 }, levels: 1, after: "floorPay" },
    { id: "freeOffense", stats: { freeOffense: 5 }, levels: 2 },
    { id: "freeDefense", stats: { freeDefense: 5 }, levels: 2 },
    { id: "freeUtility", stats: { freeUtility: 5 }, levels: 2 },
    { id: "floorHeal", stats: { floorHeal: 10 }, levels: 5 },
    { id: "floorHeal2", stats: { floorHeal: 10 }, levels: 5, after: "floorHeal" },
    { id: "overheal", stats: { overheal: 10 }, levels: 1, after: "floorHeal" },
    { id: "overheal2", stats: { overheal: 15 }, levels: 1, after: "floorHeal2" },
  ],
  heal: [
    { id: "percentPotions", stats: { percentPotions: 10 }, levels: 5 },
    { id: "potionHeal", stats: { potionHeal: 10 }, levels: 5 },
    { id: "goldBonus", stats: { goldBonus: 10 }, levels: 5 },
    { id: "potionMaxHp", stats: { potionMaxHp: 0.01 }, levels: 5 },
    { id: "overheal", stats: { overheal: 5 }, levels: 5 },
  ],
  door: [
    { id: "doorCost", stats: { doorCost: 1 }, levels: 10 },
    { id: "doorGold", stats: { doorGold: 1 }, levels: 10 },
    { id: "silverBonus", stats: { silverBonus: 2 }, levels: 5 },
  ],
  key: [
    { id: "keyFind", stats: { keyFind: 1 }, levels: 10 },
    { id: "keyGold", stats: { keyGold: 1 }, levels: 10 },
    { id: "silverBonus", stats: { silverBonus: 2 }, levels: 5 },
  ],
  monster: [
    { id: "attack", stats: { foeAttack: 1 }, levels: 5 },
    { id: "defense", stats: { foeDefense: 1 }, levels: 5 },
    { id: "gold", stats: { foeGold: 1 }, levels: 5 },
    { id: "moreEnemies", stats: { moreEnemies: 1 }, levels: 10 },
  ],
  atkUp: [
    { id: "shard", stats: { attackShard: 1 }, levels: 10 },
    { id: "gold", stats: { attackShardGold: 0.1 }, levels: 10 },
    { id: "silverBonus", stats: { silverBonus: 1 }, levels: 5 },
  ],
  defUp: [
    { id: "shard", stats: { defenseShard: 1 }, levels: 10 },
    { id: "gold", stats: { defenseShardGold: 0.1 }, levels: 10 },
    { id: "silverBonus", stats: { silverBonus: 1 }, levels: 5 },
  ],
  torch: [
    { id: "attack", stats: { bossAttack: 1 }, levels: 5 },
    { id: "defense", stats: { bossDefense: 1 }, levels: 5 },
    { id: "gold", stats: { bossGold: 1 }, levels: 5 },
    { id: "shroud", stats: { bossShroud: 2 }, levels: 5 },
    { id: "cells", stats: { bossCells: 1 }, levels: 5 },
  ],
  chest: [
    { id: "gold", stats: { chestGold: 2 }, levels: 5 },
    { id: "supply", stats: { supplyChance: 0.2 }, levels: 10 },
    { id: "equipment", stats: { equipmentChance: 0.1 }, levels: 10 },
  ],
};

/** The Gems a card's respec costs: every point spent on its tree comes
 * back, to be spent again. */
export const RESPEC_GEMS = 20;

/** The levels spent on each card's tree, by node; a card or node with none
 * left out. The save's (`save.cardTrees`), and a run's copy of its hand's. */
export type CardTreeLevels = Partial<Record<CardId, Record<string, number>>>;

/** Node `id` of card `card`'s tree, if it has one. */
export const treeNode = (card: CardId, id: string) => CARD_TREES[card]?.find((n) => n.id === id);
/** The levels spent on node `id` of `card`. */
export const nodeLevel = (levels: CardTreeLevels, card: CardId, id: string) => levels[card]?.[id] ?? 0;
/** The card points spent on `card`'s tree. */
export const pointsSpent = (levels: CardTreeLevels, card: CardId) => Object.values(levels[card] ?? {}).reduce((a, b) => a + b, 0);
/** The card points `card` has left to spend: one a level (`cardPoints`)
 * less those spent. */
export const pointsLeft = (save: { cardXp: Partial<Record<CardId, number>>; cardTrees: CardTreeLevels }, card: CardId) =>
  Math.max(0, cardPoints(save.cardXp[card] ?? 0) - pointsSpent(save.cardTrees, card));
/** Whether `card` has a tree and card points left to spend on it. */
export const hasPointsToSpend = (save: { cardXp: Partial<Record<CardId, number>>; cardTrees: CardTreeLevels }, card: CardId) =>
  !!CARD_TREES[card] && pointsLeft(save, card) > 0;
/** Whether node `node` of `card` takes levels yet: a track's first node
 * always, any other once every level of the node before it is filled. */
export function nodeOpen(levels: CardTreeLevels, card: CardId, node: CardTreeNode) {
  const parent = node.after === undefined ? undefined : treeNode(card, node.after);
  return !parent || nodeLevel(levels, card, parent.id) >= parent.levels;
}

/** Why a card point can't go on node `id` of `card` now: the card has no
 * such node (`unknown`), the node is full (`maxed`), the node before it
 * isn't (`locked`), or the card has no point left (`points`); null when it can. */
export type RaiseRefusal = "unknown" | "maxed" | "locked" | "points";
export function raiseRefusal(save: { cardXp: Partial<Record<CardId, number>>; cardTrees: CardTreeLevels }, card: CardId, id: string): RaiseRefusal | null {
  const node = treeNode(card, id);
  if (!node) return "unknown";
  if (nodeLevel(save.cardTrees, card, id) >= node.levels) return "maxed";
  if (!nodeOpen(save.cardTrees, card, node)) return "locked";
  return pointsLeft(save, card) > 0 ? null : "points";
}
/** Spends a card point of `card` on node `id`, a level more; false when it
 * can't (`raiseRefusal`). */
export function raiseNode(save: { cardXp: Partial<Record<CardId, number>>; cardTrees: CardTreeLevels }, card: CardId, id: string) {
  if (raiseRefusal(save, card, id)) return false;
  const nodes = (save.cardTrees[card] ??= {});
  nodes[id] = (nodes[id] ?? 0) + 1;
  return true;
}

/** A saved `cardTrees` against the cards' XP: known cards and nodes only,
 * each a whole number of levels no more than the node holds, a node kept
 * only once the node before it is full, and no more points than the card
 * has, taken in tree order (the rest dropped). */
export function decodeCardTrees(raw: unknown, cardXp: Partial<Record<CardId, number>>): CardTreeLevels {
  const out: CardTreeLevels = {};
  if (!isRecord(raw)) return out;
  for (const card of CARD_IDS) {
    const saved = raw[card], nodes = CARD_TREES[card];
    if (!isRecord(saved) || !nodes) continue;
    let left = cardPoints(cardXp[card] ?? 0);
    const kept: Record<string, number> = {};
    for (const node of nodes) {
      const n = saved[node.id];
      if (!wholeIn(n, 1, node.levels) || !nodeOpen({ [card]: kept }, card, node)) continue;
      const level = Math.min(n as number, left);
      if (!level) continue;
      kept[node.id] = level;
      left -= level;
    }
    if (Object.keys(kept).length) out[card] = kept;
  }
  return out;
}

/** A run's copy of the trees of the cards in `hand`, as it goes inside:
 * fixed for the run, so its floors and bonuses never change under it. */
export function runCardTrees(levels: CardTreeLevels, hand: readonly CardId[]): CardTreeLevels {
  const out: CardTreeLevels = {};
  for (const card of new Set(hand)) if (levels[card] && Object.keys(levels[card]!).length) out[card] = { ...levels[card] };
  return out;
}

/** What a run's card trees give, each stat summed over every card's nodes
 * (0 for a stat none raises). */
export type TreeBonus = Record<TreeStat, number>;
const NO_BONUS = Object.freeze(Object.fromEntries(
  ["floorGold", "floorSilver", "goldBonus", "silverBonus", "freeOffense", "freeDefense", "freeUtility", "floorHeal", "overheal", "percentPotions", "potionHeal", "potionMaxHp",
    "doorCost", "doorGold", "keyFind", "keyGold", "foeAttack", "foeDefense", "foeGold", "moreEnemies", "attackShard", "defenseShard", "attackShardGold", "defenseShardGold",
    "bossAttack", "bossDefense", "bossShroud", "bossGold", "bossCells", "chestGold", "supplyChance", "equipmentChance"].map((s) => [s, 0]),
)) as TreeBonus;
/** What the trees in `levels` (a run's `cardTrees`) give, added up. */
export function treeBonus(levels: CardTreeLevels | undefined): TreeBonus {
  const bonus: TreeBonus = { ...NO_BONUS };
  for (const card of Object.keys(levels ?? {}) as CardId[])
    for (const [id, level] of Object.entries(levels![card] ?? {})) {
      const node = treeNode(card, id);
      if (!node) continue;
      for (const [stat, each] of Object.entries(node.stats) as [TreeStat, number][]) bonus[stat] = snap(bonus[stat] + each * level);
    }
  return bonus;
}
/** A percent stat's card factor: ×(100 + its percents) / 100. */
export const treeFactor = (bonus: TreeBonus, stat: TreeStat) => (bonus[stat] ? snap((100 + bonus[stat]) / 100) : 1);
/** What `run`'s floors add (more-enemies.ts): its More Enemies badges'
 * and ENEMY's tree's, both fixed as it went inside. */
export const runExtras = (run: Pick<RunCore, "badges" | "cardTrees">) => extraEnemies(run.badges, treeBonus(run.cardTrees).moreEnemies);
/** What each Free Upgrade group's chance a floor is multiplied by (STAIRS'
 * tree), as `rollFreeTraining` takes it. */
export const freeUpFactors = (bonus: TreeBonus) =>
  ({ offense: treeFactor(bonus, "freeOffense"), defense: treeFactor(bonus, "freeDefense"), utility: treeFactor(bonus, "freeUtility") });
/** The Overheal ceiling `overheal` (in thousandths of max HP, Overheal
 * training's) raised by the trees' Overheal percents: only once the Overheal
 * skill is owned, since the trees raise the ceiling, never open it. */
export const treeOverheal = (overheal: number, save: { upgrades: { overheal: number } }, bonus: TreeBonus) =>
  save.upgrades.overheal && bonus.overheal ? snap((overheal * (100 + bonus.overheal)) / 100) : overheal;
