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
  /** Flat: a percent chance of a free Offense, Defense or Utility level
   * each floor, added to that group's own, so it gives one without it
   * trained. */
  | "freeOffenseChance" | "freeDefenseChance" | "freeUtilityChance"
  /** Flat: the percent of max HP healed on each floor new to the run, up to the Overheal ceiling. */
  | "floorHeal"
  /** Flat: percent of max HP added to the Overheal ceiling, whether or not the skill is owned (so it opens one above max HP). */
  | "overhealMax"
  /** Flat: the percent chance the Tower's stairs, reached by STAIRS, climb two floors (as Skip on STAIRS does). */
  | "stairSkip"
  /** The chance each potion is a percent potion, and the HP every potion restores. */
  | "percentPotions" | "potionHeal"
  /** Flat: the percent of max HP each potion HEAL reaches boosts it by, for the run (as the Max HP badge does). */
  | "potionMaxHp"
  /** Flat: Silver found with each potion taken, before Silver Bonus. */
  | "potionSilver"
  /** Regen: the HP regained each step. */
  | "regen"
  /** The shroud in fights with every enemy. */
  | "shroud"
  /** Flat: a percent of every enemy strike parried, added to the hero's
   * Parry %, so it parries without Parry. */
  | "parry"
  /** Flat: percent added to Revive's chance, so it revives without Revive trained. */
  | "reviveChance"
  /** Less of each key every door takes, and more each door's Pickup Gold. */
  | "doorCost" | "doorGold"
  /** Flat: Silver found with each door opened, before Silver Bonus. */
  | "doorSilver"
  /** Flat: the percent of max HP healed on opening each door, after a Heart Door's drain, up to max HP. */
  | "doorHeal"
  /** Flat: the percent chance each colour door on the run's floors is
   * generated a Wooden Door instead (Skeleton Key), and each door of two
   * or three colours without its rarest lock (Lock Pick). */
  | "skeletonKey" | "lockPick"
  /** Flat: the percent chance a door opens for nothing: no keys, no HP (Secret Knock). */
  | "secretKnock"
  /** Flat: the percent chance an opened door (Door Chest) or a key picked
   * up (Key Chest) leaves an opened treasure chest, its loot paid. */
  | "doorChest" | "keyChest"
  /** More each key of every colour is worth, and more each key's Pickup Gold. */
  | "keyFind" | "keyGold"
  /** Flat: the percent of max HP healed on picking up each key, up to max
   * HP (Key Heal), and the percent of the Overheal ceiling, up to it (Key
   * Overheal: the max HP ceiling without Overheal). */
  | "keyHeal" | "keyOverheal"
  /** Flat: Silver found with each key picked up, before Silver Bonus. */
  | "keySilver"
  /** Less of the keys and HP a Wooden or Steel Door takes, and of the keys
   * and the drain a Heart Door takes. */
  | "plainDoorCost" | "heartDoorCost"
  /** Flat: the percent chance a key picked up is two (Locksmith), and that
   * one opens every door on its floor (Master Key). */
  | "doubleKey" | "masterKey"
  /** ATK and DEF in fights with every enemy, and every kill's Gold and Silver. */
  | "foeAttack" | "foeDefense" | "foeGold" | "foeSilver"
  /** Crit %'s chance and Crit x's factor, and the XP every kill gives. */
  | "critChance" | "critFactor" | "killXp"
  /** Flat: the percent chance the first strike of a fight right after a
   * Dash strikes with twice the hero's ATK (Surprise Attack). */
  | "surpriseAttack"
  /** Flat: the percent every enemy's ATK is cut by (Weaken). */
  | "foeAttackCut"
  /** Flat: the percent of max HP Lifesteal may heal above it (Lifesteal Overheal). */
  | "stealOverheal"
  /** More enemies generated on each floor, of every strength (as More Enemies adds them). */
  | "moreEnemies"
  /** What each ATK or DEF shard raises its stat by, and its Pickup Gold. */
  | "attackShard" | "defenseShard" | "attackShardGold" | "defenseShardGold"
  /** Flat: Silver found with each ATK or DEF shard taken, before Silver Bonus. */
  | "attackShardSilver" | "defenseShardSilver"
  /** Flat: the percent chance an ATK shard taken charges Power Strike:
   * twice the hero's ATK in its next fight. */
  | "powerStrike"
  /** Flat: the percent of a boss's (Takedown) or a Greater Boss's (Greater
   * Takedown) max HP taken off as a fight with it begins, and of its ATK
   * (Tangle, Greater Tangle). */
  | "takedown" | "tangle" | "greaterTakedown" | "greaterTangle"
  /** ATK, DEF and the shroud in fights with a Greater Boss, and its kill's Gold. */
  | "bossAttack" | "bossDefense" | "bossShroud" | "bossGold"
  /** Flat: Cells more from each Greater Boss, before a badge's scale. */
  | "bossCells"
  /** Each treasure chest's Gold. */
  | "chestGold"
  /** Flat: Silver found with each treasure chest opened, before Silver Bonus. */
  | "chestSilver"
  /** Flat: the percent chance a treasure chest also holds a Greater Boss's Cells. */
  | "chestCells"
  /** Flat: percentage points more chance of a Supply or an Equipment Chest. */
  | "supplyChance" | "equipmentChance"
  /** Flat: the percent chance each floor is a Treasure Floor, its ATK and
   * DEF shards and potions made treasure chests. */
  | "treasureFloor"
  /** Flat: the percent chance an Equipment Chest's piece is a rarity higher. */
  | "rarityUp"
  /** Flat: the percent chance a treasure chest's rewards are doubled (Double), and tripled (Triple). */
  | "chestDouble" | "chestTriple";

/** The stats added as they are, not as percents of a factor. */
export const FLAT_STATS: ReadonlySet<TreeStat> = new Set<TreeStat>(["floorHeal", "overhealMax", "stairSkip", "potionMaxHp", "potionSilver", "freeOffenseChance", "freeDefenseChance", "freeUtilityChance",
  "doorSilver", "doorHeal", "skeletonKey", "lockPick", "secretKnock", "doorChest", "keyChest", "keyHeal", "keyOverheal", "keySilver", "doubleKey", "masterKey", "surpriseAttack", "foeAttackCut", "stealOverheal", "parry", "reviveChance",
  "attackShardSilver", "defenseShardSilver", "powerStrike", "takedown", "tangle", "greaterTakedown", "greaterTangle", "bossCells", "chestSilver", "chestCells", "supplyChance", "equipmentChance", "treasureFloor", "rarityUp", "chestDouble", "chestTriple"]);

/** One node of a card's tree: the stats each of its levels raises, its
 * rarity, how many levels it holds from the start (`levels`: 0 for a node
 * only a card buy of its rarity opens), the most levels card buys can open
 * on it (`max`), the node whose levels must reach `opensAt` first
 * (`after`; none for a track's first node), and the levels the nodes after
 * it wait for, where that isn't `opensAt`'s default (`unlocks`). */
export type CardTreeNode = { id: string; stats: Partial<Record<TreeStat, number>>; rarity: CardRarity; levels: number; max: number; after?: string; unlocks?: number };

/** A common node holding `levels` from the start, and up to `max` once
 * common card buys open the rest. */
const common = (id: string, stats: CardTreeNode["stats"], levels: number, max: number): CardTreeNode => ({ id, stats, rarity: "common", levels, max });

/** Each card's tree, its nodes parents first. Every tree holds
 * `BASE_MAX_LEVEL` (10) levels from the start; card buys open the rest,
 * up to 60, through every rarity. */
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
    common("percentPotions", { percentPotions: 2 }, 5, 10),
    { id: "potionSilver", stats: { potionSilver: 0.1 }, rarity: "uncommon", levels: 0, max: 5, after: "percentPotions" },
    { id: "goldBonus", stats: { goldBonus: 2 }, rarity: "rare", levels: 0, max: 5, after: "potionSilver" },
    { id: "freeDefense", stats: { freeDefenseChance: 0.5 }, rarity: "epic", levels: 0, max: 5, after: "goldBonus" },
    { id: "parry", stats: { parry: 1 }, rarity: "legendary", levels: 0, max: 5, after: "freeDefense" },
    common("potionHeal", { potionHeal: 2 }, 5, 10),
    { id: "regen", stats: { regen: 2 }, rarity: "uncommon", levels: 0, max: 5, after: "potionHeal" },
    { id: "shroud", stats: { shroud: 2 }, rarity: "rare", levels: 0, max: 5, after: "regen" },
    { id: "potionMaxHp", stats: { potionMaxHp: 0.01 }, rarity: "epic", levels: 0, max: 5, after: "shroud" },
    { id: "overhealMax", stats: { overhealMax: 5 }, rarity: "legendary", levels: 0, max: 5, after: "potionMaxHp" },
  ],
  door: [
    common("doorGold", { doorGold: 2 }, 5, 10),
    { id: "doorSilver", stats: { doorSilver: 0.1 }, rarity: "uncommon", levels: 0, max: 5, after: "doorGold" },
    { id: "goldBonus", stats: { goldBonus: 1 }, rarity: "rare", levels: 0, max: 5, after: "doorSilver" },
    { id: "freeUtility", stats: { freeUtilityChance: 0.5 }, rarity: "epic", levels: 0, max: 5, after: "goldBonus" },
    { id: "doorChest", stats: { doorChest: 0.2 }, rarity: "legendary", levels: 0, max: 5, after: "freeUtility" },
    common("doorCost", { doorCost: 1 }, 5, 10),
    { id: "doorHeal", stats: { doorHeal: 0.5 }, rarity: "uncommon", levels: 0, max: 5, after: "doorCost" },
    { id: "skeletonKey", stats: { skeletonKey: 1 }, rarity: "rare", levels: 0, max: 5, after: "doorHeal" },
    { id: "lockPick", stats: { lockPick: 1 }, rarity: "epic", levels: 0, max: 5, after: "skeletonKey" },
    { id: "secretKnock", stats: { secretKnock: 1 }, rarity: "legendary", levels: 0, max: 5, after: "lockPick" },
  ],
  key: [
    common("keyHeal", { keyHeal: 1 }, 2, 5),
    { id: "keyOverheal", stats: { keyOverheal: 1 }, rarity: "uncommon", levels: 0, max: 5, after: "keyHeal" },
    common("keyGold", { keyGold: 2 }, 4, 5),
    { id: "keySilver", stats: { keySilver: 0.1 }, rarity: "uncommon", levels: 0, max: 5, after: "keyGold" },
    { id: "goldBonus", stats: { goldBonus: 1 }, rarity: "rare", levels: 0, max: 5, after: "keySilver" },
    { id: "freeUtility", stats: { freeUtilityChance: 0.5 }, rarity: "epic", levels: 0, max: 5, after: "goldBonus" },
    { id: "keyChest", stats: { keyChest: 0.2 }, rarity: "legendary", levels: 0, max: 5, after: "freeUtility" },
    common("keyFind", { keyFind: 1 }, 4, 5),
    { id: "plainDoorCost", stats: { plainDoorCost: 1 }, rarity: "uncommon", levels: 0, max: 5, after: "keyFind" },
    { id: "heartDoorCost", stats: { heartDoorCost: 1 }, rarity: "rare", levels: 0, max: 5, after: "plainDoorCost" },
    { id: "locksmith", stats: { doubleKey: 1 }, rarity: "epic", levels: 0, max: 5, after: "heartDoorCost" },
    { id: "masterKey", stats: { masterKey: 0.2 }, rarity: "legendary", levels: 0, max: 5, after: "locksmith" },
  ],
  monster: [
    common("attack", { foeAttack: 2 }, 4, 5),
    { id: "critChance", stats: { critChance: 1 }, rarity: "uncommon", levels: 0, max: 5, after: "attack" },
    { id: "critFactor", stats: { critFactor: 2 }, rarity: "rare", levels: 0, max: 5, after: "critChance" },
    { id: "killXp", stats: { killXp: 2 }, rarity: "epic", levels: 0, max: 5, after: "critFactor" },
    { id: "surpriseAttack", stats: { surpriseAttack: 5 }, rarity: "legendary", levels: 0, max: 5, after: "killXp" },
    common("defense", { foeDefense: 2 }, 3, 5),
    { id: "shroud", stats: { shroud: 2 }, rarity: "uncommon", levels: 0, max: 5, after: "defense" },
    { id: "weaken", stats: { foeAttackCut: 1 }, rarity: "rare", levels: 0, max: 5, after: "shroud" },
    { id: "stealOverheal", stats: { stealOverheal: 5 }, rarity: "epic", levels: 0, max: 5, after: "weaken" },
    common("gold", { foeGold: 1 }, 3, 5),
    { id: "silver", stats: { foeSilver: 1 }, rarity: "uncommon", levels: 0, max: 5, after: "gold" },
    { id: "spawnRate", stats: { moreEnemies: 2 }, rarity: "rare", levels: 0, max: 5, after: "silver" },
  ],
  atkUp: [
    common("shard", { attackShard: 2 }, 5, 10),
    { id: "sharper", stats: { attackShard: 3 }, rarity: "uncommon", levels: 0, max: 5, after: "shard" },
    { id: "critChance", stats: { critChance: 2 }, rarity: "rare", levels: 0, max: 5, after: "sharper" },
    { id: "freeOffense", stats: { freeOffenseChance: 1 }, rarity: "epic", levels: 0, max: 5, after: "critChance" },
    { id: "powerStrike", stats: { powerStrike: 1 }, rarity: "legendary", levels: 0, max: 5, after: "freeOffense" },
    common("gold", { attackShardGold: 10 }, 5, 10),
    { id: "shardSilver", stats: { attackShardSilver: 0.1 }, rarity: "uncommon", levels: 0, max: 5, after: "gold" },
    { id: "silverBoost", stats: { silverBonus: 1 }, rarity: "rare", levels: 0, max: 5, after: "shardSilver" },
    { id: "goldBonus", stats: { goldBonus: 2 }, rarity: "epic", levels: 0, max: 5, after: "silverBoost" },
    { id: "takedown", stats: { takedown: 10 }, rarity: "legendary", levels: 0, max: 5, after: "goldBonus" },
  ],
  defUp: [
    common("shard", { defenseShard: 2 }, 5, 10),
    { id: "sturdier", stats: { defenseShard: 3 }, rarity: "uncommon", levels: 0, max: 5, after: "shard" },
    { id: "regen", stats: { regen: 10 }, rarity: "rare", levels: 0, max: 5, after: "sturdier" },
    { id: "freeDefense", stats: { freeDefenseChance: 1 }, rarity: "epic", levels: 0, max: 5, after: "regen" },
    { id: "parry", stats: { parry: 1 }, rarity: "legendary", levels: 0, max: 5, after: "freeDefense" },
    common("gold", { defenseShardGold: 10 }, 5, 10),
    { id: "shardSilver", stats: { defenseShardSilver: 0.1 }, rarity: "uncommon", levels: 0, max: 5, after: "gold" },
    { id: "silverBoost", stats: { silverBonus: 1 }, rarity: "rare", levels: 0, max: 5, after: "shardSilver" },
    { id: "goldBonus", stats: { goldBonus: 2 }, rarity: "epic", levels: 0, max: 5, after: "silverBoost" },
    { id: "tangle", stats: { tangle: 5 }, rarity: "legendary", levels: 0, max: 5, after: "goldBonus" },
  ],
  torch: [
    common("attack", { bossAttack: 1 }, 5, 10),
    { id: "bossDefense", stats: { bossDefense: 1 }, rarity: "uncommon", levels: 0, max: 10, after: "attack", unlocks: 5 },
    { id: "bossShroud", stats: { bossShroud: 2 }, rarity: "rare", levels: 0, max: 5, after: "bossDefense" },
    { id: "greaterTangle", stats: { greaterTangle: 5 }, rarity: "epic", levels: 0, max: 5, after: "bossShroud" },
    { id: "revive", stats: { reviveChance: 1 }, rarity: "legendary", levels: 0, max: 5, after: "greaterTangle" },
    common("gold", { bossGold: 2 }, 5, 5),
    { id: "cellDrop", stats: { bossCells: 1 }, rarity: "uncommon", levels: 0, max: 5, after: "gold" },
    { id: "cellHaul", stats: { bossCells: 2 }, rarity: "rare", levels: 0, max: 5, after: "cellDrop" },
    { id: "greaterTakedown", stats: { greaterTakedown: 6 }, rarity: "epic", levels: 0, max: 5, after: "cellHaul" },
    { id: "chestCells", stats: { chestCells: 1 }, rarity: "legendary", levels: 0, max: 5, after: "greaterTakedown" },
  ],
  chest: [
    // Its one common node holds all ten of the card's first levels, the nodes after it opening at five.
    { ...common("gold", { chestGold: 2 }, 10, 10), unlocks: 5 },
    { id: "goldUp", stats: { chestGold: 3 }, rarity: "uncommon", levels: 0, max: 5, after: "gold" },
    { id: "silver", stats: { chestSilver: 1 }, rarity: "rare", levels: 0, max: 5, after: "goldUp" },
    { id: "treasureFloor", stats: { treasureFloor: 0.5 }, rarity: "epic", levels: 0, max: 5, after: "silver" },
    { id: "rarityUp", stats: { rarityUp: 1 }, rarity: "legendary", levels: 0, max: 5, after: "treasureFloor" },
    { id: "supplyChance", stats: { supplyChance: 0.2 }, rarity: "uncommon", levels: 0, max: 10, after: "gold" },
    { id: "equipmentChance", stats: { equipmentChance: 0.1 }, rarity: "rare", levels: 0, max: 10, after: "supplyChance" },
    { id: "double", stats: { chestDouble: 3 }, rarity: "epic", levels: 0, max: 5, after: "equipmentChance" },
    { id: "triple", stats: { chestTriple: 2 }, rarity: "legendary", levels: 0, max: 5, after: "double" },
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
/** The levels a node's parent must hold before the node takes any: its
 * `unlocks` where it names them, else all it starts with (a common
 * node's), or one for a node a buy opened. */
export const opensAt = (parent: CardTreeNode) => parent.unlocks ?? Math.max(1, parent.levels);
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
  ["floorGold", "floorSilver", "goldBonus", "silverBonus", "freeOffense", "freeDefense", "freeUtility", "freeOffenseChance", "freeDefenseChance", "freeUtilityChance", "floorHeal", "overhealMax", "stairSkip", "percentPotions", "potionHeal", "potionMaxHp", "potionSilver", "regen", "shroud", "parry", "reviveChance",
    "doorCost", "doorGold", "doorSilver", "doorHeal", "skeletonKey", "lockPick", "secretKnock", "doorChest", "keyChest", "keyFind", "keyGold", "keyHeal", "keyOverheal", "keySilver", "plainDoorCost", "heartDoorCost", "doubleKey", "masterKey", "foeAttack", "foeDefense", "foeGold", "foeSilver", "critChance", "critFactor", "killXp", "surpriseAttack", "foeAttackCut", "stealOverheal", "moreEnemies", "attackShard", "defenseShard", "attackShardGold", "defenseShardGold",
    "attackShardSilver", "defenseShardSilver", "powerStrike", "takedown", "tangle", "greaterTakedown", "greaterTangle",
    "bossAttack", "bossDefense", "bossShroud", "bossGold", "bossCells", "chestGold", "chestSilver", "chestCells", "supplyChance", "equipmentChance", "treasureFloor", "rarityUp", "chestDouble", "chestTriple"].map((s) => [s, 0]),
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
/** The percent `run`'s enemies' ATK is cut by (ENEMY's Weaken), fixed as it went inside. */
export const runFoeCut = (run: Pick<RunCore, "cardTrees">) => treeBonus(run.cardTrees).foeAttackCut;
/** What each Free Upgrade group's chance a floor is multiplied by (STAIRS'
 * tree), as `rollFreeTraining` takes it. */
export const freeUpFactors = (bonus: TreeBonus) =>
  ({ offense: treeFactor(bonus, "freeOffense"), defense: treeFactor(bonus, "freeDefense"), utility: treeFactor(bonus, "freeUtility") });
/** The chances each Free Upgrade group also rolls a floor, in hundredths of
 * a percent (ATK UP's Free Offense, HEAL's and DEF UP's Free Defense,
 * DOOR's and KEY's Free Utility), as
 * `rollFreeTraining` takes them. */
export function freeUpChances(bonus: TreeBonus) {
  const chances = { ...(bonus.freeOffenseChance ? { offense: snap(bonus.freeOffenseChance * 100) } : {}), ...(bonus.freeDefenseChance ? { defense: snap(bonus.freeDefenseChance * 100) } : {}), ...(bonus.freeUtilityChance ? { utility: snap(bonus.freeUtilityChance * 100) } : {}) };
  return Object.keys(chances).length ? chances : undefined;
}
/** The Overheal ceiling `overheal` (in thousandths of max HP, Overheal
 * training's) with the trees' Overheal Max percents of max HP added, skill
 * or not (STAIRS' and HEAL's legendary nodes, which open a ceiling above
 * max HP by themselves). */
export const treeOverheal = (overheal: number, bonus: TreeBonus) => (bonus.overhealMax ? snap(overheal + bonus.overhealMax * 10) : overheal);
