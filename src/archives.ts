import { FOCUS_PER_RUN, IGNORE_PER_RUN, REGAIN_FLOORS, TARGET_PER_RUN, levelForXp, type UpgradeId } from "./config.ts";
import type { Settings } from "./settings.ts";
import type { Save } from "./entities.ts";
import type { Profile } from "./profile.ts";
import { goalUnlocked, type GoalUnlock } from "./goals.ts";
import { finite as finiteIn, isRecord, wholeIn } from "./decode.ts";
import { intPow } from "./exact.ts";
import { BUY_QUANTITIES, quantityLabel } from "./buy-quantity.ts";
import { tally } from "./profile.ts";
import { carrySpeedUp, completionAt, decodeSpeedUp, endSpeedUp, type SpeedUp } from "./speed-ups.ts";

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
  shrines: "Shrines",
  special: "Special",
} as const;
export type ResearchCategory = keyof typeof RESEARCH_CATEGORIES;

const count = (n: number) => `${n}`;
const percent = (n: number) => `${n}%`;
/** A number kept in tenths of a percent (whole numbers, so sums stay exact) as a percent. */
const tenths = (n: number) => `${n / 10}%`;
/** A speed (0 = as fast as without research) as a percent of the base. */
const speed = (n: number) => `${Math.round(100 + n * 100)}%`;
/** A one-level unlock: open or not. */
const opened = (n: number) => (n ? "Open" : "Locked");
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
  /** The percent of its ATK an ATK shard gives, from 100. */
  shardAttackPercent: { name: "Shard ATK", base: 100, shown: percent },
  /** The percent of its DEF a DEF shard gives, from 100. */
  shardDefensePercent: { name: "Shard DEF", base: 100, shown: percent },
  /** Parry % added to the trained Parry %, in tenths of a percent. */
  parryPercent: { name: "Parry %", base: 0, shown: tenths },
  /** The percent of the Crit % training's chance that the hero has, from 100. */
  critChancePercent: { name: "Critical Chance", base: 100, shown: percent },
  /** The percent of the Crit x training's factor that the hero has, from 100. */
  critFactorPercent: { name: "Critical Factor", base: 100, shown: percent },
  /** The percent a turn the Archer's ready arrow waits unfired adds to its next arrow's ATK, from 0. */
  chargedShotPercent: { name: "Charge / Turn", base: 0, shown: (v: number) => `+${v}%` },
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
  /** Tiles more STAIRS's rush toward the stairs may cross, once End Rush is owned. */
  endRushTiles: { name: "Tiles Rushed to the Stairs", base: 0, shown: count },
  /** Buy quantities opened past x1: x5, x10, x100, then Max. */
  buyQuantity: { name: "Buy Quantity", base: 0, shown: (n: number) => quantityLabel(BUY_QUANTITIES[Math.min(n, BUY_QUANTITIES.length - 1)]!) },
  /** How fast archivists work: a level of `d` hours takes d / (1 + speed). */
  researchSpeed: { name: "Research Speed", base: 0, shown: speed },
  /** The percent of its Gold a research level costs, in tenths of a
   * percent, from 1,000 (the full price). */
  researchCost: { name: "Research Cost", base: 1000, shown: tenths },
  /** Whether Shrines grant boons in the Tower (shrines.ts). */
  shrines: { name: "Shrines", base: 0, shown: opened },
  /** Floors taken off each boon's base floors required. */
  shrineFloors: { name: "Floors Required", base: 0, shown: (n: number) => `${n ? "−" : ""}${-n}` },
  /** The percent standard boons are strengthened by. */
  standardBoonBonus: { name: "Standard Boon Bonus", base: 0, shown: percent },
  /** Whether a standard boon can be chosen to head a run's first offer. */
  firstBoonChoice: { name: "First Boon Choice", base: 0, shown: opened },
  /** The percent trade-off boons' benefits are strengthened by. */
  tradeoffBonus: { name: "Trade-off Boon Bonus", base: 0, shown: percent },
  /** Whether Auto Pick Boons can be turned on. */
  autoPickBoons: { name: "Auto Pick Boons", base: 0, shown: opened },
  /** Boons each offer gives to choose from. */
  boonOptions: { name: "Boon Choices", base: 2, shown: count },
  /** Boons that can be banned. */
  boonBans: { name: "Boons Banned", base: 0, shown: count },
  /** Boons Auto Pick can rank. */
  boonRanks: { name: "Boons Ranked", base: 0, shown: count },
  /** Whether the run's notes can be read (run-notes.ts): tap the floor number. */
  runNotes: { name: "Run Notes", base: 0, shown: opened },
  /** Badges each card can hold. */
  badgeSlots: { name: "Badge Slots", base: 1, shown: count },
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
  | { playerLevel: number }
  | { goalUnlock: GoalUnlock };
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
 * a level), Shard ATK (+2% of what each ATK shard gives, a level), Shard DEF
 * (+3% of what each DEF shard gives, a level), Shroud (+4% a level, to
 * ×5), Gold / Floor (+5% of the Gold a new
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

/** Crit % and Crit x research (+2% of the trained value a level, for 100
 * levels): level n costs 30 + 8 × (n − 1)³ Gold (30, 38, 94 … 10,700 at
 * level 12, 140,000 at 27, 1.6 million at 60, 7.8 million at 100; about 196
 * million in all), on Potion HP's hours. */
const critLevels = (target: ResearchTarget) => Array.from({ length: 100 }, (_, i): ResearchLevel => {
  const m = i + 1 - POTION_HP_START.length, seconds = POTION_HP_START[i]?.[1] ?? 900 * m + 36 * m * m;
  return { gold: 30 + 8 * i * i * i, hours: seconds / 3600, effect: { target, op: "add", value: 2 } };
});

/** Charged Shot research (+1% of ATK a turn waited, a level, for 100
 * levels): Critical Factor's hours, at ten times its Gold: level n costs
 * 300 + 80 × (n − 1)³ (300, 380, 940 … 107,000 at level 12, 1.4 million at
 * 27, 16 million at 60, 78 million at 100; about 1.96 billion in all). */
const chargedShotLevels = () => critLevels("chargedShotPercent").map((level): ResearchLevel => ({
  ...level, gold: 10 * level.gold, effect: { target: "chargedShotPercent", op: "add", value: 1 },
}));

/** Parry % research: +0.2% Parry % a level (2 tenths), for 50 levels.
 * Level n costs 5,000 + 610 × (n⁴ − 1) + 7 × (n⁵ − 1) Gold, three
 * significant figures (5,000 at level 1, 10.1 million at 11, 96.8 million
 * at 19, 997 million at 33, 6 billion at 50; about 59.4 billion in all), and
 * takes n² + 55 × n − 3 minutes (53 at level 1, 111 at 2, 87.5 hours at 50;
 * about 78 days in all). */
const parryLevels = () => Array.from({ length: 50 }, (_, i): ResearchLevel => {
  const n = i + 1;
  return {
    gold: neat(5000 + 610 * (intPow(n, 4) - 1) + 7 * (intPow(n, 5) - 1)),
    hours: (n * n + 55 * n - 3) / 60,
    effect: { target: "parryPercent", op: "add", value: 2 },
  };
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
 * all), since a faster pace of play is worth the most. End Rush follows the
 * same schedule. */
const rushLevels = (target: ResearchTarget) => Array.from({ length: 25 }, (_, i): ResearchLevel => ({
  gold: 250 * (i + 1) * intPow(2, i),
  hours: 1.75 * (i + 1) * intPow(1.2, i),
  effect: { target, op: "add", value: 1 },
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

/** Buy Quantity: one level for each quantity past x1 (x5, x10, x25,
 * x100, Max), 1,000 to 100,000 Gold and 4 to 48 hours. */
const BUY_QUANTITY_LEVELS: [gold: number, hours: number][] = [[1000, 4], [5000, 12], [25000, 24], [50000, 36], [100000, 48]];

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

/** Shrine research. Floors Required: −1 floor a level for 100 levels;
 * level n costs 100,000 + 120,000 × (n − 1) + 10,000 × (n − 1)(n − 2) Gold
 * (100k, 220k, 360k … 109 million at 100, about 3.84 billion in all) and
 * takes 99 + 102 × (n − 1) + 1.5 × (n − 1)(n − 2) minutes (99, 201, 306 …
 * 24,750 at 100, about 694 days in all). */
const shrineFloorLevels = () => Array.from({ length: 100 }, (_, i): ResearchLevel => ({
  gold: 100_000 + 120_000 * i + 10_000 * i * (i - 1),
  hours: (99 + 102 * i + (3 * i * (i - 1)) / 2) / 60,
  effect: { target: "shrineFloors", op: "add", value: -1 },
}));
/** Standard Boon Bonus: +1% a level for 25 levels. Its Gold climbs
 * steeply, then eases (about 1 billion at level 9, 10 billion at 14, 100
 * billion at 21; 1.08 trillion in all); its minutes are 99, 334, 579, 864,
 * then each step 40 longer than the last (16,089 at 25, 109 days in all). */
const STANDARD_BOON_GOLD = [
  100e3, 314e3, 987e3, 3.1e6, 9.75e6, 30.6e6, 96.2e6, 302e6, 950e6, 1.52e9, 2.44e9, 3.9e9, 6.25e9,
  10e9, 13.8e9, 19e9, 26.2e9, 36.2e9, 49.9e9, 68.9e9, 95e9, 122e9, 157e9, 202e9, 260e9,
];
/** `first` minutes, then each step `more` longer than the step before. */
function steps(first: readonly number[], length: number, more: number) {
  const out = [...first];
  while (out.length < length) out.push(2 * out.at(-1)! - out.at(-2)! + more);
  return out;
}
const STANDARD_BOON_MINUTES = steps([99, 334, 579, 864], 25, 40);
/** Improve Trade-off Boons: +1% a level for 10 levels, 600 million to 4.9
 * billion Gold, 1,499 minutes then 840 more a level. */
const TRADEOFF_GOLD = [600e6, 700e6, 800e6, 900e6, 1e9, 1.25e9, 1.6e9, 2.2e9, 3.2e9, 4.9e9];
/** Ban Boons: one ban more a level, for eight levels. */
const BAN_LEVELS: [gold: number, minutes: number][] = [
  [10e6, 3333], [100e6, 6666], [1e9, 13333], [10e9, 29999], [100e9, 59999], [1e12, 119999], [100e12, 239999], [1e15, 479999],
];
/** Auto Pick Ranking: one boon ranked more a level, for 32 levels. Its
 * Gold steepens fast, then eases (about 1 billion at level 11, 10 billion
 * at 18, 100 billion at 30; 837 billion in all); its minutes are 2,866,
 * then each step 22 longer than the last, from 335 (23,481 at 32, 255 days
 * in all). */
const RANKING_GOLD = [
  100e3, 180e3, 875e3, 4.46e6, 15.7e6, 31.1e6, 61.7e6, 123e6, 243e6, 483e6, 960e6, 1.35e9, 1.9e9, 2.68e9, 3.77e9, 5.3e9,
  7.46e9, 10.5e9, 12.7e9, 15.4e9, 18.7e9, 22.6e9, 27.4e9, 33.2e9, 40.2e9, 48.7e9, 59e9, 71.5e9, 86.7e9, 105e9, 121e9, 140e9,
];
const RANKING_MINUTES = steps([2866, 3201], 32, 22);
/** One level adding `value` to `target`, for `gold` and `minutes`. */
const levelOf = (target: ResearchTarget, value: number, gold: number, minutes: number): ResearchLevel =>
  ({ gold, hours: minutes / 60, effect: { target, op: "add", value } });
const SHRINES = { research: "unlockShrines", level: 1 } as const;

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
    requires: [{ upgrade: "archives" }, { goalUnlock: "researchSpeed" }],
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
  critChance: {
    name: "Critical Chance",
    description: "Study the weak points the old climbers found: every strike is more likely to be a critical hit.",
    categories: ["offense"],
    requires: [{ upgrade: "critical" }],
    levels: critLevels("critChancePercent"),
  },
  critFactor: {
    name: "Critical Factor",
    description: "Study how the old climbers struck true: a critical hit multiplies your ATK by more.",
    categories: ["offense"],
    requires: [{ upgrade: "critical" }],
    levels: critLevels("critFactorPercent"),
  },
  chargedShot: {
    name: "Charged Shot",
    description: "Learn to hold a drawn bow: each turn the Archer's ready arrow waits unfired raises the next arrow's ATK.",
    categories: ["offense"],
    requires: [{ upgrade: "archives" }, { goalUnlock: "chargedShot" }],
    levels: chargedShotLevels(),
  },
  shardAttack: {
    name: "Shard ATK",
    description: "Learn to draw more from every ATK shard: each one a run picks up raises ATK by more.",
    categories: ["offense"],
    requires: [{ upgrade: "archives" }, { goalUnlock: "shardAttack" }],
    levels: hundredLevels("shardAttackPercent", 2),
  },
  defense: {
    name: "DEF",
    description: "Study the old climbers' guard: the hero starts every run with more DEF.",
    categories: ["defense"],
    requires: [{ upgrade: "archives" }],
    levels: hundredLevels("defensePercent", 3),
  },
  shardDefense: {
    name: "Shard DEF",
    description: "Learn to draw more from every DEF shard: each one a run picks up raises DEF by more.",
    categories: ["defense"],
    requires: [{ upgrade: "archives" }, { goalUnlock: "shardDefense" }],
    levels: hundredLevels("shardDefensePercent", 3),
  },
  parry: {
    name: "Parry %",
    description: "Study the old climbers' footwork: a parried strike's ATK is cut by more.",
    categories: ["defense"],
    requires: [{ upgrade: "evade" }, { goalUnlock: "parryPercent" }],
    levels: parryLevels(),
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
    levels: rushLevels("rushTiles"),
  },
  endRush: {
    name: "End Rush",
    description: "Learn the last dash of the climb: STAIRS's rush toward the stairs crosses more empty tiles at once.",
    categories: ["abilities"],
    requires: [{ upgrade: "endRush" }],
    levels: rushLevels("endRushTiles"),
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
    description: "Drill the trainers in batches: each level opens a larger Buy Quantity for Training (x5, x10, x25, x100, then Max), and training many ranks at once speeds the trainers up: ×2 at 5 ranks, ×3 at 10, ×5 at 25 and ×10 at 100.",
    categories: ["qualityOfLife"],
    requires: [{ upgrade: "buyQuantity" }],
    levels: BUY_QUANTITY_LEVELS.map(([gold, hours]): ResearchLevel => ({ gold, hours, effect: { target: "buyQuantity", op: "add", value: 1 } })),
  },
  noteTaking: {
    name: "Note Taking",
    description: "Keep a ledger of the climb: tap the floor number during a run to read its notes (time, steps, kills, keys, doors, chests and loot), and copy them.",
    categories: ["qualityOfLife"],
    requires: [{ upgrade: "archives" }, { goalUnlock: "noteTaking" }],
    // 100,000 Gold and 2 days.
    levels: [levelOf("runNotes", 1, 100_000, 2 * 24 * 60)],
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
  unlockShrines: {
    name: "Unlock Shrines",
    description: "Find the old climbers' shrines: every so many floors climbed in the Tower grants a boon for the rest of the run.",
    categories: ["shrines"],
    requires: [{ upgrade: "archives" }, { goalUnlock: "shrines" }],
    levels: [levelOf("shrines", 1, 1.5e6, 4999)],
  },
  shrineFloors: {
    name: "Floors Required",
    description: "Learn the shrines' paths: each boon takes one floor fewer to reach, before any Boon Floor Requirement boon.",
    categories: ["shrines"],
    requires: [SHRINES],
    levels: shrineFloorLevels(),
  },
  standardBoonBonus: {
    name: "Standard Boon Bonus",
    description: "Pray more deeply: every standard boon is stronger.",
    categories: ["shrines"],
    requires: [SHRINES],
    levels: STANDARD_BOON_GOLD.map((gold, i) => levelOf("standardBoonBonus", 1, gold, STANDARD_BOON_MINUTES[i]!)),
  },
  firstBoonChoice: {
    name: "First Boon Choice",
    description: "Choose your first prayer: a standard boon picked on the forest's Shrine Boons page heads every run's first offer.",
    categories: ["shrines"],
    requires: [SHRINES, { goalUnlock: "firstBoonChoice" }],
    levels: [levelOf("firstBoonChoice", 1, 1e9, 6667)],
  },
  improveTradeoffs: {
    name: "Improve Trade-off Boons",
    description: "Strike better bargains: the benefit of every trade-off boon is greater, its cost unchanged.",
    categories: ["shrines"],
    requires: [SHRINES, { goalUnlock: "improveTradeoffs" }],
    levels: TRADEOFF_GOLD.map((gold, i) => levelOf("tradeoffBonus", 1, gold, 1499 + 840 * i)),
  },
  autoPickBoons: {
    name: "Auto Pick Boons",
    description: "Let the shrines choose: a run can take the top boon offered by itself, turned on from the Shrine button.",
    categories: ["shrines"],
    requires: [SHRINES, { goalUnlock: "autoPickBoons" }],
    levels: [levelOf("autoPickBoons", 1, 100e6, 7166)],
  },
  boonOptions: {
    name: "Boon Option Quantity",
    description: "Hear more voices: each boon offered gives one more to choose from.",
    categories: ["shrines"],
    requires: [SHRINES, { goalUnlock: "boonOptions" }],
    levels: [levelOf("boonOptions", 1, 200e6, 7167), levelOf("boonOptions", 1, 2e9, 14667)],
  },
  banBoons: {
    name: "Ban Boons",
    description: "Turn from a shrine: one boon more can be banned from ever being offered, on the forest's Shrine Boons page.",
    categories: ["shrines"],
    requires: [SHRINES, { goalUnlock: "banBoons" }],
    levels: BAN_LEVELS.map(([gold, minutes]) => levelOf("boonBans", 1, gold, minutes)),
  },
  autoPickRanking: {
    name: "Auto Pick Ranking",
    description: "Order your prayers: Auto Pick takes the boons you rank first, one boon more ranked a level, on the forest's Shrine Boons page.",
    categories: ["shrines"],
    requires: [{ research: "autoPickBoons", level: 1 }, { goalUnlock: "autoPickRanking" }],
    levels: RANKING_GOLD.map((gold, i) => levelOf("boonRanks", 1, gold, RANKING_MINUTES[i]!)),
  },
  badgeSlots: {
    name: "Badge Slots",
    description: "Each card holds one more badge a level, arranged on the Deck page. A card's badges must not conflict: a key colour's < and ≥ gates (YK < and YK ≥), or Effective and Dampen, can't share one.",
    categories: ["abilities"],
    requires: [{ upgrade: "archives" }, { upgrade: "cardBadges" }, { goalUnlock: "badgeSlots" }],
    // 1 billion Gold and 4 days, then 100 billion and 20 days.
    levels: [levelOf("badgeSlots", 1, 1e9, 4 * 24 * 60), levelOf("badgeSlots", 1, 100e9, 20 * 24 * 60)],
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
/** One archivist: its job, if any, whether it starts the project's next
 * level on its own when this one completes, and its Speed Up, if one is
 * in progress (speed-ups.ts). */
export type ArchivistSlot = { job?: ResearchJob; autoContinue: boolean; speedUp?: SpeedUp };
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
  /** Cells, which buy Speed Ups. */
  cells: number;
  /** The lifetime tallies, which count research completed and the Gold
   * paid for it. */
  profile?: Profile;
  upgrades: Record<UpgradeId, number>;
  /** Goals claimed, for the unlocks they hold. */
  goals: Save["goals"];
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
  : "goalUnlock" in r ? goalUnlocked(o, r.goalUnlock)
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
  tally(o, "researchGold", paid);
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
  tally(o, "researchGold", -job.paid);
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

/** Completes every job due by `now`, oldest first, recording each, and
 * ends (or, queued, buys again) each Speed Up that ran out, all in the
 * order they happened, each Speed Up's boost carried into its job's times
 * as it goes. An archivist set to auto-continue starts the project's next
 * level the moment the last completed, paying for it, so research done
 * while the game was closed carries on; without the Gold (or with nothing
 * left to research), it waits idle. Returns what completed. */
export function settleArchives(o: ArchivesOwner, now: number): ResearchRecord[] {
  const a = o.archives, done: ResearchRecord[] = [];
  for (let event = nextEvent(a, now); event; event = nextEvent(a, now)) {
    const { i, at } = event;
    for (const s of a.slots) carrySpeedUp(s, at);
    if (!event.completes) {
      endSpeedUp(o, a.slots[i], at);
      continue;
    }
    const job = a.slots[i].job!;
    a.slots[i].job = undefined;
    const before = speedFactor(a);
    a.levels[job.research] = job.level;
    const after = speedFactor(a);
    if (after !== before) hastenAll(a, before / after, at);
    const record = { at, research: job.research, level: job.level };
    a.history.push(record);
    tally(o, "researchLevels", 1);
    done.push(record);
    if (a.slots[i].autoContinue && !cannotStart(o, i, job.research)) begin(o, i, job.research, at);
  }
  for (const s of a.slots) carrySpeedUp(s, now);
  if (a.history.length > HISTORY_LIMIT) a.history.splice(0, a.history.length - HISTORY_LIMIT);
  return done;
}

/** The earliest thing due by `now`: a job completing (`completes`) or a
 * busy archivist's Speed Up ending, in archivist `i`; a completion goes first at a tie,
 * then the lower archivist. */
function nextEvent(a: ArchivesSave, now: number) {
  let next: { i: number; at: number; completes: boolean } | undefined;
  const consider = (i: number, at: number, completes: boolean) => {
    if (at > now) return;
    if (!next || at < next.at || (at === next.at && completes && !next.completes)) next = { i, at, completes };
  };
  a.slots.forEach((s, i) => {
    if (s.job) consider(i, completionAt(s), true);
    // An idle archivist's Speed Up is paused: it can't end.
    if (s.job && s.speedUp) consider(i, s.speedUp.endsAt, false);
  });
  return next;
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
    const speedUp = decodeSpeedUp(s?.speedUp);
    if (speedUp) slot.speedUp = speedUp;
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
