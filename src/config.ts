import type { EnemyStrength } from "./entities.ts";
import { intPow, snap } from "./exact.ts";
export const UNGUARDED_LOOT_CHANCE = 1 / 1000;
export const WIDTH = 30;
export const CHUNK = 20;
export const START_X = 15;
export const VIEWPORT_TILES = 17;
export const TOWER_WIDTH = 17;
export const TOWER_HEIGHT = 17;
export const TOWER_START_X = 8;
/** Tower floors come in isolated sections of this many rooms. */
export const TOWER_SECTION = 10;
export const SAVE_KEY = "towerdelve.v1";
/** Where saves were kept before the game was named Tower Delve; `load` reads it when nothing is under `SAVE_KEY`. */
export const OLD_SAVE_KEY = "towerincramental.v1";
export const COLORS = { yellow: "#eac16b", blue: "#6dbdf1", red: "#df797e" };
export type KeyColor = keyof typeof COLORS;
export type Currency = "courage" | "inspiration";
/** Upgrades that make the character stronger say so in `grants` (what one
 * rank adds; see loadout.ts), which also writes their description. */
/** Focus uses a run starts with, once the Focus skill is owned. */
export const FOCUS_PER_RUN = 1;
export const UPGRADES = [
  { id: "delve", name: "Into the depths", description: "Unlock Delve and the Courage skill tree", base: 3, max: 1, currency: "inspiration" },
  { id: "legacy", name: "An enduring legacy", description: "Unlock the Legacy skill tree and unlock Defend", base: 8, max: 1, currency: "courage" },
  {
    id: "revive",
    name: "Revive",
    description: "When a strike would fell you, a 0.5% chance to rise at full HP and fight on: opens Revive training",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "undos",
    name: "Echoes of time",
    grants: { undos: 1 },
    base: 5,
    max: 4,
    currency: "courage",
  },
  {
    id: "hp",
    name: "Vital ember",
    grants: { maxHp: 20 },
    base: 3,
    max: 50,
    currency: "courage",
  },
  {
    id: "attack",
    name: "Tempered edge",
    grants: { attack: 2 },
    base: 4,
    max: 50,
    currency: "courage",
  },
  {
    id: "defense",
    name: "Stone skin",
    grants: { defense: 1 },
    base: 4,
    max: 50,
    currency: "courage",
  },
  {
    id: "yellow",
    name: "Gilded passage",
    grants: { yellow: 1 },
    base: 3,
    max: 10,
    currency: "courage",
  },
  {
    id: "blue",
    name: "Azure passage",
    grants: { blue: 1 },
    base: 5,
    max: 10,
    currency: "courage",
  },
  {
    id: "red",
    name: "Crimson passage",
    grants: { red: 1 },
    base: 7,
    max: 10,
    currency: "courage",
  },
  {
    id: "quality",
    name: "Heirloom steel",
    grants: { attack: 2, defense: 1 },
    words: { attack: "weapon attack", defense: "armor defense" },
    base: 6,
    max: 20,
    currency: "courage",
  },
  {
    id: "moveSpeed",
    name: "Movement Speed",
    description: "Unlock the Movement speed setting: 1 to 3 steps a second",
    base: 1,
    max: 1,
    currency: "courage",
  },
  {
    id: "instantCombat",
    name: "Instant Combat",
    description: "Unlock the Animate fights setting: turn it off to settle each fight at once, in one step",
    base: 1,
    max: 1,
    currency: "courage",
  },
  {
    id: "aiMemory", name: "Route memory", description: "Delve: remember explored routes, then recognize dead ends", base: 3, max: 2, currency: "courage",
  },
  {
    id: "aiEvaluation", name: "Resource judgment", description: "Delve: learn combat cost, key cost, contextual rewards, then scarcity", base: 4, max: 4, currency: "courage",
  },
  {
    id: "aiLookahead", name: "Labyrinth scouting", description: "Delve: +4 scouting radius and +2 interactions of route lookahead", base: 5, max: 4, currency: "courage",
  },
  {
    id: "extraKey",
    name: "Extra Key",
    description: "Open the Yellow Key provision on the Gear page: a yellow key carried into every run",
    base: 1,
    max: 1,
    currency: "courage",
  },
  {
    id: "handOrdering",
    name: "Combat Stance",
    description: "Open the Deck, where you reorder the cards in your hand before a run",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "combatStance",
    name: "Buildout",
    description: "Unlock the Deck: add its cards to your hand, or set them aside, to choose what a run heads for",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "largerHand",
    name: "Larger Hand",
    description: "Your hand holds one more card, and more hand slots can be bought with Gems on the Deck page",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardHeal",
    name: "Heal",
    description: "Add the HEAL card to your deck: it moves you toward the closest healing potion",
    card: "heal",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "greaterHeal",
    name: "Greater Heal",
    description: "Unlock Potion HP research in the Archives: every potion restores more HP",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "recovery",
    name: "Recovery",
    description: "Percent potions appear on the floors (2% of potions, more with Find Potion): each restores 35 HP and a share of your max HP, raised by Potion % training",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "findPotion",
    name: "Find Potion",
    description: "More of the potions you find are percent potions: opens Find Potion training",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "shroud",
    name: "Shroud",
    description: "A shroud blocks the first damage of every fight, and opens Shroud training",
    grants: { shroud: 1 },
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "cardGear",
    name: "Equipment",
    description: "Add the EQUIPMENT card to your deck: it moves you toward the closest ATK or DEF pickup",
    card: "equipment",
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "training",
    name: "Training",
    description: "Open the Training tab on the Upgrades page, where you spend the training points each level earns",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "blueKey",
    name: "Blue Key",
    description: "Add the BLUE KEY card to your deck: it moves you toward the closest blue key",
    card: "blueKey",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "gear",
    name: "Gear",
    description: "Open the Gear page: provisions bought with Gold, carried into every run",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "onTheJob",
    name: "On the Job",
    description: "Inside a run, train with the Silver you find: the Training buttons under your hand buy ranks that last the run",
    base: 1,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "focus",
    name: "Focus",
    description: `Inside a run, press a card in your hand to put it ahead of the others until it reaches its target (${FOCUS_PER_RUN} use a run)`,
    base: 5,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "archives",
    name: "Archives",
    description: "Unlock the Archives on the Upgrades page: research that lasts, paid in Gold and real time",
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "fasterTrainers",
    name: "Faster Trainers",
    description: "Open Faster Trainers research in the Archives: trainers train ranks faster",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "spareChange",
    name: "Spare Change",
    description: "Every floor climbed for the first time in a run pays Gold: opens Gold / Floor training, and Gold / Floor research in the Archives",
    base: 3,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "wealthy",
    name: "Wealthy",
    description: "All Silver found in a run is multiplied: opens Silver Bonus training, and Silver Bonus research in the Archives",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "loot",
    name: "Loot",
    description: "Each kill pays more Gold: opens Gold / Kill training, and Gold / Kill research in the Archives",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "wishingWell",
    name: "Wishing Well",
    description: "Every floor climbed for the first time in a run pays Silver: opens Silver / Floor training, and Silver / Floor research in the Archives",
    base: 2,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "inspirationUndos",
    name: "Rehearsed steps",
    description: "Rewind an action, and open Undo Count research in the Archives",
    grants: { undos: 1 },
    base: 10,
    max: 1,
    currency: "inspiration",
  },
  {
    id: "wisdomFocus",
    name: "Quiet focus",
    description: "A placeholder Wisdom upgrade",
    base: 5,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "wisdomMemory",
    name: "Long memory",
    description: "A placeholder Wisdom upgrade",
    base: 7,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "wisdomSight",
    name: "Far sight",
    description: "A placeholder Wisdom upgrade",
    base: 9,
    max: 5,
    currency: "inspiration",
  },
  {
    id: "renownBanner",
    name: "Raised banner",
    description: "A placeholder Renown upgrade",
    base: 6,
    max: 5,
    currency: "courage",
  },
  {
    id: "renownOath",
    name: "Hero's oath",
    description: "A placeholder Renown upgrade",
    base: 8,
    max: 5,
    currency: "courage",
  },
  {
    id: "renownCrown",
    name: "Laurel crown",
    description: "A placeholder Renown upgrade",
    base: 10,
    max: 5,
    currency: "courage",
  },
] as const;
export type UpgradeId = (typeof UPGRADES)[number]["id"];
export const cost = (id: UpgradeId, level: number) =>
  Math.ceil(UPGRADES.find((u) => u.id === id)!.base * intPow(1.65, level));
/** Gold a beaten enemy pays, by its strength, in both modes: every victory
 * pays some, beside its Silver. */
export const ENEMY_GOLD: Record<EnemyStrength, number> = { weak: 1, normal: 1, strong: 2, elite: 4, boss: 5 };
/** Silver, the currency spent inside a run, that a beaten enemy pays per
 * base amount, by its strength. */
export const SILVER_MULTIPLIER: Record<EnemyStrength, number> = { weak: 1, normal: 2, strong: 3, elite: 4, boss: 5 };
/** Silver a beaten enemy pays on equivalent floor `floor` (0 is the first):
 * a weak enemy's 1, plus 1 every ten floors (2 from floor 11), times its
 * strength's multiplier. */
export const silverForKill = (strength: EnemyStrength, floor: number) =>
  (1 + Math.floor(Math.max(0, floor) / TOWER_SECTION)) * SILVER_MULTIPLIER[strength];
/** Gold the Delve pays at a run's end: one for each treasure opened. */
export const goldReward = (treasures: number) => treasures;
/** XP a beaten enemy pays per base amount, by its strength (the same
 * proportions as the forks' `GATE_VALUE`). */
export const XP_MULTIPLIER: Record<EnemyStrength, number> = { weak: 2, normal: 3, strong: 5, elite: 8, boss: 12 };
/** The base XP a kill pays on equivalent floor `floor` (0 is the first): 3,
 * rising with the square root of the floor (×2 by floor 30, ×3.3 by 100,
 * ×10 by 1000). The XP a level needs rises faster, so each floor is worth a
 * smaller share of a level than the one before. */
export const xpBase = (floor: number) => 3 * Math.sqrt(1 + Math.max(0, floor) / TOWER_SECTION);
/** XP a beaten enemy pays on equivalent floor `floor`, in both modes. */
export const xpForKill = (strength: EnemyStrength, floor: number) =>
  Math.round(xpBase(floor) * XP_MULTIPLIER[strength]);
/** The lifetime XP that reaches `level`: 20 × level × (level + 1) ×
 * (1 + level / 5), written in whole numbers. It grows with the cube of the
 * level, faster than kills pay more on higher floors, so levels come more
 * slowly the higher the hero climbs, even replaying the floors below. */
export const xpForLevel = (level: number) => 4 * level * (level + 1) * (level + 5);
/** The level `xp` lifetime XP reaches, found among the exact whole-number
 * costs (a cube root could differ between engines). */
export function levelForXp(xp: number) {
  let low = 0, high = 1;
  while (xpForLevel(high) <= xp) high *= 2;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (xpForLevel(mid) <= xp) low = mid;
    else high = mid;
  }
  return low;
}
/** Training points each level earns, to spend on the hero's stats. */
export const TRAINING_PER_LEVEL = 3;
/** The groups the Training tab, and a run's training bar, show the rows
 * in, in order. */
export const TRAINING_GROUPS = { offense: "Offense", defense: "Defense", utility: "Utility" } as const;
/** What training raises, each rank costing `cost` points. A stat row is
 * worth `base` × (1 + level / `growth`) of `stat` at the hero's level (see
 * `trainingWorth`), so every rank already bought grows as the hero levels
 * up and saving points up never pays. Shroud adds to the damage the
 * shroud blocks each fight. Potion % adds `POTION_PERCENT_RANK`
 * to what a percent potion restores, Find Potion `FIND_POTION_RANK` to
 * the chance a potion is a percent potion, Gold / Floor
 * `FLOOR_GOLD_RANK` to the Gold a new floor pays and Silver / Floor
 * `FLOOR_SILVER_RANK` to its Silver, and Silver Bonus and Gold / Kill
 * `BONUS_RANK` percent to their multiplier, the same at every level. A row
 * with `requires` shows, and trains, only once that upgrade is owned; one
 * with `max` trains no further than that many ranks. */
export const TRAINING = [
  { id: "hp", name: "Max HP", group: "defense", stat: "maxHp", base: 10, growth: 10, cost: 1, description: "Raises maximum HP." },
  { id: "attack", name: "ATK", group: "offense", stat: "attack", base: 1, growth: 5, cost: 3, description: "Raises ATK, the damage each strike deals before the enemy's DEF." },
  { id: "defense", name: "DEF", group: "defense", stat: "defense", base: 1, growth: 12, cost: 2, description: "Raises DEF, taken off the damage of every enemy strike." },
  { id: "shroud", name: "Shroud", group: "defense", stat: "shroud", base: 1, growth: 10, cost: 1, requires: "shroud", description: "Raises the damage the shroud blocks at the start of every fight." },
  { id: "potion", name: "Potion %", group: "defense", requires: "recovery", cost: 1, description: "Percent potions restore more of your maximum HP." },
  { id: "findPotion", name: "Find Potion", group: "defense", requires: "findPotion", cost: 1, max: 72, description: "More of the potions found are percent potions." },
  { id: "revive", name: "Revive", group: "defense", requires: "revive", cost: 1, max: 99, description: "Raises the chance a strike that would fell you revives you at full HP instead." },
  { id: "floorGold", name: "Gold / Floor", group: "utility", requires: "spareChange", cost: 1, description: "Raises the Gold paid for each floor climbed for the first time in a run." },
  { id: "floorSilver", name: "Silver / Floor", group: "utility", requires: "wishingWell", cost: 1, description: "Raises the Silver paid for each floor climbed for the first time in a run." },
  { id: "silverBonus", name: "Silver Bonus", group: "utility", requires: "wealthy", cost: 1, description: "Multiplies all Silver found in a run." },
  { id: "killGold", name: "Gold / Kill", group: "utility", requires: "loot", cost: 1, description: "Multiplies the Gold each kill pays." },
] as const;
export type TrainingId = (typeof TRAINING)[number]["id"];
export type TrainingRow = (typeof TRAINING)[number];
/** A row that raises one of the character's stats. */
export type StatTrainingRow = Extract<TrainingRow, { stat: string }>;
export const isStatRow = (row: TrainingRow): row is StatTrainingRow => "stat" in row;
/** Whether `row` can be seen and trained with `upgrades` owned. */
export const trainingOpen = (row: TrainingRow, upgrades: Record<UpgradeId, number>) =>
  !("requires" in row) || upgrades[row.requires] > 0;
/** What a percent potion restores beyond its HP, in hundredths of a percent
 * of max HP: 1% with Recovery, and 0.25% more for each Potion % rank. */
export const POTION_PERCENT_BASE = 100, POTION_PERCENT_RANK = 25;
/** The chance each potion that may be one is a percent potion, in
 * hundredths of a percent: 2% with Recovery, and 0.25% more for each Find
 * Potion rank, up to 20% (72 ranks). */
export const FIND_POTION_BASE = 200, FIND_POTION_RANK = 25, FIND_POTION_MAX = 2000;
/** The chance each strike that would fell the hero revives it instead, in
 * hundredths of a percent: 0.5% with Revive, and 0.5% more for each Revive
 * rank, up to 50% (99 ranks). */
export const REVIVE_BASE = 50, REVIVE_RANK = 50, REVIVE_MAX = 5000;
/** The Gold each floor climbed for the first time in a run pays, before
 * the tier's bonus and Gold / Floor research: 3 with Spare Change, and 2
 * more for each Gold / Floor rank. */
export const FLOOR_GOLD_BASE = 3, FLOOR_GOLD_RANK = 2;
/** The Silver each floor climbed for the first time in a run pays, before
 * Silver / Floor research and Silver Bonus: 3 with Wishing Well, and 3
 * more for each Silver / Floor rank. */
export const FLOOR_SILVER_BASE = 3, FLOOR_SILVER_RANK = 3;
/** What each Silver Bonus or Gold / Kill rank adds to its multiplier, in
 * percent (×1 with no ranks). */
export const BONUS_RANK = 3;
/** A price that rises with each purchase (a Training row's Silver inside a
 * run, a provision's Gold): the first costs `base`, and each one after
 * costs more than the last by `step` plus the number already bought, the
 * `step` growing by `growth` every five (see `schedulePrice`). Base 5: +1+N
 * for the next five, then +4+N, +7+N … Or, with `ratio`, each costs
 * `ratio` times the one before. */
export type PriceSchedule = { base: number; step: number; growth: number } | { base: number; ratio: number };
/** What the purchase after `bought` costs on `schedule`: its base, and for
 * the k-th after it `step + k` more than the one before, `step` rising by
 * `growth` every five, summed here at once (or `ratio` times the one
 * before). */
export function schedulePrice(schedule: PriceSchedule, bought: number) {
  if ("ratio" in schedule) return schedule.base * intPow(schedule.ratio, bought);
  const { base, step, growth } = schedule;
  const fives = Math.floor(bought / 5), rest = bought % 5;
  return base + bought * step + bought * (bought + 1) / 2 + growth * (5 * fives * (fives - 1) / 2 + rest * fives);
}
/** Rows open from the start. */
const cheap: PriceSchedule = { base: 5, step: 1, growth: 3 };
/** Max HP: the cheapest, rising a little more slowly. */
const vital: PriceSchedule = { base: 3, step: 1, growth: 2 };
/** Rows a skill opens: steeper, so ranks from Inspiration's Training points
 * stay worth more than Silver's. */
const opened: PriceSchedule = { base: 10, step: 2, growth: 3 };
/** Rows a deeper skill opens. */
const deep: PriceSchedule = { base: 20, step: 4, growth: 4 };
/** Training bought with Silver inside a run, lasting only for that run:
 * each row's price schedule. The rows open from the start cost least, the
 * ones later skills open more. */
export const RUN_TRAINING_PRICES: Record<TrainingId, PriceSchedule> = {
  hp: vital,
  attack: cheap,
  defense: cheap,
  shroud: opened,
  potion: opened,
  findPotion: deep,
  revive: deep,
  floorGold: opened,
  floorSilver: opened,
  silverBonus: opened,
  killGold: opened,
};
/** The highest level a row without its own `max` reaches in a run, its
 * ranks and those bought there together. */
export const RUN_TRAINING_CAP = 1000;
/** What one rank of `row` is worth at `level`, unrounded. */
export const trainingWorth = (row: StatTrainingRow, level: number) => row.base * (1 + level / row.growth);
/** What `ranks` ranks of `row` add to the character at `level`, rounded
 * once. */
export const trained = (row: StatTrainingRow, ranks: number, level: number) => snap(ranks * trainingWorth(row, level));
/** Provisions, bought with Gold on the Gear page and kept for good: each
 * one bought adds its grants to every run. Each is priced by a schedule
 * like run training's (`schedulePrice`), from its `price.base` Gold. One
 * with `requires` shows, and sells, only once that upgrade is owned. */
export const GOLD_SHOP = [
  {
    id: "heal",
    name: "Traveler's elixir",
    grants: { maxHp: 20 },
    words: { maxHp: "max HP every run" },
    price: { base: 5, step: 1, growth: 3 },
  },
  {
    id: "guard",
    name: "Aegis charm",
    grants: { defense: 1 },
    words: { defense: "defense every run" },
    price: { base: 10, step: 2, growth: 3 },
  },
  {
    id: "edge",
    name: "Whetstone",
    grants: { attack: 1 },
    words: { attack: "attack every run" },
    price: { base: 15, step: 2, growth: 3 },
  },
  {
    id: "yellowKey",
    name: "Yellow Key",
    grants: { yellow: 1 },
    words: { yellow: "yellow key every run" },
    price: { base: 100, ratio: 4 },
    requires: "extraKey",
  },
] as const;
export type GoldItemId = (typeof GOLD_SHOP)[number]["id"];
