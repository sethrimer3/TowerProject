/** Card trees: each card's upgrade tree, which its card points
 * (card-levels.ts) are spent on, one level of a node a point, on the
 * levels its nodes hold (those they start with and those card buys opened,
 * card-buys.ts, which also set the card's max level). A node's
 * levels raise the stats it names (`TreeStat`) for as long as the run's hand
 * holds the card, summed with every other card in the hand that raises the
 * same stat into one card factor. */
import { CARD_IDS, type CardId } from "./cards.ts";
import { BASE_MAX_LEVEL, cardLevel, cardLevelTotal, cardPoints } from "./card-levels.ts";
import { rarityRank, type CardRarity } from "./card-rarity.ts";
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
  /** The Overheal ceiling, multiplying it whether or not the skill is owned (so it opens one above max HP). */
  | "overhealMax"
  /** Flat: the percent chance the Tower's stairs, reached by STAIRS, climb two floors (as Skip on STAIRS does). */
  | "stairSkip"
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
export const FLAT_STATS: ReadonlySet<TreeStat> = new Set<TreeStat>(["floorHeal", "stairSkip", "potionMaxHp", "attackShardGold", "defenseShardGold", "bossCells", "supplyChance", "equipmentChance"]);

/** One node of a card's tree: the stats each of its levels raises, its
 * rarity, how many levels it holds from the start (`levels`: 0 for a node
 * only a card buy of its rarity opens), the most levels card buys can open
 * on it (`max`), and the node whose levels must reach `opensAt` first
 * (`after`; none for a track's first node). */
export type CardTreeNode = { id: string; stats: Partial<Record<TreeStat, number>>; rarity: CardRarity; levels: number; max: number; after?: string };

/** A common node holding `levels` from the start, and up to `max` once
 * common card buys open the rest. */
const common = (id: string, stats: CardTreeNode["stats"], levels: number, max: number): CardTreeNode => ({ id, stats, rarity: "common", levels, max });

/** Each card's tree, its nodes parents first. Every tree holds
 * `BASE_MAX_LEVEL` (10) levels from the start; card buys open the rest:
 * STAIRS' up to 60, through every rarity, and the other cards' (common
 * only, until their trees are redone) up to 25. */
export const CARD_TREES: Partial<Record<CardId, readonly CardTreeNode[]>> = {
  stairs: [
    common("floorGold", { floorGold: 2 }, 5, 10),
    { id: "floorHealGold", stats: { floorHeal: 3 }, rarity: "uncommon", levels: 0, max: 5, after: "floorGold" },
    { id: "goldBonus", stats: { goldBonus: 2 }, rarity: "rare", levels: 0, max: 5, after: "floorHealGold" },
    { id: "freeOffense", stats: { freeOffense: 1 }, rarity: "epic", levels: 0, max: 5, after: "goldBonus" },
    { id: "overhealMax", stats: { overhealMax: 5 }, rarity: "legendary", levels: 0, max: 5, after: "freeOffense" },
    common("floorSilver", { floorSilver: 2 }, 5, 10),
    { id: "floorHealSilver", stats: { floorHeal: 3 }, rarity: "uncommon", levels: 0, max: 5, after: "floorSilver" },
    { id: "silverBonus", stats: { silverBonus: 2 }, rarity: "rare", levels: 0, max: 5, after: "floorHealSilver" },
    { id: "freeDefense", stats: { freeDefense: 1 }, rarity: "epic", levels: 0, max: 5, after: "silverBonus" },
    { id: "stairSkip", stats: { stairSkip: 1 }, rarity: "legendary", levels: 0, max: 5, after: "freeDefense" },
  ],
  heal: [
    common("percentPotions", { percentPotions: 10 }, 2, 5),
    common("potionHeal", { potionHeal: 10 }, 2, 5),
    common("goldBonus", { goldBonus: 10 }, 2, 5),
    common("potionMaxHp", { potionMaxHp: 0.01 }, 2, 5),
    common("overheal", { overheal: 5 }, 2, 5),
  ],
  door: [
    common("doorCost", { doorCost: 1 }, 4, 10),
    common("doorGold", { doorGold: 1 }, 4, 10),
    common("silverBonus", { silverBonus: 2 }, 2, 5),
  ],
  key: [
    common("keyFind", { keyFind: 1 }, 4, 10),
    common("keyGold", { keyGold: 1 }, 4, 10),
    common("silverBonus", { silverBonus: 2 }, 2, 5),
  ],
  monster: [
    common("attack", { foeAttack: 1 }, 2, 5),
    common("defense", { foeDefense: 1 }, 2, 5),
    common("gold", { foeGold: 1 }, 2, 5),
    common("moreEnemies", { moreEnemies: 1 }, 4, 10),
  ],
  atkUp: [
    common("shard", { attackShard: 1 }, 4, 10),
    common("gold", { attackShardGold: 0.1 }, 4, 10),
    common("silverBonus", { silverBonus: 1 }, 2, 5),
  ],
  defUp: [
    common("shard", { defenseShard: 1 }, 4, 10),
    common("gold", { defenseShardGold: 0.1 }, 4, 10),
    common("silverBonus", { silverBonus: 1 }, 2, 5),
  ],
  torch: [
    common("attack", { bossAttack: 1 }, 2, 5),
    common("defense", { bossDefense: 1 }, 2, 5),
    common("gold", { bossGold: 1 }, 2, 5),
    common("shroud", { bossShroud: 2 }, 2, 5),
    common("cells", { bossCells: 1 }, 2, 5),
  ],
  chest: [
    common("gold", { chestGold: 2 }, 2, 5),
    common("supply", { supplyChance: 0.2 }, 4, 10),
    common("equipment", { equipmentChance: 0.1 }, 4, 10),
  ],
};

/** The Gems a card's respec costs: every point spent on its tree comes
 * back, to be spent again. */
export const RESPEC_GEMS = 20;

/** The levels spent on each card's tree, by node; a card or node with none
 * left out. The save's (`save.cardTrees`), and a run's copy of its hand's. */
export type CardTreeLevels = Partial<Record<CardId, Record<string, number>>>;

/** The levels card buys have opened on each card's tree, by node, on top
 * of those each node holds from the start; a card or node with none left
 * out. The save's (`save.cardBuys.opened`, card-buys.ts). */
export type CardOpened = Partial<Record<CardId, Record<string, number>>>;
/** What a card's tree reads from the save: each card's XP, the points
 * spent on its tree, and the levels card buys opened on it. */
export type TreeSave = { cardXp: Partial<Record<CardId, number>>; cardTrees: CardTreeLevels; cardBuys: { opened: CardOpened } };

/** Node `id` of card `card`'s tree, if it has one. */
export const treeNode = (card: CardId, id: string) => CARD_TREES[card]?.find((n) => n.id === id);
/** The levels spent on node `id` of `card`. */
export const nodeLevel = (levels: CardTreeLevels, card: CardId, id: string) => levels[card]?.[id] ?? 0;
/** The levels node `node` of `card` holds now: those it starts with and
 * those card buys opened (0 for a node no buy of its rarity has opened). */
export const nodeCap = (opened: CardOpened, card: CardId, node: CardTreeNode) => node.levels + (opened[card]?.[node.id] ?? 0);
/** The highest level `card` can reach now: every level its tree holds
 * (`BASE_MAX_LEVEL` until card buys open more), or `BASE_MAX_LEVEL` for a
 * card without a tree. */
export const cardMaxLevel = (opened: CardOpened, card: CardId) =>
  CARD_TREES[card]?.reduce((sum, node) => sum + nodeCap(opened, card, node), 0) ?? BASE_MAX_LEVEL;
/** How `card` looks for what card buys opened on its tree: the rarest
 * rarity among its nodes holding a level (`rarity`, common at first), and
 * whether a common buy has raised it (`upgraded`). */
export function cardLook(opened: CardOpened, card: CardId): { rarity: CardRarity; upgraded: boolean } {
  let rarity: CardRarity = "common";
  for (const node of CARD_TREES[card] ?? []) if (nodeCap(opened, card, node) > 0 && rarityRank(node.rarity) > rarityRank(rarity)) rarity = node.rarity;
  return { rarity, upgraded: Object.values(opened[card] ?? {}).some((n) => n > 0) };
}
/** The card points spent on `card`'s tree. */
export const pointsSpent = (levels: CardTreeLevels, card: CardId) => Object.values(levels[card] ?? {}).reduce((a, b) => a + b, 0);
/** `card`'s level and progress in the save, under its max level. */
export const levelIn = (save: Pick<TreeSave, "cardXp" | "cardBuys">, card: CardId) => cardLevel(save.cardXp[card] ?? 0, cardMaxLevel(save.cardBuys.opened, card));
/** Every card's level summed, each under its max level: it rises with
 * each level-up, and with a card buy that turns XP gathered past the cap
 * into levels. */
export const totalCardLevels = (save: Pick<TreeSave, "cardXp" | "cardBuys">) => cardLevelTotal(save.cardXp, (id) => cardMaxLevel(save.cardBuys.opened, id));
/** The card points `card` has: one a level, up to its max level. */
export const pointsOf = (save: Pick<TreeSave, "cardXp" | "cardBuys">, card: CardId) => cardPoints(save.cardXp[card] ?? 0, cardMaxLevel(save.cardBuys.opened, card));
/** The card points `card` has left to spend: one a level (`pointsOf`)
 * less those spent. */
export const pointsLeft = (save: TreeSave, card: CardId) => Math.max(0, pointsOf(save, card) - pointsSpent(save.cardTrees, card));
/** Whether `card` has a tree and card points left to spend on it. */
export const hasPointsToSpend = (save: TreeSave, card: CardId) => !!CARD_TREES[card] && pointsLeft(save, card) > 0;
/** The levels a node's parent must hold before the node takes any: all
 * it starts with (a common node's), or one for a node a buy opened. */
export const opensAt = (parent: CardTreeNode) => Math.max(1, parent.levels);
/** Whether node `node` of `card` takes levels yet: a card buy has opened
 * it (a common node holds levels from the start), and it is a track's
 * first node or the node before it holds `opensAt` levels. */
export function nodeOpen(levels: CardTreeLevels, opened: CardOpened, card: CardId, node: CardTreeNode) {
  if (!nodeCap(opened, card, node)) return false;
  const parent = node.after === undefined ? undefined : treeNode(card, node.after);
  return !parent || nodeLevel(levels, card, parent.id) >= opensAt(parent);
}

/** Why a card point can't go on node `id` of `card` now: the card has no
 * such node (`unknown`), no card buy of its rarity has opened it yet
 * (`sealed`), it holds every level opened on it (`maxed`), the node
 * before it holds too few (`locked`), or the card has no point left
 * (`points`); null when it can. */
export type RaiseRefusal = "unknown" | "sealed" | "maxed" | "locked" | "points";
export function raiseRefusal(save: TreeSave, card: CardId, id: string): RaiseRefusal | null {
  const node = treeNode(card, id);
  if (!node) return "unknown";
  const cap = nodeCap(save.cardBuys.opened, card, node);
  if (!cap) return "sealed";
  if (nodeLevel(save.cardTrees, card, id) >= cap) return "maxed";
  if (!nodeOpen(save.cardTrees, save.cardBuys.opened, card, node)) return "locked";
  return pointsLeft(save, card) > 0 ? null : "points";
}
/** Spends a card point of `card` on node `id`, a level more; false when it
 * can't (`raiseRefusal`). */
export function raiseNode(save: TreeSave, card: CardId, id: string) {
  if (raiseRefusal(save, card, id)) return false;
  const nodes = (save.cardTrees[card] ??= {});
  nodes[id] = (nodes[id] ?? 0) + 1;
  return true;
}

/** A saved `cardTrees` against the cards' XP and the levels card buys
 * opened: known cards and nodes only, each a whole number of levels no
 * more than the node holds now, a node kept only once the node before it
 * holds enough, and no more points than the card has, taken in tree order
 * (the rest dropped). */
export function decodeCardTrees(raw: unknown, cardXp: Partial<Record<CardId, number>>, opened: CardOpened): CardTreeLevels {
  const out: CardTreeLevels = {};
  if (!isRecord(raw)) return out;
  for (const card of CARD_IDS) {
    const saved = raw[card], nodes = CARD_TREES[card];
    if (!isRecord(saved) || !nodes) continue;
    let left = cardPoints(cardXp[card] ?? 0, cardMaxLevel(opened, card));
    const kept: Record<string, number> = {};
    for (const node of nodes) {
      const n = saved[node.id];
      if (!wholeIn(n, 1, nodeCap(opened, card, node)) || !nodeOpen({ [card]: kept }, opened, card, node)) continue;
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
  ["floorGold", "floorSilver", "goldBonus", "silverBonus", "freeOffense", "freeDefense", "freeUtility", "floorHeal", "overheal", "overhealMax", "stairSkip", "percentPotions", "potionHeal", "potionMaxHp",
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
 * training's) raised by the trees' Overheal percents, only once the Overheal
 * skill is owned (they raise the ceiling, never open it), then multiplied
 * by their Overheal Max percents, skill or not (STAIRS' legendary node,
 * which opens a ceiling above max HP by itself). */
export function treeOverheal(overheal: number, save: { upgrades: { overheal: number } }, bonus: TreeBonus) {
  const raised = save.upgrades.overheal && bonus.overheal ? snap((overheal * (100 + bonus.overheal)) / 100) : overheal;
  return bonus.overhealMax ? snap((raised * (100 + bonus.overhealMax)) / 100) : raised;
}
