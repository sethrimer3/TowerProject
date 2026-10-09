import { FOCUS_PER_RUN, IGNORE_PER_RUN, REGAIN_FLOORS, TARGET_PER_RUN, levelForXp, type UpgradeId } from "./config.ts";
import type { Settings } from "./settings.ts";
import { finite as finiteIn, isRecord, wholeIn } from "./decode.ts";
import { intPow } from "./exact.ts";
import { BUY_QUANTITIES, quantityLabel } from "./buy-quantity.ts";

// The Archives: research that lasts between runs. An archivist takes one
// research project at a time; each level costs Gold and real time, and once
// done changes the game for good. What research does is data: each level's
// effect names a number the game reads through `researched`, so a new
// project needs a row here and, for a new kind of effect, one target.
//
// Every time here is a wall-clock timestamp (ms), passed in, so research
// runs on while the game is closed and tests set the clock.

/** The groups the research library can be filtered by. */
/** The research categories, in the order the library lists its groups. */
export const RESEARCH_CATEGORIES = {
  qualityOfLife: "Quality of life",
  progression: "Progression",
  abilities: "Abilities",
  offense: "Offense",
  defense: "Defense",
  economy: "Economy",
  equipment: "Equipment",
  special: "Special",
} as const;
export type ResearchCategory = keyof typeof RESEARCH_CATEGORIES;

const count = (n: number) => `${n}`;
const percent = (n: number) => `${n}%`;
/** A number kept in tenths of a percent (whole numbers, so sums stay exact) as a percent. */
const tenths = (n: number) => `${n / 10}%`;
/** A speed (0 = as fast as without research) as a percent of the base. */
const speed = (n: number) => `${Math.round(100 + n * 100)}%`;
/** The numbers research can change, each with its name, the base the game
 * reads it from (before any research) and how a total of it reads. */
export const RESEARCH_TARGETS = {
  /** Focus uses a run starts with. */
  focusPerRun: { name: "Focus Uses", base: FOCUS_PER_RUN, shown: count },
  /** New floors a run climbs to regain a Focus use, once Refocus is owned. */
  refocusFloors: { name: "Floors per Focus", base: REGAIN_FLOORS, shown: count },
  /** Ignore uses a run starts with. */
  ignorePerRun: { name: "Ignore Uses", base: IGNORE_PER_RUN, shown: count },
  /** New floors a run climbs to regain an Ignore use, once Ignore More is owned. */
  ignoreFloors: { name: "Floors per Ignore", base: REGAIN_FLOORS, shown: count },
  /** Target uses a run starts with. */
  targetPerRun: { name: "Target Uses", base: TARGET_PER_RUN, shown: count },
  /** New floors a run climbs to regain a Target use, once Target More is owned. */
  targetFloors: { name: "Floors per Target", base: REGAIN_FLOORS, shown: count },
  /** The run's speed arrows' most steps a second, once Movement Speed is owned. */
  moveSpeed: { name: "Steps / Sec", base: 3, shown: count },
  /** Undos the hero can store, once Rehearsed steps has given the first;
   * its base is the loadout's own undos, so the Archives page reads it there. */
  undoCapacity: { name: "Undos Stored", base: 0, shown: count },
  /** The percent of its HP a potion restores, from 100 (red potions aside). */
  potionHeal: { name: "Potion Healing", base: 100, shown: percent },
  /** The percent of its Regen training a step regains, from 100. */
  regenPercent: { name: "Regen", base: 100, shown: percent },
  /** The percent of the ATK a run starts with that the hero has, from 100. */
  attackPercent: { name: "ATK", base: 100, shown: percent },
  /** The percent of the DEF a run starts with that the hero has, from 100. */
  defensePercent: { name: "DEF", base: 100, shown: percent },
  /** The percent of the max HP a run starts with that the hero has, from 100. */
  maxHpPercent: { name: "Max HP", base: 100, shown: percent },
  /** The percent of the shroud a run starts with that the hero has, from 100. */
  shroudPercent: { name: "Shroud", base: 100, shown: percent },
  /** The percent of its Gold / Floor a new floor pays, from 100. */
  floorGold: { name: "Gold per Floor", base: 100, shown: percent },
  /** The percent of its Silver / Floor a new floor pays, from 100. */
  floorSilver: { name: "Silver per Floor", base: 100, shown: percent },
  /** The percent of the Silver found that a run pays, from 100. */
  silverBonus: { name: "Silver Found", base: 100, shown: percent },
  /** The percent of its toll a Heart Door drains, from 100. */
  heartToll: { name: "Heart Door Toll", base: 100, shown: percent },
  /** The percent of the Gold a skipped floor's chests and battles held that
   * skipping it pays, from 0. */
  floorSkipGold: { name: "Floor Skip Gold", base: 0, shown: percent },
  /** The percent of its Gold a kill pays, from 100. */
  killGold: { name: "Gold per Kill", base: 100, shown: percent },
  /** The chance, in tenths of a percent, that a new floor climbed hands
   * the hero a yellow key. */
  yellowKeyChance: { name: "Yellow Key Chance", base: 0, shown: tenths },
  /** How much of a key each key colour a door takes costs, in tenths of a
   * percent, from 1,000 (a whole key). */
  keyCost: { name: "Key Cost", base: 1000, shown: tenths },
  /** The share of the Silver held that a new floor climbed adds, in tenths
   * of a percent. */
  interestRate: { name: "Interest", base: 0, shown: tenths },
  /** The most Silver Interest pays a floor. */
  interestCap: { name: "Max Interest", base: 50, shown: count },
  /** The percent of its Gold a kill the hero's first strike makes pays, from 100. */
  instakillGold: { name: "Gold per Instakill", base: 100, shown: percent },
  /** Silver a run has in hand when it goes inside. */
  startingSilver: { name: "Starting Silver", base: 0, shown: count },
  /** How fast trainers work: a rank of `d` takes d / (1 + speed). */
  trainingSpeed: { name: "Training Speed", base: 0, shown: speed },
  /** Tiles the hand's first step toward a new target may rush across, once Rush is owned. */
  rushTiles: { name: "Tiles Rushed", base: 0, shown: count },
  /** Buy quantities opened past x1: x5, x10, x100, then Max. */
  buyQuantity: { name: "Buy Quantity", base: 0, shown: (n: number) => quantityLabel(BUY_QUANTITIES[Math.min(n, BUY_QUANTITIES.length - 1)]!) },
  /** How fast archivists work: a level of `d` hours takes d / (1 + speed). */
  researchSpeed: { name: "Research Speed", base: 0, shown: speed },
  /** The percent of its Gold a research level costs, in tenths of a
   * percent, from 1,000 (the full price). */
  researchCost: { name: "Research Cost", base: 1000, shown: tenths },
} as const;
export type ResearchTarget = keyof typeof RESEARCH_TARGETS;

/** How an effect changes its target. Levels add up: every completed level's
 * effect applies, the adds summed, then the multipliers; a `set` replaces
 * the whole result with the latest level's value. */
export type ResearchEffect = { target: ResearchTarget; op: "add" | "multiply" | "set"; value: number };
/** What a research level costs and gives. */
export type ResearchLevel = { gold: number; hours: number; effect: ResearchEffect };
/** Something a research project needs before it can start: an owned skill,
 * another project's level, or the hero's level. */
export type ResearchRequirement =
  | { upgrade: UpgradeId }
  | { anyUpgrade: UpgradeId[] }
  | { research: string; level: number }
  | { playerLevel: number };
export type ResearchDefinition = {
  name: string;
  description: string;
  categories: ResearchCategory[];
  requires: ResearchRequirement[];
  /** Level 1 first; the project's maximum level is its length. */
  levels: ResearchLevel[];
  /** When set, only `levels` of them are open for each of `upgrades`
   * owned (Undo Count: 4 for each of Rehearsed steps and Echoes of time). */
  levelsPer?: { upgrades: UpgradeId[]; levels: number };
};

/** Focus Count and Undo Count: +1 to `target` a level, for nine levels
 * (Movement Speed takes the first six; Heart Door Resilience, −5% a level,
 * ten, and Floor Skip Reward, +10% a level, eleven). Level 1 costs 500 Gold
 * and takes 8 hours; each level after takes 8 hours more, and costs 500 × n
 * Gold more than level n before it (500, 1000, 2000, 3500, …). */
const countLevels = (target: ResearchTarget, length = 9, value = 1) => Array.from({ length }, (_, i): ResearchLevel => ({
  gold: 500 * (1 + (i * (i + 1)) / 2),
  hours: 8 * (i + 1),
  effect: { target, op: "add", value },
}));

/** Potion HP (+3% potion healing a level), Regen (+3% of the HP Regen
 * training gives a step, a level), ATK (+2% a level), DEF and Max HP (+3%
 * a level), Shroud (+4% a level, to ×5), Gold / Floor (+5% of the Gold a new
 * floor pays a level) and Pocket Money (+5 starting Silver a level), for
 * 100 levels each. The first four
 * are quick, to draw players in (15 s for 10 Gold, 1 min for 25, 5 min for
 * 50, 10 min for 75); then the formula starts over from level 5, so the
 * seam is smooth: the m-th level after them (level 4 + m) takes m / 4 +
 * m² / 100 hours and costs 100 × m + m³ Gold, a linear start that grows
 * quadratic in time and cubic in Gold (docs/RESEARCH_CURVES.md): 15.6 min
 * and 101 Gold at level 5, about 4.8 days and 894,000 Gold at 100; about
 * 174 days and 22.2 million Gold in all.
 *
 * With `steep`, the Gold gains a quadratic term whose coefficient falls by
 * level, q(m) = Q × B / (m + B), rounded to whole Gold: much dearer early
 * and mid levels, the late ones less so. Gold / Floor, Silver / Floor,
 * Silver Bonus and Gold / Kill take `STEEP_INCOME` (Q 200, B 100: 7,608
 * Gold at level 10, 1.83 million at 100, 57.4 million in all), Key
 * Efficiency `STEEP_KEYS` (Q 400, B 50: 13,673 at 10, 2.16 million at 100,
 * 72.5 million in all). Their time is unchanged. Each also sets its own
 * first four prices, an even ratio from 10 Gold up to its level 5 (A: 25,
 * 55, 130 before 299; B: 25, 70, 185 before 493), so no step stands out. */
const POTION_HP_START: [gold: number, seconds: number][] = [[10, 15], [25, 60], [50, 300], [75, 600]];
type Steep = { q: number; bend: number; start: readonly number[] };
const STEEP_INCOME: Steep = { q: 200, bend: 100, start: [10, 25, 55, 130] };
const STEEP_KEYS: Steep = { q: 400, bend: 50, start: [10, 25, 70, 185] };
const hundredLevels = (target: ResearchTarget, value: number, steep?: Steep) => Array.from({ length: 100 }, (_, i): ResearchLevel => {
  const m = i + 1 - POTION_HP_START.length;
  const quadratic = steep ? Math.round((steep.q * steep.bend * m * m) / (m + steep.bend)) : 0;
  const [gold, seconds] = POTION_HP_START[i] ?? [100 * m + quadratic + m * m * m, 900 * m + 36 * m * m];
  return { gold: steep?.start[i] ?? gold, hours: seconds / 3600, effect: { target, op: "add", value } };
});

/** Faster Trainers (+2% training speed a level), for 100 levels. The n-th
 * level costs 250 × n + 2 × n³ Gold and takes 1.75 × n + n² / 20 hours: a
 * linear start that grows cubic and quadratic (2.03 million Gold and 28
 * days at level 100; about 52.3 million Gold and 2.9 years in all). */
const fasterTrainersLevels = () => Array.from({ length: 100 }, (_, i): ResearchLevel => ({
  gold: 250 * (i + 1) + 2 * intPow(i + 1, 3),
  hours: 1.75 * (i + 1) + ((i + 1) * (i + 1)) / 20,
  effect: { target: "trainingSpeed", op: "add", value: 0.02 },
}));

/** Rush: +1 tile rushed a level, for 25 levels. Each level starts from
 * 250 × n Gold and 1.75 × n hours (Faster Trainers' first levels) and grows steeper: Gold
 * doubles each level and time grows 20% (250 Gold and 1.75 hours at level
 * 1, about 105 billion Gold and 145 days at 25; 201 billion and 697 days in
 * all), since a faster pace of play is worth the most. */
const rushLevels = () => Array.from({ length: 25 }, (_, i): ResearchLevel => ({
  gold: 250 * (i + 1) * intPow(2, i),
  hours: 1.75 * (i + 1) * intPow(1.2, i),
  effect: { target: "rushTiles", op: "add", value: 1 },
}));

/** Max Interest's limits by level, up from 50 Silver a floor. */
const INTEREST_CAPS = [100, 200, 350, 500, 750, 1000, 1500, 2000, 2750, 3750, 5000, 6500, 8250, 10000, 12500, 15000, 20000, 25000, 35000, 50000];
/** Max Interest: Focus Count's schedule (500 × (1 + n(n+1)/2) Gold, 8 × n
 * hours) with its Gold raised 20% compounding a level, to the nearest 100
 * (500 Gold at level 1, about 3 million at 20 and 11.5 million in all). At
 * the full limit each level pays back its Gold in 10 floors at first and in
 * 100 to 370 floors from level 8 on, counting Silver as Gold. */
const maxInterestLevels = () => INTEREST_CAPS.map((value, i): ResearchLevel => ({
  gold: Math.round((500 * (1 + (i * (i + 1)) / 2) * intPow(1.2, i)) / 100) * 100,
  hours: 8 * (i + 1),
  effect: { target: "interestCap", op: "set", value },
}));

/** Buy Quantity: one level for each quantity past x1 (x5, x10, x100,
 * Max), 1,000 to 100,000 Gold and 4 to 48 hours. */
const BUY_QUANTITY_LEVELS: [gold: number, hours: number][] = [[1000, 4], [5000, 12], [25000, 24], [100000, 48]];

/** Refocus, Ignore More and Target More: one floor fewer to regain a use
 * a level, for 90 levels (100 floors down to 10). Focus Count's Gold (500 ×
 * (1 + n(n−1)/2) at level n), plus `cubic` × n³, raised `growth`
 * compounding a level, to the nearest 100 (Refocus: no growth and 8 × n³,
 * 7.8 million at level 90 and 195 million in all; Ignore More: ×1.05 a
 * level, 2.1 billion in all; Target More: ×1.1, 85.4 billion), and n² / 10
 * hours (6 minutes at level 1, 34 days at 90, about 2.8 years in all). */
const regainLevels = (target: ResearchTarget, growth: number, cubic = 0) => Array.from({ length: 90 }, (_, i): ResearchLevel => ({
  gold: Math.round(((500 * (1 + (i * (i + 1)) / 2) + cubic * intPow(i + 1, 3)) * intPow(growth, i)) / 100) * 100,
  hours: ((i + 1) * (i + 1)) / 10,
  effect: { target, op: "add", value: -1 },
}));
/** Ignore Count: +1 Ignore use a level, for nine levels (1 use up to 10).
 * Steeper than Focus Count, less than Target Count: 100,000 Gold at level
 * 1, five times as much each level (39 billion at 9, 48.8 billion in all),
 * and 12 × n hours (540 in all). */
const ignoreCountLevels = () => Array.from({ length: 9 }, (_, i): ResearchLevel => ({
  gold: 100_000 * intPow(5, i),
  hours: 12 * (i + 1),
  effect: { target: "ignorePerRun", op: "add", value: 1 },
}));
/** Target Count: +1 Target use a level, for four levels (1 use up to 5),
 * ten times the Gold and twice the time each level. */
const TARGET_COUNT_LEVELS: [gold: number, hours: number][] = [[10_000_000, 24], [100_000_000, 48], [1_000_000_000, 96], [10_000_000_000, 192]];

/** `n` rounded to three significant figures, so long schedules read neatly. */
function neat(n: number) {
  let unit = 1;
  while (n >= 1000 * unit) unit *= 10;
  return Math.round(n / unit) * unit;
}
/** A long research schedule, per docs/RESEARCH_CURVES.md: the hand-set
 * `first` levels, then C(n) × n^`power` to level `length`, three significant
 * figures. C rises smoothly from the last hand-set level's (first[k−1] / k^power)
 * to `end` at the last level, as C(n) = top − k / (n + `bend`): fastest just
 * after the hand-set levels, a larger `bend` straighter. */
function curve(first: readonly number[], power: number, length: number, end: number, bend: number) {
  const k0 = first.length, c0 = first[k0 - 1]! / intPow(k0, power);
  const k = ((end - c0) * (k0 + bend) * (length + bend)) / (length - k0), top = end + k / (length + bend);
  return Array.from({ length }, (_, i) => first[i] ?? neat((top - k / (i + 1 + bend)) * intPow(i + 1, power)));
}
/** Research Speed's and Research Cost Discount's Gold: the first ten levels
 * by hand (40 to 12,120), then about C × n³, C rising from 12.1 to 20 (20
 * million Gold at level 100). */
const ARCHIVE_GOLD = curve([40, 83, 211, 522, 1120, 2100, 3580, 5670, 8470, 12120], 3, 100, 20, 12);
/** Their minutes: the first ten by hand (1 to 391), then about C × n², C
 * rising from 3.9 to 14.4 (144,000 minutes, 100 days, at level 100, before
 * the Research Speed already done shortens it). */
const ARCHIVE_MINUTES = curve([1, 9, 23, 44, 73, 112, 162, 225, 301, 391], 2, 100, 14.4, 137);
/** Research Speed (+2% research speed a level) and Research Cost Discount
 * (0.3% off every research's Gold a level), for 100 levels each. */
const archiveLevels = (effect: ResearchEffect) =>
  ARCHIVE_GOLD.map((gold, i): ResearchLevel => ({ gold, hours: ARCHIVE_MINUTES[i]! / 60, effect }));

/** The research library, in the order the Archives list it. */
export const RESEARCH = {
  researchSpeed: {
    name: "Research Speed",
    description: "Train the archivists to read faster: every research takes less time, research under way included.",
    categories: ["progression"],
    requires: [{ upgrade: "archives" }],
    levels: archiveLevels({ target: "researchSpeed", op: "add", value: 0.02 }),
  },
  researchCostDiscount: {
    name: "Research Cost Discount",
    description: "Haggle with the booksellers: every research costs less Gold.",
    categories: ["progression"],
    requires: [{ upgrade: "archives" }],
    levels: archiveLevels({ target: "researchCost", op: "add", value: -3 }),
  },
  potionHp: {
    name: "Potion HP",
    description: "Stronger draughts: every potion restores more HP.",
    categories: ["defense"],
    requires: [{ upgrade: "greaterHeal" }],
    levels: hundredLevels("potionHeal", 3),
  },
  regen: {
    name: "Regen",
    description: "Steadier breath: every step regains more HP.",
    categories: ["defense"],
    requires: [{ upgrade: "regenResearch" }],
    levels: hundredLevels("regenPercent", 3),
  },
  attack: {
    name: "ATK",
    description: "Study the old climbers' strokes: the hero starts every run with more ATK.",
    categories: ["offense"],
    requires: [{ upgrade: "archives" }],
    levels: hundredLevels("attackPercent", 2),
  },
  defense: {
    name: "DEF",
    description: "Study the old climbers' guard: the hero starts every run with more DEF.",
    categories: ["defense"],
    requires: [{ upgrade: "archives" }],
    levels: hundredLevels("defensePercent", 3),
  },
  maxHp: {
    name: "Max HP",
    description: "Study the old climbers' endurance: the hero starts every run with more max HP.",
    categories: ["defense"],
    requires: [{ upgrade: "archives" }],
    levels: hundredLevels("maxHpPercent", 3),
  },
  shroud: {
    name: "Shroud",
    description: "Weave the shroud thicker: it blocks more damage at the start of every fight.",
    categories: ["defense"],
    requires: [{ upgrade: "shroud" }],
    levels: hundredLevels("shroudPercent", 4),
  },
  focusCount: {
    name: "Focus Count",
    description: "Study the old climbers' journals to start each run with more Focus.",
    categories: ["abilities"],
    requires: [{ upgrade: "focus" }],
    levels: countLevels("focusPerRun"),
  },
  moveSpeed: {
    name: "Movement Speed",
    description: "Drill the old climbers' quickstep: the run's speed arrows go one step a second faster.",
    categories: ["qualityOfLife"],
    requires: [{ upgrade: "moveSpeed" }],
    levels: countLevels("moveSpeed", 6),
  },
  rush: {
    name: "Rush",
    description: "Learn the old climbers' dash: the hand's first step toward a new target rushes across more empty tiles at once.",
    categories: ["abilities"],
    requires: [{ upgrade: "rush" }],
    levels: rushLevels(),
  },
  undoCount: {
    name: "Undo Count",
    description: "Rehearse old climbs to store more undos.",
    categories: ["abilities"],
    requires: [{ anyUpgrade: ["inspirationUndos", "undos"] }],
    levels: countLevels("undoCapacity", 8),
    levelsPer: { upgrades: ["inspirationUndos", "undos"], levels: 4 },
  },
  fasterTrainers: {
    name: "Faster Trainers",
    description: "Teach the trainers the old masters' drills: every rank a trainer trains takes less time.",
    categories: ["progression"],
    requires: [{ upgrade: "fasterTrainers" }],
    levels: fasterTrainersLevels(),
  },
  buyQuantity: {
    name: "Buy Quantity",
    description: "Drill the trainers in batches: each level opens a larger Buy Quantity for Training (x5, x10, x100, then Max).",
    categories: ["qualityOfLife"],
    requires: [{ upgrade: "buyQuantity" }],
    levels: BUY_QUANTITY_LEVELS.map(([gold, hours]): ResearchLevel => ({ gold, hours, effect: { target: "buyQuantity", op: "add", value: 1 } })),
  },
  pocketMoney: {
    name: "Pocket Money",
    description: "Put a little by between climbs: every run goes inside with more Silver in hand.",
    categories: ["economy"],
    requires: [{ upgrade: "pocketMoney" }],
    levels: hundredLevels("startingSilver", 5),
  },
  floorGold: {
    name: "Gold / Floor",
    description: "Count the coins in the cracks: every new floor of a run pays more Gold.",
    categories: ["economy"],
    requires: [{ upgrade: "spareChange" }],
    levels: hundredLevels("floorGold", 5, STEEP_INCOME),
  },
  floorSilver: {
    name: "Silver / Floor",
    description: "Toss a coin in the well: every new floor of a run pays more Silver.",
    categories: ["economy"],
    requires: [{ upgrade: "wishingWell" }],
    levels: hundredLevels("floorSilver", 5, STEEP_INCOME),
  },
  silverBonus: {
    name: "Silver Bonus",
    description: "Learn the moneychangers' tricks: all Silver found in a run is worth more.",
    categories: ["economy"],
    requires: [{ upgrade: "wealthy" }],
    levels: hundredLevels("silverBonus", 3, STEEP_INCOME),
  },
  killGold: {
    name: "Gold / Kill",
    description: "Search the fallen more thoroughly: every kill pays more Gold.",
    categories: ["economy"],
    requires: [{ upgrade: "loot" }],
    levels: hundredLevels("killGold", 3, STEEP_INCOME),
  },
  heartDoorResilience: {
    name: "Heart Door Resilience",
    description: "Harden your heart: every Heart Door drains 5% less HP a level.",
    categories: ["defense"],
    requires: [{ upgrade: "heartDoorResilience" }],
    levels: countLevels("heartToll", 10, -5),
  },
  floorSkipReward: {
    name: "Floor Skip Reward",
    description: "Glance at what you pass: when Skip climbs past a floor, collect a share of the Gold its chests and battles held.",
    categories: ["economy"],
    requires: [{ upgrade: "floorSkipReward" }],
    levels: countLevels("floorSkipGold", 11, 10),
  },
  findYellowKey: {
    name: "Find Yellow Key",
    description: "Learn where climbers drop things: each new floor climbed has a chance to hand you a yellow key.",
    categories: ["economy"],
    requires: [{ upgrade: "findYellowKey" }],
    levels: hundredLevels("yellowKeyChance", 4).slice(0, 50),
  },
  keyEfficiency: {
    name: "Key Efficiency",
    description: "Work the locks gently: every door takes less of each key.",
    categories: ["economy"],
    requires: [{ upgrade: "keyEfficiency" }],
    levels: hundredLevels("keyCost", -5, STEEP_KEYS),
  },
  interest: {
    name: "Interest %",
    description: "Put your Silver to work: each new floor climbed adds a share of the Silver you hold, after the floor's other Silver, up to Max Interest.",
    categories: ["economy"],
    requires: [{ upgrade: "interest" }],
    levels: hundredLevels("interestRate", 1),
  },
  maxInterest: {
    name: "Max Interest",
    description: "Find richer lenders: Interest pays more Silver a floor at most.",
    categories: ["economy"],
    requires: [{ upgrade: "maxInterest" }],
    levels: maxInterestLevels(),
  },
  mug: {
    name: "Mug",
    description: "Empty their pockets before they fall: a kill your first strike makes pays more Gold.",
    categories: ["economy"],
    requires: [{ upgrade: "mug" }],
    levels: hundredLevels("instakillGold", 2),
  },
  refocus: {
    name: "Refocus",
    description: "Catch your breath between climbs: a run regains a Focus use in fewer new floors.",
    categories: ["abilities"],
    requires: [{ upgrade: "refocus" }],
    levels: regainLevels("refocusFloors", 1, 8),
  },
  ignoreCount: {
    name: "Ignore Count",
    description: "Learn which stones to step around: start each run with more Ignore uses.",
    categories: ["abilities"],
    requires: [{ upgrade: "ignore" }],
    levels: ignoreCountLevels(),
  },
  ignoreMore: {
    name: "Ignore More",
    description: "Keep your eyes moving: a run regains an Ignore use in fewer new floors.",
    categories: ["abilities"],
    requires: [{ upgrade: "ignoreMore" }],
    levels: regainLevels("ignoreFloors", 1.05),
  },
  targetCount: {
    name: "Target Count",
    description: "Map the old climbers' shortcuts: start each run with more Target uses.",
    categories: ["abilities"],
    requires: [{ upgrade: "target" }],
    levels: TARGET_COUNT_LEVELS.map(([gold, hours]): ResearchLevel => ({ gold, hours, effect: { target: "targetPerRun", op: "add", value: 1 } })),
  },
  targetMore: {
    name: "Target More",
    description: "Pick your marks faster: a run regains a Target use in fewer new floors.",
    categories: ["abilities"],
    requires: [{ upgrade: "targetMore" }],
    levels: regainLevels("targetFloors", 1.1),
  },
} satisfies Record<string, ResearchDefinition>;
export type ResearchId = keyof typeof RESEARCH;
export const RESEARCH_IDS = Object.keys(RESEARCH) as ResearchId[];
export const research = (id: ResearchId): ResearchDefinition => RESEARCH[id];

/** Archivist slots: the Archives start with `start`, and each further one,
 * up to `maximum`, is hired for the next price in Gems. */
export const ARCHIVISTS = { start: 1, maximum: 5, prices: [100, 400, 1400, 3000] } as const;
/** How many completions the history keeps, newest last. */
export const HISTORY_LIMIT = 200;

/** A research level being worked on: paid for, started at `startedAt`
 * (moved back by any progress kept from before), done at `completesAt`. */
export type ResearchJob = { research: ResearchId; level: number; startedAt: number; completesAt: number; paid: number };
/** One archivist: its job, if any, and whether it starts the project's next
 * level on its own when this one completes. */
export type ArchivistSlot = { job?: ResearchJob; autoContinue: boolean };
export type ResearchRecord = { at: number; research: ResearchId; level: number };
export type ArchivesSave = {
  /** The hired archivists. */
  slots: ArchivistSlot[];
  /** Each project's completed level. */
  levels: Partial<Record<ResearchId, number>>;
  /** Progress kept from a switched-out job, as the share (0–1) of the
   * project's next level already done. */
  progress: Partial<Record<ResearchId, number>>;
  /** Completed levels, oldest first. */
  history: ResearchRecord[];
};

export function defaultArchives(): ArchivesSave {
  return { slots: Array.from({ length: ARCHIVISTS.start }, () => ({ autoContinue: false })), levels: {}, progress: {}, history: [] };
}

/** What the Archives read from the rest of the profile (a `Save`), and
 * the Gold and Gems they spend. */
export type ArchivesOwner = {
  archives: ArchivesSave;
  gold: number;
  /** Gems, which hire archivists. */
  gems: number;
  upgrades: Record<UpgradeId, number>;
  /** Lifetime XP, for the hero's level. */
  xp: number;
  /** Dev free purchases: research costs no Gold and takes no time, and
   * archivists are hired for nothing. */
  settings: Pick<Settings, "freePurchases">;
};

export const researchLevel = (a: ArchivesSave, id: ResearchId) => a.levels[id] ?? 0;
/** The most levels of `id` open with `upgrades` owned: all of them, or
 * `levelsPer` for each of its upgrades owned. Without `upgrades`, all. */
export function maxLevel(id: ResearchId, upgrades?: Record<UpgradeId, number>) {
  const def = research(id), per = def.levelsPer;
  if (!per || !upgrades) return def.levels.length;
  return Math.min(def.levels.length, per.levels * per.upgrades.filter((u) => upgrades[u] > 0).length);
}
/** The level `id` would research next, or undefined once it is complete
 * (or, given the `upgrades` owned, once every level they open is). */
export const nextLevel = (a: ArchivesSave, id: ResearchId, upgrades?: Record<UpgradeId, number>): ResearchLevel | undefined =>
  researchLevel(a, id) < maxLevel(id, upgrades) ? research(id).levels[researchLevel(a, id)] : undefined;

/** `base` changed by every completed research level aimed at `target`. */
export function researched(a: ArchivesSave, target: ResearchTarget, base: number) {
  let add = 0, multiply = 1, set: number | undefined;
  for (const id of RESEARCH_IDS) {
    for (const { effect } of research(id).levels.slice(0, researchLevel(a, id))) {
      if (effect.target !== target) continue;
      if (effect.op === "add") add += effect.value;
      else if (effect.op === "multiply") multiply *= effect.value;
      else set = effect.value;
    }
  }
  return set ?? (base + add) * multiply;
}
/** The Archives as they would be with `id`'s next level completed, to show
 * what it changes. */
export const withNextLevel = (a: ArchivesSave, id: ResearchId): ArchivesSave =>
  ({ ...a, levels: { ...a.levels, [id]: researchLevel(a, id) + 1 } });

/** How long `level` takes with the research speed the Archives have now,
 * in ms. The definition keeps its own hours. */
export const duration = (a: ArchivesSave, level: ResearchLevel) =>
  Math.round((level.hours * 3_600_000) / (1 + researched(a, "researchSpeed", 0)));

/** The Gold `level` costs with the Research Cost Discount the Archives have
 * now. The definition keeps its own Gold. */
export const price = (a: ArchivesSave, level: ResearchLevel) =>
  Math.round((level.gold * researched(a, "researchCost", 1000)) / 1000);
/** The research speed's factor: a level of `d` hours takes d / factor. */
const speedFactor = (a: ArchivesSave) => 1 + researched(a, "researchSpeed", 0);

const met = (o: ArchivesOwner, r: ResearchRequirement) =>
  "upgrade" in r ? o.upgrades[r.upgrade] > 0
  : "anyUpgrade" in r ? r.anyUpgrade.some((u) => o.upgrades[u] > 0)
  : "research" in r ? researchLevel(o.archives, r.research as ResearchId) >= r.level
  : levelForXp(o.xp) >= r.playerLevel;
/** The requirements `id` still waits on. */
export const missing = (o: ArchivesOwner, id: ResearchId) => research(id).requires.filter((r) => !met(o, r));

/** The slot working on `id`, or -1. */
export const activeSlot = (a: ArchivesSave, id: ResearchId) => a.slots.findIndex((s) => s.job?.research === id);

export type ResearchStatus = "locked" | "available" | "active" | "completed";
export function status(o: ArchivesOwner, id: ResearchId): ResearchStatus {
  if (activeSlot(o.archives, id) >= 0) return "active";
  if (missing(o, id).length) return "locked";
  return nextLevel(o.archives, id, o.upgrades) ? "available" : "completed";
}

/** A job's share done at `now`, 0–1 (a clock set back reads as no progress). */
export const jobProgress = (job: ResearchJob, now: number) =>
  Math.min(1, Math.max(0, (now - job.startedAt) / Math.max(1, job.completesAt - job.startedAt)));

/** Why `id` can't start in `slot` now, or null when it can. */
export function cannotStart(o: ArchivesOwner, slot: number, id: ResearchId): string | null {
  const a = o.archives, level = nextLevel(a, id, o.upgrades);
  if (!a.slots[slot] || a.slots[slot].job) return "That archivist is busy.";
  if (!level) return "Research complete.";
  if (activeSlot(a, id) >= 0) return "Already being researched.";
  if (missing(o, id).length) return "Locked.";
  if (!o.settings.freePurchases && o.gold < price(a, level)) return `Need ${price(a, level)} Gold.`;
  return null;
}

/** Pays for `id`'s next level and sets `slot` to work on it from `now`,
 * picking up any progress kept for it. False when it can't start. */
export function startResearch(o: ArchivesOwner, slot: number, id: ResearchId, now: number) {
  if (cannotStart(o, slot, id)) return false;
  begin(o, slot, id, now);
  return true;
}
function begin(o: ArchivesOwner, slot: number, id: ResearchId, now: number) {
  const a = o.archives, level = nextLevel(a, id)!, free = o.settings.freePurchases;
  const ms = free ? 0 : duration(a, level), paid = free ? 0 : price(a, level);
  const done = a.progress[id] ?? 0;
  delete a.progress[id];
  o.gold -= paid;
  const startedAt = now - Math.round(done * ms);
  a.slots[slot].job = { research: id, level: researchLevel(a, id) + 1, startedAt, completesAt: startedAt + ms, paid };
}

/** Stops `slot`'s job at `now`: its Gold comes back, and the share done is
 * kept for the project, so starting it again (and paying again) resumes
 * from there. */
export function cancelResearch(o: ArchivesOwner, slot: number, now: number) {
  const job = o.archives.slots[slot]?.job;
  if (!job) return false;
  const done = jobProgress(job, now);
  if (done > 0 && done < 1) o.archives.progress[job.research] = done;
  o.gold += job.paid;
  o.archives.slots[slot].job = undefined;
  return true;
}

/** Why busy archivist `slot` can't switch from its job to `id`, or null
 * when it can: as for starting `id`, with the archivist idle and its job's
 * Gold back. An idle archivist answers as `cannotStart`. */
export function cannotSwitch(o: ArchivesOwner, slot: number, id: ResearchId): string | null {
  const job = o.archives.slots[slot]?.job;
  if (!job) return cannotStart(o, slot, id);
  if (job.research === id) return "Already being researched.";
  const slots = o.archives.slots.map((s, i) => (i === slot ? { ...s, job: undefined } : s));
  return cannotStart({ ...o, gold: o.gold + job.paid, archives: { ...o.archives, slots } }, slot, id);
}
/** Switches busy archivist `slot` to `id` at `now`: its job stops (the
 * Gold back, the share done kept, as `cancelResearch`), and `id`'s next
 * level starts. False, changing nothing, when it can't. */
export function switchResearch(o: ArchivesOwner, slot: number, id: ResearchId, now: number) {
  if (!o.archives.slots[slot]?.job || cannotSwitch(o, slot, id)) return false;
  cancelResearch(o, slot, now);
  begin(o, slot, id, now);
  return true;
}

/** Takes `ms` off `slot`'s job: the way to trade something scarce for
 * research time (nothing pays for it yet but Dev mode). */
export function hastenResearch(a: ArchivesSave, slot: number, ms: number) {
  const job = a.slots[slot]?.job;
  if (!job || !(ms > 0)) return false;
  job.startedAt -= ms;
  job.completesAt -= ms;
  return true;
}

/** A research speed change at `at`: every job under way keeps its share
 * done, and its whole time and the time left become `ratio` of what they
 * were. */
function hastenAll(a: ArchivesSave, ratio: number, at: number) {
  for (const { job } of a.slots) {
    if (!job || job.completesAt <= at) continue;
    const whole = job.completesAt - job.startedAt, share = jobProgress(job, at);
    const ms = Math.round(whole * ratio);
    job.startedAt = at - Math.round(share * ms);
    job.completesAt = job.startedAt + ms;
  }
}

/** Completes every job due by `now`, oldest first, recording each. An
 * archivist set to auto-continue starts the project's next level the
 * moment the last completed, paying for it, so research done while the game
 * was closed carries on; without the Gold (or with nothing left to
 * research), it waits idle. Returns what completed. */
export function settleArchives(o: ArchivesOwner, now: number): ResearchRecord[] {
  const a = o.archives, done: ResearchRecord[] = [];
  for (;;) {
    const due = a.slots
      .map((s, i) => ({ i, job: s.job }))
      .filter((s): s is { i: number; job: ResearchJob } => !!s.job && s.job.completesAt <= now)
      .sort((x, y) => x.job.completesAt - y.job.completesAt || x.i - y.i)[0];
    if (!due) break;
    const { i, job } = due;
    a.slots[i].job = undefined;
    const before = speedFactor(a);
    a.levels[job.research] = job.level;
    const after = speedFactor(a);
    if (after !== before) hastenAll(a, before / after, job.completesAt);
    const record = { at: job.completesAt, research: job.research, level: job.level };
    a.history.push(record);
    done.push(record);
    if (a.slots[i].autoContinue && !cannotStart(o, i, job.research)) begin(o, i, job.research, job.completesAt);
  }
  if (a.history.length > HISTORY_LIMIT) a.history.splice(0, a.history.length - HISTORY_LIMIT);
  return done;
}

/** The Gems the next archivist costs, or undefined when all are hired. */
export const nextArchivistPrice = (a: ArchivesSave): number | undefined => ARCHIVISTS.prices[a.slots.length - ARCHIVISTS.start];
/** Hires the next archivist for its Gems. */
export function hireArchivist(o: ArchivesOwner) {
  const price = nextArchivistPrice(o.archives);
  if (price === undefined) return false;
  if (!o.settings.freePurchases) {
    if (o.gems < price) return false;
    o.gems -= price;
  }
  o.archives.slots.push({ autoContinue: false });
  return true;
}

// --- Saves ---
/** A saved time (ms) or Gold amount. */
const finite = (n: unknown): n is number => finiteIn(n, 1e15);
const isResearch = (id: unknown): id is ResearchId => typeof id === "string" && RESEARCH_IDS.includes(id as ResearchId);
/** A level of research `id` that exists: 1 to its last. */
const isLevelOf = (id: ResearchId, n: unknown): n is number => wholeIn(n, 1, research(id).levels.length);

/** The saved Archives, each part kept when it is well formed: completed
 * levels within each project's maximum, a job only for the level after the
 * completed one and no project in two slots, and kept progress under 1. */
export function decodeArchives(raw: any): ArchivesSave {
  const a = defaultArchives();
  if (!isRecord(raw)) return a;
  if (isRecord(raw.levels)) decodeLevels(raw.levels, a);
  if (isRecord(raw.progress)) decodeKeptProgress(raw.progress, a);
  if (validSlotCount(raw.slots)) a.slots = decodeSlots(raw.slots, a);
  if (Array.isArray(raw.history)) a.history = decodeHistory(raw.history);
  return a;
}

/** As many archivists' slots as can be hired. */
const validSlotCount = (slots: unknown): slots is any[] =>
  Array.isArray(slots) && slots.length >= ARCHIVISTS.start && slots.length <= ARCHIVISTS.maximum;

function decodeLevels(levels: Record<string, any>, a: ArchivesSave) {
  for (const id of RESEARCH_IDS) if (isLevelOf(id, levels[id])) a.levels[id] = levels[id];
}

/** The share done of each stopped project, kept while it has a next level. */
function decodeKeptProgress(progress: Record<string, any>, a: ArchivesSave) {
  for (const id of RESEARCH_IDS) {
    const p = progress[id];
    if (isShare(p) && nextLevel(a, id)) a.progress[id] = p;
  }
}

/** A share of a level done: more than none, less than all. */
const isShare = (p: unknown): p is number => finite(p) && p > 0 && p < 1;

/** Each archivist's slot; a job is kept only for its project's next level,
 * and only in the first slot that holds that project. */
function decodeSlots(raw: any[], a: ArchivesSave): ArchivistSlot[] {
  const busy = new Set<ResearchId>();
  return raw.map((s: any): ArchivistSlot => {
    const slot: ArchivistSlot = { autoContinue: s?.autoContinue === true };
    const j = s?.job;
    if (validJob(j, a) && !busy.has(j.research)) {
      busy.add(j.research);
      slot.job = { research: j.research, level: j.level, startedAt: j.startedAt, completesAt: j.completesAt, paid: Math.floor(j.paid) };
    }
    return slot;
  });
}

/** A job researching the level after the one its project completed. */
const isNextJob = (j: any, a: ArchivesSave): j is ResearchJob =>
  isRecord(j) && isResearch(j.research) && j.level === researchLevel(a, j.research) + 1 && !!nextLevel(a, j.research);

/** A job that completes no earlier than it started, and its Gold paid. */
const validJobTimes = (j: any) => finite(j.startedAt) && finite(j.completesAt) && j.completesAt >= j.startedAt && finite(j.paid);
const validJob = (j: any, a: ArchivesSave): j is ResearchJob => isNextJob(j, a) && validJobTimes(j);

function decodeHistory(raw: any[]): ResearchRecord[] {
  return raw
    .filter((r: any) => isRecord(r) && finite(r.at) && isResearch(r.research) && isLevelOf(r.research, r.level))
    .slice(-HISTORY_LIMIT)
    .map((r: any) => ({ at: r.at, research: r.research, level: r.level }));
}
